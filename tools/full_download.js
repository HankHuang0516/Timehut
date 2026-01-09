/**
 * Timehut 完整下載解決方案
 * 
 * 步驟 1: 在 Timehut 網頁執行資料匯出
 * 步驟 2: 執行此腳本進行批量下載
 * 
 * 使用方法：
 * 1. 打開 https://www.timehut.us/index.html#/timeline
 * 2. 滾動載入所有照片
 * 3. 按 F12 打開 Console，執行以下程式碼提取 URL:
 * 
 * ===== 複製以下程式碼到 Console =====
 */

const EXTRACT_SCRIPT = `
(async function() {
    window.ALL_MEDIA = { photos: new Set(), videos: new Set() };
    
    const extract = () => {
        document.querySelectorAll('img').forEach(img => {
            const src = img.src || '';
            if (src.includes('peekaboocdn.com')) {
                if (src.includes('.mp4')) {
                    window.ALL_MEDIA.videos.add(src.split('?')[0].split('!')[0]);
                } else if (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png')) {
                    window.ALL_MEDIA.photos.add(src.split('!')[0].split('&x-oss-process')[0]);
                }
            }
        });
        document.querySelectorAll('video, video source').forEach(v => {
            const src = v.src || v.getAttribute('src') || '';
            if (src.includes('.mp4') && src.includes('peekaboocdn')) {
                window.ALL_MEDIA.videos.add(src.split('?')[0]);
            }
        });
    };
    
    // 滾動整個頁面
    alert('開始提取，請等待滾動完成...');
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 2000));
    
    let lastHeight = 0, sameCount = 0;
    while (sameCount < 10) {
        extract();
        window.scrollBy(0, 1000);
        await new Promise(r => setTimeout(r, 300));
        if (window.scrollY === lastHeight) sameCount++;
        else { sameCount = 0; lastHeight = window.scrollY; }
    }
    extract();
    
    const data = {
        exportDate: new Date().toISOString(),
        totalPhotos: window.ALL_MEDIA.photos.size,
        totalVideos: window.ALL_MEDIA.videos.size,
        photos: Array.from(window.ALL_MEDIA.photos),
        videos: Array.from(window.ALL_MEDIA.videos)
    };
    
    // 下載 JSON 檔案
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timehut_urls.json';
    a.click();
    
    alert(\`提取完成！\\n照片: \${data.totalPhotos}\\n影片: \${data.totalVideos}\\n\\n請將下載的 timehut_urls.json 移至:\\nC:/Hank/Other/project/Timehut/downloads/timehut_urls.json\\n\\n然後執行: node tools/full_download.js\`);
})();
`;

console.log('='.repeat(60));
console.log('Timehut 完整下載腳本');
console.log('='.repeat(60));
console.log('\n請在 Timehut 網頁的 Console 執行以下程式碼：\n');
console.log(EXTRACT_SCRIPT);
console.log('\n' + '='.repeat(60));

// ===== 下載邏輯 =====
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CONFIG = {
    JSON_FILE: path.join(__dirname, '..', 'downloads', 'timehut_urls.json'),
    PHOTO_DIR: path.join(__dirname, '..', 'downloads', 'photos'),
    VIDEO_DIR: path.join(__dirname, '..', 'downloads', 'videos'),
    CONCURRENT: 5,
    TIMEOUT: 60000
};

async function downloadFile(url, filepath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const req = protocol.get(url, { timeout: CONFIG.TIMEOUT }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                downloadFile(res.headers.location, filepath).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            const file = fs.createWriteStream(filepath);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(true); });
            file.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function main() {
    // 檢查 JSON 檔案
    if (!fs.existsSync(CONFIG.JSON_FILE)) {
        console.log(`\n❌ 找不到: ${CONFIG.JSON_FILE}`);
        console.log('\n請先在 Timehut 網頁執行上面的提取腳本，');
        console.log('然後將下載的 timehut_urls.json 移至 downloads 資料夾');
        return;
    }

    // 確保資料夾存在
    [CONFIG.PHOTO_DIR, CONFIG.VIDEO_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    // 讀取資料
    const data = JSON.parse(fs.readFileSync(CONFIG.JSON_FILE, 'utf8'));
    console.log(`\n📊 資料統計:`);
    console.log(`   照片: ${data.photos?.length || 0}`);
    console.log(`   影片: ${data.videos?.length || 0}`);

    let completed = 0, failed = 0, skipped = 0;
    const total = (data.photos?.length || 0) + (data.videos?.length || 0);

    const download = async (urls, type, dir) => {
        for (let i = 0; i < urls.length; i += CONFIG.CONCURRENT) {
            const batch = urls.slice(i, i + CONFIG.CONCURRENT);
            await Promise.all(batch.map(async (url, j) => {
                const idx = i + j;
                const filename = path.basename(new URL(url).pathname);
                const filepath = path.join(dir, filename || `${type}_${idx}.${type === 'photo' ? 'jpg' : 'mp4'}`);

                if (fs.existsSync(filepath)) {
                    skipped++;
                    return;
                }

                try {
                    await downloadFile(url, filepath);
                    completed++;
                } catch {
                    failed++;
                }

                const pct = Math.round((completed + failed + skipped) / total * 100);
                process.stdout.write(`\r[${pct}%] ✅ ${completed} ❌ ${failed} ⏭️ ${skipped}`);
            }));
        }
    };

    console.log('\n⬇️ 開始下載...\n');

    if (data.photos) await download(data.photos, 'photo', CONFIG.PHOTO_DIR);
    if (data.videos) await download(data.videos, 'video', CONFIG.VIDEO_DIR);

    console.log(`\n\n${'═'.repeat(50)}`);
    console.log(`📊 下載完成！`);
    console.log(`   ✅ 成功: ${completed}`);
    console.log(`   ❌ 失敗: ${failed}`);
    console.log(`   ⏭️ 跳過: ${skipped}`);
    console.log(`\n📁 照片: ${CONFIG.PHOTO_DIR}`);
    console.log(`📁 影片: ${CONFIG.VIDEO_DIR}`);
    console.log('═'.repeat(50));
}

main().catch(console.error);
