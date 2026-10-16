package tw.aihankapps.timehut;

import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.HashSet;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** First-party JSON requests only. Native credentials never enter a bridge response. */
final class AccountClient {
    private static final ScheduledExecutorService revocations=Executors.newSingleThreadScheduledExecutor(r->{Thread thread=new Thread(r,"timehut-session-revocations");thread.setDaemon(true);return thread;});
    private static final AtomicBoolean revocationScheduled=new AtomicBoolean();
    private static final AtomicInteger revocationCursor=new AtomicInteger();
    private static final AtomicBoolean loginBusy=new AtomicBoolean();
    // A pending UI cancellation may arrive after this same login committed but
    // before its bridge reply. Bind that cancellation to this exact session;
    // never use a refreshed generation to sign out an unrelated account.
    private static final class LoginFlight {final String epoch,owner;Session committed;LoginFlight(String e,String o){epoch=e;owner=o;}}
    private static LoginFlight lastLoginFlight;
    private static final AtomicInteger nativeCancellationCursor=new AtomicInteger();
    private static final ThreadLocal<TransferNetworkRoute> revocationRoute=new ThreadLocal<>();
    private static final ScheduledExecutorService deadlines=Executors.newSingleThreadScheduledExecutor(r->{Thread thread=new Thread(r,"timehut-http-deadlines");thread.setDaemon(true);return thread;});
    // Instrumentation can redirect the default only in a debuggable fixture build.
    static volatile String testBackend;
    static String defaultBackend(){return BuildConfig.DEBUG&&testBackend!=null?testBackend:AccountIdentity.BACKEND;}
    static final class Session {
        final String owner,token,backend;final long generation;
        Session(String o,String t,String b,long g){owner=o;token=t;backend=b;generation=g;}
    }
    private static Session current()throws Exception{synchronized(TransferEngine.accountBoundary()){
        AccountSessionStore store=TransferEngine.accounts();String owner=store.currentOwner(),backend=store.issuerOrigin();if(owner==null||backend==null)throw new IOException("請先登入帳戶");String token=store.tokenForRequest(owner,backend);if(token==null)throw new IOException("請重新登入帳戶");return new Session(owner,token,backend,store.generation());
    }}
    static void require(Session session)throws Exception{
        AccountSessionStore store=TransferEngine.accounts();if(session.generation!=store.generation()||!session.owner.equals(store.currentOwner())||!session.token.equals(store.tokenForRequest(session.owner,session.backend)))throw new IOException("帳戶已變更，請重新操作");
    }
    static JSONObject bridgeStatus()throws Exception{synchronized(TransferEngine.accountBoundary()){
        AccountSessionStore store=TransferEngine.accounts();String issuer=store.issuerOrigin();
        return store.bridgeStatus().put("bridgeVersion",2).put("nativeLoginProtocol",1).put("accountEvents",true).put("backend",issuer==null?defaultBackend():issuer);
    }}
    static void requireBridgeGeneration(String expected)throws Exception{synchronized(TransferEngine.accountBoundary()){
        if(expected==null||!expected.equals(TransferEngine.accounts().bridgeStatus().getString("generation")))throw new IOException("帳戶已變更，請重新操作");
    }}
    static Session bridgeSession(String owner,String generation)throws Exception{synchronized(TransferEngine.accountBoundary()){
        requireBridgeGeneration(generation);Session session=current();if(owner==null||!owner.equals(session.owner))throw new IOException("帳戶已變更，請重新操作");return session;
    }}
    private static JSONObject bridgeReply(JSONObject data)throws Exception{return data.put("_nativeAccountAuthority",bridgeStatus());}
    static boolean allowedPath(String method,String path){
        try{URI uri=new URI(path);if(uri.isAbsolute()||uri.getRawAuthority()!=null||uri.getRawFragment()!=null||!uri.getRawPath().equals(uri.getPath()))return false;String p=uri.getPath();
            if(method.equals("GET"))return p.matches("/api/(accounts/(me|albums|context|photos)|albums|auth/status|uploads/(status(/[A-Za-z0-9_-]{1,128})?|admission/[A-Za-z0-9_-]{16,80})|album/[A-Za-z0-9_-]{1,128}/photos|photo/[0-9]+/sizes)");
            if(method.equals("POST"))return p.matches("/api/(accounts/albums|uploads/retry|photos/(delete|tags/add|update-date)|album/[A-Za-z0-9_-]{1,128}/(add_photos|remove_photos))");
            if(method.equals("PUT"))return p.matches("/api/(photo/[0-9]+/tags|accounts/albums/dates)");
            return method.equals("DELETE")&&p.matches("/api/(accounts/me|photo/[0-9]+|uploads/[A-Za-z0-9_-]{1,128})");
        }catch(Exception invalid){return false;}
    }
    private static JSONObject json(String backend,String method,String path,JSONObject body,String token)throws Exception{
        return json(backend,method,path,body,token,15000);
    }
    private static JSONObject json(String backend,String method,String path,JSONObject body,String token,int timeout)throws Exception{
        if(!AccountIdentity.allowedBackend(backend))throw new IOException("無效的帳戶服務");byte[] payload=body==null?null:body.toString().getBytes(StandardCharsets.UTF_8);if(payload!=null&&payload.length>16384)throw new IOException("內容過長");
        URL url=new URL(backend.replaceAll("/+$","")+path);TransferNetworkRoute route=revocationRoute.get();HttpURLConnection connection=route==null?(HttpURLConnection)url.openConnection():route.open(url);connection.setConnectTimeout(timeout);connection.setReadTimeout(timeout);connection.setInstanceFollowRedirects(false);connection.setRequestMethod(method);connection.setRequestProperty("Accept","application/json");if(token!=null)connection.setRequestProperty("Authorization","Bearer "+token);
        AtomicBoolean expired=new AtomicBoolean();long deadline=android.os.SystemClock.elapsedRealtime()+2L*timeout;ScheduledFuture<?> alarm=deadlines.schedule(()->{expired.set(true);connection.disconnect();},2L*timeout,TimeUnit.MILLISECONDS);
        try{if(payload!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");connection.setFixedLengthStreamingMode(payload.length);try(OutputStream out=connection.getOutputStream()){out.write(payload);}}
            int status=connection.getResponseCode();if(expired.get())throw new SocketTimeoutException("帳戶回應逾時");if(status==401)throw new Unauthorized();if(status<200||status>=300)throw new IOException(status==429?"操作較頻繁，請稍後重試":"操作未完成，請確認內容後重試");
            if(!"application/json".equals(connection.getContentType()==null?"":connection.getContentType().split(";")[0].trim()))throw new IOException("帳戶回應格式不符");
            try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];while(true){long remaining=deadline-android.os.SystemClock.elapsedRealtime();if(remaining<=0||expired.get())throw new SocketTimeoutException("帳戶回應逾時");connection.setReadTimeout((int)Math.min(timeout,remaining));int n=in.read(b);if(n==-1)break;if(out.size()+n>1024*1024)throw new IOException("帳戶回應過長");out.write(b,0,n);}JSONObject result=new JSONObject(out.toString("UTF-8"));if(expired.get())throw new SocketTimeoutException("帳戶回應逾時");return result;}
        }finally{alarm.cancel(false);connection.disconnect();}
    }
    private static final class Unauthorized extends IOException{Unauthorized(){super("登入已失效，請重新登入");}}
    private static boolean revoke(JSONObject row)throws Exception{
        String owner=row.getString("owner"),token=row.getString("token"),issuer=row.getString("issuer");boolean confirmed=false;
        synchronized(TransferEngine.accountBoundary()){if(!TransferEngine.accounts().pendingRevocation(owner,token,issuer))return true;}
        try{confirmed=Boolean.TRUE.equals(json(issuer,"POST","/api/accounts/logout",new JSONObject(),token,3000).opt("ok"));}catch(Unauthorized alreadyRevoked){confirmed=true;}catch(Exception unavailable){/* Durable encrypted receipt remains until the same issuer confirms. */}
        if(confirmed)synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().confirmRevocation(owner,token,issuer);}return confirmed;
    }
    static boolean drainRevocation(String issuer)throws Exception{
        JSONArray pending; synchronized(TransferEngine.accountBoundary()){pending=TransferEngine.accounts().pendingRevocations();}
        if(pending.length()==0)return true;JSONArray candidates=new JSONArray();for(int i=0;i<pending.length();i++)if(issuer==null||issuer.equals(pending.getJSONObject(i).getString("issuer")))candidates.put(pending.getJSONObject(i));
        if(candidates.length()==0)return true;int selected=Math.floorMod(revocationCursor.getAndIncrement(),candidates.length());return revoke(candidates.getJSONObject(selected));
    }
    static boolean drainNativeCancellation(String issuer)throws Exception{
        JSONArray pending;synchronized(TransferEngine.accountBoundary()){pending=TransferEngine.accounts().nativeCancellations();}
        JSONArray candidates=new JSONArray();for(int i=0;i<pending.length();i++){JSONObject row=pending.getJSONObject(i);if(issuer==null||issuer.equals(row.getString("issuer")))candidates.put(row);}
        if(candidates.length()==0)return true;JSONObject row=candidates.getJSONObject(Math.floorMod(nativeCancellationCursor.getAndIncrement(),candidates.length()));
        synchronized(TransferEngine.accountBoundary()){if(!TransferEngine.accounts().beginNativeCancellation(row))return true;}
        try{JSONObject ack=json(row.getString("issuer"),"POST","/api/accounts/native-login/cancel",new JSONObject().put("attemptId",row.getString("id")).put("cancelSecret",row.getString("secret")),null,3000);
            if(!Boolean.TRUE.equals(ack.opt("ok"))||!Boolean.TRUE.equals(ack.opt("cancelled"))||!Integer.valueOf(1).equals(ack.opt("protocol"))||!row.getString("id").equals(ack.opt("attemptId")))return false;
            synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().confirmNativeCancellation(row);}return true;
        }catch(Exception unavailable){return false;}
    }
    static void drainSystemRevocations(TransferNetworkRoute route)throws Exception{
        revocationRoute.set(route);try{
            JSONArray pending;synchronized(TransferEngine.accountBoundary()){pending=TransferEngine.accounts().pendingRevocations();}
            long deadline=android.os.SystemClock.elapsedRealtime()+20000;
            for(int i=0;i<pending.length()&&android.os.SystemClock.elapsedRealtime()<deadline;i++){
                if(route.stopped()||Thread.currentThread().isInterrupted())break;JSONObject row=pending.getJSONObject(i);boolean admitted;
                synchronized(TransferEngine.accountBoundary()){admitted=TransferEngine.accounts().beginSystemRevocation(row.getString("owner"),row.getString("token"),row.getString("issuer"));}
                if(admitted)revoke(row);
            }
            if(!route.stopped()&&!Thread.currentThread().isInterrupted()&&android.os.SystemClock.elapsedRealtime()<deadline)drainNativeCancellation(null);
        }finally{revocationRoute.remove();}
    }
    static void retryRevocations(){try{synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().ensureSystemRevocations();}}catch(Exception ignored){}scheduleRevocations(0);}
    private static void scheduleRevocations(long delay){if(!revocationScheduled.compareAndSet(false,true))return;revocations.schedule(()->{try{drainRevocation(null);drainNativeCancellation(null);}catch(Exception ignored){}finally{revocationScheduled.set(false);try{if(TransferEngine.accounts().pendingWork())scheduleRevocations(30);}catch(Exception ignored){/* Preserved unresolved account receipts require recovery. */}}},delay,TimeUnit.SECONDS);}
    static JSONObject signIn(String backend,String username,String password,String displayName,boolean register)throws Exception{
        return signIn(backend,username,password,displayName,register,bridgeStatus().getString("generation"));
    }
    static JSONObject signIn(String backend,String username,String password,String displayName,boolean register,String expectedGeneration)throws Exception{
        if(username==null||password==null||username.length()>32||password.length()>128||password.length()<12)throw new IOException("請確認帳號與密碼");
        if(!loginBusy.compareAndSet(false,true))throw new IOException("請先確認目前的登入結果");JSONObject admission=null;
        try{
        synchronized(TransferEngine.accountBoundary()){String priorOwner=bridgeStatus().optString("owner",null);admission=TransferEngine.accounts().beginLogin(backend,expectedGeneration);lastLoginFlight=new LoginFlight(expectedGeneration,priorOwner);}
        String id=admission.getString("id");
        if(register)json(backend,"POST","/api/accounts/register",new JSONObject().put("username",username).put("password",password).put("displayName",displayName),null);
        synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().requireLogin(id);}
        JSONObject login=json(backend,"POST","/api/accounts/native-login",new JSONObject().put("username",username).put("password",password).put("attemptId",id).put("cancelSecret",admission.getString("secret")),null);
        String token=login.getString("token");synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().captureLoginToken(id,token);}
        if(!Integer.valueOf(1).equals(login.opt("protocol"))||!id.equals(login.opt("attemptId")))throw new IOException("登入請求回應尚未確認");JSONObject verified=AccountIdentity.verify(backend,token,null);
        Session accepted;JSONObject reply;
        synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().completeLogin(id,verified.getJSONObject("user").getString("id"),token,verified.getLong("expiresAt"),verified.getBoolean("legacyOwner"),backend);TransferEngine.accountChanged();accepted=current();lastLoginFlight.committed=accepted;reply=bridgeReply(verified);}
        try{drainRevocation(AccountIdentity.origin(backend));}catch(Exception ignored){}retryRevocations();synchronized(TransferEngine.accountBoundary()){require(accepted);return reply;}
        }catch(Exception failure){if(admission!=null)try{synchronized(TransferEngine.accountBoundary()){TransferEngine.accounts().abortLogin(admission.getString("id"));}}catch(Exception preserved){}retryRevocations();throw failure;}
        finally{loginBusy.set(false);}
    }
    static JSONObject request(String method,String path,JSONObject body)throws Exception{
        return request(method,path,body,current());
    }
    static JSONObject request(String method,String path,JSONObject body,Session session)throws Exception{
        if(!allowedPath(method,path))throw new IOException("此帳戶操作不支援");
        try{synchronized(TransferEngine.accountBoundary()){require(session);}JSONObject response=json(session.backend,method,path,body,session.token);
            synchronized(TransferEngine.accountBoundary()){require(session);if(response.has("token")||response.has("password")||response.has("passwordHash"))throw new IOException("帳戶回應包含不允許的欄位");
                Set<String> deleted=new HashSet<>();
                if(method.equals("DELETE")&&path.matches("/api/photo/[0-9]+")&&Boolean.TRUE.equals(response.opt("success"))){String id=path.substring(path.lastIndexOf('/')+1);if(id.equals(response.optString("photoId")))deleted.add(id);}
                if(method.equals("POST")&&path.equals("/api/photos/delete")&&body!=null){JSONArray requested=body.optJSONArray("photoIds"),results=response.optJSONArray("results");Set<String> expected=new HashSet<>();if(requested!=null)for(int i=0;i<requested.length();i++)if(requested.opt(i) instanceof String)expected.add(requested.getString(i));if(results!=null)for(int i=0;i<results.length();i++){JSONObject row=results.optJSONObject(i);if(row!=null&&Boolean.TRUE.equals(row.opt("success"))&&expected.contains(row.optString("photoId")))deleted.add(row.getString("photoId"));}}
                if(!deleted.isEmpty())TransferEngine.markServerPhotosDeleted(session.owner,deleted);return bridgeReply(response);}
        }catch(Unauthorized error){synchronized(TransferEngine.accountBoundary()){if(TransferEngine.accounts().invalidate(session.owner,session.token))TransferEngine.accountChanged();}throw error;}
    }
    static JSONObject signOut()throws Exception{
        Logout logout;synchronized(TransferEngine.accountBoundary()){JSONObject status=bridgeStatus(),credential=TransferEngine.accounts().logoutCredential();logout=beginSignOut(credential==null?null:credential.getString("owner"),status.getString("generation"));}return finishSignOut(logout);
    }
    static JSONObject signOut(Session session)throws Exception{
        Logout logout;synchronized(TransferEngine.accountBoundary()){require(session);logout=beginSignOut(session.owner,bridgeStatus().getString("generation"));}return finishSignOut(logout);
    }
    static final class Logout {final JSONObject credential,closed;final JSONArray logins;Logout(JSONObject c,JSONObject s,JSONArray l){credential=c;closed=s;logins=l;}}
    static Logout beginSignOut(String owner,String generation)throws Exception{return beginSignOut(owner,generation,false);}
    static Logout beginSignOut(String owner,String generation,boolean pendingLogin)throws Exception{synchronized(TransferEngine.accountBoundary()){
        LoginFlight flight=lastLoginFlight;
        if(pendingLogin&&flight!=null&&java.util.Objects.equals(owner,flight.owner)&&java.util.Objects.equals(generation,flight.epoch)){
            if(flight.committed!=null)require(flight.committed);else requireBridgeGeneration(flight.epoch);
            JSONObject current=TransferEngine.accounts().logoutCredential();owner=current==null?null:current.getString("owner");generation=bridgeStatus().getString("generation");
        }
        requireBridgeGeneration(generation);AccountSessionStore store=TransferEngine.accounts();JSONObject credential=store.logoutCredential();String currentOwner=credential==null?null:credential.getString("owner");if(!java.util.Objects.equals(owner,currentOwner))throw new IOException("帳戶已變更，請重新操作");
        store.signOut();lastLoginFlight=null;TransferEngine.accountChanged();return new Logout(credential,bridgeStatus(),store.nativeCancellations());
    }}
    static JSONObject finishSignOut(Logout logout)throws Exception{
        if(logout.credential!=null)revoke(logout.credential);else drainNativeCancellation(null);retryRevocations();
        synchronized(TransferEngine.accountBoundary()){
            JSONObject status=bridgeStatus();if(!logout.closed.getString("generation").equals(status.getString("generation"))||status.getBoolean("authenticated"))throw new IOException("帳戶已變更，原登出收據保留");
            boolean pending=logout.credential!=null&&TransferEngine.accounts().pendingRevocation(logout.credential.getString("owner"),logout.credential.getString("token"),logout.credential.getString("issuer"));
            JSONArray remaining=TransferEngine.accounts().nativeCancellations();for(int i=0;i<logout.logins.length();i++)for(int j=0;j<remaining.length();j++)if(logout.logins.getJSONObject(i).getString("id").equals(remaining.getJSONObject(j).getString("id")))pending=true;
            return new JSONObject().put("signedOut",true).put("serverConfirmed",!pending).put("systemRetryScheduled",TransferEngine.accounts().systemRevocationsScheduled()).put("pendingRevocations",status.getInt("pendingRevocations")).put("pendingLoginReceipts",status.getInt("pendingLoginReceipts")).put("_nativeAccountAuthority",logout.closed);
        }
    }
}
