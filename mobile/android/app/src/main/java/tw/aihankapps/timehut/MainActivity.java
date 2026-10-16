package tw.aihankapps.timehut;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle state) {
        registerPlugin(TransferPlugin.class);super.onCreate(state);
        // Old Android images can ship a WebView that cannot parse the packaged app.
        // Give an actionable native screen instead of a broken login/transfer page.
        String agent=android.webkit.WebSettings.getDefaultUserAgent(this);
        java.util.regex.Matcher version=java.util.regex.Pattern.compile("Chrome/(\\d+)").matcher(agent);
        if(!version.find()||Integer.parseInt(version.group(1))<100){
            getBridge().getWebView().stopLoading();getBridge().getWebView().loadUrl("about:blank");
            android.widget.LinearLayout panel=new android.widget.LinearLayout(this);panel.setOrientation(android.widget.LinearLayout.VERTICAL);panel.setPadding(48,80,48,48);panel.setBackgroundColor(0xfffffaf0);
            android.widget.TextView title=new android.widget.TextView(this);title.setText("請先更新手機的網頁元件");title.setTextSize(24);title.setTextColor(0xff49392b);panel.addView(title);
            android.widget.TextView detail=new android.widget.TextView(this);detail.setText("請更新 Android System WebView 與 Chrome，再重新開啟小屋。更新完成後，才能在這頁開啟照片與送出新傳輸。原有檔案與收據會保留。");detail.setTextSize(17);detail.setPadding(0,32,0,32);detail.setTextColor(0xff49392b);panel.addView(detail);
            android.widget.Button retry=new android.widget.Button(this);retry.setText("重新檢查");retry.setOnClickListener(view->recreate());panel.addView(retry);setContentView(panel);
        }
    }
}
