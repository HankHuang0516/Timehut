package tw.aihankapps.timehut;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.media.ThumbnailUtils;
import android.util.Size;
import android.util.Base64;
import android.content.ContentValues;
import android.database.Cursor;
import android.provider.OpenableColumns;
import com.getcapacitor.*;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import androidx.activity.result.ActivityResult;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.RejectedExecutionException;

@CapacitorPlugin(name = "TimehutTransfer", permissions = {@Permission(alias="completionNotifications", strings={android.Manifest.permission.POST_NOTIFICATIONS})})
public class TransferPlugin extends Plugin {
    private boolean notificationRequestPending=false;
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private final ExecutorService accountClosures=Executors.newSingleThreadExecutor();
    private final ExecutorService saveExecutor=new ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(8),new ThreadPoolExecutor.AbortPolicy());
    private final ExecutorService thumbnailExecutor = new ThreadPoolExecutor(2,2,0L,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(8),new ThreadPoolExecutor.AbortPolicy());
    private final Set<String> savingIds=java.util.concurrent.ConcurrentHashMap.newKeySet();
    private Runnable accountNotification;
    interface OperationObserver {void at(String operation,String id)throws Exception;}
    static volatile OperationObserver testObserver;
    private static void observe(String operation,String id)throws Exception{OperationObserver value=testObserver;if(BuildConfig.DEBUG&&value!=null)value.at(operation,id);}
    private static AccountClient.Session caller(PluginCall call)throws Exception {
        return AccountClient.bridgeSession(call.getString("expectedOwner"),call.getString("expectedGeneration"));
    }
    @Override protected void handleOnDestroy(){if(TransferEngine.accountObserver==accountNotification)TransferEngine.accountObserver=null;executor.shutdown();accountClosures.shutdown();saveExecutor.shutdownNow();thumbnailExecutor.shutdownNow();super.handleOnDestroy();}
    @Override public void load() { try{TransferEngine.initialize(getContext());java.lang.ref.WeakReference<TransferPlugin> reference=new java.lang.ref.WeakReference<>(this);accountNotification=()->{TransferPlugin plugin=reference.get();if(plugin!=null&&plugin.getActivity()!=null)plugin.getActivity().runOnUiThread(()->plugin.notifyListeners("accountChanged",new JSObject()));};TransferEngine.accountObserver=accountNotification;AccountClient.retryRevocations();}catch(IllegalStateException error){/* capabilities/list report the preserved storage failure. */} }
    @PluginMethod public void capabilities(PluginCall call) {
        try{TransferEngine.validateStore();}catch(Exception e){call.reject(e.getMessage());return;}
        JSObject result = new JSObject(); result.put("nativeBackgroundUpload",true); result.put("nativeBackgroundDownload",true);
        result.put("accountSessions",true);result.put("photoLibrarySave", Build.VERSION.SDK_INT >= 29); result.put("photoLibraryStatus",true); result.put("notifications",true); result.put("completionNotifications",true); result.put("wifiPolicy",true); result.put("ongoingTransferNotifications",true); result.put("localThumbnails",true); result.put("platform","android"); call.resolve(result);
    }
    @PluginMethod public void accountStatus(PluginCall call){try{call.resolve(JSObject.fromJSONObject(AccountClient.bridgeStatus()));}catch(Exception error){call.reject("帳戶狀態尚未確認，原件保留");}}
    @PluginMethod public void accountSignIn(PluginCall call){try{String generation=call.getString("expectedGeneration");AccountClient.requireBridgeGeneration(generation);executor.submit(()->{try{observe("accountSignIn","");AccountClient.requireBridgeGeneration(generation);call.resolve(JSObject.fromJSONObject(AccountClient.signIn(call.getString("backend",AccountClient.defaultBackend()),call.getString("username"),call.getString("password"),call.getString("displayName",""),Boolean.TRUE.equals(call.getBoolean("register",false)),generation)));}catch(Exception error){call.reject(error.getMessage());}});}catch(Exception error){call.reject("帳戶已變更，請重新操作");}}
    @PluginMethod public void accountRequest(PluginCall call){try{AccountClient.Session session=AccountClient.bridgeSession(call.getString("expectedOwner"),call.getString("expectedGeneration"));executor.submit(()->{try{observe("accountRequest","");call.resolve(JSObject.fromJSONObject(AccountClient.request(call.getString("method","GET"),call.getString("path",""),call.getObject("body"),session)));}catch(Exception error){call.reject(error.getMessage());}});}catch(Exception error){call.reject("帳戶已變更，請重新操作");}}
    @PluginMethod public void accountSignOut(PluginCall call){try{AccountClient.Logout logout=AccountClient.beginSignOut(call.getString("expectedOwner"),call.getString("expectedGeneration"),Boolean.TRUE.equals(call.getBoolean("pendingLogin",false)));accountClosures.submit(()->{try{observe("accountSignOut","");call.resolve(JSObject.fromJSONObject(AccountClient.finishSignOut(logout)));}catch(Exception error){call.reject("登出尚未確認，請重新操作；原件保留");}});}catch(Exception error){call.reject("帳戶已變更，請重新操作");}}
    @PluginMethod public void enableAccountMode(PluginCall call){executor.submit(()->{try{synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().enableAccountMode();TransferEngine.accountChanged();call.resolve(JSObject.fromJSONObject(TransferEngine.accounts().bridgeStatus()));}}catch(Exception error){call.reject("帳戶模式尚未確認，原件保留");}});}
    @PluginMethod public void setAccountSession(PluginCall call){if(!BuildConfig.DEBUG){call.reject("請使用我的帳戶登入");return;}executor.submit(()->{try{String backend=call.getString("backend",AccountIdentity.BACKEND),token=call.getString("token","");JSONObject profile=AccountIdentity.verify(backend,token,call.getString("owner"));synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().activateVerified(profile.getJSONObject("user").getString("id"),token,profile.getLong("expiresAt"),profile.getBoolean("legacyOwner"),backend);TransferEngine.accountChanged();call.resolve(JSObject.fromJSONObject(profile));}}catch(Exception error){call.reject("帳戶連線尚未確認，請重新登入；原件保留");}});}
    @PluginMethod public void clearAccountSession(PluginCall call){if(!BuildConfig.DEBUG){call.reject("請使用我的帳戶登出");return;}executor.submit(()->{try{synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().signOut();TransferEngine.accountChanged();call.resolve();}AccountClient.retryRevocations();}catch(Exception error){call.reject("登出尚未確認，原件保留");}});}
    @PluginMethod public void photoLibrarySettings(PluginCall call) {
        boolean supported=Build.VERSION.SDK_INT>=29;
        JSObject result=new JSObject();result.put("supported",supported);result.put("canSave",supported);
        result.put("permission",supported?"not-required":"unsupported");result.put("scope",supported?"own-media":"none");call.resolve(result);
    }
    @PluginMethod public void networkSettings(PluginCall call){try{call.resolve(JSObject.fromJSONObject(TransferEngine.networkSettings()));}catch(Exception error){call.reject("網路設定暫時無法讀取；請更新狀態確認");}}
    @PluginMethod public void setWifiOnly(PluginCall call){Boolean enabled=call.getBoolean("enabled");if(enabled==null){call.reject("缺少網路選項");return;}executor.submit(()->{try{call.resolve(JSObject.fromJSONObject(TransferEngine.setWifiOnly(enabled)));}catch(Exception error){call.reject("網路設定未能確認，原檔與收據保留；請更新狀態");}});}
    @PluginMethod public void notificationSettings(PluginCall call){try{call.resolve(JSObject.fromJSONObject(TransferEngine.notifications().settings()));}catch(Exception error){call.reject("通知設定暫時無法讀取；傳輸不受影響");}}
    @PluginMethod public synchronized void setCompletionNotifications(PluginCall call){
        Boolean enabled=call.getBoolean("enabled");if(enabled==null){call.reject("缺少通知選項");return;}
        if(notificationRequestPending){call.reject("請先完成目前的通知設定");return;}
        if(enabled&&Build.VERSION.SDK_INT>=33&&getPermissionState("completionNotifications")!=PermissionState.GRANTED){
            notificationRequestPending=true;try{requestPermissionForAlias("completionNotifications",call,"completionNotificationPermission");}catch(Exception error){notificationRequestPending=false;call.reject("無法開啟通知權限提示");}return;
        }
        finishNotificationPreference(call,enabled);
    }
    @PermissionCallback private synchronized void completionNotificationPermission(PluginCall call){notificationRequestPending=false;if(call!=null)finishNotificationPreference(call,true);}
    private void finishNotificationPreference(PluginCall call,boolean enabled){try{call.resolve(JSObject.fromJSONObject(TransferEngine.notifications().setEnabled(enabled)));}catch(Exception error){call.reject("通知設定未能保存；傳輸不受影響");}}
    @PluginMethod public void list(PluginCall call) { try{synchronized(TransferEngine.accountBoundary()){caller(call);JSObject result=new JSObject();result.put("tasks",TransferEngine.visibleTasks());call.resolve(result);}}catch(Exception e){call.reject(e.getMessage());} }
    // Only this task's complete private original can be decoded. The bridge accepts no path/URL.
    static File thumbnailFile(JSONObject task, String id) throws Exception {
        if (task == null || !id.equals(task.optString("id")) || !UUID.fromString(id).toString().equalsIgnoreCase(id)) return null;
        boolean upload = "upload".equals(task.optString("direction"));
        if (!upload && !("download".equals(task.optString("direction")) && Arrays.asList("file_ready","saving","saved").contains(task.optString("stage")))) return null;
        String reference = task.optString(upload ? "sourceReference" : "destinationReference");
        if (reference.isEmpty()) return null;
        File candidate = new File(reference), canonical = candidate.getCanonicalFile();
        File directory = TransferEngine.file("tasks.json").getParentFile().getCanonicalFile();
        String expectedName = upload ? id + "-source" : id + "-" + task.optString("filename");
        if (!directory.equals(canonical.getParentFile()) || !canonical.getName().equals(expectedName) || !canonical.isFile() || !canonical.canRead() || canonical.length() <= 0) return null;
        return canonical;
    }
    private static Bitmap photoThumbnail(File file) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) return ThumbnailUtils.createImageThumbnail(file,new Size(160,160),null);
        BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds=true;
        BitmapFactory.decodeFile(file.getAbsolutePath(),bounds);
        if(bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
        BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize=1;
        while(Math.max(bounds.outWidth,bounds.outHeight)/(long)options.inSampleSize > 256) options.inSampleSize*=2;
        Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath(),options);
        if(bitmap==null) return null;
        int orientation;
        try { orientation=new ExifInterface(file.getAbsolutePath()).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL); }
        catch(IOException ignored) { orientation=ExifInterface.ORIENTATION_NORMAL; }
        Matrix transform = new Matrix();
        switch(orientation) {
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: transform.setScale(-1,1); break;
            case ExifInterface.ORIENTATION_ROTATE_180: transform.setRotate(180); break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL: transform.setScale(1,-1); break;
            case ExifInterface.ORIENTATION_TRANSPOSE: transform.setRotate(90); transform.postScale(-1,1); break;
            case ExifInterface.ORIENTATION_ROTATE_90: transform.setRotate(90); break;
            case ExifInterface.ORIENTATION_TRANSVERSE: transform.setRotate(-90); transform.postScale(-1,1); break;
            case ExifInterface.ORIENTATION_ROTATE_270: transform.setRotate(-90); break;
        }
        if (!transform.isIdentity()) {
            Bitmap rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),transform,true);
            if(rotated!=bitmap) bitmap.recycle(); bitmap=rotated;
        }
        return bitmap;
    }
    @PluginMethod public void thumbnail(PluginCall call) {
        final String id=call.getString("id","");
        final TransferEngine.AccountLease lease;
        try { synchronized(TransferEngine.accountBoundary()){caller(call);TransferEngine.validateStore();lease=TransferEngine.accountLease(id);} }
        catch(Exception e) { call.reject("傳輸收據無法讀取，預覽暫不可用"); return; }
        try { thumbnailExecutor.submit(()->{
            Bitmap bitmap=null;
            try {
                TransferEngine.validateStore();
                TransferEngine.authorize(lease,id);observe("thumbnail-start",id);TransferEngine.authorize(lease,id);
                JSONObject task=TransferEngine.ownedTask(id); File file=thumbnailFile(task,id);
                JSObject result=new JSObject();result.put("available",false);
                if(file==null){call.resolve(result);return;}
                boolean video="video".equals(task.optString("mediaType"));
                if(!video && !"photo".equals(task.optString("mediaType"))){call.resolve(result);return;}
                if(video) bitmap=Build.VERSION.SDK_INT>=29 ? ThumbnailUtils.createVideoThumbnail(file,new Size(160,160),null) : ThumbnailUtils.createVideoThumbnail(file.getAbsolutePath(),MediaStore.Video.Thumbnails.MINI_KIND);
                else bitmap=photoThumbnail(file);
                if(bitmap==null){call.resolve(result);return;}
                int longest=Math.max(bitmap.getWidth(),bitmap.getHeight());
                if(longest>160){float scale=160f/longest;Bitmap small=Bitmap.createScaledBitmap(bitmap,Math.max(1,Math.round(bitmap.getWidth()*scale)),Math.max(1,Math.round(bitmap.getHeight()*scale)),true);if(small!=bitmap)bitmap.recycle();bitmap=small;}
                ByteArrayOutputStream output=new ByteArrayOutputStream();
                if(!bitmap.compress(Bitmap.CompressFormat.JPEG,78,output) || output.size()>65536){call.resolve(result);return;}
                result.put("available",true);result.put("width",bitmap.getWidth());result.put("height",bitmap.getHeight());
                result.put("dataUrl","data:image/jpeg;base64,"+Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP));observe("thumbnail-ready",id);
                synchronized(TransferEngine.accountBoundary()){TransferEngine.authorize(lease,id);call.resolve(result);}
            } catch(Exception error) { JSObject result=new JSObject();result.put("available",false);call.resolve(result); }
            finally { if(bitmap!=null && !bitmap.isRecycled())bitmap.recycle(); }
        }); } catch(RejectedExecutionException unavailable) { JSObject result=new JSObject();result.put("available",false);call.resolve(result); }
    }
    @PluginMethod public void prepareUpload(PluginCall call) {
        try{synchronized(TransferEngine.accountBoundary()){caller(call);TransferEngine.validateStore();}}catch(Exception e){call.reject(e.getMessage());return;}
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.setType("*/*"); intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/*","video/*"});
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true); intent.addCategory(Intent.CATEGORY_OPENABLE); startActivityForResult(call,intent,"picked");
    }
    @ActivityCallback private void picked(PluginCall call, ActivityResult result) {
        if(call==null)return; if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null){JSObject r=new JSObject();r.put("tasks",new JSArray());call.resolve(r);return;}
        Intent data=result.getData(); List<Uri> sources=new ArrayList<>();
        if(data.getClipData()!=null)for(int i=0;i<data.getClipData().getItemCount();i++)sources.add(data.getClipData().getItemAt(i).getUri());else if(data.getData()!=null)sources.add(data.getData());
        executor.submit(()->{
            JSONArray tasks=new JSONArray(),errors=new JSONArray();
            for(Uri uri:sources)try{
                AccountClient.Session actor;synchronized(TransferEngine.accountBoundary()){actor=caller(call);}
                String mime=getContext().getContentResolver().getType(uri);if(!Arrays.asList("image/jpeg","image/png","image/gif","image/webp","video/mp4","video/quicktime","video/x-msvideo","video/mpeg").contains(mime))throw new IOException("Flickr 不支援此格式，請匯出 JPEG/PNG 照片或 MP4 影片後再選取；手機原檔不會修改");
                String name="media";try(Cursor cursor=getContext().getContentResolver().query(uri,null,null,null,null)){if(cursor!=null&&cursor.moveToFirst())name=cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME));}
                JSONObject task;File target;
                synchronized(TransferEngine.accountBoundary()){AccountClient.require(actor);task=TransferEngine.newRecord("upload",name,mime.startsWith("video/")?"video":"photo");String id=task.getString("id");target=TransferEngine.file(id+"-source");task.put("sourceReference",target.getAbsolutePath());task.put("mimeType",mime);TransferEngine.put(task);}
                try(InputStream input=getContext().getContentResolver().openInputStream(uri);OutputStream output=new FileOutputStream(target)){if(input==null)throw new IOException("無法讀取選取檔案");byte[] bytes=new byte[1024*1024];int n;while((n=input.read(bytes))!=-1){synchronized(TransferEngine.accountBoundary()){AccountClient.require(actor);}output.write(bytes,0,n);}}
                synchronized(TransferEngine.accountBoundary()){AccountClient.require(actor);task.put("byteSize",target.length());task.put("stage","queued");TransferEngine.put(task);tasks.put(task);}
            }catch(Exception e){errors.put(e.getMessage());}
            try{synchronized(TransferEngine.accountBoundary()){caller(call);JSObject r=new JSObject();r.put("tasks",tasks);r.put("errors",errors);call.resolve(r);}}catch(Exception changed){call.reject("選取期間帳戶已變更，原件保留在原帳戶");}
        });
    }
    @PluginMethod public void enqueueUpload(PluginCall call) {
        try{synchronized(TransferEngine.accountBoundary()){caller(call);String id=call.getString("id","");JSONObject task=TransferEngine.ownedTask(id);if(!"queued".equals(task.optString("stage")))throw new IOException("此檔案已送出或無法讀取");
            String endpoint=call.getString("endpoint","").replaceAll("/+$","");if(!endpoint.equals("https://just-healing-production.up.railway.app")&&!TransferEngine.debugEndpoint(endpoint))throw new IOException("無效的上傳服務");
            String album=call.getString("albumId","");if(!album.matches("[0-9]+")&&!album.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"))throw new IOException("請選擇相簿");
            task.put("endpoint",endpoint);task.put("albumId",album);task.put("tags",call.getString("tags",""));TransferEngine.put(task);TransferEngine.schedule(getContext(),id);call.resolve(JSObject.fromJSONObject(TransferEngine.get(id)));
        }}catch(Exception e){call.reject(e.getMessage());}
    }
    @PluginMethod public void enqueueDownload(PluginCall call) {
        try{AccountClient.Session actor;synchronized(TransferEngine.accountBoundary()){actor=caller(call);}observe("enqueueDownload","");synchronized(TransferEngine.accountBoundary()){AccountClient.require(actor);String url=call.getString("url","");TransferEngine.validateMediaUrl(url);String media=call.getString("mediaType","photo");if(!media.equals("photo")&&!media.equals("video"))throw new IOException("無效的媒體類型");
            if(TransferEngine.accounts().accountMode()&&!TransferEngine.accounts().bridgeStatus().optBoolean("legacyOwner")&&!AccountIdentity.origin(url).equals(TransferEngine.accounts().issuerOrigin()))throw new IOException("請從自己的相簿下載");
            JSONObject task=TransferEngine.newRecord("download",call.getString("filename","media"),media);task.put("endpoint",url);task.put("stage","queued");TransferEngine.put(task);TransferEngine.schedule(getContext(),task.getString("id"));call.resolve(JSObject.fromJSONObject(task));
        }}catch(Exception e){call.reject(e.getMessage());}
    }
    @PluginMethod public void cancel(PluginCall call) {try{synchronized(TransferEngine.accountBoundary()){caller(call);TransferEngine.ownedTask(call.getString("id",""));TransferEngine.cancel(getContext(),call.getString("id",""));call.resolve();}}catch(Exception e){call.reject(e.getMessage());}}
    @PluginMethod public void retry(PluginCall call) {try{synchronized(TransferEngine.accountBoundary()){caller(call);String id=call.getString("id","");JSONObject task=TransferEngine.ownedTask(id);if(!Arrays.asList("failed","cancelled","waiting_network","waiting_wifi","waiting_system","waiting_account").contains(task.optString("stage")))throw new IOException("目前不可重試此任務");if(!task.optString("serverReceiptId").isEmpty())TransferEngine.change(id,"retryReceipt",true);TransferEngine.change(id,"stage","queued");TransferEngine.schedule(getContext(),id);call.resolve();}}catch(Exception e){call.reject(e.getMessage());}}
    @PluginMethod public void saveToPhotos(PluginCall call) {
        if(Build.VERSION.SDK_INT<29){call.reject("此 Android 版本請使用檔案分享保存");return;}
        String id=call.getString("id","");JSONObject task;final TransferEngine.AccountLease lease;
        try{synchronized(TransferEngine.accountBoundary()){caller(call);task=TransferEngine.ownedTask(id);lease=TransferEngine.accountLease(id);if(!savingIds.add(id))throw new IOException("此檔案正在保存");}}catch(Exception error){call.reject("請登入此工作原本的帳戶，並確認沒有正在保存");return;}
        if(task==null||!task.optString("stage").equals("file_ready")){savingIds.remove(id);call.reject("尚無完整下載檔案");return;}
        try{saveExecutor.submit(()->{
            Uri uri=null;try{
                observe("save-queued",id);TransferEngine.authorize(lease,id);
                ContentValues values=new ContentValues();values.put(MediaStore.MediaColumns.DISPLAY_NAME,task.getString("filename"));values.put(MediaStore.MediaColumns.MIME_TYPE,task.getString("mimeType"));values.put(MediaStore.MediaColumns.RELATIVE_PATH,task.optString("mediaType").equals("video")?"Movies/Timehut":"Pictures/Timehut");values.put(MediaStore.MediaColumns.IS_PENDING,1);
                Uri collection=task.optString("mediaType").equals("video")?MediaStore.Video.Media.EXTERNAL_CONTENT_URI:MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                synchronized(TransferEngine.accountBoundary()){TransferEngine.authorize(lease,id);uri=getContext().getContentResolver().insert(collection,values);}if(uri==null)throw new IOException("無法建立相簿檔案");
                try(InputStream input=new FileInputStream(task.getString("destinationReference"));OutputStream output=getContext().getContentResolver().openOutputStream(uri)){if(output==null)throw new IOException("無法保存至相簿");byte[] b=new byte[1024*1024];int n;while((n=input.read(b))!=-1){TransferEngine.authorize(lease,id);output.write(b,0,n);observe("save-copy",id);}}
                observe("save-ready",id);
                synchronized(TransferEngine.accountBoundary()){TransferEngine.authorize(lease,id);
                ContentValues done=new ContentValues();done.put(MediaStore.MediaColumns.IS_PENDING,0);if(getContext().getContentResolver().update(uri,done,null,null)!=1)throw new IOException("相簿未確認保存");
                TransferEngine.change(id,"savedAssetId",uri.toString());TransferEngine.change(id,"stage","saved");JSObject r=new JSObject();r.put("savedAssetId",uri.toString());call.resolve(r);
                }
            }catch(Exception e){if(uri!=null)try{getContext().getContentResolver().delete(uri,null,null);}catch(Exception ignored){}call.reject("保存未完成，請登入原帳戶重新操作；下載原檔仍保留");}
            finally{savingIds.remove(id);}
        });}catch(RejectedExecutionException unavailable){savingIds.remove(id);call.reject("目前保存工作較多，請稍後重試；下載原檔仍保留");}
    }
}
