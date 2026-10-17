# 97.1：字型載入不再阻塞頁面啟動

原入口的登入轉向會等待 DOMContentLoaded；Google 字型 CSS 是阻塞樣式表時，網路延遲會一起延後該事件。新來源只把 index、timeline、album、search、settings 的同一字型 CSS 改為非阻塞載入，完成後套用；URL、字型、字重及 fallback 保留，沒有改帳戶／登入授權、後端或原生傳輸政策。

工程證據在 `.codex-local/qa/20261017-native-bootstrap-font/`。精確96包的 host控制使用真 Accounts/account-config/HTML，僅原生橋接為合法未登入stub：正常156ms；人工延遲CSS8.245秒時 native=true、仍在index、document loading且body hidden，釋放159ms後進入帳戶頁。實際96原生控制也保存8.627秒相同等待狀態、之後account complete/native true；第一次原生測試在導航時的evaluateJavascript回覆等待assert失敗，整次不算通過，修正與後續結果分開保存。

這些證據不倒推舊A96-E1那次失敗必然同因。96保留歷史HOLD；97需新的實際包／原生啟動、UI／H／獨立複查，不能用來源修正代替。測試中的人工字型CSS回覆不是正式Flickr、真實帳戶或手機驗收。

SystemUiInsetsTest同時移除舊版號95硬編碼，改查編譯時的BuildConfig versionName及versionCode與實際安裝包精確一致；沒有放寬版本匹配或延長既有等待期限。

test95R6、backend71、scopedweb5已另外直接獲准並發布，收據在 `20261017-scoped-update-web71-publish`。97仍是未發布來源；正式六頁／每頁兩軸80／固定36／未驗0及實機界線保持。凍結來源與最新工程結果分別以source receipt和QA delivery為準。
