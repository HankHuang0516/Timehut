package tw.aihankapps.timehut;
import android.content.*;
public class TransferCancelReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){try{TransferEngine.initialize(context);TransferEngine.cancel(context,intent.getStringExtra("taskId"));}catch(Exception ignored){}}
}
