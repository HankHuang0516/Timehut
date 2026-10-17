package tw.aihankapps.timehut;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.uiautomator.UiDevice;
import org.json.*;
import org.junit.Test;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import static org.junit.Assert.*;

/** Real installed Activity geometry and system touch delivery. No login/provider I/O. */
public class SystemUiInsetsTest {
    private Instrumentation inst; private Context context; private MainActivity activity;
    private WebView web; private UiDevice device; private File output;
    private final JSONArray checks = new JSONArray();
    private final JSONArray taps = new JSONArray();
    private boolean longTextFixture=false;
    private void start() throws Exception {
        inst=InstrumentationRegistry.getInstrumentation();context=inst.getTargetContext();device=UiDevice.getInstance(inst);
        output=new File(context.getExternalFilesDir(null),"system-ui-insets-"+System.currentTimeMillis());assertTrue(output.mkdir());
        context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        long end=System.currentTimeMillis()+12000;
        while(activity==null&&System.currentTimeMillis()<end){inst.runOnMainSync(()->{for(android.app.Activity a:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(a instanceof MainActivity){activity=(MainActivity)a;web=activity.getBridge().getWebView();}});Thread.sleep(80);}
        assertNotNull(activity);assertNotNull(web);
        if(geometry().getBoolean("webVisible"))waitFor("location.pathname==='/account.html'&&document.readyState==='complete'&&window.TimehutAccounts&&TimehutAccounts.status().native===true");
    }
    private String read(String script)throws Exception {
        CountDownLatch latch=new CountDownLatch(1);String[] value={null};inst.runOnMainSync(()->web.evaluateJavascript(script,r->{value[0]=r;latch.countDown();}));return latch.await(3,TimeUnit.SECONDS)?value[0]:"null";
    }
    private void js(String script){inst.runOnMainSync(()->web.evaluateJavascript(script,null));}
    private void waitFor(String predicate)throws Exception {long end=System.currentTimeMillis()+8000;String last=null;while(System.currentTimeMillis()<end){last=read("Boolean("+predicate+")");if("true".equals(last))return;Thread.sleep(80);}throw new AssertionError(predicate+" last="+last);}
    private JSONObject geometry()throws Exception {
        JSONObject[] result={null};inst.runOnMainSync(()->{try{
            View decor=activity.getWindow().getDecorView(),content=activity.findViewById(android.R.id.content);
            WindowInsetsCompat insets=ViewCompat.getRootWindowInsets(decor);assertNotNull(insets);
            Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());
            Insets ime=insets.getInsets(WindowInsetsCompat.Type.ime());int[] origin=new int[2];decor.getLocationOnScreen(origin);
            View shown=web.isShown()?web:((ViewGroup)content).getChildAt(0);int[] at=new int[2];shown.getLocationOnScreen(at);
            result[0]=new JSONObject().put("screenX",origin[0]).put("screenY",origin[1]).put("windowWidth",decor.getWidth()).put("windowHeight",decor.getHeight()).put("x",at[0]).put("y",at[1]).put("width",shown.getWidth()).put("height",shown.getHeight()).put("barsLeft",bars.left).put("barsTop",bars.top).put("barsRight",bars.right).put("barsBottom",bars.bottom).put("imeBottom",ime.bottom).put("imeVisible",insets.isVisible(WindowInsetsCompat.Type.ime())).put("webVisible",web.isShown());
        }catch(JSONException e){throw new RuntimeException(e);}});return result[0];
    }
    private void assertSafe(JSONObject g)throws Exception {
        int bottom=Math.max(g.getInt("barsBottom"),g.getBoolean("imeVisible")?g.getInt("imeBottom"):0);
        assertTrue("Top content overlaps status/cutout: "+g,g.getInt("y")>=g.getInt("screenY")+g.getInt("barsTop"));
        assertTrue("Left content overlaps cutout: "+g,g.getInt("x")>=g.getInt("screenX")+g.getInt("barsLeft"));
        assertTrue("Right content overlaps cutout: "+g,g.getInt("x")+g.getInt("width")<=g.getInt("screenX")+g.getInt("windowWidth")-g.getInt("barsRight"));
        assertTrue("Bottom content overlaps navigation/IME: "+g,g.getInt("y")+g.getInt("height")<=g.getInt("screenY")+g.getInt("windowHeight")-bottom);
        // Also catches doubled native+CSS padding at the WebView boundary.
        assertTrue("Unexpected duplicated top inset: "+g,g.getInt("y")<=g.getInt("screenY")+g.getInt("barsTop")+1);
    }
    private void awaitVisualFrame()throws Exception {
        if(!geometry().getBoolean("webVisible")){inst.waitForIdleSync();return;}
        CountDownLatch drawn=new CountDownLatch(1);
        inst.runOnMainSync(()->web.postVisualStateCallback(System.nanoTime(),new WebView.VisualStateCallback(){@Override public void onComplete(long requestId){drawn.countDown();}}));
        assertTrue("Current document visual state did not commit",drawn.await(5,TimeUnit.SECONDS));inst.waitForIdleSync();Thread.sleep(180);
    }
    private void screenshot(String name)throws Exception {awaitVisualFrame();Bitmap image=inst.getUiAutomation().takeScreenshot();assertNotNull(image);try(FileOutputStream out=new FileOutputStream(new File(output,name+".png"))){assertTrue(image.compress(Bitmap.CompressFormat.PNG,100,out));}finally{image.recycle();}}
    private void load(String html)throws Exception {
        String marker=java.util.UUID.randomUUID().toString();
        assertEquals(JSONObject.quote(marker),read("window.__timehutPreviousDocumentNonce="+JSONObject.quote(marker)));
        inst.runOnMainSync(()->web.loadDataWithBaseURL("https://localhost/",html,"text/html","UTF-8",null));
        waitFor("typeof window.__timehutPreviousDocumentNonce==='undefined'&&document.readyState==='complete'");awaitVisualFrame();
    }
    private void tap(String selector)throws Exception {tap(selector,true);}
    private void tap(String selector,boolean intercept)throws Exception {
        if(intercept)js("window.safeAreaTapCount=0;document.querySelector("+JSONObject.quote(selector)+").addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();window.safeAreaTapCount++},{once:true,capture:true})");
        awaitVisualFrame();
        assertEquals("Target is covered or outside actual hit area: "+selector,"true",read("(()=>{const e=document.querySelector("+JSONObject.quote(selector)+"),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+Math.min(3,r.height/2));return e===hit||e.contains(hit)})()"));
        JSONArray rect=new JSONArray(new JSONTokener(read("JSON.stringify((()=>{const r=document.querySelector("+JSONObject.quote(selector)+").getBoundingClientRect();return [r.x,r.y,r.width,r.height,innerWidth]})())")).nextValue().toString());
        JSONObject g=geometry();double scale=g.getDouble("width")/rect.getDouble(4);
        int x=g.getInt("x")+(int)((rect.getDouble(0)+rect.getDouble(2)/2)*scale),y=g.getInt("y")+(int)((rect.getDouble(1)+Math.min(3,rect.getDouble(3)/2))*scale);
        taps.put(new JSONObject().put("selector",selector).put("x",x).put("y",y).put("rect",rect).put("geometry",g));
        assertTrue("Touch within WebView",y>=g.getInt("y")&&y<g.getInt("y")+g.getInt("height"));
        assertTrue("Real system tap rejected",device.click(x,y));if(intercept)waitFor("window.safeAreaTapCount===1");Thread.sleep(400);
    }
    private static final String FIXTURE="<script>window.CONFIG={ACCOUNT_MODE:true,CHILDREN:[{albumId:'fixture-insets',name:'人工相簿',birthDate:'2020-01-01',emoji:'📷',color:'#ffe082'}],FAMILY_MEMBERS:[{name:'fixture-owner'}],PHOTOS_PER_PAGE:30,UPLOAD_API_URL:'https://just-healing-production.up.railway.app'};window.TimehutPage={empty:()=>false,ready:Promise.resolve(true),onReady:fn=>document.addEventListener('DOMContentLoaded',fn)};window.TimehutAccounts={status:()=>({authenticated:true,user:{id:'fixture-owner',username:'fixture-owner'},native:true,legacyOwner:false}),request:async()=>({stat:'ok',photoset:{photo:[],pages:1,page:1,total:0},items:[],total:0,pending:0,uploading:0,isProcessing:false})};window.fetch=async()=>{throw Error('Network disabled in synthetic inset fixture')};</script>";
    private void realProductControls(String phase)throws Exception {
        String html;try(InputStream in=context.getAssets().open("public/timeline.html")){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)bytes.write(buffer,0,n);html=bytes.toString("UTF-8");}
        html=html.replaceAll("(?is)<script\\b[^>]*src=\"(?:capacitor[^\" ]*|js/(?:capacitor-core|accounts|account-config|web-upload|transfers|uploader|pwa)\\.js)[^\"]*\"[^>]*>.*?</script>","").replaceAll("(?is)<link\\b[^>]*href=\"https://fonts[^>]*>","");
        html=html.replace("<head>","<head>"+FIXTURE);load(html);
        waitFor("typeof SelectionState!=='undefined'&&!TimelineState.isLoading&&document.querySelector('.profile-btn')?.title==='人工相簿'&&document.getElementById('selectModeBtn')");
        assertSafe(geometry());tap("#selectModeBtn",false);waitFor("SelectionState.isSelectMode===true&&document.getElementById('selectModeBtn').getAttribute('aria-pressed')==='true'");
        tap("#selectModeBtn",false);waitFor("SelectionState.isSelectMode===false");
        screenshot(phase+"-real-timeline-handler");checks.put(new JSONObject().put("phase",phase+"-actual-product-selection-handler").put("realSystemTap",true).put("handlerNotIntercepted",true).put("syntheticAccountAndAPI",true).put("geometry",geometry()));
    }
    private void realAccountNameDisclosure()throws Exception {
        String html;try(InputStream in=context.getAssets().open("public/account.html")){html=new String(in.readAllBytes(),StandardCharsets.UTF_8);}
        html=html.replaceAll("(?is)<script\\b[^>]*src=\"(?:capacitor[^\" ]*|js/(?:capacitor-core|accounts|web-upload)\\.js)[^\"]*\"[^>]*>.*?</script>","").replaceAll("(?is)<link\\b[^>]*href=\"https://fonts[^>]*>","");
        String name="用來檢查長文字與放大字體排版的示例使用者".repeat(4).substring(0,80);
        String fixture="<script>const syntheticDisplayName="+JSONObject.quote(name)+";window.TimehutAccounts={ready:Promise.resolve(),status:()=>({authenticated:true,native:true,legacyOwner:false,user:{id:'30000000-0000-4000-8000-000000000090',username:'synthetic-name',displayName:syntheticDisplayName}}),request:async()=>({albums:[],total:0,page:1,pages:1})};window.fetch=async()=>{throw Error('Network disabled in native-name fixture')};</script>";
        load(html.replace("<head>","<head>"+fixture));
        waitFor("document.getElementById('account-home').hidden===false&&document.getElementById('account-name-details').hidden===false");
        assertEquals("Instrumentation version must match the installed target", BuildConfig.VERSION_NAME, context.getPackageManager().getPackageInfo(context.getPackageName(),0).versionName);
        assertEquals(BuildConfig.VERSION_CODE, context.getPackageManager().getPackageInfo(context.getPackageName(),0).versionCode);
        assertEquals("true",read("(()=>{const s=document.querySelector('#account-name-details summary'),r=s.getBoundingClientRect();return r.height>=48&&document.getElementById('account-full-name').textContent===syntheticDisplayName+'的相簿'})()"));
        screenshot("account-long-name-closed");
        js("document.querySelector('#account-name-details summary').scrollIntoView({behavior:'instant',block:'center'})");
        waitFor("(()=>{const r=document.querySelector('#account-name-details summary').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()");tap("#account-name-details summary",false);waitFor("document.getElementById('account-name-details').open===true");
        assertSafe(geometry());assertEquals("true",read("document.documentElement.scrollWidth<=innerWidth+1&&getComputedStyle(document.getElementById('account-full-name')).webkitLineClamp==='none'"));screenshot("account-long-name-expanded");
        js("document.querySelector('#account-name-details summary').scrollIntoView({behavior:'instant',block:'center'})");Thread.sleep(300);tap("#account-name-details summary",false);waitFor("document.getElementById('account-name-details').open===false");
        checks.put(new JSONObject().put("phase","actual-account-full-name-real-system-expand-collapse").put("version",BuildConfig.VERSION_NAME).put("actualProductHTMLCSSAndHandler",true).put("syntheticNativeAccountAPI",true).put("displayNameCharacters",80).put("realSystemTap",true).put("credentialsEntered",false).put("geometry",geometry()));
    }
    private void realUploadSheet()throws Exception {
        tap("#uploadBtn",false);waitFor("document.getElementById('uploadModal').classList.contains('active')");
        assertSafe(geometry());
        assertEquals("true",read("(()=>{const c=document.querySelector('#uploadModal .modal-close').getBoundingClientRect(),p=document.querySelector('.upload-modal-content').getBoundingClientRect();return c.top>=p.top&&c.left>=p.left&&c.bottom<=p.bottom&&c.right<=p.right&&document.documentElement.scrollWidth<=innerWidth+1})()"));
        assertEquals("Upload form label overlaps dropzone content","true",read("(()=>{const d=document.querySelector('.dropzone-content').getBoundingClientRect(),f=document.querySelector('#albumSelect').closest('.upload-field').getBoundingClientRect();return f.top>=d.bottom})()"));
        screenshot("upload-sheet-actual-close-inside-panel");
        js("document.getElementById('tagsInput').scrollIntoView({behavior:'instant',block:'center'})");
        waitFor("(()=>{const r=document.getElementById('tagsInput').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()");
        screenshot("upload-sheet-scrolled-actual-tags-reachable");
        assertEquals("true",read("(()=>{const c=document.querySelector('#uploadModal .modal-close').getBoundingClientRect(),p=document.querySelector('.upload-modal-content').getBoundingClientRect();return c.top>=p.top&&c.left>=p.left&&c.bottom<=p.bottom&&c.right<=p.right})()"));
        js("document.querySelector('.tagging-mode-toggle').scrollIntoView({behavior:'instant',block:'center'})");
        waitFor("(()=>{const r=document.querySelector('.tagging-mode-toggle').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()");
        assertEquals("Mode button or its rendered text clipped","true",read("['batchModeBtn','individualModeBtn'].every(id=>{const e=document.getElementById(id),b=e.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(e);const t=r.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.width>=44&&t.left>=b.left-1&&t.right<=b.right+1})"));
        screenshot("upload-sheet-both-mode-labels-visible");tap("#batchModeBtn");tap("#individualModeBtn");
        tap("#uploadModal .modal-close",false);waitFor("!document.getElementById('uploadModal').classList.contains('active')");
        checks.put(new JSONObject().put("phase","actual-upload-sheet-close-boundary-and-real-close-handler").put("actualProductHTMLCSSAndHandler",true).put("filesSelected",false).put("uploadPerformed",false).put("geometry",geometry()));
    }
    private void realRefinedSettings()throws Exception {
        String html;try(InputStream in=context.getAssets().open("public/settings.html")){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)bytes.write(buffer,0,n);html=bytes.toString("UTF-8");}
        html=html.replaceAll("(?is)<script\\b[^>]*src=\"(?:capacitor[^\" ]*|js/(?:capacitor-core|accounts|account-config|web-upload|transfers|pwa)\\.js)[^\"]*\"[^>]*>.*?</script>","").replaceAll("(?is)<link\\b[^>]*href=\"https://fonts[^>]*>","");
        String bootstrap;try(InputStream in=context.getAssets().open("public/js/account-config.js")){bootstrap=new String(in.readAllBytes(),StandardCharsets.UTF_8);}
        int helperStart=bootstrap.indexOf("function escapeTimehutText("),helperEnd=bootstrap.indexOf("\nwindow.TimehutAPI",helperStart);assertTrue(helperStart>=0&&helperEnd>helperStart);
        String settingsFixture=longTextFixture?FIXTURE.replace("name:'人工相簿'","name:'"+"長名稱與大字排版驗收".repeat(10).substring(0,80)+"'"):FIXTURE;
        String fixture=settingsFixture+"<script>"+bootstrap.substring(helperStart,helperEnd)+"TimehutAccounts.request=async(path,options={})=>path.includes('notification-settings')?{enabled:true,channel:'in-app'}:path.includes('notifications')?{notifications:[]}:path.includes('feedback')?{reports:[],total:0,page:1,pages:1}:path.includes('/albums/archived')?{albums:[],total:0,page:1,pages:1}:{albums:[{id:'fixture-insets',title:'人工相簿',birthDate:'2020-01-01'}]};</script>";
        load(html.replace("<head>","<head>"+fixture));
        waitFor("document.getElementById('birthdate-0')&&document.getElementById('feedback-description')&&document.querySelector('.child-emoji img')");
        assertSafe(geometry());assertEquals("true",read("document.documentElement.scrollWidth<=innerWidth+1"));
        assertEquals(JSONObject.quote(BuildConfig.VERSION_NAME),read("TimehutBuild.version"));
        if(longTextFixture)assertEquals("true",read("(()=>{const e=document.querySelector('.child-name');return e.textContent.length===80&&e.title===e.textContent&&getComputedStyle(e).webkitLineClamp==='2'})()"));
        checks.put(new JSONObject().put("phase","refined-settings-actual-version-and-style").put("version",BuildConfig.VERSION_NAME).put("longTextFixture",longTextFixture).put("metrics",new JSONObject(new JSONTokener(read("JSON.stringify((()=>{const e=document.querySelector('.child-name'),r=e.getBoundingClientRect(),s=getComputedStyle(e);return {nameHeight:r.height,nameLineHeight:s.lineHeight,nameClamp:s.webkitLineClamp,bodyFont:getComputedStyle(document.body).fontSize,dateHeight:document.getElementById('birthdate-0').getBoundingClientRect().height}})())")).nextValue().toString())));
        assertEquals("true",read("(()=>{const r=document.querySelector('.settings-header .back-btn').getBoundingClientRect();return r.width>=44&&r.height>=44})()"));
        screenshot("refined-settings-actual-product");
        js("document.getElementById('feedback-description').scrollIntoView({behavior:'instant',block:'center'})");
        waitFor("(()=>{const r=document.getElementById('feedback-description').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()");tap("#feedback-description",false);
        long end=System.currentTimeMillis()+5000;while(!geometry().getBoolean("imeVisible")&&System.currentTimeMillis()<end)Thread.sleep(100);
        assertTrue("Real product textarea IME did not show",geometry().getBoolean("imeVisible"));assertSafe(geometry());
        assertEquals("true",read("document.activeElement===document.getElementById('feedback-description')"));screenshot("refined-settings-actual-keyboard");
        device.pressBack();Thread.sleep(700);assertFalse(geometry().getBoolean("imeVisible"));assertSafe(geometry());
        js("window.scrollTo({top:0,behavior:'instant'})");waitFor("document.querySelector('.settings-header .back-btn').getBoundingClientRect().top>=0");tap(".settings-header .back-btn",false);
        waitFor("location.pathname==='/account.html'&&new URLSearchParams(location.search).get('next')==='timeline.html'");
        assertSafe(geometry());screenshot("refined-settings-real-return-account-gate");
        checks.put(new JSONObject().put("phase","refined-settings-real-controls-keyboard-and-return").put("actualProductHTMLCSSAndHandlers",true).put("syntheticAccountAndAPI",true).put("realPasswordEntered",false).put("providerRequests",0).put("geometry",geometry()));
    }
    private static final String PROBE="<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'><style>body{margin:0;background:#fffaf0}button{position:fixed;left:24px;width:220px;height:48px}#top{top:0}#bottom{bottom:0}input{position:fixed;top:80px;left:24px;font-size:20px;width:220px}</style></head><body><div id='safeAreaProbe' style='position:absolute;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'></div><button id='top'>頂部操作測試</button><input id='field' placeholder='鍵盤測試'><button id='bottom'>底部操作測試</button></body></html>";
    private void cssInsets(String phase)throws Exception {
        assertEquals("CSS env repeats consumed native insets: "+phase,"true",read("['paddingTop','paddingRight','paddingBottom','paddingLeft'].every(k=>getComputedStyle(document.getElementById('safeAreaProbe'))[k]==='0px')"));
        checks.put(new JSONObject().put("phase",phase+"-four-css-env-insets-zero").put("geometry",geometry()));
    }
    private JSONObject showProbeKeyboard(String phase)throws Exception {
        JSONObject g=geometry();double scale=g.getDouble("width")/Double.parseDouble(read("innerWidth"));device.click(g.getInt("x")+(int)(80*scale),g.getInt("y")+(int)(100*scale));
        long end=System.currentTimeMillis()+5000;while(!geometry().getBoolean("imeVisible")&&System.currentTimeMillis()<end)Thread.sleep(100);
        Thread.sleep(700);JSONObject shown=geometry();assertTrue("Real IME not shown",shown.getBoolean("imeVisible"));assertSafe(shown);cssInsets(phase);return shown;
    }
    private void probe(String phase,boolean keyboard)throws Exception {
        load(PROBE);waitFor("document.getElementById('top')");JSONObject before=geometry();assertSafe(before);cssInsets(phase+"-before-keyboard");tap("#top");tap("#bottom");
        if(keyboard){
            JSONObject top=showProbeKeyboard(phase+"-keyboard-top");screenshot(phase+"-keyboard-before-top");tap("#top");
            // Button focus may dismiss IME; reopen it before testing the bottom.
            JSONObject bottom=showProbeKeyboard(phase+"-keyboard-bottom");screenshot(phase+"-keyboard-before-bottom");tap("#bottom");
            checks.put(new JSONObject().put("phase",phase+"-keyboard-top-system-tap").put("geometry",top).put("systemTaps",1));checks.put(new JSONObject().put("phase",phase+"-keyboard-bottom-system-tap").put("geometry",bottom).put("systemTaps",1));
            inst.runOnMainSync(()->androidx.core.view.WindowCompat.getInsetsController(activity.getWindow(),web).hide(WindowInsetsCompat.Type.ime()));Thread.sleep(700);JSONObject dismissed=geometry();assertFalse("IME did not dismiss",dismissed.getBoolean("imeVisible"));assertSafe(dismissed);cssInsets(phase+"-after-keyboard-dismiss");screenshot(phase+"-keyboard-dismissed");
        }
        screenshot(phase);checks.put(new JSONObject().put("phase",phase).put("geometry",before).put("systemTaps",2));
    }
    private void finishReport(String status)throws Exception {
        JSONObject report=new JSONObject().put("status",status).put("sdk",android.os.Build.VERSION.SDK_INT).put("checks",checks).put("taps",taps).put("providerRequests",0).put("loginPerformed",false).put("physicalPhone",false).put("screenshotsDirectory",output.getAbsolutePath());
        try(FileOutputStream out=new FileOutputStream(new File(output,"report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}
        Bundle data=new Bundle();data.putString("timehutReport",report.toString());inst.sendStatus(0,data);
    }
    @Test public void exportRecordedSyntheticScreenshots()throws Exception {
        inst=InstrumentationRegistry.getInstrumentation();context=inst.getTargetContext();JSONArray folders=new JSONArray();
        File[] dirs=context.getFilesDir().listFiles();assertNotNull(dirs);
        for(File source:dirs)if(source.isDirectory()&&source.getName().matches("system-ui-insets-[0-9]+")){
            File target=new File(context.getExternalFilesDir(null),source.getName());assertTrue(target.isDirectory()||target.mkdir());
            File[] files=source.listFiles();assertNotNull(files);
            for(File file:files)if(file.isFile()&&(file.getName().endsWith(".png")||file.getName().equals("report.json"))){assertTrue(file.length()<8*1024*1024);java.nio.file.Files.copy(file.toPath(),new File(target,file.getName()).toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);}
            folders.put(target.getAbsolutePath());
        }
        Bundle data=new Bundle();data.putString("timehutReport",new JSONObject().put("status","EXPORTED_SYNTHETIC_SCREENSHOTS_ONLY").put("folders",folders).toString());inst.sendStatus(0,data);
    }
    @Test public void record79ViewportOverlap()throws Exception {
        start();if(!geometry().getBoolean("webVisible")){finishReport("BASELINE_OLD_WEBVIEW_NATIVE_FALLBACK");return;}
        load(PROBE);JSONObject g=geometry();screenshot("before79-viewport-cover");checks.put(new JSONObject().put("phase","before79").put("geometry",g).put("overlapsTop",g.getInt("y")<g.getInt("barsTop")));
        finishReport("BASELINE79_VIEWPORT_MEASURED");
    }
    @Test public void safeViewportAndSystemTaps()throws Exception {
        start();try{
            Thread.sleep(800);if(!geometry().getBoolean("webVisible")){JSONObject g=geometry();assertSafe(g);assertFalse(g.getBoolean("webVisible"));screenshot("old-webview-fallback");checks.put(new JSONObject().put("phase","native-old-webview-fallback").put("geometry",g));finishReport("PASS_NATIVE_FALLBACK_SAFE_VIEWPORT");return;}
            // Actual packaged default link navigation, with no click interception.
            js("window.beforeRealBrandTap=true");tap(".brand",false);
            waitFor("location.pathname==='/account.html'&&new URLSearchParams(location.search).get('next')==='settings.html'&&typeof window.beforeRealBrandTap==='undefined'");
            assertSafe(geometry());screenshot("actual-account-brand-navigation");checks.put(new JSONObject().put("phase","actual-account-brand-navigation").put("handlerNotIntercepted",true));
            realProductControls("portrait");realUploadSheet();
            realAccountNameDisclosure();realRefinedSettings();
            probe("portrait",true);
            for(String page:new String[]{"account.html","index.html","timeline.html","album.html","search.html","settings.html","transfer.html"}){
                String html;try(InputStream in=context.getAssets().open("public/"+page)){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)bytes.write(buffer,0,n);html=bytes.toString("UTF-8");}
                // Inspect packaged HTML/CSS without account API or native transfer calls.
                html=html.replaceAll("(?is)<script\\b[^>]*>.*?</script>","").replaceAll("(?is)<link\\b[^>]*href=\"https://fonts[^>]*>","");load(html);JSONObject g=geometry();assertSafe(g);
                String selector=page.equals("timeline.html")?"#selectModeBtn":page.equals("transfer.html")?".settings-header a":page.equals("account.html")?".brand":"a,button";
                assertEquals("true",read("Boolean([...document.querySelectorAll("+JSONObject.quote(selector)+")].find(el=>{const r=el.getBoundingClientRect();if(r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight){el.dataset.safeAreaTapTarget='true';return true}}))"));tap("[data-safe-area-tap-target]");screenshot("static-"+page.replace(".html",""));
                checks.put(new JSONObject().put("phase","packaged-static-"+page).put("geometry",g).put("topControlSystemTap",true).put("scriptsOmitted",true));
            }
            device.setOrientationLeft();Thread.sleep(900);probe("landscape",false);realProductControls("landscape");device.setOrientationNatural();Thread.sleep(900);realProductControls("returned-portrait");
            finishReport("PASS_SAFE_VIEWPORT_REAL_TAPS_KEYBOARD_ROTATION_AND_PACKAGED_LAYOUTS");
        }catch(Throwable error){screenshot("failed-state");finishReport("FAIL_INSETS_OR_SYSTEM_TOUCH");throw error;}finally{device.setOrientationNatural();device.unfreezeRotation();}
    }
    @Test public void actualSystemLargeFontSettingsAndAccount()throws Exception {
        start();try{
            assertTrue("Requires actual system font scale2",context.getResources().getConfiguration().fontScale>=1.95f);
            if(!geometry().getBoolean("webVisible")){finishReport("UNVERIFIED_LARGE_FONT_OLD_WEBVIEW_FALLBACK");return;}
            int[] zoom={0};inst.runOnMainSync(()->zoom[0]=web.getSettings().getTextZoom());
            checks.put(new JSONObject().put("phase","actual-system-font-scale").put("systemScale",context.getResources().getConfiguration().fontScale).put("webViewTextZoom",zoom[0]));
            assertTrue("WebView must honor actual large-font setting",zoom[0]>=190);
            longTextFixture=true;realRefinedSettings();
            waitFor("document.querySelector('#account-auth:not([hidden])')&&document.querySelector('#account-form [name=username]')");
            assertSafe(geometry());assertEquals("true",read("document.documentElement.scrollWidth<=innerWidth+1"));screenshot("large-font-account-actual-product");
            js("document.querySelector('#account-form [name=username]').scrollIntoView({behavior:'instant',block:'center'})");
            waitFor("(()=>{const r=document.querySelector('#account-form [name=username]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()");tap("#account-form [name=username]",false);
            long end=System.currentTimeMillis()+5000;while(!geometry().getBoolean("imeVisible")&&System.currentTimeMillis()<end)Thread.sleep(100);
            assertTrue(geometry().getBoolean("imeVisible"));assertSafe(geometry());screenshot("large-font-account-actual-keyboard");device.pressBack();Thread.sleep(700);assertSafe(geometry());
            checks.put(new JSONObject().put("phase","actual-large-font-account-input-and-keyboard").put("actualProductHTMLCSSAndHandlers",true).put("credentialsEntered",false).put("geometry",geometry()));
            realAccountNameDisclosure();realProductControls("large-font");realUploadSheet();
            finishReport("PASS_ACTUAL_SYSTEM_FONT2_SETTINGS_LONG_NAME_ACCOUNT_KEYBOARD_AND_SAFE_VIEWPORT");
        }catch(Throwable error){screenshot("failed-large-font");finishReport("FAIL_ACTUAL_SYSTEM_LARGE_FONT_UI");throw error;}
    }
}
