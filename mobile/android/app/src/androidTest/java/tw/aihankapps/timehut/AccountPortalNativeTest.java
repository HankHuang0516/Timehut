package tw.aihankapps.timehut;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import static org.junit.Assert.*;

/** Actual packaged account form/DOM and native Keystore bridge, controlled first-party server. */
@RunWith(AndroidJUnit4.class)
public class AccountPortalNativeTest {
    private Instrumentation instrumentation;private Context context;private WebView view;
    private void js(String script){instrumentation.runOnMainSync(()->view.evaluateJavascript(script,null));}
    private String read(String script)throws Exception{CountDownLatch latch=new CountDownLatch(1);String[] result={null};instrumentation.runOnMainSync(()->view.evaluateJavascript(script,r->{result[0]=r;latch.countDown();}));return latch.await(3,TimeUnit.SECONDS)?result[0]:"callback-unavailable-during-navigation";}
    private void waitFor(String predicate)throws Exception{long deadline=System.currentTimeMillis()+15000;String last=null;while(System.currentTimeMillis()<deadline){last=read("Boolean("+predicate+")");if("true".equals(last))return;Thread.sleep(100);}throw new AssertionError("Native account-page condition not met: "+predicate+" last="+last+" state="+read("JSON.stringify({url:location.href,message:document.getElementById('account-message')?.textContent,ready:document.readyState,native:window.TimehutAccounts?.status()})"));}
    private void signup(String name,String display)throws Exception{JSONObject fields=new JSONObject().put("username",name).put("displayName",display).put("password","artificial-native-secret");js("document.getElementById('account-toggle').click();const form=document.getElementById('account-form');Object.entries("+fields+").forEach(([k,v])=>form.elements[k].value=v);form.requestSubmit();");waitFor("!document.getElementById('account-home').hidden&&document.getElementById('account-message').textContent==='已登入。'");}
    @Test public void packagedAccountUiUsesNativeCredentialStore()throws Exception{
        assertTrue(android.os.Build.VERSION.SDK_INT>=36);instrumentation=InstrumentationRegistry.getInstrumentation();context=instrumentation.getTargetContext();TransferEngine.initialize(context);context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));long deadline=System.currentTimeMillis()+15000;
        try(FileOutputStream out=new FileOutputStream(new File(context.getFilesDir(),"portal-qa-start.json"))){out.write(new JSONObject().put("pid",android.os.Process.myPid()).toString().getBytes(StandardCharsets.UTF_8));}
        while(view==null&&System.currentTimeMillis()<deadline){instrumentation.runOnMainSync(()->{for(android.app.Activity a:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(a instanceof MainActivity)view=((MainActivity)a).getBridge().getWebView();});Thread.sleep(100);}assertNotNull(view);
        try(AccountClientBridgeTest.Fixture backend=new AccountClientBridgeTest.Fixture()){
            backend.realAlbums=true;AccountClient.testBackend=backend.endpoint();synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().signOut();TransferEngine.accountChanged();}
            // Let the initial unauthenticated entry finish its own redirect before
            // opening a fresh form without a next= navigation target.
            waitFor("location.pathname==='/account.html'&&window.TimehutAccounts&&TimehutAccounts.status().native===true&&document.readyState==='complete'");
            instrumentation.runOnMainSync(()->view.loadUrl("https://localhost/account.html?nativePortalStart=ready"));waitFor("location.search==='?nativePortalStart=ready'&&window.TimehutAccounts&&TimehutAccounts.status().native===true&&document.readyState==='complete'");signup("synthetic-ui-alpha","人工介面甲");String token=backend.lastToken,owner=TransferEngine.accounts().currentOwner();assertNotNull(owner);assertEquals("true",read("TimehutAccounts.status().native"));assertEquals("0",read("Object.values(localStorage).concat(Object.values(sessionStorage)).filter(v=>String(v).includes('"+token+"')).length"));assertEquals("\"\"",read("document.getElementById('account-form').elements.password.value"));
            String title="人工甲 <script>window.nativeInjection=1</script>";js("const albumForm=document.getElementById('album-form');albumForm.elements.title.value="+JSONObject.quote(title)+";albumForm.elements.birthDate.value='2020-01-01';albumForm.requestSubmit();");waitFor("document.getElementById('account-message').textContent==='相簿已建立。'");assertEquals("true",read("document.getElementById('selected-album').textContent==="+JSONObject.quote(title)));assertEquals("true",read("typeof window.nativeInjection==='undefined'"));assertEquals("false",read("document.documentElement.scrollWidth>innerWidth+1"));
            Bitmap image=instrumentation.getUiAutomation().takeScreenshot();if(image!=null){try(FileOutputStream out=new FileOutputStream(new File(context.getFilesDir(),"account-ui-qa.png"))){image.compress(Bitmap.CompressFormat.PNG,100,out);}image.recycle();}
            instrumentation.runOnMainSync(()->view.loadUrl("https://localhost/index.html"));waitFor("window.TimehutPage&&CONFIG.CHILDREN.length===1&&!document.documentElement.hasAttribute('data-timehut-loading')");assertEquals("true",read("TimehutAccounts.status().native&&location.origin==='https://localhost'"));assertEquals("true",read("document.querySelector('.child-card[data-child-index]').textContent.includes("+JSONObject.quote(title)+")"));assertEquals("true",read("typeof window.nativeInjection==='undefined'&&typeof CONFIG.FLICKR_API_KEY==='undefined'"));
            js("document.querySelector('.child-card[data-child-index]').click()");waitFor("location.pathname==='/timeline.html'&&document.querySelectorAll('.profile-btn').length===1&&!document.documentElement.hasAttribute('data-timehut-loading')");assertEquals("true",read("document.getElementById('currentChildName').textContent==="+JSONObject.quote(title)));assertEquals("false",read("document.documentElement.scrollWidth>innerWidth+1"));
            instrumentation.runOnMainSync(()->view.loadUrl("https://localhost/settings.html"));waitFor("document.getElementById('birthdate-0')&&document.getElementById('birthdate-0').value==='2020-01-01'");assertEquals("true",read("TimehutAccounts.status().native"));
            instrumentation.runOnMainSync(()->view.loadUrl("https://localhost/account.html"));waitFor("document.getElementById('account-albums')?.children.length===1");
            js("window.nativeBeforeReload='old-document'");instrumentation.runOnMainSync(()->view.reload());waitFor("typeof window.nativeBeforeReload==='undefined'&&document.readyState==='complete'&&window.TimehutAccounts&&TimehutAccounts.status().native===true&&!document.getElementById('account-home').hidden&&document.getElementById('account-albums').children.length===1");assertEquals(owner,TransferEngine.accounts().currentOwner());assertEquals("0",read("Object.values(localStorage).concat(Object.values(sessionStorage)).filter(v=>String(v).includes('"+token+"')).length"));
            js("document.getElementById('account-logout').click()");waitFor("!document.getElementById('account-auth').hidden&&document.getElementById('account-message').textContent==='已登出。'");assertNull(TransferEngine.accounts().currentOwner());assertFalse(backend.tokens.containsKey(token));assertEquals("0",read("document.getElementById('account-photos').children.length"));
            signup("synthetic-ui-bravo","人工介面乙");assertNotEquals(owner,TransferEngine.accounts().currentOwner());assertEquals("0",read("document.getElementById('account-albums').children.length"));assertEquals("false",read("document.body.textContent.includes("+JSONObject.quote(title)+")"));
            JSONObject report=new JSONObject().put("status","PASS_PACKAGED_ANDROID_ACCOUNT_PORTAL_UI").put("actualPackagedFormsAndNativeBridge",true).put("signupCreateAlbumReloadLogoutOtherEmptyOwner",true).put("publicOriginalIndexTimelineSettingsNativeContext",true).put("coreBeforeBootstrapKeepsNativeOrigin",true).put("reloadUsesKeystoreWithoutBrowserToken",true).put("hostileAlbumTitleRenderedAsText",true).put("noHorizontalOverflow",true).put("providerRequests",0).put("physicalPhone",false).put("sdk",android.os.Build.VERSION.SDK_INT);
            try(FileOutputStream out=new FileOutputStream(new File(context.getFilesDir(),"portal-qa-report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}
        }finally{AccountClient.testBackend=null;}
    }
}
