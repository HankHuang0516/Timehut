package tw.aihankapps.timehut;

import android.content.Context;
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

/** Known71 to73: preserve real test-install bytes and old encrypted receipts. */
public class CandidateUpgrade73Test {
    private static Context context(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}
    private static long version()throws Exception{android.content.pm.PackageInfo p=context().getPackageManager().getPackageInfo(context().getPackageName(),0);return android.os.Build.VERSION.SDK_INT>=28?p.getLongVersionCode():p.versionCode;}
    private static String hash(byte[] bytes)throws Exception{StringBuilder s=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString();}
    private static String hash(File file)throws Exception{return hash(java.nio.file.Files.readAllBytes(file.toPath()));}
    private static File snapshot(int target){return new File(context().getFilesDir(),"installer"+target+"-retained-owned-data-snapshot.json");}
    private static void report(JSONObject value)throws Exception{Bundle b=new Bundle();b.putString("timehutReport",value.toString());InstrumentationRegistry.getInstrumentation().sendStatus(0,b);}
    private static void collect(File root,File file,JSONObject values,long[] bytes)throws Exception{if(!file.exists())return;if(file.isDirectory()){File[] children=file.listFiles();assertNotNull(children);for(File child:children)collect(root,child,values,bytes);}else{assertTrue(file.getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator));bytes[0]+=file.length();assertTrue(bytes[0]<=256L*1024*1024);values.put(file.getAbsolutePath().substring(root.getAbsolutePath().length()+1),hash(file));}}
    private static JSONObject inventory(long[] bytes)throws Exception{File root=context().getNoBackupFilesDir();JSONObject values=new JSONObject();for(String name:new String[]{"transfers","accounts","upgrade71-fixture","upgrade73-fixture","upgrade75-fixture","upgrade77-fixture","upgrade79-fixture","upgrade81-fixture","upgrade83-fixture","upgrade8301-fixture","upgrade85-fixture","upgrade86-fixture","upgrade87-fixture","upgrade88-fixture","upgrade89-fixture","upgrade90-fixture","upgrade91-fixture","upgrade92-fixture","upgrade93-fixture","upgrade94-fixture","upgrade95-fixture"})collect(root,new File(root,name),values,bytes);return values;}
    @Test public void captureKnown71DataBefore73()throws Exception{capture(71,73);}
    @Test public void captureKnown73DataBefore75()throws Exception{capture(73,75);}
    @Test public void captureKnown75DataBefore77()throws Exception{capture(75,77);}
    @Test public void captureKnown77DataBefore79()throws Exception{capture(77,79);}
    @Test public void captureKnown83DataBefore85()throws Exception{capture(83,85);}
    @Test public void captureKnown85DataBefore87()throws Exception{capture(85,87);}
    @Test public void captureKnown85DataBefore92()throws Exception{capture(85,92);}
    @Test public void captureKnown86DataBefore92()throws Exception{capture(86,92);}
    @Test public void captureKnown87DataBefore92()throws Exception{capture(87,92);}
    @Test public void captureKnown88DataBefore92()throws Exception{capture(88,92);}
    @Test public void captureKnown89DataBefore92()throws Exception{capture(89,92);}
    @Test public void captureKnown90DataBefore92()throws Exception{capture(90,92);}
    @Test public void captureKnown94DataBefore95()throws Exception{capture(94,95);}
    @Test public void captureKnown85DataBefore94()throws Exception{capture(85,94);}
    @Test public void captureKnown86DataBefore94()throws Exception{capture(86,94);}
    @Test public void captureKnown87DataBefore94()throws Exception{capture(87,94);}
    @Test public void captureKnown88DataBefore94()throws Exception{capture(88,94);}
    @Test public void captureKnown89DataBefore94()throws Exception{capture(89,94);}
    @Test public void captureKnown90DataBefore94()throws Exception{capture(90,94);}
    @Test public void captureKnown91DataBefore94()throws Exception{capture(91,94);}
    @Test public void captureKnown92DataBefore94()throws Exception{capture(92,94);}
    @Test public void captureKnown93DataBefore94()throws Exception{capture(93,94);}
    @Test public void captureKnown85DataBefore93()throws Exception{capture(85,93);}
    @Test public void captureKnown86DataBefore93()throws Exception{capture(86,93);}
    @Test public void captureKnown87DataBefore93()throws Exception{capture(87,93);}
    @Test public void captureKnown88DataBefore93()throws Exception{capture(88,93);}
    @Test public void captureKnown89DataBefore93()throws Exception{capture(89,93);}
    @Test public void captureKnown90DataBefore93()throws Exception{capture(90,93);}
    @Test public void captureKnown91DataBefore93()throws Exception{capture(91,93);}
    @Test public void captureKnown92DataBefore93()throws Exception{capture(92,93);}
    @Test public void captureKnown91DataBefore92()throws Exception{capture(91,92);}
    @Test public void captureKnown85DataBefore91()throws Exception{capture(85,91);}
    @Test public void captureKnown86DataBefore91()throws Exception{capture(86,91);}
    @Test public void captureKnown87DataBefore91()throws Exception{capture(87,91);}
    @Test public void captureKnown88DataBefore91()throws Exception{capture(88,91);}
    @Test public void captureKnown89DataBefore91()throws Exception{capture(89,91);}
    @Test public void captureKnown90DataBefore91()throws Exception{capture(90,91);}
    @Test public void captureKnown85DataBefore90()throws Exception{capture(85,90);}
    @Test public void captureKnown86DataBefore90()throws Exception{capture(86,90);}
    @Test public void captureKnown87DataBefore90()throws Exception{capture(87,90);}
    @Test public void captureKnown88DataBefore90()throws Exception{capture(88,90);}
    @Test public void captureKnown89DataBefore90()throws Exception{capture(89,90);}
    @Test public void captureKnown85DataBefore89()throws Exception{capture(85,89);}
    @Test public void captureKnown86DataBefore89()throws Exception{capture(86,89);}
    @Test public void captureKnown87DataBefore89()throws Exception{capture(87,89);}
    @Test public void captureKnown88DataBefore89()throws Exception{capture(88,89);}
    @Test public void captureKnown85DataBefore88()throws Exception{capture(85,88);}
    @Test public void captureKnown86DataBefore88()throws Exception{capture(86,88);}
    @Test public void captureKnown87DataBefore88()throws Exception{capture(87,88);}
    @Test public void captureKnown86DataBefore87()throws Exception{capture(86,87);}
    @Test public void captureKnown85DataBefore86()throws Exception{capture(85,86);}
    @Test public void captureKnown83DataBefore83Revision()throws Exception{capture(83,8301);}
    @Test public void captureKnown81DataBefore83()throws Exception{capture(81,83);}
    @Test public void captureKnown79DataBefore83()throws Exception{capture(79,83);}
    @Test public void captureKnown79DataBefore81()throws Exception{capture(79,81);}
    private void capture(int fromVersion,int targetVersion)throws Exception{
        assertEquals("tw.aihankapps.timehut.testing",context().getPackageName());assertEquals(fromVersion,version());assertFalse(snapshot(targetVersion).exists());
        File global=new File(context().getNoBackupFilesDir(),"accounts/session.json");if(global.exists()){JSONObject state=new JSONObject(new String(java.nio.file.Files.readAllBytes(global.toPath()),StandardCharsets.UTF_8));for(String key:new String[]{"session","revocations","nativeLogins"})assertFalse("Existing live/pending account preserved",state.has(key));}for(String suffix:new String[]{".intent",".intent.tmp",".new",".bak",".recovery",".recovery.tmp"})assertFalse(new File(global+suffix).exists());
        File dir=new File(context().getNoBackupFilesDir(),"upgrade"+targetVersion+"-fixture");assertFalse(dir.exists());assertTrue(dir.mkdir());File file=new File(dir,"session.json");String alias="timehut.upgrade"+targetVersion+".fixture."+UUID.randomUUID(),owner=UUID.randomUUID().toString(),token="synthetic_upgrade"+targetVersion+"_"+UUID.randomUUID().toString().replace("-","");long expiry=System.currentTimeMillis()+3600000;
        AccountSessionStore store=new AccountSessionStore(file,alias);store.activateVerified(owner,token,expiry,false);store.signOut();JSONObject login=store.beginLogin(AccountIdentity.BACKEND,store.bridgeStatus().getString("generation"));store.abortLogin(login.getString("id"));assertEquals(1,store.pendingRevocations().length());assertEquals(1,store.nativeCancellations().length());assertNull(store.currentOwner());
        long[] bytes={0};JSONObject values=inventory(bytes),saved=new JSONObject().put("files",values).put("alias",alias).put("tokenHash",hash(token.getBytes(StandardCharsets.UTF_8))).put("nativeSecretHash",hash(login.getString("secret").getBytes(StandardCharsets.UTF_8)));
        try(FileOutputStream out=new FileOutputStream(snapshot(targetVersion))){out.write(saved.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
        report(new JSONObject().put("status","PASS_KNOWN"+fromVersion+"_ENCRYPTED_PENDING_CAPTURE").put("fromVersion",fromVersion).put("files",values.length()).put("bytes",bytes[0]).put("pendingRevocations",1).put("pendingNativeCancellations",1).put("rawDataExported",false).put("providerRequests",0));
    }
    @Test public void upgraded73PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(73);}
    @Test public void upgraded75PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(75);}
    @Test public void upgraded77PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(77);}
    @Test public void upgraded79PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(79);}
    @Test public void upgraded85PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(85);}
    @Test public void upgraded87PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(87);}
    @Test public void upgraded94PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(94);}
    @Test public void upgraded95PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(95);}
    @Test public void upgraded93PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(93);}
    @Test public void upgraded92PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(92);}
    @Test public void upgraded91PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(91);}
    @Test public void upgraded90PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(90);}
    @Test public void upgraded89PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(89);}
    @Test public void upgraded88PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(88);}
    @Test public void upgraded86PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(86);}
    @Test public void upgraded83PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(83);}
    @Test public void upgraded81PreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(81);}
    private void verifyUpgrade(int targetVersion)throws Exception{verifyUpgrade(targetVersion,targetVersion);}
    @Test public void upgraded83RevisionPreservesBytesAndPendingReceipts()throws Exception{verifyUpgrade(8301,83);}
    private void verifyUpgrade(int targetVersion,int expectedVersion)throws Exception{
        assertEquals(expectedVersion,version());assertFalse(BuildConfig.DEBUG);JSONObject saved=new JSONObject(new String(java.nio.file.Files.readAllBytes(snapshot(targetVersion).toPath()),StandardCharsets.UTF_8)),before=saved.getJSONObject("files");long[] bytes={0};JSONObject after=inventory(bytes);assertEquals(before.length(),after.length());for(Iterator<String> keys=before.keys();keys.hasNext();){String name=keys.next();assertEquals(name,before.getString(name),after.getString(name));}
        File file=new File(context().getNoBackupFilesDir(),"upgrade"+targetVersion+"-fixture/session.json");String prior=hash(file);AccountSessionStore store=new AccountSessionStore(file,saved.getString("alias"));assertEquals(saved.getString("tokenHash"),hash(store.pendingRevocations().getJSONObject(0).getString("token").getBytes(StandardCharsets.UTF_8)));assertEquals(saved.getString("nativeSecretHash"),hash(store.nativeCancellations().getJSONObject(0).getString("secret").getBytes(StandardCharsets.UTF_8)));assertNull(store.currentOwner());assertEquals(prior,hash(file));
        report(new JSONObject().put("status","PASS_ACTUAL_UPGRADE"+targetVersion+"_ENCRYPTED_PENDING_PRESERVATION").put("toVersion",expectedVersion).put("fixtureNamespace",targetVersion).put("filesPreserved",before.length()).put("bytes",bytes[0]).put("oldKeyReadable",true).put("pendingRevocationAndNativeCancellationPreserved",true).put("dataCleared",false).put("activeCustomerTaskMigration",false).put("providerRequests",0));
    }
    @Test public void nonDebug73RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(73);}
    @Test public void nonDebug75RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(75);}
    @Test public void nonDebug77RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(77);}
    @Test public void nonDebug79RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(79);}
    @Test public void nonDebug85RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(85);}
    @Test public void nonDebug87RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(87);}
    @Test public void nonDebug94RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(94);}
    @Test public void nonDebug95RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(95);}
    @Test public void nonDebug93RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(93);}
    @Test public void nonDebug92RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(92);}
    @Test public void nonDebug91RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(91);}
    @Test public void nonDebug90RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(90);}
    @Test public void nonDebug89RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(89);}
    @Test public void nonDebug88RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(88);}
    @Test public void exact88DisplayLabelAndIdentity()throws Exception{
        android.content.pm.PackageManager pm=context().getPackageManager();
        android.content.pm.PackageInfo info=pm.getPackageInfo(context().getPackageName(),0);
        org.junit.Assert.assertEquals("tw.aihankapps.timehut.testing",info.packageName);
        org.junit.Assert.assertEquals(88,info.versionCode);
        String label=String.valueOf(pm.getApplicationLabel(info.applicationInfo));
        org.junit.Assert.assertEquals("時光相簿測試版",label);
        android.os.Bundle data=new android.os.Bundle();
        data.putString("timehutReport",new org.json.JSONObject().put("status","PASS_EXACT88_DISPLAY_LABEL_AND_IDENTITY").put("versionCode",88).put("applicationId",info.packageName).put("applicationLabel",label).put("providerRequests",0).toString());
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendStatus(0,data);
    }
    @Test public void exact89DisplayLabelAndIdentity()throws Exception{
        android.content.pm.PackageManager pm=context().getPackageManager();
        android.content.pm.PackageInfo info=pm.getPackageInfo(context().getPackageName(),0);
        org.junit.Assert.assertEquals("tw.aihankapps.timehut.testing",info.packageName);
        org.junit.Assert.assertEquals(89,info.versionCode);
        String label=String.valueOf(pm.getApplicationLabel(info.applicationInfo));
        org.junit.Assert.assertEquals("時光相簿測試版",label);
        android.os.Bundle data=new android.os.Bundle();
        data.putString("timehutReport",new org.json.JSONObject().put("status","PASS_EXACT89_DISPLAY_LABEL_AND_IDENTITY").put("versionCode",89).put("applicationId",info.packageName).put("applicationLabel",label).put("providerRequests",0).toString());
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendStatus(0,data);
    }
    @Test public void exact90DisplayLabelAndIdentity()throws Exception{
        android.content.pm.PackageManager pm=context().getPackageManager();
        android.content.pm.PackageInfo info=pm.getPackageInfo(context().getPackageName(),0);
        org.junit.Assert.assertEquals("tw.aihankapps.timehut.testing",info.packageName);
        org.junit.Assert.assertEquals(90,info.versionCode);
        String label=String.valueOf(pm.getApplicationLabel(info.applicationInfo));
        org.junit.Assert.assertEquals("時光相簿測試版",label);
        android.os.Bundle data=new android.os.Bundle();
        data.putString("timehutReport",new org.json.JSONObject().put("status","PASS_EXACT90_DISPLAY_LABEL_AND_IDENTITY").put("versionCode",90).put("applicationId",info.packageName).put("applicationLabel",label).put("providerRequests",0).toString());
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendStatus(0,data);
    }
    @Test public void exact91DisplayLabelAndIdentity()throws Exception{
        android.content.pm.PackageManager pm=context().getPackageManager();
        android.content.pm.PackageInfo info=pm.getPackageInfo(context().getPackageName(),0);
        org.junit.Assert.assertEquals("tw.aihankapps.timehut.testing",info.packageName);
        org.junit.Assert.assertEquals(91,info.versionCode);
        String label=String.valueOf(pm.getApplicationLabel(info.applicationInfo));
        org.junit.Assert.assertEquals("時光相簿測試版",label);
        android.os.Bundle data=new android.os.Bundle();
        data.putString("timehutReport",new org.json.JSONObject().put("status","PASS_EXACT91_DISPLAY_LABEL_AND_IDENTITY").put("versionCode",91).put("applicationId",info.packageName).put("applicationLabel",label).put("providerRequests",0).toString());
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendStatus(0,data);
    }
    @Test public void exact95DisplayLabelAndIdentity()throws Exception{
        android.content.pm.PackageManager pm=context().getPackageManager();
        android.content.pm.PackageInfo info=pm.getPackageInfo(context().getPackageName(),0);
        assertEquals("tw.aihankapps.timehut.testing",info.packageName);assertEquals(95,version());
        String label=String.valueOf(pm.getApplicationLabel(info.applicationInfo));assertEquals("時光相簿測試版",label);
        report(new JSONObject().put("status","PASS_EXACT95_DISPLAY_LABEL_AND_IDENTITY").put("versionCode",95).put("applicationId",info.packageName).put("applicationLabel",label).put("providerRequests",0));
    }
    @Test public void exact94DisplayLabelAndIdentity()throws Exception{
        android.content.pm.PackageManager pm=context().getPackageManager();
        android.content.pm.PackageInfo info=pm.getPackageInfo(context().getPackageName(),0);
        org.junit.Assert.assertEquals("tw.aihankapps.timehut.testing",info.packageName);
        org.junit.Assert.assertEquals(94,info.versionCode);
        String label=String.valueOf(pm.getApplicationLabel(info.applicationInfo));
        org.junit.Assert.assertEquals("時光相簿測試版",label);
        android.os.Bundle data=new android.os.Bundle();
        data.putString("timehutReport",new org.json.JSONObject().put("status","PASS_EXACT94_DISPLAY_LABEL_AND_IDENTITY").put("versionCode",94).put("applicationId",info.packageName).put("applicationLabel",label).put("providerRequests",0).toString());
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendStatus(0,data);
    }
    @Test public void exact93DisplayLabelAndIdentity()throws Exception{
        android.content.pm.PackageManager pm=context().getPackageManager();
        android.content.pm.PackageInfo info=pm.getPackageInfo(context().getPackageName(),0);
        org.junit.Assert.assertEquals("tw.aihankapps.timehut.testing",info.packageName);
        org.junit.Assert.assertEquals(93,info.versionCode);
        String label=String.valueOf(pm.getApplicationLabel(info.applicationInfo));
        org.junit.Assert.assertEquals("時光相簿測試版",label);
        android.os.Bundle data=new android.os.Bundle();
        data.putString("timehutReport",new org.json.JSONObject().put("status","PASS_EXACT93_DISPLAY_LABEL_AND_IDENTITY").put("versionCode",93).put("applicationId",info.packageName).put("applicationLabel",label).put("providerRequests",0).toString());
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendStatus(0,data);
    }
    @Test public void exact92DisplayLabelAndIdentity()throws Exception{
        android.content.pm.PackageManager pm=context().getPackageManager();
        android.content.pm.PackageInfo info=pm.getPackageInfo(context().getPackageName(),0);
        org.junit.Assert.assertEquals("tw.aihankapps.timehut.testing",info.packageName);
        org.junit.Assert.assertEquals(92,info.versionCode);
        String label=String.valueOf(pm.getApplicationLabel(info.applicationInfo));
        org.junit.Assert.assertEquals("時光相簿測試版",label);
        android.os.Bundle data=new android.os.Bundle();
        data.putString("timehutReport",new org.json.JSONObject().put("status","PASS_EXACT92_DISPLAY_LABEL_AND_IDENTITY").put("versionCode",92).put("applicationId",info.packageName).put("applicationLabel",label).put("providerRequests",0).toString());
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendStatus(0,data);
    }
    @Test public void nonDebug86RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(86);}
    @Test public void nonDebug83RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(83);}
    @Test public void nonDebug81RejectsLegacyCredentialSetters()throws Exception{verifyNonDebug(81);}
    private void verifyNonDebug(int targetVersion)throws Exception{
        assertEquals(targetVersion,version());assertFalse(BuildConfig.DEBUG);assertEquals(0,context().getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE);
        class Capture extends com.getcapacitor.PluginCall{String rejection;boolean resolved;Capture(String name){super(null,"TimehutTransfer","synthetic73",name,new com.getcapacitor.JSObject());}@Override public void reject(String value){rejection=value;}@Override public void resolve(){resolved=true;}@Override public void resolve(com.getcapacitor.JSObject value){resolved=true;}}
        TransferPlugin plugin=new TransferPlugin();Capture set=new Capture("setAccountSession"),clear=new Capture("clearAccountSession");plugin.setAccountSession(set);plugin.clearAccountSession(clear);assertEquals("請使用我的帳戶登入",set.rejection);assertEquals("請使用我的帳戶登出",clear.rejection);assertFalse(set.resolved);assertFalse(clear.resolved);
        report(new JSONObject().put("status","PASS_NONDEBUG"+targetVersion+"_LEGACY_SETTERS_REJECTED").put("debuggable",false).put("providerRequests",0));
    }
}
