package tw.aihankapps.timehut;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** The native and server use the same length-prefixed UTF-8 metadata identity. */
final class UploadIdentity {
    interface Check {void ensure()throws Exception;}
    static String hex(byte[] bytes){StringBuilder value=new StringBuilder();for(byte b:bytes)value.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return value.toString();}
    static String content(File file,Check check)throws Exception{MessageDigest hash=MessageDigest.getInstance("SHA-256");try(InputStream input=new FileInputStream(file)){byte[] buffer=new byte[1024*1024];int count;while((count=input.read(buffer))!=-1){check.ensure();hash.update(buffer,0,count);}}return hex(hash.digest());}
    static String metadata(String... fields)throws Exception{MessageDigest hash=MessageDigest.getInstance("SHA-256");for(String field:fields){byte[] bytes=(field==null?"":field).getBytes(StandardCharsets.UTF_8);hash.update((bytes.length+"\n").getBytes(StandardCharsets.US_ASCII));hash.update(bytes);hash.update((byte)'\n');}return hex(hash.digest());}
}
