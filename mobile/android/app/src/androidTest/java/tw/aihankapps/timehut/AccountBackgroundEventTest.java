package tw.aihankapps.timehut;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import org.json.*;
import org.junit.Test;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Actual OS-dispatched download401 -> native event -> visible WebView account closure. */
public class AccountBackgroundEventTest {
    private Instrumentation instrumentation;private WebView view;
    private String js(String expression)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();instrumentation.runOnMainSync(()->view.evaluateJavascript(expression,result->{value.set(result);done.countDown();}));assertTrue(done.await(2,TimeUnit.SECONDS));return value.get();}
    private JSONObject request(String expression)throws Exception{String id=UUID.randomUUID().toString();js("window.eventCalls=window.eventCalls||{};(async()=>{try{eventCalls['"+id+"']={result:await ("+expression+")||{}};}catch(e){eventCalls['"+id+"']={error:String(e)};}})()");long until=System.currentTimeMillis()+12000;while(System.currentTimeMillis()<until){Object raw=new JSONTokener(js("JSON.stringify(window.eventCalls?.['"+id+"']||null)")).nextValue();if(raw instanceof String&&!raw.equals("null"))return new JSONObject((String)raw);Thread.sleep(40);}throw new AssertionError("Owned event request not completed; preserve state");}
    private void load(Context context)throws Exception{context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));long until=System.currentTimeMillis()+35000;boolean[] loaded={false},opened={false};while(System.currentTimeMillis()<until&&!loaded[0]){instrumentation.runOnMainSync(()->{for(android.app.Activity a:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(a instanceof MainActivity){view=((MainActivity)a).getBridge().getWebView();if(!opened[0]){view.loadUrl("https://localhost/account.html");opened[0]=true;}view.evaluateJavascript("document.readyState==='complete'&&!!window.TimehutAccounts",r->loaded[0]="true".equals(r));}});Thread.sleep(60);}assertTrue(loaded[0]);}
    @Test public void background401ClosesVisibleAccountWithoutVisibilityRefresh()throws Exception{
        assertTrue(BuildConfig.DEBUG);assertTrue(android.os.Build.VERSION.SDK_INT>=36);instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();TransferEngine.initialize(context);assertNull("Existing account preserved",TransferEngine.accounts().currentOwner());assertEquals(0,TransferEngine.accounts().pendingRevocations().length());assertEquals(0,TransferEngine.accounts().bridgeStatus().getInt("pendingLoginReceipts"));String before=AccountClient.testBackend;JSONObject report=new JSONObject().put("status","UNCONFIRMED").put("providerRequests",0).put("dataReset",false).put("physicalPhone",false);String id=null;
        try(AccountClientBridgeTest.Fixture fixture=new AccountClientBridgeTest.Fixture()){
            AccountClient.testBackend=fixture.endpoint();load(context);JSONObject signin=request("TimehutAccounts.signIn({username:'synthetic-alpha',password:'artificial-native-secret',displayName:'人工甲',register:true})");assertFalse(signin.toString(),signin.has("error"));assertEquals("true",js("TimehutAccounts.status().authenticated"));String owner=TransferEngine.accounts().currentOwner();
            fixture.tokens.remove(fixture.lastToken);JSONObject task=TransferEngine.newRecord("download","synthetic-event.png","photo");id=task.getString("id");task.put("endpoint",fixture.endpoint()+"/api/photo/1/image?size=o").put("stage","failed").put("tags","synthetic-account-lifecycle-only");TransferEngine.put(task);JSONObject scope=AccountClient.bridgeStatus();JSONObject args=new JSONObject().put("id",id).put("expectedOwner",owner).put("expectedGeneration",scope.getString("generation"));JSONObject retry=request("Capacitor.registerPlugin('TimehutTransfer').retry("+args+")");assertFalse(retry.toString(),retry.has("error"));
            long until=System.currentTimeMillis()+12000;boolean closed=false;while(System.currentTimeMillis()<until){if("false".equals(js("TimehutAccounts.status().authenticated"))){closed=true;break;}Thread.sleep(50);}assertTrue("Background401 must notify the visible page",closed);assertEquals("\"visible\"",js("document.visibilityState"));assertNull(TransferEngine.accounts().currentOwner());assertEquals(owner,TransferEngine.get(id).getString("ownerUserId"));assertEquals("waiting_account",TransferEngine.get(id).getString("stage"));
            JSONObject next=request("TimehutAccounts.signIn({username:'synthetic-bravo',password:'artificial-native-secret',displayName:'人工乙',register:true})");assertFalse(next.toString(),next.has("error"));String b=TransferEngine.accounts().currentOwner();assertNotEquals(owner,b);TransferEngine.accountObserver.run();TransferEngine.accountObserver.run();Thread.sleep(150);assertEquals("\"synthetic-bravo\"",js("TimehutAccounts.status().user.username"));assertEquals(b,TransferEngine.accounts().currentOwner());
            JSONObject logout=request("TimehutAccounts.signOut()");assertFalse(logout.toString(),logout.has("error"));assertTrue(logout.getJSONObject("result").getBoolean("serverConfirmed"));assertEquals(0,TransferEngine.accounts().pendingRevocations().length());assertEquals(0,TransferEngine.accounts().bridgeStatus().getInt("pendingLoginReceipts"));report.put("status","PASS_ANDROID_BACKGROUND401_NATIVE_EVENT").put("eventCases",2).put("actualWebView",true).put("actualOSDownload401",true).put("visibilityRefreshRequired",false).put("newAccountPreservedAcrossDuplicateEvents",true).put("taskId",id).put("taskOwnerPreserved",true).put("finalPending",0);
        }finally{AccountClient.testBackend=before;try(FileOutputStream out=new FileOutputStream(new File(context.getFilesDir(),"background-account-event-report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));out.getFD().sync();}}
    }
}
