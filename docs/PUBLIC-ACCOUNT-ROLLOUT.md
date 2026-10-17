<!-- TIMEHUT_CURRENT_RELEASE_STATUS_BEGIN -->
## 2026-10-17：目前發布與驗收狀態

Android **test.94 已發布內測**，可覆蓋安裝原測試版：[下載 APK](https://github.com/HankHuang0516/Timehut/releases/download/android-test-2026.10.16-94/HuangJiaXiaoWu-2026.10.16-test94.apk)。13,794,077bytes／SHA256 bcc4f7cd499f1e524a98736f9ad49706bd2ecda157e9cbe707d94a8e526d6108；GitHub prerelease（非latest），官方digest與實際公開下載HTTP200／bytes／SHA一致。source commit7757b77df5e14f062ebde8081f63cf8a6e38f5f3，rootHEAD/index與95開發來源保留、未pushmain。當版實際包19個圖示資源重綁及94mask／安裝後AppInfo再目視，浮水印存在／樣式正確。

Hank直接核准 exact94 單一 gplay dataSync0x1 誤報的內測例外；raw exit1保留，不擴及未來版本或商店提交。94精確工程、原六頁已呈現視覺80/81/82/81/81/82、IME／driver修正與新隔離debug背景均已獨立有界複查。這不是原36功能／每頁兩軸完整通過；實體Android由Hank收到安裝版測、iPhone後補，完整正式仍HOLD。手機清單與發布收據見 `.codex-local/qa/20261017-internal-release94-proposal/`。

新4份人工正式資料測試亦獲直接核准：僅2個臨時普通帳戶、3個App虛擬相簿、凍結3PNG+1兩秒MP4共31,816bytes、最多4個新Flickr ID，完成後精確清理新4媒體與own2帳戶。F1–F5流程問題修正、host故障測試及獨立最終補審已完成；**本輪實際正式API／媒體fixture20check通過且精確清理完成**：4份provider原檔SHA一致、私密／owner／標籤日期／虛擬移入移出讀回、B隔離拒絕、真Chrome解碼及2秒影片播放。4新ID均signednotfound、own2帳戶刪除收據complete且舊會話401。109列hashchain已核對；實際結果見 `.codex-local/qa/20261017-public-provider-live4/live-result.json`，新原生／真機／全產品UI正式加分0。結果未知只讀續查、不重傳或重設預算。舊7人工ID刪除終態、既有家庭照片／原授權不擴及。

正式後端仍1.0.70／2026.10.16.4，網站web.4／75設計基線、預設安裝入口75未更新。本輪未部署後端／整套網站，既有更新授權仍有效；下次部署須重查當下傳輸與持久資料，不能沿用舊空佇列。原持久卷/app/uploads／帳戶SQLite保留；沒有新增Flickr key／OAuth授權、SMTP或更改真實使用者密碼。家庭管理者huanghome2026、支援hankhuang0516@gmail.com與中央Flickr用途核准保留。

新增使用者要求的「所有用戶設定內更新通知」已完成來源候選及隔離卡片測試／59檔打包核對；分平台／安裝管道、已讀去重、未知／失敗不假報。目錄僅列已核對94與web.4，發布目錄工具拒絕未發佈、錯檔與倒退。**尚未部署或包入已發布94**，不繼承凍結95.4全頁畫面驗收；來源獨立複查已PASS（仍只候選），整合/發布次序見 `.codex-local/qa/20261017-all-users-update-notice/integration-plan.json`，不碰私人回饋收件匣。

iOS protocol3 host／HTTP／無簽章編譯為有界證據；最新實際Keychain冷程序仍因兩次管理器admission失敗未開始，待真實健康狀態改變，不盲重試或繞過。沒有IPA分發／商店提交。全域simplify已取消強制，本輪未執行不冒稱通過；其餘H／功能／權限／UI／安全／複查與發布批准保持。完整機器可讀狀態見 `.codex-local/qa/20261016-formal-six-page/formal-acceptance-current.json`，下方歷史文字不覆蓋本節。
<!-- TIMEHUT_CURRENT_RELEASE_STATUS_END -->

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

# 公開帳戶候選的部署順序

2026-10-15 Pages管線最新：`build_pages.py`現在使用完整54檔公開manifest；打包前驗證支援公開帳戶的installer metadata、精確APK bytes、私人照片拒絕及原生帳戶核心JS。候選只可使用明確本機APK，正式版本才可從本專案GitHub Releases URL讀取。預設正式56 metadata保持不動且會被新版流程拒絕，尚未推送工作流程。公開Pages的account.html先轉至正式同網域登入；不在Pages做跨網域登入後再遺失session。

`tools/installer_release.py`集中驗證及產生安裝資訊；舊家庭密碼與錯套舊版背景通過文案已修正。Pages的download指向包內精確APK；後端網站若附帶已核准且已發布的metadata，`build_public_app.py SITE --release-manifest tools/android-release.json`會使用受限的本專案GitHub asset URL，無須在後端建立不存在的downloads檔案。未附帶核准metadata的候選頁隱藏下載，不能冒稱安裝版已提供。這輪修改尚未帶入68 APK；下一包重建後才可發布。

真實Service Worker的同scope接管、快取私密資料排除、清理僅舊Timehut快取、離線公開fallback與實際下載均已驗；不代表真機背景傳輸。已確認官方新SFTP路徑仍要SSH金鑰且直接upload不能取代排他closed-owner receiver。新公鑰待Hank核准登記，尚未改帳戶權限或送出家庭庫；原來的部署授權持續有效，不代表放寬當版複查、非TTY與真正上傳靜止條件。

---

2026-10-15 Android68後續：已產生不含家庭照片的test.68候選，修正當前帳號上傳者標籤及晚到登出UI回應；SDK26／36保留資料65→68及入口／安裝後H核對通過，完整68背景／正式登入仍未驗。最新79檔後端已重新綁定目前JS，實際8組及網站15組通過，清單為`.codex-local/qa/20261015-android-installer68/backend-source.json`。本候選未分發，正式test.56／1.0.64／註冊關閉不變，當版獨立審查仍缺。

---

2026-10-15 最新阻擋更新：原80檔後端及Android65候選混入私人家庭照片／引用，已取消發布資格，保留原件及歷史證據。新候選為25個後端加54個公開網站檔，共79檔；實際79檔後端8組、網站15組及帳戶入口9組測試通過，無正式provider寫入。三個頁面頭像使用既有含正確H的圖示；不再公開家庭照片。最新清單在`.codex-local/qa/20261015-ios-account-bridge/backend-private-clean-source.json`。

家庭管理帳號固定huanghome2026，私密closed DB不重建。非TTY傳輸及正式接收中的上傳靜止狀態仍未確認，不能因status回0或queue檔缺失判斷安全；現有正式1.0.64／test.56／註冊關閉不變。舊Pages選檔已移除私人config及照片，但仍待補齊目前公開頁面的依賴，不能宣稱發布管線已完成。獨立複查先前遭自動安全拒絕，未重試或改用其他審查繞過。

---

2026-10-15。候選後端為1.0.65／2026.10.15.1，Node24.22.0。這份文件記錄已驗證的包體與後續操作順序；正式服務、正式帳戶與公開註冊尚未變更。既有部署授權有效，當版獨立複查仍因先前恢復審查工具遭自動安全拒絕而未完成。

## 包體與路徑

`tools/package_public_backend.py` 產生平鋪的Railway部署目錄：25個後端／設定檔及55個公開網站檔，共80檔。逐檔清單與SHA保存在包外的`backend-source.json`；沒有`.env`、`js/config.js`、憑證、uploads、資料庫或node_modules。部署既有Timehut專案／Timehunt服務，不能建立替代服務或卷。

部署根目錄維持`/app`，程式相對`uploads`，沿用既有持久卷`/app/uploads`；帳戶庫位於其`.accounts`。既有`.preserved-production-originals`兩份原件、舊佇列及OAuth設定保留，不能放進公開包、重傳或以空目錄替代。

部署包內可直接執行`node bootstrap_legacy_owner.cjs`。原工程入口`tools/bootstrap_legacy_owner.cjs`仍可使用，兩者執行同一份程式；不需要改寫匯入路徑或對外建立管理者的API。

## 私有管理者初始化

指定名稱為`huanghome2026`，支援信箱不當成登入或管理者授權。家庭輸入只含已確認的孩子名稱、生日及原數字相簿ID。本機真實輸入與初始密碼已準備；不在對話、環境變數、命令列、QA或部署包保存密碼。工具要求私密普通檔及非TTY繼承描述符，拒絕同名普通帳戶冒領、重新綁定或覆寫已建立的密碼。

已在已驗證APFS私有區用Node24完成保留／建立，再關閉資料庫，待將這份新且完整的私有帳戶庫移交既有服務卷。這讓正式舊Node18容器不必執行SQLite初始化，也不用把明文密碼送到服務端。資料位於`.codex-local/private/owner-bootstrap-huanghome2026/`，不是QA：0700目錄、0600檔案；隨機32-byte初始密碼僅存`initial-password.txt`，不在對話傳送。不得重新執行prepare來覆蓋或重新產生帳戶；以`tools/prepare_private_owner.cjs status`讀取已驗證的最小狀態。

輸入來自現行網站設定的AST資料節點，沒有執行舊程式；只認可單一CONFIG資料宣告及精確的歷史CommonJS匯出外殼，拒絕其他執行式／getter／重複或計算屬性。只保留名稱、生日與原相簿ID，原設定／密鑰／舊家庭密碼不落盤。兩個原相簿以現行後端signed metadata只讀確認owner與目前Flickr帳戶一致，未下載媒體或寫入Flickr。現行後端身分／版本變更或無法確認時，工具在建立私有資料前停止。

私有新庫已驗證完整角色／家庭對應、實際本機登入及登出、零sessions／media／receipts、SQLite quick_check與單一關閉檔；移交前改為DELETE journal，避免只讀檢查又產生WAL／SHM，並保留FULL同步／secure_delete。真實新庫沒有送往正式服務。人工副本已逐byte排他複製到隔離卷路徑，拒絕覆寫，實際啟動同80檔後端並驗證管理者登入／家庭context／登出與註冊暫停；來源庫及兩份人工保留原件不變。這不是實際Railway傳輸收據，正式傳輸方式與停寫窗口仍待驗證。

移交前重新檢查正式目標：如果`.accounts`已存在或有未知內容，就保留並調查，不以新庫覆蓋。建立新目標須排他且逐檔拒絕覆寫；中斷留下的部分資料保留處理，不直接刪掉重做。原私有資料庫及憑證仍保留，不把它們當QA清理。真正執行時須重新確認沒有正在上傳的工作，不能沿用歷史佇列為0的紀錄。

## 關閉帳戶庫的移交工具與目前限制

`tools/closed_owner_transfer.cjs`是未發布的操作工具，與80檔公開後端包分開。它只接受已關閉的DELETE-journal SQLite普通檔；來源密碼不在傳輸內容之外另行傳送。目標須是canonical普通目錄，核對卷device／inode與Railway project／service／environment身分；佇列須是可讀普通JSON檔且沒有待處理或未知狀態。缺失、格式錯誤、連結或變動的佇列均拒絕，不建立空佇列取得通過。

工具先排他建立0700私有目錄及0600暫存／pending檔，回覆READY後才接收有限長度的資料；逐byte計算SHA、核對SQLite頁面／journal標頭，重新檢查目標與佇列，再以排他hard link發布`accounts.sqlite`及持久化收據。既有目標、競爭產生的資料庫、中斷或不符的部分檔案都保留，不覆寫或刪除後重試。接收端只驗證檔案完整性；可信家庭角色仍由來源的準備狀態及新服務開庫確認，不能以傳輸成功冒稱已完成角色驗收。佇列快照一致也不等同整個服務沒有進行中HTTP上傳。

11組人工資料檢查通過：分段傳輸、包內Node24實際SQLite角色／登入、既有檔案／目錄／失聯連結、忙碌／未知／缺失／損壞佇列、目標與服務身分、長度／SHA／標頭／WAL／串流錯誤、發布競爭、實際子程序READY順序與傳輸中SIGKILL保留。這些測試沒有讀取真實家庭新庫。現行正式Node18已唯讀載入同SHA工具，驗證合法／WAL標頭與TTY拒絕；沒有接收真實帳戶庫或建立`.accounts`。

實際Railway CLI連線即使本機使用pipe，遠端stdin／stdout仍為TTY；工具在READY和私有寫入前拒絕，不能直接經此連線傳送私有庫。既有SSH key清單查詢失敗，本機沒有公開key檔；沒有新增或改動金鑰／安全設定，也不能把失敗查詢當成服務端沒有key的證明。安全的非TTY移交通道仍未確認。

2026-10-15 07:29 UTC的正式唯讀觀察：來源SHA與1.0.64精確部署快照相符，`queue.json`不存在，status為0筆且`isProcessing=false`。已核對原版`readQueue()`會把缺失檔案回傳空陣列，而接收multipart的Multer不提供該status可見的進行中計數。因此本次不是全域停寫或可部署證據，接收工具的缺失佇列拒絕仍保留。`.accounts`仍不存在，卷與`.preserved-production-originals`未修改。後續須先確認可用移交通道及真正的接收／處理停寫窗口；不可用建立空檔、延用零筆結果或弱化拒絕來替代。

完整來源與證據：`.codex-local/qa/20261014-android-background-and-registration/owner-transfer-latest-bindings.json`。本輪只新增內部文字操作工具，沒有建立／發布新包體；icon檢查不適用於這些內部工具，不能取代下一次實際發布產物的H自檢。當版獨立複查仍因先前恢復審查工具遭自動安全拒絕而未完成，沒有重試、改寫要求或另找審查者繞過。

## 開放與暫停新註冊

| 設定 | 作用 |
|---|---|
| `TIMEHUT_PUBLIC_REGISTRATION=true` | 啟用帳戶、工作與媒體隔離；必須有可信任的家庭管理者資料 |
| `TIMEHUT_ACCEPT_SIGNUPS=false` | 只暫停新註冊，既有登入、登出、帳戶及媒體隔離繼續運作 |
| `TIMEHUT_ACCEPT_SIGNUPS=true`或未指定 | 在帳戶模式下接受新註冊 |

先在既有卷完成私有初始化，以帳戶模式啟動候選並暫停新註冊。核對實際Node版本、80檔來源、持久卷、原件、管理者登入及原家庭只讀內容，再以同一審核來源開放新註冊。公開安裝入口及Android分發包另依其實際包體、簽章、H與驗收紀錄更新。

一旦有`.accounts`（含失聯連結）或帶使用者歸屬的舊收據，關閉帳戶模式會在服務開啟前失敗。這是保護資料，不能刪除資料或移除判斷來恢復服務。需要暫停註冊時只改`TIMEHUT_ACCEPT_SIGNUPS`；不關閉隔離。帳戶資料建立後，不能退回不懂隔離的1.0.64或舊API；保留當下資料，修正設定或以維持隔離的審核版本處理，不覆蓋資料庫。

## 目前證據與界線

- test65分發型候選尚未發布。最新DEBUG QA66／67的51份主來源與test65相同，通過有界背景／帳戶／家庭／取消及兩個獨立OS冷啟撤銷個案；正確／錯誤ACK案各自保留baseline（3筆／2筆）及新B，兩案間有精確人工subset維護，不能稱為同baseline連續重試。舊accountqa原三個受保護檔在全部六階段均不變；SDK26只算舊WebView指引／相應有界測試。SDK36 Settings SPA的QA安裝後圖示身分仍未確認，QA66／67不分發；詳細來源及失敗見`native67-regression-latest-bindings.json`。
- 原生家庭流程再對接1.0.65本機根後端／SQLite：數字相簿一次建立及一次membership、MOV切換App／鎖屏下載、保存與B隔離通過；沒有正式Flickr操作或WebView解碼通過宣稱。
- 根HTTP32組、管理者工具11組及實際部署包8組檢查通過。第8組使用人工的單一關閉帳戶庫，核對排他移交與真實包內服務。包體以真正Node24程序啟動，驗證SQLite、註冊暫停、保留既有登入及隔離、禁止退回舊API、缺失管理者與失聯連結；測試程序禁止供應者連線。私有輸入另有24項拒絕執行／格式／歸屬控制，準備流程另有6組私密權限、登入／關閉、既有／中斷保留與資料變更拒絕檢查。
- 傳輸與離線頁補上明確favicon，避免部署在`/app/`時依賴站台根目錄的預設圖示。候選80檔中的4個實際圖示及12頁引用重新自檢；Android QA64的原生根路徑及主包未改，未把兩個favicon標籤改動算成新的原生功能驗證。
- 真機／OEM、iOS帳戶整合、正式矩陣缺項與當版獨立複查未完成；本文件不是上線、商店提交或完整驗收收據。
