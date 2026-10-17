# 95.9正常上傳與停止續傳來源修正

目前是未發布來源95.9；已凍結的test.95 R3／d5550b85快照與APK保持原件。
R3不含以下後續顯示修正，須另外建立並驗證更新安裝包，不能沿用舊包結論。

新增驗證執行完整server.js、SQLite、ordinary receiver及正常worker。
Chrome以實際TLS與同源登入cookie操作原產品頁；只將Flickr外部transport接至
本機人工HTTP服務。沒有直接改寫收件／完成狀態，也沒有替換產品handler或bootstrap。

四組本機結果通過：登入、進度及部分失敗後只重試失敗檔；傳送途中真XHR停止；
重新開啟後保留unknown／not-sent兩個原File；明確續傳沿用同一client/content/metadata
識別。六次收件POST包含一次中途abort，最終五份不同收據及五次本機人工建立，
沒有重傳已收到的檔案。PNG／MP4上傳原檔SHA、完整tags及三項private旗標均核對。

此流程發現含空白的上傳者名稱（Worker QA）會在停止後的唯讀標籤欄誤留QA。
修正改由task保留原使用者輸入userTags供欄位恢復；傳輸tags字串、metadata digest、
原File及收件編號不變。批量與單檔模式都保留原欄位，舊程式呼叫無userTags時
沿用原fallback。負控以舊來源實際失敗；修正後正常worker四組及same-ID續傳通過。

證據在 `.codex-local/qa/20261017-normal-worker-product-ui/`。
revision1／2的測試腳本查詢與操作錯誤、revision3／4舊範圍PASS、revision5顯示問題負控
均保留；目前revision6為修正後結果。TLS私鑰、合成帳戶DB及原檔僅在受限SSD工作區，
不納入來源或公開包。

這是本機完整產品／worker範圍，Flickr回覆仍是人工服務；不給原正式06/6、完整36、
六頁視覺、原生／鎖屏／真機或正式HTTPS/provider信用，不改原分母及未驗算零規則。
正式test.94／backend70／web.4與預設75未變，四份正式人工資料及舊七份保持已刪終態。
沒有正式寫入、部署、商店提交或新的發布授權。獨立複查仍以其實際報告為準。
