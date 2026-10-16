package tw.aihankapps.timehut;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

/** Controlled native HTTP jobs plus actual account-switch bridge, not physical OS proof. */
@RunWith(AndroidJUnit4.class)
public class AccountTransferLifecycleTest {
    private Instrumentation instrumentation;private Context context;private WebView view;
    private JSONObject call(String method,JSONObject args)throws Exception{
        String key="life_"+UUID.randomUUID().toString().replace("-","");
        instrumentation.runOnMainSync(()->view.evaluateJavascript("window.accountLifecycleCalls=window.accountLifecycleCalls||{};(async()=>{try{const r=await Capacitor.registerPlugin('TimehutTransfer')."+method+"("+args+");window.accountLifecycleCalls['"+key+"']={result:r||{}};}catch(e){window.accountLifecycleCalls['"+key+"']={error:String(e)};}})()",null));
        long deadline=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<deadline){CountDownLatch latch=new CountDownLatch(1);String[] value={null};instrumentation.runOnMainSync(()->view.evaluateJavascript("JSON.stringify(window.accountLifecycleCalls&&window.accountLifecycleCalls['"+key+"']||null)",r->{value[0]=r;latch.countDown();}));assertTrue(latch.await(2,TimeUnit.SECONDS));if(value[0]!=null&&!value[0].equals("null")){Object decoded=new JSONTokener(value[0]).nextValue();if(decoded instanceof String&&!decoded.equals("null")){JSONObject response=new JSONObject((String)decoded);assertFalse(response.toString(),response.has("error"));return response.getJSONObject("result");}}Thread.sleep(50);}throw new AssertionError("Lifecycle bridge timeout");
    }
    static final class Fixture implements AutoCloseable {
        final String a=UUID.randomUUID().toString(),b=UUID.randomUUID().toString();volatile String ta="synthetic_life_a_"+UUID.randomUUID().toString().replace("-",""),tb="synthetic_life_b_"+UUID.randomUUID().toString().replace("-","");
        final ServerSocket socket=new ServerSocket(0,16,InetAddress.getByName("127.0.0.1"));final ExecutorService pool=Executors.newCachedThreadPool();final AtomicInteger creations=new AtomicInteger(),statusCalls=new AtomicInteger();final CountDownLatch statusEntered=new CountDownLatch(1),releaseStatus=new CountDownLatch(1);volatile boolean revokeA=false,holdStatus=true,closed=false;final byte[] image=new byte[4*1024*1024];
        Fixture()throws Exception{new Random(43).nextBytes(image);pool.submit(()->{while(!closed)try{Socket client=socket.accept();pool.submit(()->serve(client));}catch(IOException e){if(!closed)throw new RuntimeException(e);}});}
        String endpoint(){return "http://127.0.0.1:"+socket.getLocalPort();}
        void serve(Socket client){try(Socket owned=client){InputStream in=owned.getInputStream();OutputStream out=owned.getOutputStream();ByteArrayOutputStream raw=new ByteArrayOutputStream();int tail=0,next;while((next=in.read())!=-1){raw.write(next);tail=(tail<<8)|next;if(tail==0x0d0a0d0a)break;if(raw.size()>16384)throw new IOException("Header bound");}String text=raw.toString("UTF-8"),path=text.split("\r\n")[0].split(" ")[1];Map<String,String> headers=new HashMap<>();for(String line:text.split("\r\n")){int colon=line.indexOf(':');if(colon>0)headers.put(line.substring(0,colon).toLowerCase(Locale.ROOT),line.substring(colon+1).trim());}String auth=headers.get("authorization");boolean isA=("Bearer "+ta).equals(auth),isB=("Bearer "+tb).equals(auth);if(!(isB||isA&&!revokeA)){reply(out,401,"{}");return;}
            if(path.equals("/api/accounts/me")){reply(out,200,new JSONObject().put("user",new JSONObject().put("id",isA?a:b).put("username","synthetic").put("displayName","人工帳戶")).put("expiresAt",System.currentTimeMillis()+3600000).put("legacyOwner",false).toString());return;}
            if(path.startsWith("/api/uploads/admission/")){reply(out,200,creations.get()>0?"{\"admissionStatus\":\"accepted\",\"localId\":\"synthetic-lifecycle-receipt\",\"status\":\"pending\"}":"{\"admissionStatus\":\"not_found\"}");return;}
            if(path.equals("/api/upload")){int remaining=Integer.parseInt(headers.getOrDefault("content-length","0"));byte[] buf=new byte[8192];while(remaining>0){int n=in.read(buf,0,Math.min(buf.length,remaining));if(n<0)return;remaining-=n;}creations.incrementAndGet();reply(out,200,"{\"results\":[{\"success\":true,\"localId\":\"synthetic-lifecycle-receipt\"}]}");return;}
            if(path.equals("/api/uploads/status/synthetic-lifecycle-receipt")){statusCalls.incrementAndGet();statusEntered.countDown();if(holdStatus)releaseStatus.await(15,TimeUnit.SECONDS);reply(out,revokeA&&isA?401:200,revokeA&&isA?"{}":"{\"status\":\"completed\",\"flickrPhotoId\":\"900000000073\"}");return;}
            if(path.equals("/slow.png")){out.write(("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: "+image.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));for(int p=0;p<image.length;p+=32768){out.write(image,p,Math.min(32768,image.length-p));out.flush();Thread.sleep(75);}return;}
            reply(out,404,"{}");
        }catch(Exception ignored){/* Account change intentionally disconnects synthetic streams. */}}
        static void reply(OutputStream out,int status,String json)throws Exception{byte[] b=json.getBytes(StandardCharsets.UTF_8);out.write(("HTTP/1.1 "+status+" Synthetic\r\nContent-Type: application/json\r\nContent-Length: "+b.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(b);out.flush();}
        public void close()throws Exception{closed=true;releaseStatus.countDown();socket.close();pool.shutdownNow();pool.awaitTermination(2,TimeUnit.SECONDS);}
    }
    private void login(Fixture f,boolean a)throws Exception{if(a)f.ta="synthetic_life_a_"+UUID.randomUUID().toString().replace("-","");else f.tb="synthetic_life_b_"+UUID.randomUUID().toString().replace("-","");assertEquals(a?f.a:f.b,call("setAccountSession",new JSONObject().put("backend",f.endpoint()).put("token",a?f.ta:f.tb)).getJSONObject("user").getString("id"));}
    private byte[] read(File file)throws Exception{try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toByteArray();}}
    @Test public void switchAndRevocationPreserveOwnerReceiptsWithoutReupload()throws Exception{
        assertTrue(android.os.Build.VERSION.SDK_INT>=36);instrumentation=InstrumentationRegistry.getInstrumentation();context=instrumentation.getTargetContext();TransferEngine.initialize(context);context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));long deadline=System.currentTimeMillis()+40000;boolean[] loaded={false},navigated={false};while(System.currentTimeMillis()<deadline&&!loaded[0]){instrumentation.runOnMainSync(()->{for(android.app.Activity a:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(a instanceof MainActivity){view=((MainActivity)a).getBridge().getWebView();if(!navigated[0]){view.loadUrl("https://localhost/account.html");navigated[0]=true;}view.evaluateJavascript("location.pathname==='/account.html'&&document.readyState==='complete'&&!!window.Capacitor?.isPluginAvailable?.('TimehutTransfer')",v->loaded[0]="true".equals(v));}});Thread.sleep(100);}assertTrue(loaded[0]);
        ExecutorService workers=Executors.newFixedThreadPool(2);
        try(Fixture f=new Fixture()){
            login(f,true);JSONObject up=TransferEngine.newRecord("upload","synthetic-life.png","photo");String uid=up.getString("id");File original=TransferEngine.file(uid+"-source");byte[] source="synthetic-original-retained".getBytes(StandardCharsets.UTF_8);try(FileOutputStream out=new FileOutputStream(original)){out.write(source);}up.put("sourceReference",original.getAbsolutePath()).put("mimeType","image/png").put("byteSize",source.length).put("stage","queued").put("endpoint",f.endpoint()).put("albumId",UUID.randomUUID().toString()).put("tags","synthetic-account-lifecycle-only");TransferEngine.put(up);
            JSONObject down=TransferEngine.newRecord("download","synthetic-life.jpg","photo");String did=down.getString("id");down.put("endpoint",f.endpoint()+"/slow.png").put("stage","queued").put("tags","synthetic-account-lifecycle-only");TransferEngine.put(down);
            Future<Boolean> upload=workers.submit(()->TransferEngine.run(uid,TransferEngine.route(context.getSystemService(ConnectivityManager.class).getActiveNetwork()))),download=workers.submit(()->TransferEngine.run(did,TransferEngine.route(context.getSystemService(ConnectivityManager.class).getActiveNetwork())));
            assertTrue(f.statusEntered.await(10,TimeUnit.SECONDS));deadline=System.currentTimeMillis()+10000;while(System.currentTimeMillis()<deadline&&TransferEngine.get(did).optLong("bytesTransferred")==0)Thread.sleep(50);assertTrue(TransferEngine.get(did).optLong("bytesTransferred")>0);assertEquals("synthetic-lifecycle-receipt",TransferEngine.get(uid).getString("serverReceiptId"));
            login(f,false);f.releaseStatus.countDown();upload.get(8,TimeUnit.SECONDS);download.get(8,TimeUnit.SECONDS);assertEquals(0,call("list",new JSONObject()).getJSONArray("tasks").length());assertEquals("waiting_account",TransferEngine.get(uid).getString("stage"));assertEquals("waiting_account",TransferEngine.get(did).getString("stage"));assertArrayEquals(source,read(original));assertEquals(1,f.creations.get());assertFalse(TransferEngine.get(did).has("destinationReference"));
            login(f,true);f.holdStatus=false;TransferEngine.resume(uid);TransferEngine.change(uid,"stage","queued");assertFalse(TransferEngine.run(uid,TransferEngine.route(context.getSystemService(ConnectivityManager.class).getActiveNetwork())));assertEquals("completed",TransferEngine.get(uid).getString("stage"));assertEquals(1,f.creations.get());
            // A new owned download receives a real HTTP401; only the matching token is invalidated.
            JSONObject revoked=TransferEngine.newRecord("download","synthetic-revoked.png","photo");String rid=revoked.getString("id");revoked.put("endpoint",f.endpoint()+"/slow.png").put("stage","queued").put("tags","synthetic-account-lifecycle-only");TransferEngine.put(revoked);f.revokeA=true;assertFalse(TransferEngine.run(rid,TransferEngine.route(context.getSystemService(ConnectivityManager.class).getActiveNetwork())));assertNull(TransferEngine.accounts().currentOwner());assertEquals("waiting_account",TransferEngine.get(rid).getString("stage"));assertEquals("completed",TransferEngine.get(uid).getString("stage"));assertEquals("synthetic-lifecycle-receipt",TransferEngine.get(uid).getString("serverReceiptId"));assertArrayEquals(source,read(original));assertEquals(1,f.creations.get());
            login(f,false);assertFalse(TransferEngine.accounts().invalidate(f.a,f.ta));assertEquals(f.b,TransferEngine.accounts().currentOwner());f.revokeA=false;login(f,true);assertEquals("completed",TransferEngine.ownedTask(uid).getString("stage"));
            JSONObject report=new JSONObject().put("status","PASS_ACTUAL_BRIDGE_OWNER_SWITCH_AND_HTTP401").put("switchWhileUploadReceiptAndDownloadActive",true).put("originalAndReceiptPreserved",true).put("returnToOriginalOwnerChecksReceiptWithoutReupload",true).put("uploadCreations",f.creations.get()).put("http401WaitsForOriginalAccount",true).put("stale401CannotInvalidateNewOwner",true).put("providerRequests",0).put("physicalPhone",false).put("sdk",android.os.Build.VERSION.SDK_INT).put("osBackgroundProof",false);
            try(FileOutputStream out=new FileOutputStream(new File(context.getFilesDir(),"lifecycle-qa-report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}
        }finally{workers.shutdownNow();workers.awaitTermination(3,TimeUnit.SECONDS);}
    }
}
