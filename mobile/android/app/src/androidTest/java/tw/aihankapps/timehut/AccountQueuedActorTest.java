package tw.aihankapps.timehut;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import org.json.*;
import org.junit.Test;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Real WebView bridge and native HTTP/Keystore; isolated artificial accounts only. */
public class AccountQueuedActorTest {
    private Instrumentation instrumentation;
    private WebView view;
    private CountDownLatch entered,release;
    private String phase="not-started";
    private int controls;

    private JSONObject state()throws Exception{return TransferEngine.accounts().bridgeStatus();}
    private JSONObject scope()throws Exception{
        JSONObject value=state();return new JSONObject().put("expectedOwner",value.opt("owner")).put("expectedGeneration",value.optString("generation","pre-fix-ignored-generation"));
    }
    private String start(String expression)throws Exception{
        String id=UUID.randomUUID().toString();instrumentation.runOnMainSync(()->view.evaluateJavascript("window.actorCalls=window.actorCalls||{};(async()=>{try{window.actorCalls['"+id+"']={result:await ("+expression+")};}catch(e){window.actorCalls['"+id+"']={error:String(e)};}})()",null));return id;
    }
    private JSONObject await(String id)throws Exception{
        long deadline=System.currentTimeMillis()+12000;
        while(System.currentTimeMillis()<deadline){CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();instrumentation.runOnMainSync(()->view.evaluateJavascript("JSON.stringify(window.actorCalls?.['"+id+"']||null)",raw->{value.set(raw);latch.countDown();}));assertTrue(latch.await(2,TimeUnit.SECONDS));
            Object outer=new JSONTokener(value.get()).nextValue();if(outer instanceof String&&!outer.equals("null"))return new JSONObject((String)outer);Thread.sleep(40);
        }throw new AssertionError("Owned bridge result unconfirmed; do not restart or reset");
    }
    private String rawStart(String method,JSONObject args)throws Exception{return start("Capacitor.registerPlugin('TimehutTransfer')."+method+"("+args+")");}
    private String hold(String method,JSONObject args)throws Exception{
        entered=new CountDownLatch(1);release=new CountDownLatch(1);
        TransferPlugin.testObserver=(operation,id)->{if(operation.equals(method)){entered.countDown();assertTrue(release.await(10,TimeUnit.SECONDS));}};
        String id=rawStart(method,args);assertTrue("Native dispatch did not reach its DEBUG latch",entered.await(5,TimeUnit.SECONDS));return id;
    }
    private void finishHold(){release.countDown();TransferPlugin.testObserver=null;}
    private void loaded(Context context)throws Exception{
        context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));long deadline=System.currentTimeMillis()+35000;boolean[] ready={false},opened={false};
        while(System.currentTimeMillis()<deadline&&!ready[0]){instrumentation.runOnMainSync(()->{for(android.app.Activity activity:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(activity instanceof MainActivity){view=((MainActivity)activity).getBridge().getWebView();if(!opened[0]){view.loadUrl("https://localhost/account.html");opened[0]=true;}view.evaluateJavascript("document.readyState==='complete'&&!!window.Capacitor?.isPluginAvailable?.('TimehutTransfer')",result->ready[0]="true".equals(result));}});Thread.sleep(80);}assertTrue(ready[0]);
    }
    private static int albums(AccountClientBridgeTest.Fixture fixture,String user){JSONArray rows=fixture.albums.get(user);return rows==null?0:rows.length();}
    @Test public void queuedActorCannotMutateOrCloseNewPrincipal()throws Exception{
        assertTrue(BuildConfig.DEBUG);assertTrue(android.os.Build.VERSION.SDK_INT>=36);instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();TransferEngine.initialize(context);
        assertNull("Unknown active account preserved",TransferEngine.accounts().currentOwner());assertEquals("Unknown pending receipts preserved",0,TransferEngine.accounts().pendingRevocations().length());
        JSONObject report=new JSONObject().put("status","UNCONFIRMED").put("dataReset",false).put("providerRequests",0).put("actualForms",false).put("physicalPhone",false);
        String previous=AccountClient.testBackend;
        try(AccountClientBridgeTest.Fixture fixture=new AccountClientBridgeTest.Fixture()){
            fixture.realAlbums=true;AccountClient.testBackend=fixture.endpoint();loaded(context);
            try{
                AccountClient.signIn(fixture.endpoint(),"synthetic-alpha","artificial-native-secret","人工甲",true);
                fixture.users.put("synthetic-bravo",new JSONObject().put("id",UUID.randomUUID().toString()).put("username","synthetic-bravo").put("displayName","人工乙"));
                phase="queued-A-create-before-B";
                String id=hold("accountRequest",scope().put("method","POST").put("path","/api/accounts/albums").put("body",new JSONObject().put("title","old A must not reach B").put("birthDate","2020-01-01")));
                AccountClient.signIn(fixture.endpoint(),"synthetic-bravo","artificial-native-secret","",false);String ownerB=TransferEngine.accounts().currentOwner();int before=fixture.albumRequests.get();finishHold();JSONObject result=await(id);
                report.put("firstQueuedRequestRejected",result.has("error")).put("BAlbumsAfterQueuedA",albums(fixture,"synthetic-bravo")).put("oldQueuedRequestAlbumHTTPDelta",fixture.albumRequests.get()-before);
                assertTrue("Queued A request reached the new principal",result.has("error"));assertEquals(before,fixture.albumRequests.get());assertEquals(0,albums(fixture,"synthetic-bravo"));assertEquals(ownerB,TransferEngine.accounts().currentOwner());controls++;
                phase="same-owner-new-token";AccountClient.signIn(fixture.endpoint(),"synthetic-alpha","artificial-native-secret","",false);
                id=hold("accountRequest",scope().put("method","POST").put("path","/api/accounts/albums").put("body",new JSONObject().put("title","old generation").put("birthDate","2020-01-01")));
                AccountClient.signIn(fixture.endpoint(),"synthetic-alpha","artificial-native-secret","",false);before=fixture.albumRequests.get();finishHold();assertTrue(await(id).has("error"));assertEquals(before,fixture.albumRequests.get());assertEquals(0,albums(fixture,"synthetic-alpha"));controls++;
                phase="queued-logout-before-switch";id=hold("accountSignOut",scope());AccountClient.signIn(fixture.endpoint(),"synthetic-bravo","artificial-native-secret","",false);ownerB=TransferEngine.accounts().currentOwner();before=fixture.albumRequests.get();finishHold();assertTrue(await(id).has("error"));assertEquals(before,fixture.albumRequests.get());assertEquals(ownerB,TransferEngine.accounts().currentOwner());controls++;
                phase="missing-or-wrong-dispatch-authority";before=fixture.albumRequests.get();
                assertTrue(await(rawStart("accountRequest",new JSONObject().put("path","/api/accounts/albums"))).has("error"));
                assertTrue(await(rawStart("accountRequest",scope().put("expectedOwner",UUID.randomUUID().toString()).put("path","/api/accounts/albums"))).has("error"));
                assertTrue(await(rawStart("accountSignOut",scope().put("expectedGeneration","stale-process:0"))).has("error"));assertEquals(before,fixture.albumRequests.get());assertEquals(ownerB,TransferEngine.accounts().currentOwner());controls+=3;
                phase="positive-current-actor";JSONObject positive=await(rawStart("accountRequest",scope().put("method","POST").put("path","/api/accounts/albums").put("body",new JSONObject().put("title","positive owned").put("birthDate","2020-01-01"))));assertFalse(positive.toString(),positive.has("error"));JSONObject data=positive.getJSONObject("result");assertEquals(ownerB,data.getJSONObject("_nativeAccountAuthority").getString("owner"));assertEquals(state().getString("generation"),data.getJSONObject("_nativeAccountAuthority").getString("generation"));assertFalse(data.toString().contains(fixture.lastToken));assertEquals(1,albums(fixture,"synthetic-bravo"));controls++;
                phase="queued-transfer-before-switch";int taskCount=TransferEngine.list().length();JSONObject oldScope=scope();
                id=hold("enqueueDownload",scope().put("url",fixture.endpoint()+"/api/photo/1/image?size=o").put("filename","private-B-must-not-enter-A.jpg").put("mediaType","photo"));
                AccountClient.signIn(fixture.endpoint(),"synthetic-alpha","artificial-native-secret","",false);String ownerA=TransferEngine.accounts().currentOwner();finishHold();assertTrue(await(id).has("error"));assertEquals(taskCount,TransferEngine.list().length());assertEquals(ownerA,TransferEngine.accounts().currentOwner());controls++;
                for(String method:new String[]{"list","thumbnail","prepareUpload","enqueueUpload","enqueueDownload","cancel","retry","saveToPhotos"}){
                    assertTrue(method,await(rawStart(method,new JSONObject(oldScope.toString()).put("id",UUID.randomUUID().toString()))).has("error"));
                    assertTrue(method+" missing scope",await(rawStart(method,new JSONObject().put("id",UUID.randomUUID().toString()))).has("error"));
                }assertEquals(taskCount,TransferEngine.list().length());controls++;
                phase="same-owner-transfer-generation";oldScope=scope();AccountClient.signIn(fixture.endpoint(),"synthetic-alpha","artificial-native-secret","",false);assertTrue(await(rawStart("list",oldScope)).has("error"));assertFalse(await(rawStart("list",scope())).has("error"));controls++;
                phase="actual-WebView-account-adapter";JSONObject ui=await(start("TimehutAccounts.signIn({username:'synthetic-alpha',password:'artificial-native-secret'})"));assertFalse(ui.toString(),ui.has("error"));assertEquals(fixture.users.get("synthetic-alpha").getString("id"),ui.getJSONObject("result").getJSONObject("user").getString("id"));
                assertFalse(await(start("TimehutAccounts.transfer('list')")).has("error"));
                phase="positive-current-transfer";ui=await(start("TimehutAccounts.transfer('enqueueDownload',{url:"+JSONObject.quote(fixture.endpoint()+"/api/photo/1/image?size=o")+",filename:'synthetic-current-scope.jpg',mediaType:'photo'})"));assertFalse(ui.toString(),ui.has("error"));String created=ui.getJSONObject("result").getString("id");TransferEngine.change(created,"tags","synthetic-account-race-only");assertEquals(ownerA,TransferEngine.get(created).getString("ownerUserId"));assertEquals("synthetic-current-scope.jpg",TransferEngine.get(created).getString("filename"));
                assertFalse(await(rawStart("cancel",scope().put("id",created))).has("error"));assertEquals("cancelled",TransferEngine.get(created).getString("stage"));assertEquals(taskCount+1,TransferEngine.list().length());controls++;
                ui=await(start("TimehutAccounts.request('/api/accounts/albums',{method:'POST',body:{title:'actual WebView scoped album',birthDate:'2020-01-01'}})"));assertFalse(ui.toString(),ui.has("error"));assertEquals(1,albums(fixture,"synthetic-alpha"));
                ui=await(start("TimehutAccounts.signOut()"));assertFalse(ui.toString(),ui.has("error"));assertTrue(ui.getJSONObject("result").getBoolean("serverConfirmed"));assertNull(TransferEngine.accounts().currentOwner());controls++;
                report.put("status","PASS_ANDROID_NATIVE_QUEUED_ACTOR_SCOPE").put("actualWebViewAdapterAPI",true).put("transferDispatchControls",4).put("scopedTransferMethods",8).put("unknownLoginResultOrFullLoginAdmissionVerified",false);
            }finally{
                if(release!=null)release.countDown();TransferPlugin.testObserver=null;
                if(TransferEngine.accounts().currentOwner()!=null){String issuer=TransferEngine.accounts().issuerOrigin();assertEquals("Only this fixture may be closed",fixture.endpoint(),issuer);AccountClient.signOut();}
                for(int i=0;i<8&&TransferEngine.accounts().pendingRevocations().length()>0;i++)AccountClient.drainRevocation(fixture.endpoint());
                report.put("preservedBaselinePending",0).put("finalPending",TransferEngine.accounts().pendingRevocations().length()).put("controls",controls).put("lastPhase",phase);
                File file=new File(context.getFilesDir(),"queued-actor-report.json");try(FileOutputStream output=new FileOutputStream(file)){output.write(report.toString(2).getBytes(StandardCharsets.UTF_8));output.getFD().sync();}
                Bundle result=new Bundle();result.putString("timehutReport",report.toString());instrumentation.sendStatus(0,result);
            }
        }finally{AccountClient.testBackend=previous;TransferPlugin.testObserver=null;if(release!=null)release.countDown();}
    }
}
