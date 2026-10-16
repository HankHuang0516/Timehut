package tw.aihankapps.timehut;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import static org.junit.Assert.*;

/** Actual native Keystore and original-issuer HTTP, no provider or real accounts. */
@RunWith(AndroidJUnit4.class)
public class AccountRevocationTest {
    private static byte[] read(File file)throws Exception{try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] bytes=new byte[2048];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);return out.toByteArray();}}
    private static void write(File file,byte[] bytes)throws Exception{try(OutputStream out=new FileOutputStream(file)){out.write(bytes);}}
    private static boolean pending(String token)throws Exception{JSONArray rows=TransferEngine.accounts().pendingRevocations();for(int i=0;i<rows.length();i++)if(token.equals(rows.getJSONObject(i).getString("token")))return true;return false;}
    @Test public void offlineLogoutSurvivesReopenAndCannotRevokeNewOwner()throws Exception{
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();TransferEngine.initialize(context);
        try(AccountClientBridgeTest.Fixture fixture=new AccountClientBridgeTest.Fixture()){
            JSONObject a=AccountClient.signIn(fixture.endpoint(),"synthetic-revoke-alpha","artificial-native-secret","Artificial A",true);String ownerA=a.getJSONObject("user").getString("id"),tokenA=fixture.lastToken;fixture.offlineLogout=true;
            JSONObject logout=AccountClient.signOut();assertTrue(logout.getBoolean("signedOut"));assertFalse(logout.getBoolean("serverConfirmed"));assertNull(TransferEngine.accounts().currentOwner());assertTrue(pending(tokenA));assertTrue(fixture.tokens.containsKey(tokenA));
            AccountSessionStore reopened=new AccountSessionStore(context);assertNull(reopened.currentOwner());assertTrue(reopened.bridgeStatus().getInt("pendingRevocations")>0);File file=new File(context.getNoBackupFilesDir(),"accounts/session.json");synchronized(TransferEngine.accountBoundary()){byte[] snapshot=read(file);assertFalse(new String(snapshot,StandardCharsets.UTF_8).contains(tokenA));assertFalse(reopened.bridgeStatus().toString().contains(tokenA));
            try{reopened.activateVerified(ownerA,tokenA,System.currentTimeMillis()+3600000,false,fixture.endpoint());fail("Pending revocation cannot be revived as active credential");}catch(IOException expected){}assertArrayEquals(snapshot,read(file));}
            JSONObject b=AccountClient.signIn(fixture.endpoint(),"synthetic-revoke-bravo","artificial-native-secret","Artificial B",true);String ownerB=b.getJSONObject("user").getString("id"),tokenB=fixture.lastToken;long generation=TransferEngine.accounts().generation();assertTrue(pending(tokenA));assertEquals(ownerB,reopened.currentOwner());fixture.offlineLogout=false;
            for(String bad:new String[]{"{\"ok\":\"true\"}","{\"ok\":1}","{\"ok\":null}","{}","{\"ok\":false}","{"}){fixture.logoutRaw=bad;assertFalse(AccountClient.drainRevocation(fixture.endpoint()));assertTrue(pending(tokenA));assertTrue(fixture.tokens.containsKey(tokenA));assertEquals(ownerB,reopened.currentOwner());assertEquals(generation,TransferEngine.accounts().generation());}fixture.logoutRaw=null;
            fixture.slowLogoutHeaders=true;long started=android.os.SystemClock.elapsedRealtime();assertFalse(AccountClient.drainRevocation(fixture.endpoint()));long elapsed=android.os.SystemClock.elapsedRealtime()-started;assertTrue("Absolute header budget "+elapsed,elapsed>=5500&&elapsed<9000);assertTrue("Slow header bytes keep idle timeout alive",fixture.slowHeaderBytes.get()>=16);assertTrue(pending(tokenA));assertEquals(ownerB,reopened.currentOwner());assertEquals(generation,TransferEngine.accounts().generation());fixture.slowLogoutHeaders=false;
            assertTrue(AccountClient.drainRevocation(fixture.endpoint()));assertFalse(pending(tokenA));assertFalse(fixture.tokens.containsKey(tokenA));assertTrue(fixture.tokens.containsKey(tokenB));assertEquals(ownerB,reopened.currentOwner());assertEquals(generation,TransferEngine.accounts().generation());assertEquals(tokenB,TransferEngine.accounts().tokenForRequest(ownerB,fixture.endpoint()));
            JSONObject switched=AccountClient.signIn(fixture.endpoint(),"synthetic-revoke-alpha","artificial-native-secret","",false);String freshA=fixture.lastToken;assertEquals(ownerA,switched.getJSONObject("user").getString("id"));assertNotEquals(tokenA,freshA);assertFalse(fixture.tokens.containsKey(tokenB));assertFalse(pending(tokenB));
            fixture.offlineLogout=true;assertFalse(AccountClient.signOut().getBoolean("serverConfirmed"));byte[] queued=read(file);JSONObject receipt=new JSONObject(new String(queued,StandardCharsets.UTF_8));File dir=new File(context.getNoBackupFilesDir(),"synthetic-revocation-qa/"+UUID.randomUUID());assertTrue(dir.mkdirs());
            JSONObject promoted=new JSONObject().put("version",1).put("accountMode",true).put("session",new JSONObject(receipt.getJSONObject("revocations").toString()).put("owner",ownerA));File wrongRole=new File(dir,"wrong-role.json");write(wrongRole,promoted.toString().getBytes(StandardCharsets.UTF_8));try{new AccountSessionStore(wrongRole,"timehut.account-session.v1");fail("Revocation ciphertext cannot become an active session");}catch(IOException expected){}
            File tampered=new File(dir,"tampered.json");write(tampered,queued);AccountSessionStore handle=new AccountSessionStore(tampered,"timehut.account-session.v1");assertNull(handle.currentOwner());JSONObject damaged=new JSONObject(receipt.toString()),sealed=damaged.getJSONObject("revocations");String cipher=sealed.getString("ciphertext");sealed.put("ciphertext",(cipher.charAt(0)=='A'?"B":"A")+cipher.substring(1));byte[] bad=damaged.toString().getBytes(StandardCharsets.UTF_8);write(tampered,bad);try{handle.pendingRevocations();fail("Cached revocation proof must detect changed current ciphertext");}catch(IOException expected){}assertArrayEquals(bad,read(tampered));
            fixture.tokens.remove(freshA);fixture.offlineLogout=false;assertTrue(AccountClient.drainRevocation(fixture.endpoint()));assertFalse(pending(freshA));assertNull(TransferEngine.accounts().currentOwner());
            JSONObject report=new JSONObject().put("status","PASS_NATIVE_DURABLE_OFFLINE_REVOCATION").put("offlineLogoutClosesLocalAccessBeforeRemoteConfirmation",true).put("encryptedPendingReceiptSurvivesStoreReopen",true).put("pendingCredentialCannotReactivate",true).put("originalIssuerRetryRevokesOnlyOldSession",true).put("newOwnerGenerationAndCredentialUnaffected",true).put("switchRevokesPreviousSession",true).put("revocationCipherCannotBecomeSession",true).put("changedCipherInvalidatesCachedProofAndPreservesBytes",true).put("originalIssuer401ConfirmsRetiredSessionOnly",true).put("providerRequests",0).put("physicalPhone",false).put("processRestartVerified",false).put("strictAckWrongTypeMalformedNegativesRetainOldReceiptAndB",true).put("slowHeadersWatchdogMillis",elapsed).put("slowHeaderBytes",fixture.slowHeaderBytes.get());
            write(new File(context.getFilesDir(),"revocation-qa-report.json"),report.toString(2).getBytes(StandardCharsets.UTF_8));
        }
    }
}
