package tw.aihankapps.timehut;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import static org.junit.Assert.*;

/** Managed two-process test against the actual local Node/SQLite root server. */
public class AccountNativeLoginColdTest {
    private Context context(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}
    private String backend()throws Exception{String value=InstrumentationRegistry.getArguments().getString("backend");assertTrue(BuildConfig.DEBUG&&AccountIdentity.allowedBackend(value)&&value.startsWith("http://127.0.0.1:"));return value;}
    private String run(){String value=InstrumentationRegistry.getArguments().getString("run");assertTrue(value.matches("[0-9a-f-]{36}"));return value;}
    private File marker(){return new File(context().getFilesDir(),"native-login-cold-"+run()+".json");}
    private static byte[] bytes(File file)throws Exception{try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toByteArray();}}
    private static String hash(File file)throws Exception{StringBuilder out=new StringBuilder();for(byte value:MessageDigest.getInstance("SHA-256").digest(bytes(file)))out.append(String.format("%02x",value&255));return out.toString();}
    private static void write(File file,JSONObject value)throws Exception{try(FileOutputStream out=new FileOutputStream(file)){out.write(value.toString(2).getBytes(StandardCharsets.UTF_8));out.getFD().sync();}}
    private JSONObject control(String path)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(backend()+"/fixture/native-login/"+path).openConnection();c.setConnectTimeout(3000);c.setReadTimeout(3000);try{assertEquals(200,c.getResponseCode());try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return new JSONObject(out.toString("UTF-8"));}}finally{c.disconnect();}}
    @Test public void prepareUnknownIssuedResponse()throws Exception{
        org.junit.Assume.assumeTrue("Owned two-process prepare phase only","prepare".equals(InstrumentationRegistry.getArguments().getString("phase")));
        assertTrue(android.os.Build.VERSION.SDK_INT>=36);assertFalse("Existing owned checkpoint preserved",marker().exists());TransferEngine.initialize(context());assertNull(TransferEngine.accounts().currentOwner());assertEquals(0,TransferEngine.accounts().pendingRevocations().length());assertEquals(0,TransferEngine.accounts().bridgeStatus().getInt("pendingLoginReceipts"));
        Thread worker=new Thread(()->{try{AccountClient.signIn(backend(),"fixture-alpha","artificial-native-root-secret","",false);}catch(Exception failure){/* Original pending proof remains; the runner checks that the issued response was held before ending this process. */}},"owned-cold-login");worker.setDaemon(true);worker.start();
        long deadline=System.currentTimeMillis()+6000;JSONObject stats=null;while(System.currentTimeMillis()<deadline){stats=control("stats");if(stats.getInt("heldReplies")==1)break;Thread.sleep(40);}assertNotNull(stats);assertEquals(1,stats.getInt("heldReplies"));assertEquals(1,stats.getInt("posts"));assertEquals(1,stats.getInt("alphaSessions"));assertTrue(stats.getBoolean("betaProtected"));JSONObject local=AccountClient.bridgeStatus();assertTrue(local.getBoolean("loginPending"));assertFalse(local.getBoolean("authenticated"));assertEquals(1,local.getInt("pendingLoginReceipts"));
        write(marker(),new JSONObject().put("status","PREPARED_REAL_SERVER_UNKNOWN_LOGIN").put("run",run()).put("pid",android.os.Process.myPid()).put("generation",local.getString("generation")).put("tasksSHA256",hash(TransferEngine.file("tasks.json"))).put("sessionSHA256",hash(new File(context().getNoBackupFilesDir(),"accounts/session.json"))).put("providerRequests",0).put("nativePosts",1));
    }
    @Test public void recoverUnknownResponseInNewProcess()throws Exception{
        org.junit.Assume.assumeTrue("Owned two-process resume phase only","resume".equals(InstrumentationRegistry.getArguments().getString("phase")));
        JSONObject previous=new JSONObject(new String(bytes(marker()),StandardCharsets.UTF_8));assertEquals(run(),previous.getString("run"));assertNotEquals(previous.getInt("pid"),android.os.Process.myPid());TransferEngine.initialize(context());JSONObject state=AccountClient.bridgeStatus();assertNotEquals(previous.getString("generation"),state.getString("generation"));assertFalse(state.getBoolean("authenticated"));assertFalse(state.getBoolean("loginPending"));assertEquals(1,state.getInt("pendingLoginReceipts"));assertFalse(TransferEngine.accounts().nativeCancellations().getJSONObject(0).has("token"));
        assertFalse(AccountClient.drainNativeCancellation(backend()));assertEquals(1,TransferEngine.accounts().nativeCancellations().length());JSONObject rejected=control("stats");assertEquals(0,rejected.getInt("alphaSessions"));assertTrue(rejected.getBoolean("betaProtected"));assertEquals(1,rejected.getInt("posts"));
        control("mode?value=normal");assertTrue(AccountClient.drainNativeCancellation(backend()));assertEquals(0,TransferEngine.accounts().bridgeStatus().getInt("pendingLoginReceipts"));assertEquals(0,TransferEngine.accounts().pendingRevocations().length());assertNull(TransferEngine.accounts().currentOwner());assertEquals(previous.getString("tasksSHA256"),hash(TransferEngine.file("tasks.json")));JSONObject finalState=control("stats");assertEquals(1,finalState.getInt("posts"));assertEquals(0,finalState.getInt("alphaSessions"));assertTrue(finalState.getBoolean("betaProtected"));
        write(new File(context().getFilesDir(),"native-login-cold-report.json"),new JSONObject().put("status","PASS_REAL_ANDROID_COLD_UNKNOWN_LOGIN_RECOVERY").put("run",run()).put("previousPID",previous.getInt("pid")).put("newPID",android.os.Process.myPid()).put("actualDifferentProcess",true).put("actualNodeRootServer",true).put("actualSQLite",true).put("originalLoginPosts",1).put("unknownBearerRecoveredByProof",true).put("wrongTypedACKPreservedReceipt",true).put("BSessionPreserved",true).put("taskBytesPreserved",true).put("finalPending",0).put("providerRequests",0).put("physicalPhone",false).put("OSAutomaticWake",false).put("appSwitchLockSuite",false));
    }
}
