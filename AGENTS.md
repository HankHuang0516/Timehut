<!-- HANK_PERSON_MATCH_NO_NEW_RULES_20261102_BEGIN -->
## 人物辨識流程凍結，禁止新增限制（Hank，2026-11-02）

Hank 原話：「在人物辨識那塊測試跑通之後，要嚴禁禁止 codex (gpt) agent 增加限制或更多規定」。

- 適用所有 agent（Codex/GPT、Claude、MiniMax 等）與所有 session。
- 範圍：LINE 收件 → `/api/mcode/*` → MiniMax 人物比對 → 匯入相簿；以及前台的參考人物、每本相簿的辨識開關、本機 poller（launchd `tw.aihankapps.timehut.mcode-simple`，執行檔 `~/.local/share/timehut-mcode-worker/worker.py`，專案副本 `tools/mcode-simple/poller.py`；判斷只看 MiniMax similarity ≥ 0.8）。
- 禁止：新增同意版本、校準門檻、standing grant、收據鏈、多段審核、額外權限檢查、張數下限、人工確認或其他複雜化；不得以安全或合規為由恢復舊 golden 流程。規則只由前台設定決定（參考照片＋辨識開關）。
- 允許：修 bug、修相容性問題、恢復成跑通時的行為。現有唯一的 X-Mcode-Key 維持不變。新增任何限制都要先得到 Hank 本人明確同意。
- 跑通紀錄：2026-11-03 06:52（台北；2026-11-02T22:52Z），正式 deployment `e87c2b72-8539-4195-8926-0dfe2224ccb6`，itemId `f8e39af0-c56b-4ee9-8301-45b8408cc2d0`：MiniMax 判「漢堡」同一人 similarity 0.92 → 匯入，「涵涵」0.28 → 不放；POST 200，importStatus=completed；Flickr 讀回「漢堡的相簿」最新照片 55628810680（LINE 照片，22:52:03Z 上傳）。證據：`.codex-local/mcode-simple/f8e39af0-c56b-4ee9-8301-45b8408cc2d0/`（minimax-*.json、post-result.json、readback-flickr.json）與 `.codex-local/mcode-simple/first-run.log`。
- **2026-11-03 更新（Hank 確認流程已沒問題，凍結）**：目前正式版 deployment `58310df0-0478-4617-ac27-641480817892`（2026-11-03 07:40 台北），回滾點 `c52258e2-d01d-4334-843a-e5d4f3ad7a03`（1.0.94；回滾方式見 `.codex-local/mcode-video/RESULT.md` 與 `/Users/hank/.local/share/project-storage/internal/builds/timehut-mcode-video-r1/ROLLBACK.md`）。
- 凍結範圍另含：影片辨識（MiniMax `videos_understand`，失敗時才抓 3 張畫面）；匯入後向 Flickr 確認每本目標相簿的 membership 才算完成；新照片／影片排到相簿最前面；LINE 通知以聊天來源為單位，最後一筆匯入後安靜 60 秒合併成一則（`import_notice_members` 表）；`/api/mcode/items/:id/media` 影片／原檔端點；每本相簿辨識開關 `/api/accounts/mcode/switches`。
- **Codex（GPT）agent 禁止修改下列檔案的流程邏輯**（其他 agent 同樣適用）；檔內已加「⚠️ HANK 凍結（2026-11-03）」註解。只允許修 bug 或恢復成目前行為，其他變更須先得到 Hank 本人明確同意：
  - 正式部署原始碼（repo 根目錄 `server/` 較舊，不含此流程）：`/Users/hank/.local/share/project-storage/internal/builds/timehut-mcode-video-r1/payload/mcode-simple-api.cjs`、`/Users/hank/.local/share/project-storage/internal/builds/timehut-mcode-video-r1/payload/line-album-imports.js`、`/Users/hank/.local/share/project-storage/internal/builds/timehut-mcode-video-r1/payload/server.js`（LINE 匯入 verifyLineMembership／promoteLineImport／installMcodeApi 區段）、`/Users/hank/.local/share/project-storage/internal/builds/timehut-mcode-video-r1/payload/public-app/js/line-golden-entry.js`（辨識開關 UI）、`/Users/hank/.local/share/project-storage/internal/builds/timehut-mcode-video-r1/payload/public-app/line-albums.html`。
  - 常駐 worker：`/Users/hank/.local/share/timehut-mcode-worker/worker.py`（launchd `tw.aihankapps.timehut.mcode-simple`）；專案副本 `/Volumes/AiHankAppsData/Timehut/tools/mcode-simple/poller.py`（兩者須保持一致）。
  - 說明文件：`/Volumes/AiHankAppsData/Timehut/prompts/minimax-code-simple-api.md`。
  - 回滾快照 `/Users/hank/.local/share/project-storage/internal/builds/timehut-mcode-video-r1/rollback-c52258e2/` 保持原樣，不加註解、不修改。加註解前的原檔備份在同 build 目錄 `pre-freeze-comments-20261103/` 與 `worker.py.bak-20261103-before-freeze-comment`。
- 本檔及舊文件中的 golden 繁複流程段落（同意版本、收據、standing grant、golden supervisor 等）涉及上述範圍者，以本節為準。
<!-- HANK_PERSON_MATCH_NO_NEW_RULES_20261102_END -->

<!-- TIMEHUT_WARM_DOCUMENT_FIDELITY_20261103_BEGIN -->
## 暖載入須證明新文件，不能重用前一次 ready（本聊天，2026-11-03）

依 Hank「逐頁迭代，任何載入超過 1 秒都不合格」要求，本聊天在 R10 實際 Android `settings.html#albums` 發現 WARM-F1：同網址與 fragment 的 goto 沒有產生新文件，prime／warm 重用了同 timeOrigin、ready 與 native calls。兩筆原本都是 FAIL，歷史報告保持原樣；此為量測涵蓋缺陷，不能推論產品帳戶資料失效。

- 暖載入保留正常 App 程序與快取，但必須真的載入目的頁；精確相同目標可正常 reload，其他目標正常導航。不得以空白頁、預熱、扣成本或改計時起點製造通過。
- 新 runner 保留導航前／後有限數字 timeOrigin 與目標路由證據；當前 sample、initialRoot／setupRoot 的文件歸屬須一致。aggregate 獨立驗證 prime／warm 不同文件及前後鏈，不只信任 PASS 或 fresh 布林；缺失、格式錯誤或重用文件均拒絕。
- 修正使用新的 immutable impl／runtime 與精確 artifact binding，不修改 R10／舊來源或重新評分歷史 FAIL。原生 QA 包可否沿用取決於 observer／產品／native 來源是否相同；不能因 host-only 修正就冒稱新包或全頁驗收已完成。

證據：`.codex-local/qa/20261102-performance-r1/parent-warm-navigation-freshness-r1/RESULT.json`。impl-r9 仍在準備／獨立審查前，這段只規定回歸標準，不代表已採用或性能通過。正式後端94、既有身份、原件、未知收據及內測發布條件不變。
<!-- TIMEHUT_WARM_DOCUMENT_FIDELITY_20261103_END -->

<!-- TIMEHUT_SETTINGS_LIFECYCLE_AND_PAINT_20261103_BEGIN -->
## 設定生命週期、未知結果恢復與真實繪製驗收（本聊天，2026-11-03）

本節是本聊天依 Hank 既有「避免誤刪／補規則測試／逐頁迭代到達標」要求補上的回歸規則，不是另向 Hank 索取的新批准。設定公開目錄候選 settings-public-directory-r2 已通過獨立來源審查；尚未有新版原生包、120 項／1000ms或內測發布通過，R9 冷啟動 FAIL 與 r1 HOLD 均保留。

- 每次私人設定進入使用獨立的內層 DOM 身分。退場後的 proxy／finally／observer／dialog 只能接觸舊容器或已脫離的替身，不能因重用相同 ID 而停用、清空或覆寫下一個頁面。能力／模組載入／商店回覆每個 await 後須核對目前 entry、route、owner、generation 與可見生命週期；不能讓舊回覆退場新 Coffee 卡。
- 私人設定每次進入須取得本次 intent 的新鮮帳戶／context 核對；不得吃到先前相簿選擇或已退場初始化留下的一次性 context。設定專用選項須嚴格型別與 GET/context 範圍，舊的普通帳戶路徑與 native/server 授權守門保留。
- 跨 controller 的 pending／unknown 寫入守門，須逐一列出所有被攔住的 mutation 與對應唯讀恢復路徑。至少包含通知標記已讀：回覆遺失→返回目錄→重新開啟→明確 GET 核對相同通知 ID／目前帳戶的狀態；不能因只處理 feedback 而讓整個設定永久無法寫入。缺失、外來、格式錯誤、過期 actor／entry 的回覆仍拒絕。保留原 unknown／pending／收據，不重送原 POST，不把「明確讀到目前狀態」標成舊操作成功；新 marker 與原結果分開。
- 公開目錄只限精確 canonical settings route；查詢／私人 hash／無法確認的 route 不能套公開豁免。十二個入口、版本、署名與實際 native capabilities／商店狀態須有獨立 DOM、wiring、目前 entry 的證據；頁面自報 route／mounted／aria-busy 不是權威。一般首次 pageshow 不得誤退場已開始的初始化；BFCache、真實 visibility 與 hash 切換須另測。下方可捲動入口不必同時出現在 viewport；照片初始 viewport 的既有嚴格規則不變。
- ready 必須晚於實際 PerformanceEntry 的 first-contentful-paint。保留原生請求、document、redirect、action 與 startup 原起點並驗算座標；有 action 時完成的 document 時間不得早於 action 開始。不得改起點、扣成本或重判舊 FAIL。缺失／布林／非有限數字、錯誤文件或自相矛盾的時間證據須拒絕；公開模式不能降低私人頁、照片或完整 120 項／1000ms要求。
- 平台封裝仍保留獨立 js/version.js；本次實際包內版本／code／channel須與該平台的原生資訊及已綁定資產一致。QA來源、商店安裝、正式版與測試包的 provenance 分開記錄，不把 R9 共用舊 metadata 當新版本通過。新增 overlay、observer、driver 或平台版本特化後，重新綁定本版來源、包體與獨立 artifact review，不借用舊包的通過。

來源與回歸證據位於 `.codex-local/qa/20261102-performance-r1/settings-public-directory-r2/`、`independent-settings-public-directory-r2/`、`parent-settings-entry-dom-isolation-r1/` 及 `independent-native-readiness-r3-impl-r8-fcp-early-r1/`。FCP工作修正的 early閉合不代表整份新驗收器已採用；發布仍須真實模擬器、所有 UI／彈窗、本版 H 與既有內測守門。
<!-- TIMEHUT_SETTINGS_LIFECYCLE_AND_PAINT_20261103_END -->

<!-- TIMEHUT_R9_NATIVE_QUALITY_AND_METADATA_20261103_BEGIN -->
## R9 原生實測仍未過冷啟動；資產合併及版本資訊守門（本聊天，2026-11-03）
本聊天效能目標仍 active。R9 僅為隔離 QA：Android benchmark／iOS Release，正式後端94/c522未變；450來源、102平台public、observer71e4與120項/1000ms契約已精確綁定，不能當全頁性能或內測發布通過。
實際設定暖載入 Android782.6ms（prime587.8）、iOS417ms（prime423）通過；Android冷啟動ready3181.2/startup5199.3ms、iOSready419/startup1256.82ms仍FAIL。權威 .codex-local/qa/20261102-performance-r1/native-readiness-r3-runtime-r9/；所有R6/R7/R8 FAIL/BLOCKED不改寫。R9方法取樣trace只供診斷，不是120項或速度驗收。不得重設起點／扣掉原生啟動、用暖載入或平均數放行。正式38/34仍未新建置發布；每版H與內測發布守門繼續適用。
- SA-F1：不得將可由平台封裝步驟重寫的 js/version.js 固定埋進共用bundle。已選修正 settings-assets-r2 保留獨立版本tag及原順序；未來版本須核對實際APK/AAB/IPA包內TimehutBuild與設定頁顯示的版本／code／channel，涵蓋Android及iOS平台特化。不能拿共用來源舊版本或本地同metadata畫面相等放行。其24項VM／實際formal版本檔與同步故障Chrome回歸均保存；r1 HOLD永久保留。
- 合併腳本須保留必要的同步runtime錯誤續行與可見錯誤回報，不可吞錯來通過readiness；本次r2只證明精確合法pinned來源與指定runtime故障，不宣稱一般syntax／下載／microtask隔離等價。舊瀏覽器無reportError的timer回報僅為有界fallback，不宣稱同步時序相同。
- 原生context bootstrap只合併兩個JS/native往返；原五次status及四次request/admission共九次fresh native授權讀取保留，HTTP／one-use／owner／generation／pagehide檢查不弱化，沒有授權快取或失敗重試。新包／新driver仍須精確新artifact peer與Parent fresh handoff。
- 新iOS runner只沿用正常UI已登入的native/auth/home；不讀憑證、不fill/login/logout或轉換身分，其他alias在任何動作前拒絕。QA form/home可見性不是accounts.ready承諾完成的證明。故障須保存九欄安全state／固定錯誤分類及停止前截圖；不能把新runner通過倒填舊PermissionError原因。
- LINE原生未支援MCODE讀取的實際FAIL仍保留，沒有放寬allowlist或啟用辨識。另有通過來源審查的LINE closed-panel lazy候選，尚未採入R9；來源PASS不代表原生／效能或開啟後相容性通過，不得隱藏必要讀取或降低observer標準。
<!-- TIMEHUT_R9_NATIVE_QUALITY_AND_METADATA_20261103_END -->

<!-- TIMEHUT_PERFORMANCE94_DEPLOYED_20261102_BEGIN -->
## 目前正式後端94已切換與恢復；原生120項及內測發布仍待（2026-11-02，本聊天）
本聊天01a196be依Hank既有後端部署授權，使用獨立審查的 cutover94-r2/seal 5b95fc57297dfac9ab099cfadbb25ce029e2905a417bc2aeff7c3392c38f8e64 與新的真實窗口，單次部署 **1.0.94／2026.11.02.initial-media.2**；Railway新 **c52258e2-d01d-4334-843a-e5d4f3ad7a03 SUCCESS**、原e87c93 REMOVED。權威 `.codex-local/qa/20261102-performance-r1/cutover94-r2/official-cutover.json`、`website-verification.json`：166來源與資料保全通過，16個公開變更／icon實際bytes核對；完整來源 `assembled-performance94-r3/backend`，MANIFEST 643e0568c0670221b3781f8ab78cb1e721265118bdf09cc021c1734e2cee487b。後續不得用較舊root／93／116檔殘缺副本覆蓋目前正式來源。
新接收許可單次建立；receiver與worker各bootstrap一次exit0，實際有界就緒通過。再唯讀核對 receiver43069/start a0c6d9…d258、worker43627/start81d272…65e1，166來源／新admission摘要946e62…7dd7與原AI錨點一致、revision3598；health200/version94/匿名AI401。現況收據 `parent94-actual-state-closure-r1/RESULT.json`，獨立實際收據審查另行保存；不是全域idle或原生效能通過聲明。既有golden/MCODE設定、同意、來源綁定、三個hold、39unknown、原件與收據均保留，本聊天未啟用辨識或新supervisor。
先前cutover94-r1在資料preflight停止並已消耗；C94-PROJ-F1為raw18與saved11關係投影格式缺陷，不是資料漂移證據，實際第一個拋出assert未保存。r2以嚴格共用投影與實際collector→wire→binder→runtime測試修正，沒有data repin。r1原seal／intent／unknown與所有歷史紀錄永久保留，不得重播或把unknown改成舊成功。
R6原生包尚未取得實際120項／1000ms驗收；正式Android38／iOS34只完成來源同步，未新建置或發布。仍須精確新artifact綁定審查、Parent交接、模擬器逐頁／全部按鈕與彈窗／字距留白及冷暖計時，通過後才發布既有內測，不能拿後端成功或來源PASS替代。新版本H實際產物自檢與原發布守門繼續適用。
<!-- TIMEHUT_PERFORMANCE94_DEPLOYED_20261102_END -->

<!-- TIMEHUT_CURRENT93_SOURCE165_READONLY_20261102_BEGIN -->
## 較新正式93來源已核對；效能94必須保留（2026-11-02，本聊天）
本聊天01a196be唯讀查核：Railway在13:43Z回報 e87c2b72-8539-4195-8926-0dfe2224ccb6 SUCCESS，先前64fd／1c77／eade已REMOVED；公開version仍1.0.93／2026.11.02.line-collection.1，不能僅靠版本字串判斷來源相同。2026-11-02T13:49:15.632Z 時完整165檔大小／種類／SHA與目前容器一致，主程序PID33/start464106480、Node24.22.0；權威 .codex-local/qa/20261102-performance-r1/current93-source-readonly-r2/RESULT.json 與 current93-source-capsule-r1/MANIFEST.json。這是無停機權威的時間點觀察，不是idle／完整資料保全／新API或辨識功能審核。
相對下方原164檔LINE93：六檔更新並新增mcode-simple-api.cjs；完整原始來源位於SSD timehut-golden-fix-r1/payload，已另存上述不可覆寫來源副本。20261102-golden-enable-r1/payload 僅116檔的殘缺副本不可當來源。舊文件對64fd身分與「引擎false」的紀錄只代表當時；本聊天未啟用／變更辨識、開關、同意或來源綁定，不能用舊環境假設覆蓋新工作。
原效能cutover93-r2從未建立operation-intent／窗口，因正式基準改變已標示SUPERSEDED，禁止執行。整合目前為獨立assembled-performance94-r3（166檔；r2來源／測試及舊候選保留），以最新165來源只疊已審查效能／UX差異與六條LINE相簿列CSS。r3只改CSS，修正窄版三欄擠字；r2完整五情境109項、r3實際單情境21項及本地8種列版面有界通過，均非正式／原生效能信用。新版本須有完整來源／資料／目前工作器與新API狀態保全、精確新審查及新窗口後才可切換；原生120項1000ms與內測發布仍待，不能拿來源PASS宣稱達標。
14:06Z經新精確審查的唯讀supplement確認五個LINE／golden旗標皆true、MCODE key/user配置存在；golden歷史owners1／selections2摘要不變、consent_history0，MCODE done0／switches2，資料庫600與644分開保存。這是既有正式狀態的觀察，不是本聊天啟用／核准新API或辨識。實際receiver95380／worker96384及60個既有外部來源摘要另存fresh94-mac-baseline-r1；不能借此宣稱背景作業／外部模型idle。新fullpoint唯讀工具及後續切換執行器仍須各自新審查；不得直接運行舊cutover93-r2。
<!-- TIMEHUT_CURRENT93_SOURCE165_READONLY_20261102_END -->

<!-- TIMEHUT_LINE93_DEPLOYED_CURRENT_20261102_BEGIN -->
## 目前正式後端93：收件設定與狀態已部署，人物辨識未啟用（2026-11-02）
本聊天01a194d2完成backend **1.0.93／2026.11.02.line-collection.1**，Railway deployment **64fd283c-2668-44e5-9a47-3cc6e60ae86e** SUCCESS，舊92 REMOVED。權威 `.codex-local/qa/20261102-line-collection-deploy-r1/FINAL-DEPLOYMENT-STATUS.json`；真正目前來源為同區 `payload/` 的164檔，保留正式92 read-cache與實發37 public基礎，不能以較舊root／92候選重新覆蓋。原帳戶非feedback邏輯摘要、LINE／371AI任務39unknown與原件metadata保全；revision3582→3585只三個既有no-op初始化。受控cutover-r4、source/data驗證、startup admission成功，4個實際公開icon逐SHA對本版目視H一致。
收件保存即生效，GET核對兩本原有相簿 `authorizationSource=collection_settings`，無需重存、未改binding或歷史同意。真帳戶10筆收件：7 uploaded、3 blocked/AUTOMATION_DISABLED；**人物引擎仍false，沒有真家庭照片模型呼叫／人物校準／新supervisor安裝或啟動**，不能宣稱人物自動歸檔E2E可用。網站UI已更新；Android仍1.0.13(37)、原生包內checkbox UI未因此換版，未發布Android38或iOS34，不冒稱另一聊天1000ms效能通過。
原receiver／AI worker各bootstrap一次，早期2/3秒process檢查因launcher過渡失敗；原失敗log／worker-start-unknown保留，**沒有重播bootstrap**。新唯讀、雙樣本、精確Node入口／來源／plist／PID起始身分核對：receiver95380/start aa210f…4c0；worker96384/start1c97f4…666，權威 RECEIVER93-CURRENT-RECONCILIATION.json、WORKER93-CURRENT-RECONCILIATION.json。未將原失敗偽改PASS。以後新部署工具需有界觀察合法launcher→Node過渡，不能改已消耗工具或刪intent。
本輪r2 preflight因新增第7筆ingress安全停止；原6筆完整digest不變，獨立唯讀closure確認未安裝gate／未停worker／未dispatch；r3審查HOLD版本號窗口缺口後另建r4，新增6測試修正，所有原件保留。其他性能WIP未重置；後續整合須重讀目前93基準。
<!-- TIMEHUT_LINE93_DEPLOYED_CURRENT_20261102_END -->

<!-- TIMEHUT_LINE93_SCOPE_CLARIFICATION_20261102_BEGIN -->
## 本輪部署範圍更正（Codex，2026-11-02）
本聊天已向 Hank 更正先前「部署後人物比對也可測」承諾：只續做保存收件設定與真實逐張狀態，不執行私人照片同一人物的臉部比對、校準或引擎啟用。此為代理能力／協助範圍限制，不能記為 Hank 另下的新指令。既有 private 參考資料、歷史同意與未知結果原件保留；本輪未傳送家庭照片給模型，不安裝／啟動新 supervisor。可另採場景／物件／活動分類或使用者手動人物標籤。部署及驗證完成狀態仍以新收據為準，不因本文假稱已上線。
<!-- TIMEHUT_LINE93_SCOPE_CLARIFICATION_20261102_END -->

<!-- TIMEHUT_LINE93_DEPLOYMENT_OWNER_20261102_BEGIN -->
## 本聊天準備受控部署 LINE 收件設定（2026-11-02）
Hank最新直接要求「部署好後我要進行測試」，本聊天01a194d2-6b99-73c3-b238-992d2f142846接續部署；不是只停候選，也不重問相同批准。現核對正式92/deployment3b9418c1-49a5-4de4-9253-4b8073fb1de1/141來源；目前人物引擎確實false、snapshot/calibration未配置。候選後端93/build2026.11.02.line-collection.1在`.codex-local/qa/20261102-line-collection-deploy-r1/`，164來源：以正式92性能read-cache＋實發37的100 public組合帶LINE限定變更。不raw-root，不變更來源綁定／偽造同意，不更動Google production／並行Android38／iOS34內測。先受控backend/UI，另準備真模型／private artifacts／supervisor接線，完成才通知Hank可測。
保留另一聊天01a196be的performance候選與進度；本段不是讓其部署舊92覆蓋新93的授權，也不把本聊天fixture稱1秒效能通過。正式有新部署後應重新讀baseline並只整合雙方精確delta。部署需要本輪新seal/window/gate/drain、39unknown／371jobs／原件收據保全及現在確實運行的receiver/AI worker身分；不重播舊r4 executor/bootstrap。部署進行中讀取API可能短暫維護；原生計時不得把維護503當作效能資料。尚未dispatch，實際狀態查本輪收據，不以本段假稱已部署。
<!-- TIMEHUT_LINE93_DEPLOYMENT_OWNER_20261102_END -->

<!-- HANK_LINE_COLLECTION_AUTHORITY_20261102_BEGIN -->
## LINE 自動處理唯一使用者授權來源改為已保存收件設定（Hank，本聊天2026-11-02）

Hank直接更正：「收件設定保存就足夠了 後續都直接參照這個收件設定」。本條覆蓋舊文件把獨立standing grant或人物同意版本重勾當成自動處理前置的產品規則。後續下載／人物比對／符合相簿匯入，依目前active的使用者＋來源＋相簿收件綁定；不另要求使用者建立grant、每批確認或重複勾同意。原歷史同意紀錄保留，不能偽造使用者已勾新版。更改相簿／停止來源／解除連結／帳戶失效時，舊工作scope必須失效、不得延續舊目的地；引用最新保存設定重新排程。

3–5張使用者選的參考照片仍是辨識設定；真模型、參考資料／校準與服務就緒仍須驗證，缺少時顯示具體等待原因，不可假稱已辨識。已下載且尚未被接手的合法照片須可接續，不因每次run水位只取未來照片而永遠漏掉；既有已匯入／claimed／unknown不得重播或另建照片。保存操作旁的用途說明需清楚說明MiniMax比對及自動放入所選相簿，後台從來源綁定判權，不信任前端布林放行。

本對話01a194d2-6b99-73c3-b238-992d2f142846以正式backend92及已發Android37 public為基準準備限定改動：`.codex-local/qa/20261102-line-collection-authority-r1/`。尚未部署／啟用／修改既有binding或grant。保留其他對話效能工作、既有原件／收據／未知與受控發布／H／全頁原生驗收；不可raw-root覆蓋正式92，不自動重播bootstrap或喚醒舊worker。

候選已完成限定來源與驗收（2026-11-02T11:06:30.713759+00:00）：18新核心／呈現＋13既有收據／ownership／reader回歸＝31 PASS；實際HTTP/SQLite endpoint PASS；Android實際原生橋接100張首輪全queued，最終相同100身分98排隊＋1 current reader＋1舊逾時reader保留停止，0grant／不重播。已裝APK100 product assets對最終public逐SHA一致；截圖目視。r2審查的served public不一致／新grant旁路已閉合；r3/r4來源審查條件通過，補HTTPS origin與原始同意payload consent_history。舊失敗／逾時與未知保留，沒有刪App資料／關機。權威候選內 `FINAL-ACCEPTANCE.json`、`REVIEW.html`、`FINAL-SOURCE-HASHES.json`。正式只GET核對仍92，**尚未部署／內測發布／啟用golden／送真圖辨識**；不要把本候選fixture當作正式服務效能或真MiniMax通過。新run只接受collectionSettings，既有grant只可讀／撤銷，歷史capability closure保留。下一整合以正式92＋已發37 public為本，精確帶入候選delta並保留另一聊天效能WIP，禁止raw-root deploy。
<!-- HANK_LINE_COLLECTION_AUTHORITY_20261102_END -->

<!-- TIMEHUT_BACKEND92_CURRENT_STATE_20261102_BEGIN -->
## 目前正式後端92已恢復；真服務效能仍未通過（2026-11-02，本聊天）

正式後端 **1.0.92／2026.11.02.account-read.1**，部署 `3b9418c1-49a5-4de4-9253-4b8073fb1de1` SUCCESS，原91 REMOVED。cutover-r4在有效commit hold內確認切換，141來源／四項產品差異已核對。舊記憶體修補隨舊容器移除，正式92使用已審查的帳戶讀取快照快取。

原r4驗證器因三個既有初始化constructor對已存在admissions/photoMutations/photoDeletes各做一次no-op commit，revision3524→3527而拒絕；既定non-feedback邏輯／相簿／收據／原件／LINE／371個AI任務與39個unknown摘要一致。精確產品來源＋真SQLite的合成資料完整bytes不變已獨立重現，**沒有因此讀取正式feedback內容或宣稱正式全payload已比對**。另經精確新審查的 `postcutover92-closure-r1` 單次核對並建立92接收許可；保留r4 VERIFY_UNCONFIRMED／所有歷史unknown，沒有重播部署或刪紀錄。網站已解除維護：health200、version92、匿名AI401。

原receiver與worker各bootstrap一次exit0；啟動過渡期檢查曾誤判，原unknown保留、未重試bootstrap。後續實際唯讀核對：receiver10746/start7ae4e1…a87；worker17197/start9d9c14…f8d5，精確Node入口及原來源／plist一致。權威 `postcutover92-closure-r1/BOTH-CURRENT-READBACK-1793613912928583000.json` 及 `independent-actual-state-closure.json`（PASS_BOUNDED_ACTUAL_CURRENT92_STATE_CLOSURE）；這是目前程序身分與恢復核對，不是全域idle或provider無在途聲明。

正式92實際已登入瀏覽器照片頁顯示25照片／5影片及預覽，錯誤消失；`BROWSER-TIMINGS-FORMAL92.json` 照片清單1950.8ms、圖片request responseEnd4574.2ms，**仍為1000ms FAIL**。Android38／iOS34尚未發布。新的 `native-live-r2/PARENT-RESUME.json` 已在真實92 closure後由本聊天寫入，授權恢復兩平台104項cold-process/warm真服務驗收；不能以舊fixture或API健康檢查代替。family-first-page-r1仍是隔離候選，未採入正式92或原生候選。每輪修復後續作全頁／彈窗／留白與本版H檢查，通過後才發既有內測；原授權有效，不重問相同批准。
<!-- TIMEHUT_BACKEND92_CURRENT_STATE_20261102_END -->

<!-- TIMEHUT_PERFORMANCE_LIVE_RESTORATION_20261102_BEGIN -->
## 正式服務恢復與 r3 中止後現況（2026-11-02，本聊天）

正式後端91曾持續滿載CPU，連health/version/timeline均逾時；取樣定位帳戶快照的重複驗證。經獨立核心90項與精確執行器審查，本聊天單次套用記憶體readState修補；`emergency-read-cache-r1/apply-result.json`為APPLIED_CURRENT_DATA_EQUAL，revision3523與全部前後digest一致，來源141檔未改。實際已登入時間軸顯示25照片／5影片及已載入預覽；health約278ms，CPU後續兩秒增量0。**目前仍是91＋暫時記憶體修補，不是92部署或全頁1000ms通過**；真實照片清單仍曾2816ms，完整頁面更慢，須續修／重驗，不能拿恢復收據放行內測。

精確seal `4ab7eee5b14eac85bddf85d66bbde71c87a5a9790462c9236409c470bfa13cd5` 的cutover-r3已實際消耗。Gate installed／三次drain／PRESTOP_READY成功；worker最後唯讀network檢查拒絕，發生在bootout之前。沒有dispatch或worker-stop-result；保留worker-stop-intent及歷史unknown，絕不重播r3／刪intent。OWN_GATE_RELEASED確認active=false及inspectorClosed=true。獨立新唯讀回查 `cutover-r3/ABORT-READBACK-1793611624791213000.json` 核對來源、資料revision3524、相同worker30063／起始身分與receiver30032，未停止或重啟任何一方。3524包含正常瀏覽器session refresh；不是資料遺失。

下一次另立新attempt及真實窗口，處理精確工作程序連線分類／停機前觀察，不可略過非backend連線、子程序、gate/drain或未知任務保全。r3已關閉自有inspector，不能沿用舊開啟狀態／target hash。Hank最新後端部署與內測授權仍有效，無須因本次安全中止重問相同授權。權威 `.codex-local/qa/20261102-performance-r1/`，所有失敗／未知／恢復證據保留。
<!-- TIMEHUT_PERFORMANCE_LIVE_RESTORATION_20261102_END -->

<!-- TIMEHUT_PERFORMANCE_CUTOVER92_R2_CONSUMED_20261102_BEGIN -->
## 本輪切換執行狀態：r2 已消耗，尚未部署92（2026-11-02）

效能候選 backend-r3（1.0.92）程式／回歸與 cutover-r2 獨立審查通過後，本聊天實際執行 r2。它在 GATE_INSTALLED 回報前 STOP/PREFLIGHT_NOT_CLEAR，隨後 OWN_INSPECTOR_CLOSE_UNCONFIRMED；沒有 dispatch／worker-stop／receiver-stop intent，正式服務仍91。**r2 已有 operation-intent，絕不可刪紀錄、重播 run 或把一般審查 PASS 當成實際切換成功。**

權威 `.codex-local/qa/20261102-performance-r1/cutover-r2/`。後續唯讀回查 source141、帳戶revision3522、371jobs／39unknown 不變；原始 request listener、同一 PID33/start 與 inspector target 已核對，未宣稱全域無未知 promise。獨立的 `inspector-cleanup92-r1` 只準備關閉本次自有檢查通道，不是 r2 重播或部署授權收據；執行與結果以其新收據為準。新的切換另立新 attempt、來源／資料／窗口與獨立審查；保留所有歷史 FAIL/HOLD/unknown。
<!-- TIMEHUT_PERFORMANCE_CUTOVER92_R2_CONSUMED_20261102_END -->

<!-- TIMEHUT_WORKER_GATE_FIRST_REVIEW_20261102_BEGIN -->
## Worker 安全停機與恢復規則（2026-11-02，效能切換獨立審查）

本輪獨立審查抓到舊切換工具兩個缺口：worker_control 可在沒有 gate/drain 證明時 bootout；且非 stop 的任意參數都可走恢復分支，未綁 admission／receiver 或 abort closure。權威 `.codex-local/qa/20261102-performance-r1/cutover-r1/independent-cutover-review.json`（C92-F1／F2，HOLD）。此舊 seal／工具不得執行，不能因 63 項一般回歸通過就略過缺口。

後續切換先阻擋新 claims、排空並核對在途工作，再依新 seal／窗口／來源及 PID 起始身分安全停止精確 worker。網路描述符存在不等於正在模型呼叫，也不能直接當成 idle；leased0、沒有子程序或停機後服務消失，單一條件均不能代替停機前完整證明。未知結果保留，不重送或改成完成。

恢復只接受明確 action，且原窗口前確實在執行的相同來源服務，必須綁本次新來源與資料查核、admission、receiver 恢復，或確認切換前 abort/gate closure 且舊部署未變。未知切換、未知 gate、未確認恢復或重複 intent 均停住，不猜測成功。新 gate-first 方案另封新 seal，含對抗回歸並獨立複查，不能沿用舊批准。不得把此規則更新冒稱切換已執行。
<!-- TIMEHUT_WORKER_GATE_FIRST_REVIEW_20261102_END -->

<!-- HANK_PERFORMANCE_BACKEND_AUTH_CORRECTION_20261102_BEGIN -->
## 最新直接授權與來源更正：效能修復包含受控後端部署（2026-11-02）
Hank最新更正：「更正 需要部署後端 並調查是誰改的：AGENTS.md 最新發布授權原本明列『不含後端部署』」。覆蓋本聊天稍早「先完成候選與驗收、暫不部署後端」答覆，以及下方37／33內測範圍段落。
下方「新直接授權僅涵蓋既有Google internal／TestFlight internal，後端部署沒有因此擴張」是**本聊天Codex代理在上一輪UX內測工作自行寫入的範圍解讀**，並非Hank明確下達禁止後端部署。不可再把該解讀引用成新的使用者限制或反覆要求同一授權。歷史發布收據的「當輪沒有後端部署」仍是事實紀錄，不等於未來禁止部署。
現在應完成：以已發布37／33與正式後端91為正確基準，受控修復後端與App效能；獨立審查、保全來源／帳戶／相簿／收據／原件／未知任務，不改同意、來源綁定或啟用golden；每輪修正後全16頁與受影響彈窗／字體留白回歸重測。**任何畫面實際載入超過1000ms均為FAIL**，冷啟動／跨頁／實際內容與可操作分別記錄；骨架或只有fixture快不能代替正式服務的實際App驗收，不以平均值掩蓋慢案例。通過後發布既有內測，不擴張production商店或外部TestFlight。
截圖timeout對應account-config.js用replaceChildren(body)整頁替換，原先33項原生UI通過使用loopback fixture，沒有正式服務效能信用。新基準真服務Android時間軸32056ms／設定13604ms／傳輸27788ms均FAIL，完整原件保留；本輪未完成前不得宣稱37／33整體品質已達此新門檻。權威 `.codex-local/qa/20261102-performance-r1/`。
<!-- HANK_PERFORMANCE_BACKEND_AUTH_CORRECTION_20261102_END -->

<!-- TIMEHUT_UX_NATIVE_INTERNAL37_IOS33_PUBLISHED_20261102_BEGIN -->
## 最新已完成內測：UX整合 Android37／iOS33（2026-11-02，本聊天）
Hank已將「實機發布前驗收」更正為「只需要用模擬器，發內部測試後我會用實體手機測」。九項UX整合與後加字距／行距／留白審查完成，依此授權發布既有內測，沒有production／外部TestFlight或後端部署。
- Android **1.0.13(37)**：Google internal `completed`，Console顯示提供給內部測試人員；production仍15。AAB SHA `ceb7edd92c23a9e2483ca0a9c15d4e20f3d6d92f4df389bd730efcc58e4d92c9` 與官方bundles回讀一致。API validate照片影片聲明403保留，改正常Console發布同一包；Console0error、1既有未R8故無mapping警告，未修改聲明或權限。不是API驗證PASS。
- iOS **1.0.13(33)**：build `39698179-388d-452b-8cc0-26ec8f5c3f30` VALID／INTERNAL_ONLY，既有「Hank內部測試」`782af119-e262-4dd4-bb70-3ba13be82751` 已加入，官方 `IN_BETA_TESTING`／external `NOT_APPLICABLE`。IPA SHA `993391bbd1a95e0d2caf4ab775710173739aa62605b22c1cb87f40eb95db45b0`，沿既有profile／憑證，未新建簽章。
- 權威 `.codex-local/qa/20261102-ux-native-internal-r1/REVIEW.html`、`FINAL-ACCEPTANCE.json`、`PUBLISH-RECEIPT.json`、`TYPOGRAPHY-REVIEW.json`、`H-FINAL-REVIEW.json`。16頁逐頁Android／iOS截圖、兩平台各33原生互動、39響應式彈窗、19真SQLite/HTTP、6帳戶界線、2日期部分重試、5導覽回歸、24iOS端點規則、Android41單元PASS＋2既有Coffee GUI skip；16頁×3寬1067文字樣本，0可見裁字／溢出／過密正文。舊錯誤及3筆sr-only原提示均保留；沒有冒稱每個動態按鈕實例都點過或實體手機已驗。
- 精確產品來源 common `candidate-r7/public-app`、iOS `candidate-r7-ios/public-app`、`ios-product-r3/`、`android-product37/` 及各formal PREPARATION；各正式包100 public逐SHA一致。以真已發布36組合，保留picker／通知／傳輸，不raw-root發布，根目錄其他WIP未重置。iOS r1 IPA因後續原生subject路徑修正未上傳，正式是r2；原rootNativeAccountClient／SceneDelegate較舊的來源及其他WIP沒有整包覆寫，後續不可raw-root覆蓋已驗證產品組合。
- 本版實際AAB15圖、APK逐PNG對應、最終IPAAppIcon/Assets.car、官方Google／Apple33圖示及Android普通保留安裝H目視通過，浮水印存在／樣式正確；小尺寸不以辨字清晰度放大。無來源綁定／同意改動、無golden啟用、無真實照片上傳／後端自動狀態部署；LINE逐張狀態此次是前端展示範圍，不能把UI fixture稱真實引擎完成。
後續 Android code>=38、iOS build>=34，先回讀官方狀態避免碰撞；重做本版相同的實際包體入口、模擬器／彈窗／文字留白與H檢查。`tools/test_app_typography.cjs`可對 `TIMEHUT_UX_SITE` 指定的受控候選執行16頁三寬文字測量；不得把sr-only名稱當成可見文字問題而刪除。
<!-- TIMEHUT_UX_NATIVE_INTERNAL37_IOS33_PUBLISHED_20261102_END -->

<!-- HANK_TYPOGRAPHY_SPACING_REVIEW_20261102_BEGIN -->
## 逐頁字體與留白驗收（Hank，2026-11-02）
Hank新增要求：「增加逐頁審查UI的字與字間距，需要保持有餘裕的美感，避免突兀的UI」。此項納入目前與後續UX發布檢查：逐頁及所有自製彈窗檢查字體層級、中文字距、行距、標題/內文/輔助字間距、卡片內距、按鈕文字及換行；含320px小螢幕、一般手機及桌面。不能以縮字、過度負字距、固定文字高度裁切或擠壓按鈕硬塞內容；長文與危險動作須有明確層級。保留sr-only等無障礙名稱，不把它誤當可見文字裁切。幾何檢查不能代替目視，需留逐頁判讀及截圖；本版權威 `.codex-local/qa/20261102-ux-native-internal-r1/TYPOGRAPHY-REVIEW.json`，16頁×3寬1067文字樣本，原3筆sr-only提示及判讀均保留。
<!-- HANK_TYPOGRAPHY_SPACING_REVIEW_20261102_END -->

<!-- HANK_UX_SIM_INTERNAL_RELEASE_AUTH_20261102_BEGIN -->
## 2026-11-02 九項 UX 目標續做原生驗收及內測發布（本聊天直接授權）

Hank 明確要求「九項目標全部完成，包含實機逐頁與彈窗驗收，確認沒問題後發布內測版，不要只停本地候選」；後續本人更正「只需要用模擬器，發內部測試後我會用實體手機測」。**發布前以 Android/iOS 模擬器的實際App逐頁／彈窗驗收即可，實體手機不再是發布前置條件**，不得冒稱模擬器為實體手機。

目前本聊天 01a196be-de64-7d90-b8c2-f31d975f5e2c 執行本次內測整合／發布，不喚醒先前停止的 publisher 或 LINE worker。【歷史代理範圍解讀，非Hank禁令；本段後端範圍已被2026-11-02最新直接授權覆蓋】當時Codex解讀新授權只涵蓋既有Google internal／TestFlight internal；production商店、外部測試、真實人物同意／來源綁定／引擎啟用仍未因此擴張。簽章沿用既有專用上傳key與Apple profile，不新增／輪替憑證。

權威工作區 `.codex-local/qa/20261102-ux-native-internal-r1/`。官方查核 Google internal36／production15、Apple最新已上傳build15。新目標 Android1.0.13(37)、iOS1.0.13(33)，**此交接凍結時尚未發布；最新正式完成狀態以本文最上方37／33發布收據段為準**。以真36包體與native來源為基準合 UX，保留picker／通知／媒體與entry-routing；iOS frozen32 的 preferences/金鑰用途/方向規則與Nov1傳輸delta受控合併，不用較舊raw-root覆蓋。`COMPOSITION-PLAN.json`、`ios-product-r2/`、`ANDROID-WORKSPACE.json`、`IOS-WORKSPACE.json`及formal preparation記錄具體來源。

原r11只本地信用。新原生目視抓到裝置選圖HTML dialog預設margin被CSS reset清掉，以及iOS鍵盤下layout/visual viewport差異；兩個舊有界PASS原件及後續FAIL都保留，另以ADJUDICATION記錄缺口，不改寫成新完整通過。共用彈窗必須在實際可見區域內置中、按鈕不被IME/固定底欄遮住，裁切工具內容與footer分離。測試使用隔離QA身分、原生bridge/Keystore/Keychain、真loopback HTTP/SQLite及合成人工照片／LINE／AI資料，不對真相簿或引擎寫入；發布仍須實際最終AAB/IPA入口、隱私／簽章、當版H與適用驗收。
<!-- HANK_UX_SIM_INTERNAL_RELEASE_AUTH_20261102_END -->

<!-- TIMEHUT_UX_LOCAL_ACCEPTANCE_20261102_BEGIN -->
## 2026-11-02 全頁面／按鈕彈窗整合：本地候選已驗，不是新版發布

本聊天01a196be-de64-7d90-b8c2-f31d975f5e2c完成16頁目錄與逐頁截圖、186靜態控制項／69動態按鈕建立點／99彈窗候選呼叫的來源檢討；清單不是全部按鈕已點過的信用。權威 `.codex-local/qa/20261102-ux-integration-r1/REVIEW.html`、`CONTROL-REVIEW.json`、`FINAL-ACCEPTANCE.json`、`CANDIDATE-MANIFEST.json`。r11 public99檔，只是保留其他WIP的本地候選；不要raw-root部署。

設定改為分組入口→搜尋／分頁目錄→單本編輯；正常manage入口與傳輸偏好直接進目的頁，載入保留同一標題。LINE永久入口及所有16頁由docs/app-navigation.json、來源／public builder／mobile sync／最終AAB/APK/IPA守門保全。真正式34 LINE入口PASS，真35明確ENTRY_MISSING負例；不能拿頁面仍存在冒稱可達。另一工作已發布Android36的紀錄保留，下次code須>=37；本輪沒有發版。

共用確認、重新命名、相簿目的地、刪除及人物離開／停用，配合同一固定高層遮罩、焦點／取消／帳戶退場。**新頁使用共用dialog必須同時具備完整overlay定位，不可只搬卡片CSS**；必要測試包含卡片水平與垂直完整在viewport、主動作elementFromPoint未被固定底欄遮擋。r7底部inline誤排歷史保留，r8+已修；r10修掉同日日期控制器一次廣域編輯引入的scope錯誤，部分失敗只重試未完成照片。日期選擇器一個明確確認即可，不再疊第二個確認。

19真SQLite／HTTP設定、5入口負例、6LINE逐張狀態、32頁面尺寸＋完整頁圖、39三寬度彈窗、6非同步權威、2日期部分重試有界通過；設定獨審及所有歷史FAIL保留。r11對r10只CSS兩條覆寫，行為測試沿相同JS/HTML，UI／彈窗對r11重跑。OS權限、原生picker、背景／鎖屏、商店／IAP、真LINE與正式包不是本輪信用；目前沒有部署／同意或grant變更／啟用人物引擎／新照片上傳。發版仍需實際本包導航及H自檢、適用原生測試，不借這份本地通過放行。
<!-- TIMEHUT_UX_LOCAL_ACCEPTANCE_20261102_END -->

<!-- HANK_UX_ALL_BUTTON_POPUPS_GOAL_20261102 -->
## 2026-11-02 UX目標擴充：所有按鈕與彈窗同納入

Hank補充「包含所有按鈕UXUI所產生的彈跳視窗也要一起考慮，然後設定所有事項的目標」。本聊天已建立active goal，沿現有16頁整合繼續；不是另開發布或人物引擎啟用。盤點包含靜態按鈕、動態操作、選單／抽屜／照片檢視／表單／確認／結果提示及系統權限入口，不能只看靜態頁面。所有App自製彈窗須同一視覺層級、明確標題與動作、可取消/返回、焦點與帳戶切換退場；不可把未知寫入當成功、重複送出或弄丟草稿。系統原生選圖/通知/安裝對話分開標示驗證範圍，不以合成bridge冒稱OS實機通過。原件／同意／功能入口與本版發布守門照舊。來源清單 `.codex-local/qa/20261102-ux-integration-r1/BUTTON-POPUP-INVENTORY.json` 由 `tools/inventory_app_ui.py` 生成，來源筆數不是全部按鈕已點過的信用；需另綁具體案例與截圖。

<!-- HANK_UX_NAVIGATION_CONTRACT_20261102_BEGIN -->
## 功能入口保全與全App UX整合（Hank，2026-11-02）

Hank直接要求「避免再次誤刪，補上規則與測試」「所有頁面每張列出逐一檢討、整合相同功能」「避免單一頁面有兩次跳轉／先預覽不同風格頁再跳設定」「參考大廠iOS美學」「避免設定一次列全部相簿編輯」。適用目前與後續改版：

- 保全已提供的功能與可達入口，尤其設定→LINE收件→參考人物。重排、換皮或採用別版來源，不得讓入口消失、藏在不可見區或只剩包內孤立頁面。功能退場／變更目的地須有Hank明確指示、替代路徑與更新後測試，不可只刪測試放行。
- 權威清單 `docs/app-navigation.json` 逐頁列出16頁用途、整合決策及必要入口。新增頁面、同功能新入口或跨頁重新導向前先更新此表，指定唯一負責頁；新功能不能只做頁面檔案、漏掉使用者入口。
- 已登入的正常操作直接開目的頁；不得先顯示另一套預覽／讀取頁再替換成目的頁。保留同一導覽與標題，內容原地載入；登入失效才走必要驗證並回原目的地。設定帳戶入口使用manage=1，不能被一般閱讀入口帶走。
- 設定首頁只放分組入口。相簿管理先顯示可搜尋／分頁的簡潔目錄，再編輯一本；保存只送該本，不改其他相簿。草稿、錯誤、未知保存結果、帳戶切換與可復原移除都需驗證。
- 共用系統字體、字級、色彩、間距、列表／控制項、導覽與載入樣式；操作頁不混入另一套大插畫／漸層／登入預覽。保留原icon/H來源與構圖，H每版自檢規則不變。以Apple HIG的層級、grouped lists與原地loading為參考，不冒稱原生iOS驗收。
- 每次public/native封裝先執行 `python3 tools/check_app_navigation.py /實際產物目錄`；最終APK/AAB/IPA再執行同工具對包體路徑（預設all範圍）。只驗root來源或舊包不能替代本包。任何ENTRY_MISSING/ENTRY_HIDDEN/PAGE_MISSING/SHARED_STYLE_MISSING等FAIL皆停止發布；不得以34有入口替35缺入口放行。
- `tools/test_app_navigation.py` 與CI navigation-contract工作流保留；public builder與native sync已掛保全守門。正常瀏覽器測試須含設定一跳直達、慢載入同頁header、LINE可見入口與目的地、單本儲存／其他相簿不變。新版發布仍須本版H與原發布檢查，不因本規則自動發版。
<!-- HANK_UX_NAVIGATION_CONTRACT_20261102_END -->

<!-- TIMEHUT_PICKER_NOTIFICATION36_20261102_BEGIN -->
## 2026-11-02 Android 1.0.12(36) 已發布內部測試（本對話）

Hank內測35後要求補回標籤操作／預覽／全部追加、長按滑選，以及重試21張的通知與縮圖閃爍修復。本對話01a194d2-6b99-73c3-b238-992d2f142846依原直接內測授權完成：Console release10於2026-11-02 09:06顯示提供給內部測試人員，官方API internal36 completed、AAB SHA吻合；production15／其他tracks／testers逐值未變。下次Android code須>=37。不喚醒舊publisher／LINE worker、不push／merge、不發iOS／backend／production。

權威 `/Volumes/codex_2T/codex_project/Timehut-QA-20261102/picker-notification-r1/FINAL-ACCEPTANCE.json`、`REVIEW.html`；正式 `formal36-r2/PUBLISH-RECEIPT.json`、官方截圖 `PLAY-INTERNAL36-PUBLISHED.jpg`。AAB SHA230cdb564caab35c2cb450a7f6905ab0d64077daae2da73abdb15be6ebb08ec2；沿既有upload cert9965…5824，無新簽章。19限定產品／測試來源root／QA／formal逐SHA一致，其他WIP保留。以已發布35為基準92 public，只5delta（pickerJS/CSS、transfersJS、versionJS、設定LINE入口原card精確補回），不帶root其他settings／LINE自動流程WIP、QA helpers／debug／診斷。正式建置／40 JVM PASS＋2既有Coffee GUI case skip／Lint／preflight0blocking，本版實際AAB15圖、APK對應、商店與普通35→36保留安裝H目視通過，浮水印存在／樣式正確。

原生API36合計五批、每次100張全完成：主裝置保留1800＋新200＝2000，逐張／批次標籤、返回保留、長按6→3、60→100載入；121到期未完成全waiting_account並停止續寫，正常同owner重登後同ID200恢復。另一台同隔離QA namespace新300（非搬移／清空主裝置）：其中100＋retry21兩個實際通知ID/各自總數16次穩定、進行中9次及可見縮圖9次輪詢同影像節點；最後新100在Start後HOME命令0.266s、鎖屏，仍Asleep時全100完成。Home瞬時截圖是舊surface過渡，不冒稱launcher畫面已穩定；真正screenAsleep及完成逐筆證據另存。500來源SHA/bytes及標籤、已完整接收body不重送核對通過；fresh300實際multipart JPEG hash/bytes對原檔一致。原1800身分及舊任務／原件保留，公平讓出後只續同IDs。正式LINE原入口→golden導航、入口／縮圖／通知及正式包截圖均目視；不含真LINE自動匯入驗收。

獨立r6原HOLD保留，HIGH閉合後僅MEDIUM既有35未改HEIC/AVIF下載限制，`REVIEW-ADJUDICATION.json`具baseline相同證據；不冒稱原獨審PASS或新增格式支援。API edit validate仍403照片／影片核心用途聲明，失敗原件保留；改Console同一AAB正常發布，0error／1未啟用R8故無mapping警告。UI未提供用途表單，不冒稱聲明已核准。QA模擬畫面版本字串沿模板1.0.10；正式36實包version已另驗，不能混淆。

全程人工JPEG／隔離loopback，不是正式Flickr或Pixel9a真機。原G7仍待Hank實測100張立即切App／鎖屏／斷網，不能因internal36完成而標整體真機根因已驗。測試加入 https://play.google.com/apps/internaltest/4701392125823481168 。所有失敗／讓出／成功及來源證據保留，未清App資料／刪原件；臨時emulator安裝threshold已還原、裝置及GUI租約釋放、不關機。
<!-- TIMEHUT_PICKER_NOTIFICATION36_20261102_END -->

<!-- TIMEHUT_LINE_SETTINGS_ENTRY_35_20261102 -->
## 2026-11-02 Android35 LINE入口漏失已確認／來源補回，未發新版

Hank詢問1.0.11 LINE設定是否移除。直接讀官方發布SHA吻合的AAB：1.0.10(34) settings有line-albums連結；1.0.11(35)沒有。兩版LINE收件及golden頁面都仍在包內，確定是設定入口回歸，不是頁面檔案刪除或登入隱藏。已在root settings.html僅補回v91原LINE service-card（服務資訊前），其餘設定WIP逐字保留；解析單一連結與目的地檔案存在通過。證據 `.codex-local/qa/20261102-line-settings-entry-r1/PACKAGE-CHECK.json`、`SOURCE-REPAIR.json`、`settings-before.html`。沒有建置／部署／發布，手機35仍未修；下一Android code>=36需確保入口及LINE→golden導航實包驗收。LINE自動處理候選原v91 public-app/settings本就保留入口，不以root其他設定整包覆寫。

<!-- TIMEHUT_LINE_AUTO_STATUS_20261102_BEGIN -->
## 2026-11-02 LINE 取消逐批確認、逐張狀態候選通過（未部署）

Hank要求不再需要「確認匯入相簿」，直接由MiniMax後續自動上傳，最近收件逐張列出下載／排隊／辨識／上傳／排除等狀態。本輪root四個前端來源已修改，移除手動勾照片與匯入按鈕，5秒唯讀輪詢保留設定輸入；正常UI不再POST匯入。一次性參考人物用途同意與來源綁定保留。既有run-source與supervisor本來就串guarded automatic import，未另建旁路。

MiniMax在隔離v91基準完成唯讀狀態module與route/server注入，Codex複核補上scope/引擎ready/完整skip完成hash及hold；後端20＋前端6＝26項兩方實跑PASS，候選6瀏覽器合成HTTP流程PASS。獨立前端審查的首次GET失敗恢復與pending誤稱正在上傳兩項P2均已修並複審閉合。已上傳需精確收據與全部目標membership；歷史完成持久，未知／不確定不排除、不新建重複識別。

權威 `.codex-local/qa/20261102-line-auto-status-r1/FINAL-ACCEPTANCE.json`、`REVIEW.md`、`CANDIDATE-MANIFEST.json`；候選完整backend143檔，相對v91新增2/改5/移除0（含4個public-app前端）。根server仍是較舊且混其他WIP的來源，刻意未覆寫；不可raw-root部署。MiniMax原17項與交接另凍結保留。新文件 `docs/LINE_AUTO_UPLOAD_STATUS.md`；本地上傳SOP改註為維修／恢復用途。

本輪未部署／啟用／改同意或grant／修改環境或來源綁定／新增照片。線上GET查核兩本家庭相簿各5參考但consentCurrent=false（舊golden-Hank1028-v1），grants0；人物引擎與supervisor休眠。前述Hank在App更新人物同意→snapshot→真MiniMax校準→私有設定→golden→grant→supervisor順序仍待；全自動真LINE E2E與相簿回讀不能冒稱完成。發布沿既有受控切換、獨立審查與H圖示本版自檢，本輪不喚醒停止session或自行發布。
<!-- TIMEHUT_LINE_AUTO_STATUS_20261102_END -->

<!-- TIMEHUT_INTERNAL35_STATUS_BEGIN -->
## 2026-11-02 Android 1.0.11(35) 已發布內部測試

Hank最新直接指示「發安卓內部測試 我直接實測」，本對話依新授權完成Android internal 1.0.11(35)發布。Play Console release9顯示「提供給內部測試人員」，2026-11-02 00:40；官方API讀回internal35 completed、production15及其他tracks／testers未變。下次Android versionCode須>=36。未喚醒舊publisher、未發iOS／production、未部署後端／Git push。

權威收據 `/Volumes/codex_2T/codex_project/Timehut-QA-20261102/internal-release-r1/PUBLISH-RECEIPT.json`；同目錄官方截圖 `PLAY-INTERNAL35-PUBLISHED.png`、tracks/bundles/testers-after.json。AAB SHA fbb970047707a7e00125ccbbbe26492a25428b89746952855a98372d0603dbd8，沿用既有upload cert。92 public exact；正式Release建置／30 JVM／Lint／獨立複審／本版H包內15圖與APK15對應、商店zh-TW、實際安裝、32/48/64mask目視通過。3個Android舊版API guard已限定hash採用，新增100張原生選圖標記／dedup回歸與截圖通過，原100x2背景斷網恢復證據保留；根目錄其他WIP不重置。

<!-- TIMEHUT_ORIGIN_MAIN_AGENTS_PRESERVED_20261103_BEGIN -->
<!-- 以下為 origin/main 既有 AGENTS.md 內容，同步正式版 58310df0 時原樣保留，避免遺失（2026-11-03）。 -->

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

<!-- TIMEHUT_ORIGIN_MAIN_AGENTS_PRESERVED_20261103_END -->
