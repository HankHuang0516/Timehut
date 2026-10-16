package tw.aihankapps.timehut;

import android.system.Os;
import android.system.OsConstants;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Encrypted write-ahead records. Interrupted changes always recover signed out. */
final class AccountCommitRecovery {
    interface Codec {
        JSONObject seal(byte[] value,String purpose)throws Exception;
        byte[] open(JSONObject value,String purpose)throws Exception;
        JSONArray credentials(byte[] state)throws Exception;
        byte[] closed(JSONArray credentials)throws Exception;
    }
    private final File base,intent,temporary,plan,planTemporary;
    private final Codec codec;
    private static final int LIMIT=131072;
    AccountCommitRecovery(File base,Codec codec){this.base=base;this.codec=codec;intent=new File(base+".intent");temporary=new File(base+".intent.tmp");plan=new File(base+".recovery");planTemporary=new File(base+".recovery.tmp");}
    private File sibling(String suffix){return new File(base+suffix);}
    boolean pending(){return intent.exists()||temporary.exists()||plan.exists()||planTemporary.exists()||sibling(".new").exists()||sibling(".bak").exists();}
    static byte[] read(File file)throws Exception{
        if(!file.isFile()||!file.getCanonicalFile().equals(file.getAbsoluteFile()))throw new IOException("Invalid account recovery file");
        try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[2048];int n;while((n=in.read(b))!=-1){if(out.size()+n>LIMIT)throw new IOException("Account recovery capacity unavailable");out.write(b,0,n);}return out.toByteArray();}
    }
    private static void write(File file,byte[] bytes)throws Exception{try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);out.getFD().sync();}}
    private static void syncDirectory(File directory)throws Exception{if(!directory.isDirectory())throw new IOException("Invalid account directory");java.io.FileDescriptor fd=Os.open(directory.getPath(),OsConstants.O_RDONLY,0);try{Os.fsync(fd);}finally{Os.close(fd);}}
    private static String encode(byte[] b){return Base64.encodeToString(b,Base64.NO_WRAP);}
    private static byte[] decode(String b){return Base64.decode(b,Base64.NO_WRAP);}
    private static String hash(byte[] b)throws Exception{return encode(MessageDigest.getInstance("SHA-256").digest(b));}
    private static boolean equal(byte[] a,byte[] b){return a!=null&&b!=null&&Arrays.equals(a,b);}
    private static boolean prefix(byte[] value,byte[] whole){if(value==null||whole==null||value.length>whole.length)return false;for(int i=0;i<value.length;i++)if(value[i]!=whole[i])return false;return true;}
    private byte[] sealed(JSONObject value,String purpose)throws Exception{return codec.seal(value.toString().getBytes(StandardCharsets.UTF_8),purpose).toString().getBytes(StandardCharsets.UTF_8);}
    private JSONObject opened(byte[] value,String purpose)throws Exception{return new JSONObject(new String(codec.open(new JSONObject(new String(value,StandardCharsets.UTF_8)),purpose),StandardCharsets.UTF_8));}
    void prepare(byte[] after)throws Exception{
        if(pending())throw new IOException("Unresolved account commit");
        JSONObject journal=new JSONObject().put("version",2).put("after",encode(after));if(base.exists())journal.put("before",encode(read(base)));
        write(temporary,sealed(journal,"TimehutAccountCommitV2"));
        if(!temporary.renameTo(intent))throw new IOException("Account intent not published");syncDirectory(base.getParentFile());
    }
    void confirm()throws Exception{if(!intent.delete()||intent.exists())throw new IOException("Account commit not confirmed");syncDirectory(base.getParentFile());}
    private LinkedHashMap<String,byte[]> originals()throws Exception{
        LinkedHashMap<String,byte[]> result=new LinkedHashMap<>();for(String suffix:new String[]{"",".intent",".intent.tmp",".new",".bak"}){File f=sibling(suffix);if(f.exists())result.put(suffix,read(f));}return result;
    }
    private JSONArray union(byte[]... snapshots)throws Exception{
        JSONArray result=new JSONArray();HashSet<String> seen=new HashSet<>();for(byte[] bytes:snapshots)if(bytes!=null){JSONArray rows=codec.credentials(bytes);for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);if(seen.add(row.getString("issuer")+":"+row.getString("token")))result.put(row);}}
        if(result.length()>24)throw new IOException("Account recovery revocation capacity unavailable");return result;
    }
    private byte[] target(LinkedHashMap<String,byte[]> source)throws Exception{
        byte[] marker=source.get(".intent"),staged=source.get(".intent.tmp"),current=source.get(""),fresh=source.get(".new"),backup=source.get(".bak");
        if(marker!=null&&staged!=null)throw new IOException("Ambiguous account intent");
        if(marker!=null&&marker.length==32){
            // Legacy digests have no candidate payload. Only an authenticated,
            // intact old base without competing AtomicFile outputs is safe.
            if(staged!=null||fresh!=null||backup!=null||current==null)throw new IOException("Ambiguous legacy account commit");
            JSONArray known=union(current);if(known.length()==0)throw new IOException("Unauthenticated legacy account commit");
            return codec.closed(known);
        }
        byte[] record=marker!=null?marker:staged;if(record==null)throw new IOException("Missing account write-ahead record");
        // A stop can interrupt the preparation file itself. No base write is
        // permitted before this JSON envelope has been synced and renamed.
        // Close an intact authenticated base, preserving the partial bytes;
        // an unavailable candidate remains an unknown server outcome.
        if(staged!=null){
            boolean incomplete=false;try{new JSONObject(new String(staged,StandardCharsets.UTF_8));}catch(org.json.JSONException partial){incomplete=true;}
            if(incomplete){if(current==null||fresh!=null||backup!=null)throw new IOException("Ambiguous partial account preparation");return codec.closed(union(current));}
        }
        JSONObject journal=opened(record,"TimehutAccountCommitV2");if(!(journal.opt("version") instanceof Integer)||journal.getInt("version")!=2||!(journal.opt("after") instanceof String)||(journal.has("before")&&!(journal.opt("before") instanceof String)))throw new IOException("Invalid account write-ahead record");
        byte[] before=journal.has("before")?decode(journal.getString("before")):null,after=decode(journal.getString("after"));
        JSONArray known=union(before,after);
        boolean priorBacked=equal(backup,before);
        if(current!=null&&!equal(current,before)&&!equal(current,after)&&!(priorBacked&&prefix(current,after)))throw new IOException("Account source changed during recovery");
        if(backup!=null&&!priorBacked)throw new IOException("Invalid account recovery backup");
        if(fresh!=null&&!prefix(fresh,after))throw new IOException("Invalid account recovery candidate");
        if(staged!=null&&(fresh!=null||backup!=null||!((before==null&&current==null)||equal(current,before))))throw new IOException("Unpublished account intent changed source");
        return codec.closed(known);
    }
    private JSONObject prepareRecovery()throws Exception{
        LinkedHashMap<String,byte[]> source=originals();byte[] target=target(source);
        File archive=new File(base.getParentFile(),base.getName()+".preserved-"+UUID.randomUUID());if(!archive.mkdir())throw new IOException("Account originals could not be preserved");
        JSONObject hashes=new JSONObject();for(Map.Entry<String,byte[]> row:source.entrySet()){String name="original"+row.getKey();write(new File(archive,name),row.getValue());hashes.put(row.getKey(),hash(row.getValue()));}
        // A partial preparation never authorizes a base-file change. Preserve
        // it as evidence, then rebuild solely from the still intact originals.
        if(planTemporary.exists())write(new File(archive,"interrupted-recovery-record"),read(planTemporary));
        JSONObject receipt=new JSONObject().put("version",1).put("archive",archive.getName()).put("sources",hashes).put("target",encode(target));
        byte[] encrypted=sealed(receipt,"TimehutAccountRecoveryV1");write(new File(archive,"recovery-record"),encrypted);syncDirectory(archive);syncDirectory(base.getParentFile());
        write(planTemporary,encrypted);if(!planTemporary.renameTo(plan))throw new IOException("Account recovery record not published");syncDirectory(base.getParentFile());return receipt;
    }
    private byte[] validateRecovery(JSONObject receipt)throws Exception{
        if(!(receipt.opt("version") instanceof Integer)||receipt.getInt("version")!=1)throw new IOException("Invalid account recovery version");
        String name=receipt.getString("archive");if(!name.matches(java.util.regex.Pattern.quote(base.getName())+"\\.preserved-[0-9a-f-]{36}"))throw new IOException("Invalid account recovery archive");
        File archive=new File(base.getParentFile(),name);JSONObject hashes=receipt.getJSONObject("sources");
        for(Iterator<String> i=hashes.keys();i.hasNext();){String suffix=i.next();if(!Arrays.asList("",".intent",".intent.tmp",".new",".bak").contains(suffix)||!hash(read(new File(archive,"original"+suffix))).equals(hashes.getString(suffix)))throw new IOException("Preserved account source changed");}
        byte[] target=decode(receipt.getString("target"));JSONObject closed=new JSONObject(new String(target,StandardCharsets.UTF_8));if(closed.has("session")||!Boolean.TRUE.equals(closed.opt("accountMode")))throw new IOException("Recovery cannot restore active access");codec.credentials(target);
        for(Map.Entry<String,byte[]> row:originals().entrySet()){
            String suffix=row.getKey();byte[] value=row.getValue();if(hashes.has(suffix)&&hash(value).equals(hashes.getString(suffix)))continue;
            if(suffix.isEmpty()&&equal(value,target))continue;
            throw new IOException("Current account source changed after recovery preparation");
        }
        return target;
    }
    void recover()throws Exception{
        JSONObject receipt=plan.exists()?opened(read(plan),"TimehutAccountRecoveryV1"):prepareRecovery();byte[] target=validateRecovery(receipt);
        // Recovery uses its own staging file and never lets AtomicFile choose
        // a previous active credential. The authenticated plan survives stops.
        File replacement=sibling(".recovered");write(replacement,target);if(!replacement.renameTo(base))throw new IOException("Closed account recovery not published");syncDirectory(base.getParentFile());
        if(!equal(read(base),target))throw new IOException("Closed account recovery not confirmed");
        for(File old:new File[]{intent,temporary,sibling(".new"),sibling(".bak"),planTemporary})if(old.exists()&&(!old.delete()||old.exists()))throw new IOException("Preserved account recovery cleanup incomplete");
        syncDirectory(base.getParentFile());if(!plan.delete()||plan.exists())throw new IOException("Account recovery not confirmed");syncDirectory(base.getParentFile());
    }
}
