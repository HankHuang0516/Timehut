package tw.aihankapps.timehut;
import android.app.Service;
import android.content.Intent;
import android.os.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class TransferForegroundService extends Service {
    private final ExecutorService executor=Executors.newFixedThreadPool(2);private final AtomicInteger active=new AtomicInteger();
    private final java.util.Set<String> scheduled=ConcurrentHashMap.newKeySet();
    private final java.util.Set<String> requestedAgain=ConcurrentHashMap.newKeySet();
    private final Object jobsLock=new Object();private boolean destroyed;private int latestStartId;
    @Override public int onStartCommand(Intent intent,int flags,int startId){if(intent==null){stopSelf();return START_NOT_STICKY;}TransferEngine.initialize(this);String id=intent.getStringExtra("taskId");startForeground(TransferEngine.jobId(id),TransferEngine.notification(id));
        synchronized(jobsLock){latestStartId=startId;enqueue(id);}return START_NOT_STICKY;}
    private void enqueue(String id){
        if(destroyed)return;if(!scheduled.add(id)){requestedAgain.add(id);return;}active.incrementAndGet();
        TransferEngine.resume(id);executor.submit(()->{try{TransferEngine.runForeground(id);}finally{synchronized(jobsLock){
            scheduled.remove(id);
            if(requestedAgain.remove(id)&&!destroyed&&TransferNetworkPreferences.reschedule(TransferEngine.get(id)))enqueue(id);
            if(active.decrementAndGet()==0&&stopSelfResult(latestStartId))stopForeground(STOP_FOREGROUND_REMOVE);
        }}});
    }
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public void onDestroy(){synchronized(jobsLock){destroyed=true;requestedAgain.clear();executor.shutdownNow();}super.onDestroy();}
}
