/**
 * Timehut 媒體批量下載腳本
 * 
 * 使用方法：
 * 1. 將 timehut_media_urls.json 放到 Downloads 資料夾
 * 2. 執行: node batch_download.js
 * 
 * 照片會下載到: C:\Hank\Other\project\Timehut\downloads\photos
 * 影片會下載到: C:\Hank\Other\project\Timehut\downloads\videos
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// 配置
const CONFIG = {
    // JSON 檔案路徑 (優先使用專案資料夾)
    JSON_FILE: fs.existsSync(path.join(__dirname, '..', 'downloads', 'timehut_urls.json'))
        ? path.join(__dirname, '..', 'downloads', 'timehut_urls.json')
        : path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'timehut_media_urls.json'),

    // 下載目標資料夾
    OUTPUT_DIR: path.join(__dirname, '..', 'downloads'),
    PHOTO_DIR: path.join(__dirname, '..', 'downloads', 'photos'),
    VIDEO_DIR: path.join(__dirname, '..', 'downloads', 'videos'),

    // 下載設定
    CONCURRENT_DOWNLOADS: 5,     // 同時下載數量
    RETRY_COUNT: 3,              // 重試次數
    RETRY_DELAY: 2000,           // 重試延遲 (毫秒)
    TIMEOUT: 60000,              // 逾時時間 (毫秒)
};

// 進度追蹤
const progress = {
    total: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    startTime: null
};

// 建立資料夾
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 建立資料夾: ${dir}`);
    }
}

// 從 URL 取得檔名
function getFilename(url, index, type) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const originalName = path.basename(pathname);

        // 如果有有效的檔名就使用
        if (originalName && (originalName.endsWith('.jpg') || originalName.endsWith('.jpeg') ||
            originalName.endsWith('.png') || originalName.endsWith('.mp4'))) {
            return originalName;
        }
    } catch (e) {
        // 忽略錯誤
    }

    // 否則產生新檔名
    const ext = type === 'video' ? 'mp4' : 'jpg';
    return `timehut_${type}_${String(index).padStart(5, '0')}.${ext}`;
}

// 下載單個檔案
function downloadFile(url, filepath, retries = CONFIG.RETRY_COUNT) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const protocol = url.startsWith('https') ? https : http;

        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            timeout: CONFIG.TIMEOUT,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.timehut.us/',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        };

        const request = protocol.get(options, (response) => {

            // 處理重定向
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadFile(response.headers.location, filepath, retries)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            const file = fs.createWriteStream(filepath);
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve(true);
            });

            file.on('error', (err) => {
                fs.unlink(filepath, () => { });
                reject(err);
            });
        });

        request.on('error', (err) => {
            if (retries > 0) {
                setTimeout(() => {
                    downloadFile(url, filepath, retries - 1)
                        .then(resolve)
                        .catch(reject);
                }, CONFIG.RETRY_DELAY);
            } else {
                reject(err);
            }
        });

        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Timeout'));
        });
    });
}

// 顯示進度
function showProgress() {
    const elapsed = (Date.now() - progress.startTime) / 1000;
    const rate = progress.completed / elapsed;
    const remaining = (progress.total - progress.completed - progress.failed - progress.skipped) / rate;

    const percent = Math.round((progress.completed + progress.failed + progress.skipped) / progress.total * 100);
    const bar = '█'.repeat(Math.floor(percent / 2)) + '░'.repeat(50 - Math.floor(percent / 2));

    process.stdout.write(`\r[${bar}] ${percent}% | ✅ ${progress.completed} | ❌ ${progress.failed} | ⏭️ ${progress.skipped} | ⏱️ ${Math.round(remaining)}s remaining`);
}

// 處理下載佇列
async function processQueue(urls, type, outputDir) {
    const results = { success: [], failed: [] };

    async function downloadWithLimit(url, index) {
        const filename = getFilename(url, index, type);
        const filepath = path.join(outputDir, filename);

        // 跳過已存在的檔案
        if (fs.existsSync(filepath)) {
            progress.skipped++;
            showProgress();
            return;
        }

        try {
            await downloadFile(url, filepath);
            progress.completed++;
            results.success.push(filename);
        } catch (error) {
            progress.failed++;
            results.failed.push({ url, error: error.message });
        }

        showProgress();
    }

    // 分批並行下載
    for (let i = 0; i < urls.length; i += CONFIG.CONCURRENT_DOWNLOADS) {
        const batch = urls.slice(i, i + CONFIG.CONCURRENT_DOWNLOADS);
        await Promise.all(batch.map((url, j) => downloadWithLimit(url, i + j)));
    }

    return results;
}

// 主程式
async function main() {
    console.log('🚀 Timehut 媒體下載器啟動\n');

    // 檢查 JSON 檔案
    if (!fs.existsSync(CONFIG.JSON_FILE)) {
        console.error(`❌ 找不到 JSON 檔案: ${CONFIG.JSON_FILE}`);
        console.log('\n請確保已從瀏覽器下載 timehut_media_urls.json 到 Downloads 資料夾');
        process.exit(1);
    }

    // 讀取 JSON
    console.log(`📄 讀取: ${CONFIG.JSON_FILE}`);
    const data = JSON.parse(fs.readFileSync(CONFIG.JSON_FILE, 'utf8'));

    console.log(`\n📊 媒體統計:`);
    console.log(`   照片: ${data.totalPhotos || data.photos?.length || 0}`);
    console.log(`   影片: ${data.totalVideos || data.videos?.length || 0}`);

    // 建立資料夾
    ensureDir(CONFIG.OUTPUT_DIR);
    ensureDir(CONFIG.PHOTO_DIR);
    ensureDir(CONFIG.VIDEO_DIR);

    const photos = data.photos || [];
    const videos = data.videos || [];

    progress.total = photos.length + videos.length;
    progress.startTime = Date.now();

    console.log(`\n⬇️ 開始下載...\n`);

    // 下載照片
    if (photos.length > 0) {
        console.log(`\n📸 下載照片 (${photos.length} 張)...\n`);
        const photoResults = await processQueue(photos, 'photo', CONFIG.PHOTO_DIR);
        console.log(`\n✅ 照片下載完成: ${photoResults.success.length} 成功, ${photoResults.failed.length} 失敗`);
    }

    // 下載影片
    if (videos.length > 0) {
        console.log(`\n🎥 下載影片 (${videos.length} 個)...\n`);
        const videoResults = await processQueue(videos, 'video', CONFIG.VIDEO_DIR);
        console.log(`\n✅ 影片下載完成: ${videoResults.success.length} 成功, ${videoResults.failed.length} 失敗`);
    }

    // 最終報告
    const elapsed = Math.round((Date.now() - progress.startTime) / 1000);
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`📊 下載報告`);
    console.log(`${'═'.repeat(50)}`);
    console.log(`   ✅ 成功: ${progress.completed}`);
    console.log(`   ❌ 失敗: ${progress.failed}`);
    console.log(`   ⏭️ 跳過: ${progress.skipped}`);
    console.log(`   ⏱️ 耗時: ${elapsed} 秒`);
    console.log(`\n📁 檔案位置:`);
    console.log(`   照片: ${CONFIG.PHOTO_DIR}`);
    console.log(`   影片: ${CONFIG.VIDEO_DIR}`);
    console.log(`${'═'.repeat(50)}\n`);
}

main().catch(console.error);
