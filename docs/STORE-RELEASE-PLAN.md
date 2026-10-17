<!-- TIMEHUT_CURRENT_RELEASE_STATUS_BEGIN -->
## 2026-10-17：目前發布與驗收狀態

Android **test.94 已發布內測**，可覆蓋安裝原測試版：[下載 APK](https://github.com/HankHuang0516/Timehut/releases/download/android-test-2026.10.16-94/HuangJiaXiaoWu-2026.10.16-test94.apk)。13,794,077bytes／SHA256 bcc4f7cd499f1e524a98736f9ad49706bd2ecda157e9cbe707d94a8e526d6108；GitHub prerelease（非latest），官方digest與實際公開下載HTTP200／bytes／SHA一致。source commit7757b77df5e14f062ebde8081f63cf8a6e38f5f3，rootHEAD/index與95開發來源保留、未pushmain。當版實際包19個圖示資源重綁及94mask／安裝後AppInfo再目視，浮水印存在／樣式正確。

Hank直接核准 exact94 單一 gplay dataSync0x1 誤報的內測例外；raw exit1保留，不擴及未來版本或商店提交。94精確工程、原六頁已呈現視覺80/81/82/81/81/82、IME／driver修正與新隔離debug背景均已獨立有界複查。這不是原36功能／每頁兩軸完整通過；實體Android由Hank收到安裝版測、iPhone後補，完整正式仍HOLD。手機清單與發布收據見 `.codex-local/qa/20261017-internal-release94-proposal/`。

新4份人工正式資料測試亦獲直接核准：僅2個臨時普通帳戶、3個App虛擬相簿、凍結3PNG+1兩秒MP4共31,816bytes、最多4個新Flickr ID，完成後精確清理新4媒體與own2帳戶。F1–F5流程問題修正、host故障測試及獨立最終補審已完成；**本輪實際正式API／媒體fixture20check通過且精確清理完成**：4份provider原檔SHA一致、私密／owner／標籤日期／虛擬移入移出讀回、B隔離拒絕、真Chrome解碼及2秒影片播放。4新ID均signednotfound、own2帳戶刪除收據complete且舊會話401。109列hashchain已核對；實際結果見 `.codex-local/qa/20261017-public-provider-live4/live-result.json`，新原生／真機／全產品UI正式加分0。結果未知只讀續查、不重傳或重設預算。舊7人工ID刪除終態、既有家庭照片／原授權不擴及。

正式後端仍1.0.70／2026.10.16.4，網站web.4／75設計基線、預設安裝入口75未更新。本輪未部署後端／整套網站，既有更新授權仍有效；下次部署須重查當下傳輸與持久資料，不能沿用舊空佇列。原持久卷/app/uploads／帳戶SQLite保留；沒有新增Flickr key／OAuth授權、SMTP或更改真實使用者密碼。家庭管理者huanghome2026、支援hankhuang0516@gmail.com與中央Flickr用途核准保留。

新增使用者要求的「所有用戶設定內更新通知」已完成來源候選及隔離卡片測試／59檔打包核對；分平台／安裝管道、已讀去重、未知／失敗不假報。目錄僅列已核對94與web.4，發布目錄工具拒絕未發佈、錯檔與倒退。**尚未部署或包入已發布94**，不繼承凍結95.4全頁畫面驗收；來源獨立複查已PASS（仍只候選），整合/發布次序見 `.codex-local/qa/20261017-all-users-update-notice/integration-plan.json`，不碰私人回饋收件匣。

iOS 最新95.9網頁與原生client（含本人刪除狀態GET）已完成Xcode27.1 Debug／generic Simulator及未簽章Release／generic iOS編譯。問題回饋既有收集補列CustomerSupport用途，修正後兩包均包含七類清單；63個公開資源、三份隱私宣告、私有檔排除與當版實際PNG／H範圍已核對。來源圖示原本已正確，本輪未換圖；沒有安裝主畫面或商店圖示credit。獨立複查另以 `.codex-local/qa/20261017-ios-current95-9-preflight/independent-review.json` 為準。最新實際Keychain冷程序仍因先前兩次管理器admission失敗未開始，待真實健康狀態改變，不盲重試或繞過。沒有IPA分發／商店提交。全域simplify已取消強制，本輪未執行不冒稱通過；其餘H／功能／權限／UI／安全／複查與發布批准保持。完整機器可讀狀態見 `.codex-local/qa/20261016-formal-six-page/formal-acceptance-current.json`，下方歷史文字不覆蓋本節。

### 下一階段發布與雙平台安排

1. 最新候選為 Android test.95 R4、網站95.9、後端71，精確檔案／SHA／來源與本輪有界複查見 `.codex-local/qa/20261017-android-installer95-r4/HANDOFF.md`。R3歷史證據保留，不能當R4的實測；R4仍未發布。正式後端／網站依既有授權與唯一發布窗口處理，先重新確認當下上傳及持久資料，再部署精確包並讀回線上版號／下載內容。
2. Android先收Hank實機切換App、鎖屏上下載回報，再處理原六頁兩軸及產品頁面／實際Flickr的未驗流程；原四份人工資料額度已消耗並清理，不重建既有十一個已刪ID。95的官方掃描原始錯誤與已複查本機修正版分開記錄，94單版例外不套到95或商店。
3. Google Play先準備正式套件與簽章、測試軌道資料、安全／隱私回答、實際畫面截圖及測試者安排；內測APK不等於商店AAB已完成。完成當版適用檢查後，依明確的軌道與提交授權操作；目前不建立商店版本或上傳。
4. iOS接著補真實Keychain／原生介面、Photos保存、背景／鎖屏與實體iPhone驗收，再準備簽章archive、隱私報告、審查帳戶及App Store／TestFlight資料。現在的1.0/build1未簽章包只供本機核對，不能提供給使用者安裝。
5. 中央Flickr用途核准、家庭管理者及支援信箱沿用已確認設定；服務商日誌／備份／處理地區、完整正式驗收與未來分發當版H仍須核實。上架目前為準備計畫，尚未授權任一商店提交或商店正式發布。

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

# 黃家小屋：公開註冊與雙平台上架計畫

2026-10-15網站準備補充：安全公開Pages管線、實際APK下載、同網域登入入口與PWA離線／快取排除測試通過。安裝指引已改為個人帳戶，不再把舊版背景測試套到新包；68候選尚未帶入本輪文案與PWA修改，下包仍須重建、H及背景測試。沒有發布、開啟註冊或商店提交。SSH登入公鑰登記另待明確授權，正式部署既有授權未撤回，獨立複查缺口仍保留。

---

2026-10-15 Android68後續：替代舊65的非DEBUG測試候選已建好；包內／SDK26與36安裝後H核對、已知65保留資料升級及登入／WebView指引通過。使用既有測試憑證，仍不是商店簽章；完整68背景傳輸、正式帳戶與當版獨立複查未完成，未發布、未送審。不得把QA67的舊背景測試當成本包完整通過。

---

2026-10-15 最新進度：雙平台仍只做上架準備，未送審。新版公開檔案已移除私人家庭照片並有打包拒絕防護，原Android65候選取消發布資格，需要重建及當版背景測試／H自檢。iOS原生帳戶橋接已接通並有歷史11階段實際WebView功能證據，最新57檔公開資源包尚未重裝執行；原生AppIcon為預設圖、缺選定H，禁止分發。正式家庭帳號匯入、Node24啟用、公開註冊、完整Photos／背景鎖屏／真機及當版獨立複查均仍未完成。

---

2026-10-15 更新。這是準備與驗收計畫，尚未提交商店、建立商店版本或開啟正式註冊。照片先存到 Hank 現用的中央 Flickr 帳戶；使用者以黃家小屋自己的帳號登入，新帳戶從空白相簿開始。既有家庭相簿只交給 Hank 指定的管理者，Hank 已指定管理者登入名稱為 `huanghome2026`；私有新庫已在本機建立、確認兩個原相簿歸屬並完成本機登入／登出，尚未移交／啟用於正式服務。初始密碼僅保存在私有檔案，不在對話索取或傳送。

Hank 已在本對話確認取得「公開註冊者的照片集中存入同一帳戶」這個用途的核准；沿用該方案，不要求一般使用者另做 Flickr OAuth。這是使用者提供的核准資訊，未冒稱已獨立查閱供應者文件。公開支援與隱私聯絡信箱已指定為 `hankhuang0516@gmail.com`。

| 項目 | 目前證據 | 提交前需完成 |
|---|---|---|
| Android 背景傳輸 | 與test65相同51份主來源的DEBUG QA66／67，已通過Android16桌面／其他App／鎖屏雙向PNG、實際本機後端MOV、取消／重開，以及OS冷啟正確／錯誤ACK兩個獨立個案；各包與fixture修訂分別綁定 | test65實際非DEBUG包對啟用後服務的完整端到端、真機／廠牌省電及正式系統終止矩陣；人工與模擬器結果不代替正式驗收 |
| Android 包體 | min24、target36；已另建非DEBUG、testing身分的test65候選；QA64保留為先前功能證據 | 商店仍需正式 applicationId、既有安全保存的正式簽章與 AAB；不能把testing候選APK上傳商店 |
| Android 版號／簽章 | 公開安裝仍test56；test65候選已核對同簽章、實際覆蓋安裝與有界release檢查，未分發 | 完成新包傳輸功能回歸、後端部署及當版獨立複查後更新入口；商店identity／versionCode另核對 |
| 後端部署 | 1.0.65平鋪80檔包、Node24本機啟動、SQLite、註冊暫停與禁止舊API回退驗證通過；huanghome2026私有庫已在APFS建立並關閉，未上傳 | 正式卷的排他移交、原件／佇列／授權核對、Linux執行驗證、當版獨立複查及實際部署 |
| iOS 帳戶整合 | Keychain格式2、client、引擎固定owner／issuer與上傳SHA／metadata／admission續查；host引擎56、儲存125、HTTP61項。同一隔離安裝包4個PID／30項：68-byte PNG回覆遺失後1次POST續同收據，及原圖下載／切換／重開 | 持久OS撤銷／未收到token的結果協定、WebView原生帳戶分支、完整Photos／背景鎖屏／大影片／正式TLS與真機仍待完成；小PNG協定證據不是完整公開帳戶或背景驗收 |
| iOS 保存與背景 | 已有 background URLSession 與 Photos add-only 實作；較早的 Photos resource readback 仍有逾時紀錄 | 真機鎖屏／大影片／系統終止、保存回讀與拒絕權限流程；不能用 Android 的結果替代 |
| iOS 打包 | 本機 Xcode27；專案 deployment target15、bundle id tw.aihankapps.timehut；仍為1.0/build1開發設定 | 新的實際 Release archive、正式簽章、遞增版號與 App Store validation；不重設或另建既有 bundle identity |
| 帳戶與資料刪除 | 人工 HTTP／SQLite 驗證整戶清除、狀態收據、未知上傳保留核對、單張刪除與防重傳 | 公開後端、App 內及無須重裝 App 的網頁實際端到端驗證，明確顯示處理進度與保留政策 |
| 隱私／支援 | 候選 `privacy.html`、`support.html`、`delete-account.html` 已有指定信箱、資料流程與保留說明，帳戶／設定頁可進入；瀏覽器刪除意圖、密碼再驗證、登出後查詢及320／390／1440排版有隔離證據 | 正式部署後從 App 與外部瀏覽器核對實際 URL；完成實際地區／服務商備份保留盤點。頁面仍有開放前提示，不能把候選當已發布或已通過法律／商店審查 |
| Flickr 用途與額度 | 中央儲存用途由 Hank 確認已有核准；已讀官方 API／權利／Free限額文件，沒有登入供應者或更改帳戶 | 現用帳戶方案、實際額度／API用量仍須按實際帳戶核對，不從核准資訊推定 Pro 或任何商用 key。若未來收費／廣告，另核對適用 API 商用範圍 |
| iOS privacy manifest | 六類收集用途與target資源在實際包內；原生帳戶控制檔新增實際fstat，已補FileTimestamp／C617.1並核對Release程式及Debug真正dylib匯入。新unsigned Release／隔離Debug編譯及三份manifest／58網頁核對通過，GPS原檔資料明列 | 正式archive／Organizer privacy report、服務商實際IP／日誌／備份用途、最終二進位與ASC回答仍需驗證；不沿用前一版accessed API空陣列。詳見IOS-PRIVACY-INVENTORY.md及IOS-NATIVE-ACCOUNTS.md |
| 圖示與素材 | test65當時實際原生15PNG／網頁圖示／安裝顯示，以及後端65實際4網站圖示／12頁明確引用／32-48-64與遮罩目視：「浮水印存在／樣式正確」。DEBUG QA66／67的SDK36安裝顯示身分未確認，未分發 | 最終分發／商店實際包與各語言／平台再自檢；本輪iOS unsigned內部編譯未作分發H放行，沒有商店圖示上傳或iOS完整驗收宣稱 |
| 商店文案與畫面 | 尚未建立完整上架 metadata 目錄、商店頁或可提交截圖 | 以人工帳號／媒體製作實際使用截圖；名稱、說明、格式與背景限制符合實作；不使用家庭私照或測試憑證作商店素材 |
| 原始驗收 | 正式33/36，第06頁66.67%；本機與模擬器結果另存 | 逐頁／兩軸至少80%及缺少的06/2、06/6、08/6證據；獨立複查，不能用新增人工組數代替正式通過 |

直接下載安裝版與商店版本分別驗收：新版測試安裝版須沿用已發布 `tw.aihankapps.timehut.testing` 的簽章與資料，才能覆蓋 test56；`.accountqa` 只供本機隔離驗證。Google Play／App Store 的正式 package／bundle identity 另核對既有登記，不用改包名或重建帳號來取代核對，也不清除既有安裝資料。

最新工程證據分別見 `native67-regression-latest-bindings.json`、`owner-transfer-latest-bindings.json`與`ios-upload-admission-latest-bindings.json`；早期iOS隱私／儲存各輪綁定亦保留。部署與私有初始化順序：`PUBLIC-ACCOUNT-ROLLOUT.md`。上述JSON均在主QA目錄中。下方舊輪附錄保留當時範圍，不代表目前包體或已發布版本。

執行順序：

1. test65是待分發的非DEBUG候選，DEBUG QA66／67以相同51份主來源完成有界核心回歸；Android16正確／錯誤ACK是各自保留baseline（3筆／2筆）及新B的兩個獨立OS冷啟個案，兩案間有精確人工subset維護，不能稱為同一baseline連續重試。舊accountqa三個受保護檔均不變。完整限制見 `native67-regression-latest-bindings.json`；仍須test65實際公開後端端到端、真機矩陣及當版獨立複查。手動「強制停止」不承諾在重新開啟App前自動恢復。
2. 管理者名稱已指定 `huanghome2026`；完成可信任的舊家庭資料導入與歸屬；一般註冊不能取得家庭權限，也不能因知道名稱就先註冊冒領。中央 Flickr 用途已有 Hank 確認核准；現用帳戶與 API key 的方案、配額／用量另按實際狀態核對，不向一般使用者要求個別 Flickr OAuth，也不擅自聯絡供應商。
3. 按 `PUBLIC-ACCOUNT-ROLLOUT.md` 準備私有管理者與封閉的資料庫移交，核對1.0.65的80檔清單／Node24／既有卷及原件，確認無正在上傳且獨立複查完成後，沿用既有部署授權切換。初期保留帳戶隔離、只暫停新註冊；不得以關閉帳戶模式或退回舊API回退。正式環境尚未啟用新註冊。
4. 隱私、支援及帳戶刪除候選頁面已補齊指定信箱與流程；發布時按實際服務狀態更新開放前提示，再更新 Android 安裝版。候選入口為正式後端 `/app/account.html`，政策／支援／刪除說明依序為 `/app/privacy.html`、`/app/support.html`、`/app/delete-account.html`；需部署後實際核對可登入、提交刪除、查詢進度及不用重裝，目前不宣稱候選網址可用。test65及DEBUG QA66／67的58個包內網頁資源依各自版號metadata與manifest綁定；下一個分發包仍須安全同步及按實際包驗收。
5. 完成 iOS 第一方帳戶整合、原生驗收及 archive，再以實際已核對的商店 package／bundle id 準備兩平台內測。建立測試者或上傳內測屬後續商店動作，本計畫沒有執行。
6. 以人工審查帳號及媒體、實機操作錄影、用途、登入步驟、外部服務（Railway、Flickr）、地區差異與適用監管項目整理審查備註。憑證只在安全位置處理，不寫入工程、文件或對話。最後整理資料安全／App Privacy、年齡分級、正式截圖及實際當版 H 自檢，再辦理商店提交。

平台規範核對（2026-10-15）：

- Google Play 的新 App／更新自2026-08-31起須 target API36；目前測試包 target36，只代表這項版號條件，並非整體提交通過。[官方 target API 規定](https://support.google.com/googleplay/android-developer/answer/11926878)
- Apple 目前要求上傳使用 Xcode26或以上、對應 iOS26 SDK或以上；本機 Xcode27 仍需以實際 archive 確認使用的 SDK與簽章。[Apple 最新提交要求](https://developer.apple.com/news/upcoming-requirements/)
- 提供註冊時，App 內需可提出帳戶刪除；Google 還要求 App 外可用、容易找到的網頁入口，不能要求先重新安裝。政策須如實說明刪除進度、服務商資料清除與必要保留範圍。[Apple 5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage)、[Google 帳戶刪除要求](https://support.google.com/googleplay/android-developer/answer/13327111)
- 目前只有自己的帳號／密碼登入，沒有社群登入；Apple 4.8 的第一方帳戶例外適用範圍應在審查備註說清楚。若將來加入其他登入服務，需重新核對。[Apple 登入服務規則](https://developer.apple.com/app-store/review/guidelines/#login-services)
- 照片、影片、標籤、生日、帳戶識別及收據會依功能在裝置、Railway 與 Flickr 處理；Data safety／App Privacy 應按實際用途與服務商角色逐項申報，尚不能直接填「不收集／不分享」。單張刪除保留必要防重傳收據，整戶刪除則須等待不明上傳結果核對與資料清除完成；未確定的備份期限不能承諾立即全局清除。

最新包的離線 gplay 預檢保存於 `.codex-local/qa/20261014-android-background-and-registration/store-plan-preflight-cancellation-20261015/`，先前各包報告亦保留。DEBUG 測試 APK 為明確上架阻擋；另有掃描器把 typed `dataSync=0x1` 當文字類型並推導出不存在的 `FOREGROUND_SERVICE_0X1`。已保留原報告，另用官方 aapt2 與 SDK ServiceInfo 常數核對本包實際為 dataSync(1) 且具有 FOREGROUND_SERVICE_DATA_SYNC。這是有界人工核對，不是放行正式包或修改掃描器結果。metadata 未掃描及尚未讀取商店狀態也明列保留。

2026-10-15 管理帳號初始化準備：

- 本機管理工具 `tools/bootstrap_legacy_owner.cjs` 分為 status／reserve／provision；沒有對外的管理者建立路由。只有保留記錄的同一名稱與 binding ID 可在本機建立新的家庭身分，不能採用既有普通註冊者、重設已建立密碼或更換歸屬。公開模式啟動前必須有資料庫內已完成的綁定；單設環境中的使用者 ID 不能授權。
- 真正執行前保持註冊 OFF，複查當下佇列及原件保存、服務版本與資料庫來源。家庭私密輸入只能包含必要的 name／birthDate／原 numeric albumId；使用非連結且權限0600的獨立 JSON，不能把含 Flickr 金鑰的 config 或環境秘密複製到 QA、文件或公開包。現有家人圖片、相簿與授權不由此工具改動。
- `reserve` 以指定的 `huanghome2026` 建立保留；`provision` 由本機管理流程的私密繼承描述符提供密碼（`--password-fd`），拒絕命令列明文密碼與會回顯的終端。工具只回報狀態、綁定 ID／使用者 ID 與家庭筆數，不回傳密碼、孩子名稱或生日。此輪只以人工輸入測試；沒有執行正式保留、建立帳戶或讀取正式家庭 config。
- 原相簿編號與帳戶歸屬在同一交易中建立；碰撞整筆撤回。家庭生日與相簿日期同時更新。原家庭讀取仍走原供應者相簿，新註冊者使用隔離虛擬相簿；家庭新上傳有私密帳戶收據並加入原相簿，加入失敗後沿用既有照片 ID 續辦。此輪操作工具11組、實際掛載後端32組、瀏覽器15組與資料庫／刪除回歸通過，均為人工服務證據。完整歷史媒體、搜尋、影片與實際家庭移轉尚未驗收。
- 生產切換與回退前仍須當版獨立複查、實際來源／Node24部署確認、既有工作保留與圖示檢查；新增帳戶資料後不得直接退回會繞過隔離的舊公開 API。遇到未確認結果保留當下資料庫與原檔，先關閉新註冊／寫入並依具體來源與收據調查，不以舊空資料庫覆蓋新資料。

證據：`.codex-local/qa/20261014-android-background-and-registration/owner-bootstrap-latest-bindings.json`。先前未回覆名稱的段落屬歷史狀態；本次名稱已收到，正式註冊仍 OFF。獨立複查恢復曾被自動安全檢查拒絕，未重試、未繞過、未宣稱當版通過。

2026-10-15 原家庭媒體整合續作：

已完成本機候選的原相簿列表、完整分頁搜尋、影像／sizes代理與歷史影片播放／原檔下載。連結綁目前登入，讀取前核對中央帳戶與指定原相簿，登出後停止舊連結及進行中內容；一般帳戶不能使用家庭連結。原相簿數字編號已接通表單與本機收件紀錄，重整後同一原檔回原收據；修前失敗有保留。搜尋影片視窗已接共用播放器並在關閉時停止。

家庭HTTP10、實際瀏覽器6、掛載後端32、最新網站原頁面15組與一般帳戶回歸通過；瀏覽器使用本機生成的1秒影片，MP4可解碼並推進，MOV下載逐byte一致。這不代表實際家庭資料已匯入、大量正式資料速度、真機或iOS通過。最新網站還沒重包原生，後續先同步QA包再驗；既有test56、正式後端及註冊OFF不變。當版獨立複查仍不可用，沒有商店或發布動作。

API原始文件：[相簿及分頁](https://m.flickr.com/services/api/flickr.photosets.getPhotos.html)、[照片所屬相簿](https://m.flickr.com/services/api/flickr.photos.getAllContexts.html)。使用中央帳戶的全域搜尋不能替代應用程式的相簿隔離，候選轉接由指定相簿逐頁查找；官方[搜尋文件](https://www.flickr.com/services/api/flickr.photos.search.html)另列其查詢範圍與限制。實際大相簿延遲尚未量測。證據：`.codex-local/qa/20261014-android-background-and-registration/family-media-latest-bindings.json`。

2026-10-15 Android QA60續作：最新公開網站已入包，實際Android16模擬器的桌面／其他App／鎖屏雙向14.5MB、家庭原相簿角色／上傳、16.8MB MOV下載及MediaStore一致性通過；同SHA原生／網頁／安裝圖示H已目視。保留260筆工作下重現並修正進度全表寫入與逐筆帳戶重讀的效能問題，沿用原完成時限。

目前仍HOLD：取消／程序重開揭露SHA-only帳戶寫入intent沒有完整目標時，既有保護會封鎖登入。原加密檔與標記完全保留，沒有移除或重設；須先完成安全的中斷寫入恢復及當版重驗。這是產品恢復缺口，不可用已通過背景／H取代。實際QA60是DEBUG/accountqa，不是商店或分發包；test56未更新、正式註冊未啟用。尚無Android WebView家人影片解碼、真機／OEM、iOS或完整正式矩陣通過。當版獨立複查亦未取得。證據：`.codex-local/qa/20261014-android-background-and-registration/native60-latest-bindings.json`。


## 2026-10-15 Android QA64：登入中斷恢復與本版回歸

候選主 APK `b9895713e305adda179331a86e71af1e87b519ded0b339f41a75e7f9ff208992`（DEBUG `.accountqa`、build64）已通過 Android16 管理下模擬器的原14,493,799-byte上下載、回桌面／其他App／熄屏+鎖定持續增量、原70秒完成窗、MediaStore原檔與重開收據；原家庭角色／數字相簿對接實際本機根後端與SQLite，16,780,735-byte MOV背景下載、保存、切換B空白及舊連結失效通過。這些均用人工資料，沒有正式Flickr寫入，不算真機或正式矩陣；SDK26背景只算舊WebView更新指引。當版帳戶頁、媒體發布六個切換／登出邊界、401生命週期、原生帳戶請求、鎖屏Keystore、IO／到期／篡改／滿額／嚴格ACK及6秒看門狗、已開始工作的取消與重開均通過。不同測試APK修訂分別綁定，不能說全套同一instrumentation APK。

登入儲存改先寫完整加密before／after紀錄，再發布帳戶檔。恢復先保留原加密檔與標記，再持久化可重入的關閉登入計畫；所有可辨識憑證仍按原issuer等待撤銷，不回復舊登入、不假稱遠端確認。原本出錯的SDK36檔／32-byte標記逐位元保留並在QA61恢復，保留14筆待撤銷；同一份資料繼續QA64，未重置。18項人工中斷／恢復／缺金鑰／篡改／24筆滿額及新PID檢查在SDK26／36通過（QA62；兩個恢復實作檔與本版完全相同）。尚未完成真正電源中斷或本版自動冷啟OS撤銷工作；舊OS測試器要求空佇列，不能用來清除或忽略現在保留的未知收據。準備檔尚未完整時的新憑證結果仍未知，只恢復本機關閉狀態並保存部分加密原件。

大量舊任務下，切換帳戶原先逐筆讀Keystore；現在持有帳戶鎖，批內使用一次新讀的授權狀態，每筆仍核對有效期，結尾再重新讀世代。本版318筆保留資料下的原生登入橋接實測1,007ms；沒有加長12秒橋接或70秒傳輸門檻。測試等待實際登入頁完成，再載入完整傳輸頁；不在缺CONFIG的帳戶頁注入傳輸UI。本輪錯誤的手動資產覆蓋曾漏掉Capacitor core，失敗保留，QA64改回安全同步並逐檔核對12頁core均在帳戶初始化前。

修正8頁仍指向16120.jpg的頁籤／觸控圖示，家庭圖片本身未改。先前四圖示像素檢查沒有涵蓋這些舊引用，其範圍不足已記錄；本版重新查全部12頁引用、包內15PNG／4網頁圖示、32／48／64遮罩與密度、同SHA安裝後顯示，目視結論「浮水印存在／樣式正確」。真正無H原圖與指定H重新核對，H區外像素差0，沒有改構圖或alpha；不聲稱小尺寸清楚辨字。

QA維護只對有人工任務歸屬、synthetic_憑證與已結束可獨占loopback服務的交集，透過原issuer的實際401確認；其他收據、當前帳戶／世代及全部任務保留。舊全量維護工具的未知憑證拒絕未被修改，原失敗保留；家庭／取消的功能測試與選用維護分開。原加密快照保存在App私有區，沒有把憑證或資料庫帶出。

完整綁定：`.codex-local/qa/20261014-android-background-and-registration/native64-latest-bindings.json`。本輪未部署、分發或提交商店；最後記錄公開安裝版test56／Railway1.0.64，註冊未由本輪啟用，`huanghome2026`尚未正式建立／匯入家庭資料，支援信箱仍為hankhuang0516@gmail.com。原正式矩陣33/36為歷史證據，新版沒有新增正式通過；06/2、06/6、08/6、真機／OEM與iOS仍待驗。當版獨立複查未完成：先前恢復審查工具的動作被自動安全審核以可能資安風險拒絕，沒有重試或另找審查者繞過。發布仍HOLD，既有部署授權保留，不重問。

