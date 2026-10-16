package tw.aihankapps.timehut;

import android.app.*;
import android.app.job.*;
import android.content.*;
import android.net.*;
import android.os.*;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

final class TransferEngine {
    private static Context context;
    private static File directory;
    private static final Object LOCK=new Object();
    private static JSONObject records=new JSONObject();
    private static volatile Exception storageError;
    private static TransferCompletionNotifications completionNotifications;
    private static TransferNetworkPreferences networkPreferences;
    private static AccountSessionStore accountSessions;
    static volatile Runnable accountObserver;
    private static final Map<String,Runnable> networkWaiters=new ConcurrentHashMap<>();
    private static final Map<String,HttpURLConnection> connections=new ConcurrentHashMap<>();
    private static final class RequestAuthority {final HttpURLConnection connection;final String owner,token;RequestAuthority(HttpURLConnection c,String o,String t){connection=c;owner=o;token=t;}}
    private static final Map<String,RequestAuthority> requestAuthorities=new ConcurrentHashMap<>();
    private static final Set<String> paused=ConcurrentHashMap.newKeySet();
    private static final ThreadLocal<TransferNetworkRoute> jobRoute=new ThreadLocal<>();
    private static final Map<String,java.util.concurrent.locks.ReentrantLock> runLocks=new ConcurrentHashMap<>();
    static void resume(String id){paused.remove(id);}
    static void pause(String id){paused.add(id);HttpURLConnection c=connections.remove(id);if(c!=null)c.disconnect();}
    static boolean systemStopped(String id){synchronized(LOCK){
        JSONObject record=get(id);
        // A delayed OS stop cannot reopen a completed/cancelled record, even
        // after its owner has signed out or another account is active.
        if(record==null||Arrays.asList("cancelled","completed","photo_deleted","file_ready","saving","saved").contains(record.optString("stage")))return false;
        if(record!=null&&!visible(record)){try{record.put("stage","waiting_account");record.put("waitReason","請登入原帳戶後繼續");put(record);}catch(Exception error){throw new IllegalStateException(error);}return false;}
        try{boolean wifi=wifiOnly()&&selectNetwork()==null;record.put("stage",wifi?"waiting_wifi":"waiting_system");record.put("waitReason",wifi?"等待可用的 Wi-Fi；原檔與收據保留":"手機系統暫停傳輸，會等待恢復");put(record);return true;}
        catch(Exception error){throw new IllegalStateException("任務收據保存失敗",error);}
    }}
    static void initialize(Context ctx){synchronized(LOCK){if(context!=null){validateStore();return;}context=ctx.getApplicationContext();directory=new File(context.getNoBackupFilesDir(),"transfers");directory.mkdirs();
        try{accountSessions=new AccountSessionStore(context);
            // A cold OS job can run before the first WebView/account-status call
            // after a test56 upgrade. Close legacy access before reading any task.
            // DEBUG retains the isolated legacy-protocol fixture compatibility.
            if(!BuildConfig.DEBUG)accountSessions.enableAccountMode();
            networkPreferences=new TransferNetworkPreferences(file("network-policy.json"));AtomicFile store=new AtomicFile(file("tasks.json"));byte[] stored=readAtomicReceipt(store);if(stored!=null)records=new JSONObject(new String(stored,StandardCharsets.UTF_8));
            for(java.util.Iterator<String> keys=records.keys();keys.hasNext();)if(!records.getJSONObject(keys.next()).optString("ownerUserId").isEmpty()&&!accountSessions.accountMode()){accountSessions.enableAccountMode();break;}
            Set<Integer> scheduled=new HashSet<>();if(Build.VERSION.SDK_INT>=34)for(JobInfo job:context.getSystemService(JobScheduler.class).getAllPendingJobs())scheduled.add(job.getId());
            List<String> persistedIds=new ArrayList<>();records.keys().forEachRemaining(persistedIds::add);
            for(String id:persistedIds){JSONObject r=get(id);boolean submittedQueue=r.optString("stage").equals("queued")&&!r.optString("endpoint").isEmpty();boolean interrupted=Arrays.asList("transferring","server_accepted","server_processing","waiting_network","waiting_wifi").contains(r.optString("stage"));if((submittedQueue||interrupted)&&!scheduled.contains(jobId(id))){r.put("stage","waiting_system");r.put("waitReason","先前傳輸已中斷，原檔與收據保留；可重試繼續確認");put(r);}}
        }catch(Exception e){storageError=e;throw new IllegalStateException("任務收據無法讀取，既有檔案已保留",e);}
        completionNotifications=new TransferCompletionNotifications(context);
        NotificationManager manager=context.getSystemService(NotificationManager.class);if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel("timehut-transfers","照片與影片傳輸",NotificationManager.IMPORTANCE_LOW));}}
    // ATOMIC_RECEIPT_READ_BEGIN — used under each store's own lock.
    static byte[] readAtomicReceipt(AtomicFile store)throws IOException{
        try{return store.readFully();}
        catch(FileNotFoundException missing){
            File base=store.getBaseFile(),parent=base.getParentFile();
            if(base.exists()||new File(base.getPath()+".bak").exists()||new File(base.getPath()+".new").exists()||parent==null||!parent.isDirectory()||!parent.canRead()||!parent.canExecute())throw missing;
            return null;
        }
    }
    // ATOMIC_RECEIPT_READ_END
    static TransferCompletionNotifications notifications(){return completionNotifications;}
    static AccountSessionStore accounts(){validateStore();return accountSessions;}
    // Account commits and final bridge/media publication share the task lock.
    // Always acquire this lock before the credential store's own lock.
    static Object accountBoundary(){return LOCK;}
    static final class AccountLease {final String owner;final long generation;AccountLease(String o,long g){owner=o;generation=g;}}
    static AccountLease accountLease(String id)throws Exception{synchronized(LOCK){JSONObject row=ownedTask(id);return new AccountLease(row.optString("ownerUserId"),accountSessions.generation());}}
    static void authorize(AccountLease lease,String id)throws Exception{synchronized(LOCK){JSONObject row=ownedTask(id);if(lease==null||lease.generation!=accountSessions.generation()||!lease.owner.equals(row.optString("ownerUserId")))throw new IOException("帳戶已切換，請在原帳戶重新操作");}}
    static boolean visible(JSONObject record){try{if(record==null)return false;String owner=record.optString("ownerUserId");JSONObject actor=accountSessions.bridgeStatus();if(!actor.getBoolean("accountMode"))return owner.isEmpty();return actor.getBoolean("authenticated")&&actor.getString("owner").equals(owner);}catch(Exception unavailable){return false;}}
    static JSONObject ownedTask(String id)throws Exception{JSONObject record=get(id);if(!visible(record))throw new IOException("請登入此工作原本的帳戶");return record;}
    static JSONArray visibleTasks()throws Exception{synchronized(LOCK){
        // A fresh authority read per list, rather than one disk/Keystore read per row.
        // The boundary prevents normal account switches; re-read before publication
        // also rejects a concurrent change by another account-store handle.
        validateStore();long generation=accountSessions.generation();JSONObject actor=accountSessions.bridgeStatus();
        boolean accountMode=actor.getBoolean("accountMode"),authenticated=actor.getBoolean("authenticated");String owner=actor.optString("owner");
        JSONArray all=list(),result=new JSONArray();for(int i=0;i<all.length();i++){JSONObject row=all.getJSONObject(i);String rowOwner=row.optString("ownerUserId");if(accountMode?authenticated&&owner.equals(rowOwner):rowOwner.isEmpty())result.put(row);}
        if(generation!=accountSessions.generation()||authenticated&&actor.getLong("expiresAt")<=System.currentTimeMillis())throw new IOException("帳戶已變更，請重新查看工作");
        return result;
    }}
    static void accountChanged()throws Exception{synchronized(LOCK){
        long generation=accountSessions.generation();JSONObject status=accountSessions.bridgeStatus();String current=status.optString("owner");boolean adopt=status.optBoolean("authenticated")&&status.optBoolean("legacyOwner");
        JSONArray all=list();for(int i=0;i<all.length();i++){JSONObject row=all.getJSONObject(i);String id=row.getString("id");
            if(adopt&&row.optString("ownerUserId").isEmpty()){row.put("ownerUserId",current);row.put("legacyOwnerAdopted",true);put(row);}
            // One authenticated snapshot for this locked batch. Reopening the
            // Keystore for every retained task can stall the login callback.
            boolean visible=!status.getBoolean("accountMode")?row.optString("ownerUserId").isEmpty():status.optBoolean("authenticated")&&status.optLong("expiresAt")>System.currentTimeMillis()&&current.equals(row.optString("ownerUserId"));
            if(!visible){pause(id);context.getSystemService(JobScheduler.class).cancel(jobId(id));context.getSystemService(NotificationManager.class).cancel(jobId(id));
                for(String event:new String[]{"upload-complete","download-ready","photo-saved"})context.getSystemService(NotificationManager.class).cancel("timehut-completion:"+id+":"+event,0);
                if(TransferNetworkPreferences.reschedule(row)){row.put("stage","waiting_account");row.put("waitReason","請登入原帳戶後繼續；原檔與收據保留");put(row);}}
        }
        if(accountSessions.generation()!=generation)throw new IOException("帳戶已變更，請重新操作");
        Runnable listener=accountObserver;if(listener!=null)try{listener.run();}catch(Exception ignored){/* Native authority is already closed; the page also checks again on visibility. */}
    }}
    static boolean wifiOnly(){validateStore();return networkPreferences!=null&&networkPreferences.enabled();}
    static JSONObject networkSettings()throws Exception{validateStore();networkPreferences.validate();return new JSONObject().put("wifiOnly",wifiOnly()).put("appliesTo","unfinished").put("restriction","wifi").put("rescheduleFailures",0);}
    static boolean networkAllowed(Network network){
        if(network==null||storageError!=null||networkPreferences==null||!networkPreferences.confirmed())return false;
        NetworkCapabilities caps=context.getSystemService(ConnectivityManager.class).getNetworkCapabilities(network);
        return TransferNetworkPreferences.allowed(wifiOnly(),caps!=null,caps!=null&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET),caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI),caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR));
    }
    static Network selectNetwork(){
        ConnectivityManager manager=context.getSystemService(ConnectivityManager.class);Network active=manager.getActiveNetwork();
        if(networkAllowed(active))return active;
        if(wifiOnly())for(Network network:manager.getAllNetworks())if(networkAllowed(network))return network;
        return null;
    }
    static TransferNetworkRoute route(Network network){return new TransferNetworkRoute(network,TransferEngine::networkAllowed);}
    static JSONObject setWifiOnly(boolean enabled)throws Exception{synchronized(LOCK){
        validateStore();if(!networkPreferences.setEnabled(enabled))return networkSettings();
        // Publish the persisted rule before invalidating existing I/O or scheduling replacements.
        for(HttpURLConnection connection:connections.values())connection.disconnect();
        for(Runnable waiter:networkWaiters.values())waiter.run();
        int failures=0;JSONArray tasks=list();
        for(int i=0;i<tasks.length();i++){JSONObject row=tasks.getJSONObject(i);if(!TransferNetworkPreferences.reschedule(row))continue;
            try{schedule(context,row.getString("id"));}catch(Exception error){failures++;systemStopped(row.getString("id"));}
        }
        return networkSettings().put("rescheduleFailures",failures);
    }}
    static boolean networkWaiting(String id,String error)throws Exception{synchronized(LOCK){
        JSONObject record=get(id);if(!TransferNetworkPreferences.reschedule(record))return false;
        boolean wifi=wifiOnly();record.put("stage",wifi?"waiting_wifi":"waiting_network");record.put("waitReason",wifi?"等待可用的 Wi-Fi；原檔與收據保留":"等待網路恢復；原檔與收據保留");record.put("errorCode",error==null?"":error);put(record);return true;
    }}
    static void failIfUnfinished(String id,String error)throws Exception{synchronized(LOCK){JSONObject record=get(id);if(TransferNetworkPreferences.reschedule(record)){record.put("stage","failed");record.put("errorCode",error==null?"傳輸未完成":error);put(record);}}}
    static File file(String name){return new File(directory,name);}
    static void validateStore(){if(storageError!=null)throw new IllegalStateException("任務收據無法讀取或保存，既有檔案已保留",storageError);}
    static JSONObject newRecord(String direction,String filename,String media)throws Exception{JSONObject r=new JSONObject();String id=UUID.randomUUID().toString();if(accountSessions.accountMode()){String owner=accountSessions.currentOwner();if(owner==null)throw new IOException("請先登入帳戶");r.put("ownerUserId",owner);}r.put("id",id);r.put("direction",direction);r.put("filename",new File(filename).getName().replaceAll("[\\r\\n\"]","_"));r.put("mediaType",media);r.put("stage","preparing");r.put("createdAt",System.currentTimeMillis());r.put("bytesTransferred",0);r.put("byteSize",0);r.put("jobId",jobId(id));return r;}
    static int jobId(String id){return id.hashCode()&0x7fffffff;}
    static JSONObject get(String id){synchronized(LOCK){try{JSONObject r=records.optJSONObject(id);return r==null?null:new JSONObject(r.toString());}catch(Exception e){return null;}}}
    static JSONArray list(){synchronized(LOCK){validateStore();JSONArray values=new JSONArray();Iterator<String> ids=records.keys();while(ids.hasNext())values.put(get(ids.next()));return values;}}
    static void put(JSONObject record)throws Exception{synchronized(LOCK){
        validateStore();record.put("updatedAt",System.currentTimeMillis());JSONObject previous=get(record.getString("id"));
        if(previous!=null&&previous.optString("stage").equals("photo_deleted")&&!record.optString("stage").equals("photo_deleted"))throw new IOException("已刪除的照片收據不能恢復上傳");
        if(previous!=null&&!previous.optString("ownerUserId").equals(record.optString("ownerUserId"))){
            JSONObject actor=accountSessions.bridgeStatus();boolean legacyAdoption=previous.optString("ownerUserId").isEmpty()&&actor.optBoolean("authenticated")&&actor.optBoolean("legacyOwner")&&actor.optString("owner").equals(record.optString("ownerUserId"));
            if(!legacyAdoption)throw new IOException("工作帳戶不能變更");
        }
        JSONObject candidate=new JSONObject(records.toString());candidate.put(record.getString("id"),record);AtomicFile store=new AtomicFile(file("tasks.json"));FileOutputStream output=null;
        try{output=store.startWrite();output.write(candidate.toString().getBytes(StandardCharsets.UTF_8));store.finishWrite(output);records=candidate;
            if(completionNotifications!=null&&!TransferCompletionNotifications.transitionEvent(previous,record).isEmpty()&&visible(record))try{completionNotifications.transition(previous,record);}catch(Exception ignored){/* Delivery cannot invalidate committed task. */}
        }catch(Exception e){if(output!=null)store.failWrite(output);storageError=e;throw e;}
    }}
    static void change(String id,String key,Object value){try{synchronized(LOCK){JSONObject r=get(id);if(r!=null){if(jobRoute.get()!=null&&r.optString("stage").equals("cancelled"))throw new InterruptedIOException("傳輸已停止");r.put(key,value);put(r);}}}catch(Exception e){throw new IllegalStateException("任務收據保存失敗",e);}}
    static void markServerPhotosDeleted(String owner,Set<String> photoIds)throws Exception{synchronized(LOCK){for(Iterator<String> ids=records.keys();ids.hasNext();){String id=ids.next();JSONObject existing=records.getJSONObject(id);if(!existing.optString("ownerUserId").equals(owner)||!existing.optString("direction").equals("upload")||!photoIds.contains(existing.optString("flickrPhotoId")))continue;JSONObject row=new JSONObject(existing.toString());row.put("stage","photo_deleted");row.put("retryBlocked",true);row.put("waitReason","照片已刪除，這張收據不會重新上傳");row.put("errorCode","");put(row);HttpURLConnection connection=connections.remove(id);if(connection!=null)connection.disconnect();context.getSystemService(JobScheduler.class).cancel(jobId(id));context.getSystemService(NotificationManager.class).cancel(jobId(id));context.getSystemService(NotificationManager.class).cancel("timehut-completion:"+id+":upload-complete",0);}}}
    static boolean debugEndpoint(String value)throws Exception{URL u=new URL(value);return BuildConfig.DEBUG&&u.getProtocol().equals("http")&&Arrays.asList("127.0.0.1","localhost","10.0.2.2").contains(u.getHost());}
    static boolean trustedVideoEndpoint(URL url){return trustedBackendOriginal(url)&&url.getPath().endsWith("/video");}
    static boolean trustedBackendOriginal(URL url){
        if(!"https".equals(url.getProtocol())||!"just-healing-production.up.railway.app".equals(url.getHost())||(url.getPort()!=-1&&url.getPort()!=443)||url.getUserInfo()!=null||url.getRef()!=null||!url.getPath().matches("/api/photo/[0-9]+/(video|image)"))return false;
        try{Map<String,String> query=new HashMap<>();for(String part:(url.getQuery()==null?"":url.getQuery()).split("&")){String[] pair=part.split("=",2);if(pair.length!=2||query.put(pair[0],URLDecoder.decode(pair[1],"UTF-8"))!=null)return false;}if(!query.keySet().stream().allMatch(k->Arrays.asList("purpose","size","ticket").contains(k)))return false;return url.getPath().endsWith("/video")?"original".equals(query.get("purpose"))&&!query.containsKey("size"):"o".equals(query.get("size"))&&!query.containsKey("purpose");}catch(Exception invalid){return false;}
    }
    static void validateMediaUrl(String value)throws Exception{URL u=new URL(value);String host=u.getHost();if(!trustedBackendOriginal(u)&&!debugEndpoint(value)&&(!u.getProtocol().equals("https")||u.getUserInfo()!=null||!(host.equals("flickr.com")||host.endsWith(".flickr.com")||host.endsWith(".staticflickr.com"))))throw new IOException("無效的照片／影片網址");}
    static void schedule(Context ctx,String id)throws Exception{synchronized(LOCK){
        JSONObject task;
        synchronized(LOCK){task=ownedTask(id);if(Arrays.asList("cancelled","completed","photo_deleted","file_ready","saving","saved","failed").contains(task.optString("stage")))return;
            boolean waiting=wifiOnly()&&selectNetwork()==null;task.put("stage",waiting?"waiting_wifi":"queued");task.put("waitReason",waiting?"等待可用的 Wi-Fi；原檔與收據保留":"");task.put("errorCode","");put(task);}
        if(Build.VERSION.SDK_INT>=34){PersistableBundle extras=new PersistableBundle();extras.putString("taskId",id);
            NetworkRequest.Builder network=new NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);if(wifiOnly())network.addTransportType(NetworkCapabilities.TRANSPORT_WIFI);
            JobInfo.Builder builder=new JobInfo.Builder(jobId(id),new ComponentName(ctx,TransferJobService.class)).setExtras(extras).setUserInitiated(true).setRequiredNetwork(network.build());
            long size=task.optLong("byteSize");builder.setEstimatedNetworkBytes(task.optString("direction").equals("upload")?1024:size,task.optString("direction").equals("upload")?size:1024);
            if(ctx.getSystemService(JobScheduler.class).schedule(builder.build())!=JobScheduler.RESULT_SUCCESS)throw new IOException("手機系統暫時無法接受傳輸任務");
        }else{Intent service=new Intent(ctx,TransferForegroundService.class).putExtra("taskId",id);if(Build.VERSION.SDK_INT>=26)ctx.startForegroundService(service);else ctx.startService(service);}
    }}
    static Notification notification(String id){JSONObject r=get(id);String filename=visible(r)?r.optString("filename"):"請登入原帳戶確認工作";
        Intent cancel=new Intent(context,TransferCancelReceiver.class).putExtra("taskId",id);PendingIntent stop=PendingIntent.getBroadcast(context,jobId(id),cancel,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(context,"timehut-transfers"):new Notification.Builder(context);
        return b.setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("黃家小屋 · 傳輸中").setContentText(filename).setOngoing(true).addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"停止手機傳輸",stop).build()).build();}
    static void cancel(Context ctx,String id)throws Exception{JSONObject r=get(id);if(r==null)throw new IOException("找不到任務");if(Arrays.asList("server_processing","server_accepted","completed","photo_deleted","file_ready","saved").contains(r.optString("stage")))throw new IOException("已送達伺服器或已完成的工作無法取消");change(id,"stage","cancelled");change(id,"waitReason","已停止手機傳輸；伺服器若已收到仍可能完成");ctx.getSystemService(JobScheduler.class).cancel(jobId(id));HttpURLConnection connection=connections.remove(id);if(connection!=null)connection.disconnect();ctx.getSystemService(NotificationManager.class).cancel(jobId(id));}
    private static void checkCancelled(String id)throws InterruptedIOException{JSONObject r=get(id);TransferNetworkRoute route=jobRoute.get();if(Thread.currentThread().isInterrupted()||paused.contains(id)||route!=null&&route.stopped()||r==null||!visible(r)||Arrays.asList("cancelled","photo_deleted").contains(r.optString("stage")))throw new InterruptedIOException("傳輸已停止或等待原帳戶登入");}
    private static HttpURLConnection connect(String id,String value,String method)throws Exception{
        HttpURLConnection previous=connections.remove(id);if(previous!=null)previous.disconnect();
        requestAuthorities.remove(id);
        TransferNetworkRoute route=jobRoute.get();if(route==null&&wifiOnly())throw new SocketException("此傳輸尚未取得符合 Wi-Fi 限制的網路");
        checkCancelled(id);HttpURLConnection c=route==null?(HttpURLConnection)new URL(value).openConnection():route.open(new URL(value));c.setConnectTimeout(30000);c.setReadTimeout(60000);c.setInstanceFollowRedirects(false);c.setRequestMethod(method);
        if(accountSessions.accountMode()){
            JSONObject record=ownedTask(id);String bearer=accountSessions.tokenForRequest(record.optString("ownerUserId"),value);
            if(bearer!=null){c.setRequestProperty("Authorization","Bearer "+bearer);requestAuthorities.put(id,new RequestAuthority(c,record.getString("ownerUserId"),bearer));if(method.equals("POST")&&new URL(value).getPath().equals("/api/upload")){c.setRequestProperty("X-Timehut-Album",record.optString("albumId"));c.setRequestProperty("X-Timehut-Upload",id);c.setRequestProperty("X-Timehut-Content-SHA256",record.getString("contentSha256"));c.setRequestProperty("X-Timehut-Metadata-SHA256",record.getString("metadataSha256"));}}
        }
        connections.put(id,c);return c;
    }
    private static int responseStatus(String id,HttpURLConnection connection)throws Exception{
        int status=connection.getResponseCode();RequestAuthority request=requestAuthorities.get(id);
        if(status==401&&request!=null&&request.connection==connection){synchronized(LOCK){if(accountSessions.invalidate(request.owner,request.token))accountChanged();}throw new IOException("登入已失效，請登入原帳戶繼續；原檔與收據保留");}return status;
    }
    private static HttpURLConnection mediaConnection(String id,String value)throws Exception{
        String current=value;for(int hop=0;hop<6;hop++){
            checkCancelled(id);validateMediaUrl(current);HttpURLConnection connection=connect(id,current,"GET");int status=responseStatus(id,connection);
            if(!Arrays.asList(301,302,303,307,308).contains(status))return connection;
            String location=connection.getHeaderField("Location");if(location==null||location.isEmpty())throw new IOException("影片重導缺少來源");current=new URL(new URL(current),location).toString();
        }throw new IOException("影片重導次數超過限制");
    }
    private static JSONObject readJson(String id,HttpURLConnection c)throws Exception{int status=responseStatus(id,c);if(status<200||status>=300)throw new IOException("HTTP "+status);try(InputStream input=c.getInputStream()){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=input.read(b))!=-1){if(bytes.size()+n>1024*1024)throw new IOException("無效收據大小");bytes.write(b,0,n);}return new JSONObject(bytes.toString("UTF-8"));}}
    static boolean run(String id,TransferNetworkRoute route){
        if(route==null)throw new IllegalArgumentException("A scheduled job requires an explicit network route");
        jobRoute.set(route);try{return run(id);}finally{route.close();jobRoute.remove();}
    }
    static boolean run(String id){
        java.util.concurrent.locks.ReentrantLock runLock=runLocks.computeIfAbsent(id,key -> new java.util.concurrent.locks.ReentrantLock());
        boolean acquired=false;
        try{runLock.lockInterruptibly();acquired=true;JSONObject r=get(id);if(r==null||Arrays.asList("completed","photo_deleted","file_ready","saving","saved","cancelled").contains(r.optString("stage")))return false;checkCancelled(id);
            if(r.optString("direction").equals("download")){download(id,r);return false;}
            if(r.optBoolean("retryReceipt")&&!r.optString("serverReceiptId").isEmpty()){
                HttpURLConnection retry=connect(id,r.getString("endpoint")+"/api/uploads/retry","POST");retry.setDoOutput(true);retry.setRequestProperty("Content-Type","application/json");
                byte[] bytes=new JSONObject().put("localIds",new JSONArray().put(r.getString("serverReceiptId"))).toString().getBytes(StandardCharsets.UTF_8);
                retry.setFixedLengthStreamingMode(bytes.length);try(OutputStream output=retry.getOutputStream()){output.write(bytes);}readJson(id,retry);change(id,"retryReceipt",false);
            }
            if(r.optString("serverReceiptId").isEmpty()){upload(id,r);r=get(id);}
            if(r.optString("stage").equals("photo_deleted"))return false;
            change(id,"stage","server_processing");
            for(int i=0;i<240;i++){checkCancelled(id);JSONObject receipt=readJson(id,connect(id,r.getString("endpoint")+"/api/uploads/status/"+r.getString("serverReceiptId"),"GET"));checkCancelled(id);
                if(receipt.optString("status").equals("deleted")){change(id,"flickrPhotoId",receipt.optString("flickrPhotoId"));change(id,"retryBlocked",true);change(id,"stage","photo_deleted");change(id,"waitReason","照片已刪除，這張收據不會重新上傳");return false;}
                if(receipt.optString("status").equals("completed")&&!receipt.optString("flickrPhotoId").isEmpty()){change(id,"flickrPhotoId",receipt.getString("flickrPhotoId"));change(id,"stage","completed");return false;}
                if(receipt.optString("status").equals("error"))throw new IOException(receipt.optString("error","Flickr 處理失敗"));Thread.sleep(5000);
            }
            change(id,"stage","waiting_system");change(id,"waitReason","伺服器仍在處理，稍後再確認");return true;
        }catch(Exception e){JSONObject r=get(id);if(r!=null&&r.optString("stage").equals("photo_deleted"))return false;TransferNetworkRoute route=jobRoute.get();if(r!=null&&!visible(r)){change(id,"stage","waiting_account");change(id,"waitReason","請登入原帳戶後繼續；原檔與收據保留");return false;}if(paused.contains(id)||Thread.currentThread().isInterrupted()||e instanceof InterruptedException||route!=null&&route.stopped())return true;if(r!=null&&!r.optString("stage").equals("cancelled")){boolean network=e instanceof SocketTimeoutException||e instanceof UnknownHostException||e instanceof SocketException||route!=null&&route.changed();try{if(network)return networkWaiting(id,e.getMessage());failIfUnfinished(id,e.getMessage());}catch(Exception storeFailure){return false;}}return false;}
        finally{if(acquired){HttpURLConnection c=connections.remove(id);if(c!=null)c.disconnect();requestAuthorities.remove(id);runLock.unlock();}}
    }
    // Progress is advisory; state/receipt transitions keep their immediate atomic commits.
    // Small socket reads must not rewrite the complete retained task ledger each time.
    private static final class TransferProgress {
        private final String id;private long bytes,at=SystemClock.elapsedRealtime();
        TransferProgress(String value){id=value;}
        void update(long received,boolean force){long now=SystemClock.elapsedRealtime();
            if(force||received-bytes>=1024*1024||now-at>=500){change(id,"bytesTransferred",received);bytes=received;at=SystemClock.elapsedRealtime();}
        }
    }
    private static void upload(String id,JSONObject r)throws Exception{
        boolean owned=!r.optString("ownerUserId").isEmpty();
        File source=new File(r.getString("sourceReference"));
        if(owned&&!r.optString("contentSha256").isEmpty()&&!r.optString("metadataSha256").isEmpty())if(recoverUploadReceipt(id,r))return;
        if(!source.isFile()||source.length()<=0)throw new IOException("上傳原檔無法讀取，請先確認既有收據");
        if(owned){change(id,"stage","preparing");String content=UploadIdentity.content(source,()->checkCancelled(id)),metadata=UploadIdentity.metadata(r.optString("albumId"),r.getString("filename"),r.getString("mimeType"),r.optString("tags"),r.getString("filename"),"","");
            synchronized(LOCK){checkCancelled(id);JSONObject current=ownedTask(id);for(String field:new String[]{"albumId","filename","mimeType","tags"})if(!current.optString(field).equals(r.optString(field)))throw new IOException("工作內容已變更，請先確認原工作");if(!current.optString("contentSha256").isEmpty()&&!current.getString("contentSha256").equals(content)||!current.optString("metadataSha256").isEmpty()&&!current.getString("metadataSha256").equals(metadata))throw new IOException("此工作的原檔或標籤已變更，不能另建上傳");current.put("contentSha256",content).put("metadataSha256",metadata);put(current);r=current;}
            if(recoverUploadReceipt(id,r))return;
        }
        String boundary="Timehut-"+id;
        ByteArrayOutputStream prefix=new ByteArrayOutputStream();for(String name:new String[]{"albumId","tags","clientUploadId"}){String value=name.equals("clientUploadId")?id:r.optString(name);prefix.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\""+name+"\"\r\n\r\n"+value+"\r\n").getBytes(StandardCharsets.UTF_8));}
        prefix.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"files\"; filename=\""+r.getString("filename")+"\"\r\nContent-Type: "+r.getString("mimeType")+"\r\n\r\n").getBytes(StandardCharsets.UTF_8));byte[] suffix=("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8);
        HttpURLConnection c=connect(id,r.getString("endpoint")+"/api/upload","POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","multipart/form-data; boundary="+boundary);c.setFixedLengthStreamingMode(prefix.size()+source.length()+suffix.length);change(id,"stage","transferring");
        try(OutputStream out=c.getOutputStream();InputStream input=new FileInputStream(source)){out.write(prefix.toByteArray());byte[] buffer=new byte[1024*1024];int n;long sent=0;while((n=input.read(buffer))!=-1){checkCancelled(id);out.write(buffer,0,n);sent+=n;change(id,"bytesTransferred",sent);}out.write(suffix);}
        JSONObject response=readJson(id,c);JSONObject receipt=response.getJSONArray("results").getJSONObject(0);if(!receipt.optBoolean("success")||receipt.optString("localId").isEmpty())throw new IOException("未取得伺服器收據");change(id,"serverReceiptId",receipt.getString("localId"));change(id,"stage","server_accepted");
    }
    private static boolean recoverUploadReceipt(String id,JSONObject r)throws Exception{
        String metadata=UploadIdentity.metadata(r.optString("albumId"),r.getString("filename"),r.getString("mimeType"),r.optString("tags"),r.getString("filename"),"","");if(!metadata.equals(r.getString("metadataSha256")))throw new IOException("工作內容已變更，請先確認原工作收據");
        JSONObject known=readJson(id,connect(id,r.getString("endpoint")+"/api/uploads/admission/"+id,"GET"));String receipt=known.optString("localId"),state=known.optString("admissionStatus");
        if(!receipt.isEmpty()){if(known.optString("status").equals("cancelled"))throw new IOException("此收據已取消，不能另建上傳");change(id,"serverReceiptId",receipt);if(known.optString("status").equals("deleted")){change(id,"flickrPhotoId",known.optString("flickrPhotoId"));change(id,"retryBlocked",true);change(id,"stage","photo_deleted");change(id,"waitReason","照片已刪除，這張收據不會重新上傳");}else change(id,"stage","server_accepted");return true;}
        if(!Arrays.asList("not_found","not_accepted").contains(state))throw new IOException("先前收件仍待確認，原檔保留；請先查看收件狀態");return false;
    }
    private static void download(String id,JSONObject r)throws Exception{
        HttpURLConnection c=mediaConnection(id,r.getString("endpoint"));int status=responseStatus(id,c);if(status!=200)throw new IOException("下載失敗 HTTP "+status);String rawMime=c.getContentType();String mime=rawMime==null?"":rawMime.split(";")[0].trim().toLowerCase(Locale.ROOT);boolean video=r.optString("mediaType").equals("video");
        if(video?!Arrays.asList("video/mp4","video/quicktime").contains(mime):!mime.startsWith("image/"))throw new IOException("下載內容與照片／影片類型不符");
        String filename=r.getString("filename");if(video){filename=filename.replaceFirst("(?i)\\.(mp4|mov)$","")+(mime.equals("video/quicktime")?".mov":".mp4");change(id,"filename",filename);}else{Map<String,String> extensions=new HashMap<>();extensions.put("image/jpeg","jpg");extensions.put("image/png","png");extensions.put("image/gif","gif");extensions.put("image/webp","webp");String extension=extensions.get(mime);if(extension==null)throw new IOException("下載照片格式不支援");filename=filename.replaceFirst("(?i)\\.(jpg|jpeg|png|gif|webp)$","")+"."+extension;change(id,"filename",filename);}
        File partial=file(id+".part"),target=file(id+"-"+filename);change(id,"stage","transferring");change(id,"byteSize",Math.max(c.getContentLengthLong(),0));long received=0;TransferProgress progress=new TransferProgress(id);
        try(InputStream input=c.getInputStream();OutputStream output=new FileOutputStream(partial)){byte[] buffer=new byte[1024*1024];int n;while((n=input.read(buffer))!=-1){checkCancelled(id);output.write(buffer,0,n);received+=n;progress.update(received,false);}}
        checkCancelled(id);progress.update(received,true);
        if(received==0||(c.getContentLengthLong()>0&&received!=c.getContentLengthLong()))throw new IOException("下載檔案不完整");
        if(video)try(DataInputStream prefix=new DataInputStream(new FileInputStream(partial))){
            long size=Integer.toUnsignedLong(prefix.readInt());byte[] type=new byte[4];prefix.readFully(type);String atom=new String(type,StandardCharsets.US_ASCII);int header=8;
            if(!(mime.equals("video/mp4")?atom.equals("ftyp"):Arrays.asList("ftyp","moov","mdat","wide","free","skip").contains(atom)))throw new IOException("影片容器不正確");
            if(size==1){header=16;size=prefix.readLong();}else if(size==0)size=received;
            if(size<header||size>received)throw new IOException("影片容器長度與原檔不符");
        }
        synchronized(LOCK){checkCancelled(id);if(!partial.renameTo(target))throw new IOException("完整下載檔案保存失敗");
            change(id,"mimeType",mime);change(id,"destinationReference",target.getAbsolutePath());change(id,"byteSize",received);change(id,"stage","file_ready");}
    }
    static void runForeground(String id){
        ConnectivityManager manager=context.getSystemService(ConnectivityManager.class);Object signal=new Object();
        final java.util.concurrent.atomic.AtomicReference<TransferNetworkRoute> active=new java.util.concurrent.atomic.AtomicReference<>();
        Runnable refresh=()->{TransferNetworkRoute route=active.get();if(route!=null)route.update(selectNetwork());synchronized(signal){signal.notifyAll();}};
        ConnectivityManager.NetworkCallback callback=new ConnectivityManager.NetworkCallback(){
            @Override public void onAvailable(Network network){refresh.run();}
            @Override public void onLost(Network network){refresh.run();}
            @Override public void onCapabilitiesChanged(Network network,NetworkCapabilities caps){refresh.run();}
        };
        boolean registered=false;networkWaiters.put(id,refresh);
        try{
            manager.registerNetworkCallback(new NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),callback);registered=true;
            while(!Thread.currentThread().isInterrupted()){
                JSONObject row=get(id);if(row==null||Arrays.asList("cancelled","completed","photo_deleted","file_ready","saving","saved","failed").contains(row.optString("stage")))return;
                checkCancelled(id);Network network=selectNetwork();
                if(network==null){if(!networkWaiting(id,""))return;synchronized(signal){signal.wait(5000);}continue;}
                TransferNetworkRoute route=route(network);active.set(route);
                PowerManager.WakeLock wake=context.getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Timehut:transfer");
                boolean retry;
                try{wake.acquire(30*60*1000L);retry=run(id,route);}finally{active.compareAndSet(route,null);route.close();if(wake.isHeld())wake.release();}
                if(!retry)return;synchronized(signal){signal.wait(5000);}
            }
        }catch(InterruptedException error){Thread.currentThread().interrupt();}
        catch(Exception error){systemStopped(id);}
        finally{networkWaiters.remove(id,refresh);TransferNetworkRoute route=active.getAndSet(null);if(route!=null)route.close();if(registered)manager.unregisterNetworkCallback(callback);}
    }
}

// ASSIGNED_NETWORK_ROUTE_BEGIN — one route per job execution, never a process-wide binding.
final class TransferNetworkRoute {
    private Network network;
    private HttpURLConnection connection;
    private boolean changed;
    private boolean stopped;
    private final java.util.function.Predicate<Network> allowed;
    TransferNetworkRoute(Network value){this(value,network->network!=null);}
    TransferNetworkRoute(Network value,java.util.function.Predicate<Network> predicate){network=value;allowed=predicate;}
    synchronized HttpURLConnection open(URL url)throws IOException{
        if(stopped||network==null||!allowed.test(network))throw new SocketException("等待符合目前傳輸設定的網路");
        if(connection!=null)connection.disconnect();
        // A missing assigned network must never fall back to the default/cellular route.
        Network selected=network;connection=new AssignedConnection((HttpURLConnection)selected.openConnection(url),()->allowed.test(selected));changed=false;return connection;
    }
    synchronized void update(Network value){
        if(stopped||Objects.equals(network,value))return;
        network=value;changed=true;
        if(connection!=null){connection.disconnect();connection=null;}
    }
    synchronized boolean changed(){return changed;}
    synchronized boolean stopped(){return stopped;}
    synchronized void close(){stopped=true;if(connection!=null){connection.disconnect();connection=null;}}
    // Native disconnect() may be a no-op before the first I/O. Keep cancellation in
    // this request/stream wrapper too, without holding the route lock during I/O.
    private static final class AssignedConnection extends HttpURLConnection {
        private final HttpURLConnection delegate;
        private final java.util.function.BooleanSupplier permitted;
        private volatile boolean invalidated;
        AssignedConnection(HttpURLConnection value,java.util.function.BooleanSupplier guard){super(value.getURL());delegate=value;permitted=guard;}
        private void check()throws SocketException{if(invalidated||!permitted.getAsBoolean())throw new SocketException("傳輸網路已切換或不符合目前設定");}
        private void checkUnchecked(){try{check();}catch(SocketException error){throw new UncheckedIOException(error);}}
        @Override public void disconnect(){invalidated=true;delegate.disconnect();}
        @Override public boolean usingProxy(){return delegate.usingProxy();}
        @Override public void connect()throws IOException{check();delegate.connect();check();}
        @Override public int getResponseCode()throws IOException{check();int value=delegate.getResponseCode();check();return value;}
        @Override public InputStream getInputStream()throws IOException{
            check();InputStream input=delegate.getInputStream();
            try{check();}catch(IOException error){input.close();throw error;}
            return new FilterInputStream(input){
                @Override public int read()throws IOException{check();int value=in.read();check();return value;}
                @Override public int read(byte[] bytes,int offset,int length)throws IOException{check();int value=in.read(bytes,offset,length);check();return value;}
            };
        }
        @Override public OutputStream getOutputStream()throws IOException{
            check();OutputStream output=delegate.getOutputStream();
            try{check();}catch(IOException error){output.close();throw error;}
            return new FilterOutputStream(output){
                @Override public void write(int value)throws IOException{check();out.write(value);check();}
                @Override public void write(byte[] bytes,int offset,int length)throws IOException{check();out.write(bytes,offset,length);check();}
                @Override public void flush()throws IOException{check();out.flush();check();}
                @Override public void close()throws IOException{out.close();}
            };
        }
        @Override public String getContentType(){checkUnchecked();String value=delegate.getContentType();checkUnchecked();return value;}
        @Override public long getContentLengthLong(){checkUnchecked();long value=delegate.getContentLengthLong();checkUnchecked();return value;}
        @Override public String getHeaderField(String name){checkUnchecked();String value=delegate.getHeaderField(name);checkUnchecked();return value;}
        @Override public void setConnectTimeout(int value){delegate.setConnectTimeout(value);}
        @Override public int getConnectTimeout(){return delegate.getConnectTimeout();}
        @Override public void setReadTimeout(int value){delegate.setReadTimeout(value);}
        @Override public int getReadTimeout(){return delegate.getReadTimeout();}
        @Override public void setInstanceFollowRedirects(boolean value){delegate.setInstanceFollowRedirects(value);}
        @Override public boolean getInstanceFollowRedirects(){return delegate.getInstanceFollowRedirects();}
        @Override public void setRequestMethod(String value)throws ProtocolException{delegate.setRequestMethod(value);}
        @Override public String getRequestMethod(){return delegate.getRequestMethod();}
        @Override public void setDoOutput(boolean value){delegate.setDoOutput(value);}
        @Override public boolean getDoOutput(){return delegate.getDoOutput();}
        @Override public void setRequestProperty(String key,String value){delegate.setRequestProperty(key,value);}
        @Override public String getRequestProperty(String key){return delegate.getRequestProperty(key);}
        @Override public void setFixedLengthStreamingMode(int value){delegate.setFixedLengthStreamingMode(value);}
        @Override public void setFixedLengthStreamingMode(long value){delegate.setFixedLengthStreamingMode(value);}
    }
}
// ASSIGNED_NETWORK_ROUTE_END

// WIFI_POLICY_BEGIN — independent durable preference; old task receipts need no migration.
final class TransferNetworkPreferences {
    private final AtomicFile store;
    private volatile boolean enabled;
    private volatile Exception commitError;
    TransferNetworkPreferences(File file)throws Exception{
        if(new File(file.getPath()+".new").exists())throw new IOException("網路設定提交尚未確認，既有設定已保留");
        store=new AtomicFile(file);byte[] bytes=TransferEngine.readAtomicReceipt(store);
        if(bytes==null){enabled=false;return;}
        JSONObject value=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
        if(!(value.get("version") instanceof Integer)||value.getInt("version")!=1||!(value.get("wifiOnly") instanceof Boolean))throw new IOException("網路設定格式無法讀取");enabled=value.getBoolean("wifiOnly");
    }
    boolean enabled(){return enabled;}
    boolean confirmed(){return commitError==null;}
    void validate()throws IOException{if(commitError!=null)throw new IOException("網路設定提交尚未確認",commitError);}
    synchronized boolean setEnabled(boolean value)throws Exception{
        if(commitError==null&&enabled==value)return false;
        byte[] bytes=new JSONObject().put("version",1).put("wifiOnly",value).toString().getBytes(StandardCharsets.UTF_8);FileOutputStream output=null;
        boolean committing=false;
        try{
            output=store.startWrite();output.write(bytes);output.flush();output.getFD().sync();committing=true;store.finishWrite(output);output=null;
            File base=store.getBaseFile();
            if(new File(base.getPath()+".new").exists()||new File(base.getPath()+".bak").exists())throw new IOException("網路設定提交未完成");
            ByteArrayOutputStream actual=new ByteArrayOutputStream();try(InputStream input=new FileInputStream(base)){byte[] buffer=new byte[128];int count;while((count=input.read(buffer))!=-1){if(actual.size()+count>1024)throw new IOException("網路設定大小不符");actual.write(buffer,0,count);}}
            if(!Arrays.equals(bytes,actual.toByteArray()))throw new IOException("網路設定提交內容不符");
            enabled=value;commitError=null;return true;
        }catch(Exception error){if(committing)commitError=error;else if(output!=null)store.failWrite(output);throw error;}
    }
    static boolean allowed(boolean wifiOnly,boolean present,boolean internet,boolean wifi,boolean cellular){return present&&internet&&(!wifiOnly||wifi&&!cellular);}
    static boolean reschedule(JSONObject row){return row!=null&&!row.optString("endpoint").isEmpty()&&Arrays.asList("queued","transferring","server_accepted","server_processing","waiting_network","waiting_wifi","waiting_system").contains(row.optString("stage"));}
}
// WIFI_POLICY_END


// Notification state is separate from task receipts: failure here must never fail a transfer.
final class TransferCompletionNotifications {
    private static final String CHANNEL="timehut-completions";
    private final Context context;
    private final Object lock=new Object();
    private final AtomicFile store;
    private final java.util.concurrent.ExecutorService queue=java.util.concurrent.Executors.newSingleThreadExecutor();
    TransferCompletionNotifications(Context value){context=value;store=new AtomicFile(new File(new File(context.getNoBackupFilesDir(),"transfers"),"notifications.json"));
        if(Build.VERSION.SDK_INT>=26)context.getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"傳輸完成通知",NotificationManager.IMPORTANCE_DEFAULT));
    }
    // COMPLETION_POLICY_BEGIN — deterministic terminal-event selection; also exercised on host.
    static String event(JSONObject row){
        if(row==null)return "";
        String id=row.optString("id");try{if(!UUID.fromString(id).toString().equalsIgnoreCase(id))return "";}catch(Exception invalid){return "";}
        String direction=row.optString("direction"),stage=row.optString("stage");
        if(direction.equals("upload")&&stage.equals("completed")&&!row.optString("flickrPhotoId").isEmpty())return "upload-complete";
        if(direction.equals("download")&&stage.equals("file_ready")&&!row.optString("destinationReference").isEmpty()&&row.optLong("byteSize")>0)return "download-ready";
        if(direction.equals("download")&&stage.equals("saved")&&!row.optString("savedAssetId").isEmpty())return "photo-saved";
        return "";
    }
    static String transitionEvent(JSONObject previous,JSONObject next){
        if(previous==null||next==null||!previous.optString("id").equals(next.optString("id")))return "";
        String event=event(next);return !event.isEmpty()&&!event.equals(event(previous))?event:"";
    }
    // COMPLETION_POLICY_END
    private JSONObject read()throws Exception{
        byte[] bytes=TransferEngine.readAtomicReceipt(store);
        if(bytes==null)return new JSONObject().put("version",1).put("enabled",false).put("attempts",new JSONObject());
        JSONObject state=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
        if(state.getInt("version")!=1||!(state.get("enabled") instanceof Boolean)||!(state.get("attempts") instanceof JSONObject))throw new IOException("通知設定格式無法讀取");return state;
    }
    private void write(JSONObject state)throws Exception{FileOutputStream output=null;try{output=store.startWrite();output.write(state.toString().getBytes(StandardCharsets.UTF_8));store.finishWrite(output);}catch(Exception error){if(output!=null)store.failWrite(output);throw error;}}
    JSONObject settings()throws Exception{synchronized(lock){
        NotificationManager manager=context.getSystemService(NotificationManager.class);
        boolean permission=Build.VERSION.SDK_INT<33||context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)==android.content.pm.PackageManager.PERMISSION_GRANTED;
        boolean system=manager.areNotificationsEnabled();boolean channel=Build.VERSION.SDK_INT<26||manager.getNotificationChannel(CHANNEL)!=null&&manager.getNotificationChannel(CHANNEL).getImportance()!=NotificationManager.IMPORTANCE_NONE;
        boolean enabled=read().getBoolean("enabled");return new JSONObject().put("enabled",enabled).put("permission",permission?"granted":"denied").put("systemEnabled",system).put("channelEnabled",channel).put("canNotify",enabled&&permission&&system&&channel);
    }}
    JSONObject setEnabled(boolean wanted)throws Exception{synchronized(lock){JSONObject settings=settings();boolean allowed=settings.getString("permission").equals("granted")&&settings.getBoolean("systemEnabled")&&settings.getBoolean("channelEnabled");JSONObject state=read();state.put("enabled",wanted&&allowed);state.put("epoch",UUID.randomUUID().toString());write(state);return settings();}}
    void transition(JSONObject previous,JSONObject next)throws Exception{
        String event=transitionEvent(previous,next);if(event.isEmpty())return;
        String id=next.optString("id"),media=next.optString("mediaType");
        final String epoch;synchronized(lock){JSONObject preference=read();if(!preference.getBoolean("enabled"))return;epoch=preference.optString("epoch");}
        queue.execute(()->{try{synchronized(lock){
            if(!TransferEngine.visible(next))return;
            if(!settings().getBoolean("canNotify"))return;
            JSONObject state=read();if(!epoch.equals(state.optString("epoch")))return;JSONObject attempts=state.getJSONObject("attempts");String key=id+":"+event;if(attempts.has(key))return;
            // Claim before invoking the OS. A crash may lose one alert; never replay an old completion.
            attempts.put(key,System.currentTimeMillis());write(state);
            String kind=media.equals("video")?"影片":"照片";
            String message=event.equals("upload-complete")?kind+"已在 Flickr 完成上傳。":event.equals("download-ready")?kind+"已下載至 App，請回傳輸中心保存至手機相簿。":kind+"已保存至手機相簿。";
            Intent open=new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent content=PendingIntent.getActivity(context,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(context,CHANNEL):new Notification.Builder(context);
            Notification notification=builder.setSmallIcon(android.R.drawable.stat_sys_download_done).setContentTitle("黃家小屋 · 傳輸完成").setContentText(message).setStyle(new Notification.BigTextStyle().bigText(message)).setAutoCancel(true).setOnlyAlertOnce(true).setContentIntent(content).build();
            context.getSystemService(NotificationManager.class).notify("timehut-completion:"+key,0,notification);
        }}catch(Exception ignored){/* Task success stays authoritative when preferences or delivery fail. */}});
    }
}
