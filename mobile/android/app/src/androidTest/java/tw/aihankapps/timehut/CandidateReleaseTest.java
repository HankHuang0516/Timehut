package tw.aihankapps.timehut;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import static org.junit.Assert.*;

/** Release-variant checks: no Activity, login, remote I/O or existing-data reset. */
public class CandidateReleaseTest {
    private static Context context(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}
    private static long installedVersion()throws Exception{android.content.pm.PackageInfo info=context().getPackageManager().getPackageInfo(context().getPackageName(),0);return android.os.Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode;}
    private static void report(JSONObject value)throws Exception{Bundle result=new Bundle();result.putString("timehutReport",value.toString());InstrumentationRegistry.getInstrumentation().sendStatus(0,result);}
    private static void write(File target,String value)throws Exception{try(FileOutputStream out=new FileOutputStream(target)){out.write(value.getBytes(StandardCharsets.UTF_8));out.getFD().sync();}}
    private static String sha(File file)throws Exception{MessageDigest hash=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))!=-1)hash.update(bytes,0,n);}StringBuilder hex=new StringBuilder();for(byte b:hash.digest())hex.append(String.format(Locale.ROOT,"%02x",b&255));return hex.toString();}
    private static void collect(File root,File item,JSONObject hashes,long[] size)throws Exception{if(!item.exists())return;if(item.isDirectory()){File[] files=item.listFiles();assertNotNull(files);for(File file:files)collect(root,file,hashes,size);}else{assertTrue(item.getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator));size[0]+=item.length();assertTrue("Bounded retained transfer-data inspection",size[0]<=256L*1024*1024);hashes.put(item.getAbsolutePath().substring(root.getAbsolutePath().length()+1),sha(item));}}
    private static File snapshot(){return new File(context().getFilesDir(),"installer65-retained-transfer-snapshot.json");}
    private static File upgrade68Snapshot(){return new File(context().getFilesDir(),"installer68-retained-owned-data-snapshot.json");}
    private static File upgrade71Snapshot(){return new File(context().getFilesDir(),"installer71-retained-owned-data-snapshot.json");}
    private static String textHash(String value)throws Exception{StringBuilder out=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)))out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    @Test public void captureKnown68DataAndPendingCredentialBefore71()throws Exception{
        assertEquals("tw.aihankapps.timehut.testing",context().getPackageName());assertTrue(installedVersion()==68||installedVersion()==69);assertFalse("Prior migration checkpoint preserved",upgrade71Snapshot().exists());
        File global=new File(context().getNoBackupFilesDir(),"accounts/session.json");if(global.exists()){JSONObject state=new JSONObject(new String(java.nio.file.Files.readAllBytes(global.toPath()),StandardCharsets.UTF_8));assertFalse("Existing active global credential preserved",state.has("session"));assertFalse("Existing global pending credentials preserved",state.has("revocations"));assertFalse("Existing global login receipts preserved",state.has("nativeLogins"));}for(String suffix:new String[]{".intent",".intent.tmp",".new",".bak",".recovery",".recovery.tmp"})assertFalse("Unconfirmed global write preserved",new File(global+suffix).exists());
        File root=context().getNoBackupFilesDir(),fixture=new File(root,"upgrade71-fixture");assertFalse("Existing fixture preserved",fixture.exists());assertTrue(fixture.mkdir());File file=new File(fixture,"session.json");String alias="timehut.upgrade71.fixture."+UUID.randomUUID(),owner=UUID.randomUUID().toString(),token="synthetic_upgrade71_"+UUID.randomUUID().toString().replace("-","");long expires=System.currentTimeMillis()+3600000;
        AccountSessionStore store=new AccountSessionStore(file,alias);store.activateVerified(owner,token,expires,false);store.signOut();assertEquals(1,new JSONObject(new String(java.nio.file.Files.readAllBytes(file.toPath()),StandardCharsets.UTF_8)).getInt("version"));assertEquals(1,store.pendingRevocations().length());assertNull(store.currentOwner());
        JSONObject hashes=new JSONObject();long[] size={0};for(String name:new String[]{"transfers","accounts","upgrade71-fixture"})collect(root,new File(root,name),hashes,size);
        write(upgrade71Snapshot(),new JSONObject().put("files",hashes).put("alias",alias).put("owner",owner).put("tokenHash",textHash(token)).put("expiresAt",expires).put("issuer",AccountIdentity.BACKEND).toString());
        report(new JSONObject().put("status","PASS_KNOWN68_AND_SYNTHETIC_PENDING_CAPTURE").put("fromVersion",installedVersion()).put("files",hashes.length()).put("bytes",size[0]).put("pendingCredential",1).put("syntheticCustomStore",true).put("rawDataExported",false).put("providerRequests",0));
    }
    @Test public void upgraded71PreservesBytesAndMigratesPendingSchema1()throws Exception{
        assertEquals(71,installedVersion());assertFalse(BuildConfig.DEBUG);JSONObject saved=new JSONObject(new String(java.nio.file.Files.readAllBytes(upgrade71Snapshot().toPath()),StandardCharsets.UTF_8)),before=saved.getJSONObject("files"),after=new JSONObject();long[] size={0};File root=context().getNoBackupFilesDir();for(String name:new String[]{"transfers","accounts","upgrade71-fixture"})collect(root,new File(root,name),after,size);assertEquals(before.length(),after.length());for(Iterator<String> keys=before.keys();keys.hasNext();){String name=keys.next();assertEquals(before.getString(name),after.getString(name));}
        File file=new File(root,"upgrade71-fixture/session.json");String oldHash=sha(file);AccountSessionStore store=new AccountSessionStore(file,saved.getString("alias"));JSONObject row=store.pendingRevocations().getJSONObject(0);assertEquals(saved.getString("owner"),row.getString("owner"));assertEquals(saved.getString("tokenHash"),textHash(row.getString("token")));assertEquals(saved.getLong("expiresAt"),row.getLong("expiresAt"));assertEquals(saved.getString("issuer"),row.getString("issuer"));assertEquals(oldHash,sha(file));
        JSONObject admission=store.beginLogin(AccountIdentity.BACKEND,store.bridgeStatus().getString("generation"));store.abortLogin(admission.getString("id"));assertEquals(2,new JSONObject(new String(java.nio.file.Files.readAllBytes(file.toPath()),StandardCharsets.UTF_8)).getInt("version"));AccountSessionStore reopened=new AccountSessionStore(file,saved.getString("alias"));assertEquals(1,reopened.pendingRevocations().length());assertEquals(saved.getString("tokenHash"),textHash(reopened.pendingRevocations().getJSONObject(0).getString("token")));assertEquals(1,reopened.nativeCancellations().length());assertNull(reopened.currentOwner());
        report(new JSONObject().put("status","PASS_ACTUAL71_UPGRADE_SCHEMA2_PENDING_PRESERVATION").put("filesPreservedBeforeExplicitMigration",before.length()).put("bytes",size[0]).put("oldPendingCredentialPreserved",true).put("oldKeyReadableAfterSameSignerUpgrade",true).put("schema1To2",true).put("syntheticCustomStore",true).put("activeCustomerTaskMigration",false).put("rawDataExported",false).put("dataCleared",false).put("providerRequests",0));
    }
    @Test public void nonDebug71RejectsLegacyCredentialSettersSynchronously()throws Exception{
        assertEquals(71,installedVersion());assertFalse(BuildConfig.DEBUG);assertEquals(0,context().getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE);
        class Capture extends com.getcapacitor.PluginCall {String rejection;boolean resolved;Capture(String method){super(null,"TimehutTransfer","synthetic-rejection",method,new com.getcapacitor.JSObject());}@Override public void reject(String value){rejection=value;}@Override public void resolve(){resolved=true;}@Override public void resolve(com.getcapacitor.JSObject value){resolved=true;}}
        TransferPlugin plugin=new TransferPlugin();Capture set=new Capture("setAccountSession"),clear=new Capture("clearAccountSession");plugin.setAccountSession(set);plugin.clearAccountSession(clear);assertEquals("請使用我的帳戶登入",set.rejection);assertEquals("請使用我的帳戶登出",clear.rejection);assertFalse(set.resolved);assertFalse(clear.resolved);
        report(new JSONObject().put("status","PASS_NONDEBUG71_LEGACY_SETTERS_REJECTED").put("synchronousNativeRejection",true).put("debuggable",false).put("activityLaunched",false).put("providerRequests",0));
    }
    @Test public void captureKnownCandidateDataBefore68Upgrade()throws Exception{
        assertEquals("tw.aihankapps.timehut.testing",context().getPackageName());
        assertTrue(installedVersion()==56||installedVersion()==65);assertFalse(upgrade68Snapshot().exists());
        File root=context().getNoBackupFilesDir();JSONObject hashes=new JSONObject();long[] size={0};
        for(String name:new String[]{"transfers","accounts"})collect(root,new File(root,name),hashes,size);
        write(upgrade68Snapshot(),hashes.toString());report(new JSONObject().put("status","PASS_KNOWN_CANDIDATE_DATA_CAPTURE").put("fromVersion",installedVersion()).put("files",hashes.length()).put("bytes",size[0]).put("rawDataExported",false));
    }
    @Test public void upgraded68PreservesKnownAccountAndTransferBytes()throws Exception{
        assertEquals(68,installedVersion());JSONObject before=new JSONObject(new String(java.nio.file.Files.readAllBytes(upgrade68Snapshot().toPath()),StandardCharsets.UTF_8)),after=new JSONObject();long[] size={0};File root=context().getNoBackupFilesDir();
        for(String name:new String[]{"transfers","accounts"})collect(root,new File(root,name),after,size);
        assertEquals(before.length(),after.length());for(Iterator<String> keys=before.keys();keys.hasNext();){String name=keys.next();assertEquals(before.getString(name),after.getString(name));}
        report(new JSONObject().put("status","PASS_UPGRADE68_ACCOUNT_TRANSFER_BYTES").put("files",after.length()).put("bytes",size[0]).put("dataCleared",false).put("rawDataExported",false).put("scope","Exact installed bytes before Activity; not a nonempty active-task migration claim"));
    }
    @Test public void captureLegacyTransferBytesBeforeUpgrade()throws Exception{
        assertEquals("tw.aihankapps.timehut.testing",context().getPackageName());assertEquals(56,installedVersion());assertFalse(snapshot().exists());
        File root=context().getNoBackupFilesDir();JSONObject hashes=new JSONObject();long[] size={0};collect(root,new File(root,"transfers"),hashes,size);write(snapshot(),hashes.toString());report(new JSONObject().put("status","PASS_LEGACY_TRANSFER_SNAPSHOT_CAPTURE").put("files",hashes.length()).put("bytes",size[0]).put("rawDataExported",false));
    }
    @Test public void upgradedInstallPreservesLegacyTransferBytes()throws Exception{
        assertEquals(65,installedVersion());JSONObject before=new JSONObject(new String(java.nio.file.Files.readAllBytes(snapshot().toPath()),StandardCharsets.UTF_8)),after=new JSONObject();long[] size={0};File root=context().getNoBackupFilesDir();collect(root,new File(root,"transfers"),after,size);assertEquals(before.length(),after.length());for(Iterator<String> keys=before.keys();keys.hasNext();){String name=keys.next();assertEquals(before.getString(name),after.getString(name));}report(new JSONObject().put("status","PASS_UPGRADE_RETAINED_TRANSFER_BYTES").put("files",after.length()).put("bytes",size[0]).put("dataCleared",false).put("scope","Install-r preservation before Activity/engine; no legacy owner adoption claim"));
    }
    @Test public void coldEngineClosesLegacyAccessBeforeAnyActivity()throws Exception{
        assertFalse(BuildConfig.DEBUG);assertEquals(0,context().getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE);File root=new File(context().getCacheDir(),"release-cold-"+UUID.randomUUID());assertTrue(root.mkdirs());File transfers=new File(root,"transfers");assertTrue(transfers.mkdir());File original=new File(transfers,"synthetic-original.png");write(original,"synthetic original preserved; never sent");String originalHash=sha(original),id=UUID.randomUUID().toString();
        JSONObject row=new JSONObject().put("id",id).put("direction","upload").put("filename","synthetic-original.png").put("mediaType","image/png").put("stage","queued").put("createdAt",System.currentTimeMillis()).put("byteSize",original.length()).put("bytesTransferred",0).put("sourceReference",original.getAbsolutePath()).put("endpoint",AccountIdentity.BACKEND).put("clientUploadId","synthetic-upgrade-"+id).put("localId","synthetic-retained-receipt");write(new File(transfers,"tasks.json"),new JSONObject().put(id,row).toString());
        Context isolated=new ContextWrapper(context()){@Override public Context getApplicationContext(){return this;}@Override public File getNoBackupFilesDir(){return root;}};
        TransferEngine.initialize(isolated);assertTrue(TransferEngine.accounts().accountMode());assertNull(TransferEngine.accounts().currentOwner());assertEquals(0,TransferEngine.visibleTasks().length());JSONObject kept=TransferEngine.get(id);assertNotNull(kept);assertEquals(row.getString("clientUploadId"),kept.getString("clientUploadId"));assertEquals(row.getString("localId"),kept.getString("localId"));assertEquals("",kept.optString("ownerUserId"));assertFalse(TransferEngine.visible(kept));assertFalse(kept.optBoolean("legacyOwnerAdopted"));assertEquals(originalHash,sha(original));
        try{TransferEngine.ownedTask(id);fail("Unconfirmed legacy task must remain unavailable");}catch(IOException expected){}
        assertTrue(new File(root,"accounts/session.json").isFile());report(new JSONObject().put("status","PASS_NONDEBUG_COLD_ENGINE_ACCOUNT_GATE").put("beforeActivity",true).put("accountModeRequired",true).put("legacyOriginalAndReceiptPreserved",true).put("unconfirmedOwnerCannotSeeOrAdopt",true).put("providerRequests",0).put("scope","Real nondebug engine with isolated synthetic legacy files, no OS dispatch or real provider proof"));
    }
    @Test public void packagedReleaseRejectsDebugOrigins()throws Exception{
        assertFalse(BuildConfig.DEBUG);assertEquals(0,context().getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE);assertTrue(AccountIdentity.allowedBackend(AccountIdentity.BACKEND));String before=AccountClient.testBackend;try{AccountClient.testBackend="http://127.0.0.1:1";assertEquals(AccountIdentity.BACKEND,AccountClient.defaultBackend());}finally{AccountClient.testBackend=before;}
        for(String endpoint:new String[]{"http://127.0.0.1:1","http://localhost:1","http://10.0.2.2:1","https://example.invalid","https://just-healing-production.up.railway.app.evil.invalid"}){assertFalse(TransferEngine.debugEndpoint(endpoint));assertFalse(AccountIdentity.allowedBackend(endpoint));}
        for(String file:new String[]{"account.html","transfer.html","offline.html"})try(InputStream in=context().getAssets().open("public/"+file)){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] chunk=new byte[4096];int n;while((n=in.read(chunk))!=-1)bytes.write(chunk,0,n);String html=bytes.toString("UTF-8");assertTrue(html.contains("favicon.png"));assertTrue(html.indexOf("js/capacitor-core.js")<html.indexOf("js/account-config.js")||!html.contains("js/account-config.js"));assertFalse(html.contains("src=\"js/config.js\""));}
        try{context().getAssets().open("public/js/config.js");fail("Private config must not be packaged");}catch(FileNotFoundException expected){}
        report(new JSONObject().put("status","PASS_ACTUAL_RELEASE_ORIGIN_AND_ASSET_GUARDS").put("debuggable",false).put("loopbackAndBackendOverrideRefused",true).put("privateConfigAbsent",true).put("providerRequests",0));
    }
}
