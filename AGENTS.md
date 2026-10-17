<!-- HANK_REMOVE_REQUIRED_SIMPLIFY_20261017_BEGIN -->
## 所有現有與未來專案取消強制 simplify 審查（Hank，2026-10-17）

Hank 直接要求：「所有現有跟未來的新專案都要取消這條強制 simplify 審查規則，並通知其他 session，不要再因此卡住提交或發布。」

- 所有現有專案、新專案、工作副本及各 session 均取消「必須執行 simplify skill」或「必須由 Claude Code 執行專案指定 simplify 審查」的強制步驟；舊文件中的同項要求以本節為準。
- simplify 僅為可選工具。不得因未執行、未安裝、不可用或未為 simplify 登入 Claude Code，而阻擋提交、PR、審查或發布；也不得把未執行的 simplify 冒稱已通過。
- 其他既有程式碼審查、代碼品質、i18n、功能／權限／UI／回歸測試、CI、安全、H 浮水印自檢及發布批准要求仍須完成，不因取消 simplify 而略過。
- 建立新專案或新工作副本時，將本節帶入根目錄 AGENTS.md，以及存在的 CLAUDE.md／覆寫指示；開始既有專案時移除同項舊強制條款。不可讀來源記錄待同步，不建立替代工程。
- 本次只更新規則，不自行恢復暫停目標、提交／推送、發布、搬移或清理資料。
<!-- HANK_REMOVE_REQUIRED_SIMPLIFY_20261017_END -->

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


## 2026-10-16 最新內部測試：Android test.79 六頁畫面

Hank 要求畫面完成後提供內部測試版自行實機測試、iPhone後補。test.79（code79）已發布為prerelease並實際下載核對，來源527e0d62555c003097af76ba003a0d4919bb59ae只在internal/android-ui-test79-20261016分支／標籤；main／公開網站與後端不變，網站預設入口仍75。原六頁已呈現狀態的獨立視覺分81／82／84／81／82／83僅為部分狀態；原六頁／36功能／兩軸80門檻及未驗計0保持，完整正式驗收HOLD。來源與靜態APK複查無已審範圍阻擋，當版實際H自檢通過。真機79背景上下載待Hank實測，iPhone後補，沒有商店提交或新Flickr媒體寫入。權威最新狀態 `.codex-local/qa/20261016-formal-six-page/formal-acceptance-current.json`，下載收據 `.codex-local/qa/20261016-android-installer79/publication.json`。未分發77及先前75／68紀錄保留為歷史與正式線上基線，不能把它們冒稱新版完整驗收。

## 2026-10-16 公開註冊與 Android test.75 實際發布

Hank 已明確允許新的唯讀獨立複查；舊 Planck 安全拒絕及失敗紀錄保留。新授權審查者通過 revision2（151檔）、發布 metadata 及後續 SQLite DELETE-mode 修正複查，未發生新的安全拒絕。不能再以舊的複查不可用／缺部署授權作為當前阻擋，也不能把這些 bounded PASS 當成原完整目標完成。

已在精確舊部署的實際 Node 程序建立短暫停流、證明原 TCP 連線完全退出與零待傳後，寫入真實空佇列 checkpoint；私有已關閉帳戶庫只經驗證非TTY stdin移交，由停流擁有者同步出版，保留原件。原服務已退場。正式後端現為 **1.0.68 / 2026.10.16.2 / Node24.22.0**，deployment `7aebd59e-2189-449f-a415-28b2cc14b6c8`；持久卷 `/app/uploads`、兩個保留媒體與保留空收據 SHA、217個舊 staging entries 均完整。既有家人相簿／授權設定保留，沒有新增 Flickr 媒體寫入或重建七個已刪ID。

公開帳戶隔離及新註冊已啟用：`TIMEHUT_PUBLIC_REGISTRATION=true`、`TIMEHUT_ACCEPT_SIGNUPS=true`。新普通帳戶不能看原家庭資料；指定管理者 `huanghome2026` 沿用私有初始化密碼檔，不輸出其內容。正式 Cookie／Bearer／原生登入取消及 UI 登出均有證據。實際空白測試帳戶在67版先卡在 DELETE-mode 的無WAL計數，故先暫停註冊；68版經原始失敗對照、DELETE3／WAL12及獨立複查修正後，同一筆清除申請恢復完成。重新開放後，第二個空白帳戶完整註冊→隔離→刪除通過；兩個精確測試帳戶均已清除，沒有以刪家人資料測試。

**Android 2026.10.16-test.75** 已發布，13,768,009 bytes，SHA256 `e89c445ad0f9e624a202407026a1fadfa04863fc9cbc58e8b6592e9ee29e13e2`；下載入口 https://hankhuang0516.github.io/Timehut/install.html 。最新選檔 Pages commit `032c8335ef1e148870aa458c799b226be6ee7b88`、run `38843162181` 成功。QA76與75原生Java及三個帳戶JS完全一致；SDK36模擬器在HOME／Settings／熄屏且keyguard鎖定後，兩方向bytes持續增加。非DEBUG75在SDK26／36實際更新保留原資料及待處理收據；包內／網站／安裝後當版H檢查為「浮水印存在／樣式正確」，不冒稱小尺寸清楚辨字。

真機／廠商省電、實際發布75的正式HTTPS背景傳輸、任意活動任務強停續傳與iOS完整流程仍未驗。雙平台上架僅規劃、未提交。原正式 **33/36**、06/2、06/6、08/6不加分。最新狀態及歷史保留入口 `.codex-local/qa/20261014-android-background-and-registration/release75-latest-bindings.json`。根HEAD／index仍不切換；禁止直接pull/reset覆寫WIP。帳戶庫已存在，不能回退舊64或關閉帳戶隔離；要暫停註冊只改 `TIMEHUT_ACCEPT_SIGNUPS=false`。Railway actual source null、repoTriggers空且autoDeploy=false，GitHub推送只觸發Pages，不能以Git HEAD推定正式後端。

## 2026-10-16 手機回報修復與新增功能續作授權

Hank 要求修正 Android 頂部被狀態列擋住、相集持續載入，並將黃家小屋既有所有照片改私密。照片作業已完成：兩個原家庭相簿2725張照片均經 signed 權限讀回為 public/friend/family=0，2724張變更、1張原本全私密；52段影片未變更。精確 ledger 在 `.codex-local/qa/20261016-legacy-photo-privacy/ledger.json`，不得重傳或擴及其他資料。這是覆蓋歷史禁止改公開性的本次精確直接授權。

協調對話 `01a13f2a-f6b4-7269-9459-1da1de477034` 轉交使用者新增要求：可復原的相簿刪除（保留媒體）、多選後自動排隊、第三本以上相簿與重新命名、設定中的私密附圖回報及站內修復通知；沿現有唯一工作窗口整合，不動正式家庭相簿作測試。通知必須有逐回報QA與相應平台版本實際可取得證據，不偽造通知、不使用郵件／簡訊／新系統權限。修測及獨立複查完成後更新既有 GitHub APK 內部測試管道；全六頁／兩軸原標準及真機未驗狀態保留，不冒稱 Play 內測或完整正式驗收。

同協調窗口提供直接原文批准：06:17 UTC詢問自選「記住此裝置」，access24小時、閒置90天、絕對365天、續期輪替與登出撤銷；Hank於06:32 UTC回覆「採用」。此期限方案已獲批准，毋須重問；限第一方網頁可選記住裝置、既有帳戶／服務，digest-only、重放防護、登出撤銷當前鏈及停用／刪帳撤銷全部。原生現有登入協定不因網頁記住裝置而變更。不得把這份授權當成已部署或永久不失效。

使用者亦經同窗口授權內部測試後正式上架 Google Play／Apple App Store；仍須完成對應平台簽章、素材、隱私與商店門檻及實機驗證，iPhone實測成為正式上架前置。需新增憑證、權限、費用或條款時才交接相應事項；不可用先前「僅規劃」當成目前缺一般發布授權。正式後端目前68、網站預設75、APK79；81僅工程測試未分發，83修測中。所有發布仍按實際產物H目視及獨立複查辦理。

## 2026-10-16 test.85 與後端69限定網站修復實際發布

Android `2026.10.16-test.85`／code85已作GitHub prerelease發布並以匿名完整下載核對，13,787,813 bytes、SHA256 `5b25f1acce9eeec6ce046e5a6b9bad45639e98112a1619f23ed31ce4a91c5105`；沿用既有測試簽章。來源 `549b6011b4bb84f4f427b40a2faa15bc3fcb188c`，只推內測分支／tag；main與公開預設安裝入口仍75。當版實際包內與安裝後H目視及獨立複查通過。相集載入與頂部狀態列修正已含本版；模擬器API26更新指引／API36實際點擊與鍵盤、83→85保留升級通過，實體手機仍待Hank測試。

正式後端已更新 **1.0.69 / 2026.10.16.3 / Node24.22.0**，Railway deployment `06270e46-1cdf-4c40-b94e-233af0aceb08` SUCCESS；68已REMOVED。獨立複查所有來源阻擋已關閉；實際短暫停流、HTTP零連線排空、上傳與私有媒體工作均0後部署。83檔線上SHA完全一致，持久卷、保留217檔staging與3檔原件／收據、3帳戶4相簿metadata保留，公開註冊旗標仍true，inspector關閉。網站保留75排版，僅發布相集漸進／指定ID載入、穩定檢視ID與登入恢復／可選記住裝置等限定修復；新版全六頁排版未一併發布。

實際線上無靜態替換，兩組私密相集共5張照片、14次完整解碼及正確ID核對通過，初次清單約4.2秒，重整／後頁／返回／客戶端注入讀取失敗後重試通過，測試session均登出200。私密回報後台實際管理者只讀200／未登入401／直接私有圖片路徑404；目前0回報、0通知，未植入假回報或假修復通知。本輪沒有新增Flickr媒體、照片或相簿刪除。完整正式原六頁／兩軸80與36功能標準、未驗計0及Android／iPhone實機前置維持HOLD；本次局部修復不補發完整驗收分數。當前收據 `.codex-local/qa/20261016-album-management-and-autoupload/publication-current.json`，APK收據 `.codex-local/qa/20261016-android-installer85/publication.json`，真實照片驗證 `.codex-local/qa/20261016-live-album-diagnosis/postdeploy-real-api-report.json`。

## 2026-10-16 後端70與下一版更名／設定畫面

後端目前 **1.0.70 / 2026.10.16.4**，deployment `2e7f4f58-2ead-4b48-ae5f-5b01b53876fc`；84檔線上來源、持久卷與原件／帳戶metadata保留均已核對。網站75底版新增私密回報入口，沒有發布整套候選六頁排版。經使用者明確要求，已做且只做一份自己的私密人工附圖回報／明示「測試通知」實驗，實際舊版模擬→可取得85 APK、完整下載雜湊、已讀與同證據去重均通過；不是實際故障回報或實體84裝置。只讀管理後台目前2筆／1頁，使用既有授權來源、暫時會話已登出，沒有新增API key／帳號／角色或保存新登入資料。通知例行檢查由協調窗口安排，不重複建立自動化。

經協調窗口轉交Hank最新直接要求，對外名稱改為 **時光相簿**；保留package/application ID、bundle ID、簽章、storage keys、帳戶與資料，歷史下載連結／證據不改名。Web、Android、iOS來源已換顯示名稱，尚未將此更名發布或宣稱商店核准。87已完成API26／36有界受管升級／安全區檢查，因更名保留工程包不分發；88已建置，當版裝置、H與獨立複查仍須完成後才能內測分發。

Hank要求新加入的設定／帳號安全畫面採簡潔iOS美學；實際來源已整理分組卡片、字級、留白與主色，四尺寸Web真操作預覽通過，裝置驗收及發布狀態另記。更改密碼須由使用者輸入目前密碼、新密碼及確認；本輪只盤點既有來源與畫面，不更改真實密碼。現有後端沒有信箱驗證、忘記密碼或更改密碼端點，未發現本Railway服務的寄信變數名稱；不能由此推定其他服務完全不存在。須先確認復原／會話撤銷與寄信政策，不新增憑證、權限或擅將支援信箱綁成帳戶信箱。新畫面入口只連既有帳戶功能，不冒稱密碼功能已完成。

原六頁／36功能與每頁兩軸80門檻不改；最新85-CSS候選獨立已呈現狀態視覺分數為02=80、03=81、05=84、06=79、07=81、08=82，仍有未見狀態，完整正式維持HOLD。後續88新設定風格不得套用舊05分數。實體Android切App／鎖屏／保存與iPhone仍待驗，不能用模擬器或本次Web預覽補成正式通過。

## 2026-10-16 UI一致性修正與前後對照續作

Hank明確指出先前候選的iOS風格間距及同功能大小／形狀不一致；**88視覺未通過，不分發**。88工程包已完成有界模擬器／同簽章／保留升級／私密回報與當版H檢查，不能據此覆蓋使用者的視覺拒絕。local branch `internal/time-album-test88-20261016`／`4f08fd77f15445e31c9442c28fbf5616c7efbb3f`只準備未push，禁止把它當已發布；可下載最新版仍85。

89目前僅Web來源候選 `2026.10.16-ui.89`，設定／帳戶／回饋／通知改用共用間距、卡片、表單及主次操作元件。已測正常四尺寸24組、共用元件實際量測28組、最小24字體及長80字名字四尺寸24組；這些是Chrome示例資料驗證，**不是Android89／iOS89或真機通過**，也不是使用者批准。新版本每次先核對實際版號，再做畫面回歸，包含320／390／412與桌面、大字、長字、載入／空／錯誤、鍵盤安全區與觸控；分平台留證。兩小時版本／UI監看由協調窗口負責，不重複建排程。

Hank要求Before／After：必用已核SHA的兩張原預覽圖，After同390×844／同示例帳戶相簿／頂部捲動位置，真實來源畫面，不生成／修圖冒充。成品與raw區域pixel-exact收據在 `.codex-local/qa/20261016-ui-consistency89/`；待使用者視覺驗收，未更新網站或安裝版。私人Library上傳若無可用工具須明示pending，不能冒造檔案ID或公開分享。帳號安全推薦方案已具體保存於 `.codex-local/qa/20261016-account-security-and-brand/recommended-security-policy.json`，**仍待使用者採用**；無新寄信服務、憑證、權限或真實密碼更改。EClaw舊botSecret失效確認與本方案無關。

## 2026-10-16 最新未發布候選：89 大字／長名稱與06上傳密度

Android工程包89已完成API26／36受管88→89保留升級，SDK36真實OS字體200%與WebView textZoom200、鍵盤／返回／安全區有界驗證；當版H實際包內／遮罩／安裝後目視通過。89仍**未分發**，可下載最新版仍85；OS200%的章節標題末字孤行保留為89已知視覺限制，之後修正來源不冒稱已在89包內。

網頁89.3以原Before（真正Web metadata2026.10.16.1）與同390×844示例資料重拍，長帳戶名稱加入原生details完整檢視入口；正常24組及大字長80字28組通過，獨立複查只關閉已審Web範圍的F2。舊89字體FAIL、88使用者拒絕及原Library圖不覆寫。最新兩張pixel-exact對照在 `.codex-local/qa/20261016-ui-consistency89/revision3/`；本地已目視，私人Library新上傳仍未確認，不能把舊檔案ID當成新版圖。

原06密度R2的12張四尺寸畫面經同一原rubric獨立視覺評81，僅限已呈現的單張／批量／MOV警告狀態；精確CSS和HTML已整合來源，root預覽版號89.4。小字／窄標籤換行及進度／完成／部分失敗／取消等缺項保留，不能宣稱完整06或全六頁正式通過。新版05設定風格沒有原rubric重評，不沿用舊85的84分；正式表不混合新舊候選計平均。36功能、未驗計0、Android／iPhone真機與完整端到端仍HOLD。上述更名／新版排版未更新正式網站、後端或安裝版。

## 2026-10-16 iOS 原生登入取消協定續作（不涉及新密碼／信箱政策）

iOS來源接入正式後端既有native-login protocol1，在同一原Keychain項目先原子保存32byte隨機取消證明後才傳送；schema3有界保留v1／v2已知與未知收據，兩格容量包含觀察到的bearer和取消證明，嚴格型別／attemptID回覆才移除原證明。舊版沒有證明的tokenless未知結果不捏造授權，保留未解。登出／遲到回覆不得復活舊帳戶；普通啟動只做一次有界取消嘗試，不承諾OS自動喚醒。既有Keychain service／item、entitlements、原生30天期限均保留；新密碼／信箱推薦方案仍未採用，沒有新增寄信服務／權限／憑證或更改真實密碼。

當前148組Swift儲存斷言、123組URLSession／實際本機Node24／SQLite斷言通過，含回應遺失、錯誤型別ACK、同證明重試、取消早於原POST的409及另一帳戶B保留。完整專案Debug編譯與獨立QA bundle本機ad-hoc編譯通過，都是工程證據，無商店簽章／IPA或分發。實際Keychain冷程序測試尚未開始：Simulator Manager兩次於裝置查詢逾時，沒有取得裝置、沒有重設／殺服務／繞過管理器，當前零本任務租約。待服務可用再由管理器執行現成的兩程序隔離測試；來源／失敗／測試證據與獨立複查入口在 `.codex-local/qa/20261016-ios-native-admission-audit/`，不能把host記憶體vault測試算成實際Keychain／iPhone通過。

最新續記：合併預覽89.4正常24／大字長名稱28組及06四尺寸12張回歸通過；首次06測試錯把不存在的頁面版號global當成載入條件，失敗保留，後以實際讀回的精確版本檔核對，未修改product DOM。iOS protocol3精確來源獨立複查無已審範圍阻擋，當前Release generic iOS無簽章編譯亦通過；實際Keychain／原生載入整合仍HOLD，沒有發布。

## 2026-10-16 Android90／91目視失敗與92工程包

90雖有自動有界通過，真OS200%目視發現上傳選檔文字與下一列重疊，**不分發**；91修掉重疊後又發現200%的單張模式被裁切，亦**不分發**。兩版失敗圖及收據保留，不以自動PASS蓋過目視。來源現為Web預覽89.6；上傳內容使用intrinsic grid rows，短螢幕內層整體可捲動，關閉按鈕保留在外層；批量／單張改成兩等寬格並允許自然換行，標籤模式去掉會孤行的冒號。

92（工程包13,792,753 bytes，SHA256 `9350400206628560ad287d7b080b32b4d45149965003bb9859a90cd73c262e41`）已建置，沿用原識別與測試簽章，production52項Android來源與91相同，僅Web CSS及版號改動。API26／36保留91→92升級、原資料／加密待確認收據、實際安全區／點擊／鍵盤／返回的有界測試通過；SDK36真OS font2/WebView200與還原系統設定通過，兩個模式文字及點擊框完整。模式點擊在原生排版fixture中是攔截的hitarea測試，不冒稱原生uploader實際模式功能；四尺寸Web12張使用實際模式handler。無真實帳戶登入／Flickr寫入，實體手機與完整正式仍未驗。

92當版包內15個native PNG、4個Web圖示及12頁icon連結均對真正無H原圖＋選定H讀回，H外差異0；actual32／48／64遮罩、密度及API26／36安裝後AppInfo均已目視，結論「浮水印存在／樣式正確」，不要求小尺寸清楚辨字。92仍未分發，獨立／使用者視覺驗收及原門檻未完成；可下載仍85、正式後端70與網站web.4不變。raw gplay preflight exit1保留：將dataSync型別0x1誤讀成不存在的FOREGROUND_SERVICE_0X1，實際APK有DATA_SYNC權限、SDK常數=1；沒有擅增權限或靜默當raw scan已綠，未執行upload/release。來源及證據在 `.codex-local/qa/20261016-android-installer92/`。

92的 `upload-sheet-scrolled-actual-tags-reachable.png` 截圖仍停在舊viewport，不能以DOM可見斷言當成該PNG的可見證據；真正的 `upload-sheet-both-mode-labels-visible.png` 已目視包含標籤輸入與兩個完整選項，僅採它支持這個已呈現狀態。06新版本尚待同原rubric獨立重評，原R2=81只留歷史範圍；不得將新05／06未評項算進全六頁平均。


## 2026-10-16 92獨立複查與帳戶相簿清單契約修正續記

92精確APK／已呈現排版已完成有界獨立複查，同原rubric的06正常四尺寸12張為81分；完整06、全六頁兩軸、實機、使用者新版風格同意及分發均仍HOLD。舊90／91失敗保留，92 mode tap仍僅攔截命中範圍，API26仍為fallback。原92實際89.6 runner已從revision2凍結，僅改輸出目錄重跑12圖，預先／事後57來源與runner hash一致；metadata wording及manifest歷史追查正在獨立followup，原v1／v2不覆寫。52是native輸入項，其中12份production Java。

隔離普通帳戶的實際browser→cookie→root Node24/SQLite流程找出Uploader嚴格字串title與legacy `/api/albums`巢狀title不符，200仍顯示清單失敗。來源Web預覽89.7改用已存在的 `/api/accounts/albums`，驗證頁碼／格式並累積完整分頁後才更新UI，非帳戶legacy路徑保留；後端、權限、憑證、native未改。實際A32相簿30+2分頁、B僅自身1相簿與0A收據、第二頁目的→accountAlbumId精確且provider albumId null、停止保留原檔／標籤、部分失敗不重送成功者、受控原worker完成及4次實際帳戶UI登出共9項通過，client故障／取消等5項邊界通過。5張目標畫面已目視，partial只證明保留佇列及alert紀錄，不冒稱新in-page部分失敗摘要。外部provider0，synthetic protected original與legacy queue未改，沒有正式媒體寫入／資料庫複製。

已知未解：傳輸中心只用最初context30解析相簿名稱，第二頁目的雖正確，標籤仍顯示「尚未確認相簿」，不能把此輪當成完整32相簿介面通過。source89.7及上述HTTP證據的獨立複查待完成；92APK仍是89.6，沒有將新修正冒稱已包進92／發布。可下載仍85、backend70／web.4與default75不變；新正式功能加分0。詳 `.codex-local/qa/20261016-account-upload-album-contract/` 及 `20261016-upload-state-http/`。cleanup無界等待、未拍到目標、fixture兩store快取、誤用provider欄位的各次失敗均保留，最後9項通過不改寫成首次直通。


## 2026-10-16 相簿名稱／清單完整性獨立複查續作

92的R92-E4／D1／D2已由獨立followup關閉在runner重現／delta文字／metadata追溯範圍，不構成完整正式或分發批准。89.7清單修正的原獨立報告為HOLD：AUC-F1證明空末頁／重複ID會被當成部分成功（回30／31而total32），AUC-F2則是超過初始context30的目的名稱無法解析；原報告不改綠。

未發布來源89.8為傳輸中心加入僅頁面記憶體的名稱解析：既有帳戶context端點、owner／generation／exact ID核對、最多3個在途查詢、失敗15秒退避與手動更新、pagehide／帳戶切換阻擋遲到回覆，不等待名稱而阻塞收據畫面。實際HTTP11項／7張目視及精確helper12組測試通過，獨立複查待回；不算真機換帳戶或原生全通過。

當前root預覽89.9進一步修AUC-F1：account mode總數合法／跨頁一致，頁數須符合每頁30、逐頁列數完整，重複ID拒絕，最後unique總數與total一致；legacy走原flat array並保留原順序／重複語意。19組精確source檢查先重現舊缺陷，再驗新拒絕；actual browser→未改root HTTP／SQLite13項與11張已全部目視，注入空末頁／重複ID時保留當下選擇及選項並顯retry，真retry後回32且不新增upload；同輪名稱修正及帳戶隔離回歸通過。57檔／runner／fixture預先及事後hash一致，證據在 `.codex-local/qa/20261016-account-upload-album-contract/revision2/`。原AUC-L1限制保留：前台adapter未把preparation signal轉給在途account HTTP，不能聲稱8秒timer能立即取消底層；只證明不再派下一頁及不更新已取消UI。

上述外部provider0、fixture fake creations1／fake metadata1均明示，guard只保護synthetic original及synthetic legacy queue，不冒稱正式家庭資料實測。89.8及89.9的獨立複查仍待完成；沒有新APK／正式部署，下載仍85、工程92仍89.6且未分發，原六頁／兩軸80與新正式加分0、實機／iOS／使用者新版風格及raw preflight門檻保持。最新Simulator Manager只讀狀態為零本任務lease／waiter；官方MCP輸出截到32767字元後改以官方CLI JSON在記憶體解析，未查詢／取得任何裝置，亦未重試iOS失敗的admission。


## 2026-10-16 89.10與Android93工程驗證（尚未分發）

獨立複查已關閉AUC-F1；TAN-F1則實際重現慢失敗導致立即重試，現改從不成功回覆完成後才計15秒，同owner/generation與pageActive分離以保留hidden時失敗期限、阻擋跨帳戶遲到cache。精確helper19組、actual root HTTP13項及11張通過（回覆延16202ms、收據165ms可見、失敗後6501ms未自動重查，真manual refresh恢復；完整15秒邊界只屬host測試）；TAN-F1 revision2亦已獨立關閉。root預覽89.10，沒有改backend/native credential policy或正式資料。

已建93工程APK13,793,757bytes，SHA256 `272205bd650c8f25b3e18216c185b7f50f0acbb959ec6c3134517e736f33dede`，既有test signer/nondebug/identity沿用，52份production native輸入（12main Java）與92同，Web直接差異僅uploader/transfers/version。真受管92→93升級在API26／36都保留資料；API26只有舊WebView fallback及guard，API36正常24phase／28tap／IME／rotation，另實際OSfont2/WebView200並還原1.0。mode tap仍為攔截命中fixture，不算原生uploader handler；Chrome實際模式handler與原生不同範圍。新H15native＋4web／12HTML均對選定原圖＋H，H外0；actual32/48/64遮罩、density與安裝後26/36AppInfo本版均目視，結論只為「浮水印存在／樣式正確」。93 normal named-scrolled PNG仍等同initialclose排除，不以DOMassert補成可見；只採fresh both-mode畫面。font runner沿用92文字的metadata錯誤已另保留raw與executed wrapper，加明示label correction；實際安裝hash和test assert一直是93，未偷換測試或版本。

93實際APK60個public assets已在1440／390／412／320 Chrome產出原6主頁及06/08附狀態40張；syntheticAPI／媒體、pre/post hash一致、無pageerror／overflow，已交同原rubric獨立重評，不能先套舊05=84或以此當完整36／真機／人類風格同意。視覺fixture後端version顯1.0.69只是示例資料，正式仍70，非rollback證據。0.9.2及task-cache中checksum核對的官方gplay1.0.0都raw exit1同0x1→不存在FOREGROUND_SERVICE_0X1誤判；SDK36實際constant=1及APK DATA_SYNC權限提供typed分析，raw結果不改綠，未skip、增boguspermission、上傳或越過skill，尚無明示error override。原33/36及未驗0／正式HOLD保持。source／工程包／新40張／獨立入口在 `.codex-local/qa/20261016-android-installer93/`。

另只準備新公開帳戶端到端測試的3PNG＋1段2秒MP4（總31,816bytes），提案要求2個臨時普通帳戶／3個App虛擬相簿／最多4個新provider ID；Flickr photoset新增0。`.codex-local/qa/20261016-public-provider-e2e-proposal/manifest.json` 是PREPARED_NOT_AUTHORIZED_NOT_EXECUTED，不是寫入授權；帳戶／credential／provider request／upload／delete均0，舊7個刪除ID仍terminal不得重建。正式寫入須在必要複查後另取精確新scope批准，不以提案或使用者既有中央Flickr用途核准代替。project-cloud show Timehut回空error已記錄，不重試／不宣稱備份，亦無清理。

可下載安裝版仍85、工程93未分發、backend70／web.4及default75未改；93獨立包體與原六頁視覺尚待回覆，實體Android由Hank後補、iPhone與實際Keychain仍待，沒有重試失敗iOSadmission或重設系統服務。正常與font兩次supervised lease均已釋放，最新本任務lease／waiter0。


## 2026-10-16 設定原05修正與94工程包續記（未分發）

93原六頁獨立已回：02/03/05/06/07/08為80/81/77/81/81/82，05低於80，不以平均通過。來源89.11只修settings-refined.css：沿用既有男孩/女孩/家庭插圖、放大頭像、恢復Save後家庭場景、桌面兩欄日期對齊，無新美術/HTML/handler/密碼信箱政策改動。四寬正常24圖16檢查、長80字12圖4檢查、57來源與runner前後一致；source-only原05同rubric獨立82，局部孤字與未還原完整繪本構圖扣分保留，不代表94包或全六頁正式過。

94工程APK13,794,077bytes，SHA256 bcc4f7cd499f1e524a98736f9ad49706bd2ecda157e9cbe707d94a8e526d6108，52native輸入/12mainJava與93同；直接Web差異只有settings CSS與version。實際受管93→94在API26/36保留資料，26為fallback；36正常24check28tap/IME/rotation，真OSfont2/WebView200且讀回還原1.0。兩個driver預先/事後hash與官方exit0/releasedtrue收據均保存；新94這兩階段收據不能替代舊93background缺漏。mode tap仍是攔截hitarea、normal namedscrolled不採，只採實際view過both-mode/settings；真機未驗。94實際15nativePNG/4Web/12HTML與真正原圖+選定H核對，H外差異0；32/48/64遮罩/density/安裝後26/36AppInfo均目視，浮水印存在/樣式正確。

當前native93來源的隔離debugQA核心與Home/Settings/鎖屏上下載byte增加/精確save有界通過，獨立addendum保留R93-BG-E1舊lock還原缺讀回/R93-BG-E2舊執行driver與release收據未綁；不冒稱全部證據完整，也不是正式HTTPS或實體手機。94最新40張actualAPK60assets的四寬六頁/附狀態與預先/事後hash已交獨立精確包體/原六頁重評，仍待回。官方gplay1.0.0掃94仍raw exit1同0x1誤判；typed DATA_SYNC分析不改raw綠、未取override、未上傳。可下載85/default75、backend70/web.4皆未改；原完整36/每頁兩軸80/真人風格與Android/iPhone真機仍未完成。初次94建置因java_home未登記既有Homebrew JDK而未入Gradle，失敗保存後改用原JDK21成功，不冒稱首次直通。


## 2026-10-17 94精確補審完成與兩項待確認（未發布）

取消強制simplify已由全域同步，Timehut根AGENTS已有HANK_REMOVE_REQUIRED_SIMPLIFY_20261017；本輪沒有跑simplify，不冒稱通過，其他H/品質/權限/UI/回歸/發布批准保持。94原六頁已呈現狀態獨立80/81/82/81/81/82，僅此範圍達標；全狀態/36功能/真機/正式HTTPS未完成。

R94-E2根測試wrapper的93→94過度字串替換曾把92SHA誤改為945040...；已與9個85..93實際APK逐一核對並改正baseline93=272205...、known92=935040...。原driver beforecopies/原94manifest/報告/執行hash保留，舊rootdriver路徑在複查後合法變動，不再聲稱現有156原路徑全未變。獨立host補審PASS_R94_E2_STATIC_DRIVER_HASH_CORRECTION_ONLY；fresh/85..92起點實際仍未跑，不擴大原93→94有界通過。

新accountqa94背景獨立PASS：83來源/21產物/預先driver及官方release資源綁定一致，Home/Settings/實際鎖屏雙向bytes與精確保存/收據有界通過，lock false/false/false restore/read exit0已讀回；true→false→true未驗，舊93 E1/E2歷史不倒填。

本對話三次IME+calendar fixture失敗已完整保留，字體各次1.0還原、租約釋放；native-date-picker檔名實際只是HTML日期年份被選取，不能證明OS日曆開啟/取消。相同工程的黃家小屋1011（01a1294a-ec8f-7a60-a0d3-bdcf0f85fed7）另有成功且不重複的94專用IME測試，獨立testPackage.testing.ime94followup，129input/hash/官方exit0released/font1→2→1均已凍結到本對話reconciliation。SDK36/320×640/font2/WebView200時textarea y104..278落在381viewport，真native輸入qa2字、focus/selection成立、無IME後額外document scroll；本對話已實際目視cleanempty/typed兩圖，獨立R94-E1有界關閉。caret字形矩形未實測、長多行/CJK/其他尺寸/OEM/真機未驗；未冒稱本對話執行peer工作，未再跑成功項。

原APK94仍13,794,077bytes/SHA bcc4f7cd499f1e524a98736f9ad49706bd2ecda157e9cbe707d94a8e526d6108，actualH自檢與main52/12Java不變。已在20261017-internal-release94-proposal備妥同bytes相容檔名HuangJiaXiaoWu-2026.10.16-test94.apk、notes、metadata與手機檢查清單，沒有tag/branch/upload。官方GitHub API本日仍latest v1.0.0，同0x1 rawerror保留，未skip/改raw/加假權限。已一次向Hank詢問這版內測單一誤報例外，以及新2ordinaryQAaccounts/3App虛擬相簿/3PNG+1兩秒MP4最多4providerID及精確清理授權；兩項都待實際回覆，預設選項/時間經過不是同意。新provider/帳戶/credential建立、Flickr寫入/刪除、後端部署與商店提交均0；舊7刪除終態不重建。

目前可下載85/default75仍原狀；本輪只讀version核對與current JSON為準。iOS兩次舊admissiontimeout後未再試，只有pool設定不能當恢復證據；實體Android由Hank拿到內測版後驗，iPhone後補。原HEAD/index/36rubric保持、全目標active未完成。


## 2026-10-17 test.94 已獲直接授權並發布內測

Hank直接回覆「允許這項例外並發布 test.94 內測版」及「允許這 4 份人工資料測試並清理」。第一項只豁免 exact94 官方gplay1.0.0將dataSync0x1誤讀的單一誤報，raw error保留；不擴及95預覽或商店提交。第二項限已凍結manifest SHA59399af64714fe259d16912db6ea460661541d9327d769123b9cf0a4ddd1be6e之2ordinaryQAaccounts/3Appvirtualalbums/3PNG+1兩秒MP4最多4新providerID與精確清理，家人資料保留，舊7刪除終態不重建；正式執行仍須先完成live安全流程。直接回覆收據見 `.codex-local/qa/20261017-internal-release94-proposal/direct-human-authorization.json`。

test.94已發布GitHub prerelease（非latest）：tag android-test-2026.10.16-94，commit 7757b77df5e14f062ebde8081f63cf8a6e38f5f3，APK13,794,077bytes/SHA bcc4f7cd499f1e524a98736f9ad49706bd2ecda157e9cbe707d94a8e526d6108。官方asset digest及實際公開下載HTTP200/bytes/SHA一致，當版19包內圖示資源與原圖/H及actual94mask/SDK36AppInfo再次核對。rootHEAD/index保留、未pushmain；95開發來源/網站web.4/backend70/default75均未修改。發布收據見同目錄 `publication-receipt.json`。完整六頁兩軸/36功能、Hank實體Android與iPhone仍待驗。


## 2026-10-17 所有用戶設定頁更新通知（來源候選）

使用者直接要求「時光相簿只要有更新版就在設定內通知所有用戶更新」（協調窗口轉交原文/時間與Sentinel見 `.codex-local/qa/20261017-all-users-update-notice/implementation-status.json`）。既有回饋通知僅限回報者，不能當所有用戶通知已完成。新增公開版本目錄與設定卡片來源，依Android內測/Play、iOS商店/TestFlight、Web分流；只用真可取得版本、每用戶每版已讀鍵，保留設定內查詢，資料不足/失敗不假報最新版；無email/推播或新憑證。每次後續發布須在包體/連結核對後更新相應公開目錄、保留可用證據，再隨已核准的網站發布遠端目錄；不可把未發佈候選放入。

本輪固定目錄只列已核對test94與web.4；320/1440正常及加倍font-token的隔離卡片、分平台與失敗/去重測試已通過，實際59檔公開打包包含script/catalog引用。不是OS字體/全設定/六頁正式或新原生驗收；初次缺Playwright瀏覽器、舊fixture漏bodyclasses的記錄保留不採。這項來源尚未部署或包入已發布94，95.4原預覽之後新增來源不能繼承凍結95.4舊截圖/獨立分數。無私人收件匣繞過。


## 2026-10-17 新4份人工正式資料驗證與清理完成

Hank本輪直接核准後，F1–F5工程問題已逐項修正／host故障驗證／獨立來源最終PASS，再執行一次正式70普通帳戶API＋人工媒體fixture，共20check/exit0。新provider ID 55593265362、55594405958、55593265512、55594406048，均核對3PNG/2秒MP4原檔SHA、中央owner/私密/runTag、標籤日期及App虛擬membership；B對已知A資源的讀取均拒絕。實際Chrome3圖解碼/影片duration2sec/currentTime1.070912，明示非productHTML/native/phone。

四份均在freshcentralidentity/私密/provenance/原檔證據後，只經own普通API刪除，signedgetInfo code1核對notfound；own2帳戶刪除receipt均dataErasureComplete/remoteErasureComplete/complete，舊會話401，3App相簿隨之清除。109列fsync/hashchain終態terminal已核對，不重跑/重建這四ID（與舊7ID合為保護終態）。既有家庭媒體操作0、新中央provider key/grant0；臨時QA密碼/token/刪除收據capability僅在受限SSD runtimefile，不在QA/公開記錄。實際結果與來源獨立gate見 `.codex-local/qa/20261017-public-provider-live4/`；完整原36/兩軸/真機/實際iOS仍未完成。


## 2026-10-17 95.8／backend71 刪除待確認恢復候選（未發布）

原95.5部分刪除後reload的OPEN邊界開始修正；保留95.7及其已驗範圍/原獨立報告，不把新來源冒稱已發布。新增本人刪除metadata/status查詢、傳輸中心持久待確認/手動接續，以及相集reload只依本人confirmed tombstone移除已刪URL ID、保留待確認入口。Pending不重開照片/影片/原檔；另封住舊有保留原檔在pending時仍可取的路徑，receipt status仍保留。未改刪除worker/schema/idempotent語意。

候選根版號95.8／server來源1.0.71-build2026.10.17.1；正式仍test94/backend70/web.4/default75，沒有新部署/新provider操作。隔離SSD實際HTTP/SQLite/currentHTML五組驗證通過：真UI批量partial→reload→transfercenter只重試失敗ID→清理→舊URL移除/再reload、B隔離、保留原檔和舊ticket仍404、receipt200、30+1分頁/<=200精確probe/無效query拒絕。15Node/60public inputs前後一致，Q只收report/PNG不收DB/password/originals。新03/transfer局部來源與恢復狀態獨立審查待回；完整兩軸/全狀態/native/phone仍未加分。來源與before、test、實際圖見 `.codex-local/qa/20261017-pending-delete-recovery/`。已刪11個正式人工ID保持終態，新本機900...fixture不接provider，不可重用已完成live4預算。

## 2026-10-17 95-R3 候選補查與發布界線

本輪依直接人類轉交範圍完成候選，不新增正式部署／發布授權。95.8恢復頁PDR-F1已由active/epoch與讀寫ticket修正，離頁返回合成事件5組及實際HTTP/SQLite/UI5組通過；獨立followup有界關閉，真正persisted BFCache未觀察到。新增GET窄白名單兩語言host19案/語言通過，iOS完整編譯/Keychain未藉此加分。

通知在實際settings/Accounts/account-config整合5組通過，獨立PASS_BOUNDED_SETTINGS_UPDATE_INTEGRATION；A/B/A已讀隔離、新版新鍵、503/retry與舊查詢跨新文件導航均為合成HTTP，只有served js/version metadata明示fixture，無DOM改寫。原module與正式目錄仍未部署到用戶；不能說已通知所有用戶。

最終Android95-R3 SHA d154bfffbecea317ccb0534d341c09985828d99d19a24f58a8f7cd4593be7ce3／13,801,742bytes，非debug／原testing signer。R2→R3只更新deletion-status.js；原94→R2→R3的19檔保存鏈、API26/36正常與API36fontScale1→2→1/WebView200有界通過，全部manager lease釋放，無重設資料。實際包內H/32/48/64mask及兩installedAppInfo本輪再次目視存在/樣式正確，不要求清楚辨字。來源／runtime／H／本機候選APK與backend/site封存見 `.codex-local/qa/20261017-android-installer95/`；尚未發布。

官方gplay1.0.0原始error保持，0x1來源已定位為typed FGS bitmask未解碼。工具修正與TDD/全preflight/CLI/實際原包及兩unsigned負控的可重現證據見 `.codex-local/qa/20261017-gplay-fgs-root-cause/`；不改APK/permission、不skip、不沿用94豁免，明示本機patch非官方新版本。8適用scanner執行，metadata因無listing目錄由原工具明示skip，9registry保持。backend71 flat89檔/Node24.22.0 startup/newGET/權限與static核對通過，package/lock僅version對齊71，deps不變；正式70未部署。

正式原六頁/兩軸/完整36/真人風格、Hank實機Android與iPhone/iOS Keychain仍未完成，不以本輪候選有界通過取代。原Planck拒絕、後續readonly核准、94單版例外、四份正式人工資料終態及所有失敗歷史保留。simplify仍可選，本輪未執行或冒稱通過。
