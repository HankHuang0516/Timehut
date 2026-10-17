<!-- TIMEHUT_CURRENT_RELEASE_STATUS_BEGIN -->
## 2026-10-17：目前發布與驗收狀態

Android **test.94 已發布內測**，可覆蓋安裝原測試版：[下載 APK](https://github.com/HankHuang0516/Timehut/releases/download/android-test-2026.10.16-94/HuangJiaXiaoWu-2026.10.16-test94.apk)。13,794,077bytes／SHA256 bcc4f7cd499f1e524a98736f9ad49706bd2ecda157e9cbe707d94a8e526d6108；GitHub prerelease（非latest），官方digest與實際公開下載HTTP200／bytes／SHA一致。source commit7757b77df5e14f062ebde8081f63cf8a6e38f5f3，rootHEAD/index與95開發來源保留、未pushmain。當版實際包19個圖示資源重綁及94mask／安裝後AppInfo再目視，浮水印存在／樣式正確。

Hank直接核准 exact94 單一 gplay dataSync0x1 誤報的內測例外；raw exit1保留，不擴及未來版本或商店提交。94精確工程、原六頁已呈現視覺80/81/82/81/81/82、IME／driver修正與新隔離debug背景均已獨立有界複查。這不是原36功能／每頁兩軸完整通過；實體Android由Hank收到安裝版測、iPhone後補，完整正式仍HOLD。手機清單與發布收據見 `.codex-local/qa/20261017-internal-release94-proposal/`。

新4份人工正式資料測試亦獲直接核准：僅2個臨時普通帳戶、3個App虛擬相簿、凍結3PNG+1兩秒MP4共31,816bytes、最多4個新Flickr ID，完成後精確清理新4媒體與own2帳戶。F1–F5流程問題修正、host故障測試及獨立最終補審已完成；**本輪實際正式API／媒體fixture20check通過且精確清理完成**：4份provider原檔SHA一致、私密／owner／標籤日期／虛擬移入移出讀回、B隔離拒絕、真Chrome解碼及2秒影片播放。4新ID均signednotfound、own2帳戶刪除收據complete且舊會話401。109列hashchain已核對；實際結果見 `.codex-local/qa/20261017-public-provider-live4/live-result.json`，新原生／真機／全產品UI正式加分0。結果未知只讀續查、不重傳或重設預算。舊7人工ID刪除終態、既有家庭照片／原授權不擴及。

正式後端仍1.0.70／2026.10.16.4，網站web.4／75設計基線、預設安裝入口75未更新。本輪未部署後端／整套網站，既有更新授權仍有效；下次部署須重查當下傳輸與持久資料，不能沿用舊空佇列。原持久卷/app/uploads／帳戶SQLite保留；沒有新增Flickr key／OAuth授權、SMTP或更改真實使用者密碼。家庭管理者huanghome2026、支援hankhuang0516@gmail.com與中央Flickr用途核准保留。

新增使用者要求的「所有用戶設定內更新通知」已完成來源候選及隔離卡片測試／59檔打包核對；分平台／安裝管道、已讀去重、未知／失敗不假報。目錄僅列已核對94與web.4，發布目錄工具拒絕未發佈、錯檔與倒退。**尚未部署或包入已發布94**，不繼承凍結95.4全頁畫面驗收；來源獨立複查已PASS（仍只候選），整合/發布次序見 `.codex-local/qa/20261017-all-users-update-notice/integration-plan.json`，不碰私人回饋收件匣。

iOS protocol3 host／HTTP／無簽章編譯為有界證據；最新實際Keychain冷程序仍因兩次管理器admission失敗未開始，待真實健康狀態改變，不盲重試或繞過。沒有IPA分發／商店提交。全域simplify已取消強制，本輪未執行不冒稱通過；其餘H／功能／權限／UI／安全／複查與發布批准保持。完整機器可讀狀態見 `.codex-local/qa/20261016-formal-six-page/formal-acceptance-current.json`，下方歷史文字不覆蓋本節。
<!-- TIMEHUT_CURRENT_RELEASE_STATUS_END -->

## 2026-10-16 最新：六頁畫面修正已分發 Android test.79，等待 Hank 實機測試

Hank 指示先把畫面做好並提供 Android 內部安裝版，由 Hank 實測，iPhone 後補。test.79 已依此授權分發為 GitHub prerelease，下載檔13,772,393 bytes、SHA256 cbb17947a0c80db498f2592823134e6a555efe44335a053bb4366a4c005dab27 已實際核對；來源527e0d62555c003097af76ba003a0d4919bb59ae只在 internal/android-ui-test79-20261016 分支與精確標籤，不更新main／公開網站／後端。正式後端仍68，網站預設安裝入口仍75，77未分發。

原六頁已呈現狀態的獨立視覺分為81／82／84／81／82／83，平均82.17；各頁尚缺部分狀態，不是完整正式兩軸80%通過。原六頁／36功能項／權重／未驗計0不變，歷史33/36不得無條件沿用現行公開帳戶路徑。27組瀏覽器、15組本機服務、9組帳戶入口通過；provider為合成回覆。當版來源及靜態APK獨立複查在已審範圍無P0／P1／P2阻擋，既有安全拒絕保留。test.79非DEBUG、同簽章，SDK26／36通過75→77→79保留資料更新鏈，未聲稱直接75→79實測；實際包內及安裝後icon H目視為「浮水印存在／樣式正確」。

完整正式驗收保持HOLD；79正式HTTPS背景傳輸、實體Android／OEM及部分視覺／功能狀態仍待證據，iPhone後補，雙商店未提交。此次沒有Flickr寫入或家人媒體操作。原工作副本HEAD／index保持不變，不可直接reset／pull覆寫。發布收據 `.codex-local/qa/20261016-android-installer79/publication.json`；完整正式狀態與手機測項在 `.codex-local/qa/20261016-formal-six-page/`。下方均為歷史紀錄。

---

## 2026-10-16：原六頁／兩軸正式標準續作、Android 畫面內測候選

Hank 再次指定「按照原六頁／兩軸至少80%的正式驗收」。原02/03/05/06/07/08與36項、五項視覺權重、各頁及平均各80、未驗計0不變。最新獨立審核確認歷史33/36不能無條件貼到開放註冊後的現行來源；正式目標未完成。一般登入不冒稱原Flickr operator授權閉環，模擬器不冒稱真機。

正在修正時間軸相簿姓名／人物、資訊密度、相集下方工具列、設定生日雙欄、上傳插畫／列高及批次緊湊網格；帳戶入口另補童書插畫及時間軸導向，不計入六頁分母。已凍結54張雙端／狀態截圖供正式視覺獨立評分；24個純瀏覽器操作及15個真正本機HTTP／SQLite回歸通過，provider仍為人工fixture，不新增live分數。完整記錄 `.codex-local/qa/20261016-formal-six-page/`。

Hank 指示先把畫面做好再提供 Android 可安裝內部測試版，由Hank實測；Android先驗，iPhone後補。這是本輪測試分發授權，不是正式驗收完成或雙商店提交。候選test.77已編譯、實際57份包內公開網頁核對、原簽章、Android26/36從75保留資料更新通過；原12個native主Java及4份帳戶／傳輸腳本與75相同。各密度／遮罩／32、48、64及兩系統實際安裝後icon H目視為「浮水印存在／樣式正確」。仍待視覺／來源複查後分發；當前未發布77，正式後端68／公開網站／安裝下載75不變。

手機背景上傳原入口在capabilities確認後導向transfer.html，仍走原生持久佇列；一般網頁File上傳不能當作原生背景。尚未執行77正式HTTPS傳輸、實體Android／OEM或iPhone全套驗證。正式門檻保持HOLD，未以作者自評、示例資料或測試數量補分。

---

## 2026-10-16：Railway 登入與指定 SSH 公鑰已完成

已依 Hank「再一次」重開有效登入，官方 CLI 確認登入原帳戶 hankhuang0516@gmail.com。指定公鑰 SHA256:UzP0JjUedtIwDdF5WMEJzGo1X2Ll/c2mG086L1WOIOE 已登記為 timehut-codex-deployment-20261015，官方列表確認精確指紋且原 claw0 金鑰保留。沒有更動全域 SSH agent；只使用隔離暫時 agent 並已結束。較早用公鑰路徑選取失敗且查列表確認未新增後，才改用官方支援的指紋選取成功；沒有重複金鑰。

新金鑰已實際唯讀連上正確 project／service／environment／deployment 及原持久卷；stdin／stdout 均非TTY，資料移交的傳輸形式限制已解除。正式仍是 Node18.20.8／原deployment，.accounts 尚不存在，保留原件目錄存在但本次未重驗每檔bytes；queue.json 仍缺，不能視為空佇列或全域上傳已靜止。私有家庭資料庫沒有送出，沒有部署／分發／開註冊／Flickr寫入，當版獨立審查先前遭自動安全拒絕的發布阻擋仍保留。原候選71及背景證據不變；完整本輪收據在 .codex-local/qa/20261016-railway-login-retry/。

## 2026-10-15 最新：Android 背景回歸與候選 test.71（未發布）

這段更新覆蓋下方歷史紀錄的「目前」狀態。Android 帳戶失效現在由原生 accountChanged 事件即時通知畫面；共享 JS 以 process／generation 拒絕晚到的舊回覆，重複事件不能清除新帳戶。SDK36 的隔離 DEBUG QA72 通過16項登入保存／原生HTTP、12項帳戶與傳輸入口、2項真正背景下載401事件驗證；共享JS的Android17組及iOS委派19組通過，後者不代表iOS原生執行。

同一QA72包以實際WebView bridge／系統傳輸驗證14,493,799 bytes人工PNG：回HOME、切設定App、確認interactive=false且keyguard=true後，上下載bytes均持續增加；原檔、MediaStore保存、MOV／MP4、錯誤媒體拒絕及明確強停重開後的完成收據通過。強停測的是已完成收據恢復，不是強停後活動傳輸自動繼續。無Flickr請求，不增加正式分數。

非DEBUG候選test.71（code71）APK SHA256 a18b3eb41ba0164330c448daf7bae1a62f81e116d0b3690b88728db522efc3f9，13,767,645 bytes，維持原測試簽章。51份main輸入與QA72一致，實際57份安全網頁含最新政策。SDK26／36各從已知68原地升級，保留原bytes及合成舊schema1待撤銷憑證，遷移schema2且拒絕舊直接設憑證入口；未清資料。SDK36初次擷取登入畫面的時序assert失敗，但前面5項全部通過；隨後只補取同一已安裝版本畫面成功，原失敗保留。SDK26舊WebView只確認更新指引，不算該系統背景傳輸通過。

當版實際APK各密度、32／48／64與平台遮罩、兩系統安裝後圖示已目視為「浮水印存在／樣式正確」，不要求小尺寸辨字。候選後端1.0.66／2026.10.15.2重新封裝80份安全檔通過9組；Pages候選與test.71完整下載／同網域登入入口／私人快取排除通過5組實際無頭瀏覽器測試。這些是候選，沒有部署、分發、開註冊或商店提交；正式仍test.56、後端1.0.64、註冊OFF、33/36，06仍低於80%。

下一步受Railway重新登入及當版獨立複查阻擋：已核准的精確公鑰尚未登記，個人及正確工作區列表均被現有登入拒絕；兩個舊驗證碼已失效，不重問原授權或連續產生新碼。先前恢復獨立審查工具遭自動安全審核以可能資安風險拒絕，未重試／換審查者繞過。尚須真實上傳靜止狀態、非TTY私有管理者庫移交、正式Node24／HTTPS聯調；不得以舊status0或缺queue檔推定安全。真機／OEM未驗；雙平台仍為上架計畫，iOS最新原生包／缺H圖示等保留提交前項目。最新綁定為 android-current-background-latest-bindings.json，完整本輪證據在20261015-android-current-background及20261015-android-installer71。

## 2026-10-15：Android 持久登入接納／未知回覆撤銷，後端候選1.0.66

Android新來源現在先以Keystore加密保存登入ID、32-byte隨機撤銷證明及原世代，再送HTTP；回覆收到的bearer先持久保存再查身分，只有原接納仍有效才在同一帳戶交易發布登入並移除接納。登入期間登出在bridge入口立即關閉本機權限並取消接納，獨立的收尾執行器不等待舊登入的HTTP；延遲成功不能重新啟用帳戶。schema2接受舊schema1並保留原憑證／收據；未知或錯誤紀錄不重設。24個總收據容量另預留中斷恢復空間，滿額在HTTP前拒絕。系統／前台撤銷工作加入原請求的撤銷證明，派發前保存公平順序。

後端新增 `/api/accounts/native-login` 與 `/native-login/cancel`（第二個完整路徑為 `/api/accounts/native-login/cancel`）。密碼計算前先保存接納；同ID不會發第二個token，先到的取消標記能阻擋晚到登入。取消只接受精確證明，成功回覆綁定protocol1／attemptId及布林值，503／404／401或字串「true」均不能清本機收據。後端只存證明與token的雜湊，最少保留至token到期後兩天，通常32天，後續登入／取消時才清理到期項；會同時移除該筆到期session，避免時鐘回退復活。帳戶完整刪除及舊JSON遷移檔的清理亦涵蓋已歸屬的登入紀錄；政策草稿已補充，尚未公開發布。

實際SDK36的Keystore／原生HTTP16項通過（11組儲存、5組受控HTTP），同一主APK重驗WebView帳戶／傳輸12項。主APK `44e21214a3bc1cddb87c7752393bdca0f2852cc401f9e859aba0a66343cd5302` 是DEBUG QA70新修訂，仍不是可分發的testing安裝版；這輪未改共享JS。受控HTTP不是正式HTTPS或真Flickr，沒有新正式分數。

另以完整本機根後端／SQLite實際發出A的憑證並暫扣回覆：Android原PID25133在instrumentation結束後已消失，明確重開後PID25190以原Keystore證明續查。登入POST只有1次；先由真正後端撤銷A並故意回錯型別ACK，裝置仍保留收據，再收到精確ACK才清除。B的原session及原tasks.json完整bytes保留，供應者請求／建立均0，終態本機pending0。這是實際程序終止後的明確重開，不是強停後自動繼續、OS自動喚醒、一般切App／鎖屏或真機證據。

冷程序驗證器在第一台完整成功後，多查了不需要的第二台SDK36，pm path回傳非0而令整體命令失敗；第二台未進入安裝／啟動／清理。第一台兩份JUnit、前後程序、後端報告及1POST終態已獨立於收尾錯誤核對；保留原失敗、不重跑成功個案、不列第二台通過。驗證器已改為完成所需單一SDK36即收尾，僅做語法檢查，沒有假稱修後執行通過；管理器狀態確認兩租約已釋放。冷測當時根後端是加入新協定的1.0.65工作來源，之後只更動版本字串為1.0.66／2026.10.15.2。

新後端15組SQLite／實際HTTP控制通過（含真正競爭寫入鎖／未知回覆／提前取消／重開／A-B隔離／刪除舊JSON與SQLite殘留）；舊帳戶18、SQLite8、HTTP5及刪除回歸全數通過。1.0.66實際平鋪80檔（後端26＋安全網站54）已封裝並由Node24通過9組完整包測試，新第9範圍包含原生登入協定重啟後的精確撤銷、B保留、重複及先取消的請求拒絕。此80檔是新增協定模組後的安全新產物，與較早含家庭16120.jpg而失格的80檔不是同一包。沒有憑證、資料庫或私人照片，持久卷仍按既有路徑保留。

下一輪仍須新版非DEBUG安裝包、最新政策網頁同步、schema2升級、完整切App／鎖屏回歸、真實帳戶表單與背景401事件、當版H及獨立複查。最新政策文字在1.0.66網站包，未回填到已測試的44e21214主APK，不能冒稱本包全部網頁等於現行根目錄。OS自動冷續查、公平順序多個原請求的實際OS證據、真機／OEM、公開HTTPS與iOS新協定仍未驗。公開test.56／Railway1.0.64／註冊OFF及正式33/36保持；沒有部署／分發／商店提交或家庭資料庫送出。SSH金鑰登記已獲直接允許，但目前OAuth缺少帳戶金鑰權限，兩次短效登入碼均逾時，金鑰尚未登記；不因逾時重問已獲准的金鑰或部署授權。獨立複查仍受先前自動安全拒絕阻擋，沒有繞過。完整綁定 `native-login-admission-latest-bindings.json`。

## 2026-10-15：傳輸入口加入帳戶綁定，QA70 新修訂通過限定驗證

Android的list／thumbnail／prepareUpload／enqueueUpload／enqueueDownload／cancel／retry／saveToPhotos八個入口現在要求呼叫者的owner及process generation。新增任務與變更／發布在帳戶邊界內重查；背景縮圖／保存沿用原任務lease。選取回傳及每段複製重新核對原呼叫者，準備中的部分檔案和收據保留在原owner。Android傳輸中心與帳戶頁的原生傳輸均改走同一個sharedJS綁定入口；iOS傳輸委派維持舊協定，未列為原生隔離新增通過。

沿用隔離DEBUG QA70命名空間，先核對已安裝舊包SHA再原地更新，沒有清資料／降版／重設。現行主APK `306e1c189515e49ca7f53bbd9c24e3f1fc4de0e7cbf5fbe7c74e153112422e77` 在管理下SDK36實際WebView API／Keystore／隔離HTTP通過12項（含4組傳輸）：舊呼叫排隊期間切換帳戶不能建立下載、八入口拒絕缺漏／舊scope、同owner新token拒絕舊generation、正確scope仍可列出及建立／停止本次人工任務。舊帳戶排隊請求的8項亦在此包重驗；原修前錯誤B相簿反例保留為歷史來源證據，不重跑。新人工任務以cancelled收尾並保留收據；原資料及未知收據不清理，pending原為0、終態0。只有本輪QA程序被停止，管理器已釋放兩設備租約。

實際包57份安全網頁資源與目前accounts／transfers JS逐byte一致，私密config及原家庭16120.jpg不存在；主／測試APK與報告保存於 `20261015-transfer-dispatch/`。JS10組、iOS委派JS19組、傳輸中心DOM人工3組通過；DOM使用模擬原生，不算第二次原生驗收。精確舊QA70包及候選69均為歷史來源；69不是目前原生主來源。現階段不另外建立／分發新安裝版。

尚未完成Android持久登入接納、已發憑證／未知結果保存與登入中取消、真正選取器／中斷複製／MediaStore／縮圖完整流程、本輪完整背景及公開HTTPS、使用者跨對話框操作意圖綁定、背景401即時通知、當版非DEBUG升級及安裝後H。實體／OEM／iOS及正式33/36保持原狀，原始六頁兩軸缺項仍未補分。當版独立複查仍因先前安全工具拒絕而缺，沒有繞過。網站／後端／公開註冊／商店均未變更；已核准的SSH公鑰仍因Railway帳戶授權不足未登記，原部署授權有效，家庭資料庫未送出。最新綁定 `transfer-dispatch-latest-bindings.json`。

## 2026-10-15：Android 排隊請求綁定與候選69（尚未發布）

Android bridge v2將帳戶owner及process nonce／generation在呼叫入口固定，執行前和回傳前重新核對；舊A排隊期間切換B、同owner更換token，以及延遲登出均不能採用新帳戶。非DEBUG包拒絕舊的直接set／clear憑證入口，WebView不接收bearer。SDK36管理下真實WebView API、Keystore和隔離HTTP通過8項；修前主要來源加測試latch的反例重現B被建立1相簿，修後為0且HTTP增量0。不是實際DOM表單／公開HTTPS或背景鎖屏全套；0供應者請求、保留資料且未重設、正式分數增加0。sharedJS Android7組及iOS19組僅為各自測試範圍。

候選test.69（69）APK `77df3d5d98ca9e4c92399eb9e00854c8ec2e6b5a653a0fd99571ac12a48d6e44`、13,760,849 bytes已編譯及檢查；DEBUG=false／原簽章／57份安全web資源，私密config與16120.jpg排除。包內H／32、48、64及遮罩目視為「浮水印存在／樣式正確」。尚未安裝69或檢查其安裝後圖示；該版未跑完整背景／升級／公開HTTPS。測試來源稍後新增，69舊測試APK不能代表新的排隊請求測試；後者使用獨立DEBUG QA70包。68／舊QA的通過不改列為69。

剩餘：Android登入發送前的持久接納／已發token保留與結果未知處理、登入中登出取消、傳輸入口的呼叫者owner／generation綁定、背景401立即通知頁面、當版完整功能及獨立複查。iOS現有登入協定不等同Android已實作；iOS原生圖示仍是缺H的placeholder。所有候選繼續HOLD，未部署／分發／啟用公開註冊／提交商店。公開最後核對仍test.56、後端1.0.64，正式33/36不變。

Hank已允許登記精確Railway公鑰 `SHA256:UzP0JjUedtIwDdF5WMEJzGo1X2Ll/c2mG086L1WOIOE`；原部署授權保留。現有登入可讀Timehut但SSH keys list被官方工具拒絕帳戶權限，尚未送出登記mutation／家庭資料庫，已請使用者用原帳戶完成browserless重新登入。當版獨立複查仍缺：先前恢復審查工具被自動安全檢查以可能資安風險拒絕；本輪未重試或改找審查者。最新證據 `android-bridge-scope-latest-bindings.json`，原舊輪紀錄保留其來源與範圍。

## 2026-10-15：安全Pages管線、同網域登入與真實PWA驗證

已將Pages選檔補齊為54個安全公開檔，以同一份公開網站manifest核對。拒絕私人照片／config、漏檔、舊版不支援公開帳戶的56 metadata、錯誤APK bytes及未發布候選的遠端下載；預設自建與指定網站的輸出逐位元組一致。預覽僅使用已知68候選包，未修改正式android-release.json，沒有發布。

實際無頭瀏覽器5組通過：320／390／1440安裝頁與精確68下載；模擬原生開啟時不宣稱背景通過；Pages帳戶入口先到正式同網域，保留允許的返回頁／刪除意圖，拒絕外站、無關token及壞URL；真實/Timehut/ Service Worker接管、清理舊Timehut快取並保留其他快取；API、帳戶HTML、原家庭照片、config、APK、ticket及Authorization要求不入快取；未快取的私密頁離線導到公開等待頁。手機版與離線畫面已目視檢查。測試沒有真的登入正式服務，沒有正式provider寫入，正式33/36不新增分數。

安裝文案改為使用自己帳號與密碼，移除套用舊版背景通過的陳述。未提供核准安裝資訊時，公開網站不顯示失效下載；Pages預覽用已驗證的本機APK，未來後端install頁使用已發布且限制於本專案的GitHub asset URL，不要求後端放一份不存在的downloads目錄。當前68 APK尚未帶入這輪文案／PWA修改，下一候選需重建並做當版H與背景驗證。

正式轉移評估：本機Railway4.40.2的終端協定未提供已驗證的非TTY資料傳輸；官方5.68.0的volume files使用SFTP／既有SSH金鑰，但本機與agent原先均無金鑰。直接volume upload僅先查存在再create，不能替代本專案的排他發布、0600、closed SQLite、精確部署與收據核對。已準備未登記的獨立部署公鑰，等待Hank核准新增Railway登入權限；私鑰位於外接APFS保護目錄，未放入repository或QA。家庭庫未送出，TTY guard不弱化。Docker唯讀探測仍不可用，未啟動。

正式test.56／後端1.0.64／註冊關閉不變。仍須安全轉移、真正接收中上傳靜止確認、Node24正式環境、當版獨立複查、完整背景／真機及06/2、06/6、08/6。獨立複查先前遭自動安全拒絕，沒有重試或改用其他審查繞過。

---

## 2026-10-15：Android test.68 私人照片清理候選與保留資料升級

已修正公開帳戶上傳者仍固定爸爸，以及舊Android登出回應晚到可能清掉新登入畫面的問題。延遲登出3情境通過，舊程式負控失敗；真實傳輸中心DOM搭配人工原生橋接3情境確認A／B帳號標籤及未登入不派發，iOS JS19項回歸通過。

非DEBUG的test.68候選、同56／65簽章，SHA256 `c1d8c5a22a34b9139de8b4660697c3318b12d097b51142ec738e154fd49bf0cf`，13,759,117 bytes。實際包內57個網站檔與來源一致，無私人config、家庭照片原檔或引用；Lint0錯誤／27警告。包內15份原生PNG、4份Web圖示、12頁引用及32／48／64px與遮罩已目視核對，H存在／樣式正確，不要求縮圖辨字。

管理下SDK26／36從已知65保留資料升級至同68 APK，每台4組原生檢查通過；各保留1個32byte既有檔案，不能冒稱非空活動傳輸遷移。SDK36第一次固定3秒擷取仍空白，保留UNCONFIRMED原收據；後續同APK、不重裝／重建／清除資料，實際顯示登入頁。SDK26顯示WebView更新指引。兩台安裝後系統圖示已目視確認H存在、樣式正確。最新79檔後端8組、網站15組通過；沒有正式Flickr寫入。

仍未發布：正式test.56／後端1.0.64／註冊關閉不變。68完整背景傳輸、正式後端登入／家庭庫啟用、真機及當版獨立複查仍未完成，不能把QA67的背景證據套用68。iOS新包重裝執行／原生圖示缺H、Pages完整依賴及非TTY家庭庫傳輸仍待處理。原正式33/36不新增分數。

---

## 2026-10-15：原生帳戶橋接與私人靜態照片阻擋修正

iOS原生WebView分支已接通。當版host HTTP78、儲存125、引擎56、JS橋接19項通過；原包實際WebView11階段（註冊、相簿、一次原檔上傳、登出、B空白相簿／傳輸列表）通過，既有2筆未確認撤銷保留。該包含私人家庭照片，功能證據只保留為歷史，不能用作清理後新包的重裝證據。

已保留16120.jpg原件、排除公開選檔與頁面引用，新增檔名／原始bytes／引用防護；原80檔後端及Android65候選取消發布資格。新54檔網站、79檔後端及iOS57檔公開資源通過核對，網站15組／入口9組／後端8組通過，iOS兩種編譯通過。共用資源等候120秒逾時未開始新包執行；不得冒稱重裝通過。原生iOS圖示缺H，仍HOLD。

正式test.56、後端1.0.64、註冊關閉不變，管理帳號huanghome2026的私密庫不重建。下一步優先Android新候選、修正公開使用者的上傳者標籤及晚到登出UI結果，再處理安全Pages管線、非TTY家庭庫傳輸與正式上傳靜止確認。原正式33/36不新增分數，06/2、06/6、08/6及真機仍未驗；先前自動安全拒絕造成當版獨立複查缺口，未重試或繞過。

---

## 2026-10-15：iOS上傳防重傳與同安裝包回歸

新增不可變的原檔／UTF8 metadata／完整multipart SHA256及固定bytes；原檔派發前先查原owner／clientUploadId的admission，只有明確尚未收件才送出。receiving、含糊或錯誤型別回覆保留原工作，已收件續同localId；封包被改、取消／刪除收據均不另傳。上個格式2 reader實際負控在寫入前拒絕新增欄位，對照舊資料仍能讀寫，完整新bytes保留。

當版引擎host9組56項、儲存15組125項、HTTP7組61項；Xcode Release／Debug通過。管理下同一iOS隔離包4個新PID／30項：上傳14項＋下載／切換／重開16項。68-byte人工PNG的Unicode／emoji／分解字元檔名與標籤通過真正根Node24／SQLite及接收器指紋核對；刻意不回正面ACK後，手機取消／續查仍只有1次原檔POST、1次人工provider建立，找回同收據並完成，重開保留原檔／完整multipart及指紋。receiving只是人工HTTP回覆情境，兩次續查都沒有POST，不冒稱本次有實際持久receiving列。

原1筆未知待確認憑證完整保留，只確認當前人工issuer兩筆；沒有清App／Keychain。Debug首次因QA存取private helper而編譯失敗已保留，修正只在QA新增無憑證loopback控制請求，未放寬產品API。兩批系統測試的產品code modules完全一致；工具中途只加download selector，先前版本以已記錄SHA核對還原並如實標示。正式媒體／Flickr均未寫入。

最新`ios-upload-admission-latest-bindings.json`與`docs/IOS-NATIVE-ACCOUNTS.md`。這些是小PNG／本機服務證據，不代表大影片、切換App／鎖屏、Photos、真機或正式TLS；網頁原生帳戶分支、持久撤銷／未知登入結果協定仍待完成。公開test56／後端1.0.64／註冊OFF及原33/36不變；正式私有帳戶庫移交／停寫、Linux部署與非DEBUG65端到端仍待完成。先前自動安全拒絕造成當版獨立複查缺失，未重試／繞過，未發布或提交商店。以下保留各輪當時來源與限制。

## 2026-10-15：iOS傳輸歸屬與實際原圖下載／切換／重開

新工作固定owner／issuer，傳輸ledger格式2拒絕舊reader覆寫；舊未歸屬工作、原檔與收據保留。列表／預覽／發送／OS回復／callback／取消／重試／下載發布／Photos lease與通知加入目前帳戶及世代核對；登出、切換或目前401停止舊工作。切換後未完成工作改成等待原帳號確認；正面ACK私下保留，不對新帳號發布。傳輸bridge回覆前另重查世代，iOS網頁帳戶分支仍未開。

引擎host7組40項、儲存host15組125項、真正URLSession／根Node24＋SQLite及故障HTTP7組61項通過。實際管理下iOS隔離App的2個新PID／16項通過：真正Keychain與背景URLSession下載A原圖、PNG bytes／副檔名、切換B後列表／預覽／讀取拒絕、B下載在provider前拒絕、精確原issuer確認與重開原件保留。只有1次人工影像provider讀取，零正式Flickr寫入。不是切換App／鎖屏／Photos／真機或完整原生上傳證據。

首次host恢復狀態缺口已修；首次SDK收尾把一次有界撤銷錯當全部確認而失敗，改為只確認本輪2筆，保留原1筆未確認資料及全部舊工作。原失敗、包體與來源保留；沒有清Keychain、重置或重新登入消除未知。runner報告曾錯沿用accessibility與漏列engine HTTP，欄位已按實際phase修正並以同安裝包重新驗證。Release／Debug編譯及實際包內資源核對；內部unsigned／QA包不分發、不作H放行。

完整`ios-transfer-account-latest-bindings.json`及`docs/IOS-NATIVE-ACCOUNTS.md`。iOS上傳SHA／metadata與未知收件查詢、持久OS撤銷／未知登入結果協定、網頁橋接、完整背景／Photos／真機仍待完成。正式test56／後端1.0.64／註冊OFF、私有家庭帳戶庫未移交及原33/36不變；當版獨立複查仍因先前自動安全拒絕缺失，未重試或繞過，沒有發布或商店動作。以下各輪是當時來源與證據。

## 2026-10-15：iOS帳戶API、已發憑證保存與格式2

新增指定後端／API清單的原生HTTP client，無Cookie／cache／credential storage、拒絕redirect、有界JSON與整體deadline。登入先保留容量／世代，token存入Keychain並通過me的UUID／有效期／Boolean角色後才啟用；回傳不含bearer，延遲A回應／401不能發布給或登出B。嚴格Boolean ACK／同issuer401只確認原那筆，6秒drip看門狗保留未確認資料。未知且沒收到token的結果只記請求ID／issuer、占用有限容量，不假稱已撤銷；持久OS排程及遠端結果協定仍待完成。

儲存host15組125項、實際URLSession／本機根Node24＋SQLite及故障HTTP7組61項通過；SDK Release／Debug通過。當版管理下模擬器10個新PID／35項，含真正Keychain的已發／未知結果重開、格式移轉及原生HTTP。HTTP健康路徑用獨立ledger，故障ledger不清資料；A端點先成功再驗B精確404，新註冊者空白、合成原家庭管理者取得true角色／數字context。沒有WebView表單、正式TLS、真機背景或正式Flickr寫入證據。

舊reader人工反例確認擴充v1會丟opaque／unknown欄位，已改格式2及完整v1移轉，拒絕未知頂層／子紀錄欄位；舊reader讀2拒絕且保留全部bytes，真實Keychain移轉只改版本保留B待辦／未知紀錄。原反例、註冊測試型別編譯失敗、各版本來源／log均保留，不把修前組數冒稱目前通過。原生帳戶方法已編譯，iOS網頁分支與引擎工作綁定／callback／Photos／通知仍未接入，不分發本候選。

完整`ios-account-client-latest-bindings.json`及`docs/IOS-NATIVE-ACCOUNTS.md`。正式test56／後端1.0.64／註冊OFF／原33/36不變；當版獨立複查仍因先前自動安全拒絕缺失，未重試或繞過。正式移交／Linux部署／test65公開後端端到端、真機／OEM、iOS完整整合及原缺項持續待辦，沒有商店或發布動作。

## 2026-10-15：iOS Keychain帳戶底層與四程序恢復

新增Keychain完整ledger與只含UUID的App私有控制檔，跨操作重新讀取；中斷後關閉登入並保留Keychain可識別憑證，容量24保留登出空間，不清除未知待辦。舊TransferRecord保留ID／原檔／收據，新增optional immutable owner／issuer，不自動採用目前登入。只接入accountStatus，尚無第一方HTTP登入或引擎的工作綁定／請求／callback授權；iOS網頁原生帳戶分支未開，不能分發或宣稱完整隔離。

11組98項host檢查通過；真正iOS Keychain另在管理下隔離包進行四個不同PID、17項核對：A→B保存、重開、舊A不能登出B、持有mutation後終止程序、再開關閉登入並保留A／B。沒有真實帳戶／網路／Photos，沒有OS重開機、SIGKILL、實際首次解鎖前／鎖屏或真機證據。-34018原失敗保留；只為SSD隔離Debug模擬器包加App自己的simulated application identifier／本機ad-hoc簽章，未改正式簽章、憑證、開發者帳號或共享群組。沒有重設App資料或清未知Keychain項目。

Release及Debug編譯、三份manifest及58網頁核對通過；實際fstat核對私有控制檔，已加入FileTimestamp／C617.1。Debug的App是launcher，稽核首次因此未找到實際匯入；保留失敗／第一次較弱綁定，補查App.debug.dylib並對同已安裝包的每階段兩個code module SHA核對後重新通過四個新PID，未重裝／清資料。Release未含DEBUG QA執行符號，所有包只作內部驗證、不作H分發放行。

詳見`docs/IOS-NATIVE-ACCOUNTS.md`、主QA的`ios-native-account-latest-bindings.json`。HTTP身分／遠端ACK與撤銷重試、完整iOS引擎／UI／保存、真機及正式後端移交／部署、test65正式端到端仍待完成。正式test56／1.0.64／註冊OFF與33/36不變；當版獨立複查仍因先前自動安全拒絕缺失，未重試或繞過，沒有發布或商店動作。

## 2026-10-15：iOS 隱私宣告與實際 Release 本機包

補上App的`PrivacyInfo.xcprivacy`及Xcode target resources，依中央儲存用途申報Name／UserID／PhotosorVideos／OtherUserContent／OtherDataTypes／PreciseLocation；原檔未清除GPS，不宣稱沒有收集。所有類型及AppFunctionality用途對上本次官方列值，linked=true、tracking=false；沒有因聯絡信箱就宣稱收集使用者email，也沒有增加相簿完整讀取、定位、麥克風或追蹤權限。服務商IP／日誌／備份／地區仍待核對，不把六類App清單當成完整供應鏈盤點。

Xcode27／iOS27 SDK的unsigned generic-device Release build成功（既有1.0/build1、min15）；實際App／Capacitor／Cordova三份宣告在包內，App與來源語意相同、依賴兩份SHA相同。58個實際網頁檔對應安全來源且無私有config／帳戶庫；首次比對對Capacitor兩個空白生成檔來源假設錯誤而停止，保留失敗並精確核對生成來源後通過，未改產品或重建。App及兩個arm64 framework沒有命中本次列出的Required Reason API候選符號／字串，只算有界靜態觀察，不冒稱Apple掃描／runtime／archive privacy report通過。

詳見`docs/IOS-PRIVACY-INVENTORY.md`、`docs/IOS-PREFLIGHT-20261015.md`與主QA的`ios-privacy-latest-bindings.json`。沒有啟動模擬器／Photos／真實登入，沒有分發、商店或正式變更。iOS immutable owner／Keychain／第一方帳戶橋接、切換／登出／401邊界、真機背景及保存仍未完成；未簽章包不是正式archive，仍需最終H、privacy report、簽章、商店資料與當版獨立複查。自動安全拒絕未重試或繞過；Android公開test56／後端1.0.64／註冊OFF、原正式33/36及全部原缺口保持。

## 2026-10-15：私有家庭帳戶庫接收器與正式唯讀限制

新增未發布的關閉帳戶庫移交工具，11組人工資料檢查通過：排他寫入、分段SHA／SQLite頁面與DELETE journal、既有／未知／中斷資料保留、變動卷／佇列／服務身分拒絕、發布競爭、實際子程序READY與中途SIGKILL。包內Node24實際開啟人工移交庫，驗證可信管理者及登入／登出；沒有把真實家庭庫帶入QA或正式服務。`huanghome2026`實際私有庫狀態重新確認為本機準備完成、關閉、零sessions，沒有重建／換密碼。

正式1.0.64／Node18唯讀載入同SHA工具，合法／WAL標頭及TTY拒絕通過；`.accounts`前後皆不存在。實際Railway連線的遠端stdin／stdout都是TTY，因此工具在READY與私有寫入前拒絕；未傳送真實資料庫。SSH key清單查詢失敗，本機沒有公開key檔，未改安全設定，不能推定服務端無key。安全非TTY傳輸仍待確認。

正式來源SHA與既有1.0.64快照相符；本次status為0筆／非processing，但`queue.json`不存在。原版讀取缺失檔會回傳空陣列，status亦沒有Multer接收中計數，因此沒有全域無上傳／停寫證明。接收器仍拒絕缺失／未知佇列，未建立空檔或放寬條件。這些是唯讀限制證據，不能作正式移交、部署或註冊啟用收據。

完整`owner-transfer-latest-bindings.json`及`docs/PUBLIC-ACCOUNT-ROLLOUT.md`。後端80檔與候選test65包體不變，正式test56／Railway1.0.64／註冊OFF及歷史33/36不變；無Flickr寫入／商店提交。本輪只有內部文字操作工具，沒有新發布產物；下一次發布仍須當版H自檢與獨立複查。先前恢復複查工具遭自動安全審核以可能資安風險拒絕，沒有重試或繞過，當版獨立PASS仍缺失。非TTY移交、真正停寫窗口、Linux／部署與test65公開後端端到端、真機／OEM、iOS及正式06/2、06/6、08/6持續待辦。

## 2026-10-15：與test65相同主來源的QA66／67核心回歸

本輪沒有改動test65候選或後端包。QA66（DEBUG／原accountqa身分）與QA67（DEBUG／獨立accountqa67身分）的51份主原生輸入均與test65候選相同；公開58個包內網頁資源只有版本metadata不同。它們允許隔離loopback人工服務，不能冒稱關閉DEBUG的test65實際包已完成正式後端傳輸。test65既有release限制／簽章／覆蓋安裝證據另保留；對應完整公開後端的端到端仍待部署。

QA66在349筆保留工作下通過Android16實際JS／UIDT雙向14,493,799-byte PNG，桌面／其他App／熄屏且keyguard鎖定後均有新bytes，原70秒完成窗、MediaStore原檔、MOV／MP4與重開收據核對通過；Android8僅舊WebView更新指引。首次逾時失敗保留：上傳進度到完整bytes但未得終態、下載13,615,104／14,493,799。人工fixture原先每次TCP讀取都睡125ms，現按實際bytes維持32KiB／125ms的同名目速率，deadline及檔案大小均未變；本次實測上傳443次讀取、byte目標55,292ms、觀測55,939ms，下載56,453ms。原逾時沒有read-count紀錄，不能斷言已證明唯一根因，也沒有產品效能修正宣稱。

QA66另通過媒體發布／帳戶切換／401邊界、第一方client與實際帳戶UI四組。SDK36憑證批次的前三組通過，最後離線撤銷因原帳戶的待確認收據容量保護拒絕新登入；未減少原未知收據或放寬容量。為保留舊資料，後續改用獨立QA67身分；每個loopback階段先確認原profile stopped，再核對原session／intent／tasks的SHA，前後不變，不取消原既有OS工作、不重置profile。host預檢曾誤把兩個User0段落當成不明狀態而拒絕，已按installed使用者段精確解析，原拒絕保留。

QA67的SDK26／36四組憑證／身分／ownedHTTP／嚴格離線ACK與約6秒slow-header看門狗通過；SDK36實際Node24根後端1.0.65／SQLite數字家庭相簿、16,780,735-byte MOV切換App／鎖屏下載與MediaStore原檔、B隔離通過；實際開始工作的取消、已收件不另建、下載partial保留及程序重開通過。取消fixture首次因只接受舊測試包名而拒絕，已明確允許兩個DEBUG測試身分，沒有移除守門或改主程式；舊測試APK及失敗保留。

本版正確／錯誤ACK兩個獨立系統個案均在實際斷網登出、SIGKILL、恢復網路、鎖屏下由OS啟動新PID完成續查；未開Activity或強制派發。每案各自保留baseline與新B；baseline分別3筆／2筆，兩案之間有精確人工subset維護，不宣稱同一baseline、同一A連續兩輪或時間保證。SDK26網路控制個案跳過；碰撞控制未取代既有持久工作。原accountqa的三個受保護檔在所有QA67階段均不變。

本輪兩個實際QA APK的15nativePNG、4web圖示、12頁與32／48／64遮罩重新核對真正原圖及指定H，H外0pixel差異；當版圖板已目視。SDK26系統資訊頁可核對目標package，SDK36新Settings SPA未提供同等URI識別且QA66曾顯示舊標題，該安裝後顯示身分項保留未完成，不把舊畫面算成本版通過。這些QA包不分發；test65的既有H紀錄及包體未改動。

最新綁定`native67-regression-latest-bindings.json`。正式test56／Railway1.0.64／註冊OFF與正式33/36保持，沒有Flickr寫入／商店提交。當版獨立審查仍因先前自動安全拒絕而缺失；未重試、另找審查者或繞過。正式私有帳戶庫移交、Linux／部署、test65正式端到端、真機／OEM、iOS與原正式缺項持續待辦。

## 2026-10-15：test65實際分發型候選與升級前帳戶隔離

已建成沿用test56簽章／`tw.aihankapps.timehut.testing`的非除錯candidate APK，version65／`2026.10.15-test.65`，SHA `23b519fbb4e5df095fc6655cecf16b21c2ccbd07eb08f892b3a07f0c5dafe79c`，13,803,274 bytes。含最新公開網站55檔及Capacitor生成檔共58檔，沒有私有config／密碼／帳戶庫。只替換安裝包版本metadata、測試標題及安全原生同步所需內容；未分發或更新入口，正式仍test56。

補上實際升級缺口：非DEBUG的原生engine在讀取任何舊任務前先啟用帳戶模式，避免OS背景工作先於WebView登入頁執行時沿用舊家庭模式。原件、clientUploadId／localId與未歸屬任務保留，未登入者不能看見／採用；DEBUG只保留既有隔離legacy fixture相容性。發布檢查另抓到三個API28 getNetwork未防護呼叫，已補舊系統active／符合Wi-Fi規則網路分支。完整candidate編譯、test instrumentation編譯與lint通過（零error、27個原有類型warning）；Gradle單元測試僅既有算術範本，沒有把它列成功能證據。首次工作目錄與離線依賴、首次lint失敗均保留。

Android8／16管理下裝置已實際test56→65覆蓋安裝，SHA相符、不清資料；兩台原傳輸目錄均為0檔，因此不冒稱有非空舊任務的完整移轉。分次instrumentation的四項有界檢查各SDK均通過：升級前後讀取保留marker／原傳輸bytes、實際非DEBUG與來源允許清單（loopback及debug backend override拒絕）、包內安全頁面／core順序，以及未啟動Activity的真實engine對隔離人工舊任務先關閉帳戶權限並保留原件／收據。不是OS派發或公開後端登入測試，沒有登入正式帳戶／Flickr寫入。Android16首次uiautomator擷取exit137保留，另一次只讀補驗未重裝／重設，登入頁、Android8更新指引與兩台安裝後App info圖示目視通過。

本版15個包內native PNG、4個web圖示、12頁引用、32／48／64及平台遮罩、安裝後顯示均重新驗收：「浮水印存在／樣式正確」。以真正無H原圖與指定H核對3442個變更pixel、H外0差異、原alpha不變；沒有用小尺寸辨字作門檻。最新`installer65-latest-bindings.json`指向實際包體及限定範圍。先前QA64的傳輸／冷OS證據保留為舊包證據，本版仍需功能回歸、當前獨立審查、正式後端私有移交及啟用；公開註冊未開、正式33/36不變，真機／OEM與iOS未驗。

## 2026-10-15：原家庭管理者的私有新庫已在本機準備

指定管理者`huanghome2026`的新帳戶庫已在正確APFS的私有區完成保留／建立；兩個原相簿均經現行後端只讀核對Flickr歸屬。舊網站設定只用AST讀資料，不執行；只保留家庭名稱、生日與原相簿ID，不保存原設定或舊秘密。初始32-byte隨機密碼只存0700／0600保護的私有檔案，不出現在對話／QA／Git／部署包。已驗證完整家庭角色、本機登入及登出、零sessions／media／receipts、quick_check與單一關閉SQLite檔；status重讀不變更檔案或重新產生密碼。既有及中斷目錄拒絕覆寫，所有私有資料須保留，不作QA清理。

匯入工具24項人工控制、私有準備6組及同80檔實際部署包8組通過；新第8組只以人工家庭庫做排他逐byte移交，真實包內服務在註冊暫停下完成管理者登入／家庭context／登出，來源庫及人工保留原件不變。真實私有新庫從未複製到測試或Railway；正式傳輸、停寫窗口、Node24 Linux／Railpack與目前獨立複查仍待完成。Docker只讀探測顯示本機daemon未運行，沒有自行啟動或宣稱Linux通過。

最新準備證據`owner-private-latest-bindings.json`；既有Android QA64及後端65功能證據仍依各自當時的來源範圍。當前正式版本test56／Railway1.0.64／註冊OFF與正式33/36不變，沒有Flickr寫入、新安裝版或商店提交。iOS仍缺immutable owner／Keychain／第一方帳戶橋接；此項保持上架前明確缺口，未用檔案檢查冒稱整合通過。原部署授權不重問，當版獨立審查仍因先前工具自動安全拒絕而未完成，不繞過。

## 2026-10-15：本版系統冷啟續查與後端1.0.65候選

QA64主APK仍為 `b9895713e305adda179331a86e71af1e87b519ded0b339f41a75e7f9ff208992`，只有測試APK變更。Android16模擬器在實際斷網登出、SIGKILL、恢復網路、螢幕關閉且鎖定時，由OS自動啟動新PID續查；未啟動Activity或強制派發工作。正確ACK只清除新A，錯誤型別ACK保留A；兩個獨立個案都保留B及相同的17筆舊收據完整指紋、先前任務歸屬與原檔。收尾只登出本次A/B，原有系統工作仍保留。SDK26網路切換個案明確跳過；沒有宣稱同一A佇列連續兩次自動冷重試、時間保證、碰撞控制或真機通過。先前「本版冷OS未驗」的缺口已在上述範圍補齊，電源中斷仍未測試。

後端候選1.0.65／2026.10.15.1將暫停新註冊獨立為 `TIMEHUT_ACCEPT_SIGNUPS=false`；帳戶隔離保持啟用，既有登入／工作／媒體權限不退回舊API。偵測到帳戶資料目錄、失聯連結或帶owner的舊收據時，誤關帳戶模式會在listen前停止，保留資料。實際80檔平鋪包（後端25＋公開網站55）不含環境秘密、config、uploads、資料庫或依賴；保留既有 `/app/uploads` 路徑。相同的私有管理CLI直接包入，舊工程入口改為委派，密碼仍只走非TTY繼承FD。

當版根HTTP32組、管理工具11組、精確部署包的實際Node24程序7組通過；包體驗證涵蓋SQLite重開、暫停註冊而保留既有登入與隔離、錯誤設定／不可信管理者／失聯資料拒絕啟動，供應者連線在測試程序被禁止。原生家庭流程再連到1.0.65本機根後端／SQLite，數字相簿一次建立及membership、16,780,735-byte MOV於桌面／其他App／鎖屏下載、保存及B隔離通過；沒有正式Flickr寫入或Android WebView解碼通過宣稱。

後端包內12頁現在都有明確H圖示引用，傳輸／離線頁不再依賴 `/app/` 外的預設favicon。4個實際包內圖示、32／48／64及PWA遮罩已目視：「浮水印存在／樣式正確」；沒有重畫、改alpha、改構圖或小尺寸辨字宣稱。當前Android64原生根路徑的H已驗且主包未改；最新網站只多這兩個favicon標籤，下一個分發包須由安全同步帶入並按該包重新驗收。

完整證據 `.codex-local/qa/20261014-android-background-and-registration/candidate65-latest-bindings.json`；操作順序 `docs/PUBLIC-ACCOUNT-ROLLOUT.md`。尚未建立／移交正式huanghome2026或真實家庭資料庫，未部署／分發／啟用註冊／提交商店；原兩份保留原件、授權與正式33/36紀錄不變，新增人工QA不補正式分數。既有部署授權有效，不重問。當版獨立複查仍缺：恢復既有Planck的動作先前被自動安全檢查以可能資安風險拒絕，沒有新審查輸入、重試或另找審查者。真機／OEM、iOS與正式缺項仍待完成，發布維持HOLD。以下舊輪紀錄保留其當時來源與範圍。

## 2026-10-15 Android QA64：登入中斷恢復與本版回歸

候選主 APK `b9895713e305adda179331a86e71af1e87b519ded0b339f41a75e7f9ff208992`（DEBUG `.accountqa`、build64）已通過 Android16 管理下模擬器的原14,493,799-byte上下載、回桌面／其他App／熄屏+鎖定持續增量、原70秒完成窗、MediaStore原檔與重開收據；原家庭角色／數字相簿對接實際本機根後端與SQLite，16,780,735-byte MOV背景下載、保存、切換B空白及舊連結失效通過。這些均用人工資料，沒有正式Flickr寫入，不算真機或正式矩陣；SDK26背景只算舊WebView更新指引。當版帳戶頁、媒體發布六個切換／登出邊界、401生命週期、原生帳戶請求、鎖屏Keystore、IO／到期／篡改／滿額／嚴格ACK及6秒看門狗、已開始工作的取消與重開均通過。不同測試APK修訂分別綁定，不能說全套同一instrumentation APK。

登入儲存改先寫完整加密before／after紀錄，再發布帳戶檔。恢復先保留原加密檔與標記，再持久化可重入的關閉登入計畫；所有可辨識憑證仍按原issuer等待撤銷，不回復舊登入、不假稱遠端確認。原本出錯的SDK36檔／32-byte標記逐位元保留並在QA61恢復，保留14筆待撤銷；同一份資料繼續QA64，未重置。18項人工中斷／恢復／缺金鑰／篡改／24筆滿額及新PID檢查在SDK26／36通過（QA62；兩個恢復實作檔與本版完全相同）。尚未完成真正電源中斷或本版自動冷啟OS撤銷工作；舊OS測試器要求空佇列，不能用來清除或忽略現在保留的未知收據。準備檔尚未完整時的新憑證結果仍未知，只恢復本機關閉狀態並保存部分加密原件。

大量舊任務下，切換帳戶原先逐筆讀Keystore；現在持有帳戶鎖，批內使用一次新讀的授權狀態，每筆仍核對有效期，結尾再重新讀世代。本版318筆保留資料下的原生登入橋接實測1,007ms；沒有加長12秒橋接或70秒傳輸門檻。測試等待實際登入頁完成，再載入完整傳輸頁；不在缺CONFIG的帳戶頁注入傳輸UI。本輪錯誤的手動資產覆蓋曾漏掉Capacitor core，失敗保留，QA64改回安全同步並逐檔核對12頁core均在帳戶初始化前。

修正8頁仍指向16120.jpg的頁籤／觸控圖示，家庭圖片本身未改。先前四圖示像素檢查沒有涵蓋這些舊引用，其範圍不足已記錄；本版重新查全部12頁引用、包內15PNG／4網頁圖示、32／48／64遮罩與密度、同SHA安裝後顯示，目視結論「浮水印存在／樣式正確」。真正無H原圖與指定H重新核對，H區外像素差0，沒有改構圖或alpha；不聲稱小尺寸清楚辨字。

QA維護只對有人工任務歸屬、synthetic_憑證與已結束可獨占loopback服務的交集，透過原issuer的實際401確認；其他收據、當前帳戶／世代及全部任務保留。舊全量維護工具的未知憑證拒絕未被修改，原失敗保留；家庭／取消的功能測試與選用維護分開。原加密快照保存在App私有區，沒有把憑證或資料庫帶出。

完整綁定：`.codex-local/qa/20261014-android-background-and-registration/native64-latest-bindings.json`。本輪未部署、分發或提交商店；最後記錄公開安裝版test56／Railway1.0.64，註冊未由本輪啟用，`huanghome2026`尚未正式建立／匯入家庭資料，支援信箱仍為hankhuang0516@gmail.com。原正式矩陣33/36為歷史證據，新版沒有新增正式通過；06/2、06/6、08/6、真機／OEM與iOS仍待驗。當版獨立複查未完成：先前恢復審查工具的動作被自動安全審核以可能資安風險拒絕，沒有重試或另找審查者繞過。發布仍HOLD，既有部署授權保留，不重問。

## 2026-10-15 Android QA60：新版網頁整合、效能修正與恢復缺口

最新55檔公開網頁已同步原生包（另有Capacitor等生成檔，共58份包內網頁資源），沒有私密config。QA60 `4be86a9bfc6500ecf855a0291a866db452dea27812e96be09c82a97295308d51` 已在Android16管理下模擬器通過原14,493,799-byte上下載、桌面／其他App／熄屏+鎖定持續增量、相同原檔／MOV及MediaStore／重開收據。未清空260筆既有紀錄，也未放寬原70秒完成窗。下載進度改每0.5秒或1MiB回存並於EOF強制回存，狀態／收件／取消仍立即原子寫入；列出工作改每次新讀帳戶、整批篩選並在回傳前再查世代／有效期，不跨次快取授權。修前下載停在11,304,871／14,493,799B的失敗保留。

新增實際Node根後端／SQLite的原家庭原生測試：真實包內登入表單取得服務端管理角色，原數字相簿上傳只有1次建立及1次加入；16,780,735B人工MOV在Home／設定／鎖屏持續增加，App及MediaStore逐byte一致；切換B看不到A工作，舊連結失效，指定信箱／設定頁在本包可讀。這沒有驗證Android WebView影片解碼，不能替代之前Chrome播放或真機／正式Flickr證據。

權限邊界／HTTP401生命週期／帳戶請求三個類別個別通過；登入頁在等初始導頁結束的測試修正後另通過。SDK26／36鎖屏憑證、跨句柄、IO故障、到期、撤銷重用及錯誤ACK／6秒慢標頭看門狗通過；原400ms測試憑證到期及整檔快照遇合法背景寫入的失敗保留。修正僅測試時序與既有鎖的觀察範圍，沒有新增產品到期寬限。不同測試APK修訂分別記錄，不能說全套同一instrumentation APK；主APK未變。SDK26背景仍只算舊WebView指引。

**目前不得發布：**取消／重開回歸在第一案例後遭未確認帳戶寫入封鎖。只讀核對確認SDK36原加密帳戶檔3488bytes、32bytes intent與其不符，沒有new／bak；沒有刪除、覆寫或重建任何裝置帳戶檔。既有SHA-only intent無完整目標可續寫，需設計安全的加密寫入前紀錄與中斷恢復，不能回復舊登入或丟棄待撤銷收據。未知本機根測試登出待辦亦保留；維護工具拒絕清除，沒有擴大白名單。

當版15份原生PNG、4種實際網頁圖示、32／48／64及遮罩、同SHA安裝後圖示已目視，結論「浮水印存在／樣式正確」，未聲稱小尺寸清楚辨字。真正無H原圖／指定H／原合成來源hash重新核對；無改畫布、alpha或圖層樣式。完整證據：`.codex-local/qa/20261014-android-background-and-registration/native60-latest-bindings.json`；恢復需求：`account-commit-recovery-next.json`。test56／Railway1.0.64為最後已知正式版，本輪未發布／部署／操作Flickr或商店，註冊未啟用、huanghome2026尚未正式建立，正式33/36保持。當版獨立複查仍受先前恢復工具的自動安全拒絕阻擋，沒有重試或繞過；完整恢復、真機／OEM、iOS與正式矩陣仍未驗。

## 2026-10-15 家庭歷史照片／搜尋／影片候選整合

新增原家庭唯讀媒體轉接：只查指定的原相簿，搜尋走完各頁，跨相簿去重；外來帳戶、缺頁或同一相簿跨頁重複不當成空白／部分成功。影像、sizes與影片使用當前登入工作階段的連結，讀取前再核對中央帳戶、原相簿歸屬；登出後舊連結失效，正在讀取的內容停止傳送。不替歷史照片建立假的上傳收據或佔用其他帳戶的照片歸屬。

修正管理者上傳表單與本機收件紀錄只接受UUID的問題；舊數字相簿現在可收件，重整重選回到同一收據。原搜尋視窗接上共用影片播放器，關閉時停止／移除來源，結果統計改用「筆回憶」。相簿中的舊影片連結不再指向缺少使用者ID的Flickr網址。

人工資料證據：家庭HTTP10組、瀏覽器6組（Chrome實際解碼／推進MP4、完全相同MOV原檔及副檔名、搜尋播放／關閉、圖片解碼、數字相簿重選不再POST）、掛載根後端32組、最新55檔網站原頁面15組通過；一般上傳14／帳戶頁9／媒體內容切換7／快取2組依實際來源範圍另列。390px播放／搜尋畫面已目視。首次數字收件紀錄驗證失敗與修前來源保留。來源及結果：`.codex-local/qa/20261014-android-background-and-registration/family-media-latest-bindings.json`。

這是本機候選；未讀取正式私密config、未匯入實際家庭資料、未操作Flickr寫入、未發布或重包Android。最新網頁尚未同步QA57；test56／Railway1.0.64／註冊OFF及正式33/36不變。真實家庭的大量資料延遲、原家庭編輯／刪除／相簿移轉完整矩陣、真機／OEM、iOS與當版獨立複查仍未完成；先前複查恢復被自動安全審查拒絕，沒有重試或繞過。

## 2026-10-15 指定家庭管理帳號與相簿接管準備

Hank 已指定登入名稱 `huanghome2026`。本機工具完成可信任的保留／建立流程；一般註冊不能冒領，已有普通帳戶不會因同名或環境 ID 變成家庭管理者。原相簿編號與歸屬同一交易建立，生日儲存同步家庭資料；原家庭照片列表維持供應者來源，不被空的虛擬相簿覆蓋。家庭上傳加入原相簿失敗後保留同一照片 ID／原檔，實際重試端點不重建照片。

人工資料測試：操作工具11組、掛載後端32組、原頁面瀏覽器15組，以及帳戶／SQLite／容量／刪除回歸通過；390px家庭設定圖已目視。五個測試腳本／fixture失敗均保留，沒有改成通過收據。來源與結果：`.codex-local/qa/20261014-android-background-and-registration/owner-bootstrap-latest-bindings.json`。

尚未執行正式帳號保留／建立或家庭資料導入，未在對話索取密碼、讀取私密config、寫入Flickr、部署或更新安裝檔。test56／Railway1.0.64／註冊OFF／正式33/36不變；完整歷史媒體／搜尋／影片、最新網頁原生包、真機、iOS及當版獨立複查仍待完成。獨立複查恢復曾遭自動安全檢查拒絕，沒有繞過。以下較早的「名稱待回覆」是歷史紀錄，以本節為準。

## 2026-10-15 公開服務隱私／支援／刪除入口

已加入三個說明頁及帳戶／設定入口，使用Hank指定的公開聯絡信箱 `hankhuang0516@gmail.com`；中央Flickr儲存用途由Hank直接確認已有核准，沿用原方案，不要求一般使用者另做Flickr OAuth。未冒稱獨立查閱核准文件或實際帳戶額度。

指定信箱版8組實際Cookie／SQL／瀏覽器刪除與320／390／1440排版通過；最終六頁14組及設定服務入口通過。追加檢查重現並修正320px超長名稱的文字溢出；原失敗與錯誤測試路徑紀錄保留。候選55檔網站未含私密config；最新網站尚未重包Android，不延伸以前APK驗收範圍。

來源及證據：`.codex-local/qa/20261014-android-background-and-registration/public-service-info-latest-bindings.json`；完整紀錄：`continuation-20261015-public-service-info-result.md`。未發布、未寄信、未操作商店或真實Flickr；test.56／Railway1.0.64／註冊OFF及正式33/36維持。管理者登入名稱與可信任家庭資料接管、當版獨立複查／真機等門檻仍未完成。

## 2026-10-15 已開始取消與晚到系統通知修正

實際原生測試重現並修正：切換帳戶後晚到的系統停止通知把舊帳戶已完成收據改成等待登入。現在先保留完成／取消／已保存等狀態。Android16 真實 bridge／OS 工作的傳送中取消、收件回覆遺失後原收據查回、伺服器已收件拒絕取消、下載取消重試與關閉程序重開均有人工服務證據；沒有真實 Flickr 寫入。

最新本機 QA57 `35f45ab97dcd0fc193eb514d5ae0c374344ce12ebcf19f07e1db9d3b7e851964` 另通過背景 Home／其他 App／螢幕關閉＋keyguard 與帳戶回歸。包內及同 SHA 安裝後 H 目視結論「浮水印存在／樣式正確」。先前系統登出／金鑰等結果仍各自綁原包，未冒稱全套重跑。修正前重現與下載等待窗失敗均保留。

完整紀錄：`.codex-local/qa/20261014-android-background-and-registration/continuation-20261015-cancellation-result.md`；新來源與結果：`native-cancellation-latest-bindings.json`。正式33/36、06頁66.67%不變；test.56／Railway1.0.64／註冊OFF不變。真機、完整正式矩陣、管理者名稱及本版獨立複查仍未完成；既有複查恢復遭自動安全檢查拒絕，沒有繞過或重試。

## 2026-10-15 Android 系統登出續查與當版 QA57 回歸

新增不含帳戶資料的持久 Android 系統工作。當版 QA57 已在 Android16 模擬器確認：離線登出、程序結束、網路恢復後自動以新程序在鎖屏中續查；成功只清除舊 A，錯誤型別回覆保留待辦，B 憑證／原檔／完成收據不變。成功與錯誤為獨立案例；不宣稱固定派送時限、SDK26 網路控制、重開機、強停續傳、真機／OEM 或 iOS 已通過。

同一 APK `8011282260fb71d1c21caf716d33de056053aa9b488f6d02eba316a4f2852d91` 通過帳戶、金鑰、照片刪除與 Home／其他 App／鎖屏雙向傳輸回歸，實際圖示目視結論「浮水印存在／樣式正確」。這是 DEBUG 本機隔離 QA 包，未分發；test.56、Railway1.0.64及公開註冊 OFF 維持。雙平台計畫見 [STORE-RELEASE-PLAN.md](STORE-RELEASE-PLAN.md)，無商店操作。家庭管理者名稱及本版獨立複查仍待完成；複查恢復遭自動安全檢查拒絕，未冒稱通過。正式33/36、06頁66.67%不變。

完整紀錄：`.codex-local/qa/20261014-android-background-and-registration/continuation-20261015-system-job-result.md`；當版來源與證據綁定：`native-systemjob-latest-bindings.json`。先前部分失敗／等待／yield 歷史保留。

## 2026-10-15 單張刪除、目前 QA57 背景傳輸與 H 自檢

本輪完成單張照片刪除的已知 ID 工作、最小媒體刪除標記、原收據防重傳及容量核對。後端 11 組、原網頁 13 組、實際掛載後端 30 組通過；Flickr 回覆遺失、同大小原檔被改、檔案連結、移除後最後交易失敗、跨帳戶與整戶刪除均有人工供應者／SQLite／HTTP 控制。原上傳收據保留，手機保存檔案保留。未發出真實 Flickr 寫入。

Android QA57 已通過帳戶介面、切換／401、六個媒體保存／縮圖競態、離線登出與 Keystore、刪除後不重傳及關閉重開、以及實際 Android16 模擬器 Home／Settings／螢幕關閉＋keyguard 雙向位元組增加。SDK26 僅相容提示，真機／OEM／iOS 不列通過。公版 SW 實際離線測試只快取靜態資產，私密回應不快取。

初查 QA57 發現預設原生圖示沒有 H；已保留原檔並換回發布56實際15份已核准 PNG，沒有重畫或改 H。重新編譯後檢視全部密度、32／48／64與平台遮罩；已核對相同安裝包 SHA 並目視 Android 系統 App info，結論為「浮水印存在／樣式正確」，不冒稱小尺寸清楚辨字。背景測試首次截到的 Settings splash 不作圖示證據，另存已穩定畫面。

目前公開註冊與新版分發仍未啟用；家庭管理者名稱、獨立複查與剩餘發布條件仍待完成。完整本輪紀錄：`.codex-local/qa/20261014-android-background-and-registration/continuation-20261015-owned-photo-deletion-result.md`；來源與結果：`owned-photo-delete-latest-bindings.json`。

## 2026-10-15 本輪追加：下載內容邊界、標籤／日期與中央 Flickr 身分

新增下載body保護：actual Chrome經隔離loopback TLS，nonce probe通過前不送帳戶請求。原生Response properties／arrayBuffer／Blob／clone保留；epoch與cancel涵蓋headers後的body及reader，EOF／body完成前再GET/me確認actor，漏掉BC/storage也不發布舊A檔案或撤銷B。7個有界HTTPstream案例通過。browser登出亦要求literal ok=true；200字串／數字／null／missing／false保留原nonce與closed狀態，reload後仍不恢復資料，後續真正ACK確認。8個browsercontrols通過；初fixture共享login10/min被限流的紀錄保留，改每case新router限流視窗，未改正式限流。

本人標籤／日期已使用持久SQLintent：先固定owner／knownphotoID／receipt／target再dispatch；中央NSID及signedphotoowner一致，Flickr.readback確認後才更新app row。保留uploader與原upload receipt/membership。set與add tags、date皆不建立照片。lost provider/localACK與重開SQL，對同一ID查回／續做；先前unknown未確認前不能改target。first authoritative no-change可更正；之前unknown後的no-change不能冒稱原工作未發生。concurrent相同target共享單次write；account關閉前dispatch不送寫入，erase同時scrub pending targets。actualSQL/HTTP11groups通過。

原modal儲存標籤及collection picker＋confirm修改日期／reload合併已在actualbrowser驗證，六頁加move/tag/date11flows通過。接受原UI noon timestamp但target固定ISOday，signed granularity需0；LA的Feb29與DST calendar驗證。server day-only投影為本地noon，生日／day-only age計算以calendar解析，避免UTC前一天。現有upload14flows及account erasure12groups亦通過，非正式rubric/真機/iOS credit。

中央storage上傳前驗證既有NSID並以同一credential snapshot簽multipart；錯帳戶／連線未確認不建立照片，保留same receipt/file並允許原收據重試。OAuth callback另NSID不替換原授權；成功HTML與log不插入access token/secret。actual mounted root29groups、actual multipart independent HMAC2controls通過；所有provider皆synthetic，沒有live寫入／OAuth操作。曾誤啟動需env的舊upload-client工具而缺參數，在任何browser/HTTP之前結束，不計測試信用；改用相符實際uploader簽章驗證。

精確綁定／證據在QA public-photo-edits-and-media-body-latest-bindings.json。原HEAD/index、大量WIP、秘密config與兩正式保留原件均保留。線上仍test.56／1.0.64／public OFF；formal33/36與06=66.67%不變。本輪前端未同步新APK，native先前proof只綁前一版，勿泛稱current。既有reviewer因先前自動安全檢查工具錯誤不可用，新增版無獨立closure，不改寫舊四報告成PASS、不發布。

下一步仍是完整goal：individual photo delete／confirmed tombstone/quota/receipt；原生OSrevocation／commit recovery／newcurrent integrations與iOS上架計畫；privatefamily trusted bootstrap（管理者username仍待Hank）、SW／formal／physical與H/release/independent gates。部署授權仍有效；goalactive，不是假完成或暫停。

本輪最後獨立複查狀態：WLOG1／WUP1已有獨立bounded PASS；MEM1 canonical修正版actual6／25groups均通過，來源／收據完整保存，但reviewer工具以possible cybersecurity risk失敗。將同一已授權reviewer恢復並縮至只讀來源／雜湊／合成收據核對（無執行／網路／帳戶／裝置）後仍失敗。不得手工把四份独立報告舊HOLD冒稱關閉；canonical MEM1修正版獨立closure未取得，發布保持HOLD。不是使用者撤回部署授權，整體目標仍active，其他獨立實作可繼續。原家庭owner名稱仍待回覆；未發布、未開公開註冊、未操作真Flickr寫入、未清理證據。

追加canonical修正：MEM1的encoded album path/header別名在任何lookup／operator bypass前拒絕；operator非own-app目的僅允許numeric legacy familyID，不把unknown App UUID交給provider。修後SQL/HTTP6組及mounted root25組通過，含兩other appalbums literal/encoded add/remove、literal/encoded uploadHeader404、media／receipts／queue不變、provider0newcalls，ownvirtual／numericfamily positives仍通過。最新精確來源／證據在 `public-owned-membership-mem1-canonical-bindings.json`；獨立closure待回。其他完整發布門檻／goalactive保持。

追加複查修正（同輪）：獨立WLOG1與WUP1已關閉／bounded PASS。MEM1指出operator own photo→known foreign virtual album會落到legacy provider。gateway已在operator bypass前拒絕known foreign album（含upload header）；actual root新增404反控，all membership/receipt/queue不變，legacy/provider0calls；own virtual及numeric intentional legacy positives保留。修後HTTP/SQL6組與mounted root25組通過；MEM1獨立closure待回。`public-owned-membership-mem1-fixed-bindings.json`綁定新來源；先前browser9flows仍綁定前一個gateway own-path proof，不泛稱currentforeign-gate重新跑全browser。retention唯讀計畫通過，未清理當前證據／任何資料。

## 2026-10-15 本輪追加：網頁固定收件、登出競態、相簿移動與新版原生頁面

公開網站前景上傳已接實際 cookie／Multer／SQLite receiver，每檔固定 owner/content/meta CID，使用原始 UTF8設定與1MiB分段SHA。只在authoritative not_found且從未傳送／觀察未知的prepared狀態，或明確not_accepted後送原CID；lostACK先查原收據。receiving／receipt-lessaccepted／retryBlocked先保存uncertain，missing/reload/reselect不當成未收件。原File只在頁內，不宣稱關閉後保留；瀏覽器紀錄僅opaque ID/hash，不存私有名稱／標籤／日期。傳輸中心以本人server rows恢復，顯示相簿及bytes；portal已有實際file picker與前景限制提示。actualbrowser14flows通過，WUP1修正與反控證據交獨立複查，未冒稱已關閉。

WLOG1修正：在初次/me前捕獲epoch、await後重讀登出owner/nonce，storage及BC事件使未完成bootstrap失效。actualbrowser7controls：跨分頁503登出與lateA、漏掉兩種事件、startup pending onlineACK、Aintent/Bsession、staleACK/newnonce（隔離隨後合法fresh401ACK）均通過；獨立WLOG1已關閉。舊fixture中fresh401合理確認新nonce的紀錄保留。

新相簿屬虛擬App membership。media.albumIds表示當前所屬，原albumId／receipt／admission bytes保留；add/remove本人整批原子且冪等，不把UUID送Flickr photoset。foreign/duplicates／故障commit／未完成原檔不部分改。SQL/HTTP6groups、actual mounted root23groups與原六頁browser9flows（包含實際相集選取／兩次確認移動2張、reload原相簿空／首頁進目標見原照片）通過。重開SQLite保留membership，same receipt恢復不覆蓋，different receipt不能接管既有photoID。完整標籤／日期與confirmed delete/quota/tombstone仍待完成；新membership獨立審查待回。

public artifact已由allowlist同步至獨立QA57 Android包，無config.js；Capacitor core必須在帳戶bootstrap前。SDK36實際portal、原首頁／timeline／settings的Keystore/context／literalname／reload/logout/Bempty通過。這個APK又重跑Home、Settings、screenOff+keyguard雙向bytes前進與完成、exact Gallery／MOV／MP4、force-stop/reopen收據通過，SDK26僅guide。此native proof綁定當時APK，早於後來WUP1純browser修正；不泛稱latest全矩陣或physical/iOS。

新增證據見QA public-web-and-membership-latest-bindings.json、各current/wup1-fixed proof及native-current-public-pages-bindings.json。所有Flickr真實寫入仍0；沒有發布，線上test.56／後端1.0.64及formal33/36／06=66.67%不變。publicflag OFF；原部署授權有效。管理者名稱仍待Hank回覆，不能把第一個注册者當家庭owner。下一步：獨立closure、完整own metadata/delete與web body owner邊界、家庭私有遷移／trusted bootstrap、原生OSjob／commit recovery、iOS／SW／真機／formal及當版H發布門檻；目標active。

## 2026-10-15 本輪追加：原六頁接入新帳戶的基礎流程

原入口、時間軸、搜尋、每日相集、生日設定與傳輸中心已使用公開 bootstrap 與登入後後端本人資料。未讀取／複製真正 `js/config.js`；allowlisted網站來源不含原家庭密碼、Flickr APIkey或個人家庭設定。角色／相簿由伺服器導出，舊家庭私人來源未遷移即503，不補假資料或把新會員當管理者。照片／日期／標題快取僅在記憶體，本人目前相簿索引分帳戶保存。舊全域私有設定仍保留於原來源。

同源網站採 Secure／HttpOnly／Strict／APIpath session cookie，JS不拿bearer。Cookie写操作需同源與expectedOwner；登入替換在SQL同一交易撤銷原cookie session，舊ticket即失效；晚到A登出不會撤銷B。跨分頁切換通知清除其他private頁面。生日批次僅本人並原子保存；不存在的日期／混入他人相簿拒絕，不部分修改。publicContext搜尋只讀own photos，不落回中央公開Flickr。App仍Keystore bearer。

actual mounted server23組與實際無頭瀏覽器六頁8個基礎流程有界通過：登入跨頁／reload、本人private時間軸與搜尋、daily相集失去session-memory後URL重建與reload、生日server保存、傳輸中心、B切換清除A另一頁並空白開始。長相簿名稱的390px視覺截字已修wrap且檢查無overflow。不是全部照片操作／web上傳／正式rubric通過；原33/36及06=66.67%不變。

原生NREV1／2修為literalBoolean.true確認與獨立exactconnection絕對watchdog（覆蓋connect/output/status/headers/body、finally撤銷）。SDK26/36的字串true／number／null／missing／false／malformed回覆都保留oldA待撤銷列、B credential／epoch不變；每250ms的header滴流超過idle範圍，在6015／6009ms停止、保留收據、後續真true／401重試通過。獨立有界NREV1/2已關閉。新public page whitelist與本輪NativeAccountClient改動尚未重新跑全current原六頁native／background scope。

公開artifact新增只cache安全static assets的worker／manifest；privateAPI／HTML／tickets／config.js不cache，此SW runtime與offline-cookie logout marker仍待驗。真正web原檔上傳、完整own-photo mutations／相簿membership／delete quota、家庭私有入口與owner bootstrap、native process/OSjobs/recovery、iOS／真機／正式驗收及當版H發布檢查待完成。線上仍test.56／後端1.0.64，publicflagOFF，未發布未提交商店；目標active。Hank的部署授權有效，管理者帳號名稱仍待回覆，不索取密碼。

證據／來源：QA的 `public-original-pages-long-name-fixed-evidence`、`public-original-pages-latest-bindings.json`、`public-original-pages-first-evidence`（actual23組）、`native-revocation-strict-ack-header-watchdog-evidence` 及 `native-revocation-strict-current-bindings.json`。以下為歷史。

## 2026-10-15 本輪追加：離線登出與舊資料庫刪除保護

- 原生離線登出／切換把舊憑證放進同一 checked AtomicFile 的獨立 GCM 用途待撤銷 vault。每次 active credential 仍讀取並認證；pending 僅沿用 digest 相同的已驗證密文，改密文即失效並保原件。只在原 issuer 的 logout／有效401確認後移除該憑證，不改新帳戶 epoch。24格保留最後一格供本機登出，滿載也不能困住登入者。SDK26/36 的重新開啟 store、篡改／用途提升拒絕、舊凭證不再啟用、恢復原issuer撤銷、B憑證／epoch不受影響、滿載仍可登出均通過。只驗 store reopen；真 process restart、OS network job 與 commit recovery UX 未完成。
- 最新 compiled native source 的 SDK36 實際 JS→UIDT、HOME／Settings／螢幕關閉且keyguardLocked後，兩方向bytes都增加並完成；14,493,799B原PNG、MOV/MP4、MediaStore原檔及完成收據強停／重開通過，原時限未放寬（完整 instrumentation73.452s）。SDK36六個save/thumbnail競態、途中帳戶切換／晚401／返回本人不重傳與 firstparty client bridge亦通過。SDK26/WebView58完整網頁／背景仍不外推。
- 新 backend 的 auth 會把帳戶資料庫不可用回503，避免誤當401撤銷成功。actual mounted server20組有界通過。線上仍v18/1.0.64/publicregistrationOFF，未部署。
- 獨立 ER1 找出舊secure_deleteOFF的main DB freed pages可能含舊私密片段。已加足夠容量檢查與 mandatory VACUUM，再確認 WALTRUNCATE 才 dataErasureComplete。先重現private fragment殘留，修後main/WAL/JSON都不含該合成片段；持續reader與compact失敗保留scrubbing，再open恢復。Node24目前12組有界通過，獨立 ER1 已關閉；不宣稱OS／SSD物理抹除或cloud backups清理完成。
- 測試跨多個已結束DEBUG假服務的pending紀錄曾正確觸及容量而失敗，原收據保存。只在 `accountqa`／DEBUG／synthetic_／loopback範圍，先保留原加密state，再以exclusive bind確認舊fixture已結束，回401確認其無效憑證；未知或占用服務不動。不刪原媒體、task、Keystore或其他App資料。

下一步原六頁／傳輸中心的新帳戶 config/API/auth 整合與家庭私人配置遷移；再完成 native process/OS 排程與原件恢复、iOS owner 策略及正式驗收／新版發布門檻。管理者帳號名稱仍待Hank回覆，不另問相同部署授權。線上 APK仍test.56，原正式33/36、06=66.67%不變，完整目標仍active。

證據：QA資料區 `native-offline-revocation-current-key-evidence`、`native-offline-revocation-background-evidence`、`native-offline-revocation-current-boundary-evidence`、`native-revocation-authority-server-evidence`、`account-erasure-er1-fixed-evidence` 與兩份 current/fixed bindings。以下歷史保持原樣。

## 2026-10-15 本輪進度：帳戶背景傳輸與精確刪除候選

- Android 新帳戶候選的重複 Keystore 解密與非完成事件通知檢查已減少；每次仍讀取並驗證當前憑證。SDK26/36 live handle 切換、登出、篡改、到期、保存故障保護通過。SDK36 完整 JS→UIDT HOME／Settings／螢幕關閉且 keyguard Locked 後，上下載都增加並完成；14,493,799byte PNG 原檔、MOV/MP4、副檔名、MediaStore 及完成收據強停／重開通過。原完成時限未放寬；前兩次稽核／時限失敗收據保留。只屬受管理模擬器與合成服務，不外推真機或正式 rubric。
- 獨立複查已給原生效能／新鮮權限與 SDK36 背景有界 PASS；原檔網址 UJ-1 已依解碼及正規化後限制修復並有界關閉。DA-1／DA-2 先前容量收據問題已在所審版本關閉。新精確刪除仍待獨立複查。
- 公開候選已把 SQLite、容量預留、Multer2.4.0 原檔接收與原子 queue/admission 收據掛到 actual server 的 feature flag。原生 Java→actual Node/Multer/SQLite 收件雜湊及失去 localID 後查回原收據有界通過；不重建 Flickr。live feature flag 仍 OFF。
- 帳戶刪除新增 reauth→停用／撤銷 session→精確本人 provider ID／私有原檔清除→live rows／JSON 遷移源本人列 scrub／private WAL TRUNCATE→complete。錯誤中央 Flickr NSID、其他會員／舊家庭共用 ID、不明 receiving/provider 結果與舊 SQLite reader 都阻止冒稱清除完成；查詢碼只儲存 hash，登出後僅回狀態。遺失刪除回覆後 reopen 用相同明確 ID 重核對，不新建上傳。既有家庭管理者刪除仍保護，需先完成專用遷移／策略。雲端備份保存與恢復策略尚待完成。
- read-only Railway SSH 已核對正式 Node18.20.8，不能啟用新 SQLite；候選已固定官方 LTS Node24.22.0（原依赖其餘保留）。本機同版本 actual SQLite8／admissions8／receiver6／erasure9／actual server19／headless portal9組通過；仍不是 Linux/Railpack 正式部署驗收。Node runtime／Multer來源皆有官方紀錄。
- 線上仍 Android test.56 與後端1.0.64/build2026.10.14.2，沒有本輪部署、Flickr 真實操作或商店提交；新包與註冊未發布。原正式33/36、06=66.67%不變。

後續繼續：獨立刪除審查／必要故障與未知結果復原、原生離線登出待撤銷收據與 task durable recovery、原六頁／傳輸中心 own-account 整合及家庭私人配置遷移、iOS Keychain／owner／background、真機／正式驗收及當版 H／選檔發布檢查。Hank 既有部署授權有效；管理者登入帳號名稱仍待回覆，不索取密碼，也不能把第一位新會員當成原家庭管理者。

證據／來源 SHA：`.codex-local/qa/20261014-android-background-and-registration/` 的 `native-background-identity-performance-fixed`、`native-fresh-credential-auth-expiry-evidence`、`node24-current-evidence`、`node24-current-bindings.json` 與 `latest-checkpoint.json`。以下舊紀錄保留歷史，不拿舊未掛載說明取代本段。

## 2026-10-15 最新接續狀態（以下舊紀錄保留為歷史）

Hank 已明確授權 Android 背景上下載、測試後更新安裝版、開放註冊、雙平台上架規劃，並指定新使用者照片先存到後台現有中央 Flickr 帳戶。後端／網站更新授權已收到；不另外要求相同部署許可。商店目前只規劃，不擅自提交。此對話依直接要求接續原目標，目標仍 active，未完成。

- 線上安裝版為 `2026.10.14-test.56`（code56），GitHub Pages commit `78337a8a2ccebad50f45e92f4bbb915501819823`／run38572248641 已成功。實際網站下載 APK SHA256 `f1e8c4b1ed9f481fae314e62957a65104b30d161abebef838add9b842dd95e36`。每版包內／平台遮罩／網站／實際安裝 H 自檢與獨立有界複查已完成。
- Android16/API36 受管理模擬器：實際 JS→原生UIDT，確認 HOME、其他 App、interactive=false/keyguard=true 後，兩個傳輸的 bytes 都增加；原 PNG、MOV、MP4、MediaStore 原檔與完成收據重開已驗。Android7/API26/WebView58僅更新指引通過，不能稱較舊OS完整背景傳輸通過。實體手機/OEM、省電、任意活動任務強停後必續傳及 iOS 新帳戶背景傳輸均未驗。
- 正式原 rubric 仍33/36；06仍66.67%，未驗項06/2、06/6、08/6不可用隔離案例數量換算通過。沒有把模擬器或合成 API 倒填為真機／完整正式 Flickr 驗收。
- 線上 Railway仍1.0.64/build2026.10.14.2，公開註冊OFF。新的帳戶／媒體／收據隔離、媒體原檔代理及私有票證是本機候選；新註冊者不能讀舊家庭資料。已有13實際Express/Multer/worker人工provider組與18資料儲存組通過，沒有新的真實Flickr操作。
- 新帳戶原生憑證用 Keystore/AES-GCM，只有已由伺服器確認的 owner/issuer 可啟用；憑證不回傳JS、不明文寫入task/browserstore。寫入未確認即失效且保留原件。實際SDK36六個JS縮圖/保存佇列、複製途中、最後發布與ABA切換均拒絕舊權限輸出並保原檔；途中傳輸切B、401、返回A沿用收據只一次合成上傳，皆有界通過。
- 新 `account.html` 初版的實際無頭web A/B註冊、登入、個人相簿、30/1分頁、原PNG下載、401/晚到A401/404/503/登出途中下載與安全文字顯示已驗；SDK36實際包內表單、建立相簿、確認fresh document後Keystore恢復登入、serverlogout與B空白相簿亦通過。三次失敗紀錄保留。公開入口／原六頁整合及新原生安裝版尚未發布。
- SQLite帳戶資料與容量／收件預留原件是新候選，未掛到server。实际3writer、兩handle、重複帳號、未提交processkill rollback與保留壞原件通過；兩process搶同容量只一筆預留。未知receiving不能自動重POST，accepted只回既有收據。只測Node25.8.1，正式runtime相容性／receiver-before-Multer/queuejournal/reconcile/native lookup未驗，不作正式耐久／全 exactly-once 宣稱。

待完成：中央儲存的使用者配額／原檔收件journal整合、完整精確帳戶遠端移除及競態、新帳戶與原六頁及傳輸中心整合、舊家庭管理者私人啟用／資料入口遷移、正式runtime/部署/gates、iOS Keychain/background owner策略與雙商店準備。管理者登入帳號名稱問題仍待Hank回覆，不能把首位新註冊者指定為原家庭管理者；不在聊天索取密碼。

當前所有來源／成功與失敗收據及審查索引在 `.codex-local/qa/20261014-android-background-and-registration/`。長期資料在已驗證APFS，測試/快取留SSD並保20GiB。rootHEAD仍caa1779、index與既有WIP不重置；後續發布需選檔比較遠端main，不能直接pull/reset。已刪七個人工FlickrID不得重建，既有家人原檔／授權不變。

# Timehut 工作目標與驗收

## 最新續作（2026-10-14，QA54）

時間軸新增共用傳輸入口／未完成數量；時間軸照片多選與相集詳情新增批次下載確認、確切媒體數量及誠實的已知／未知容量。固定確認時的檔案，保護中途新選取，部分失敗僅重試失敗項；原相集模式工具列不擴張。任務讀取逾時保留底層讀取鎖，修前4次呼叫的負控失敗、修後1次通過。

新增29組、兩模式12項、主要操作20項、下載／離線快取8項通過，皆屬本機合成資料；QA54兩平台建置來源及實際包核對成功，69檔已存回外接APFS。獨立來源與七張画面delta複審通過；原P2與兩notes解除，未重評六頁總分。完整目標受真實登入及手機驗收條件阻擋，本輪可獨立處理的已定位工作完成。實際照片清單不提供可靠bytes，故總容量仍未確認。正式33/36、06=66.67%不變；真實OAuth／完整OS生命週期／完整操作矩陣仍未驗，不發布或新增Flickr操作。[本輪紀錄](../.codex-local/qa/20261014-transfer-entry-download/result.md)。

## 歷史續作（2026-10-14，QA53）

05設定新增目前App開啟方式、完成通知與新增照片保存權限／指引，僅讀取、無自動授權提示；生日編輯與儲存保留優先位置。320px原日期欄截字已改完整一列，修前負對照失敗、修後通過。主線最終狀態UI24組、既有核心20與照片／相集模式12項通過。QA53兩平台建置及實際包來源核對成功，69檔回存外接APFS；最終獨立來源與畫面複審通過，05本輪視覺84/100，限所示合成橋接畫面。

上一輪QA51已完成10傳輸中心持久Wi-Fi／非行動數據選項、未完成任務切換與有界獨立複審，QA45本機縮圖與QA49完成通知也已實作。真機／完整OS生命週期仍未驗。正式功能維持33/36，06仍66.67%；不以新mock checks擴張原分數。[本輪紀錄](../.codex-local/qa/20261014-device-settings/result.md)。目標active，完整需求／六頁各80／真實E2E仍未全數達成；不發布、不新增Flickr操作。


## 歷史續作（2026-10-13，QA44）

外接碰撞後已恢復原APFS映像讀寫，現行工程 `/Volumes/AiHankAppsData/Timehut`；實體仍為codex_2T，原自訂入口未恢復。APFS/Git檢查通過，原修改保留。[儲存紀錄](../.codex-local/qa/20261013-external-remount/result.md)。

09安裝指南双卡、平台步驟、安裝狀態與手機頁首間距已修正。最終主18＋既有10項通過，獨立delta5項通過；QA44雙平台包與来源綁定並回存外接。[本輪結果](../.codex-local/qa/20261013-install-guide/result.md)。正式仍33/36、06頁66.67%，原六頁/36項不變，未作真機或發布。接續10傳輸中心尚可獨立進行的縮圖／網路策略／完成通知工作。goal active，完整目標未完成；以下QA42及更早均為歷史。

## 歷史補圖續作（2026-10-13）

六頁手機追加設計已獨立審查pass，6頁共7張；原參考與36項不變。正式33/36、06頁66.67%，完整目標未完成。新增[圖冊](../.codex-local/design/20261013-mobile-additions/index.html)與[審查及範圍](../.codex-local/design/20261013-mobile-additions/RESULT.md)。產品仍QA42。本輪接續處理09安裝引導／10傳輸中心尚可獨立修正的提案差距，goal active，不發布。

## 歷史續作（2026-10-13，QA42）

> 最新QA42：未知上傳結果不再提供盲目重試；收據查詢保留途中新增任務與阻擋旗標，晚到的409不會覆蓋已確認完成。獨立原18組複驗通過（含1組舊版對照），主線D/M14項通過，雙平台包來源核對並保存。正式仍33/36、06頁66.67%，goal active／未完成／未發布。詳見[最新紀錄](/Volumes/codex_2T/codex_project/AiHankApps/Timehut/.codex-local/qa/20261013-transfer-unknown/result.md)；以下QA40及更早為歷史。

## 歷史續作（2026-10-13，QA40）

> 最新QA40：延遲相簿清單不再覆蓋剛選的上傳目的地；錯誤／逾時保留選擇並可重試，關閉後舊回覆被隔離。主18項、獨立6項、目的收據4項及照片／相集12項通過，双平台實際包來源核對完成。/api/albums由懸掛改明確503，完整列表與caller授權仍未完成。正式維持33/36、上傳頁66.67%，目標active、未完成／未發布。詳見[本輪紀錄](/Volumes/codex_2T/codex_project/AiHankApps/Timehut/.codex-local/qa/20261013-album-loading/result.md)。以下QA39及更早均為歷史。

## 歷史續作（2026-10-13，QA39，四張人工圖授權已履行）

4張固定人工PNG已完成批量／單張標籤與Flickr逐檔原檔讀回，全部永久刪除並signed確認not-found。共4次建立，沒有多建立；本次4個與先前3個已刪ID均不得重傳／重建。執行ledger已terminal，重新清理會零遠端請求退出。

修正佇列併發重複建立、上傳結果未知時盲目重傳，以及新傳輸收據缺少目的相簿。離線回歸與獨立來源審查通過，QA39雙平台建置和實際包來源綁定完成；未知結果分支僅離線驗證，後端未部署。

獨立正式功能33/36（91.67%），02/03/05/06/07/08為100/100/100/66.67/100/83.33；原36項不變。06頁仍未達80%，完整目標未完成。保留原視覺分數範圍，不外推新狀態／真機。真OAuth、完整進度／取消／背景矩陣、真機、當版H與安全／部署門檻未解除。現有/api/albums未回覆仍須連同caller授權與metadata暴露契約審查，舊收據目的不猜補。

[本次完整紀錄](/Volumes/codex_2T/codex_project/AiHankApps/Timehut/.codex-local/qa/20261013-live-upload-modes/result.md)、[獨立最終審查v2](/Volumes/codex_2T/codex_project/AiHankApps/Timehut/.codex-local/qa/20261013-live-upload-modes-review/final-review-v2.md)。最新狀態以continuation/status與此段為準；工具目標仍保留先前blocked，未宣稱complete。下方「待回覆／32項／active」是歷史狀態。分段保存可降低斷線重工，不能保證消除服務端串流錯誤。

## 歷史續作（2026-10-13，QA38及以前）

最新QA38：相集跨相簿移動已固定來源、逐檔部分結果僅保留未完成；手機侧欄同頁切換，舊GET不覆蓋新孩子。獨立D/M16項＋主代理模式回歸12項通過，雙平台實際包與來源綁定並回存外接。正式32/36、06頁50%，完整目標未達成。詳見[最新追加結果](/Volumes/codex_2T/codex_project/AiHankApps/Timehut/.codex-local/qa/20261013-move-followup/result.md)。4圖提案仍待人類回覆，遠端寫入0。以下QA37與更早段落為歷史。

追加已完成：批次刪除三入口的partial僅重試failed、相集首張ID變更重綁、舊結果延遲回呼隔離；日期三入口與相集內membership partial亦僅保留failed，日期modal來源／目的數量同步更新。8937獨立25delete＋24date/membership通過；8938最後count修正main24通過並獨立目視12張／讀來源与receipt，P3解除，其餘20張未目視明列。最新QA v37實際雙平台包已綁定来源與回存外接，舊v35/v36保留。完整追加結果 `.codex-local/qa/20261013-batch-followup.md`。

4張新人工棋盤PNG（661bytes）的live上傳／兩標籤模式／逐檔metadata與測後僅刪新ID提案已準備，等待使用者明確回覆；尚未授權、未上傳。無回覆不執行依賴它的遠端寫入。正式功能32/36、上傳頁50%與外部／真機／H／安全門檻維持未完成，原目標不縮減。以下v35段落為本日先前結果，最新以v37與checkpoint為準。

接續對話 `01a133f0-1f5b-71d2-a22a-4dd64a1ca215` 的工具目標仍active、未完成；下方歷史「Goal=null」僅指當時狀態。完整本輪結果見 `.codex-local/qa/20261013-result.md`，續作入口為 `20261013-continuation.json`／`20261013-status.json`。原10/12紀錄保留，不當作本輪完成宣告。

已修影片失敗重試與切回照片顯示、mobile共用進度列及選取模式避讓、照片批次部分失敗僅重試失敗ID、網頁開始上傳後停止與原檔／原設定保留。停止提示縮短並可展開，重開重試清單時回到首筆。照片與相集同頁互斥、Enter／Space、切孩子清空、取消後檢視器已在D/M實測。

獨立固定六頁視覺分數02/03/05/06/07/08＝84/81/84/82/84/80，495/600（82.5%）；功能32/36（88.89%），各頁100/100/100/50/100/83.33。上傳頁功能仍50，完整目標未達標。最後4圖補審解除手機首筆檔名遮蔽P3；不把局部圖面與本機測試換算完整功能或native驗收。

最終上傳6個本機HTTP D/M情境＋22既有回歸共28通過；批次重試獨立14通過；v35共用進度列10情境14圖通過。播放20、同頁模式12與較早核心20證據及原始失敗均分別保留。QA v35雙平台建置、native17／前端34／每平台包內web39來源核對PASS，實際包已回存外接；未作新OS執行、安裝、分發或發布。

真機仍無，06/2 OAuth、06/3兩種標籤live逐檔讀回、06/6完整live／native生命週期、08/6完整操作失敗矩陣、先前source-review P1與部署一致性、當版H完整驗收仍未完成。不搶Mac鍵鼠／焦點、不操作新Flickr測試資料、不重新操作已永久刪除的三個ID，不發布、不變更安全設定。

H依最新使用者規則檢查存在／正確樣式，小尺寸辨字不再是HOLD；候選預覽不是實際當版包內／商店／安裝圖示驗收。分段落盤降低斷線重工，不能保證消除上游串流斷線。重啟先讀最新checkpoint及遠端刪除收據，禁止盲目重跑。

2026-10-11，Asia/Taipei。單一實作／發布來源：本 repository。分支 codex/uiux-local-preview。既有未提交資料保留，不另建長期工程。

## 最新續作（2026-10-12，人工影片完成）

Hank 已明確授權一段 2 秒、3,572 bytes 的無聲幾何 MP4 測試，並要求完成後刪除。僅上傳一次，ID `55582630482`。桌機／手機尺寸網頁實際播放、原檔下載位元組一致、單張／相集標籤 signed 讀回、相集 ZIP、日期／生日年齡／影片數、實際候選服務停止及重試均有紀錄。刪除取消與服務失敗不假成功；最終 UI 永久刪除成功，signed getInfo code1、完成載入的空 UI 已核對。原兩張 PNG 及本段影片均已永久刪除，不能重傳重建。

影片播放與原檔下載改為候選後端取得新鮮、已授權的 Flickr MP4 串流，保持私密；原檔不以轉碼替代。修正影片副檔名、影片數與 Range 防護，native 只接受目前固定服務的 HTTPS／numeric ID／original 路徑，下載失敗保留重試且不開縮圖。網頁隔離 core20、UI12及下載/PWA8檢查 PASS，獨立 HTTP／URL及固定 rubric 補審另有報告，不把檢查數量轉成正式分數。

最新 v30 iOS 簽署模擬器包及 Android App／本工程 AndroidTest 包建置 PASS；native17、rootFrontend34、安全 web39 每平台與來源位元組相同，AddOnly／無 Photos ReadWrite 覆寫。此版沒有實際手機 OS 執行，新建置不替代真機驗收。證據 `20261012-candidate-evidence/build-source-v30.json`。

Source review 確認現有 caller 授權、公開 staged 檔案及舊任意 URL 代理有 P1 缺口；本輪沒有調整安全設定、公開性、憑證或部署。正式服務是否等同目前源碼未確認，不能據此宣稱生產環境漏洞已實測。完整目標、當版 H、真機與正式部署維持 HOLD。

人工影片完整 ledger 在 `.codex-local/qa/20261012-real-video/ledger.json`；新預覽為 `http://127.0.0.1:8909/timeline.html`，含合成資料。持續工作狀態與版本界線以 `.codex-local/qa/20261012-status.json` 及 `20261012-continuation.json` 為準；以下較早「待影片授權／未刪除」紀錄保留為歷史，不是目前狀態。

## 工作目標

沿用已定案的六張童書風示意圖及完整原功能實作。完成條件為「真實 E2E 審查通過」及「圖面、功能對齊均至少 80%」，未達標保持進行中並依證據修正。本機隔離／合成資料測試不能替代正式服務或原生真機 E2E。當前不部署、不修改安全設定、不操作 Mac 鍵鼠或焦點。

上述工具Goal為null是舊對話當時狀態。本續作對話已建立工具Goal；最新實際狀態以工具回傳及20261013-continuation.json為準，未宣稱完整目標完成。

## 固定設計依據

六張圖：.codex-local/design/20261011-cute-kids 下的 02-timeline.png、03-album-detail.png、05-settings.png、06-upload.png、07-photo-video-viewer.png、08-batch-management.png。凍結來源／尺寸／SHA256 於 docs/uiux-acceptance.json；不得替換參考圖來放寬計分。既有 .codex-local/design/20261011-cute-kids/FUNCTION-COVERAGE.md 與 DECISIONS-MOBILE-20261011.md 是功能範圍依據。

圖片內錯誤中文字／範例日期不作實作規格；實作使用 CONFIG 真實姓名、拍攝日期及生日計算。照片區保留原照片／影片，童書插畫用於裝飾及頭像。

## 計分與證據

- 每張圖各有視覺 100 分與功能 100 分，六張等權平均；兩軸平均均須 >=80%，且每張兩軸均須 >=80%。不以一軸補另一軸。
- 視覺固定五項，各 20 分：版面區塊與層級、色彩／字級／按鈕、童書插畫位置、控制項及內容可讀、桌機／手機布局。每項有 desktop/mobile 實際 screenshot、區塊對照與檢視結論；分數由帶證據的正式審查給定，未審查為未驗／0，作者自评不得宣稱通過。
- 功能各頁逐項列於 JSON，每項等權。通過須 UI 操作 → 實際請求／狀態變更 → 正確結果的紀錄；只有按鈕存在、路由模擬、單元測試或測試數量不算通過。
- 真實 E2E 是獨立門檻：真實授權測試帳戶的前後台完整上／下載、標籤、加入／移出等已授權人工圖片閉環；永久刪除須另問，不因驗收自行擴權。原生手機項目另需真機回桌面／切 App／鎖屏、佇列回復與完成檔案驗證。
- 不支援、缺圖、缺服務、未驗一律保留原分母並列出阻礙，不用 N/A 縮小分母。新安裝／背景傳輸項目為必要門檻，不能因原六圖達標而略過。
- 原功能缺陷的修復不減少原功能要求；不能把「頁面內背景工作」當成「手機 OS 背景傳輸」。
- E2E 未通過、視覺／功能任一未達標、當版 H 圖示自檢未完成或無部署授權，發布 HOLD。

## 里程碑與狀態

- M1（前端隔離檢查已通過；正式審查待驗）：六圖對照凍結；共用童書樣式、裝飾素材與控制入口；隔離無頭測試及 screenshots。
- M2（人工圖片有界真實 Flickr 閉環通過；全功能未驗）：上／下載、標籤、加入／移動、批次確認等完整閉環，含錯誤處理；真實授權測試資料。
- M3（Capacitor 雙平台已建置，部分原生 OS 驗證通過；真機待驗）：PWA 正式安裝能力，以及 iOS／Android 原生背景傳輸；新增 09 安裝、10 傳輸中心圖的補圖／審查。
- M4（待驗）：帶證據的正式視覺／功能審查，達80%；真實 E2E 審查通過；發布前 H 自檢。無新增部署授權。

## 現存阻礙／未驗

- 已選 Capacitor 共用 UI 與 iOS／Android 原生傳輸插件；雙平台 QA 包已建立、原生插件已實作且部分模擬器測試通過；安裝通路與真機待驗。純 PWA 不等於原生背景傳輸。
- 安裝／傳輸中心 09、10 圖已生成，位於 .codex-local/design/20261011-cute-kids/mobile-v2/；09／10實作沿先前有界審查仍partial；原六張手機追加設計已於2026-10-13另存並獨立審查完成，原參考凍結不變，真機及完整新狀態仍未驗。
- 最新直接授權：使用目前已連接 Flickr 帳戶與原正式版相簿；只對本輪人工測試圖片上傳、標籤、移入／移出與下載，不新建相簿、不動家人照片或公開性，永久刪除另問。
- 候選 server 已補 remove_photos，人工圖片 add/remove 實測通過；線上手動部署版本與 Git HEAD 是否相同仍未確認。
- Mac 鍵盤故障排查中：禁止搶鍵鼠／焦點；無頭測試可做，若 UI／真機驗收需桌面操作先回報，不能冒稱 E2E 已過。
- 正式 icon 無 H 原圖／選定 H 圖層未確認，當版發布自檢未完成。

## 2026-10-11 可驗進展

六頁桌機／手機 screenshots 與隔離操作結果已保存 .codex-local/qa/20261011-ui-m1/；全部前端 runtime errors 為0。這是合成資料与本機收據的前端驗證，正式 E2E 及兩軸審查分數仍未驗／0，未宣稱 >=80%。下一里程碑是可持續查詢的終態收據、同 repo 原生插件與合成檔跨 App 狀態測試，見 docs/NATIVE-TRANSFER.md。最新人工圖片測試範圍已直接批准；正式相簿其他資料及公開性仍不可修改。

## 本輪續作

原 APFS 掛載與 UUID 檢查已通過。三個導航／搜尋修正已核对並套用原工程。初審及候選驗證在 .codex-local/qa/20261011-navigation-review/；隔離 12/12 不替代正式 E2E 或視覺分數。後續處理獨立審查提出的逐張結果、快取及版面問題。

## 最新驗證狀態（2026-10-11 續作）

原 APFS 權限已生效，儲存身分／原工程檢查 PASS，未建立替代空工程。選定證據保存 .codex-local/qa/20261011-candidate-evidence/，各次 snapshot 不同、HEAD 相同不能證明未提交內容相同。

- 獨立視覺 v6：已呈現狀態六頁 02=81、03=82、05=84、06=82、07=81、08=80；只是 provisional，不填作完整正式驗收。已修其 P2 白字淡黃問題，新最終移動／刪除取消／移動相集圖在 visual-v7，獨立補審進行中。
- Real Flickr：目前已連接正式帳戶、原兩個相簿、只新增兩張人工 PNG，UI 上傳／標籤／加入目標／移出來源／原檔下載通過，私密性前後一致。未建相簿、未動家人照片、未永久刪除；人工圖仍留在第二個原相簿。ledger=.codex-local/qa/timehutqa_1791727040099_018f7770/ledger.json。
- 前端：12 UI、12 導航、7 故障分支、5 照片影片/ZIP/PWA、2 窄／短視窗布局檢查通過。這些是隔離人工資料驗證，不代替真機／全正式帳戶資料驗收。
- 收據：10 後端／3 web 故障檢查通過，含同 ID 不同 bytes 拒絕、metadata 失敗不假成功且重试不重複上傳、壞儲存不覆寫、重啟已知 ID 續 metadata，未知 Flickr 結果保留原檔並阻擋盲目重傳。
- iOS：簽署完整的模擬器 QA 建置通過；實際 Scene 網頁→外掛能力/list、離開 App 後完整 PNG 上／下載 bytes 通過；最終收據於回前景後確認，完成後重啟保留。沒有宣稱完整背景收據或真機通過。
- Android：原 Gradle 8 主建置通過；SDK36 模擬器網頁→外掛、回 HOME 傳輸、影片 302→MP4 exact bytes、錯 MIME／截斷拒絕、完成後 force-stop 保存收據通過。實際 picker、舊版 Android 途中死亡恢復、真機與鎖屏仍待驗。
- 第二位獨立審查 F1–F6 已修，修正版複審進行中。正式功能各頁 >=80 尚無完整獨立證據；原 rubric 未改權重、門檻或未驗=0。
- 發布 HOLD：真機、完整功能審查、真正無 H 圖示及指定 H 圖層／當版自檢、來源／部署一致性與部署授權未完成。沒有 commit、push、部署或永久刪除。


## 2026-10-12 持續工作紀錄（未完成）

使用者的 APFS 掛載權限已生效；實體碟 UUID、原 sparsebundle、APFS 與完整獨立 Git/source 已核對，沿用原工程，沒有空替代目錄或重複搬移。

獨立視覺 v10 六頁暫定 81／82／84／82／81／83，設定手機错误提示遮蓋儲存鈕及旧错误截图文案問題已修並補審。09／10 補審指出目的相簿／真進度總覽／強制結束說明，已依證據修正，有界視覺 v12 補審已解除所示首 CTA／附註遮擋 P2；正式原分母／未驗0保持。

最新 core-v6 20 PASS、photo-tags-v2 9 PASS、transfer-center-v4 5 PASS、mobile-entry-v6 8 PASS；check 數量不轉成36 criteria通過比例。Flickr 最新五個有界 recheck 實際通過，僅原兩張人工图和原相簿。單張 tag 保存讀 signed raw uploader，解 normalized list 丟冒號導致標記丟失；受影響人工圖已恢復，沒有 family／visibility／日期或永久刪除。

Android v25 App＋owned AndroidTest APK 與 iOSv25簽署模擬器 App 建置成功；實際包內 web39每平台與安全副本相同、native17 source/copy 相同，AddOnly/no QA override。最新建置未新增OS／真機驗證。Android舊全library instrumentation失敗log、Flickr錯scope／selector、fixture差異及 iOS Photos readback FAILED 均保留，不以新PASS覆蓋歷史。

AndroidSDK36模擬器實際背景傳輸／MediaStore bytes／孤兒任務持久性及兩平台壞 store fail-closed已有狹義證據；iOS最新版Photos readback timeout、真機安裝／鎖屏大媒體、SDK<34／完整生命週期矩陣仍未驗。當前connected iOS為simulated，沒有可連線physical iPhone。

原照片日期修改與永久刪除的人工ID精確授權、真正無H原圖及指定H圖層問題仍待使用者答覆；「已給權限」僅回應掛載問題，不擴大Flickr操作權限。圖示自檢未通過，正式功能／完整E2E尚未≥80；不宣稱完成或發布。

當前預覽 http://127.0.0.1:8904/timeline.html 為人工資料。完整最新索引 `.codex-local/qa/20261012-status.json`，原生證據與限制 `docs/NATIVE-TRANSFER.md`。project-cloud show Timehut 本輪唯讀 exit75，雲端 catalog 可用性未確認，沒有重試備份／清理或宣稱復原。


最後候選 v25：native17／root前端34檔跨建置前後未變，兩實際包public39檔各相同。mobile-entry-v6 8PASS 並確認scrollY=0，390×844首個上傳按鈕底緣830.98；安裝附註與action row不重疊。core-v6 20PASS。獨立視覺v12四圖已讀，兩P2在所示狀態解除，沒有新增確定P1/P2；原六分81／82／84／82／81／83保留。最新有界Flickrreadonly也驗settings前端與實際candidate /health後端版本、原圖bytes；沒有新增Flickrwrite。完整功能獨立補審與未驗gates仍保留，沒有正式完成或發布。

最後獨立功能 v6 已完成，沒有新增確定 P1／P2；已覆核 v25／root前端34／native17／public39、readonly版本頁及小delta；fullAcceptance=false，原36 criteria、未驗0與80門檻不變。視覺／功能審查agent均結束，不操作鍵鼠或焦點。後續依待答的人工日期／永久刪除授權、圖示來源及實體手機驗收條件繼續；此目標未標完成。


## 2026-10-12 追加有界補測（未完成）

新補測捕捉並修正人工圖上傳 partial failure 後重試相簿回預設、重試按鈕仍 hidden、恢復連線後授權提示殘留三項。upload-client-v3 桌面／手機14 PASS，實際 multipart names／bytes／tags／album 及只重試失敗檔有 assertion；v1／v2失敗收據保留。core-v7 20 PASS、mobile-entry-v7 10 PASS（新增預設標籤展開／收合、新人工 picker task、長檔名與草稿保留），仍是 route mocks／simulated bridge，不作 Flickr 或手機 OS 完成。

Android／iOS v26建置成功；native17、rootFrontend34、safe public39 each 及 AddOnly 已用前後 bytes 綁定。actualNativeExecutionThisBuild=false，H HOLD；沒有發佈或重跑 Photos readback。新版有界上傳独立複審和照片／相集多選切換補測進行中；正式 rubric／80門檻未放寬。


網頁目前已帶入 backend 的 per-file clientUploadId，保留的 File 重試使用原識別碼；upload-client-v5 16 PASS，web-upload-retry-v2 真 UI→本機 Express queue 3 PASS，回覆遺失後兩次請求只留同一筆 durable receipt，未連到 Flickr。v4 missing-ID FAIL 與 Express v1 null/undefined harness FAIL 保留。

獨立 selection-switch-v1 28 PASS／8 FAIL／2未覆蓋，確認四問題（各兩尺寸）：photo mode zero actions、moment/photo tag partial 不清成功項、partial download 勾選外觀消失。已依逐ID收據清成功並保留失敗子集／草稿、album重繪保selected／aria-pressed，重驗進行中。core-v8 20 PASS，v28兩平台建置及source/native17/root34/public39一致；OS仍未新增。完整門檻未達、H HOLD。


最新有界selection-switch-v2已完成38 PASS／0FAIL／2未覆蓋（D/M各19），綁同一8904／5gfx snapshot。四個舊問題回歸通過，同moment內部分成功可保完整原照片清單、僅failure子集重試，成功回覆前後選取狀態正確。test agent已關閉；獨立code delta補審仍進行中。upload-client-v6 16PASS、web-upload-retry-v3 3PASS補存當次origin／safe snapshot與harness hash，仍是有界人工資料／本機API。正式criteria原分母600／未驗0保持，不能以38或16 checks換算百分比。


## 2026-10-12 中斷後續作與最新直接授權

原對話的最新回覆已授權僅對人工 ID 55582901920、55582483471 進行日期測試，完成後永久刪除。本次完成時間軸及相集頁 UI 日期合併、取消無寫入及 signed Flickr 日期回讀；兩張原 PNG 各自與原 fixture exact bytes 相同。相集日期測試先以 UI 進入含兩張的既有相集，再分開人工日期以測合併；未把單張相集缺入口假造為已導航。兩 ID 已分別由相集照片 UI 與時間軸相集 UI 刪除，signed getInfo error.code=1逐張核對。終態 ledger `.codex-local/qa/20261012-date-delete-1791762685992/ledger.json` 引用前一不可變日期 checkpoint；舊 harness FAILED 保留。沒有新增上傳、相簿、家人媒體或公開性修改。人工圖片既已刪除，禁止再跑原 mutation recheck／upload腳本來重建它們。刪除後等待真實API及完成載入的空狀態唯讀补驗正在進行。

Hank 最新回覆「目前無真機，先完成可獨立進行的工作」。真機必要門檻保持未驗，先完成獨立範圍，不宣稱真機或原完整目標已通過。圖示問題兩次依 Hank 明確指定向對話 01a1242d-dfd9-76b2-886d-61289f36ac9c 詢問；已查明舊照片16120.jpg608×652無H、favicon仍sameJPEG、native placeholder，H選定／正式正方形原稿尚未確定。最新規則以上述直接授權為準，先前待日期刪除授權記錄保留作歷史。

儲存沿用原Timehut工具檢查PASS。上層check_storage的HOLD屬EClaw共用工程GlobalPermissionsEnabled=false，不自行修改掛載或將其套用成Timehut故障。採短工具回應及每一實際寫入後的持久checkpoint避免中斷重做；無法保證外部串流服務不再中斷。


### 本輪接續終態（2026-10-12）

兩人工ID日期／永久刪除與唯讀載入終態已完成，最新R ledger `.codex-local/qa/20261012-date-delete-1791762766937/ledger.json`。獨立固定36criteria審查在 `.codex-local/qa/20261012-acceptance-continuation-review.json`／.md；settings補測10個D/M case通過，僅新增05/4一criteria，設定頁100%，正式功能整體19/36=52.78%，仍低於80；視覺原暫定81–84不倒填正式分。

iOS DEBUG-only QA observer/harness補强已增量建置與managed headless測試；正式TransferEngine/AddOnly隐私規則不改。实际JS保存回傳assetID、拒绝保存保留完整原档、重启收据/assetID保留均通過；resource回讀因PhotoKit授权notDetermined／6秒callback timeout仍BLOCKED，已停止同阻碍重测。`.codex-local/qa/ios-readback-continuation-20261012/summary.json`記來源一致性與lease釋放。舊v28native17為本debug修改前歷史；Android產品source未改，iOS新診斷binding另存。

一般H已由指定對話查明9/27一般APP全專案選定及10/1原生套用授權，不再問逐案選H。三个新正方形無H原稿及既有一般H精確合成提案保存在 `.codex-local/design/20261012-icon-candidates/`；沒有替换旧照片/actual圖示。v3原稿1254平方、H外pixel差异0、12個預測尺寸/遮罩Halpha全保留，独立目视仍HOLD：H像懸浮标志、32px中横不够清楚。自动零裁切不可替代可辨识验收；新底圖仍candidate，实际包／商店／安装图示未通过，未發布。完整prompt在prompts.json。

为真Flickr影片缺口准备既有2秒3572byte无声几何MP4，proposal在 `.codex-local/qa/20261012-video-test-proposal/proposal.json`。已向Hank询问超出人工图片scope的单段影片上传/播放/tags/download及测试后清理授权，答案仍pending；没有上传或其他Flickr写入。Hank无真机的指示保持，真机验收待设备。完整目标未complete，发布HOLD，未push或部署。任何串流中断后先读status与continuation checkpoint，已删两ID不能重传重建。


<!-- TIMEHUT_CONTINUATION_20261017_BEGIN -->
## 2026-10-17 本輪六頁續驗：凍結95.7範圍達標，95.8新工作未納入

Hank 本輪要求照片／相集兩模式都測、原六頁各自80%；無真機項如實未驗、不搶鍵鼠或焦點、先不發布。95.7修正版未發布、未分發新原生包、無OS鍵鼠焦點操作。另對話之後獲Hank直接批准的凍結test.94與exact4人工資料測試屬分開範圍，不構成95.7發布批准，也不重複其live額度。

獨立已呈現視覺（02/03/05/06/07/08）80/81/82/82/83/81，平均81.5；固定原36項本機Web功能35PASS/1NV，未驗0，各頁100/100/100/83.33/100/100%，平均97.22。六頁各自達80，沒有用平均補低分或改權重。此為已驗本機／已呈現範圍，並非完整全狀態／native／正式產品UI E2E放行。

照片／相集及03自身入口的操作trace分開；源95.4長標籤／檔名遮擋、03日期完成舊URL重載、跨書本日期清單及95.6未登入導向的scroll-cache錯誤已經修正、選擇性真實本機HTTP/SQLite/瀏覽器重測並獨立複查。舊FAIL/HOLD保留，不倒填通過。共享設定更新通知被保留，受影響05另四圖補審維持82。

另一核准執行者的production70 exact4 API／Flickr私密與原檔／播放／標籤日期／虛擬相簿／隔離及精確清理，已讀回並獨立有限採信；四媒體與own2帳戶終態已清理，禁止重播。這不是整套95.7 UI/native/phone/full-formal驗收。

剩餘：06/6完整進度/完成/部分失敗/停止恢復仍NV計零；pending-delete在刷新後的恢復仍OPEN；真機回桌面／鎖屏／大影片、完整產品UI E2E、本版實際發布包H與發布批准未齊。完整目標仍未完成，95.7不得據本機分數發布。simplify可選，不是HOLD原因。

最新入口：`.codex-local/qa/20261017-six-page-continued/RESULT.md`、`acceptance-current-95.7.json`、`continuation-checkpoint.json`。依引用獨立報告採信，不改凍結原36項、原圖、舊發布及terminal ledgers；測試SSD、證據新APFS資料區，保留20GiB。

當次最後核對捕獲另一對話新增95.8刪除恢復：album/version及部分account後端已有新差異，未算成95.7已驗。已把實際95.7執行的64份安全來源輸入存證於`.codex-local/qa/20261017-six-page-continued/reviewed-source-95.7/`（無Git/DB/私密config/credentials，僅QA來源紀錄，禁止當部署／新工程）。最新差異在`current-root-boundary.json`。本輪未回退新95.8工作，也不宣稱目前workingroot全已通過。

<!-- TIMEHUT_CONTINUATION_20261017_END -->
