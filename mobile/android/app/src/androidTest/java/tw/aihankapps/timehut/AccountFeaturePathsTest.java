package tw.aihankapps.timehut;
import org.junit.Test;
import android.os.Bundle;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import static org.junit.Assert.*;
public class AccountFeaturePathsTest {
 @Test public void exactNewPathsPreserveNarrowAuthority()throws Exception{
  String id="11111111-2222-4333-8444-555555555555";int checks=0;
  for(String p:new String[]{"/api/accounts/photo-deletions","/api/accounts/photo-deletions?page=2","/api/accounts/photo-deletions?album="+id+"&photoIds=90000000401%2C90000000402"}){assertTrue(p,AccountClient.allowedPath("GET",p));checks++;for(String method:new String[]{"POST","PUT","DELETE"}){assertFalse(p,AccountClient.allowedPath(method,p));checks++;}}
  for(String p:new String[]{"/api/accounts/photo-deletions/extra","/api/accounts/%70hoto-deletions","/api/accounts/photo-deletions#fragment","https://evil.invalid/api/accounts/photo-deletions","//evil.invalid/api/accounts/photo-deletions"}){assertFalse(p,AccountClient.allowedPath("GET",p));checks++;}
  for(String p:new String[]{"/api/accounts/albums/archived","/api/accounts/feedback","/api/accounts/feedback/inbox","/api/accounts/feedback/"+id,"/api/accounts/feedback/"+id+"/image/0","/api/accounts/notifications","/api/accounts/notification-settings"}){assertTrue(p,AccountClient.allowedPath("GET",p));checks++;}
  for(String p:new String[]{"/api/accounts/albums/"+id+"/archive","/api/accounts/albums/"+id+"/restore","/api/accounts/feedback","/api/accounts/feedback/"+id+"/chunks/0","/api/accounts/feedback/"+id+"/complete","/api/accounts/feedback/"+id+"/cancel","/api/accounts/notifications/"+id+"/read"}){assertTrue(p,AccountClient.allowedPath("POST",p));checks++;}
  for(String p:new String[]{"/api/accounts/albums/"+id+"/title","/api/accounts/notification-settings"}){assertTrue(p,AccountClient.allowedPath("PUT",p));checks++;}
  for(String p:new String[]{"/uploads/.feedback/"+id+"/image","/api/accounts/feedback/../me","/api/accounts/feedback/%2e%2e/me","/api/accounts/feedback/bad/image/0","/api/accounts/feedback/"+id+"/image/-1","/api/accounts/feedback/"+id+"/image/1000","/api/accounts/feedback/"+id+"/resolve","/api/accounts/bug-releases","/api/accounts/session/refresh"})for(String method:new String[]{"GET","POST","PUT","DELETE"}){assertFalse(p,AccountClient.allowedPath(method,p));checks++;}
  Bundle result=new Bundle();result.putString("timehutReport",new JSONObject().put("status","PASS_NARROW_FEATURE_ACCOUNT_PATHS").put("checks",checks).put("networkRequests",0).toString());InstrumentationRegistry.getInstrumentation().sendStatus(0,result);
 }
}
