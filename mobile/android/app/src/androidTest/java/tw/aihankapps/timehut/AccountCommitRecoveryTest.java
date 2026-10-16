package tw.aihankapps.timehut;

import android.content.Context;
import android.os.Build;
import android.util.AtomicFile;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import static org.junit.Assert.*;

/** Synthetic files only; process-stage methods are invoked in separate runners. */
@RunWith(AndroidJUnit4.class)
public class AccountCommitRecoveryTest {
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    private static byte[] read(File f)throws Exception{return AccountCommitRecovery.read(f.getCanonicalFile());}
    private static void write(File f,byte[] b)throws Exception{try(FileOutputStream out=new FileOutputStream(f)){out.write(b);out.getFD().sync();}}
    private static String token(){return "synthetic_recovery_"+UUID.randomUUID().toString().replace("-","");}
    private static void copy(File from,File to)throws Exception{for(String suffix:new String[]{"",".intent",".intent.tmp",".new",".bak"}){File f=new File(from+suffix);if(f.exists())write(new File(to+suffix),read(f));}}
    private static void denied(File f,String alias)throws Exception{try{new AccountSessionStore(f,alias);fail("Ambiguous or unauthenticated recovery must deny");}catch(IOException expected){}}
    private static AccountSessionStore.CommitOps fault(String stage){return new AccountSessionStore.CommitOps(){
        public void sync(FileOutputStream out)throws Exception{out.getFD().sync();if(stage.equals("sync"))throw new IOException("Synthetic commit interruption");}
        public void finish(AtomicFile f,FileOutputStream out)throws Exception{if(stage.equals("publish")){out.close();return;}f.finishWrite(out);throw new IOException("Synthetic post-publish interruption");}
    };}
    private static File archive(File target){File[] found=target.getParentFile().listFiles(f->f.getName().startsWith(target.getName()+".preserved-"));assertNotNull(found);assertEquals(1,found.length);return found[0];}
    private static void copyTree(File from,File to)throws Exception{assertTrue(to.mkdirs());for(File f:Objects.requireNonNull(from.listFiles())){File next=new File(to,f.getName());if(f.isDirectory())copyTree(f,next);else write(next,read(f));}}
    @Test public void authenticatedInterruptedWritesRecoverClosedAndPreserveOriginals()throws Exception{
        String run=UUID.randomUUID().toString(),alias="timehut.recovery-qa."+run;File dir=new File(context.getNoBackupFilesDir(),"synthetic-recovery-qa/"+run);assertTrue(dir.mkdirs());
        String owner=UUID.randomUUID().toString(),next=UUID.randomUUID().toString(),a=token(),b=token();long expiry=System.currentTimeMillis()+3600000;
        File original=new File(dir,"healthy.json");AccountSessionStore healthy=new AccountSessionStore(original,alias);healthy.activateVerified(owner,a,expiry,false);byte[] before=read(original);
        int cases=0;
        for(String stage:new String[]{"sync","publish","published"}){
            File failed=new File(dir,"failed-"+stage);write(failed,before);AccountSessionStore live=new AccountSessionStore(failed,alias,fault(stage));try{live.activateVerified(next,b,expiry,false);fail("Interrupted write must reject success");}catch(IOException expected){}
            try{live.currentOwner();fail("Live authority must stay closed");}catch(IOException expected){}
            byte[] journal=read(new File(failed+".intent"));assertFalse(new String(journal,StandardCharsets.UTF_8).contains(a));assertFalse(new String(journal,StandardCharsets.UTF_8).contains(b));
            File fresh=new File(dir,"fresh-"+stage);copy(failed,fresh);AccountSessionStore recovered=new AccountSessionStore(fresh,alias);assertTrue(recovered.accountMode());assertNull(recovered.currentOwner());assertEquals(2,recovered.pendingRevocations().length());assertTrue(recovered.pendingRevocation(owner,a,AccountIdentity.BACKEND));assertTrue(recovered.pendingRevocation(next,b,AccountIdentity.BACKEND));assertArrayEquals(journal,read(new File(archive(fresh),"original.intent")));assertFalse(new File(fresh+".intent").exists());
            byte[] closed=read(fresh);try{recovered.activateVerified(owner,a,expiry,false);fail("Pending credentials cannot be revived");}catch(IOException expected){}assertArrayEquals(closed,read(fresh));assertFalse(new String(closed,StandardCharsets.UTF_8).contains(a));cases++;
        }
        File failed=new File(dir,"failed-sync"),staged=new File(dir,"staged-before-base");write(staged,before);write(new File(staged+".intent.tmp"),read(new File(failed+".intent")));AccountSessionStore stagedStore=new AccountSessionStore(staged,alias);assertNull(stagedStore.currentOwner());assertEquals(2,stagedStore.pendingRevocations().length());cases++;
        File partialPreparation=new File(dir,"partial-preparation");write(partialPreparation,before);byte[] partialBytes="{\"iv\":\"".getBytes(StandardCharsets.UTF_8);write(new File(partialPreparation+".intent.tmp"),partialBytes);AccountSessionStore partialStore=new AccountSessionStore(partialPreparation,alias);assertNull(partialStore.currentOwner());assertEquals(1,partialStore.pendingRevocations().length());assertArrayEquals(partialBytes,read(new File(archive(partialPreparation),"original.intent.tmp")));cases++;
        File partialLogin=new File(dir,"partial-first-login");write(partialLogin,new JSONObject().put("version",1).put("accountMode",true).toString().getBytes(StandardCharsets.UTF_8));write(new File(partialLogin+".intent.tmp"),partialBytes);AccountSessionStore partialLoginStore=new AccountSessionStore(partialLogin,alias);assertNull(partialLoginStore.currentOwner());assertEquals(0,partialLoginStore.pendingRevocations().length());cases++;
        File recoveredSource=new File(dir,"fresh-sync"),saved=archive(recoveredSource);byte[] closedSource=read(recoveredSource);
        for(String stop:new String[]{"plan-published","base-published","intent-removed","partial-plan","tampered-plan","changed-source"}){
            File phase=new File(dir,stop);assertTrue(phase.mkdir());File target=new File(phase,recoveredSource.getName());
            for(String suffix:new String[]{"",".intent",".intent.tmp",".new",".bak"}){File f=new File(saved,"original"+suffix);if(f.exists())write(new File(target+suffix),read(f));}
            if(stop.equals("partial-plan"))write(new File(target+".recovery.tmp"),new byte[]{9,8,7});
            else{copyTree(saved,new File(phase,saved.getName()));byte[] record=read(new File(saved,"recovery-record"));if(stop.equals("tampered-plan"))record[record.length/2]^=1;write(new File(target+".recovery"),record);}
            if(stop.equals("base-published")||stop.equals("intent-removed")){write(target,closedSource);write(new File(target+".recovered"),new byte[]{3});}
            if(stop.equals("intent-removed"))assertTrue(new File(target+".intent").delete());
            if(stop.equals("changed-source"))write(target,new byte[]{0,1,2});
            if(stop.equals("tampered-plan")||stop.equals("changed-source")){byte[] raw=read(target);denied(target,alias);assertArrayEquals(raw,read(target));}
            else{AccountSessionStore resumed=new AccountSessionStore(target,alias);assertNull(resumed.currentOwner());assertEquals(2,resumed.pendingRevocations().length());assertFalse(new File(target+".recovery").exists());}
            cases++;
        }
        File legacy=new File(dir,"legacy");write(legacy,before);byte[] digest=MessageDigest.getInstance("SHA-256").digest("unavailable-candidate".getBytes(StandardCharsets.UTF_8));write(new File(legacy+".intent"),digest);AccountSessionStore legacyStore=new AccountSessionStore(legacy,alias);assertNull(legacyStore.currentOwner());assertEquals(1,legacyStore.pendingRevocations().length());File preserved=archive(legacy);assertArrayEquals(before,read(new File(preserved,"original")));assertArrayEquals(digest,read(new File(preserved,"original.intent")));cases++;
        for(String kind:new String[]{"tampered","missing-key","ambiguous","legacy-corrupt"}){
            File target=new File(dir,kind);write(target,before);byte[] marker=read(new File(failed+".intent"));
            if(kind.equals("tampered"))marker[marker.length/2]^=1;
            if(kind.equals("ambiguous"))write(new File(target+".new"),new byte[]{7,8,9});
            if(kind.equals("legacy-corrupt"))marker=new byte[]{1,2,3};write(new File(target+".intent"),marker);
            denied(target,kind.equals("missing-key")?alias+".missing":alias);assertArrayEquals(before,read(target));assertArrayEquals(marker,read(new File(target+".intent")));cases++;
        }
        File full=new File(dir,"full");AccountSessionStore capacity=new AccountSessionStore(full,alias);for(int i=0;i<24;i++)capacity.activateVerified(UUID.randomUUID().toString(),token(),expiry,false);assertEquals(23,capacity.pendingRevocations().length());write(new File(full+".intent"),digest);File fullFresh=new File(dir,"full-fresh");copy(full,fullFresh);AccountSessionStore closedFull=new AccountSessionStore(fullFresh,alias);assertNull(closedFull.currentOwner());assertEquals(24,closedFull.pendingRevocations().length());cases++;
        JSONObject report=new JSONObject().put("status","PASS_SYNTHETIC_ACCOUNT_COMMIT_RECOVERY").put("sdk",Build.VERSION.SDK_INT).put("cases",cases).put("freshPathsModelProcessAuthority",true).put("actualProcessRestart",false).put("priorAndCandidateCredentialsRetired",true).put("legacyMissingCandidateClosesAccess",true).put("originalEncryptedBytesPreserved",true).put("missingKeyAndTamperDeny",true).put("fullCapacityRetained",24).put("providerRequests",0).put("physicalPhone",false);
        write(new File(context.getFilesDir(),"account-commit-recovery-report.json"),report.toString(2).getBytes(StandardCharsets.UTF_8));
    }
    @Test public void prepareInterruptedForNextProcess()throws Exception{
        String run=UUID.randomUUID().toString(),alias="timehut.recovery-process."+run;File dir=new File(context.getNoBackupFilesDir(),"synthetic-recovery-process/"+run);assertTrue(dir.mkdirs());File target=new File(dir,"session.json");AccountSessionStore store=new AccountSessionStore(target,alias);store.activateVerified(UUID.randomUUID().toString(),token(),System.currentTimeMillis()+3600000,false);
        AccountSessionStore failing=new AccountSessionStore(target,alias,fault("sync"));try{failing.signOut();fail("Must retain interrupted write");}catch(IOException expected){}
        JSONObject metadata=new JSONObject().put("file",target.getAbsolutePath()).put("alias",alias).put("preparationPid",android.os.Process.myPid());write(new File(context.getFilesDir(),"account-recovery-process-stage.json"),metadata.toString().getBytes(StandardCharsets.UTF_8));
    }
    @Test public void recoverInNextProcess()throws Exception{
        JSONObject metadata=new JSONObject(new String(read(new File(context.getFilesDir(),"account-recovery-process-stage.json")),StandardCharsets.UTF_8));assertNotEquals(metadata.getInt("preparationPid"),android.os.Process.myPid());File target=new File(metadata.getString("file"));byte[] marker=read(new File(target+".intent"));AccountSessionStore recovered=new AccountSessionStore(target,metadata.getString("alias"));assertNull(recovered.currentOwner());assertEquals(1,recovered.pendingRevocations().length());assertArrayEquals(marker,read(new File(archive(target),"original.intent")));
        JSONObject report=new JSONObject().put("status","PASS_COLD_PROCESS_ACCOUNT_COMMIT_RECOVERY").put("sdk",Build.VERSION.SDK_INT).put("actualProcessRestart",true).put("preparationPid",metadata.getInt("preparationPid")).put("recoveryPid",android.os.Process.myPid()).put("authenticated",false).put("pendingRevocations",1).put("originalEncryptedIntentPreserved",true).put("providerRequests",0);
        write(new File(context.getFilesDir(),"account-recovery-process-report.json"),report.toString(2).getBytes(StandardCharsets.UTF_8));
    }
    private static String sha(byte[] bytes)throws Exception{StringBuilder out=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();}
    @Test public void recoverPreviouslyDiagnosedLegacyAccount()throws Exception{
        assertTrue(Build.VERSION.SDK_INT>=36);File target=new File(context.getNoBackupFilesDir(),"accounts/session.json");byte[] prior=read(target),marker=read(new File(target+".intent"));
        assertEquals("bc5633997afa9bddcbe890153b56f879fe20eb810e78a2e80a8477f774ce1f51",sha(prior));assertEquals("325ffb26b6bc155242434ffac987530678830c801bf2a0896ba5d04c36f1a1f2",sha(marker));
        AccountSessionStore recovered=new AccountSessionStore(context);assertNull(recovered.currentOwner());assertTrue(recovered.accountMode());assertTrue(recovered.pendingRevocations().length()>0);File saved=archive(target);assertArrayEquals(prior,read(new File(saved,"original")));assertArrayEquals(marker,read(new File(saved,"original.intent")));
        JSONObject report=new JSONObject().put("status","PASS_PREVIOUSLY_DIAGNOSED_LEGACY_ACCOUNT_RECOVERY").put("sdk",Build.VERSION.SDK_INT).put("sourceSHA256",sha(prior)).put("markerSHA256",sha(marker)).put("preservedDirectory",saved.getName()).put("authenticated",false).put("pendingRevocations",recovered.pendingRevocations().length()).put("originalEncryptedBytesPreserved",true).put("providerRequests",0).put("physicalPhone",false);
        write(new File(context.getFilesDir(),"account-recovery-existing-report.json"),report.toString(2).getBytes(StandardCharsets.UTF_8));
    }
}
