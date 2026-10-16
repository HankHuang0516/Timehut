package tw.aihankapps.timehut;

import android.content.Context;
import android.net.ConnectivityManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.Assert.*;

/** Actual native HTTP/receipts, artificial loopback provider only. */
@RunWith(AndroidJUnit4.class)
public class AccountPhotoDeletionTest {
    private Context context;
    private static final String PID="900000000701";
    private JSONObject task(String direction,String stage,String photo,String endpoint)throws Exception{
        JSONObject row=TransferEngine.newRecord(direction,"synthetic-deletion.png","photo");
        File source=TransferEngine.file(row.getString("id")+"-source");byte[] bytes="synthetic-deletion-original".getBytes(StandardCharsets.UTF_8);
        try(FileOutputStream out=new FileOutputStream(source)){out.write(bytes);}
        row.put("stage",stage).put("flickrPhotoId",photo).put("endpoint",endpoint).put("sourceReference",source.getAbsolutePath()).put("byteSize",bytes.length).put("mimeType","image/png").put("albumId",UUID.randomUUID().toString()).put("tags","synthetic-account-deletion-only");TransferEngine.put(row);return row;
    }
    private String id(JSONObject row)throws Exception{return row.getString("id");}
    private String stage(JSONObject row)throws Exception{return TransferEngine.get(id(row)).getString("stage");}
    private void login(AccountClientBridgeTest.Fixture f,String name,boolean register)throws Exception{AccountClient.signIn(f.endpoint(),name,"artificial-native-secret",name,register);}
    @Test public void ownConfirmedDeletionIsTerminalAndNeverReuploads()throws Exception{
        context=InstrumentationRegistry.getInstrumentation().getTargetContext();TransferEngine.initialize(context);
        try(AccountClientBridgeTest.Fixture f=new AccountClientBridgeTest.Fixture()){
            login(f,"synthetic-delete-alpha",true);String a=TransferEngine.accounts().currentOwner();JSONObject up=task("upload","completed",PID,f.endpoint()),down=task("download","file_ready",PID,f.endpoint()),other=task("upload","completed","900000000702",f.endpoint());
            login(f,"synthetic-delete-bravo",true);JSONObject foreign=task("upload","completed",PID,f.endpoint());login(f,"synthetic-delete-alpha",false);
            for(String ack:new String[]{"{\"success\":\"true\",\"photoId\":\""+PID+"\"}","{\"success\":false,\"photoId\":\""+PID+"\"}","{\"success\":true,\"photoId\":\"900000000702\"}"}){f.deleteRaw=ack;AccountClient.request("DELETE","/api/photo/"+PID,null);assertEquals("completed",stage(up));}
            f.deleteRaw="{\"success\":true,\"photoId\":\""+PID+"\"}";AccountClient.request("DELETE","/api/photo/"+PID,null);assertEquals("photo_deleted",stage(up));assertEquals("file_ready",stage(down));assertEquals("completed",stage(other));assertEquals("completed",stage(foreign));assertTrue(TransferEngine.get(id(up)).getBoolean("retryBlocked"));assertTrue(new File(up.getString("sourceReference")).isFile());
            assertFalse(TransferEngine.run(id(up),TransferEngine.route(context.getSystemService(ConnectivityManager.class).getActiveNetwork())));try{TransferEngine.change(id(up),"stage","queued");fail("Deleted receipt must reject resurrection");}catch(IllegalStateException expected){}assertEquals("photo_deleted",stage(up));
            login(f,"synthetic-delete-bravo",false);assertFalse(TransferEngine.systemStopped(id(up)));assertEquals("photo_deleted",stage(up));login(f,"synthetic-delete-alpha",false);
            f.deleteRaw="{\"results\":[{\"photoId\":\"900000000702\",\"success\":true},{\"photoId\":\""+PID+"\",\"success\":true}]}";AccountClient.request("POST","/api/photos/delete",new JSONObject().put("photoIds",new JSONArray().put("900000000702")));assertEquals("photo_deleted",stage(other));assertEquals("completed",stage(foreign));
            f.deletedReceipt=true;JSONObject admitted=task("upload","queued","",f.endpoint());admitted.put("contentSha256",UploadIdentity.content(new File(admitted.getString("sourceReference")),()->{})).put("metadataSha256",UploadIdentity.metadata(admitted.getString("albumId"),admitted.getString("filename"),admitted.getString("mimeType"),admitted.getString("tags"),admitted.getString("filename"),"",""));TransferEngine.put(admitted);assertFalse(TransferEngine.run(id(admitted),TransferEngine.route(context.getSystemService(ConnectivityManager.class).getActiveNetwork())));assertEquals("photo_deleted",stage(admitted));assertEquals("synthetic-deleted-receipt",TransferEngine.get(id(admitted)).getString("serverReceiptId"));
            JSONObject polled=task("upload","queued","",f.endpoint());polled.put("serverReceiptId","synthetic-deleted-receipt");TransferEngine.put(polled);assertFalse(TransferEngine.run(id(polled),TransferEngine.route(context.getSystemService(ConnectivityManager.class).getActiveNetwork())));assertEquals("photo_deleted",stage(polled));assertEquals(0,f.uploadPosts.get());
            JSONObject stale=task("upload","completed","900000000703",f.endpoint());f.deleteRaw="{\"success\":true,\"photoId\":\"900000000703\"}";f.deleteEntered=new CountDownLatch(1);f.holdDelete=true;ExecutorService worker=Executors.newSingleThreadExecutor();try{Future<?> response=worker.submit(()->{try{AccountClient.request("DELETE","/api/photo/900000000703",null);throw new AssertionError("Stale response must fail");}catch(IOException expected){}catch(Exception e){throw new RuntimeException(e);}});assertTrue(f.deleteEntered.await(2,TimeUnit.SECONDS));login(f,"synthetic-delete-bravo",false);f.releaseDelete.countDown();response.get(5,TimeUnit.SECONDS);assertEquals("completed",stage(stale));assertEquals("completed",stage(foreign));}finally{f.releaseDelete.countDown();worker.shutdownNow();}
            JSONObject report=new JSONObject().put("status","PASS_NATIVE_OWNED_PHOTO_DELETION").put("owner",a).put("terminalTaskIds",new JSONArray().put(id(up)).put(id(other)).put(id(admitted)).put(id(polled))).put("preservedSource",up.getString("sourceReference")).put("strictAckAndRequestedIds",true).put("foreignAndDownloadsUnchanged",true).put("deletedAdmissionAndStatusNoUpload",true).put("staleAccountAckRejected",true).put("uploadPosts",f.uploadPosts.get()).put("providerRequests",0).put("physicalPhone",false);
            try(FileOutputStream out=new FileOutputStream(new File(context.getFilesDir(),"photo-deletion-qa-report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}
        }
    }
    @Test public void terminalReceiptsSurviveProcessReopen()throws Exception{
        context=InstrumentationRegistry.getInstrumentation().getTargetContext();TransferEngine.initialize(context);JSONObject report;
        try(InputStream in=new FileInputStream(new File(context.getFilesDir(),"photo-deletion-qa-report.json"));ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] bytes=new byte[2048];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);report=new JSONObject(out.toString("UTF-8"));}
        JSONArray ids=report.getJSONArray("terminalTaskIds");for(int i=0;i<ids.length();i++){assertEquals("photo_deleted",TransferEngine.get(ids.getString(i)).getString("stage"));assertFalse(TransferEngine.systemStopped(ids.getString(i)));assertFalse(TransferEngine.run(ids.getString(i),TransferEngine.route(context.getSystemService(ConnectivityManager.class).getActiveNetwork())));}assertTrue(new File(report.getString("preservedSource")).isFile());report.put("processReopenTerminal",true);try(FileOutputStream out=new FileOutputStream(new File(context.getFilesDir(),"photo-deletion-qa-report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}
    }
}
