# iOS 最新來源與包體預檢：2026-10-17

本輪補齊最新 iOS `NativeAccountClient` 的完整編譯證據，並修正既有「問題回饋」缺少 `CustomerSupport` 隱私類型的宣告。Debug／generic Simulator 與未簽章 Release／generic iOS 兩種建置均成功。這是本機候選檢查；沒有執行 App、分發 IPA、存取 App Store Connect 或提交商店。

## 實際修正

`PrivacyInfo.xcprivacy` 增加 `NSPrivacyCollectedDataTypeCustomerSupport`，用途為 `AppFunctionality`、連結回報者、非追蹤。依據是現有問題回饋會保存使用者主動送出的描述、選填截圖副本、平台／通道／版本及處理狀態。網頁隱私說明已描述回報資料；原生清單原有六類，現在為七類。沒有因此新增資料收集、權限或服務請求。

修正前的兩個完整包、原始六類清單及建置紀錄保留。新增類型後重新建置兩種包，包內清單皆與修正後來源語意相同；修正前包未包含該類型，不能套用新通過結果。

## 本輪核對

- Xcode 27.1／27A9275，SDK 27.1，最低 iOS 15；版本仍為本機 `1.0 / build 1`。未簽章，並非 archive 或可供安裝的正式發行包。
- 最新原生 client SHA256 為 `880d86c1411fd062ba6056d75e4dc1a7c2296f98ca6a61d837f615e43188a6a2`，包含新增的本人刪除狀態 GET 白名單。兩種包皆由同一份已核對來源編譯，沒有用舊包代表這份來源。
- 各包實際含 63 個公開網頁資源：已複查的網站95.9共60檔，加固定 Capacitor 8.5.3 core及兩個 sync 產生的精確空檔。12個HTML僅在head開頭加入core，確保在帳戶啟動前載入；其餘內容逐byte核對。
- 包內沒有私人 config、帳戶資料庫、初始密碼或已禁止的家庭照片與引用。App、Capacitor、Cordova三份隱私宣告皆保留；兩份依賴宣告與實際固定依賴一致。
- 實際 Release 主程式及 Debug 的 `App.debug.dylib` 都觀察到 `_fstat`，對應既有 FileTimestamp／C617.1。其他候選符號與字串的有限檢查未命中；這不是 Apple 掃描器或完整 Required Reason API 稽核。
- 僅保留 Photos add-only 用途說明，沒有新增完整相簿讀取、定位、麥克風或追蹤權限。
- 本輪來源1024圖示逐像素等於原無H畫面合成指定H後的標準整圖縮放；原畫H範圍外差異為零。當版包內4個原生PNG及兩份Web/PWA圖示的32／48／64預測遮罩已目視：浮水印存在、樣式正確，無底欄或遮主體。來源圖示原本已正確，本輪沒有換圖；舊文件的「預設圖示／缺H」不適用於本輪包。

## 仍待完成

- 本輪沒有 App 執行、真正 Keychain 程序測試、Photos 保存、切換 App／鎖屏傳輸或實體 iPhone 證據。先前模擬器資源未獲准的紀錄保留，沒有為取得通過而重置或重試裝置。
- 沒有抽取本輪 Assets.car 中1024圖示的像素，也沒有商店圖示上傳或安裝後主畫面；上述H結論只適用已核對的來源與實際PNG範圍，不能代替未來分發當版完整檢查。
- 尚缺正式簽章、archive／Organizer privacy report、商店版本資料與截圖、審查帳戶安排，以及服務商日誌／備份／處理地區的完整盤點。七類清單不代表供應鏈資料處理已全部核實。
- 原六頁／每頁兩軸至少80%、固定36項及未驗計零維持，本輪不新增正式分數；Android test.95 R4 的已審包體與來源保持原樣，正式版本未變。

## 證據與依據

本輪證據位於 `.codex-local/qa/20261017-ios-current95-9-preflight/`：來源清單、兩輪建置與原始log、修正前包、修正後包、逐檔內容清單、H像素映射及當版目視圖。獨立複查狀態以該目錄的當輪報告為準。

預檢使用 `app-store-preflight-skills` 的 universal checklist、privacy manifest及資料必要性規則；Social／UGC清單僅供辨識適用性，沒有據此把私人相簿當成已存在的公開社群，也沒有宣稱商店合規已完成。

- [Apple 資料類型：CustomerSupport](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype)
- [Apple 資料用途：AppFunctionality](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatypepurposes)
- [Apple Required Reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
