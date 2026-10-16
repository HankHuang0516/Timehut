<!-- HANK_ICON_WATERMARK_POLICY_20261010_BEGIN -->
## 全專案 H 浮水印與每次更新發布前自檢（Hank，2026-10-12 更新）

Hank 直接規定：「把浮水印Ｈ不能自成一排的限制規定放到每一個專案甚至是未來的專案內」及「任何專案發更新版之前都要自檢過icon 浮水印位置」。本節適用所有現有、未來專案及其工作副本，覆蓋舊的圖示底欄／縮圖留白方案核准；不得沿用那些核准放行。

Hank 2026-10-12 最新更正：「只要Ｈ在畫面中 不需要特別清楚 因為只是浮水印」，並指出不得使用錯誤的 H 樣式。本次更正覆蓋下方舊版的小尺寸清楚辨字要求：H 是浮水印，不是必須在 32／48／64px 清楚辨讀的標誌；不得因它在縮圖中不夠清楚而阻擋發布，也不得為此換成金色、單色、其他字型或 AI 重畫的 H。

- H 必須像浮水印自然融入原圖，**不能自成一排**、獨立底欄、色帶、頁腳或圖外徽章。禁止為容納 H 縮小、搬移、裁切原畫，增加畫布／padding／邊框，或把原圖推到上方。保持真正無 H 原圖的畫布、比例、位置及構圖；只合成已選定的 H 圖層，不重畫原圖，不擅改 H 色彩／alpha。
- 必須使用使用者實際選定的 H 原始圖層；保留其樣式、筆畫、色彩與 alpha，不得自行替換、重新設計或重畫。H 只需在圖示畫面中存在、可見，不要求小尺寸特別清楚或能辨讀字母；縮圖細節消失或僅呈小型彩色浮水印不構成 HOLD。H 仍不得遮住標題、主要文字、人物、武器或主要圖形，也不得完全落在畫面／平台遮罩之外。逐語言、逐平台檢查實際輸出與遮罩，包含 32／48／64px 及適用平台尺寸；這些尺寸用於確認 H 仍在畫面中，不是清晰度門檻。
- **每次更新版發布前都必須重新自檢 icon 的 H 位置，即使本次沒有修改 icon。** 在內測分發、商店提交／發布或網站／CLI 更新前，核對本次實際包內／發布產物圖示、各語言變體、商店圖示及可取得的安裝／執行後顯示；來源預覽或其他版本的通過紀錄不能代替本版自檢。
- 留存本版自檢紀錄：版本／build、真正原圖與 H 來源、使用圖示及包內資源路徑、實際小尺寸／遮罩對照、目視結論與未完成項。像素核對須以真正無 H 原圖為基準；不得把先縮圖／加底欄的圖當基準，以「H 外差異為 0」掩蓋整體構圖變動。自動檢查通過不能代替目視驗收。
- H 缺失或完全被裁掉、使用錯誤／擅改的 H 樣式、自成一排、遮圖／遮字，或本版自檢未完成，均為 **HOLD／不得發布**。小尺寸 H 不夠清楚不再列為阻擋條件。本次由 Hank 明確更新驗收標準，須如實記錄為「浮水印存在／樣式正確」，不得冒稱小尺寸清楚辨字檢查已通過。其他未變更的發布檢查仍須完成。沒有適用圖示的專案須如實記錄不適用及原因，不能靠移除應有圖示／H 規避。
- 建立新專案或新工作副本時，將本節帶入其根目錄 `AGENTS.md`；開始既有專案工作時核對本節已同步，遇到不可讀路徑記錄待同步，不建立替代目錄或假稱完成。此規定不自行恢復暫停目標，也不額外授權搬移、刪除、發布或變更 rollout。
<!-- HANK_ICON_WATERMARK_POLICY_20261010_END -->

<!-- HANK_EXTERNAL_TARGET_CODEX_2T_20261011_BEGIN -->
## 最新外接儲存目標：codex_2T（Hank，2026-10-11）

Hank 直接指示：「因為那顆硬碟壞了現在目前都要改到 `/Volumes/codex_2T/`」。本節更新所有專案的外接儲存目標，覆蓋下方仍把 `/Volumes/codex`、`/Volumes/CodexData` 或舊 Hank-2TB 當成目前目標的說明；搬移／復原的資料保護與各專案最新授權仍須遵守。

- 新實體碟是 `/Volumes/codex_2T`，Volume UUID `4E209AF2-AF33-3CF7-8F47-54D26FE14F19`，目前 ExFAT。長期專案與資料的目標以此碟為準；Git、symlink、POSIX 權限與活躍 SQLite 使用此碟上經確認的 APFS 資料區。APFS 資料區的掛載名稱可能不同，須核對映像檔實際位於新碟，不能只看路徑名稱。測試執行、必要測試快取／暫存與模擬器留在本機 SSD，仍保留 20 GiB 系統空間。
- 舊 `/Volumes/CodexData` 是 `/Volumes/codex/CodexData.sparsebundle` 的 APFS 掛載點；它不是新碟。目前舊資料區未掛載，指向它的連結不能視為可用工程。不得把舊碟 UUID 當成新碟身分。
- 各專案須先找到可讀且完整的來源，保留未提交／未追蹤資料、Git/worktree 引用及檔案語意，確認新位置與來源一致並協調停止寫入後，才切換原入口。已有專案完成新碟切換時沿用其已驗證路徑；不要重複搬移。來源不可讀則記錄「待復原／未切換」，不能把連結改到空目錄、建立假的掛載點或用遠端 Git 宣稱原工程已恢復。
- 作品網站的編寫工程 `/Users/hank/Desktop/Project/app-showcase-site` 仍待復原；它與已搬移的部署工程不同。部署工程實際在 `/Volumes/AiHankAppsData/EClaw-ai-hank-apps-route`，網站檔案在其 `backend/public/AiHankApps/`；原 `/Users/hank/Desktop/Project/EClaw-ai-hank-apps-route` 已轉接新位置。此工作副本的 Git 共用資料仍在 `/Users/hank/Desktop/Project/EClaw/.git`，保留其他 EClaw 工作副本的關聯。啟動前執行 `python3 /Volumes/AiHankAppsData/check_storage.py`；測試留 SSD，現有未提交／未追蹤修改不得重置。最新位置及驗證紀錄查 `/Users/hank/.local/share/project-storage/storage-policy-20261014.json` 與新碟 `AiHankApps/workspace-location.json`。
- 全域 `project-storage` CLI 目前仍為 `internal`；本節只更新目標與已查明狀態，不宣稱整體切換完成，不重啟舊搬移程序、不搬動正在寫入的資料庫，也不恢復暫停目標。新專案／工作副本沿用本節與 H 浮水印發布前自檢規定，發布與清理仍按各自授權及檢查辦理。
<!-- HANK_EXTERNAL_TARGET_CODEX_2T_20261011_END -->

## Timehut 開發

- 本工程是從 GitHub 新建的独立 clone，不代表任何遺失原件已復原。
- 開工前執行 `python3 tools/check_storage.py`；Git 與長期資料位於 codex_2T 的 APFS，測試／預覽在本機 SSD。
- 用 `python3 tools/preview.py` 預覽本機範例資料；啟動時建立前台快照，改碼後重啟更新。
- Railway 專案 Timehut、服務 Timehunt。Hank 2026-10-14 已明確允許更新後端與新版網站（本節末尾有當版紀錄）；其餘正式資料寫入仍限精確人工測試授權，不擴及既有家人媒體、相簿或公開性。服務由手動上傳部署，須逐檔核對實際部署來源，不能用 GitHub HEAD 推定線上版本。
- 不輸出 `js/config.js`、`.env`、Railway variables 的秘密值。保持既有秘密與正式 Flickr 資料，不把它們帶入測試副本。
- 推送 main 會觸發 GitHub Pages 更新；發布前必須完成當版 icon H 自檢與部署確認。

## 2026-10-11 最新 Flickr 測試直接授權

沿用目前已連接帳戶及原正式版相簿，不另建相簿。只對本輪新建並記錄精確 ID 的人工測試圖片驗證上傳、標籤、移入／移出、下載；不得修改既有家人照片或任何公開性，永久刪除另問。憑證僅於執行時使用，不寫入 QA 副本或輸出。禁止操作使用者鍵鼠、啟動可見測試瀏覽器或搶焦點；無頭隔離測試可做。獨立審查和每頁／兩軸 80% 驗收持續適用，未驗項目不得宣稱通過。


## 2026-10-12 指定人工圖片日期與刪除直接授權

Hank 在原對話 01a1294a-ec8f-7a60-a0d3-bdcf0f85fed7 明確回覆「允許日期測試，完成後刪除此兩張人工圖」。日期設定／合併與測試後永久刪除僅限 Flickr ID 55582901920、55582483471。每次寫入前驗證人工 provenance、目前帳戶、私密性與原相簿；保留逐 ID 收據並以 signed getInfo 的 Photo not found 核對刪除。不得擴及其他照片、影片、相簿或公開性；不重複上傳已存在的人工圖。最新無真機指示：先完成可獨立進行的工作，真機未驗不可算通過。圖示問題依 Hank 指定交由對話 01a1242d-dfd9-76b2-886d-61289f36ac9c 查明，未確認 H 選定前不合成發布圖示。


## 2026-10-12 單段人工影片測試與刪除直接授權

Hank 已回覆「允許這段人工影片測試，完成後刪除」：僅已準備的2秒、3572bytes無聲幾何 artificial-video.mp4，沿用原正式相簿，驗證上傳／播放／標籤／下載並在完成後永久刪除此新人工影片。記錄唯一run tag、clientUploadId、localId、Flickr ID與各階段checkpoint；重試只續查相同ID，禁止因串流／轉碼等待失敗重複上傳。不得擴及其他影片、家人媒體、相簿或公開性。憑證只在runtime使用不輸出。之前兩人工PNG已刪，不得重建。


## 2026-10-13 四張人工PNG測試與清理直接授權

Hank在本續作對話回覆「允許這4張測試並於完成後刪除」。僅限 `.codex-local/qa/20261013-live-upload-proposal/manifest.json` 已固定的4張64×64人工棋盤PNG，共661bytes；原帳戶／原允許相簿、批量2張共用標籤與單張2張不同標籤，逐檔signed metadata／membership讀回。每檔至多一次live建立，使用實際UI clientUploadId與本機收據／Flickr ID落盤續查；未知結果不得盲目重傳。完成後只對本次4個新ID，先核對來源／帳戶／私密性／相簿，再永久刪除並signed核對not-found。不得重建舊三ID、操作家人媒體、新增相簿、修改公開性／OAuth／安全設定、發布或操作Mac鍵鼠焦點；真機與完整其他門檻仍未驗。

本次4PNG已於2026-10-13完成逐檔標籤／原圖／私密性／原相簿讀回並永久刪除：`55586751614`、`55586560236`、`55585542767`、`55585542757`，各有signed Photo not found收據。終態 `.codex-local/qa/20261013-live-upload-modes/ledger.json` 的terminal=true；不得重傳或重建，重試腳本僅返回terminal no-op。最初batch併發失敗及同ID metadata recovery證據保留，不冒稱首次直通成功。

## 2026-10-13 外接中斷後重新掛載

Hank 說明碰撞造成中斷，並授權恢復外接資料。原 APFS 映像仍在 `/Volumes/codex_2T/codex_project/AiHankAppsData.sparsebundle`，已用系統預設名稱 `/Volumes/AiHankAppsData` 讀寫掛載並啟用檔案擁有權。Timehut 現行工程為 `/Volumes/AiHankAppsData/Timehut`；實體與 APFS UUID 不變，沒有搬移、重建或以舊副本覆寫。舊自訂掛載入口尚未恢復，不能寫入其下的空目錄。開工仍執行 `python3 tools/check_storage.py`，核對 UUID、實際 backing image、APFS、擁有權及原 Git。詳見 `.codex-local/qa/20261013-external-remount/receipt.json`；此紀錄只確認本工程，不宣稱其他工程入口已恢復。

## 2026-10-14 網站安裝入口發布

Hank 要求繼續安裝 App 入口並自行本機驗證上傳／下載。已發布 https://hankhuang0516.github.io/Timehut/install.html，首頁／設定頁有入口，PWA 指引與 Android test.55 APK 下載並存。Pages commit `756df29043c5277016e0b6f67bb96e0813ece927`，run `38485388004` 成功，線上頁面／圖示與實際瀏覽器下载 APK bytes 已核對。後端未部署，影片新端點仍待更新，真機背景／相簿保存與全目標 33/36 均未新增通過。

本次是安裝入口的選檔發布：保留原線上 gallery JS／server 及原 tracked config blob；本機 synthetic config 從未提交。根工作副本 HEAD 仍在 `caa1779`，現有大量修改／未追蹤來源完整保留；遠端 main 已前進。後續不可直接 reset/pull 覆寫目前候選開發，須先比較來源與選檔發布差異。收據、H 當版自檢、獨立審查、本機 HTTP 2 PNG＋1 MP4 上傳／原檔及 ZIP 下載驗證見 `.codex-local/qa/20261014-install-entry/`。本次沒有任何 Flickr 遠端寫入。

## 2026-10-14 上傳錯誤續作與網站修正

Hank 將對話 `01a133f0-1f5b-71d2-a22a-4dd64a1ca215` 的工作交由續作對話接手，優先處理上傳畫面錯誤後繼續原目標。已發布舊版網站的局部修正 `9d6cf4b` 及快取更新 `a75828623976b149425c0e463b360cea9e76d636`；Pages run `38503563589` 成功，網站版號 `2026.10.14-upload-safety.2`。兩次各有當版實際產物 H 自檢、独立審查及線上檔案核對。沒有部署後端、操作 Flickr 寫入或變更帳戶／公開性。

連線中斷後停止後續傳送，保留本頁尚未送出的原 File／相簿／標籤；已收件或結果未知不得再 POST。分清已收件與 Flickr 完成，不誤顯示100%，不自動重整；舊後端404收據不代表成功或失敗。sessionStorage 只涵蓋同一分頁；跨關閉／重整不可冒稱保留原 File 或端到端 exactly-once。人工本機15組、獨立有界測試及實際線上外殼＋合成API檢查通過，不等同新增正式 Flickr 或真機驗收。本次原六檔事件的3個已上傳照片僅沿用前輪只讀核對；不得因錯誤畫面重傳或刪除家人照片。

根工作副本 HEAD／index 未切換，遠端 main 已前進兩個提交；只透過另用 index 選檔建立發布提交，現有候選修改完整保留。最新紀錄在 `.codex-local/qa/20261014-upload-incident/`，後續不得直接 reset/pull 覆寫工作。

新版候選網站打包已補齊37個檔案，HTML／CSS漏檔會阻擋；本機8頁×3尺寸共24組載入檢查通過。後端候選1.0.62修正唯一版本入口與CORS，實際本機HTTP和修前負控通過；7檔部署來源快照不含憑證／uploads。這些是待發布候選，不是已上線新版排版。正式 Railway 目前沒有持久卷，讀回佇列當時為0；部署前仍須重查並保留任何新增工作，不能以舊讀取推定當下安全。後端與整套新版網站的更新授權已提出，未收到回覆前維持正式後端只讀，不把等待或前端局部修正授權擴及後端／儲存變更。候選封裝、來源清單及獨立複查見 `.codex-local/qa/20261014-web-layout-package/`。原正式33/36、06低於80%與真機／完整實際操作矩陣未驗均保持不變。

## 新版網站／後端直接授權與實際發布（2026-10-14，續作）

Hank 明確回覆「允許更新後端與新版網站」。此授權覆蓋上方當時待回覆／正式後端只讀的部署限制；既有照片、相簿、帳戶及授權設定須保留。沒有新增 Flickr 人工媒體、OAuth 重設或既有家人媒體寫入授權；已刪除七個人工 ID 不得重建。

已先發布新版網站排版 `8ab890834b91e813065d07eeada5eff9c02aef29`，Pages run `38509505805` 成功；後端1.0.63精確來源已核對。部署前將舊服務的兩個待傳檔案及空收據完整保留到 APFS 與持久卷的私有保留區，來源 SHA／大小一致。保留原件不是生成 QA，不得清理或用它們重傳。保護紀錄在 `.codex-local/recovery/20261014-railway-upload-preservation/`；正式持久卷掛在 `/app/uploads`。

後續查明既有 MOV 原檔被 MP4 限制拒絕，故部署後端 **1.0.64 / 2026.10.14.2**，Railway deployment `fe899e4f-585e-445b-8df7-7afce9e21375` 成功。最新七檔部署來源與複查快照完全一致，持久卷／保留原件仍完整，當版部署前後佇列均為0。既有影片只讀核對：MOV 原檔 HEAD200、64-byte Range206、正確 .mov 與 video/quicktime；播放用 MP4 HEAD200。沒有新增 Flickr 檔案或修改其公開性。網站候選 .2 的時間軸／相簿單檔及 ZIP 保留 MOV／MP4 原始內容與副檔名，49組本機 HTTP、6組實際無頭 Web 下載、24組頁面／尺寸與4組離線檢查通過；独立有界複查通過，當版實際圖示 H 目視通過。紀錄在 `.codex-local/qa/20261014-mov-original/`。

以上不算新的正式端到端／真機驗收。原正式33/36、06/2與06/6、08/6、真機背景傳輸／相簿保存仍未驗；APK55未更新。根工作副本 HEAD／index 不切換，僅另用 index 選檔提交發布，保留其他候選修改；後續不可直接 reset/pull 覆寫。網站 .2 的實際 commit、Pages與逐檔讀回收據以同資料夾 publication-commit.json／live-static.json 為準，發布成功前不能以候選宣稱已上線。


## 2026-10-14 Android 背景傳輸、雙平台上架與開放註冊新授權

Hank 要求完成 Android App 背景上下載，確認切換 App、鎖屏後仍能傳輸，測試通過後更新安裝版並繼續原目標；同時規劃 Android／iOS 上架，改為開放註冊。此授權允許完成必要實作、管理下的無頭 Android 系統測試與通過後的測試安裝版更新；商店上架目前是規劃，不能當成已提交／發布授權。

帳戶與照片必須按使用者／家庭隔離，不能把現有家庭密碼或全域 Flickr token 當成公開註冊方案，不能讓新註冊者存取 Hank 的家庭媒體／收據。既有家人資料、相簿與授權保留。不得重建已刪七個人工 ID；本輪優先使用本機人工檔案及隔離後端測試，不能為背景測試擴及真實家人媒體寫入。模擬器系統測試與實體手機／廠商省電測試如實區分；普通切換、熄屏／鎖屏與強制停止分別驗證，不宣稱任意強停後必定繼續。當版 APK／網站 icon H 自檢及獨立複查仍適用。工作紀錄：`.codex-local/qa/20261014-android-background-and-registration/`。

<!-- HANK_AIHANKAPPS_MOUNT_REPAIR_20261014_BEGIN -->
## AiHankApps 掛載入口修復（Hank，2026-10-14）

- 原映像仍在 `/Volumes/codex_2T/codex_project/AiHankAppsData.sparsebundle`，目前真正掛載點為 `/Volumes/AiHankAppsData`；實體／APFS UUID 不變，資料沒有搬回 SSD。
- 部署工程 `/Volumes/AiHankAppsData/EClaw-ai-hank-apps-route`；原 Desktop 入口已轉接這裡。共用 Git 仍在 `/Users/hank/Desktop/Project/EClaw/.git`，工作副本反向登記已修正。
- 啟動前執行 `python3 /Volumes/AiHankAppsData/check_storage.py`。檢查實體／APFS UUID、實際映像、ownership、可寫性、原入口及兩個工作副本的 Git 雙向關聯，不得弱化 guard。Timehut 另執行其 `tools/check_storage.py`。
- 舊 `/Volumes/codex_2T/codex_project/AiHankApps` 不是目前資料區；不能往空目錄建立替代工程。編寫來源 `app-showcase-site` 仍待復原，本次不代表它已恢復。
- 最新位置：`/Users/hank/.local/share/project-storage/storage-policy-20261014.json`、`/Volumes/AiHankAppsData/workspace-location.json`；修復與保留證據：`/Volumes/AiHankAppsData/entry-repair-20261014/`。測試及必要快取留本機 SSD，至少保留 20 GiB。
- H 沿用 Hank 最新規則：小而低調，只需在 icon 畫面中可見且樣式正確，不為縮圖辨字放大；不得遮主體、自成一排或改動原圖構圖，每版仍查實際發布產物。
<!-- HANK_AIHANKAPPS_MOUNT_REPAIR_20261014_END -->

Hank 補充：「都先存到我後台正在使用的flicker帳戶」。公開使用者先共用既有 Flickr 儲存帳戶；用應用程式端的帳戶／相簿／照片歸屬資料做後端隔離，不要求註冊者自行綁定 Flickr。原家人媒體保留，新使用者不得看見它們；不得只依靠前端篩選或隱藏圖示防止越權。

## Android test.56 實際發布（2026-10-14）

已發布 test.56，APK SHA256 `f1e8c4b1ed9f481fae314e62957a65104b30d161abebef838add9b842dd95e36`、13,728,381 bytes，既有測試 applicationID／簽章延續。Pages commit `78337a8a2ccebad50f45e92f4bbb915501819823`、run `38572248641` 成功，線上實際安裝按鈕下載的檔名／完整 bytes 與複查產物一致。

Android 16／API36 管理下模擬器使用真實 JS bridge、原生上下載與本機人工服務，確認 HOME、其他 App、interactive=false 且 keyguard=true 之後的上下載 bytes 持續增加；原 PNG／MOV／MP4、照片保存與完成收據重開核對通過。API26／WebView58 只通過實際更新指引，不算較舊系統背景傳輸通過。實體手机／廠商省電、任意活動任務強停續傳、iOS 未驗；正式33/36保持不變。候選原生6 Java來源與測試來源一致，打包 variant 的DEBUG=false關閉loopback例外；本版實際APK、安裝後圖示及實際網站4icons H目視通過，獨立有界複查通過。

本次只更新安裝入口／APK，Railway仍1.0.64、公開註冊未啟用。新註冊程式仍在本機隔離實作／驗收階段；管理者帳戶名稱的使用者問題待回覆，不能把新註冊者指定為原家庭資料管理者。根HEAD／index保持原狀，不得直接pull/reset覆寫候選來源；發布／本機實驗收據見 `.codex-local/qa/20261014-android-background-and-registration/`。

## 2026-10-15 公開服務與家庭管理者直接回覆

Hank 已指定既有家庭管理者登入名稱為 `huanghome2026`，支援／隱私聯絡信箱為 `hankhuang0516@gmail.com`；並直接確認已有公開註冊者照片集中存入既有中央 Flickr 帳戶這個用途的核准。不得重問已回答事項，不從支援信箱推定身分、不要求使用者在對話提供密碼。用途核准為使用者確認，未冒稱獨立查閱文件或現用帳戶方案／額度。

可信任的本機初始化工具與原家庭相簿編號／日期歸屬已有人工SQL／HTTP／無頭瀏覽器證據；沒有執行正式保留／建立或家庭私密資料導入。公開模式只接受資料庫內已完成的綁定，不能讓第一個／同名普通註冊者或單設環境ID取得家庭權限。test.56／Railway1.0.64／註冊OFF與正式33/36保持；完整家庭歷史媒體及當版發布門檻仍未完成。紀錄：`.codex-local/qa/20261014-android-background-and-registration/owner-bootstrap-latest-bindings.json`。

## 2026-10-15 私有管理者資料庫已在 APFS 準備，尚未移交正式服務

`tools/prepare_private_owner.cjs status` 是只讀狀態入口。指定帳號 `huanghome2026` 的新私有帳戶庫位於 `.codex-local/private/owner-bootstrap-huanghome2026/`；兩個原相簿已透過現行後端只讀確認歸屬。輸入僅保留家庭名稱／生日／原相簿ID，舊設定只在記憶體以AST解析，未執行或保存原密鑰／家庭密碼。新隨機初始密碼只存該私有目錄，不能輸出至對話、命令列、環境變數、QA、Git、部署包或雲端備份；需要時由使用者自行讀取 `initial-password.txt`。

私有目錄與檔案分別為0700／0600，完整登入／登出核對後零sessions，以單一已關閉SQLite檔移交；`transfer-manifest.json` 是私有移交收據。既有或中斷目錄不覆蓋、不重新產生密碼、不刪除重做。這些是正式準備資料，不能當生成QA清理。不要把真實帳戶庫複製到測試工程；移交測試只用人工家庭資料。

此紀錄覆蓋上段「家庭私密資料未導入」在本機準備階段的狀態；正式Railway沒有建立／上傳／啟用此帳戶，Flickr沒有寫入，test.56／Railway1.0.64／註冊OFF與正式33/36不變。當版獨立複查仍缺，不能以本機準備或人工移交測試作為發布通過。
