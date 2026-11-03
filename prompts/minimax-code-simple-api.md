# MiniMax Code：時光相簿 LINE 照片自動分類（極簡 API）

> ⚠️ HANK 凍結（2026-11-03）：此為時光相簿 LINE→MiniMax 人物／影片辨識→自動匯入→合併通知 的正式流程，已實測跑通（deployment 58310df0）。Codex／GPT 及所有 agent 不得修改此流程的邏輯、新增限制、門檻、權限檢查、確認步驟或規則；規則只由前台設定（參考照片＋每本相簿辨識開關）決定。只允許修 bug 或恢復成目前行為，任何其他變更須先取得 Hank 本人明確同意。詳見根目錄 AGENTS.md 的 HANK_PERSON_MATCH_NO_NEW_RULES 段落。

> 2026-11-02 新增。舊的 golden / run / receipt 流程文件保留不動；這份只描述極簡 API。

## 設定

- 讀取本機設定檔 `~/.config/timehut-mcode/config.json`（權限 600）：`{ "origin": "...", "header": "X-Mcode-Key", "key": "..." }`。
- 每個請求都帶 header `X-Mcode-Key: <key>`。不要把 key 印出、寫進對話、檔案或命令列參數。
- 這把 key 只能存取一個綁定的帳號；規則全部由前台設定頁決定（每本相簿的參考照片 + 「辨識開關」），你不需要、也不要另外加規則。

## 迴圈（每 30–60 秒一次）

1. `GET {origin}/api/mcode/pending`
   回應：
   ```json
   {"items":[{"itemId":"uuid","imageUrl":"{origin}/api/mcode/items/<itemId>/image","receivedAt":"2026-11-02T13:40:00.000Z","source":"group",
     "albums":[{"albumId":"7217...949","name":"漢堡","referenceImageUrls":["{origin}/api/mcode/references/7217...949/5560.../image"]}]}]}
   ```
   `items` 為空就等下一輪。每筆已經帶好「開關開著且有參考照片」的相簿，不用另外查。
2. 對每一筆：用同一個 header 下載 `imageUrl` 和每本相簿的 `referenceImageUrls`（都是圖片位元組）。
3. 看圖判斷：收件照片裡是否出現和某本相簿參考照片「同一個人」。只比對是否同一人，不推測身分、年齡、情緒或其他屬性。
   - 清楚是同一人 → 放入該相簿；同一張照片可同時放入多本。
   - 看不出來或不是 → 不放。
4. `POST {origin}/api/mcode/result`，`Content-Type: application/json`
   ```json
   {"itemId":"uuid","albumIds":["7217...949"]}
   ```
   `albumIds: []` 表示跳過。回應：
   ```json
   {"ok":true,"itemId":"uuid","imported":["7217...949"],"skipped":false,"importStatus":"staged"}
   ```
   伺服器會直接用既有匯入引擎把照片放進相簿，並把這筆收件標記完成（之後不再出現在 pending）。同一筆重送相同結果會回 `duplicate:true`；改成不同結果會回 409。
5. （可選）`GET {origin}/api/mcode/items/<itemId>` 看匯入進度：`importStatus` 從 `staged` → `uploading` → `completed`。

## 錯誤

- 401：key 錯誤 → 停止並回報。
- 400：albumIds 不在該筆的 `albums` 裡（例如開關剛被關掉）→ 重新拿 pending 再判斷。
- 404：收件或圖片不存在／LINE 原圖已過期 → 該筆送 `albumIds: []` 跳過。
- 409：該筆已處理或被舊的自動引擎保留 → 略過。
- 503：服務暫時不可用 → 等下一輪。

## 其他端點

- `GET {origin}/api/mcode/albums`：目前啟用（開關開＋有參考照片）的相簿與參考照片連結，格式同 pending 的 `albums`。

## 影片（2026-11-03 新增）

- pending 每筆多了 `media`：`"image"` 或 `"video"`，以及 `mediaUrl`（`GET {origin}/api/mcode/items/<itemId>/media`，帶 X-Mcode-Key，影片回傳 `video/mp4` 原檔）。照片仍有 `imageUrl`，影片沒有 `imageUrl`。
- 影片判斷方式（和照片同一條規則：similarity ≥ 0.8 就放入那本相簿，可同時放多本）：
  1. 優先用 MiniMax 原生影片理解 `connector__matrix__videos_understand`：把「3 秒參考照片卡（R1、R2…）＋收件影片」接成一支 mp4，`mcode-tools upload-temp-url` 後把 temp_url 放進 `video_info[].url`，請它只輸出 `{"same_person":…, "similarity":…}`。
  2. 原生影片失敗（格式、大小、逾時、回應無法解析等）時，改用 ffmpeg 平均擷取 3 張畫面，每張照片流程比對一次，取最高相似度。
- 結果一樣 `POST {origin}/api/mcode/result`，伺服器用既有匯入引擎把影片本身放進相簿；`albumIds: []` 表示跳過。
- 影片 404（LINE 原檔已過期）→ 該筆送 `albumIds: []` 跳過。
