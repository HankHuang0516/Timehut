package tw.aihankapps.timehut;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import static org.junit.Assert.*;
/** Wrapper corrupts only audited synthetic tasks, then restores exact original bytes. */
@RunWith(AndroidJUnit4.class)
public class NativeStoreTest {
 @Test public void corruptSyntheticStoreIsPreserved()throws Exception {
  Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));Thread.sleep(2000);
  android.webkit.WebView[] view=new android.webkit.WebView[1];instrumentation.runOnMainSync(()->{
   MainActivity activity=(MainActivity)ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).stream().filter(a->a instanceof MainActivity).findFirst().orElseThrow(()->new IllegalStateException("App UI did not load"));view[0]=activity.getBridge().getWebView();
   view[0].evaluateJavascript("(async()=>{try{for(let i=0;i<100&&!window.TimehutTransfers;i++)await new Promise(r=>setTimeout(r,100));const caps=await TimehutTransfers.ready;if(!caps.nativeError)throw Error('Expected bad-store error');const p=Capacitor.registerPlugin('TimehutTransfer'),rejected={};for(const method of ['list','prepareUpload']){try{await p[method]();rejected[method]=false;}catch(e){rejected[method]=true;}}window.timehutStoreQA={caps,rejected};}catch(e){window.timehutStoreQA={error:String(e)};}})()",null);
  });
  JSONObject proof=null;long deadline=System.currentTimeMillis()+12000;while(System.currentTimeMillis()<deadline){CountDownLatch done=new CountDownLatch(1);String[] value=new String[1];instrumentation.runOnMainSync(()->view[0].evaluateJavascript("JSON.stringify(window.timehutStoreQA||null)",r->{value[0]=r;done.countDown();}));assertTrue(done.await(2,TimeUnit.SECONDS));if(value[0]!=null&&!value[0].equals("null")){Object decoded=new JSONTokener(value[0]).nextValue();if(!decoded.equals("null")){proof=new JSONObject((String)decoded);break;}}Thread.sleep(100);}
  assertNotNull(proof);assertFalse(proof.toString(),proof.has("error"));assertTrue(proof.getJSONObject("rejected").getBoolean("list"));assertTrue(proof.getJSONObject("rejected").getBoolean("prepareUpload"));assertFalse(proof.getJSONObject("caps").getBoolean("nativeBackgroundUpload"));
  try(FileOutputStream out=new FileOutputStream(new File(context.getFilesDir(),"native-qa-store-report.json"))){out.write(proof.toString(2).getBytes(StandardCharsets.UTF_8));}
 }
}
