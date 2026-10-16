package tw.aihankapps.timehut;

import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Verify the application principal at the trusted server before local activation. */
final class AccountIdentity {
    static final String BACKEND="https://just-healing-production.up.railway.app";
    static String origin(String value)throws Exception{URL u=new URL(value);if(u.getUserInfo()!=null||u.getRef()!=null||!(u.getProtocol().equals("https")||u.getProtocol().equals("http")))throw new IOException("Invalid request origin");int port=u.getPort();return u.getProtocol()+"://"+u.getHost()+(port==-1||port==u.getDefaultPort()?"":":"+port);}
    static boolean allowedBackend(String value)throws Exception{
        if(BACKEND.equals(value))return true;
        URL u=new URL(value);return TransferEngine.debugEndpoint(value)&&u.getUserInfo()==null&&u.getRef()==null&&u.getQuery()==null&&(u.getPath().isEmpty()||u.getPath().equals("/"));
    }
    static JSONObject verifyAndActivate(AccountSessionStore store,String backend,String token,String expectedOwner)throws Exception{
        JSONObject profile=verify(backend,token,expectedOwner);store.activateVerified(profile.getJSONObject("user").getString("id"),token,profile.getLong("expiresAt"),profile.getBoolean("legacyOwner"),backend);return profile;
    }
    static JSONObject verify(String backend,String token,String expectedOwner)throws Exception{
        if(token==null||!token.matches("[A-Za-z0-9_-]{32,128}")||!allowedBackend(backend))throw new IOException("無效的帳戶連線");
        HttpURLConnection connection=(HttpURLConnection)new URL(backend.replaceAll("/+$","")+"/api/accounts/me").openConnection();
        connection.setConnectTimeout(15000);connection.setReadTimeout(15000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Accept","application/json");
        try{
            if(connection.getResponseCode()!=200)throw new IOException("帳戶尚未確認，請重新登入");
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=connection.getInputStream()){byte[] chunk=new byte[2048];int n;while((n=in.read(chunk))!=-1){if(bytes.size()+n>65536)throw new IOException("Invalid account response");bytes.write(chunk,0,n);}}
            JSONObject result=new JSONObject(bytes.toString("UTF-8")),user=result.getJSONObject("user");String owner=user.getString("id");
            if(!UUID.fromString(owner).toString().equals(owner)||(expectedOwner!=null&&!expectedOwner.equals(owner)))throw new IOException("帳戶身份不一致，請重新登入");
            Object expiry=result.opt("expiresAt"),legacy=result.opt("legacyOwner");
            if(!(expiry instanceof Long||expiry instanceof Integer)||!(legacy instanceof Boolean))throw new IOException("Invalid verified account metadata");
            long expiresAt=result.getLong("expiresAt"),now=System.currentTimeMillis();if(expiresAt<=now||expiresAt>now+31L*86400000)throw new IOException("請確認手機日期時間並重新登入");
            return new JSONObject().put("user",new JSONObject().put("id",owner).put("username",user.optString("username")).put("displayName",user.optString("displayName")))
                .put("expiresAt",expiresAt).put("legacyOwner",result.getBoolean("legacyOwner"));
        }finally{connection.disconnect();}
    }
}
