package tw.aihankapps.timehut;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.Assert.*;

/** Retire only ended loopback fixtures with both a synthetic token and task provenance. */
@RunWith(AndroidJUnit4.class)
public class KnownSyntheticSessionRetirementTest {
    private static String identity(JSONObject row)throws Exception{return row.getString("issuer")+" "+row.getString("token");}
    @Test public void confirmKnownTaskFixturesAndKeepEveryUnknownReceipt()throws Exception{
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();assertTrue(BuildConfig.DEBUG);assertTrue(java.util.Arrays.asList("tw.aihankapps.timehut.accountqa","tw.aihankapps.timehut.accountqa67").contains(context.getPackageName()));TransferEngine.initialize(context);
        Map<String,JSONObject> selected=new LinkedHashMap<>(),protectedRows=new LinkedHashMap<>();Map<String,Set<String>> byIssuer=new LinkedHashMap<>();String active;long generation;int tasks;
        File preserved=new File(context.getNoBackupFilesDir(),"known-synthetic-retirement/"+UUID.randomUUID());assertTrue(preserved.mkdirs());
        synchronized(TransferEngine.accountBoundary()){
            AccountSessionStore store=TransferEngine.accounts();active=store.currentOwner();generation=store.generation();JSONArray all=TransferEngine.list();tasks=all.length();Set<String> taskOwners=new HashSet<>();
            for(int i=0;i<all.length();i++){JSONObject task=all.getJSONObject(i);if(Arrays.asList("native-synthetic-only","synthetic-owner-only","synthetic-account-race-only","synthetic-account-lifecycle-only","synthetic-system-revocation-only").contains(task.optString("tags"))&&!task.optString("ownerUserId").isEmpty())taskOwners.add(task.getString("ownerUserId"));}
            JSONArray rows=store.pendingRevocations();for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);URL url=new URL(row.getString("issuer"));boolean known=taskOwners.contains(row.getString("owner"))&&row.getString("token").startsWith("synthetic_")&&url.getProtocol().equals("http")&&url.getHost().equals("127.0.0.1")&&url.getPort()>1024;
                assertNotEquals(store.tokenForOwner(row.getString("owner")),row.getString("token"));(known?selected:protectedRows).put(identity(row),row);if(known)byIssuer.computeIfAbsent(row.getString("issuer"),ignored->new HashSet<>()).add(row.getString("token"));}
            byte[] original=AccountCommitRecovery.read(new File(context.getNoBackupFilesDir(),"accounts/session.json").getCanonicalFile());try(FileOutputStream out=new FileOutputStream(new File(preserved,"session-original-encrypted.json"))){out.write(original);out.getFD().sync();}
        }
        List<ServerSocket> sockets=new ArrayList<>();ExecutorService pool=Executors.newCachedThreadPool();JSONArray occupied=new JSONArray();
        try{
            for(String issuer:new ArrayList<>(byIssuer.keySet()))try{sockets.add(new ServerSocket(new URL(issuer).getPort(),16,InetAddress.getByName("127.0.0.1")));}catch(BindException busy){occupied.put(issuer);byIssuer.remove(issuer);for(Iterator<Map.Entry<String,JSONObject>> i=selected.entrySet().iterator();i.hasNext();){Map.Entry<String,JSONObject> row=i.next();if(issuer.equals(row.getValue().getString("issuer"))){protectedRows.put(row.getKey(),row.getValue());i.remove();}}}
            for(ServerSocket socket:sockets){String issuer="http://127.0.0.1:"+socket.getLocalPort();Set<String> tokens=Collections.unmodifiableSet(byIssuer.get(issuer));pool.submit(()->{while(!socket.isClosed())try(Socket client=socket.accept()){client.setSoTimeout(3000);InputStream in=client.getInputStream();ByteArrayOutputStream header=new ByteArrayOutputStream();int tail=0,c;while((c=in.read())!=-1){header.write(c);tail=(tail<<8)|c;if(tail==0x0d0a0d0a)break;if(header.size()>16384)throw new IOException("Synthetic header bound");}String raw=header.toString("UTF-8"),bearer=null;for(String line:raw.split("\r\n"))if(line.toLowerCase(Locale.ROOT).startsWith("authorization: bearer "))bearer=line.substring(22).trim();boolean known=raw.startsWith("POST /api/accounts/logout HTTP/1.1\r\n")&&tokens.contains(bearer);String status=known?"401 Ended Known Synthetic Namespace":"503 Unknown Receipt Preserved";client.getOutputStream().write(("HTTP/1.1 "+status+"\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").getBytes(StandardCharsets.US_ASCII));}catch(Exception ignored){/* No acknowledgement means the encrypted receipt stays pending. */}});}
            for(String issuer:byIssuer.keySet())for(int attempt=0;attempt<48;attempt++){boolean remaining=false;for(JSONObject row:selected.values())if(issuer.equals(row.getString("issuer"))&&TransferEngine.accounts().pendingRevocation(row.getString("owner"),row.getString("token"),issuer)){remaining=true;break;}if(!remaining)break;AccountClient.drainRevocation(issuer);}
            JSONArray after=TransferEngine.accounts().pendingRevocations();Map<String,JSONObject> remaining=new HashMap<>();for(int i=0;i<after.length();i++){JSONObject row=after.getJSONObject(i);remaining.put(identity(row),row);}
            for(String id:selected.keySet())assertFalse("Known pending fixture should confirm at its original issuer",remaining.containsKey(id));
            for(Map.Entry<String,JSONObject> row:protectedRows.entrySet()){assertTrue("Every unknown receipt remains",remaining.containsKey(row.getKey()));JSONObject retained=remaining.get(row.getKey());for(String field:new String[]{"owner","issuer","token","expiresAt"})assertEquals(row.getValue().get(field),retained.get(field));}
            assertEquals(protectedRows.size(),remaining.size());assertEquals(active,TransferEngine.accounts().currentOwner());assertEquals(generation,TransferEngine.accounts().generation());assertEquals(tasks,TransferEngine.list().length());
            JSONObject report=new JSONObject().put("status","PASS_KNOWN_SYNTHETIC_SUBSET_RETIRED_UNKNOWN_PRESERVED").put("selectedConfirmed",selected.size()).put("protectedBefore",protectedRows.size()).put("protectedAfter",remaining.size()).put("occupiedIssuersPreserved",occupied).put("originalEncryptedSnapshotPreserved",preserved.getName()).put("activeOwnerAndGenerationUnchanged",true).put("taskCountUnchanged",tasks).put("providerRequests",0).put("physicalPhone",false);
            try(FileOutputStream out=new FileOutputStream(new File(context.getFilesDir(),"known-synthetic-retirement-report.json"))){out.write(report.toString(2).getBytes(StandardCharsets.UTF_8));}
        }finally{for(ServerSocket socket:sockets)socket.close();pool.shutdownNow();pool.awaitTermination(3,TimeUnit.SECONDS);}
    }
}
