package tw.aihankapps.timehut;

import android.content.Context;
import android.app.KeyguardManager;
import android.os.Build;
import android.os.PowerManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import android.util.AtomicFile;
import java.util.concurrent.*;
import static org.junit.Assert.*;

/** Real AndroidKeystore storage only; no server/bridge/job integration claim. */
@RunWith(AndroidJUnit4.class)
public class AccountSessionStoreTest {
    private static byte[] read(File f)throws Exception{try(InputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[2048];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toByteArray();}}
    private static void write(File f,byte[] bytes)throws Exception{try(OutputStream out=new FileOutputStream(f)){out.write(bytes);}}
    @Test public void encryptedAccountIsolationAndLockedAccess()throws Exception{
        Context ctx=InstrumentationRegistry.getInstrumentation().getTargetContext();String run=UUID.randomUUID().toString(),alias="timehut.synthetic-account-qa."+run;
        File dir=new File(ctx.getNoBackupFilesDir(),"synthetic-account-qa/"+run);assertTrue(dir.mkdirs());File file=new File(dir,"session.json");
        String a=UUID.randomUUID().toString(),b=UUID.randomUUID().toString(),tokenA="synthetic_a_"+UUID.randomUUID().toString().replace("-",""),tokenB="synthetic_b_"+UUID.randomUUID().toString().replace("-","");long expiry=System.currentTimeMillis()+3600000;
        AccountSessionStore store=new AccountSessionStore(file,alias);assertFalse(store.accountMode());store.activateVerified(a,tokenA,expiry,false);assertTrue(store.accountMode());assertEquals(tokenA,store.tokenForOwner(a));assertNull(store.tokenForOwner(b));
        String persisted=new String(read(file),StandardCharsets.UTF_8);assertFalse(persisted.contains(tokenA));assertFalse(store.bridgeStatus().toString().contains(tokenA));assertFalse(store.bridgeStatus().has("token"));
        AccountSessionStore reopened=new AccountSessionStore(file,alias);assertEquals(tokenA,reopened.tokenForOwner(a));
        boolean lockedProof=false;UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        try{if(Build.VERSION.SDK_INT>=36){
            device.sleep();PowerManager power=ctx.getSystemService(PowerManager.class);KeyguardManager keyguard=ctx.getSystemService(KeyguardManager.class);
            long deadline=android.os.SystemClock.elapsedRealtime()+15000;while((power.isInteractive()||!keyguard.isKeyguardLocked())&&android.os.SystemClock.elapsedRealtime()<deadline)Thread.sleep(100);
            assertFalse("Screen off before credential read",power.isInteractive());assertTrue("Keyguard locked before credential read",keyguard.isKeyguardLocked());
            assertEquals(tokenA,new AccountSessionStore(file,alias).tokenForOwner(a));assertFalse("Still screen off after read",power.isInteractive());assertTrue("Still keyguard locked after read",keyguard.isKeyguardLocked());lockedProof=true;
        }}
        finally{device.wakeUp();device.executeShellCommand("wm dismiss-keyguard");}
        reopened.activateVerified(b,tokenB,expiry,false);assertNull(reopened.tokenForOwner(a));assertEquals(tokenB,reopened.tokenForOwner(b));assertNull(store.tokenForOwner(a));assertEquals(b,store.currentOwner());assertFalse(new String(read(file),StandardCharsets.UTF_8).contains(tokenB));
        byte[] before=read(file);File missing=new File(dir,"missing-key.json");write(missing,before);try{new AccountSessionStore(missing,alias+".missing");fail("Missing key must reject preserved ciphertext");}catch(IOException expected){}assertArrayEquals(before,read(missing));
        JSONObject damaged=new JSONObject(new String(before,StandardCharsets.UTF_8));JSONObject sealed=damaged.getJSONObject("session");sealed.put("owner",a);File tampered=new File(dir,"tampered.json");write(tampered,damaged.toString().getBytes(StandardCharsets.UTF_8));byte[] tamperedBefore=read(tampered);try{new AccountSessionStore(tampered,alias);fail("Owner substitution must fail GCM authentication");}catch(IOException expected){}assertArrayEquals(tamperedBefore,read(tampered));
        File liveTampered=new File(dir,"live-tampered.json");write(liveTampered,before);AccountSessionStore liveHandle=new AccountSessionStore(liveTampered,alias);assertEquals(b,liveHandle.currentOwner());write(liveTampered,tamperedBefore);try{liveHandle.tokenForOwner(b);fail("Previously read credential cannot bypass current file authentication");}catch(IOException expected){}assertArrayEquals(tamperedBefore,read(liveTampered));
        AccountSessionStore shortLived=new AccountSessionStore(new File(dir,"expired.json"),alias);long shortExpiry=System.currentTimeMillis()+5000;shortLived.activateVerified(a,tokenA,shortExpiry,false);assertEquals(a,shortLived.currentOwner());long remaining=shortExpiry-System.currentTimeMillis();if(remaining>0)Thread.sleep(remaining+100);assertNull(shortLived.currentOwner());assertNull(shortLived.tokenForOwner(a));assertFalse(shortLived.bridgeStatus().getBoolean("authenticated"));
        reopened.signOut();assertTrue(reopened.accountMode());assertNull(reopened.tokenForOwner(b));assertNull(store.tokenForOwner(b));assertFalse(store.bridgeStatus().getBoolean("authenticated"));assertFalse(reopened.bridgeStatus().getBoolean("authenticated"));assertNull(new AccountSessionStore(file,alias).currentOwner());
        ExecutorService readers=Executors.newFixedThreadPool(4);try{java.util.List<Future<Boolean>> results=new java.util.ArrayList<>();for(int i=0;i<4;i++)results.add(readers.submit(()->{AccountSessionStore handle=new AccountSessionStore(file,alias);for(int j=0;j<20;j++)if(handle.tokenForOwner(a)!=null||handle.tokenForOwner(b)!=null||handle.bridgeStatus().getBoolean("authenticated"))return false;return true;}));for(Future<Boolean> result:results)assertTrue(result.get(20,TimeUnit.SECONDS));}finally{readers.shutdownNow();}
        for(String fault:new String[]{"write","sync","publish"}){
            File target=new File(dir,"fault-"+fault+".json");write(target,before);AccountSessionStore peer=new AccountSessionStore(target,alias);
            AccountSessionStore.CommitOps broken=new AccountSessionStore.CommitOps(){public void sync(FileOutputStream output)throws Exception{if(fault.equals("sync"))throw new IOException("Synthetic sync fault");output.getFD().sync();}public void finish(AtomicFile atomic,FileOutputStream output)throws Exception{if(fault.equals("publish")){output.close();return;}atomic.finishWrite(output);}};
            AccountSessionStore failing=new AccountSessionStore(target,alias,broken);if(fault.equals("write"))assertTrue(new File(target.getPath()+".intent").mkdir());
            try{failing.signOut();fail("Failed logout cannot acknowledge success");}catch(IOException expected){}
            try{peer.tokenForOwner(b);fail("All pre-opened handles must deny after commit failure");}catch(IOException expected){}
            try{new AccountSessionStore(target,alias);fail("Reopen cannot revive credential after unconfirmed logout");}catch(IOException expected){}
            File backup=new File(target.getPath()+".bak");assertTrue((target.isFile()&&java.util.Arrays.equals(before,read(target)))||(backup.isFile()&&java.util.Arrays.equals(before,read(backup))));assertTrue(new File(target.getPath()+".intent").exists());
        }
        File unresolved=new File(dir,"unresolved.json");write(unresolved,before);File pending=new File(unresolved.getPath()+".intent");write(pending,new byte[]{1,2,3});try{new AccountSessionStore(unresolved,alias);fail("Pending intent must block even first handle");}catch(IOException expected){}assertArrayEquals(before,read(unresolved));assertArrayEquals(new byte[]{1,2,3},read(pending));
        File capacityFile=new File(dir,"revocation-capacity.json");AccountSessionStore capacity=new AccountSessionStore(capacityFile,alias);String lastOwner=null;for(int i=0;i<24;i++){lastOwner=UUID.randomUUID().toString();capacity.activateVerified(lastOwner,"synthetic_capacity_"+UUID.randomUUID().toString().replace("-",""),expiry,false);}byte[] full=read(capacityFile);assertEquals(23,capacity.pendingRevocations().length());try{capacity.activateVerified(UUID.randomUUID().toString(),"synthetic_capacity_"+UUID.randomUUID().toString().replace("-",""),expiry,false);fail("Account switch must preserve final logout slot");}catch(IOException expected){}assertArrayEquals(full,read(capacityFile));assertEquals(lastOwner,capacity.currentOwner());capacity.signOut();assertNull(capacity.currentOwner());assertEquals(24,new AccountSessionStore(capacityFile,alias).pendingRevocations().length());
        JSONObject report=new JSONObject().put("status","PASS_NATIVE_KEYSTORE_ACCOUNT_STORAGE_ONLY").put("sdk",Build.VERSION.SDK_INT).put("tokensPlaintextPersisted",false).put("sameOwnerReopen",true).put("foreignOwnerDenied",true).put("ownerSwitchDeniesPreviousCredential",true).put("logoutPersistsClosedAccountMode",true).put("liveAndConcurrentHandlesFollowSwitchAndLogout",true).put("writeSyncPublishFailuresRejectSuccessAndReopen",true).put("failureOriginalBackupAndPendingBytesPreserved",true).put("missingKeyAndOwnerTamperPreserveBytes",true).put("lockedScreenCredentialRead",lockedProof).put("serverIdentityVerificationIntegrated",false).put("nativeJobsIntegrated",false).put("providerRequests",0).put("physicalPhone",false);
        report.put("alreadyReadCredentialReauthenticatesTamperedFile",true).put("alreadyReadCredentialExpiresWithoutReopen",true).put("fullPendingRevocationCapacityStillAllowsLocalLogout",true);
        write(new File(ctx.getFilesDir(),"account-qa-report.json"),report.toString(2).getBytes(StandardCharsets.UTF_8));
    }
}
