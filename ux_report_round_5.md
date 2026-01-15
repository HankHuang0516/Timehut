

## 模擬場景說明
*   **用戶角色**: 不懂功能的新用戶 (Naive User)
*   **設備模擬**: iPhone 尺寸 (375x812)
*   **網址**: https://hankhuang0516.github.io/Timehut/timeline.html?v=naive_r5

---

## 測試功能與反饋

### 1. 時光導覽 (Time Travel)
*   **操作**: 點擊「時光」按鈕 (鬧鐘圖示)。
*   **截圖**: ![Time Travel Menu](file:///C:/Users/z004rx2h/.gemini/antigravity/brain/20189434-7c67-44d5-a1f0-ac670b4c10fb/time_travel_menu_mobile_1768304124149.png)
*   **用戶反饋**:
    *   **優點**: 半屏選單在手機上易於操作，分類清晰。
    *   **疑惑**: 以「年齡」分組（如 5歲、4歲）很溫馨，但若想找特定年份（如 2024）需自行換# 手機版用戶體驗 (UX) 評估報告 (Round 5)算。
    *   **建議**: 在年齡旁標註對應年份區間 (如：5歲 - 2024)。

### 2. 照片燈箱 (Photo Lightbox)
*   **操作**: 點擊照片查看大圖。
*   **截圖**: ![Photo Lightbox](file:///C:/Users/z004rx2h/.gemini/antigravity/brain/20189434-7c67-44d5-a1f0-ac670b4c10fb/photo_lightbox_mobile_1768304146244.png)
*   **用戶反饋**:
    *   **優點**: 下載按鈕明顯。
    *   **疑惑**:
        *   **導覽缺失**: 手機上沒有「上一張/下一張」按鈕，不知道能否左右滑動 (Swipe)。
        *   **資訊冗餘**: 頂部顯示的原始檔名 (Hash) 無意義且佔空間。
    *   **建議**: 增加左右箭頭或頁碼 (1/10) 暗示可滑動；隱藏檔名。

### 3. 標籤與搜尋 (Search & Tag)
*   **操作**: 點擊標籤或輸入 "testtag"。
*   **截圖**: ![Search Results](file:///C:/Users/z004rx2h/.gemini/antigravity/brain/20189434-7c67-44d5-a1f0-ac670b4c10fb/search_results_mobile_1768304218249.png)
*   **反饋**:
    *   **優點**: 搜尋結果數量清楚。
    *   **Bug (UI)**:
        *   **文字重疊**: 在 375px 寬度下，卡片內的日期與標籤文字嚴重重疊 (如 "2025年..." 與 "uploader..." 撞在一起)。
        *   **搜尋框狀態**: 搜尋後 Placeholder 未清除，導致輸入框內文字雜亂。
    *   **疑惑**: 左上角 Logo 點擊回首頁，右上角又有 Home Icon，功能重複。

---

## 🐞 Bug List (待修復清單)

1.  **[UI/Mobile] 搜尋結果卡片跑版**: 手機直式 (Portrait) 下，結果卡片中的日期與 Tag 發生重疊與裁切。
2.  **[UI] 搜尋框 Placeholder**: 搜尋後 Placeholder 未正確隱藏/清除。
3.  **[Content] 燈箱標題無意義**: Lightbox 標題顯示為 raw filename。

## 💡 UX 總結建議
整體流暢，但需針對小螢幕 (Mobile Portrait) 優化 **搜尋結果頁** 的 CSS 佈局，並增強 **燈箱 (Lightbox)** 的操作引導 (Affordance)。
