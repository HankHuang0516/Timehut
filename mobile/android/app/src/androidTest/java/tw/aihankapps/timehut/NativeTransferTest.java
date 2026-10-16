package tw.aihankapps.timehut;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.Assert.*;

/** Actual UIDT scheduling and background file transfer against a bounded fake backend. */
@RunWith(AndroidJUnit4.class)
public class NativeTransferTest {
    private boolean ownerAuthenticated=false;
    private final String syntheticOwner=UUID.randomUUID().toString(),syntheticBearer="synthetic_background_"+UUID.randomUUID().toString().replace("-","");
    private final String syntheticAlbum=UUID.randomUUID().toString();
    private final JSONObject bridgeTimings=new JSONObject();
    private final AtomicLong uploadReadCalls=new AtomicLong(),uploadReceived=new AtomicLong(),downloadSendCalls=new AtomicLong(),downloadWritten=new AtomicLong();
    private final AtomicLong uploadFixtureStarted=new AtomicLong(),downloadFixtureStarted=new AtomicLong();
    // 32 KiB per 125 ms, identical intended rate on arbitrary TCP read boundaries.
    // Sleeping per read incorrectly slows a short read as if it were a full chunk.
    private static final class FixturePacer {
        private final long started=android.os.SystemClock.elapsedRealtime();private long bytes;
        void received(int count)throws InterruptedException{bytes+=count;long target=started+(bytes*125+32767)/32768,remaining=target-android.os.SystemClock.elapsedRealtime();if(remaining>0)Thread.sleep(remaining);}
    }
    private JSONObject fixtureRate()throws Exception{return new JSONObject().put("bytesPer125ms",32768).put("uploadReadCalls",uploadReadCalls.get()).put("uploadReceived",uploadReceived.get()).put("downloadSendCalls",downloadSendCalls.get()).put("downloadWritten",downloadWritten.get()).put("oldPerReadUploadSleepMillis",uploadReadCalls.get()*125).put("bytePacedUploadTargetMillis",(uploadReceived.get()*125+32767)/32768).put("uploadElapsedMillis",uploadFixtureStarted.get()==0?0:android.os.SystemClock.elapsedRealtime()-uploadFixtureStarted.get()).put("downloadElapsedMillis",downloadFixtureStarted.get()==0?0:android.os.SystemClock.elapsedRealtime()-downloadFixtureStarted.get());}
    @Test public void artificialTransfersContinueAfterHomeAndLock() throws Exception {
        Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        Context context=instrumentation.getTargetContext();TransferEngine.initialize(context);
        ownerAuthenticated="true".equals(InstrumentationRegistry.getArguments().getString("ownerAuthenticated","false"));
        try(FileOutputStream output=new FileOutputStream(new File(context.getFilesDir(),"native-qa-start.json"))){output.write(new JSONObject().put("pid",android.os.Process.myPid()).toString().getBytes(StandardCharsets.UTF_8));}
        for(int i=0;i<TransferEngine.list().length();i++) {
            JSONObject old=TransferEngine.list().getJSONObject(i);
            boolean independentlyAuditedRootDownload=Arrays.asList(InstrumentationRegistry.getArguments().getString("verifiedRootDownloadIds","").split(",")).contains(old.getString("id"));
            assertTrue("Unknown tasks are preserved; refusing QA",independentlyAuditedRootDownload||Arrays.asList("native-synthetic-only","synthetic-owner-only","synthetic-account-race-only","synthetic-account-lifecycle-only","synthetic-account-deletion-only","synthetic-system-revocation-only","synthetic-root-server-only").contains(old.optString("tags"))||old.optString("filename").equals("native-qa.png")||old.optString("filename").equals("synthetic-owner.png"));
        }
        byte[] png=png();AtomicInteger uploads=new AtomicInteger(),downloads=new AtomicInteger();
        ServerSocket listener=new ServerSocket(0,8,InetAddress.getByName("127.0.0.1"));
        ExecutorService clients=Executors.newCachedThreadPool();
        Future<?> server=clients.submit(()->{while(!listener.isClosed())try{Socket socket=listener.accept();clients.submit(()->serve(socket,png,uploads,downloads));}catch(IOException e){if(!listener.isClosed())throw new RuntimeException(e);}});
        String endpoint="http://127.0.0.1:"+listener.getLocalPort();
        String uploadId=null,downloadId=null;List<String> extraIds=new ArrayList<>();
        try {
            if(ownerAuthenticated)synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().signOut();TransferEngine.accountChanged();}
            context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            Thread.sleep(2000);
            android.webkit.WebView[] pageView=new android.webkit.WebView[1];
            instrumentation.runOnMainSync(()->{
                MainActivity activity=(MainActivity)ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).stream().filter(a->a instanceof MainActivity).findFirst().orElseThrow(()->new IllegalStateException("No resumed Timehut activity"));
                pageView[0]=activity.getBridge().getWebView();
                pageView[0].loadUrl(ownerAuthenticated?"https://localhost/account.html?nativeBackgroundStart=ready":"https://localhost/index.html");
            });
            // Native activity creation can precede WebView's deferred script execution.
            long pageDeadline=System.currentTimeMillis()+40000;boolean moduleLoaded=false;String lastPageState="";
            if(ownerAuthenticated){
                boolean nativeReady=false;while(System.currentTimeMillis()<pageDeadline){CountDownLatch latch=new CountDownLatch(1);String[] value=new String[1];instrumentation.runOnMainSync(()->pageView[0].evaluateJavascript("location.search==='?nativeBackgroundStart=ready'&&document.readyState==='complete'&&!!window.Capacitor?.isPluginAvailable?.('TimehutTransfer')",r->{value[0]=r;latch.countDown();}));if(latch.await(2,TimeUnit.SECONDS)&&"true".equals(value[0])){nativeReady=true;break;}Thread.sleep(100);}assertTrue("Actual account entry settled before native sign-in",nativeReady);
                JSONObject profile=bridgeCall(instrumentation,pageView[0],"setAccountSession",new JSONObject().put("backend",endpoint).put("token",syntheticBearer).put("owner",syntheticOwner));assertEquals(syntheticOwner,profile.getJSONObject("user").getString("id"));
                instrumentation.runOnMainSync(()->pageView[0].loadUrl("https://localhost/transfer.html?nativeBackgroundReady=ready"));
            }
            while(System.currentTimeMillis()<pageDeadline){CountDownLatch readBack=new CountDownLatch(1);String[] value=new String[1];instrumentation.runOnMainSync(()->pageView[0].evaluateJavascript("if(document.readyState==='complete'&&typeof CONFIG!=='undefined'&&!window.TimehutTransfers&&!document.querySelector('script[data-native-transfer-qa]')){const s=document.createElement('script');s.src='js/transfers.js';s.dataset.nativeTransferQa='true';document.head.append(s);}JSON.stringify({loaded:!!window.TimehutTransfers&&typeof CONFIG!=='undefined'&&(!window.TimehutPage||!document.documentElement.hasAttribute('data-timehut-loading')),readyState:document.readyState,url:location.href,scripts:Array.from(document.scripts).map(s=>s.src)})",result->{value[0]=result;readBack.countDown();}));if(!readBack.await(2,TimeUnit.SECONDS)){lastPageState="callback-unavailable-during-navigation";continue;}lastPageState=value[0];if(lastPageState!=null&&lastPageState.contains("\\\"loaded\\\":true")){moduleLoaded=true;break;}Thread.sleep(100);}
            assertTrue("Actual packaged page/module loaded: "+lastPageState,moduleLoaded);
            instrumentation.runOnMainSync(()->pageView[0].evaluateJavascript("window.timehutSyntheticQA=null;(async()=>{try{const caps=await window.TimehutTransfers.ready;const tasks=await window.TimehutTransfers.list();window.timehutSyntheticQA={caps,taskCount:tasks.length,registered:Capacitor.isPluginAvailable('TimehutTransfer')};}catch(e){window.timehutSyntheticQA={error:String(e)};}})()",null));
            JSONObject bridge=null;long bridgeDeadline=System.currentTimeMillis()+12000;
            while(System.currentTimeMillis()<bridgeDeadline){CountDownLatch readBack=new CountDownLatch(1);String[] value=new String[1];instrumentation.runOnMainSync(()->pageView[0].evaluateJavascript("JSON.stringify(window.timehutSyntheticQA||null)",result->{value[0]=result;readBack.countDown();}));if(!readBack.await(2,TimeUnit.SECONDS))continue;if(value[0]!=null&&!value[0].equals("null")){Object decoded=new org.json.JSONTokener(value[0]).nextValue();if(!decoded.equals("null")){bridge=new JSONObject((String)decoded);break;}}Thread.sleep(100);}
            assertNotNull("JS to native plugin responded",bridge);assertTrue(bridge.toString(),bridge.optBoolean("registered"));assertEquals("android",bridge.getJSONObject("caps").getString("platform"));assertTrue(bridge.getJSONObject("caps").getBoolean("nativeBackgroundUpload"));assertTrue(bridge.getJSONObject("caps").getBoolean("nativeBackgroundDownload"));
            JSONObject upload=TransferEngine.newRecord("upload","native-qa.png","photo");uploadId=upload.getString("id");
            File source=TransferEngine.file(uploadId+"-source");try(FileOutputStream output=new FileOutputStream(source)){output.write(png);}
            upload.put("sourceReference",source.getAbsolutePath());upload.put("mimeType","image/png");upload.put("byteSize",png.length);upload.put("tags","native-synthetic-only");upload.put("stage","queued");TransferEngine.put(upload);
            JSONObject upArgs=new JSONObject().put("id",uploadId).put("endpoint",endpoint).put("albumId",ownerAuthenticated?syntheticAlbum:"90000000000002").put("tags","native-synthetic-only");
            JSONObject queued=bridgeCall(instrumentation,pageView[0],"enqueueUpload",upArgs);assertEquals(uploadId,queued.getString("id"));
            JSONObject download=bridgeCall(instrumentation,pageView[0],"enqueueDownload",new JSONObject().put("url",endpoint+"/native-qa.png").put("filename","native-qa.png").put("mediaType","photo"));downloadId=download.getString("id");
            long deadline=System.currentTimeMillis()+20000;
            while((!TransferEngine.get(uploadId).optString("stage").equals("transferring")||!TransferEngine.get(downloadId).optString("stage").equals("transferring"))&&System.currentTimeMillis()<deadline)Thread.sleep(100);
            assertEquals("OS scheduled upload", "transferring",TransferEngine.get(uploadId).optString("stage"));
            JSONObject homeProgress=advanceDuring(instrumentation,uploadId,downloadId,"am start -a android.intent.action.MAIN -c android.intent.category.HOME",false);
            JSONObject otherAppProgress=advanceDuring(instrumentation,uploadId,downloadId,"am start -a android.settings.SETTINGS",false);
            JSONObject lockedProgress=advanceDuring(instrumentation,uploadId,downloadId,"input keyevent 223",true);
            deadline=System.currentTimeMillis()+70000;
            while(System.currentTimeMillis()<deadline) {
                JSONObject up=TransferEngine.get(uploadId),down=TransferEngine.get(downloadId);
                if(up.optString("stage").equals("completed")&&down.optString("stage").equals("file_ready"))break;
                assertNotEquals(up.toString(),"failed",up.optString("stage"));assertNotEquals(down.toString(),"failed",down.optString("stage"));Thread.sleep(250);
            }
            JSONObject observed=new JSONObject().put("uploadStage",TransferEngine.get(uploadId).optString("stage")).put("downloadStage",TransferEngine.get(downloadId).optString("stage")).put("uploadBytes",TransferEngine.get(uploadId).optLong("bytesTransferred")).put("downloadBytes",TransferEngine.get(downloadId).optLong("bytesTransferred")).put("fixtureRate",fixtureRate()).put("completionDeadlineMillis",70000);
            try(FileOutputStream out=new FileOutputStream(new File(context.getFilesDir(),"native-qa-transfer-observation.json"))){out.write(observed.toString(2).getBytes(StandardCharsets.UTF_8));}
            assertEquals("completed",TransferEngine.get(uploadId).optString("stage"));assertEquals("90000000000001",TransferEngine.get(uploadId).optString("flickrPhotoId"));
            assertEquals("file_ready",TransferEngine.get(downloadId).optString("stage"));
            File file=new File(TransferEngine.get(downloadId).getString("destinationReference"));
            byte[] actual;try(InputStream input=new FileInputStream(file);ByteArrayOutputStream output=new ByteArrayOutputStream()){byte[] buf=new byte[32768];int n;while((n=input.read(buf))!=-1)output.write(buf,0,n);actual=output.toByteArray();}
            assertArrayEquals("Exact original bytes",png,actual);assertEquals(1,uploads.get());assertEquals(1,downloads.get());
            instrumentation.getUiAutomation().executeShellCommand("input keyevent 224").close();instrumentation.getUiAutomation().executeShellCommand("wm dismiss-keyguard").close();
            context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));Thread.sleep(500);
            JSONObject saved=null;if(android.os.Build.VERSION.SDK_INT>=29){saved=bridgeCall(instrumentation,pageView[0],"saveToPhotos",new JSONObject().put("id",downloadId));assertFalse(saved.getString("savedAssetId").isEmpty());assertEquals("saved",TransferEngine.get(downloadId).optString("stage"));
            try(InputStream input=context.getContentResolver().openInputStream(android.net.Uri.parse(saved.getString("savedAssetId")))){assertArrayEquals("Saved MediaStore original bytes",png,read(input));}}
            byte[] video;try(InputStream input=instrumentation.getContext().getAssets().open("artificial-video.mp4")){video=read(input);}
            for(String route:new String[]{"redirect-video","original-mov","wrong-mime","truncated-video","invalid-mov"}) {
                JSONObject task=TransferEngine.newRecord("download","native-qa.mp4","video");String id=task.getString("id");extraIds.add(id);task.put("tags","native-synthetic-only");task.put("endpoint",endpoint+"/"+route);task.put("stage","queued");TransferEngine.put(task);
                // UIDT jobs must be scheduled while the app is visible.
                context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));Thread.sleep(500);TransferEngine.schedule(context,id);
                deadline=System.currentTimeMillis()+12000;while(System.currentTimeMillis()<deadline&&!Arrays.asList("file_ready","failed").contains(TransferEngine.get(id).optString("stage")))Thread.sleep(100);
                JSONObject result=TransferEngine.get(id);
                if(route.equals("redirect-video")||route.equals("original-mov")){assertEquals(result.toString(),"file_ready",result.optString("stage"));byte[] expected=video;
                    if(route.equals("original-mov")){try(InputStream input=instrumentation.getContext().getAssets().open("artificial-video.mov")){expected=read(input);}assertEquals("native-qa.mov",result.getString("filename"));assertEquals("video/quicktime",result.getString("mimeType"));}
                    try(InputStream input=new FileInputStream(result.getString("destinationReference"))){assertArrayEquals(expected,read(input));}}
                else assertEquals(result.toString(),"failed",result.optString("stage"));
            }
            JSONObject orphan=TransferEngine.newRecord("download","native-qa.png","photo");orphan.put("tags","native-synthetic-only");orphan.put("endpoint",endpoint+"/native-qa.png");orphan.put("stage","queued");TransferEngine.put(orphan);
            JSONObject unsent=TransferEngine.newRecord("upload","native-qa.png","photo");unsent.put("tags","native-synthetic-only");unsent.put("stage","queued");TransferEngine.put(unsent);
            JSONObject receipt=new JSONObject().put("status","PASS_NATIVE_ANDROID_SYNTHETIC_BACKGROUND").put("formalAcceptance",false).put("flickrRequests",0).put("uploadId",uploadId).put("downloadId",downloadId).put("photoBytes",png.length).put("sdk",android.os.Build.VERSION.SDK_INT).put("homeDuringTransfer",true).put("otherAppDuringTransfer",true).put("screenOffDuringTransfer",true).put("homeProgress",homeProgress).put("otherAppProgress",otherAppProgress).put("lockedProgress",lockedProgress).put("movOriginalBytesAndFilename",true).put("invalidMovRejected",true).put("jsBridge",bridge).put("jsEnqueueUploadAndDownload",true).put("photoLibrarySavedExactBytes",saved!=null).put("savedAssetId",saved==null?"":saved.getString("savedAssetId")).put("orphanQueuedId",orphan.getString("id")).put("unsentQueuedId",unsent.getString("id")).put("redirectVideoExactBytes",true).put("wrongMimeRejected",true).put("truncatedVideoRejected",true);
            receipt.put("ownerAuthenticated",ownerAuthenticated).put("bridgeCallMillis",bridgeTimings).put("fixtureRate",observed.getJSONObject("fixtureRate")).put("completionDeadlineMillis",70000);if(ownerAuthenticated)receipt.put("immutableOwner",TransferEngine.get(uploadId).getString("ownerUserId")).put("ownerBoundAppAlbum",syntheticAlbum);
            try(FileOutputStream output=new FileOutputStream(new File(context.getFilesDir(),"native-qa-report.json"))){output.write(receipt.toString(2).getBytes(StandardCharsets.UTF_8));}
        } finally {
            instrumentation.getUiAutomation().executeShellCommand("input keyevent 224").close();instrumentation.getUiAutomation().executeShellCommand("wm dismiss-keyguard").close();
            listener.close();server.cancel(true);clients.shutdownNow();
            for(String id:new String[]{uploadId,downloadId})if(id!=null){JSONObject task=TransferEngine.get(id);if(task!=null&&!Arrays.asList("completed","file_ready","saved").contains(task.optString("stage")))try{TransferEngine.cancel(context,id);}catch(Exception ignored){}}
            for(String id:extraIds){JSONObject task=TransferEngine.get(id);if(task!=null&&!Arrays.asList("file_ready","saved","failed").contains(task.optString("stage")))try{TransferEngine.cancel(context,id);}catch(Exception ignored){}}
        }
    }
    private String shell(Instrumentation instrumentation,String command)throws Exception{
        try(InputStream input=new android.os.ParcelFileDescriptor.AutoCloseInputStream(instrumentation.getUiAutomation().executeShellCommand(command))){return new String(read(input),StandardCharsets.UTF_8);}
    }
    private String foregroundPackage(Instrumentation instrumentation)throws Exception{
        for(String line:shell(instrumentation,"dumpsys activity activities").split("\n"))if(line.contains("mResumedActivity:")||line.contains("topResumedActivity=")){
            java.util.regex.Matcher match=java.util.regex.Pattern.compile("([A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)+)/").matcher(line);if(match.find())return match.group(1);
        }
        return "";
    }
    private boolean ownActivityResumed(Instrumentation instrumentation){
        boolean[] resumed={false};instrumentation.runOnMainSync(()->resumed[0]=ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).stream().anyMatch(a->a instanceof MainActivity));return resumed[0];
    }
    private JSONObject advanceDuring(Instrumentation instrumentation,String up,String down,String command,boolean asleep)throws Exception{
        Context context=instrumentation.getTargetContext();android.os.PowerManager power=context.getSystemService(android.os.PowerManager.class);android.app.KeyguardManager keyguard=context.getSystemService(android.app.KeyguardManager.class);
        String expected="com.android.settings";
        if(command.contains("HOME")){String resolved=shell(instrumentation,"cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME");java.util.regex.Matcher match=java.util.regex.Pattern.compile("([A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)+)/").matcher(resolved);assertTrue("Resolved real launcher",match.find());expected=match.group(1);}
        shell(instrumentation,command);long stateDeadline=System.currentTimeMillis()+8000;
        while(System.currentTimeMillis()<stateDeadline){boolean state=asleep?!power.isInteractive()&&keyguard.isKeyguardLocked():foregroundPackage(instrumentation).equals(expected);if(state&&!ownActivityResumed(instrumentation))break;Thread.sleep(100);}
        assertFalse("Timehut activity really left foreground",ownActivityResumed(instrumentation));
        if(asleep){assertFalse("Screen really off",power.isInteractive());assertTrue("Keyguard really locked",keyguard.isKeyguardLocked());}else assertEquals("Requested foreground app actually resumed",expected,foregroundPackage(instrumentation));
        // Sample only AFTER the requested state is confirmed, so transition bytes cannot satisfy the test.
        long observedAt=android.os.SystemClock.elapsedRealtime(),uploadBefore=TransferEngine.get(up).optLong("bytesTransferred"),downloadBefore=TransferEngine.get(down).optLong("bytesTransferred");
        long deadline=System.currentTimeMillis()+15000;
        while(System.currentTimeMillis()<deadline&&(TransferEngine.get(up).optLong("bytesTransferred")<=uploadBefore||TransferEngine.get(down).optLong("bytesTransferred")<=downloadBefore))Thread.sleep(100);
        long uploadAfter=TransferEngine.get(up).optLong("bytesTransferred"),downloadAfter=TransferEngine.get(down).optLong("bytesTransferred");
        assertTrue("Native upload bytes increase while "+command,uploadAfter>uploadBefore);assertTrue("Native download bytes increase while "+command,downloadAfter>downloadBefore);assertFalse("Timehut remains background",ownActivityResumed(instrumentation));
        if(asleep){assertFalse("Screen remains off while bytes advance",power.isInteractive());assertTrue("Keyguard remains locked while bytes advance",keyguard.isKeyguardLocked());}else assertEquals("Requested app remains foreground",expected,foregroundPackage(instrumentation));
        return new JSONObject().put("uploadBefore",uploadBefore).put("uploadAfter",uploadAfter).put("downloadBefore",downloadBefore).put("downloadAfter",downloadAfter).put("observationStartedAfterStateConfirmed",true).put("observationMs",android.os.SystemClock.elapsedRealtime()-observedAt).put("foregroundPackage",asleep?"keyguard":expected).put("screenOff",!power.isInteractive()).put("keyguardLocked",keyguard.isKeyguardLocked());
    }
    private byte[] png(){int size=2048;int[] pixels=new int[size*size];Random random=new Random(521);for(int i=0;i<pixels.length;i++)pixels[i]=0xff000000|random.nextInt(0x1000000);Bitmap image=Bitmap.createBitmap(pixels,size,size,Bitmap.Config.ARGB_8888);ByteArrayOutputStream output=new ByteArrayOutputStream();image.compress(Bitmap.CompressFormat.PNG,100,output);image.recycle();return output.toByteArray();}
    private static byte[] read(InputStream input)throws IOException {ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[32768];int n;while((n=input.read(buffer))!=-1)output.write(buffer,0,n);return output.toByteArray();}
    private JSONObject bridgeCall(Instrumentation instrumentation,android.webkit.WebView view,String method,JSONObject args)throws Exception{
        long started=android.os.SystemClock.elapsedRealtime();
        if(Arrays.asList("list","thumbnail","prepareUpload","enqueueUpload","enqueueDownload","cancel","retry","saveToPhotos").contains(method)){JSONObject actor=AccountClient.bridgeStatus();args.put("expectedOwner",actor.opt("owner")).put("expectedGeneration",actor.getString("generation"));}
        instrumentation.runOnMainSync(()->view.evaluateJavascript("window.timehutSyntheticCall=null;(async()=>{try{window.timehutSyntheticCall={result:await Capacitor.registerPlugin('TimehutTransfer')."+method+"("+args.toString()+")};}catch(e){window.timehutSyntheticCall={error:String(e)};}})()",null));
        long deadline=System.currentTimeMillis()+12000;while(System.currentTimeMillis()<deadline){CountDownLatch readBack=new CountDownLatch(1);String[] value=new String[1];instrumentation.runOnMainSync(()->view.evaluateJavascript("JSON.stringify(window.timehutSyntheticCall)",result->{value[0]=result;readBack.countDown();}));assertTrue(readBack.await(2,TimeUnit.SECONDS));if(value[0]!=null&&!value[0].equals("null")){Object decoded=new org.json.JSONTokener(value[0]).nextValue();if(!decoded.equals("null")){JSONObject response=new JSONObject((String)decoded);assertFalse(response.toString(),response.has("error"));bridgeTimings.put(method,android.os.SystemClock.elapsedRealtime()-started);return response.getJSONObject("result");}}Thread.sleep(100);}throw new AssertionError("Native JS call timed out: "+method);
    }
    private void serve(Socket socket,byte[] png,AtomicInteger uploads,AtomicInteger downloads){try(Socket owned=socket){owned.setSoTimeout(60000);InputStream input=owned.getInputStream();OutputStream output=owned.getOutputStream();ByteArrayOutputStream header=new ByteArrayOutputStream();int tail=0,byteValue;while((byteValue=input.read())!=-1){header.write(byteValue);tail=(tail<<8)|byteValue;if(tail==0x0d0a0d0a)break;if(header.size()>32768)throw new IOException("Oversized header");}String text=header.toString("UTF-8"),request=text.split("\r\n")[0];
        if(ownerAuthenticated){Map<String,String> headers=new HashMap<>();for(String line:text.split("\r\n")){int colon=line.indexOf(':');if(colon>0)headers.put(line.substring(0,colon).toLowerCase(Locale.ROOT),line.substring(colon+1).trim());}if(!("Bearer "+syntheticBearer).equals(headers.get("authorization"))){output.write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.UTF_8));return;}if(request.equals("POST /api/upload HTTP/1.1")&&!syntheticAlbum.equals(headers.get("x-timehut-album")))throw new IOException("Owner album header mismatch");if(request.equals("GET /api/accounts/me HTTP/1.1")){reply(output,new JSONObject().put("user",new JSONObject().put("id",syntheticOwner).put("username","synthetic").put("displayName","人工帳戶")).put("expiresAt",System.currentTimeMillis()+3600000).put("legacyOwner",false).toString());return;}}
        if(request.equals("GET /api/accounts/context HTTP/1.1")){reply(output,new JSONObject().put("user",new JSONObject().put("id",syntheticOwner)).put("children",new JSONArray().put(new JSONObject().put("name","人工傳輸相簿").put("albumId",syntheticAlbum).put("birthDate","2020-01-01"))).toString());return;}
        if(request.startsWith("GET /api/uploads/admission/")){reply(output,uploads.get()>0?"{\"admissionStatus\":\"accepted\",\"localId\":\"native-synthetic-receipt\",\"status\":\"pending\"}":"{\"admissionStatus\":\"not_found\"}");return;}
        if(request.equals("GET /redirect-video HTTP/1.1")){output.write("HTTP/1.1 302 Found\r\nLocation: /artificial-video.mp4\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.UTF_8));return;}
        if(Arrays.asList("GET /artificial-video.mp4 HTTP/1.1","GET /wrong-mime HTTP/1.1","GET /truncated-video HTTP/1.1","GET /original-mov HTTP/1.1","GET /invalid-mov HTTP/1.1").contains(request)){byte[] video;try(InputStream asset=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(request.contains("mov")?"artificial-video.mov":"artificial-video.mp4")){video=read(asset);}if(request.contains("invalid-mov"))video=new byte[]{0,0,0,4,102,114,101,101,0,0,0,0};boolean bad=request.contains("wrong-mime"),shortBody=request.contains("truncated-video");output.write(("HTTP/1.1 200 OK\r\nContent-Type: "+(bad?"image/png":request.contains("mov")?"video/quicktime":"video/mp4")+"\r\nContent-Length: "+video.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));output.write(video,0,shortBody?video.length/2:video.length);output.flush();return;}
        if(request.equals("GET /native-qa.png HTTP/1.1")){output.write(("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: "+png.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));downloadFixtureStarted.set(android.os.SystemClock.elapsedRealtime());FixturePacer pacer=new FixturePacer();for(int offset=0;offset<png.length;offset+=32768){int count=Math.min(32768,png.length-offset);output.write(png,offset,count);output.flush();downloadSendCalls.incrementAndGet();downloadWritten.addAndGet(count);pacer.received(count);}downloads.incrementAndGet();return;}
        if(request.equals("POST /api/upload HTTP/1.1")){int length=0;for(String line:text.split("\r\n"))if(line.toLowerCase(Locale.ROOT).startsWith("content-length:"))length=Integer.parseInt(line.substring(line.indexOf(':')+1).trim());if(length<=0||length>20*1024*1024)throw new IOException("Fixture bound");ByteArrayOutputStream body=new ByteArrayOutputStream();byte[] buffer=new byte[32768];uploadFixtureStarted.set(android.os.SystemClock.elapsedRealtime());FixturePacer pacer=new FixturePacer();while(length>0){int n=input.read(buffer,0,Math.min(length,buffer.length));if(n<0)throw new EOFException();body.write(buffer,0,n);length-=n;uploadReadCalls.incrementAndGet();uploadReceived.addAndGet(n);pacer.received(n);}byte[] bytes=body.toByteArray();String bodyText=new String(bytes,0,Math.min(2048,bytes.length),StandardCharsets.ISO_8859_1);String marker="Content-Type: image/png\r\n\r\n";int begin=bodyText.indexOf(marker)+marker.length();if(!bodyText.contains("native-synthetic-only")||!bodyText.contains(ownerAuthenticated?syntheticAlbum:"90000000000002")||begin<marker.length()||bytes.length<begin+png.length)throw new IOException("Fixture mismatch");for(int i=0;i<png.length;i++)if(bytes[begin+i]!=png[i])throw new IOException("Original upload bytes differ");uploads.incrementAndGet();reply(output,"{\"_staged\":true,\"results\":[{\"success\":true,\"localId\":\"native-synthetic-receipt\"}]}");return;}
        if(request.equals("GET /api/uploads/status/native-synthetic-receipt HTTP/1.1")){reply(output,"{\"status\":\"completed\",\"flickrPhotoId\":\"90000000000001\"}");return;}
        output.write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.UTF_8));
    }catch(Exception error){android.util.Log.e("TimehutSyntheticQA","Loopback test server",error);}}
    private void reply(OutputStream output,String json)throws IOException{byte[] bytes=json.getBytes(StandardCharsets.UTF_8);output.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "+bytes.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));output.write(bytes);output.flush();}
}
