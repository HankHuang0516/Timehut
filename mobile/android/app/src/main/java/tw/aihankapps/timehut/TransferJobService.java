package tw.aihankapps.timehut;
import android.app.job.*;
import android.os.Build;
import java.util.concurrent.*;

public class TransferJobService extends JobService {
    private final ConcurrentHashMap<Integer,Execution> jobs=new ConcurrentHashMap<>();
    private final ExecutorService executor=Executors.newFixedThreadPool(2);
    private final class Execution {
        final TransferNetworkRoute route;
        final FutureTask<Boolean> future;
        Execution(JobParameters params,String id){
            route=TransferEngine.route(Build.VERSION.SDK_INT>=28?params.getNetwork():TransferEngine.selectNetwork());
            future=new FutureTask<Boolean>(() -> TransferEngine.run(id,route)){
                @Override protected void done(){
                    if(isCancelled()||!jobs.remove(params.getJobId(),Execution.this))return;
                    try{jobFinished(params,get());}catch(Exception error){jobFinished(params,true);}
                }
            };
        }
        void stop(){route.close();future.cancel(true);}
    }
    @Override public boolean onStartJob(JobParameters params){TransferEngine.initialize(this);String id=params.getExtras().getString("taskId");
        if(!TransferEngine.visible(TransferEngine.get(id)))return false;
        if(Build.VERSION.SDK_INT>=34)setNotification(params,TransferEngine.jobId(id),TransferEngine.notification(id),JOB_END_NOTIFICATION_POLICY_REMOVE);
        Execution execution=new Execution(params,id);Execution previous=jobs.put(params.getJobId(),execution);if(previous!=null)previous.stop();
        TransferEngine.resume(id);executor.execute(execution.future);return true;}
    @Override public void onNetworkChanged(JobParameters params){Execution execution=jobs.get(params.getJobId());if(execution!=null)execution.route.update(Build.VERSION.SDK_INT>=28?params.getNetwork():TransferEngine.selectNetwork());}
    @Override public boolean onStopJob(JobParameters params){String id=params.getExtras().getString("taskId");TransferEngine.pause(id);Execution execution=jobs.remove(params.getJobId());if(execution!=null)execution.stop();return TransferEngine.systemStopped(id);}
    @Override public void onDestroy(){for(Execution execution:jobs.values())execution.stop();jobs.clear();executor.shutdownNow();super.onDestroy();}
}
