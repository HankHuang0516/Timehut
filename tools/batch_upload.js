/**
 * 批量上傳照片到 Flickr - 使用與前端完全一樣的 API
 * 
 * 使用方式：
 * node tools/batch_upload.js <照片資料夾路徑> [child: 漢堡|涵涵]
 * 
 * 例如：
 * node tools/batch_upload.js "downloads/photos" 漢堡
 * node tools/batch_upload.js "downloads/photos" 涵涵
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const https = require('https');

// ========== 配置 ==========
// 與前端 config.js 完全一致
const CONFIG = {
    // Railway 後端 API URL
    UPLOAD_API_URL: 'https://just-healing-production.up.railway.app',

    // Children Configuration - 與前端一致
    CHILDREN: [
        {
            name: '漢堡',
            birthDate: '2019-11-11',
            albumId: '72177720331376949',
            emoji: '👶'
        },
        {
            name: '涵涵',
            birthDate: '2022-09-05',
            albumId: '72177720331368893',
            emoji: '👼'
        }
    ],

    // 上傳設定
    UPLOAD_DELAY_MS: 2000, // 每張照片間隔 2 秒
    MAX_RETRIES: 3,
    REQUEST_TIMEOUT: 180000, // 3 分鐘超時（大檔案需要更長時間）

    // 支援的檔案格式
    SUPPORTED_FORMATS: ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.heic', '.webp']
};

// 讀取已合併的照片標籤資料
let photoTagsMap = new Map();

function loadPhotoTags() {
    const tagsPath = path.join(__dirname, '..', 'timehut_photos_with_tags.json');
    if (fs.existsSync(tagsPath)) {
        const data = JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
        data.forEach(item => {
            // 用檔名作為 key（忽略大小寫）
            photoTagsMap.set(item.filename.toLowerCase(), item);
        });
        console.log(`📁 載入 ${photoTagsMap.size} 筆照片標籤資料`);
    } else {
        console.log('⚠️ 找不到 timehut_photos_with_tags.json，將不使用標籤資料');
    }
}

/**
 * 與前端 Uploader.uploadFiles 完全一致的上傳函數
 * POST /api/upload
 * - files: 檔案
 * - albumId: 相簿 ID
 * - tags: 標籤（空格分隔）
 */
async function uploadFile(filePath, options = {}) {
    const { albumId, tags } = options;

    return new Promise((resolve, reject) => {
        const url = new URL(`${CONFIG.UPLOAD_API_URL}/api/upload`);

        const form = new FormData();

        // 加入檔案（與前端 formData.append('files', file) 一致）
        form.append('files', fs.createReadStream(filePath));

        // 加入相簿 ID（與前端 formData.append('albumId', albumId) 一致）
        if (albumId) {
            form.append('albumId', albumId);
        }

        // 加入標籤（與前端 formData.append('tags', tags) 一致）
        if (tags) {
            form.append('tags', tags);
        }

        // 加入日期（新增功能）
        if (options.date) {
            form.append('date', options.date);
        }

        const options_ = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: form.getHeaders(),
            timeout: CONFIG.REQUEST_TIMEOUT
        };

        const req = https.request(options_, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);

                    // 與前端處理回應一致
                    if (json.results && json.results[0]) {
                        if (json.results[0].success) {
                            resolve(json.results[0]);
                        } else {
                            reject(new Error(json.results[0].error || 'Upload failed'));
                        }
                    } else if (json.error) {
                        reject(new Error(json.error));
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(new Error(`Parse error: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        form.pipe(req);
    });
}

// 取得資料夾中的所有照片
function getPhotosInFolder(folderPath) {
    const files = fs.readdirSync(folderPath);
    return files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return CONFIG.SUPPORTED_FORMATS.includes(ext);
    }).map(file => ({
        filename: file,
        path: path.join(folderPath, file)
    }));
}

// 延遲函數
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 健康檢查（與前端 Uploader.checkAuth 一致）
async function checkApiHealth() {
    return new Promise((resolve) => {
        const url = new URL(`${CONFIG.UPLOAD_API_URL}/health`);

        const req = https.get(url, { timeout: 15000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
}

// 主程式
async function main() {
    const folderPath = process.argv[2];
    const childName = process.argv[3] || '漢堡'; // 預設上傳到漢堡的相簿

    if (!folderPath) {
        console.log('❌ 請提供照片資料夾路徑');
        console.log('');
        console.log('使用方式: node tools/batch_upload.js <照片資料夾路徑> [小孩名稱]');
        console.log('');
        console.log('例如:');
        console.log('  node tools/batch_upload.js "downloads/photos" 漢堡');
        console.log('  node tools/batch_upload.js "downloads/photos" 涵涵');
        console.log('');
        console.log('預設會上傳到「漢堡」的相簿');
        process.exit(1);
    }

    if (!fs.existsSync(folderPath)) {
        console.log(`❌ 資料夾不存在: ${folderPath}`);
        process.exit(1);
    }

    // 找到對應小孩的相簿 ID
    const child = CONFIG.CHILDREN.find(c => c.name === childName);
    if (!child) {
        console.log(`❌ 找不到小孩: ${childName}`);
        console.log('   可用選項: ' + CONFIG.CHILDREN.map(c => c.name).join(', '));
        process.exit(1);
    }

    const albumId = child.albumId;

    console.log('🔍 檢查 Railway API 狀態...');
    const health = await checkApiHealth();

    if (!health) {
        console.log('❌ 無法連接到 Railway API');
        console.log(`   請確認 ${CONFIG.UPLOAD_API_URL} 可以存取`);
        process.exit(1);
    }

    console.log(`✅ API 狀態: ${health.status}`);
    console.log(`   已授權: ${health.authenticated ? '是' : '否'}`);

    if (!health.authenticated) {
        console.log('❌ Railway API 尚未授權 Flickr');
        console.log('   請先完成 OAuth 授權流程');
        process.exit(1);
    }

    // 載入標籤資料
    loadPhotoTags();

    // 取得照片列表
    const photos = getPhotosInFolder(folderPath);
    console.log('');
    console.log('========================================');
    console.log(`📸 找到 ${photos.length} 張照片/影片`);
    console.log(`👶 目標小孩: ${child.emoji} ${child.name}`);
    console.log(`📁 目標相簿 ID: ${albumId}`);
    console.log(`⏱️ 預估時間: ${Math.ceil(photos.length * CONFIG.UPLOAD_DELAY_MS / 60000)} 分鐘`);
    console.log('========================================');
    console.log('');

    // 統計
    let success = 0;
    let failed = 0;
    const results = [];
    const startTime = Date.now();

    // 逐一上傳（與前端 individual mode 一致）
    for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const progress = `[${i + 1}/${photos.length}]`;

        // 查找標籤資料
        const tagData = photoTagsMap.get(photo.filename.toLowerCase());
        const photoTags = tagData?.tags || [];
        const dateStr = tagData?.date || '';

        // 組合標籤：uploader:腳本 + 原始標籤（與前端邏輯一致）
        const uploaderTag = 'uploader:腳本';
        const allTags = [uploaderTag, ...photoTags].join(' ');

        console.log(`${progress} 上傳: ${photo.filename}`);
        if (photoTags.length > 0) {
            console.log(`   📌 標籤: ${photoTags.join(', ')}`);
        }
        if (dateStr) {
            console.log(`   📅 日期: ${dateStr}`);
        }

        let retries = 0;
        let uploadSuccess = false;

        while (retries < CONFIG.MAX_RETRIES && !uploadSuccess) {
            try {
                const result = await uploadFile(photo.path, {
                    albumId: albumId,
                    tags: allTags,
                    date: dateStr // 傳遞日期
                });
                console.log(`   ✅ 成功！Photo ID: ${result.photoId}`);
                success++;
                results.push({
                    file: photo.filename,
                    status: 'success',
                    photoId: result.photoId,
                    tags: photoTags,
                    date: dateStr
                });
                uploadSuccess = true;
            } catch (err) {
                retries++;
                if (retries < CONFIG.MAX_RETRIES) {
                    console.log(`   ⚠️ 失敗，重試 ${retries}/${CONFIG.MAX_RETRIES}: ${err.message}`);
                    await delay(3000); // 重試前等久一點
                } else {
                    console.log(`   ❌ 失敗: ${err.message}`);
                    failed++;
                    results.push({
                        file: photo.filename,
                        status: 'failed',
                        error: err.message
                    });
                }
            }
        }

        // 延遲，避免 API 限制（與前端批量上傳行為一致）
        if (i < photos.length - 1) {
            await delay(CONFIG.UPLOAD_DELAY_MS);
        }
    }

    const elapsedTime = Math.round((Date.now() - startTime) / 1000);

    // 輸出統計
    console.log('');
    console.log('========================================');
    console.log('📊 上傳完成統計');
    console.log('========================================');
    console.log(`✅ 成功: ${success}`);
    console.log(`❌ 失敗: ${failed}`);
    console.log(`📸 總計: ${photos.length}`);
    console.log(`⏱️ 耗時: ${Math.floor(elapsedTime / 60)}分${elapsedTime % 60}秒`);
    console.log(`👶 相簿: ${child.name} (${albumId})`);

    // 儲存結果
    const resultPath = path.join(__dirname, '..', 'upload_results.json');
    fs.writeFileSync(resultPath, JSON.stringify({
        summary: {
            child: child.name,
            albumId: albumId,
            success,
            failed,
            total: photos.length,
            elapsedSeconds: elapsedTime,
            timestamp: new Date().toISOString()
        },
        results
    }, null, 2));
    console.log(`\n📁 詳細結果已儲存到: upload_results.json`);

    if (failed > 0) {
        console.log('\n⚠️ 以下檔案上傳失敗:');
        results.filter(r => r.status === 'failed').forEach(r => {
            console.log(`   - ${r.file}: ${r.error}`);
        });
    }
}

// 執行
main().catch(err => {
    console.error('程式執行錯誤:', err);
    process.exit(1);
});
