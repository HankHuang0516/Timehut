/**
 * 本地伺服器 - 接收瀏覽器傳來的 URL 資料
 * 
 * 使用方法：
 * 1. 執行: node receive_urls.js
 * 2. 在 Timehut 頁面的 Console 執行 fetch 指令發送資料
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const OUTPUT_FILE = path.join(__dirname, '..', 'downloads', 'timehut_media_urls.json');

// 確保資料夾存在
const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const server = http.createServer((req, res) => {
    // CORS 設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/save') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

                console.log(`\n✅ 資料已儲存！`);
                console.log(`   照片: ${data.totalPhotos || data.photos?.length || 0}`);
                console.log(`   影片: ${data.totalVideos || data.videos?.length || 0}`);
                console.log(`   檔案: ${OUTPUT_FILE}\n`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Data saved!' }));

                // 3秒後關閉伺服器
                setTimeout(() => {
                    console.log('🛑 伺服器關閉');
                    process.exit(0);
                }, 3000);

            } catch (error) {
                console.error('❌ 錯誤:', error.message);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 URL 接收伺服器啟動`);
    console.log(`📡 監聽: http://localhost:${PORT}`);
    console.log(`\n請在 Timehut 網頁的 Console 執行以下程式碼：`);
    console.log(`${'─'.repeat(50)}`);
    console.log(`
fetch('http://localhost:${PORT}/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        exportDate: new Date().toISOString(),
        source: 'timehut.us',
        totalPhotos: window.EXTRACTION_RESULT.photoCount,
        totalVideos: window.EXTRACTION_RESULT.videoCount,
        photos: window.EXTRACTION_RESULT.photos,
        videos: window.EXTRACTION_RESULT.videos
    })
}).then(r => r.json()).then(console.log)
`);
    console.log(`${'─'.repeat(50)}`);
    console.log(`\n等待資料...`);
});
