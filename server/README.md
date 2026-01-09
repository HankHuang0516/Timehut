# 黃家小屋 - Flickr 上傳後端服務

這是黃家小屋的後端服務，用於處理照片和影片上傳到 Flickr。

## 功能

- ✅ Flickr OAuth 認證
- ✅ 批量上傳照片和影片
- ✅ 自動加入指定相簿
- ✅ 支援照片：JPEG, PNG, GIF, WebP
- ✅ 支援影片：MP4, MOV（最大 500MB）

## 本地開發

1. 安裝依賴：
   ```bash
   cd server
   npm install
   ```

2. 設定環境變數（複製 .env.example 為 .env）

3. 啟動服務：
   ```bash
   npm start
   ```

4. 首次使用需要授權 Flickr：
   訪問 http://localhost:3000/api/auth/start

## 部署到 Railway

### 1. 建立新專案

```bash
# 在 server 目錄下
railway login
railway init
railway up
```

### 2. 設定環境變數

在 Railway Dashboard 設定以下環境變數：

| 變數名稱 | 值 |
|----------|------|
| `FLICKR_API_KEY` | 6c25e4db1b6b0b73a4404008ed63929c |
| `FLICKR_API_SECRET` | 3be3bebab599c612 |
| `FLICKR_USER_ID` | 158881690@N04 |
| `FLICKR_OAUTH_TOKEN` | （授權後取得） |
| `FLICKR_OAUTH_TOKEN_SECRET` | （授權後取得） |
| `ALLOWED_ORIGINS` | https://your-github-pages.github.io |

### 3. 取得 Railway URL

部署完成後，將 Railway 提供的 URL 更新到前端 `js/config.js`：

```javascript
UPLOAD_API_URL: 'https://your-app.up.railway.app'
```

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/health` | 健康檢查 |
| GET | `/api/auth/status` | 檢查授權狀態 |
| GET | `/api/auth/start` | 開始 OAuth 授權 |
| GET | `/api/auth/callback` | OAuth 回調 |
| POST | `/api/upload` | 上傳檔案 |
| GET | `/api/albums` | 取得相簿列表 |

## 上傳 API

**POST /api/upload**

- `files`: 檔案（支援多個）
- `albumId`: 相簿 ID（可選）
- `title`: 照片標題（可選）
- `description`: 照片描述（可選）

回應：
```json
{
  "message": "上傳完成：3/3 個檔案成功",
  "results": [
    { "filename": "photo1.jpg", "success": true, "photoId": "12345" },
    { "filename": "photo2.jpg", "success": true, "photoId": "12346" }
  ]
}
```
