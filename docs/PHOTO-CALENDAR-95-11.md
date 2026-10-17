# 相集日期路徑補齊

95.10／test.95 R5的獨立複查保留HOLD：R5-F1為相集移動清單及檢視器仍將date-only當成UTC，洛杉磯可能少一天；R5-F2為相集改日期後仍用舊split過濾，未選或失敗的ISO照片可能被暫時隱藏。

兩項均在修正前重現。現行formatter實際來源在洛杉磯把2024-03-01顯示為2月29日；真實相集頁面／普通HTTP／SQLite／人工供應者在全失敗回覆後，三份原ISO照片的DOM與前端清單變成空。這是畫面分組問題，後端原檔未刪。負向來源與結果見`.codex-local/qa/20261017-album-calendar-followup/`。

95.11將相集來源過濾改為共用photoCalendarDay；移動清單與檢視器皆以canonical日期的本地中午格式化，檢視器也先用同一日期helper處理上傳時間後備值。Android test.95 R6相對R5只有包內album.html改變，原生程式、manifest、CSS、圖示、版本／testing簽章及AndroidTest包相同。

本輪UTC／台北／洛杉磯各23項helper、實際formatter、相集分頁讀取檢查通過。台北與洛杉磯各一組真實相集頁面／HTTP／SQLite日期流程通過：取消零寫入、全失敗保留二選取加一未選ISO照片、部分成功保留失敗及未選項、第二分頁實際reload、只重試失敗ID、完成後僅留未選照片及手動reload；原檔和未選metadata不變。這兩組使用明示預建完成的人工fixture及人工Flickr，不冒稱正常worker或正式寫入。

另用95.11完整後端、實際註冊／Secure cookie、正常worker重新跑完九組本機旅程，人工三PNG／兩秒MP4共155,364bytes、四唯一人工建立、原檔bytes／SHA、影片播放、隔離及四媒體／兩帳戶刪除完成。只有Flickr wire接本機服務；舊95.10九組與先前失敗紀錄未覆寫。沒有live模式或新正式provider操作。

R5→R6的Android26／36有界升級延續原94的19項合成資料／收據保存鏈，不reset；26僅fallback，36有界UI／安全區／鍵盤／旋轉，無本輪OS font重跑或真機／原生傳輸加分。當版實際包內與安裝AppInfo的H自檢另見R6 QA。

本輪formal credit=0，完整六頁兩軸／固定36、真實產品Flickr、正式部署、Hank實機及iOS仍待各自驗證。原R5 HOLD不改寫，是否關閉兩finding以R6最終獨立補審為準。R6未發布，exact94掃描例外不適用本版。
