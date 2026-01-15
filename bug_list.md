# Bug List & Observations

## 驗證狀態
- **Backend (Server)**: 用戶提供的 Logs 確認背景上傳 (Worker v2.0) 運作正常，照片能成功上傳至 Flickr 並加入相簿。
- **Frontend (Browser)**: 雖然無法進行瀏覽器自動測試 (429 Error)，但代碼分析顯示 `server.js` 已經實作了「本地照片合併」(Phase 3)，因此當使用者刷新頁面時，應該能看到尚未上傳完成的本地暫存照片。

## 潛在風險 / 建議改進

1.  **[High] Railway Storage Persistence**
    *   **現狀**: 使用本地 `uploads/` 資料夾暫存。
    *   **風險**: Railway 若重新部署或重啟 Container，`uploads/` 和 `queue.json` 會被清空。這在 Ephemeral Filesystem 是已知限制。
    *   **建議**: 除了告知使用者「上傳中請勿重啟 Server」，長期解決方案是使用外部存儲 (如 AWS S3) 或僅接受這個限制（作為臨時緩衝）。

2.  **[Medium] Frontend "Refresh" Sync**
    *   **現狀**: 前端上傳成功後會 `reload()`。`server.js` 會在 API 回應中包含本地照片 (`_staged: true`)，所以使用者看得到照片。
    *   **風險**: 當背景上傳完成後（本地照片轉為 Flickr URL），前端**不會**自動更新。使用者需要**再次**手動刷新才能看到最終的 Flickr 版本。如果長時間不刷新，可能會一直看到本地 URL，而當 Server 刪除本地檔案後，圖片會破圖。
    *   **建議**: 實作 Polling 機制，當檢測到本地照片已轉為 Flickr ID 時，自動刷新或替換 URL。

3.  **[Low] Video Async Processing**
    *   **現狀**: 影片上傳 Flickr 後可能只拿到 Ticket ID。
    *   **風險**: 在 Ticket 處理期間，本地暫存檔可能已經被刪除（或標記為完成），導致相簿中暫時看不到該影片，直到 Flickr 處理完畢。Worker 目前似乎對 Ticket ID 處理較簡單。

## 結論
實施計畫 (Phase 1, 2, 3) 均已在代碼中體現。請使用者進行實際操作體驗，若「刷新後看到照片」符合預期，則功能已完成。
