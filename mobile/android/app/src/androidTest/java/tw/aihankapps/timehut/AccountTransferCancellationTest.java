package tw.aihankapps.timehut;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
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
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

/** Real bridge and OS jobs; only this fixture's synthetic local records are changed. */
@RunWith(AndroidJUnit4.class)
public class AccountTransferCancellationTest {
    private Instrumentation instrumentation;
    private Context context;
    private WebView view;
    private final List<String> createdTasks=new ArrayList<>();
    private static final String TAG="synthetic-account-lifecycle-only";

    private void initialize(boolean activity)throws Exception {
        instrumentation=InstrumentationRegistry.getInstrumentation();context=instrumentation.getTargetContext();
        assertTrue(BuildConfig.DEBUG&&java.util.Arrays.asList("tw.aihankapps.timehut.accountqa","tw.aihankapps.timehut.accountqa67").contains(context.getPackageName()));
        assertTrue(android.os.Build.VERSION.SDK_INT>=36);TransferEngine.initialize(context);
        if(!activity)return;
        context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        boolean[] ready={false},navigated={false};long deadline=System.currentTimeMillis()+25000;
        while(!ready[0]&&System.currentTimeMillis()<deadline){
            instrumentation.runOnMainSync(()->{
                for(android.app.Activity a:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(a instanceof MainActivity){
                    view=((MainActivity)a).getBridge().getWebView();
                    if(!navigated[0]){view.loadUrl("https://localhost/account.html");navigated[0]=true;}
                    view.evaluateJavascript("location.pathname==='/account.html'&&document.readyState==='complete'&&!!window.Capacitor?.isPluginAvailable?.('TimehutTransfer')",s->ready[0]="true".equals(s));
                }
            });Thread.sleep(80);
        }assertTrue("Packaged bridge ready",ready[0]);
    }
    private JSONObject bridge(String method,String id)throws Exception {return bridge(method,new JSONObject().put("id",id));}
    private JSONObject bridge(String method,JSONObject args)throws Exception {
        if(java.util.Arrays.asList("list","thumbnail","prepareUpload","enqueueUpload","enqueueDownload","cancel","retry","saveToPhotos").contains(method)&&!args.has("expectedGeneration")){JSONObject actor=AccountClient.bridgeStatus();args.put("expectedGeneration",actor.getString("generation")).put("expectedOwner",actor.opt("owner"));}
        String key=UUID.randomUUID().toString();
        instrumentation.runOnMainSync(()->view.evaluateJavascript("window.cancelQA=window.cancelQA||{};(async()=>{try{const r=await Capacitor.registerPlugin('TimehutTransfer')."+method+"("+args+");window.cancelQA['"+key+"']={ok:true,result:r||{}};}catch(e){window.cancelQA['"+key+"']={ok:false,error:String(e)};}})()",null));
        long deadline=System.currentTimeMillis()+10000;
        while(System.currentTimeMillis()<deadline){
            CountDownLatch latch=new CountDownLatch(1);String[] encoded={null};
            instrumentation.runOnMainSync(()->view.evaluateJavascript("JSON.stringify(window.cancelQA['"+key+"']||null)",s->{encoded[0]=s;latch.countDown();}));
            assertTrue(latch.await(2,TimeUnit.SECONDS));Object value=encoded[0]==null?null:new JSONTokener(encoded[0]).nextValue();
            if(value instanceof String&&!value.equals("null"))return new JSONObject((String)value);Thread.sleep(40);
        }throw new AssertionError("Cancellation bridge timed out");
    }
    private static String hash(File file)throws Exception {
        MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1)digest.update(b,0,n);}
        StringBuilder out=new StringBuilder();for(byte b:digest.digest())out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();
    }
    private void awaitStage(String id,String stage)throws Exception {
        long deadline=System.currentTimeMillis()+15000;
        while(System.currentTimeMillis()<deadline&&!stage.equals(TransferEngine.get(id).optString("stage")))Thread.sleep(50);
        assertEquals(TransferEngine.get(id).toString(),stage,TransferEngine.get(id).optString("stage"));
    }
    private void awaitProgress(String id)throws Exception {
        long deadline=System.currentTimeMillis()+15000;
        while(System.currentTimeMillis()<deadline&&TransferEngine.get(id).optLong("bytesTransferred")==0)Thread.sleep(40);
        assertTrue("Bytes really started",TransferEngine.get(id).optLong("bytesTransferred")>0);
        assertEquals("transferring",TransferEngine.get(id).optString("stage"));
    }
    private String task(Fixture f,boolean upload)throws Exception {
        JSONObject row=TransferEngine.newRecord(upload?"upload":"download","synthetic-cancel.png","photo");String id=row.getString("id");
        row.put("tags",TAG).put("mimeType","image/png").put("stage","queued").put("endpoint",f.endpoint()+(upload?"":"/slow.png"));
        if(upload){File original=TransferEngine.file(id+"-source");try(OutputStream out=new FileOutputStream(original)){out.write(f.media);}row.put("sourceReference",original.getAbsolutePath()).put("byteSize",f.media.length).put("albumId",UUID.randomUUID().toString());}
        TransferEngine.put(row);createdTasks.add(id);return id;
    }
    private String startDownload(Fixture f)throws Exception {
        JSONObject result=bridge("enqueueDownload",new JSONObject().put("url",f.endpoint()+"/slow.png").put("filename","synthetic-cancel.png").put("mediaType","photo"));
        assertTrue(result.toString(),result.getBoolean("ok"));String id=result.getJSONObject("result").getString("id");createdTasks.add(id);TransferEngine.change(id,"tags",TAG);return id;
    }
    private void login(Fixture f)throws Exception {
        synchronized(TransferEngine.accountBoundary()){
            TransferEngine.accounts().activateVerified(f.owner,f.token,System.currentTimeMillis()+3600000,false,f.endpoint());TransferEngine.accountChanged();
        }
    }
    private static final class Fixture implements AutoCloseable {
        final String owner=UUID.randomUUID().toString(),token="synthetic_cancel_"+UUID.randomUUID().toString().replace("-","");
        final ServerSocket listener=new ServerSocket(0,12,InetAddress.getByName("127.0.0.1"));
        final ExecutorService pool=Executors.newCachedThreadPool();
        final AtomicInteger posts=new AtomicInteger(),creations=new AtomicInteger();
        final CountDownLatch accepted=new CountDownLatch(1),release=new CountDownLatch(1);
        final Map<String,String> receipts=new ConcurrentHashMap<>();
        final byte[] media;
        final String mode;volatile boolean slow=true,closed;
        Fixture(String value)throws Exception {
            mode=value;media=new byte[(mode.equals("download")?1:8)*1024*1024];byte[] png=android.util.Base64.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lfoAAAAASUVORK5CYII=",0);System.arraycopy(png,0,media,0,png.length);
            pool.submit(()->{while(!closed)try{Socket socket=listener.accept();pool.submit(()->serve(socket));}catch(IOException e){if(!closed)throw new RuntimeException(e);}});
        }
        String endpoint(){return "http://127.0.0.1:"+listener.getLocalPort();}
        private void json(OutputStream out,String body)throws Exception {reply(out,"application/json",body.getBytes(StandardCharsets.UTF_8));}
        private void reply(OutputStream out,String type,byte[] bytes)throws Exception {out.write(("HTTP/1.1 200 Synthetic\r\nContent-Type: "+type+"\r\nContent-Length: "+bytes.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(bytes);out.flush();}
        private void serve(Socket socket){try(Socket own=socket){
            own.setSoTimeout(15000);InputStream in=own.getInputStream();OutputStream out=own.getOutputStream();ByteArrayOutputStream header=new ByteArrayOutputStream();int c;
            while((c=in.read())!=-1){header.write(c);if(header.size()>16384)throw new IOException("Header bound");byte[] b=header.toByteArray();int n=b.length;if(n>=4&&b[n-4]==13&&b[n-3]==10&&b[n-2]==13&&b[n-1]==10)break;}
            String text=header.toString("US-ASCII");String path=text.split(" ")[1];Map<String,String> fields=new HashMap<>();for(String line:text.split("\r\n")){int split=line.indexOf(':');if(split>0)fields.put(line.substring(0,split).toLowerCase(Locale.ROOT),line.substring(split+1).trim());}
            if(!("Bearer "+token).equals(fields.get("authorization")))throw new IOException("Synthetic owner mismatch");
            if(path.equals("/api/accounts/logout")){json(out,"{\"ok\":true}");return;}
            if(path.startsWith("/api/uploads/admission/")){String receipt=receipts.get(path.substring(path.lastIndexOf('/')+1));json(out,receipt==null?"{\"admissionStatus\":\"not_found\"}":"{\"localId\":\""+receipt+"\",\"status\":\"completed\"}");return;}
            if(path.equals("/api/uploads/retry")){json(out,"{\"ok\":true}");return;}
            if(path.startsWith("/api/uploads/status/")){if(mode.equals("processing")){accepted.countDown();assertTrue(release.await(15,TimeUnit.SECONDS));}json(out,"{\"status\":\"completed\",\"flickrPhotoId\":\"900000000091\"}");return;}
            if(path.equals("/api/upload")){
                posts.incrementAndGet();int remaining=Integer.parseInt(fields.get("content-length"));assertTrue(remaining>media.length&&remaining<media.length+16384);byte[] buffer=new byte[32768];
                while(remaining>0){int n=in.read(buffer,0,Math.min(buffer.length,remaining));if(n<0)return;remaining-=n;if(mode.equals("stream")&&slow)Thread.sleep(30);}
                String id=fields.get("x-timehut-upload");assertNotNull(id);String receipt="synthetic-cancel-"+id;if(receipts.putIfAbsent(id,receipt)==null)creations.incrementAndGet();
                if(mode.equals("ack")){accepted.countDown();assertTrue(release.await(15,TimeUnit.SECONDS));}
                json(out,"{\"results\":[{\"success\":true,\"localId\":\""+receipt+"\"}]}");return;
            }
            if(path.equals("/slow.png")){
                out.write(("HTTP/1.1 200 Synthetic\r\nContent-Type: image/png\r\nContent-Length: "+media.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                for(int offset=0;offset<media.length;offset+=32768){out.write(media,offset,Math.min(32768,media.length-offset));out.flush();if(slow)Thread.sleep(20);}return;
            }throw new IOException("Unexpected fixture route");
        }catch(Exception ignored){/* Cancellation deliberately closes owned sockets. */}}
        public void close()throws Exception {closed=true;release.countDown();listener.close();pool.shutdownNow();pool.awaitTermination(2,TimeUnit.SECONDS);}
    }
    @Test public void startedCancellationAndKnownReceiptsUseActualOSJobs()throws Exception {
        initialize(true);JSONArray cases=new JSONArray();JSONArray preserved=new JSONArray();
        try {
            for(String mode:new String[]{"stream","ack","processing"})try(Fixture f=new Fixture(mode)){
                login(f);String id=task(f,true);File original=new File(TransferEngine.get(id).getString("sourceReference"));String digest=hash(original);
                JSONObject started=bridge("enqueueUpload",new JSONObject().put("id",id).put("endpoint",f.endpoint()).put("albumId",TransferEngine.get(id).getString("albumId")).put("tags",TAG));
                assertTrue(started.toString(),started.getBoolean("ok"));assertTrue("Real OS job scheduled",bridgeStart(id));
                if(mode.equals("stream"))awaitProgress(id);else assertTrue("Server boundary entered",f.accepted.await(15,TimeUnit.SECONDS));
                if(mode.equals("processing")){
                    assertEquals("server_processing",TransferEngine.get(id).getString("stage"));assertFalse(bridge("cancel",id).getBoolean("ok"));f.release.countDown();awaitStage(id,"completed");
                    assertFalse(bridge("cancel",id).getBoolean("ok"));
                }else{
                    assertTrue(bridge("cancel",id).getBoolean("ok"));awaitStage(id,"cancelled");assertEquals(digest,hash(original));f.slow=false;f.release.countDown();Thread.sleep(200);
                    assertEquals("cancelled",TransferEngine.get(id).getString("stage"));assertTrue(bridge("retry",id).getBoolean("ok"));awaitStage(id,"completed");
                }
                assertEquals(1,f.creations.get());if(mode.equals("ack")||mode.equals("processing"))assertEquals(1,f.posts.get());assertEquals(digest,hash(original));
                preserved.put(new JSONObject().put("id",id).put("source",original.getAbsolutePath()).put("sha256",digest).put("stage","completed").put("receipt",TransferEngine.get(id).getString("serverReceiptId")));
                cases.put(new JSONObject().put("mode",mode).put("osJob",true).put("bridge",true).put("posts",f.posts.get()).put("creations",f.creations.get()).put("sourcePreserved",true));
                try(OutputStream out=new FileOutputStream(new File(context.getFilesDir(),"cancellation-qa-partial.json"))){out.write(new JSONObject().put("status","PARTIAL_NOT_FULL_PASS").put("cases",cases).put("preserved",preserved).toString(2).getBytes(StandardCharsets.UTF_8));}
            }
            try(Fixture f=new Fixture("download")){
                login(f);String id=startDownload(f);awaitProgress(id);assertTrue(bridge("cancel",id).getBoolean("ok"));awaitStage(id,"cancelled");
                assertFalse(TransferEngine.get(id).has("destinationReference"));assertTrue(TransferEngine.file(id+".part").length()>0);f.slow=false;assertTrue(bridge("retry",id).getBoolean("ok"));awaitStage(id,"file_ready");
                File target=new File(TransferEngine.get(id).getString("destinationReference"));assertEquals(f.media.length,target.length());assertArrayEquals(MessageDigest.getInstance("SHA-256").digest(f.media),MessageDigest.getInstance("SHA-256").digest(java.nio.file.Files.readAllBytes(target.toPath())));
                preserved.put(new JSONObject().put("id",id).put("source",target.getAbsolutePath()).put("sha256",hash(target)).put("stage","file_ready"));
                f.slow=true;String parked=startDownload(f);awaitProgress(parked);assertTrue(bridge("cancel",parked).getBoolean("ok"));awaitStage(parked,"cancelled");Thread.sleep(200);File part=TransferEngine.file(parked+".part");
                assertTrue(part.length()>0);assertFalse(TransferEngine.get(parked).has("destinationReference"));preserved.put(new JSONObject().put("id",parked).put("source",part.getAbsolutePath()).put("sha256",hash(part)).put("stage","cancelled"));
                cases.put(new JSONObject().put("mode","download").put("cancelStarted",true).put("retryExactBytes",true).put("partialPreservedUntilRetry",true));
            }
            JSONObject report=new JSONObject().put("status","PASS_NATIVE_STARTED_CANCEL_OS_JOBS").put("cases",cases).put("preserved",preserved).put("providerRequests",0).put("physicalPhone",false).put("formalCredit",0).put("processReopenVerified",false);
            try(OutputStream out=new FileOutputStream(new File(context.getFilesDir(),"cancellation-qa-report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}
        }finally{
            for(String id:createdTasks){
                context.getSystemService(android.app.job.JobScheduler.class).cancel(TransferEngine.jobId(id));
                TransferEngine.pause(id);TransferEngine.systemStopped(id);
            }
        }
    }
    // No forced JobScheduler dispatch: enqueue from the actual bridge starts it.
    private boolean bridgeStart(String id){return context.getSystemService(android.app.job.JobScheduler.class).getPendingJob(TransferEngine.jobId(id))!=null;}
    @Test public void cancelledAndCompletedRecordsSurviveProcessReopen()throws Exception {
        initialize(false);File reportFile=new File(context.getFilesDir(),"cancellation-qa-report.json");JSONObject report=new JSONObject(new String(java.nio.file.Files.readAllBytes(reportFile.toPath()),StandardCharsets.UTF_8));
        assertEquals("PASS_NATIVE_STARTED_CANCEL_OS_JOBS",report.getString("status"));JSONArray preserved=report.getJSONArray("preserved");assertEquals(5,preserved.length());
        for(int i=0;i<preserved.length();i++){JSONObject expected=preserved.getJSONObject(i),row=TransferEngine.get(expected.getString("id"));assertEquals(TAG,row.getString("tags"));assertEquals(expected.getString("stage"),row.getString("stage"));assertEquals(expected.getString("sha256"),hash(new File(expected.getString("source"))));if(expected.has("receipt"))assertEquals(expected.getString("receipt"),row.getString("serverReceiptId"));}
        report.put("processReopenVerified",true);try(OutputStream out=new FileOutputStream(reportFile)){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}
    }
    @Test public void lateSystemStopPreservesTerminalForeignOwner()throws Exception {
        initialize(false);
        try(Fixture a=new Fixture("late-stop");Fixture b=new Fixture("late-stop")){
            login(a);JSONArray ids=new JSONArray();
            for(String stage:new String[]{"completed","cancelled","photo_deleted","file_ready","saving","saved"}){
                JSONObject row=TransferEngine.newRecord(stage.equals("completed")?"upload":"download","synthetic-late-stop.png","photo");
                row.put("tags",TAG).put("stage",stage).put("serverReceiptId","synthetic-late-stop-receipt");TransferEngine.put(row);
                ids.put(new JSONObject().put("id",row.getString("id")).put("stage",stage));
            }
            login(b);
            for(int i=0;i<ids.length();i++){
                JSONObject row=ids.getJSONObject(i);assertFalse("Late stop must not requeue terminal work",TransferEngine.systemStopped(row.getString("id")));
                assertEquals("Late stop must preserve terminal stage for previous owner",row.getString("stage"),TransferEngine.get(row.getString("id")).getString("stage"));
                assertEquals("synthetic-late-stop-receipt",TransferEngine.get(row.getString("id")).getString("serverReceiptId"));
            }
        }
    }
}
