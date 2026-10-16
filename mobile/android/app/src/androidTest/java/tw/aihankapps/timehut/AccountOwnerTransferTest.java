package tw.aihankapps.timehut;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.Assert.*;

/** Actual native HTTP + owner isolation; a controlled local provider, not OS background proof. */
@RunWith(AndroidJUnit4.class)
public class AccountOwnerTransferTest {
    static final class Fixture implements AutoCloseable {
        final ServerSocket socket;final Thread thread;final String owner;volatile String token;volatile boolean closed=false;volatile int uploadCalls=0,downloadCalls=0;volatile boolean albumHeaderMatched=false;volatile Exception error;
        final byte[] photo="artificial-owner-only-bytes".getBytes(StandardCharsets.UTF_8);final String album=UUID.randomUUID().toString();
        Fixture(String user,String secret)throws Exception{owner=user;token=secret;socket=new ServerSocket(0,16,InetAddress.getByName("127.0.0.1"));thread=new Thread(()->{while(!closed)try(Socket client=socket.accept()){
            InputStream in=client.getInputStream();ByteArrayOutputStream header=new ByteArrayOutputStream();int last=0,next;while((next=in.read())!=-1){header.write(next);last=(last<<8)|next;if(last==0x0d0a0d0a)break;if(header.size()>16384)throw new IOException("Invalid synthetic request");}
            String text=header.toString("UTF-8"),first=text.split("\r\n")[0],path=first.split(" ")[1];Map<String,String> headers=new HashMap<>();for(String line:text.split("\r\n")){int colon=line.indexOf(':');if(colon>0)headers.put(line.substring(0,colon).toLowerCase(Locale.ROOT),line.substring(colon+1).trim());}
            boolean authorized=("Bearer "+token).equals(headers.get("authorization"));byte[] body;String mime="application/json";int status=200;
            if(!authorized){status=401;body="{}".getBytes();}
            else if(path.equals("/api/accounts/me"))body=new JSONObject().put("user",new JSONObject().put("id",owner).put("username","synthetic").put("displayName","人工帳戶")).put("expiresAt",System.currentTimeMillis()+3600000).put("legacyOwner",false).toString().getBytes(StandardCharsets.UTF_8);
            else if(path.startsWith("/api/uploads/admission/"))body="{\"admissionStatus\":\"not_found\"}".getBytes();
            else if(path.equals("/api/upload")){int length=Integer.parseInt(headers.getOrDefault("content-length","0"));byte[] chunk=new byte[8192];while(length>0){int read=in.read(chunk,0,Math.min(length,chunk.length));if(read<0)throw new IOException("Short synthetic upload");length-=read;}uploadCalls++;albumHeaderMatched=album.equals(headers.get("x-timehut-album"));body="{\"results\":[{\"success\":true,\"localId\":\"synthetic-owner-receipt\"}]}".getBytes();}
            else if(path.startsWith("/api/uploads/status/"))body="{\"status\":\"completed\",\"flickrPhotoId\":\"900000000091\"}".getBytes();
            else if(path.equals("/original.png")){downloadCalls++;body=photo;mime="image/png";}
            else{status=404;body="{}".getBytes();}
            OutputStream out=client.getOutputStream();out.write(("HTTP/1.1 "+status+" Synthetic\r\nContent-Type: "+mime+"\r\nContent-Length: "+body.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(body);out.flush();
        }catch(Exception failure){if(!closed)error=failure;}});thread.start();}
        void renewToken(){token="synthetic_owner_"+UUID.randomUUID().toString().replace("-","");}
        String endpoint(){return "http://127.0.0.1:"+socket.getLocalPort();}
        public void close()throws Exception{closed=true;socket.close();thread.join(1000);}
    }
    @Test public void requestsAndRecordsStayWithOriginalOwner()throws Exception{
        Context ctx=InstrumentationRegistry.getInstrumentation().getTargetContext();TransferEngine.initialize(ctx);
        String a=UUID.randomUUID().toString(),b=UUID.randomUUID().toString(),ta="synthetic_owner_a_"+UUID.randomUUID().toString().replace("-",""),tb="synthetic_owner_b_"+UUID.randomUUID().toString().replace("-","");
        try(Fixture backend=new Fixture(a,ta)){
            AccountIdentity.verifyAndActivate(TransferEngine.accounts(),backend.endpoint(),ta,a);TransferEngine.accountChanged();
            JSONObject upload=TransferEngine.newRecord("upload","synthetic-owner.png","photo");String id=upload.getString("id");File source=TransferEngine.file(id+"-source");try(OutputStream out=new FileOutputStream(source)){out.write(backend.photo);}
            upload.put("sourceReference",source.getAbsolutePath()).put("mimeType","image/png").put("byteSize",source.length()).put("stage","queued").put("endpoint",backend.endpoint()).put("albumId",backend.album).put("tags","synthetic-owner-only");TransferEngine.put(upload);
            Network network=ctx.getSystemService(ConnectivityManager.class).getActiveNetwork();assertNotNull(network);assertFalse(TransferEngine.run(id,TransferEngine.route(network)));assertEquals("completed",TransferEngine.get(id).getString("stage"));assertEquals(1,backend.uploadCalls);assertTrue(backend.albumHeaderMatched);
            JSONObject download=TransferEngine.newRecord("download","synthetic-owner.png","photo");String downId=download.getString("id");download.put("endpoint",backend.endpoint()+"/original.png").put("stage","queued");TransferEngine.put(download);assertFalse(TransferEngine.run(downId,TransferEngine.route(network)));assertEquals("file_ready",TransferEngine.get(downId).getString("stage"));assertEquals(1,backend.downloadCalls);
            TransferEngine.accounts().activateVerified(b,tb,System.currentTimeMillis()+3600000,false,backend.endpoint());TransferEngine.accountChanged();assertEquals(0,TransferEngine.visibleTasks().length());assertFalse(TransferEngine.visible(TransferEngine.get(id)));try{TransferEngine.ownedTask(downId);fail("Other owner cannot access downloaded file task");}catch(IOException expected){}
            JSONObject substitution=TransferEngine.get(downId);substitution.put("ownerUserId",b);try{TransferEngine.put(substitution);fail("Immutable task owner required");}catch(IOException expected){}
            assertNull(TransferEngine.accounts().tokenForRequest(a,backend.endpoint()+"/api/upload"));assertNull(TransferEngine.accounts().tokenForRequest(b,"https://api.flickr.com/"));
            backend.renewToken();AccountIdentity.verifyAndActivate(TransferEngine.accounts(),backend.endpoint(),backend.token,a);TransferEngine.accountChanged();assertEquals(2,TransferEngine.visibleTasks().length());assertEquals("completed",TransferEngine.ownedTask(id).getString("stage"));assertEquals(1,backend.uploadCalls);assertNull(backend.error);
            TransferEngine.accounts().signOut();TransferEngine.accountChanged();assertEquals(0,TransferEngine.visibleTasks().length());
            JSONObject report=new JSONObject().put("status","PASS_NATIVE_OWNER_HTTP_TASKS_ONLY").put("ownerBoundUploadAndDownload",true).put("albumHeaderBound",true).put("foreignTaskListAndDirectAccessDenied",true).put("ownerMutationDenied",true).put("foreignIssuerGetsNoBearer",true).put("returnToOriginalOwnerPreservesCompletedReceipts",true).put("uploadCreations",backend.uploadCalls).put("providerRequests",0).put("appSwitchLockBackgroundVerified",false).put("physicalPhone",false);
            try(OutputStream out=new FileOutputStream(new File(ctx.getFilesDir(),"owner-qa-report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}
        }
    }
}
