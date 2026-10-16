package tw.aihankapps.timehut;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.Assert.*;

/** Retire only known DEBUG loopback synthetic sessions whose fixture listener has ended. */
@RunWith(AndroidJUnit4.class)
public class SyntheticRevocationFixtureCleanupTest {
    @Test public void retiredSyntheticIssuerNamespacesConfirmOnlyTheirPendingSessions()throws Exception{
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();assertTrue(BuildConfig.DEBUG);assertEquals("tw.aihankapps.timehut.accountqa",context.getPackageName());TransferEngine.initialize(context);
        JSONArray rows=TransferEngine.accounts().pendingRevocations(),identities=new JSONArray();Set<String> issuers=new HashSet<>();
        if(rows.length()==0){JSONObject empty=new JSONObject().put("status","PASS_RETIRED_SYNTHETIC_REVOCATION_FIXTURE_CLEANUP").put("syntheticPendingIdentities",identities).put("nothingToRetire",true).put("originalEncryptedSnapshotPreserved",JSONObject.NULL).put("existingStateUnchanged",true).put("providerRequests",0).put("realCredentialsHandled",false);try(OutputStream out=new FileOutputStream(new File(context.getFilesDir(),"synthetic-revocation-cleanup-report.json"))){out.write(empty.toString(2).getBytes(StandardCharsets.UTF_8));}return;}
        for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);URL url=new URL(row.getString("issuer"));assertEquals("http",url.getProtocol());assertEquals("127.0.0.1",url.getHost());assertTrue(url.getPort()>1024);assertTrue("Unknown token remains untouched",row.getString("token").startsWith("synthetic_"));assertNotEquals(TransferEngine.accounts().tokenForOwner(row.getString("owner")),row.getString("token"));issuers.add(row.getString("issuer"));identities.put(new JSONObject().put("owner",row.getString("owner")).put("issuer",row.getString("issuer")));}
        File preserved=new File(context.getNoBackupFilesDir(),"synthetic-revocation-cleanup/"+UUID.randomUUID());assertTrue(preserved.mkdirs());File original=new File(context.getNoBackupFilesDir(),"accounts/session.json");try(InputStream in=new FileInputStream(original);OutputStream out=new FileOutputStream(new File(preserved,"session-original-encrypted.json"))){byte[] bytes=new byte[2048];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);}
        List<ServerSocket> sockets=new ArrayList<>();ExecutorService pool=Executors.newCachedThreadPool();
        try{
            // Successful exclusive bind proves each old controlled fixture is
            // no longer serving. Never stop or replace an occupied listener.
            for(String issuer:issuers)sockets.add(new ServerSocket(new URL(issuer).getPort(),16,InetAddress.getByName("127.0.0.1")));
            for(ServerSocket socket:sockets)pool.submit(()->{while(!socket.isClosed())try(Socket client=socket.accept()){InputStream in=client.getInputStream();ByteArrayOutputStream headers=new ByteArrayOutputStream();int tail=0,value;while((value=in.read())!=-1){headers.write(value);tail=(tail<<8)|value;if(tail==0x0d0a0d0a)break;if(headers.size()>16384)throw new IOException("Header bound");}String raw=headers.toString("UTF-8");assertTrue(raw.startsWith("POST /api/accounts/logout "));client.getOutputStream().write("HTTP/1.1 401 Retired Synthetic Namespace\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".getBytes(StandardCharsets.US_ASCII));}catch(Exception failure){if(!socket.isClosed())throw new RuntimeException(failure);}});
            for(String issuer:issuers)for(int attempt=0;attempt<25;attempt++){JSONArray pending=TransferEngine.accounts().pendingRevocations();boolean found=false;for(int i=0;i<pending.length();i++)if(issuer.equals(pending.getJSONObject(i).getString("issuer")))found=true;if(!found)break;assertTrue(AccountClient.drainRevocation(issuer));}
            assertEquals(0,TransferEngine.accounts().pendingRevocations().length());JSONObject report=new JSONObject().put("status","PASS_RETIRED_SYNTHETIC_REVOCATION_FIXTURE_CLEANUP").put("originalEncryptedSnapshotPreserved",preserved.getAbsolutePath()).put("syntheticPendingIdentities",identities).put("onlyDebugLoopbackSyntheticTokens",true).put("unknownOrOccupiedIssuerFailsPreservingOriginal",true).put("providerRequests",0).put("realCredentialsHandled",false);try(OutputStream out=new FileOutputStream(new File(context.getFilesDir(),"synthetic-revocation-cleanup-report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}
        }finally{for(ServerSocket socket:sockets)socket.close();pool.shutdownNow();pool.awaitTermination(2,TimeUnit.SECONDS);}
    }
}
