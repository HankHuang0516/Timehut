package tw.aihankapps.timehut;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AccountIdentityTest {
    private static final class FakeMe implements AutoCloseable {
        final ServerSocket server;final Thread thread;final String owner,token;volatile int mode=0,count=0;volatile boolean closed=false;
        FakeMe(String user,String bearer)throws Exception{owner=user;token=bearer;server=new ServerSocket(0,8,InetAddress.getByName("127.0.0.1"));thread=new Thread(()->{while(!closed)try(Socket client=server.accept()){
            BufferedReader in=new BufferedReader(new InputStreamReader(client.getInputStream(),StandardCharsets.UTF_8));String first=in.readLine(),line;boolean authenticated=false;while((line=in.readLine())!=null&&!line.isEmpty())if(line.equals("Authorization: Bearer "+token))authenticated=true;count++;
            int status=authenticated?200:401;String location="";
            JSONObject body=new JSONObject().put("user",new JSONObject().put("id",owner).put("username","artificial").put("displayName","人工帳戶"))
                .put("expiresAt",mode==2?"not-a-number":System.currentTimeMillis()+3600000).put("legacyOwner",false).put("unexpectedToken",token);
            if(mode==1){status=302;location="Location: http://127.0.0.1:"+server.getLocalPort()+"/leak\r\n";}
            byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);OutputStream out=client.getOutputStream();out.write(("HTTP/1.1 "+status+" Synthetic\r\n"+location+"Content-Type: application/json\r\nContent-Length: "+bytes.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(bytes);out.flush();
        }catch(Exception error){if(!closed)throw new RuntimeException(error);}});thread.start();}
        String endpoint(){return "http://127.0.0.1:"+server.getLocalPort();}
        public void close()throws Exception{closed=true;server.close();thread.join(1000);}
    }
    @Test public void verifiedServerIdentityBeforeActivation()throws Exception{
        Context ctx=InstrumentationRegistry.getInstrumentation().getTargetContext();String run=UUID.randomUUID().toString(),a=UUID.randomUUID().toString(),b=UUID.randomUUID().toString(),token="synthetic_identity_"+UUID.randomUUID().toString().replace("-","");
        AccountSessionStore store=new AccountSessionStore(new File(ctx.getNoBackupFilesDir(),"synthetic-identity-qa/"+run+"/session.json"),"timehut.synthetic-identity-qa."+run);
        try(FakeMe server=new FakeMe(a,token)){
            JSONObject profile=AccountIdentity.verifyAndActivate(store,server.endpoint(),token,a);assertEquals(a,store.currentOwner());assertEquals(token,store.tokenForOwner(a));assertFalse(profile.toString().contains(token));assertFalse(profile.has("unexpectedToken"));
            try{AccountIdentity.verifyAndActivate(store,server.endpoint(),token,b);fail("Caller cannot relabel server owner");}catch(IOException expected){}assertEquals(a,store.currentOwner());
            int before=server.count;try{AccountIdentity.verifyAndActivate(store,server.endpoint()+"/arbitrary",token,a);fail("Non-root endpoint rejected");}catch(IOException expected){}assertEquals(before,server.count);
            server.mode=1;before=server.count;try{AccountIdentity.verifyAndActivate(store,server.endpoint(),token,a);fail("Identity redirects rejected");}catch(IOException expected){}assertEquals(before+1,server.count);assertEquals(a,store.currentOwner());
            server.mode=2;try{AccountIdentity.verifyAndActivate(store,server.endpoint(),token,a);fail("Malformed server expiry rejected");}catch(IOException expected){}assertEquals(a,store.currentOwner());
            assertFalse(AccountIdentity.allowedBackend("https://evil.invalid"));assertFalse(AccountIdentity.allowedBackend("https://just-healing-production.up.railway.app.evil.invalid"));
            JSONObject report=new JSONObject().put("status","PASS_NATIVE_IDENTITY_HTTP_ONLY").put("serverDerivedOwner",true).put("callerOwnerSpoofDenied",true).put("untrustedEndpointDeniedBeforeRequest",true).put("identityRedirectDenied",true).put("invalidExpiryPreservesPreviousSession",true).put("unexpectedTokenNotBridged",true).put("actualProviderRequests",0).put("nativeJobsIntegrated",false).put("physicalPhone",false);
            try(OutputStream out=new FileOutputStream(new File(ctx.getFilesDir(),"identity-qa-report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}
        }
    }
}
