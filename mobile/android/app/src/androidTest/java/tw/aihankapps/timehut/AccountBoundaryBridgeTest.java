package tw.aihankapps.timehut;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.provider.MediaStore;
import android.database.Cursor;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.Assert.*;

/** Actual JS bridge races with synthetic media and owner identities only. */
@RunWith(AndroidJUnit4.class)
public class AccountBoundaryBridgeTest {
    private Instrumentation instrumentation;
    private Context context;
    private WebView view;
    private String start(String method,JSONObject args)throws Exception{
        if(java.util.Arrays.asList("list","thumbnail","prepareUpload","enqueueUpload","enqueueDownload","cancel","retry","saveToPhotos").contains(method)&&!args.has("expectedGeneration")){JSONObject actor=AccountClient.bridgeStatus();args.put("expectedGeneration",actor.getString("generation")).put("expectedOwner",actor.opt("owner"));}
        String key="call_"+UUID.randomUUID().toString().replace("-","");
        instrumentation.runOnMainSync(()->view.evaluateJavascript("window.accountBoundaryCalls=window.accountBoundaryCalls||{};(async()=>{try{const r=await Capacitor.registerPlugin('TimehutTransfer')."+method+"("+args+");window.accountBoundaryCalls['"+key+"']={result:r||{}};}catch(e){window.accountBoundaryCalls['"+key+"']={error:String(e)};}})()",null));return key;
    }
    private JSONObject await(String key)throws Exception{
        long deadline=System.currentTimeMillis()+15000;
        while(System.currentTimeMillis()<deadline){CountDownLatch latch=new CountDownLatch(1);String[] value={null};instrumentation.runOnMainSync(()->view.evaluateJavascript("JSON.stringify(window.accountBoundaryCalls&&window.accountBoundaryCalls['"+key+"']||null)",r->{value[0]=r;latch.countDown();}));assertTrue(latch.await(2,TimeUnit.SECONDS));
            if(value[0]!=null&&!value[0].equals("null")){Object decoded=new JSONTokener(value[0]).nextValue();if(decoded instanceof String&&!decoded.equals("null"))return new JSONObject((String)decoded);}Thread.sleep(50);
        }throw new AssertionError("Bridge response timeout: "+key);
    }
    private JSONObject call(String method,JSONObject args)throws Exception{JSONObject response=await(start(method,args));assertFalse(response.toString(),response.has("error"));return response.getJSONObject("result");}
    private void login(AccountOwnerTransferTest.Fixture backend)throws Exception{
        backend.renewToken();
        // This fixture accepts only its latest token. Confirm retired tokens
        // through the real HTTP client at that exact issuer, before/after login.
        AccountClient.drainRevocation(backend.endpoint());
        assertEquals(backend.owner,call("setAccountSession",new JSONObject().put("backend",backend.endpoint()).put("token",backend.token).put("owner",backend.owner)).getJSONObject("user").getString("id"));
        AccountClient.drainRevocation(backend.endpoint());
    }
    private int mediaRows(String name)throws Exception{int count=0;try(Cursor rows=context.getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,new String[]{MediaStore.MediaColumns._ID},MediaStore.MediaColumns.DISPLAY_NAME+"=?",new String[]{name},null)){if(rows!=null)count=rows.getCount();}return count;}
    private byte[] read(File file)throws Exception{try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toByteArray();}}
    @Test public void asynchronousMediaPublicationCannotOutliveAccountAuthority()throws Exception{
        assertTrue("Modern WebView runtime scope",android.os.Build.VERSION.SDK_INT>=36);
        instrumentation=InstrumentationRegistry.getInstrumentation();context=instrumentation.getTargetContext();TransferEngine.initialize(context);
        context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        long deadline=System.currentTimeMillis()+40000;boolean[] loaded={false},navigated={false};
        while(System.currentTimeMillis()<deadline&&!loaded[0]){instrumentation.runOnMainSync(()->{for(android.app.Activity a:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(a instanceof MainActivity){view=((MainActivity)a).getBridge().getWebView();if(!navigated[0]){view.loadUrl("https://localhost/account.html");navigated[0]=true;}view.evaluateJavascript("location.pathname==='/account.html'&&document.readyState==='complete'&&!!window.Capacitor?.isPluginAvailable?.('TimehutTransfer')",v->loaded[0]="true".equals(v));}});Thread.sleep(100);}assertTrue("Actual packaged native bridge ready",loaded[0]);
        Bitmap image=Bitmap.createBitmap(128,128,Bitmap.Config.ARGB_8888);image.eraseColor(0xff5484ad);ByteArrayOutputStream output=new ByteArrayOutputStream();image.compress(Bitmap.CompressFormat.PNG,100,output);image.recycle();byte[] original=output.toByteArray();JSONArray cases=new JSONArray();
        try(AccountOwnerTransferTest.Fixture a=new AccountOwnerTransferTest.Fixture(UUID.randomUUID().toString(),"synthetic_race_a_"+UUID.randomUUID().toString().replace("-",""));AccountOwnerTransferTest.Fixture b=new AccountOwnerTransferTest.Fixture(UUID.randomUUID().toString(),"synthetic_race_b_"+UUID.randomUUID().toString().replace("-",""))){
            String[][] scenarios={{"saveToPhotos","save-queued","switch"},{"saveToPhotos","save-copy","logout"},{"saveToPhotos","save-ready","return"},{"thumbnail","thumbnail-start","logout"},{"thumbnail","thumbnail-ready","switch"},{"thumbnail","thumbnail-ready","return"}};
            for(String[] scenario:scenarios){login(a);JSONObject task=TransferEngine.newRecord("download","synthetic-race-"+UUID.randomUUID()+".png","photo");String id=task.getString("id");File file=TransferEngine.file(id+"-"+task.getString("filename"));try(FileOutputStream f=new FileOutputStream(file)){f.write(original);}task.put("mimeType","image/png").put("stage","file_ready").put("destinationReference",file.getAbsolutePath()).put("tags","synthetic-account-race-only");TransferEngine.put(task);
                CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
                TransferPlugin.testObserver=(point,taskId)->{if(id.equals(taskId)&&scenario[1].equals(point)){entered.countDown();if(!release.await(15,TimeUnit.SECONDS))throw new IOException("Synthetic barrier timeout");}};
                String pending=start(scenario[0],new JSONObject().put("id",id));
                try{assertTrue("Operation reached actual native boundary "+scenario[1],entered.await(8,TimeUnit.SECONDS));
                    if(scenario[2].equals("logout"))call("clearAccountSession",new JSONObject());else login(b);
                    if(scenario[2].equals("return"))login(a);
                    assertEquals("Account switch/logout acknowledged before work resumes",scenario[2].equals("logout")?null:scenario[2].equals("return")?a.owner:b.owner,TransferEngine.accounts().currentOwner());
                }finally{release.countDown();}
                JSONObject response=await(pending);if(scenario[0].equals("thumbnail")){assertFalse(response.toString(),response.optJSONObject("result")!=null&&response.getJSONObject("result").optBoolean("available"));assertFalse(response.toString(),response.toString().contains("data:image"));}else{assertTrue(response.toString(),response.has("error"));assertEquals("Only new pending save removed",0,mediaRows(task.getString("filename")));}
                assertArrayEquals("Private original preserved",original,read(file));assertEquals("file_ready",TransferEngine.get(id).getString("stage"));assertFalse(TransferEngine.get(id).has("savedAssetId"));
                cases.put(new JSONObject().put("operation",scenario[0]).put("boundary",scenario[1]).put("change",scenario[2]).put("pass",true));TransferPlugin.testObserver=null;
            }
            login(a);JSONObject positive=TransferEngine.newRecord("download","synthetic-positive-"+UUID.randomUUID()+".png","photo");String id=positive.getString("id");File file=TransferEngine.file(id+"-"+positive.getString("filename"));try(FileOutputStream f=new FileOutputStream(file)){f.write(original);}positive.put("mimeType","image/png").put("stage","file_ready").put("destinationReference",file.getAbsolutePath()).put("tags","synthetic-account-race-only");TransferEngine.put(positive);assertTrue(call("thumbnail",new JSONObject().put("id",id)).getBoolean("available"));JSONObject saved=call("saveToPhotos",new JSONObject().put("id",id));assertEquals(1,mediaRows(positive.getString("filename")));assertTrue(saved.has("savedAssetId"));
            JSONObject report=new JSONObject().put("status","PASS_ACTUAL_JS_ACCOUNT_MEDIA_BOUNDARIES").put("cases",cases).put("positiveSameSessionSaveAndPreview",true).put("providerRequests",0).put("physicalPhone",false).put("sdk",android.os.Build.VERSION.SDK_INT);
            try(FileOutputStream f=new FileOutputStream(new File(context.getFilesDir(),"boundary-qa-report.json"))){f.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}
        }finally{TransferPlugin.testObserver=null;}
    }
}
