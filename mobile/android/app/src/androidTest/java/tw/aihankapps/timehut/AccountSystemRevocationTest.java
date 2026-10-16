package tw.aihankapps.timehut;

import android.content.Context;
import android.app.job.*;
import android.content.ComponentName;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.HashSet;
import java.util.Set;
import static org.junit.Assert.*;

/** Cross-process OS job tests use only an external synthetic loopback server. */
@RunWith(AndroidJUnit4.class)
public class AccountSystemRevocationTest {
    private Context context;
    private void initialize(){context=InstrumentationRegistry.getInstrumentation().getTargetContext();assertTrue(BuildConfig.DEBUG);assertTrue(java.util.Arrays.asList("tw.aihankapps.timehut.accountqa","tw.aihankapps.timehut.accountqa67").contains(context.getPackageName()));TransferEngine.initialize(context);}
    private String sha(byte[] bytes)throws Exception{StringBuilder text=new StringBuilder();for(byte value:MessageDigest.getInstance("SHA-256").digest(bytes))text.append(String.format("%02x",value&255));return text.toString();}
    private byte[] read(File file)throws Exception{try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toByteArray();}}
    private void write(String name,JSONObject value)throws Exception{try(OutputStream out=new FileOutputStream(new File(context.getFilesDir(),name))){out.write(value.toString(2).getBytes(StandardCharsets.UTF_8));}}
    private JSONObject proof()throws Exception{return new JSONObject(new String(read(new File(context.getFilesDir(),"system-revocation-start.json")),StandardCharsets.UTF_8));}
    private void requireSynthetic(String token,String issuer)throws Exception{URL url=new URL(issuer);assertTrue(token.startsWith("synthetic_"));assertEquals("http",url.getProtocol());assertEquals("127.0.0.1",url.getHost());assertTrue(url.getPort()>1024);}
    private boolean pending(String owner)throws Exception{JSONArray rows=TransferEngine.accounts().pendingRevocations();for(int i=0;i<rows.length();i++)if(owner.equals(rows.getJSONObject(i).getString("owner")))return true;return false;}
    private void requireLoopback(String issuer)throws Exception{URL url=new URL(issuer);assertEquals("http",url.getProtocol());assertEquals("127.0.0.1",url.getHost());assertTrue(url.getPort()>1024);}
    private String receiptFingerprint(JSONObject row)throws Exception{return sha(new JSONArray().put(row.getString("owner")).put(row.getString("issuer")).put(row.getString("token")).put(row.getLong("expiresAt")).toString().getBytes(StandardCharsets.UTF_8));}
    private JSONObject baseline()throws Exception{return new JSONObject(new String(read(new File(context.getFilesDir(),"system-revocation-baseline.json")),StandardCharsets.UTF_8));}
    private void verifyProtected(boolean originalPending)throws Exception{
        JSONObject prior=baseline();Set<String> expected=new HashSet<>(),actual=new HashSet<>();JSONArray protectedRows=prior.getJSONArray("protectedReceipts");for(int i=0;i<protectedRows.length();i++)assertTrue(expected.add(protectedRows.getJSONObject(i).getString("sha256")));
        if(originalPending)expected.add(proof().getString("aReceiptSHA256"));JSONArray rows=TransferEngine.accounts().pendingRevocations();for(int i=0;i<rows.length();i++)assertTrue(actual.add(receiptFingerprint(rows.getJSONObject(i))));assertEquals("Only the new fixture's original A receipt may change",expected,actual);
        JSONObject taskOwners=prior.getJSONObject("taskOwners");for(java.util.Iterator<String> keys=taskOwners.keys();keys.hasNext();){String id=keys.next();JSONObject task=TransferEngine.get(id);assertNotNull("Earlier task must remain",task);assertEquals(taskOwners.getString(id),task.optString("ownerUserId"));}
    }
    @Test public void captureRetainedBaselineAndCloseLocalAccess()throws Exception{
        initialize();synchronized(TransferEngine.accountBoundary()){
            AccountSessionStore store=TransferEngine.accounts();JSONArray pending=store.pendingRevocations();for(int i=0;i<pending.length();i++)requireLoopback(pending.getJSONObject(i).getString("issuer"));String issuer=store.issuerOrigin();if(issuer!=null)requireLoopback(issuer);
            File archive=new File(context.getNoBackupFilesDir(),"system-revocation-before/"+UUID.randomUUID());assertTrue(archive.mkdirs());File original=new File(context.getNoBackupFilesDir(),"accounts/session.json");byte[] bytes=read(original);File saved=new File(archive,"session-original-encrypted.json");try(FileOutputStream out=new FileOutputStream(saved)){out.write(bytes);out.getFD().sync();}assertArrayEquals(bytes,read(saved));
            // Closing prior local access only retires its credential; it never
            // acknowledges any old issuer or clears an unknown receipt.
            if(issuer!=null){store.signOut();TransferEngine.accountChanged();}
            JSONArray protectedRows=new JSONArray();pending=store.pendingRevocations();assertTrue("Reserve room for A logout plus active B",pending.length()<=22);for(int i=0;i<pending.length();i++){JSONObject row=pending.getJSONObject(i);protectedRows.put(new JSONObject().put("owner",row.getString("owner")).put("issuer",row.getString("issuer")).put("sha256",receiptFingerprint(row)));}
            JSONObject owners=new JSONObject();JSONArray all=TransferEngine.list();for(int i=0;i<all.length();i++){JSONObject task=all.getJSONObject(i);owners.put(task.getString("id"),task.optString("ownerUserId"));}
            write("system-revocation-baseline.json",new JSONObject().put("status","CAPTURED_RETAINED_BASELINE").put("protectedReceipts",protectedRows).put("taskOwners",owners).put("encryptedOriginalSHA256",sha(bytes)).put("encryptedOriginalArchive",archive.getName()).put("priorLocalAccessClosed",true).put("unknownReceiptsAcknowledged",false));
        }
    }
    @Test public void retirePriorSyntheticActiveBeforeFixtureCleanup()throws Exception{
        initialize();AccountSessionStore store=TransferEngine.accounts();for(int i=0;i<store.pendingRevocations().length();i++){JSONObject row=store.pendingRevocations().getJSONObject(i);requireSynthetic(row.getString("token"),row.getString("issuer"));}
        String active=store.currentOwner();if(active!=null){requireSynthetic(store.tokenForOwner(active),store.issuerOrigin());File backup=new File(context.getNoBackupFilesDir(),"system-revocation-before/"+UUID.randomUUID()+".encrypted.json");assertTrue(backup.getParentFile().isDirectory()||backup.getParentFile().mkdirs());try(OutputStream out=new FileOutputStream(backup)){out.write(read(new File(context.getNoBackupFilesDir(),"accounts/session.json")));}synchronized(TransferEngine.accountBoundary()){store.signOut();TransferEngine.accountChanged();}}
        context.getSystemService(JobScheduler.class).cancel(AccountRevocationJobService.JOB_ID);
        JSONArray retired=new JSONArray();JSONArray pending=store.pendingRevocations();for(int i=0;i<pending.length();i++){JSONObject row=pending.getJSONObject(i);retired.put(new JSONObject().put("issuer",row.getString("issuer")).put("systemFixture",row.getString("token").startsWith("synthetic_system_")));}write("system-revocation-retired-issuers.json",new JSONObject().put("issuers",retired));
    }
    @Test public void prepareOfflineLogoutThenDifferentActiveOwner()throws Exception{
        initialize();String backend=InstrumentationRegistry.getArguments().getString("backend");assertNotNull(backend);requireLoopback(backend);verifyProtected(false);JSONArray old=baseline().getJSONArray("protectedReceipts");for(int i=0;i<old.length();i++)assertNotEquals("Fresh fixture must not reuse an old issuer",backend,old.getJSONObject(i).getString("issuer"));
        boolean networkLoss="true".equals(InstrumentationRegistry.getArguments().getString("networkLoss","false"));android.net.ConnectivityManager cm=context.getSystemService(android.net.ConnectivityManager.class);android.net.Network network=cm.getActiveNetwork();android.net.NetworkCapabilities caps=network==null?null:cm.getNetworkCapabilities(network);boolean internet=caps!=null&&caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET);if(networkLoss)assertFalse("Real default Internet network must be unavailable before local logout",internet);
        JSONObject a=AccountClient.signIn(backend,"synthetic-system-alpha","artificial-native-secret","Artificial A",true);String ownerA=a.getJSONObject("user").getString("id"),ta=TransferEngine.accounts().tokenForOwner(ownerA);requireSynthetic(ta,backend);
        JSONObject receipt=TransferEngine.newRecord("upload","synthetic-system-kept.png","photo");byte[] original="synthetic-system-original-must-stay".getBytes(StandardCharsets.UTF_8);File file=TransferEngine.file(receipt.getString("id")+"-source");try(OutputStream out=new FileOutputStream(file)){out.write(original);}receipt.put("stage","completed").put("flickrPhotoId","900000000801").put("serverReceiptId","synthetic-system-receipt").put("endpoint",backend).put("sourceReference",file.getAbsolutePath()).put("tags","synthetic-system-revocation-only");TransferEngine.put(receipt);
        JSONObject logout=AccountClient.signOut();assertTrue(logout.getBoolean("signedOut"));assertFalse(logout.getBoolean("serverConfirmed"));assertTrue(logout.getBoolean("systemRetryScheduled"));assertNull(TransferEngine.accounts().currentOwner());assertTrue(pending(ownerA));
        JSONObject b=AccountClient.signIn(backend,"synthetic-system-bravo","artificial-native-secret","Artificial B",true);String ownerB=b.getJSONObject("user").getString("id"),tb=TransferEngine.accounts().tokenForOwner(ownerB);requireSynthetic(tb,backend);assertNotEquals(ownerA,ownerB);assertTrue(pending(ownerA));
        JobInfo job=context.getSystemService(JobScheduler.class).getPendingJob(AccountRevocationJobService.JOB_ID);assertNotNull(job);assertTrue(job.isPersisted());assertEquals(JobInfo.NETWORK_TYPE_ANY,job.getNetworkType());assertEquals(1,job.getExtras().keySet().size());assertTrue(job.getExtras().containsKey("armId"));assertFalse(job.getExtras().toString().contains(ta));assertFalse(job.getExtras().toString().contains(tb));
        String disk=new String(read(new File(context.getNoBackupFilesDir(),"accounts/session.json")),StandardCharsets.UTF_8);assertFalse(disk.contains(ta));assertFalse(disk.contains(tb));JSONObject retiredA=new JSONObject().put("owner",ownerA).put("issuer",backend).put("token",ta).put("expiresAt",a.getLong("expiresAt"));write("system-revocation-start.json",new JSONObject().put("ownerA",ownerA).put("ownerB",ownerB).put("aReceiptSHA256",receiptFingerprint(retiredA)).put("bTokenSHA256",sha(tb.getBytes(StandardCharsets.UTF_8))).put("taskId",receipt.getString("id")).put("originalPath",file.getAbsolutePath()).put("originalSHA256",sha(original)).put("initialPID",android.os.Process.myPid()).put("jobId",AccountRevocationJobService.JOB_ID).put("defaultInternetAvailableAtLogout",internet).put("requestedExpedited",android.os.Build.VERSION.SDK_INT>=31&&job.isExpedited()).put("encrypted",true).put("jobExtrasContainNoCredentials",true));verifyProtected(true);
    }
    private void verify(boolean stillPending)throws Exception{
        initialize();JSONObject start=proof();assertEquals(stillPending,pending(start.getString("ownerA")));assertEquals(start.getString("ownerB"),TransferEngine.accounts().currentOwner());assertEquals(start.getString("bTokenSHA256"),sha(TransferEngine.accounts().tokenForOwner(start.getString("ownerB")).getBytes(StandardCharsets.UTF_8)));JSONObject task=TransferEngine.get(start.getString("taskId"));assertEquals("completed",task.getString("stage"));assertEquals(start.getString("ownerA"),task.getString("ownerUserId"));assertEquals("synthetic-system-receipt",task.getString("serverReceiptId"));assertEquals(start.getString("originalSHA256"),sha(read(new File(start.getString("originalPath")))));
        verifyProtected(stillPending);write(stillPending?"system-revocation-wrong-ack.json":"system-revocation-report.json",new JSONObject().put("status",stillPending?"PASS_SYSTEM_WRONG_ACK_KEEPS_PENDING_AND_B":"PASS_SYSTEM_AUTO_REVOCATION_AFTER_PROCESS_DEATH").put("pid",android.os.Process.myPid()).put("pendingOriginal",stillPending).put("newOwnerAndCredentialPreserved",true).put("protectedEarlierReceiptCount",baseline().getJSONArray("protectedReceipts").length()).put("protectedEarlierReceiptsAndTaskOwnersUnchanged",true).put("completedOriginalAndReceiptPreserved",true).put("providerRequests",0).put("physicalPhone",false));
    }
    @Test public void verifyWrongAckKeepsPendingAndNewOwner()throws Exception{verify(true);assertTrue(TransferEngine.accounts().systemRevocationsScheduled());}
    @Test public void verifySuccessfulJobClearsOnlyOriginal()throws Exception{verify(false);}
    @Test public void schedulerConflictStillAllowsLocalLogout()throws Exception{
        initialize();assertEquals(0,TransferEngine.accounts().pendingRevocations().length());JobScheduler scheduler=context.getSystemService(JobScheduler.class);JobInfo old=scheduler.getPendingJob(AccountRevocationJobService.JOB_ID);assertNull("Finished empty job must be removed before this control",old);ComponentName artificial=new ComponentName(context,TransferJobService.class);JobInfo collision=new JobInfo.Builder(AccountRevocationJobService.JOB_ID,artificial).setMinimumLatency(600000).build();assertEquals(JobScheduler.RESULT_SUCCESS,scheduler.schedule(collision));
        try{String owner=TransferEngine.accounts().currentOwner();assertNotNull(owner);synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().signOut();TransferEngine.accountChanged();}assertNull(TransferEngine.accounts().currentOwner());assertTrue(pending(owner));assertEquals(artificial,scheduler.getPendingJob(AccountRevocationJobService.JOB_ID).getService());write("system-revocation-scheduler-failure.json",new JSONObject().put("status","PASS_SCHEDULER_CONFLICT_PRESERVES_JOB_AND_CLOSES_LOCAL_ACCOUNT").put("encryptedPendingPreserved",true).put("unknownJobNotReplaced",true));}finally{JobInfo job=scheduler.getPendingJob(AccountRevocationJobService.JOB_ID);if(job!=null&&artificial.equals(job.getService()))scheduler.cancel(AccountRevocationJobService.JOB_ID);TransferEngine.accounts().ensureSystemRevocations();assertTrue(TransferEngine.accounts().systemRevocationsScheduled()||TransferEngine.accounts().pendingRevocations().length()==0);String backend=InstrumentationRegistry.getArguments().getString("backend");assertTrue(AccountClient.drainRevocation(backend));assertEquals(0,TransferEngine.accounts().pendingRevocations().length());scheduler.cancel(AccountRevocationJobService.JOB_ID);}
    }
    @Test public void cleanOnlyThisSyntheticFixtureAfterNegativeProof()throws Exception{
        initialize();String backend=InstrumentationRegistry.getArguments().getString("backend");assertNotNull(backend);JSONArray rows=TransferEngine.accounts().pendingRevocations();for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);requireSynthetic(row.getString("token"),row.getString("issuer"));assertEquals(backend,row.getString("issuer"));}
        String active=TransferEngine.accounts().currentOwner();if(active!=null){requireSynthetic(TransferEngine.accounts().tokenForOwner(active),TransferEngine.accounts().issuerOrigin());assertEquals(backend,TransferEngine.accounts().issuerOrigin());AccountClient.signOut();}
        for(int i=0;i<24&&TransferEngine.accounts().pendingRevocations().length()>0;i++)assertTrue(AccountClient.drainRevocation(backend));assertEquals(0,TransferEngine.accounts().pendingRevocations().length());context.getSystemService(JobScheduler.class).cancel(AccountRevocationJobService.JOB_ID);
    }
    @Test public void cleanOwnedFixtureKeepRetainedBaseline()throws Exception{
        initialize();String backend=InstrumentationRegistry.getArguments().getString("backend");requireLoopback(backend);JSONObject start=proof();String active=TransferEngine.accounts().currentOwner();assertEquals(start.getString("ownerB"),active);assertEquals(backend,TransferEngine.accounts().issuerOrigin());requireSynthetic(TransferEngine.accounts().tokenForOwner(active),backend);AccountClient.signOut();
        for(int i=0;i<24;i++){boolean own=false;JSONArray rows=TransferEngine.accounts().pendingRevocations();for(int j=0;j<rows.length();j++)if(backend.equals(rows.getJSONObject(j).getString("issuer")))own=true;if(!own)break;assertTrue(AccountClient.drainRevocation(backend));}
        verifyProtected(false);assertNull(TransferEngine.accounts().currentOwner());if(TransferEngine.accounts().pendingRevocations().length()==0)context.getSystemService(JobScheduler.class).cancel(AccountRevocationJobService.JOB_ID);
        write("system-revocation-owned-cleanup.json",new JSONObject().put("status","PASS_OWNED_FIXTURE_CLOSED_RETAINED_BASELINE_UNCHANGED").put("protectedEarlierReceiptCount",baseline().getJSONArray("protectedReceipts").length()).put("unknownReceiptsAcknowledged",false).put("globalJobCancelled",TransferEngine.accounts().pendingRevocations().length()==0).put("providerRequests",0));
    }
}
