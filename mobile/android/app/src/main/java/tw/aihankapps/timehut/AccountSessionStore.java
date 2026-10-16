package tw.aihankapps.timehut;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Native-only storage; caller must first verify the server principal. */
final class AccountSessionStore {
    interface CommitOps {void sync(FileOutputStream output)throws Exception;void finish(AtomicFile file,FileOutputStream output)throws Exception;}
    private static final CommitOps CHECKED=new CommitOps(){public void sync(FileOutputStream output)throws Exception{output.getFD().sync();}public void finish(AtomicFile file,FileOutputStream output){file.finishWrite(output);}};
    private static final class Authority {final String alias;final String processNonce=UUID.randomUUID().toString();Exception failure;long generation;boolean opened;String revocationFingerprint;String verifiedRevocations="[]";Authority(String a){alias=a;}}
    private static final ConcurrentHashMap<String,Authority> authorities=new ConcurrentHashMap<>();
    private final AtomicFile file;
    private final File intent;
    private final String alias;
    private final Authority authority;
    private final CommitOps commits;
    private final AccountCommitRecovery recovery;
    private JSONObject state;
    private JSONObject verifiedCredential;
    private JSONArray verifiedRevocations;
    private JSONArray verifiedLogins;
    private static final int MAX_PENDING=24;
    private Context jobContext;

    AccountSessionStore(Context context)throws Exception{this(new File(context.getNoBackupFilesDir(),"accounts/session.json"),"timehut.account-session.v1");jobContext=context.getApplicationContext();}
    AccountSessionStore(File target,String keyAlias)throws Exception{this(target,keyAlias,CHECKED);}
    AccountSessionStore(File target,String keyAlias,CommitOps commitOps)throws Exception{
        File canonical=target.getCanonicalFile(),parent=canonical.getParentFile();if(parent==null||(!parent.isDirectory()&&!parent.mkdirs()))throw new IOException("帳戶儲存暫不可用");
        file=new AtomicFile(canonical);intent=new File(canonical.getPath()+".intent");alias=keyAlias;commits=commitOps;
        recovery=new AccountCommitRecovery(canonical,new AccountCommitRecovery.Codec(){
            public JSONObject seal(byte[] value,String purpose)throws Exception{return AccountSessionStore.this.seal(value,purpose+":"+alias);}
            public byte[] open(JSONObject value,String purpose)throws Exception{return AccountSessionStore.this.open(value,purpose+":"+alias);}
            public JSONArray credentials(byte[] value)throws Exception{return recoveryCredentials(value);}
            public byte[] closed(JSONArray rows)throws Exception{JSONArray pending=new JSONArray(),logins=new JSONArray();for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);if("native-login".equals(row.optString("kind"))){JSONObject login=new JSONObject(row.getJSONObject("admission").toString()).put("cancelled",true);logins.put(login);}else pending.put(row);}return candidate(null,pending,logins).toString().getBytes(StandardCharsets.UTF_8);}
        });
        authority=authorities.computeIfAbsent(canonical.getPath(),ignored->new Authority(alias));
        synchronized(authority){if(!authority.alias.equals(alias))throw new IOException("Account key identity mismatch");reload();}
    }
    private void ready()throws IOException{if(authority.failure!=null)throw new IOException("帳戶狀態尚未確認，原件保留",authority.failure);}
    private boolean unresolved(){return recovery.pending();}
    private static byte[] read(File value)throws Exception{try(InputStream in=new FileInputStream(value);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] chunk=new byte[2048];int n;while((n=in.read(chunk))!=-1){if(out.size()+n>16384)throw new IOException("Invalid account state size");out.write(chunk,0,n);}return out.toByteArray();}}
    private void reload()throws Exception{
        verifiedCredential=null;
        verifiedRevocations=null;
        verifiedLogins=null;
        ready();try{
            // Only the first authority in a fresh process may recover a durable
            // intent. Existing live handles remain fail-closed after I/O faults.
            if(unresolved()){if(authority.opened)throw new IOException("Unresolved account commit");recovery.recover();authority.generation++;}
            authority.opened=true;
            File base=file.getBaseFile();state=base.exists()?new JSONObject(new String(read(base),StandardCharsets.UTF_8)):new JSONObject().put("version",1).put("accountMode",false);
            if(!(state.opt("version") instanceof Integer)||!(state.getInt("version")==1||state.getInt("version")==2)||!(state.opt("accountMode") instanceof Boolean))throw new IOException("Invalid account state");
            if(state.has("nativeLogins")&&(state.getInt("version")!=2||!state.getBoolean("accountMode")))throw new IOException("Invalid login admission schema");
            // Every read reloads and authenticates the current file. Reuse only
            // this read's decrypted value while holding the shared authority.
            if(state.has("session")){if(!state.getBoolean("accountMode")||!(state.opt("session") instanceof JSONObject))throw new IOException("Invalid account mode");verifiedCredential=decrypt();}
            if(state.has("revocations")&&!state.getBoolean("accountMode"))throw new IOException("Invalid revocation mode");
            JSONObject sealed=state.optJSONObject("revocations");if(state.has("revocations")&&sealed==null)throw new IOException("Invalid revocation receipt");
            String fingerprint=sealed==null?"none":Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(sealed.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
            if(!fingerprint.equals(authority.revocationFingerprint)){
                JSONArray pending=sealed==null?new JSONArray():new JSONArray(new String(open(sealed,"TimehutRevocationsV1"),StandardCharsets.UTF_8));
                if(pending.length()>MAX_PENDING)throw new IOException("Invalid pending revocation size");
                java.util.HashSet<String> seen=new java.util.HashSet<>();for(int i=0;i<pending.length();i++){JSONObject row=pending.getJSONObject(i);validateCredential(row,false);if(row.length()!=4||!seen.add(row.getString("issuer")+":"+row.getString("token")))throw new IOException("Invalid pending revocation identity");}
                authority.verifiedRevocations=pending.toString();authority.revocationFingerprint=fingerprint;
            }
            // Only pending revocations reuse authenticated ciphertext by digest.
            // Active credentials above still authenticate on EVERY fresh read.
            verifiedRevocations=new JSONArray(authority.verifiedRevocations);
            verifiedLogins=loginRows(state);
            if(verifiedRevocations.length()+verifiedLogins.length()+(verifiedCredential==null?0:1)>MAX_PENDING)throw new IOException("Invalid account receipt capacity");
            boolean abandoned=false;for(int i=0;i<verifiedLogins.length();i++){JSONObject row=verifiedLogins.getJSONObject(i);if(!row.getBoolean("cancelled")&&!authority.processNonce.equals(row.getString("process"))){row.put("cancelled",true);abandoned=true;}}
            if(abandoned){armRevocations(verifiedRevocations.length()+verifiedLogins.length(),true);persist(candidate(state.optJSONObject("session"),verifiedRevocations,verifiedLogins));}
        }catch(Exception error){authority.failure=error;throw new IOException("帳戶收據無法讀取，原件保留",error);}
    }
    private SecretKey key(boolean create)throws Exception{
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);if(keys.containsAlias(alias))return (SecretKey)keys.getKey(alias,null);
        if(!create)throw new IOException("Account encryption key unavailable");KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setUserAuthenticationRequired(false).build());return generator.generateKey();
    }
    private JSONObject decrypt()throws Exception{return decrypt(state);}
    private JSONObject decrypt(JSONObject source)throws Exception{
        JSONObject sealed=source.optJSONObject("session");if(sealed==null)return null;String owner=sealed.getString("owner");if(!UUID.fromString(owner).toString().equals(owner))throw new IOException("Invalid account owner");
        JSONObject credential=new JSONObject(new String(open(sealed,"TimehutAccountV1:"+owner),StandardCharsets.UTF_8));if(!owner.equals(credential.getString("owner")))throw new IOException("Invalid credential owner");validateCredential(credential,true);return credential;
    }
    private static void validateCredential(JSONObject credential,boolean active)throws Exception{
        String owner=credential.getString("owner");if(!UUID.fromString(owner).toString().equals(owner)||!credential.getString("token").matches("[A-Za-z0-9_-]{32,128}")||!(credential.opt("expiresAt") instanceof Long||credential.opt("expiresAt") instanceof Integer)||credential.getLong("expiresAt")<=0||(active&&!(credential.opt("legacyOwner") instanceof Boolean)))throw new IOException("Invalid credential");
        String issuer=credential.getString("issuer");if(!AccountIdentity.allowedBackend(issuer)||!issuer.equals(AccountIdentity.origin(issuer)))throw new IOException("Invalid credential issuer");
    }
    private byte[] open(JSONObject sealed,String aad)throws Exception{
        int limit=aad.startsWith("TimehutAccountCommitV2:")||aad.startsWith("TimehutAccountRecoveryV1:")?98304:(aad.equals("TimehutRevocationsV1")||aad.equals("TimehutNativeLoginsV1")?12288:4096);
        byte[] iv=Base64.decode(sealed.getString("iv"),Base64.NO_WRAP),bytes=Base64.decode(sealed.getString("ciphertext"),Base64.NO_WRAP);if(iv.length!=12||bytes.length<16||bytes.length>limit)throw new IOException("Invalid encrypted account");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(false),new GCMParameterSpec(128,iv));cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));return cipher.doFinal(bytes);
    }
    private JSONObject seal(byte[] bytes,String aad)throws Exception{
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key(true));cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));return new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).put("ciphertext",Base64.encodeToString(cipher.doFinal(bytes),Base64.NO_WRAP));
    }
    private JSONObject candidate(JSONObject active,JSONArray pending)throws Exception{
        return candidate(active,pending,verifiedLogins==null?new JSONArray():verifiedLogins);
    }
    private JSONObject candidate(JSONObject active,JSONArray pending,JSONArray logins)throws Exception{
        if(pending.length()+logins.length()+(active==null?0:1)>MAX_PENDING)throw new IOException("Account receipt capacity unavailable");
        JSONObject value=new JSONObject().put("version",2).put("accountMode",true);if(active!=null)value.put("session",active);if(pending.length()>0)value.put("revocations",seal(pending.toString().getBytes(StandardCharsets.UTF_8),"TimehutRevocationsV1"));if(logins.length()>0)value.put("nativeLogins",seal(logins.toString().getBytes(StandardCharsets.UTF_8),"TimehutNativeLoginsV1"));return value;
    }
    private JSONArray loginRows(JSONObject source)throws Exception{
        if(!source.has("nativeLogins"))return new JSONArray();
        if(source.getInt("version")!=2||!source.getBoolean("accountMode"))throw new IOException("Invalid native login mode");
        JSONArray rows=new JSONArray(new String(open(source.getJSONObject("nativeLogins"),"TimehutNativeLoginsV1"),StandardCharsets.UTF_8));if(rows.length()>MAX_PENDING)throw new IOException("Invalid native login capacity");java.util.HashSet<String> ids=new java.util.HashSet<>();
        for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);String id=row.getString("id"),secret=row.getString("secret"),issuer=row.getString("issuer"),process=row.getString("process");
            if(!UUID.fromString(id).toString().equals(id)||!ids.add(id)||!secret.matches("[A-Za-z0-9_-]{43}")||!UUID.fromString(process).toString().equals(process)||!row.getString("epoch").matches("[0-9a-f-]{36}:[0-9]+")||!(row.opt("cancelled") instanceof Boolean)||!AccountIdentity.allowedBackend(issuer)||!AccountIdentity.origin(issuer).equals(issuer)||row.length()!=(row.has("token")?7:6)||row.has("token")&&!row.getString("token").matches("[A-Za-z0-9_-]{32,128}"))throw new IOException("Invalid native login receipt");
            if(!id.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")||!Base64.encodeToString(Base64.decode(secret,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING),Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING).equals(secret))throw new IOException("Invalid native cancellation proof");
        }return rows;
    }
    private JSONArray recoveryCredentials(byte[] bytes)throws Exception{
        // Recovery never creates a replacement for a missing encryption key,
        // including a pre-login base with no credential fields yet.
        key(false);
        if(bytes.length>16384)throw new IOException("Invalid account recovery state size");JSONObject source=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
        if(!(source.opt("version") instanceof Integer)||!(source.getInt("version")==1||source.getInt("version")==2)||!(source.opt("accountMode") instanceof Boolean))throw new IOException("Invalid account recovery state");
        if((source.has("session")||source.has("revocations"))&&!source.getBoolean("accountMode"))throw new IOException("Invalid account recovery mode");
        JSONArray pending=new JSONArray();if(source.has("revocations")){JSONObject sealed=source.getJSONObject("revocations");pending=new JSONArray(new String(open(sealed,"TimehutRevocationsV1"),StandardCharsets.UTF_8));}
        if(pending.length()>MAX_PENDING)throw new IOException("Invalid recovery revocation capacity");java.util.HashSet<String> seen=new java.util.HashSet<>();for(int i=0;i<pending.length();i++){JSONObject row=pending.getJSONObject(i);validateCredential(row,false);if(row.length()!=4||!seen.add(row.getString("issuer")+":"+row.getString("token")))throw new IOException("Invalid recovery revocation identity");}
        if(source.has("session")){JSONObject c=decrypt(source);if(c==null)throw new IOException("Invalid recovery session");String identity=c.getString("issuer")+":"+c.getString("token");if(seen.add(identity))pending.put(new JSONObject().put("owner",c.getString("owner")).put("issuer",c.getString("issuer")).put("token",c.getString("token")).put("expiresAt",c.getLong("expiresAt")));}
        JSONArray logins=loginRows(source);for(int i=0;i<logins.length();i++){JSONObject row=logins.getJSONObject(i);pending.put(new JSONObject().put("kind","native-login").put("issuer",row.getString("issuer")).put("token",row.getString("secret")).put("admission",row));}
        return pending;
    }
    private JSONArray retireCurrent()throws Exception{
        JSONArray pending=new JSONArray(verifiedRevocations.toString());if(verifiedCredential==null)return pending;
        String token=verifiedCredential.getString("token"),issuer=verifiedCredential.getString("issuer");for(int i=0;i<pending.length();i++)if(token.equals(pending.getJSONObject(i).getString("token"))&&issuer.equals(pending.getJSONObject(i).getString("issuer")))return pending;
        if(pending.length()>=MAX_PENDING)throw new IOException("請先恢復連線並確認待處理登出，再切換帳戶");return pending.put(new JSONObject().put("owner",verifiedCredential.getString("owner")).put("token",token).put("issuer",issuer).put("expiresAt",verifiedCredential.getLong("expiresAt")));
    }
    private void persist(JSONObject candidate)throws Exception{
        ready();byte[] bytes=candidate.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>16384)throw new IOException("Account receipt capacity unavailable");FileOutputStream output=null;boolean identityChanged=state.optBoolean("accountMode")!=candidate.optBoolean("accountMode")||!String.valueOf(state.opt("session")).equals(String.valueOf(candidate.opt("session")));
        // The very first admission has no prior credential. Keep its captured
        // epoch while closing legacy access, so it can still be cancelled by
        // the caller that began it. Credential changes always advance epoch.
        if(!state.optBoolean("accountMode")&&candidate.optBoolean("accountMode")&&!state.has("session")&&!candidate.has("session")&&candidate.has("nativeLogins"))identityChanged=false;
        try{
            recovery.prepare(bytes);
            output=file.startWrite();output.write(bytes);commits.sync(output);commits.finish(file,output);output=null;
            if(new File(file.getBaseFile().getPath()+".new").exists()||new File(file.getBaseFile().getPath()+".bak").exists()||!Arrays.equals(bytes,read(file.getBaseFile())))throw new IOException("Account commit not published");
            recovery.confirm();
            state=candidate;if(identityChanged)authority.generation++;
        }catch(Exception error){if(output!=null)try{output.close();}catch(Exception ignored){}authority.failure=error;
            // Every live handle fails closed; original/backup/pending bytes stay.
            throw new IOException("帳戶狀態尚未保存，原件與待確認收據保留",error);}
    }
    void activateVerified(String owner,String token,long expiresAt,boolean legacyOwner)throws Exception{activateVerified(owner,token,expiresAt,legacyOwner,AccountIdentity.BACKEND);}
    void activateVerified(String owner,String token,long expiresAt,boolean legacyOwner,String backend)throws Exception{synchronized(authority){
        reload();if(!UUID.fromString(owner).toString().equals(owner)||!token.matches("[A-Za-z0-9_-]{32,128}")||expiresAt<=System.currentTimeMillis())throw new IOException("Invalid verified account");
        if(!AccountIdentity.allowedBackend(backend))throw new IOException("Invalid account issuer");
        String issuer=AccountIdentity.origin(backend);for(int i=0;i<verifiedRevocations.length();i++){JSONObject row=verifiedRevocations.getJSONObject(i);if(token.equals(row.getString("token"))&&issuer.equals(row.getString("issuer")))throw new IOException("此憑證已等待撤銷，請重新登入取得新的憑證");}
        JSONArray pending=verifiedCredential!=null&&(!token.equals(verifiedCredential.getString("token"))||!issuer.equals(verifiedCredential.getString("issuer")))?retireCurrent():verifiedRevocations;
        // Reserve one ledger slot for an offline local sign-out. A full queue
        // may delay another login, but must never trap an active account.
        if(pending.length()+verifiedLogins.length()>=MAX_PENDING)throw new IOException("請先恢復連線並確認待處理登出，再登入其他帳戶");
        JSONArray logins=cancelledLogins();JSONObject credential=new JSONObject().put("owner",owner).put("token",token).put("expiresAt",expiresAt).put("legacyOwner",legacyOwner).put("issuer",issuer);JSONObject sealed=seal(credential.toString().getBytes(StandardCharsets.UTF_8),"TimehutAccountV1:"+owner).put("owner",owner);armRevocations(pending.length()+logins.length(),true);persist(candidate(sealed,pending,logins));
    }}
    private String epoch(){return authority.processNonce+":"+authority.generation;}
    private JSONArray cancelledLogins()throws Exception{JSONArray rows=new JSONArray(verifiedLogins.toString());for(int i=0;i<rows.length();i++)rows.getJSONObject(i).put("cancelled",true);return rows;}
    JSONObject beginLogin(String backend,String expectedEpoch)throws Exception{synchronized(authority){
        reload();if(!epoch().equals(expectedEpoch)||!AccountIdentity.allowedBackend(backend))throw new IOException("登入操作已變更，請重試");
        for(int i=0;i<verifiedLogins.length();i++)if(!verifiedLogins.getJSONObject(i).getBoolean("cancelled"))throw new IOException("請先確認目前的登入結果");
        // Reserve one extra recovery slot: the journal can contain both this
        // cancellation proof and the newly issued credential after an interruption.
        if(verifiedRevocations.length()+verifiedLogins.length()+(verifiedCredential==null?0:1)>=MAX_PENDING-1)throw new IOException("請先恢復連線並確認待處理登入或登出");
        byte[] secret=new byte[32];new java.security.SecureRandom().nextBytes(secret);
        JSONObject row=new JSONObject().put("id",UUID.randomUUID().toString()).put("secret",Base64.encodeToString(secret,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING)).put("issuer",AccountIdentity.origin(backend)).put("process",authority.processNonce).put("epoch",epoch()).put("cancelled",false);
        JSONArray rows=new JSONArray(verifiedLogins.toString());rows.put(row);armRevocations(verifiedRevocations.length()+rows.length(),true);persist(candidate(state.optJSONObject("session"),verifiedRevocations,rows));return new JSONObject(row.toString());
    }}
    void requireLogin(String id)throws Exception{synchronized(authority){reload();for(int i=0;i<verifiedLogins.length();i++){JSONObject row=verifiedLogins.getJSONObject(i);if(id.equals(row.getString("id"))&&!row.getBoolean("cancelled")&&authority.processNonce.equals(row.getString("process"))&&epoch().equals(row.getString("epoch")))return;}throw new IOException("登入已取消或帳戶已變更");}}
    JSONObject logoutCredential()throws Exception{synchronized(authority){reload();if(verifiedCredential==null)return null;return new JSONObject().put("owner",verifiedCredential.getString("owner")).put("token",verifiedCredential.getString("token")).put("issuer",verifiedCredential.getString("issuer")).put("expiresAt",verifiedCredential.getLong("expiresAt"));}}
    void captureLoginToken(String id,String token)throws Exception{synchronized(authority){
        reload();if(token==null||!token.matches("[A-Za-z0-9_-]{32,128}"))throw new IOException("登入回應尚未確認");JSONArray rows=new JSONArray(verifiedLogins.toString());
        for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);if(id.equals(row.getString("id"))){if(row.has("token")&&!token.equals(row.getString("token")))throw new IOException("登入憑證結果不一致，原件保留");row.put("token",token);persist(candidate(state.optJSONObject("session"),verifiedRevocations,rows));return;}}
        throw new IOException("登入已取消，請重新操作");
    }}
    void completeLogin(String id,String owner,String token,long expiresAt,boolean legacyOwner,String backend)throws Exception{synchronized(authority){
        reload();JSONArray remaining=new JSONArray();JSONObject admission=null;for(int i=0;i<verifiedLogins.length();i++){JSONObject row=verifiedLogins.getJSONObject(i);if(id.equals(row.getString("id")))admission=row;else remaining.put(row);}
        String issuer=AccountIdentity.origin(backend);if(admission==null||admission.getBoolean("cancelled")||!authority.processNonce.equals(admission.getString("process"))||!epoch().equals(admission.getString("epoch"))||!issuer.equals(admission.getString("issuer"))||!token.equals(admission.optString("token"))||!UUID.fromString(owner).toString().equals(owner)||expiresAt<=System.currentTimeMillis()||expiresAt>System.currentTimeMillis()+31L*86400000)throw new IOException("登入操作已變更，請重新登入");
        for(int i=0;i<verifiedRevocations.length();i++){JSONObject row=verifiedRevocations.getJSONObject(i);if(issuer.equals(row.getString("issuer"))&&token.equals(row.getString("token")))throw new IOException("此登入正在撤銷，請重新登入");}
        JSONArray pending=verifiedCredential!=null&&(!token.equals(verifiedCredential.getString("token"))||!issuer.equals(verifiedCredential.getString("issuer")))?retireCurrent():verifiedRevocations;
        JSONObject credential=new JSONObject().put("owner",owner).put("token",token).put("expiresAt",expiresAt).put("legacyOwner",legacyOwner).put("issuer",issuer);validateCredential(credential,true);JSONObject sealed=seal(credential.toString().getBytes(StandardCharsets.UTF_8),"TimehutAccountV1:"+owner).put("owner",owner);
        armRevocations(pending.length()+remaining.length(),true);persist(candidate(sealed,pending,remaining));
    }}
    void abortLogin(String id)throws Exception{synchronized(authority){reload();JSONArray rows=new JSONArray(verifiedLogins.toString());for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);if(id.equals(row.getString("id"))&&!row.getBoolean("cancelled")){row.put("cancelled",true);armRevocations(verifiedRevocations.length()+rows.length(),true);persist(candidate(state.optJSONObject("session"),verifiedRevocations,rows));return;}}}}
    JSONArray nativeCancellations()throws Exception{synchronized(authority){reload();JSONArray rows=new JSONArray();for(int i=0;i<verifiedLogins.length();i++){JSONObject row=verifiedLogins.getJSONObject(i);if(row.getBoolean("cancelled"))rows.put(new JSONObject(row.toString()));}return rows;}}
    boolean beginNativeCancellation(JSONObject expected)throws Exception{synchronized(authority){reload();JSONArray rows=new JSONArray();JSONObject selected=null;int position=-1;for(int i=0;i<verifiedLogins.length();i++){JSONObject row=verifiedLogins.getJSONObject(i);if(row.getBoolean("cancelled")&&row.getString("id").equals(expected.getString("id"))&&row.getString("secret").equals(expected.getString("secret"))&&row.getString("issuer").equals(expected.getString("issuer"))){selected=row;position=i;}else rows.put(row);}if(selected==null)return false;if(position!=verifiedLogins.length()-1){rows.put(selected);persist(candidate(state.optJSONObject("session"),verifiedRevocations,rows));}return true;}}
    boolean confirmNativeCancellation(JSONObject expected)throws Exception{synchronized(authority){reload();JSONArray rows=new JSONArray();boolean removed=false;for(int i=0;i<verifiedLogins.length();i++){JSONObject row=verifiedLogins.getJSONObject(i);if(row.getBoolean("cancelled")&&row.getString("id").equals(expected.getString("id"))&&row.getString("secret").equals(expected.getString("secret"))&&row.getString("issuer").equals(expected.getString("issuer")))removed=true;else rows.put(row);}if(removed)persist(candidate(state.optJSONObject("session"),verifiedRevocations,rows));return removed;}}
    boolean pendingWork()throws Exception{synchronized(authority){reload();if(verifiedRevocations.length()>0)return true;for(int i=0;i<verifiedLogins.length();i++)if(verifiedLogins.getJSONObject(i).getBoolean("cancelled"))return true;return false;}}
    boolean accountMode()throws Exception{synchronized(authority){reload();return state.getBoolean("accountMode");}}
    long generation()throws Exception{synchronized(authority){reload();return authority.generation;}}
    String currentOwner()throws Exception{synchronized(authority){reload();JSONObject c=verifiedCredential;return c!=null&&c.getLong("expiresAt")>System.currentTimeMillis()?c.getString("owner"):null;}}
    String tokenForOwner(String owner)throws Exception{synchronized(authority){reload();JSONObject c=verifiedCredential;return c!=null&&owner!=null&&owner.equals(c.getString("owner"))&&c.getLong("expiresAt")>System.currentTimeMillis()?c.getString("token"):null;}}
    String issuerOrigin()throws Exception{synchronized(authority){reload();JSONObject c=verifiedCredential;return c==null?null:c.getString("issuer");}}
    String tokenForRequest(String owner,String url)throws Exception{synchronized(authority){reload();JSONObject c=verifiedCredential;return c!=null&&owner!=null&&owner.equals(c.getString("owner"))&&c.getLong("expiresAt")>System.currentTimeMillis()&&c.getString("issuer").equals(AccountIdentity.origin(url))?c.getString("token"):null;}}
    JSONObject bridgeStatus()throws Exception{synchronized(authority){reload();JSONObject c=verifiedCredential;boolean active=c!=null&&c.getLong("expiresAt")>System.currentTimeMillis(),loginPending=false;for(int i=0;i<verifiedLogins.length();i++)if(!verifiedLogins.getJSONObject(i).getBoolean("cancelled"))loginPending=true;JSONObject result=new JSONObject().put("accountMode",state.getBoolean("accountMode")).put("authenticated",active).put("generation",epoch()).put("pendingRevocations",verifiedRevocations.length()).put("pendingLoginReceipts",verifiedLogins.length()).put("loginPending",loginPending);if(active)result.put("owner",c.getString("owner")).put("expiresAt",c.getLong("expiresAt")).put("legacyOwner",c.getBoolean("legacyOwner"));return result;}}
    void enableAccountMode()throws Exception{synchronized(authority){reload();if(!state.getBoolean("accountMode"))persist(new JSONObject().put("version",1).put("accountMode",true));}}
    private void armRevocations(int count,boolean replace){if(jobContext!=null&&count>0)try{AccountRevocationJobService.arm(jobContext,replace);}catch(Exception ignored){/* Local logout must still close access; encrypted ledger survives for next launch. */}}
    void ensureSystemRevocations()throws Exception{synchronized(authority){reload();armRevocations(verifiedRevocations.length()+verifiedLogins.length(),false);}}
    boolean systemRevocationsScheduled(){return jobContext!=null&&AccountRevocationJobService.scheduled(jobContext);}
    void signOut()throws Exception{synchronized(authority){reload();JSONArray pending=retireCurrent(),logins=cancelledLogins();armRevocations(pending.length()+logins.length(),true);persist(candidate(null,pending,logins));}}
    JSONArray pendingRevocations()throws Exception{synchronized(authority){reload();return new JSONArray(verifiedRevocations.toString());}}
    boolean pendingRevocation(String owner,String token,String issuer)throws Exception{synchronized(authority){
        reload();if(verifiedCredential!=null&&token.equals(verifiedCredential.getString("token"))&&issuer.equals(verifiedCredential.getString("issuer")))throw new IOException("Cannot revoke the active credential");
        for(int i=0;i<verifiedRevocations.length();i++){JSONObject row=verifiedRevocations.getJSONObject(i);if(owner.equals(row.getString("owner"))&&token.equals(row.getString("token"))&&issuer.equals(row.getString("issuer")))return true;}return false;
    }}
    boolean beginSystemRevocation(String owner,String token,String issuer)throws Exception{synchronized(authority){
        if(!pendingRevocation(owner,token,issuer))return false;JSONArray next=new JSONArray();JSONObject selected=null;int position=-1;
        for(int i=0;i<verifiedRevocations.length();i++){JSONObject row=verifiedRevocations.getJSONObject(i);if(owner.equals(row.getString("owner"))&&token.equals(row.getString("token"))&&issuer.equals(row.getString("issuer"))){selected=row;position=i;}else next.put(row);}
        if(selected==null)return false;
        // Persist fair retry order before dispatch, including if the process dies.
        if(position!=verifiedRevocations.length()-1){next.put(selected);persist(candidate(state.optJSONObject("session"),next));}return true;
    }}
    boolean confirmRevocation(String owner,String token,String issuer)throws Exception{synchronized(authority){reload();if(verifiedCredential!=null&&token.equals(verifiedCredential.getString("token"))&&issuer.equals(verifiedCredential.getString("issuer")))throw new IOException("Cannot revoke the active credential");JSONArray next=new JSONArray();boolean removed=false;for(int i=0;i<verifiedRevocations.length();i++){JSONObject row=verifiedRevocations.getJSONObject(i);if(owner.equals(row.getString("owner"))&&token.equals(row.getString("token"))&&issuer.equals(row.getString("issuer")))removed=true;else next.put(row);}if(removed)persist(candidate(state.optJSONObject("session"),next));return removed;}}
    boolean invalidate(String owner,String token)throws Exception{synchronized(authority){reload();JSONObject c=verifiedCredential;if(c==null||!c.getString("owner").equals(owner)||!c.getString("token").equals(token))return false;persist(candidate(null,verifiedRevocations));return true;}}
}
