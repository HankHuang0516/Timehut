# 影片上傳失敗調查報告 & 修復方案

## 1. 問題分析

**症狀**：200MB 影片上傳時，UI 無反應，無進度條，感覺像當機，最終可能失敗。

**原因調查**：
1.  **前端 (`js/uploader.js`)**：
    *   目前使用 `fetch` API 進行上傳。
    *   **關鍵缺陷**：標準 `fetch` 不支援上傳進度監聽 (Upload Progress)。
    *   **結果**：使用者點擊上傳後，瀏覽器會在背景傳輸 200MB 資料（可能需數分鐘），這期間 UI 完全靜止，沒有任何回饋。使用者會誤以為系統當機而關閉或重新整理。
2.  **後端 (`server/server.js`)**：
    *   Multer 設定限制為 500MB (`fileSize: 500 * 1024 * 1024`)。這部分設定正確，**不是阻擋原因**。
    *   後端採用「先存硬碟 -> 再轉傳 Flickr」的模式。這意味著 Server 必須完整接收檔案後，才會開始上傳到 Flickr。
3.  **整體流程瓶頸**：
    *   Client -> Server (此段最慢，受使用者上傳頻寬限制)。
    *   Server -> Flickr (此段較快，伺服器頻寬)。
    *   目前 UI 只有在 **全部完成** 後才會顯示成功，中間完全黑箱。

## 2. 修復方案

目標：讓使用者知道「正在上傳中」以及「目前的進度」，避免誤判為當機。

### 步驟 1：前端改用 XMLHttpRequest (XHR)
`fetch` 無法監聽上傳進度，必須改回傳統的 `XMLHttpRequest` (XHR) 或使用 `axios` (底層也是 XHR)。
我們將修改 `Uploader.uploadFiles` 方法。

### 步驟 2：新增 UI 進度條元件
在 `uploadModal` 或檔案列表中新增進度條顯示。

### 步驟 3：調整後端逾時設定 (Optional)
確保 Express 的 `timeout` 足夠長（雖然這通常由 Nginx/Railway 負載平衡層控制，但程式碼層面需確保不會過早斷開）。

---

## 3. 實施計畫 (Implementation Plan)

### 修改 `server/server.js` (Optional check)
確認並未設定過短的 timeout (目前 `server.js` 沒特別設定，預設通常沒問題，但大檔案建議加強 log)。

### 修改 `js/uploader.js`

**A. 新增進度條 UI**
在 `queue-item` 中加入 hidden progress bar。

**B. 重寫 `uploadFiles`**
使用 `XHR` 取代 `fetch`。

```javascript
// 偽代碼範例
uploadFiles(files, options) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                // 更新 UI 進度條
                if (options.onProgress) options.onProgress(percent);
            }
        });
        
        xhr.open('POST', `${this.apiUrl}/api/upload`);
        xhr.send(formData);
        
        xhr.onload = () => {
             if (xhr.status >= 200 && xhr.status < 300) {
                 resolve(JSON.parse(xhr.responseText));
             } else {
                 reject(new Error('Upload failed'));
             }
        };
    });
}
```

## 4. 預期效果
修復後，當使用者上傳大檔案：
1.  點擊上傳。
2.  UI 顯示 0% -> 100% 的進度條 (代表上傳到我們的主機)。
3.  100% 後顯示「正在處理/轉傳至 Flickr...」(此階段無進度條，但使用者知道還在跑)。
4.  完成後提示成功。

## 5. 檔案路徑
本報告位置：`c:\Hank\Other\project\Timehut\video_upload_investigation.md`
