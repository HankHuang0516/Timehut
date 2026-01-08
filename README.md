# 時光小屋 - Timehut Clone

一個使用 Flickr 作為照片資料庫的家庭相簿網站，模仿 [Timehut](https://www.timehut.us/) 的設計和功能。

## ✨ 功能特色

- 📸 **照片時間軸** - 按照片拍攝日期自動排列
- 👶 **年齡計算** - 自動計算照片拍攝時寶寶的年齡
- 🎯 **快速導航** - 右側年齡導航欄快速跳轉
- 🔍 **照片搜尋** - 支援關鍵字搜尋照片
- 📱 **響應式設計** - 支援桌面和手機瀏覽
- 🖼️ **大圖瀏覽** - 點擊照片可放大查看

## 🛠️ 設置步驟

### 1. 設置 Flickr API Key

編輯 `js/config.js`，將 `YOUR_API_KEY_HERE` 替換成你的 Flickr API Key：

```javascript
FLICKR_API_KEY: '你的API_KEY',
```

### 2. 設置相簿 ID

在 Flickr 創建相簿後，從相簿網址取得 ID：
- 網址格式：`flickr.com/photos/twopiggyhavefun/albums/相簿ID`

編輯 `js/config.js`，填入相簿 ID：

```javascript
CHILDREN: [
    {
        name: '大寶',
        birthDate: '2019-11-11',
        albumId: '你的相簿ID',  // 填入這裡
        emoji: '👶'
    },
    // ...
]
```

### 3. 本地測試

由於使用了 ES Modules 和 Fetch API，需要透過 HTTP 伺服器運行：

```bash
# 使用 Python
python -m http.server 8080

# 或使用 Node.js
npx serve .
```

然後打開瀏覽器訪問 `http://localhost:8080`

## 📁 專案結構

```
Timehut/
├── index.html          # 登入/選擇頁面
├── timeline.html       # 時間軸主頁面
├── css/
│   └── style.css       # 樣式設計
├── js/
│   ├── config.js       # 配置檔案
│   ├── flickr.js       # Flickr API 整合
│   ├── timeline.js     # 時間軸邏輯
│   └── utils.js        # 工具函數
├── api_key.txt         # API Key (不上傳)
└── .gitignore          # Git 忽略清單
```

## 🚀 部署到 GitHub Pages

1. 創建 GitHub Repository
2. 推送程式碼
3. 在 Repository Settings > Pages 啟用 GitHub Pages
4. 選擇 `main` 分支作為來源

## ⚠️ 注意事項

- API Key 會暴露在前端程式碼中，這是靜態網站的限制
- 建議只使用公開相簿
- 如需更安全的方案，可以使用 Cloudflare Workers 作為代理

## 📝 授權

MIT License
