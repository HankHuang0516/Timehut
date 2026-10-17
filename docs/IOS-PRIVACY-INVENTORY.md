# iOS 候選的隱私宣告盤點

2026-10-17 更新：現有「問題回饋」會保存使用者主動送出的描述、選填截圖副本、平台／通道／版本及處理狀態，並連結回報帳戶，因此 App 宣告新增 `CustomerSupport`／`AppFunctionality`，維持非追蹤。下列 App 自身清單現為七類；不是新增收集功能，也不是服務商日誌或商店回答已全部核實。最新包體編譯與實際圖示檢查記錄另見 `IOS-PREFLIGHT-20261017.md`，下方 2026-10-15 段落保留當時的歷史範圍。

2026-10-15 最新補充：發現私人家庭照片16120.jpg混入原公開包，原件已保留，最新54檔公開網站及79檔後端不含此原件或引用。打包前後以檔名、原始圖片指紋及HTML/CSS/JS引用拒絕再次混入；舊Android65候選已列HOLD，未發布替換，也未聲稱線上舊檔已移除。最新iOS57檔公開資源已核對，原生圖示缺H、最新包未重裝執行及服務商保留盤點仍為提交缺口。

---

2026-10-15。此文件與 App 的 `PrivacyInfo.xcprivacy` 是中央 Flickr 儲存候選的開發資料，不是 App Store Connect 已提交的隱私回答或 Apple 審核通過證明。當版原生帳戶整合、實際 Release archive／privacy report、服務商紀錄／保留盤點及獨立複查仍待完成。

## App 自己的資料用途

| Apple 類型 | 工程中的實際資料 | 用途及邊界 |
|---|---|---|
| Name | 帳戶顯示名稱、相簿中填寫的家人名稱 | 顯示與整理家庭回憶，與帳戶連結 |
| UserID | 登入名稱、應用程式使用者／工作歸屬、既有服務身分 | 登入、權限隔離及收據對應；不把支援信箱當成使用者的電子郵件 |
| PhotosorVideos | 使用者選取並傳送的照片／影片原檔 | 上下載、預覽與保存；中央 Railway／Flickr 處理，不宣稱端對端加密 |
| OtherUserContent | 相簿名稱、標籤、檔名及使用者填寫的回憶內容 | 整理、搜尋與顯示 |
| CustomerSupport | 使用者主動送出的問題描述、選填截圖副本、平台／通道／版本及回報處理狀態 | 本人及管理者查看、處理問題與提供站內處理通知；不自動附上其他相簿照片、密碼或登入憑證 |
| OtherDataTypes | 生日／紀念日、拍攝日期、內容校驗值與傳輸／刪除收據 | 時間軸、恢復、防重傳及資料刪除核對 |
| PreciseLocation | 使用者原檔可能附帶的 GPS 座標 | 原檔按原內容傳送與保存；沒有先清除 EXIF。不是持續定位功能，沒有呼叫 CoreLocation 或要求定位權限。若未來改成移除／分離內嵌位置，須按新產物重新判定 |

以上均以 AppFunctionality、與使用者連結、非追蹤申報；這是對本 App 收集用途的候選描述，不替 Railway／Flickr 的額外處理行為背書。原始媒體可能包含聲音；目前沒有獨立語音錄音／音訊上傳功能，影片隨附音軌包含在影片內容中。沒有因顯示支援信箱就宣告 App 要求使用者填電子郵件，也不以 HTTP 本身收到 IP 就推定 App 以它作地理定位或追蹤。

目前程式沒有廣告／跨 App 追蹤用途，追蹤旗標為 false，追蹤網域為空。這不等同「沒有收集資料」。服務商日誌的實際留存、IP／診斷用途、備份與處理地區仍須在提交前核對；若其構成需申報的資料用途，必須補入宣告及商店回答，不將目前六項清單當成完整供應鏈稽核。

## Required Reason APIs 與依賴

新增原生帳戶儲存後，`NativeFileAccountControl`使用`fstat`核對App私有UUID控制檔的普通檔案型別及37-byte長度，防止連結／FIFO／損壞內容。這是實際列出的Required Reason API，已加入FileTimestamp類別及C617.1（App container內檔案中繼資料），並在本輪Release真正程式及Debug的`App.debug.dylib`核對`_fstat`匯入。先前僅URL.resourceValues、accessed陣列為空的紀錄只適用於前一版隱私候選，不能沿用至本版。沒有增加其他任意理由碼，亦未把有界符號觀察當成Apple scanner或最終archive完整證明。

SPM 固定 Capacitor 8.5.3。既有下載的 Capacitor／Cordova arm64 與 simulator framework 均各自附 `PrivacyInfo.xcprivacy`；既有宣告的 accessed／collected／trackingDomains 均為空、tracking=false。這只是這份依賴的隨附聲明，不以它推定 App 沒有收集資料，也未修改供應者的 framework 或宣告。新包須逐份確認這些資源確實保留。

App 的 Photos 權限只保留 `NSPhotoLibraryAddUsageDescription`。PHPicker 選取原檔不需要整個相簿的讀取權限；DEBUG observer 的 read-write QA 不能擴成正式讀取權限。沒有為隱私宣告增加定位、麥克風或追蹤權限。

## 當版驗證範圍與提交缺口

前一輪只做編譯／包內資源檢查；新增帳戶底層的本輪另在管理下隔離Simulator驗證真實Keychain的四個程序階段，沒有讀取Photos或登入正式服務。兩輪均核對實際包內App／依賴manifest、版本／身分、公開網頁與私有檔排除；新證據範圍以`IOS-NATIVE-ACCOUNTS.md`為準。產物只作本機驗證，沒有分發、商店提交或新增正式矩陣分數。

尚未產生由 Organizer 匯出的 archive privacy report、App Store validation 或實際 ASC metadata／隱私回答；沒有更改商店帳號、建立新 App、上傳或聯絡第三方。iOS目前有Keychain格式2、第一方HTTP client及引擎工作歸屬；先前10個隔離程序的儲存／HTTP紀錄保留，最新2個新PID／16項另確認真實Keychain、OS background URLSession原圖下載、帳戶切換及重開保留。上傳指紋／未知收件查詢另已在同一新包4個PID／30項的上傳及下載批次驗證；持久撤銷、未知登入結果協定及WebView分支仍未完成，背景鎖屏／真機／Photos保存仍缺，不能當成完整公開帳戶功能。任何分發前仍須當版實際H自檢與獨立複查。詳細範圍見`IOS-NATIVE-ACCOUNTS.md`。

## 來源

- [Apple 隱私宣告加入 target 與資源位置](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk)
- [Apple Required Reason API 與理由](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)
- [Apple API 類型表](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype)
- [Apple 資料類型及用途](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests)
- [Apple 原始資料類型表](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype)

檢查也使用 `app-store-preflight-skills` 的 universal checklist 與 privacy manifest rule；適用的實作及官方文件優先，沒有將未檢查項目宣稱為商店拒絕或通過。
