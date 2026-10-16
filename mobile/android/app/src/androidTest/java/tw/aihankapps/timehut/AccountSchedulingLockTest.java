package tw.aihankapps.timehut;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Actual account/scheduler and Wi-Fi setting paths, deterministic lock contention. */
public class AccountSchedulingLockTest {
    @Test public void accountSchedulingAndNetworkPolicyShareOneLockOrder() throws Exception {
        assertTrue(BuildConfig.DEBUG);
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        TransferEngine.initialize(context);
        assertEquals("Fresh owned fixture must have no tasks to reschedule",0,TransferEngine.list().length());
        boolean original=TransferEngine.wifiOnly();
        CountDownLatch held=new CountDownLatch(1),schedule=new CountDownLatch(1);
        AtomicReference<Throwable> failure=new AtomicReference<>();
        Thread actor=new Thread(()->{try{synchronized(TransferEngine.accountBoundary()){
            held.countDown();assertTrue(schedule.await(5,TimeUnit.SECONDS));
            try{TransferEngine.schedule(context,"synthetic-nonexistent-task");fail("Missing task scheduled");}catch(Exception expected){}
        }}catch(Throwable error){failure.set(error);}},"synthetic-account-scheduler");
        Thread settings=new Thread(()->{try{TransferEngine.setWifiOnly(!original);}catch(Throwable error){failure.set(error);}},"synthetic-network-policy");
        actor.setDaemon(true);settings.setDaemon(true);actor.start();assertTrue(held.await(2,TimeUnit.SECONDS));settings.start();
        long deadline=System.currentTimeMillis()+2000;while(settings.getState()!=Thread.State.BLOCKED&&System.currentTimeMillis()<deadline)Thread.sleep(5);
        assertEquals(Thread.State.BLOCKED,settings.getState());schedule.countDown();actor.join(3000);settings.join(3000);
        assertFalse("Account scheduler deadlocked",actor.isAlive());assertFalse("Network settings deadlocked",settings.isAlive());
        if(failure.get()!=null)throw new AssertionError("Concurrent native paths failed",failure.get());
        TransferEngine.setWifiOnly(original);assertEquals(original,TransferEngine.wifiOnly());assertEquals(0,TransferEngine.list().length());
        JSONObject report=new JSONObject().put("status","PASS_NATIVE_ACCOUNT_POLICY_LOCK_CONTENTION").put("actualConcurrentThreads",2).put("dataReset",false).put("providerRequests",0).put("tasksCreated",0).put("originalPreferenceRestored",true);
        try(FileOutputStream out=new FileOutputStream(new File(context.getFilesDir(),"account-policy-lock-report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
    }
}
