package tw.aihankapps.timehut;

import android.app.job.*;
import android.content.*;
import android.net.*;
import android.os.*;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.*;

/** The encrypted ledger is authoritative; the OS job contains no account data. */
public class AccountRevocationJobService extends JobService {
    // Transfer task IDs are nonnegative. Keep this stable across updates.
    static final int JOB_ID=-1738041221;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Object executionLock=new Object();
    private Execution current;

    static boolean scheduled(Context context){
        try{JobInfo job=context.getSystemService(JobScheduler.class).getPendingJob(JOB_ID);return job!=null&&job.getService().equals(new ComponentName(context,AccountRevocationJobService.class))&&job.isPersisted();}catch(Exception ignored){return false;}
    }
    static void arm(Context context,boolean replace)throws IOException{
        JobScheduler scheduler=context.getSystemService(JobScheduler.class);JobInfo old=scheduler.getPendingJob(JOB_ID);
        ComponentName service=new ComponentName(context,AccountRevocationJobService.class);
        if(old!=null&&!old.getService().equals(service))throw new IOException("帳戶背景工作編號衝突，既有工作已保留");
        if(!replace&&old!=null&&old.isPersisted())return;
        PersistableBundle extras=new PersistableBundle();extras.putString("armId",UUID.randomUUID().toString());
        JobInfo.Builder builder=new JobInfo.Builder(JOB_ID,service).setPersisted(true).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).setExtras(extras);
        // Logout follows an explicit user action. Android's expedited quota is
        // optional: retain a normal persisted retry if it is unavailable.
        if(Build.VERSION.SDK_INT>=31&&scheduler.schedule(builder.setExpedited(true).build())==JobScheduler.RESULT_SUCCESS)return;
        if(Build.VERSION.SDK_INT>=31)builder.setExpedited(false);
        if(scheduler.schedule(builder.setMinimumLatency(30000).build())!=JobScheduler.RESULT_SUCCESS)throw new IOException("手機系統暫時無法接受登出續查");
    }
    private boolean networkAllowed(Network network){
        NetworkCapabilities caps=network==null?null:getSystemService(ConnectivityManager.class).getNetworkCapabilities(network);
        return caps!=null&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }
    private final class Execution {
        final JobParameters params;final TransferNetworkRoute route;final FutureTask<Boolean> task;
        Execution(JobParameters value){params=value;Network assigned=Build.VERSION.SDK_INT>=28?value.getNetwork():getSystemService(ConnectivityManager.class).getActiveNetwork();route=new TransferNetworkRoute(assigned,AccountRevocationJobService.this::networkAllowed);
            task=new FutureTask<Boolean>(() -> {TransferEngine.initialize(AccountRevocationJobService.this);AccountClient.drainSystemRevocations(route);synchronized(TransferEngine.accountBoundary()){return TransferEngine.accounts().pendingWork();}}){
                @Override protected void done(){boolean retry=true;try{if(isCancelled())return;retry=get();}catch(Exception ignored){/* Ledger remains pending on storage/network failure. */}
                    synchronized(TransferEngine.accountBoundary()){synchronized(executionLock){
                        if(current!=Execution.this||route.stopped())return;
                        JobInfo armed=getSystemService(JobScheduler.class).getPendingJob(JOB_ID);
                        if(armed!=null&&!params.getExtras().getString("armId","").equals(armed.getExtras().getString("armId","")))return;
                        current=null;jobFinished(params,retry);
                    }}
                }
            };
        }
        boolean matches(JobParameters value){return value.getJobId()==params.getJobId()&&params.getExtras().getString("armId","").equals(value.getExtras().getString("armId",""));}
        void stop(){route.close();task.cancel(true);}
    }
    @Override public boolean onStartJob(JobParameters params){synchronized(executionLock){
        if(BuildConfig.DEBUG)android.util.Log.i("TimehutRevocationJob","pid="+android.os.Process.myPid()+" interactive="+getSystemService(PowerManager.class).isInteractive()+" keyguardLocked="+getSystemService(android.app.KeyguardManager.class).isKeyguardLocked());
        if(current!=null)current.stop();current=new Execution(params);worker.execute(current.task);return true;}}
    @Override public boolean onStopJob(JobParameters params){synchronized(executionLock){if(current!=null&&current.matches(params)){current.stop();current=null;}return true;}}
    @Override public void onNetworkChanged(JobParameters params){synchronized(executionLock){if(current!=null&&current.matches(params))current.route.update(Build.VERSION.SDK_INT>=28?params.getNetwork():getSystemService(ConnectivityManager.class).getActiveNetwork());}}
    @Override public void onDestroy(){synchronized(executionLock){if(current!=null)current.stop();current=null;}worker.shutdownNow();super.onDestroy();}
}
