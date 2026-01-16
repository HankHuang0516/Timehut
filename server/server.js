/**
 * 黃家小屋 - Flickr 上傳後端服務
 * 支援批量上傳、照片、影片
 *
 * v2.0: Staged Upload - 先存本地，背景上傳 Flickr
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { OAuth } = require('oauth');
const https = require('https');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
console.log("!!!!!!!! SERVER UNIFIED FIX STARTING - TIMESTAMP: " + Date.now() + " !!!!!!!");
console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

app.get('/api/version', (req, res) => {
    res.json({ version: 'v5.0-UNIFIED', timestamp: Date.now() });
});

// Debug endpoint to test video resolution logic
app.get('/api/test_video_fix/:id', async (req, res) => {
    const { id } = req.params;
    const url = 'https://api.flickr.com/services/rest/';
    const results = { step0_setPublic: null, step1_anonSizes: null, foundMp4: null };

    try {
        // 1. Force public
        results.step0_setPublic = await setPhotoPublic(id);

        // 2. Wait
        await new Promise(r => setTimeout(r, 3000));

        // 3. Anonymous call
        const anonParams = {
            method: 'flickr.photos.getSizes',
            api_key: process.env.FLICKR_API_KEY,
            photo_id: id,
            format: 'json',
            nojsoncallback: '1'
        };
        const anonQs = Object.keys(anonParams).map(k => `${k}=${anonParams[k]}`).join('&');
        const anonRes = await fetch(`${url}?${anonQs}`);
        results.step1_anonSizes = await anonRes.json();

        // 4. Check for MP4
        if (results.step1_anonSizes.stat === 'ok' && results.step1_anonSizes.sizes && results.step1_anonSizes.sizes.size) {
            results.foundMp4 = results.step1_anonSizes.sizes.size.find(s =>
                s.label.includes('Site MP4') ||
                s.label.includes('Mobile MP4') ||
                s.label.includes('HD') ||
                (s.source && s.source.includes('.mp4'))
            );
        }

        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==================== 上傳佇列管理 ====================
const QUEUE_FILE = path.join(__dirname, 'uploads', 'queue.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// 確保 uploads 目錄存在
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * 讀取上傳佇列
 */
function readQueue() {
    try {
        if (fs.existsSync(QUEUE_FILE)) {
            const data = fs.readFileSync(QUEUE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('[QUEUE] Error reading queue:', error);
    }
    return [];
}

/**
 * 寫入上傳佇列
 */
function writeQueue(queue) {
    try {
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
    } catch (error) {
        console.error('[QUEUE] Error writing queue:', error);
    }
}

/**
 * 新增項目到佇列
 */
function addToQueue(item) {
    const queue = readQueue();
    queue.push(item);
    writeQueue(queue);
    return item;
}

/**
 * 更新佇列項目
 */
function updateQueueItem(localId, updates) {
    const queue = readQueue();
    const index = queue.findIndex(item => item.localId === localId);
    if (index !== -1) {
        queue[index] = { ...queue[index], ...updates };
        writeQueue(queue);
        return queue[index];
    }
    return null;
}

/**
 * 從佇列移除項目
 */
function removeFromQueue(localId) {
    const queue = readQueue();
    const filtered = queue.filter(item => item.localId !== localId);
    writeQueue(filtered);
}

/**
 * 取得待處理的佇列項目
 */
function getPendingItems() {
    return readQueue().filter(item => item.status === 'pending');
}

/**
 * 取得指定相簿的本地照片
 */
function getLocalPhotosForAlbum(albumId) {
    return readQueue().filter(item =>
        item.albumId === albumId &&
        (item.status === 'pending' || item.status === 'uploading')
    );
}

// ==================== 背景上傳 Worker ====================
let isProcessingQueue = false;

// 上傳配置
const UPLOAD_CONFIG = {
    maxRetries: 3,           // 最大重試次數
    retryDelayMs: 2000,      // 重試延遲（毫秒）
    uploadTimeoutMs: 300000, // 上傳超時 5 分鐘（大檔案需要）
    networkCheckUrl: 'https://api.flickr.com/services/rest/?method=flickr.test.echo&api_key=' + (process.env.FLICKR_API_KEY || ''),
};

/**
 * 判斷錯誤是否可重試
 */
function isRetryableError(error) {
    const retryablePatterns = [
        /ECONNRESET/i,
        /ETIMEDOUT/i,
        /ENOTFOUND/i,
        /ENETUNREACH/i,
        /ECONNREFUSED/i,
        /socket hang up/i,
        /network/i,
        /timeout/i,
        /EPIPE/i,
        /EAI_AGAIN/i,
        /502/i,
        /503/i,
        /504/i,
    ];

    const errorStr = error.message || error.toString();
    return retryablePatterns.some(pattern => pattern.test(errorStr));
}

/**
 * 延遲函數
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 檢查網路連線
 */
async function checkNetworkConnectivity() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(UPLOAD_CONFIG.networkCheckUrl, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        return response.ok;
    } catch (error) {
        console.log('[NETWORK] Connectivity check failed:', error.message);
        return false;
    }
}

/**
 * 帶重試的上傳到 Flickr
 */
async function uploadToFlickrWithRetry(file, title, description, tags, maxRetries = UPLOAD_CONFIG.maxRetries) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[UPLOAD] Attempt ${attempt}/${maxRetries} for ${file.originalname}`);

            // 如果不是第一次嘗試，先檢查網路
            if (attempt > 1) {
                const isOnline = await checkNetworkConnectivity();
                if (!isOnline) {
                    console.log(`[UPLOAD] Network offline, waiting before retry...`);
                    await delay(UPLOAD_CONFIG.retryDelayMs * attempt);
                    continue;
                }
            }

            const photoId = await uploadToFlickr(file, title, description, tags);
            return photoId;

        } catch (error) {
            lastError = error;
            console.error(`[UPLOAD] Attempt ${attempt} failed:`, error.message);

            // 判斷是否可重試
            if (!isRetryableError(error)) {
                console.log(`[UPLOAD] Non-retryable error, giving up`);
                throw error;
            }

            // 如果還有重試機會，等待後重試
            if (attempt < maxRetries) {
                const waitTime = UPLOAD_CONFIG.retryDelayMs * attempt;
                console.log(`[UPLOAD] Retryable error, waiting ${waitTime}ms before retry...`);
                await delay(waitTime);
            }
        }
    }

    throw lastError || new Error('Upload failed after all retries');
}

/**
 * 處理上傳佇列（背景執行）- 增強版
 */
async function processUploadQueue() {
    if (isProcessingQueue) {
        console.log('[WORKER] Already processing queue, skipping...');
        return;
    }

    if (!oauthTokens.accessToken) {
        console.log('[WORKER] No OAuth token, skipping queue processing');
        return;
    }

    const pendingItems = getPendingItems();
    if (pendingItems.length === 0) {
        console.log('[WORKER] No pending items in queue');
        return;
    }

    // 先檢查網路連線
    const isOnline = await checkNetworkConnectivity();
    if (!isOnline) {
        console.log('[WORKER] Network appears offline, scheduling retry in 30 seconds...');
        setTimeout(() => processUploadQueue().catch(console.error), 30000);
        return;
    }

    isProcessingQueue = true;
    console.log(`[WORKER] Starting to process ${pendingItems.length} pending uploads...`);

    let successCount = 0;
    let failCount = 0;
    let retryLaterCount = 0;

    for (const item of pendingItems) {
        try {
            console.log(`[WORKER] Processing: ${item.originalFilename} (${item.localId})`);

            // 更新狀態為上傳中，記錄嘗試次數
            const retryCount = (item.retryCount || 0) + 1;
            updateQueueItem(item.localId, {
                status: 'uploading',
                retryCount,
                lastAttempt: new Date().toISOString()
            });

            // 檢查檔案是否存在
            if (!fs.existsSync(item.localPath)) {
                console.error(`[WORKER] File not found: ${item.localPath}`);
                updateQueueItem(item.localId, {
                    status: 'error',
                    error: 'File not found (永久錯誤)'
                });
                failCount++;
                continue;
            }

            // 上傳到 Flickr（帶重試）
            const file = {
                path: item.localPath,
                originalname: item.originalFilename,
                mimetype: item.mimetype
            };

            const photoId = await uploadToFlickrWithRetry(file, item.title, item.description, item.tags);
            console.log(`[WORKER] Uploaded to Flickr, photoId: ${photoId}`);

            if (photoId) {
                // 加入相簿（帶重試）
                if (item.albumId) {
                    try {
                        await addPhotoToAlbumWithRetry(photoId, item.albumId);
                        console.log(`[WORKER] Added to album ${item.albumId}`);
                    } catch (albumError) {
                        console.error(`[WORKER] Failed to add to album (will continue):`, albumError.message);
                    }
                }

                // 設定日期（如果有）
                if (item.date) {
                    try {
                        await setPhotoDate(photoId, item.date);
                    } catch (dateError) {
                        console.error(`[WORKER] Failed to set date (will continue):`, dateError.message);
                    }
                }

                // 更新佇列：標記完成並記錄 Flickr photoId
                updateQueueItem(item.localId, {
                    status: 'completed',
                    flickrPhotoId: photoId,
                    completedAt: new Date().toISOString()
                });

                // 刪除本地檔案
                try {
                    fs.unlinkSync(item.localPath);
                    console.log(`[WORKER] Deleted local file: ${item.localPath}`);
                } catch (e) {
                    console.error(`[WORKER] Failed to delete local file:`, e.message);
                }

                // 從佇列移除已完成的項目
                removeFromQueue(item.localId);
                console.log(`[WORKER] ✅ Completed: ${item.originalFilename}`);
                successCount++;

            } else {
                // Flickr 返回 null（可能是影片處理中）
                updateQueueItem(item.localId, {
                    status: 'processing',
                    message: 'Video is being processed by Flickr'
                });
                console.log(`[WORKER] ⏳ Video processing: ${item.originalFilename}`);
            }

        } catch (error) {
            console.error(`[WORKER] Error processing ${item.localId}:`, error.message);

            const retryCount = (item.retryCount || 0);
            const isRetryable = isRetryableError(error);

            if (isRetryable && retryCount < 5) {
                // 可重試錯誤，標記為 pending 稍後重試
                updateQueueItem(item.localId, {
                    status: 'pending',
                    error: `${error.message} (將自動重試)`,
                    retryCount: retryCount
                });
                retryLaterCount++;
                console.log(`[WORKER] ⏳ Will retry later: ${item.originalFilename} (attempt ${retryCount})`);
            } else {
                // 永久錯誤或超過重試次數
                updateQueueItem(item.localId, {
                    status: 'error',
                    error: isRetryable ? `${error.message} (已達最大重試次數)` : error.message
                });
                failCount++;
                console.log(`[WORKER] ❌ Failed permanently: ${item.originalFilename}`);
            }
        }

        // 每個檔案之間稍微延遲，避免過快請求
        await delay(500);
    }

    isProcessingQueue = false;
    console.log(`[WORKER] Queue processing completed: ${successCount} success, ${failCount} failed, ${retryLaterCount} retry later`);

    // 重新檢查是否有新增的待處理項目（解決批量上傳時新項目被遺漏的問題）
    const newPendingItems = getPendingItems();
    if (newPendingItems.length > 0) {
        console.log(`[WORKER] Found ${newPendingItems.length} new pending items, processing immediately...`);
        // 使用 setImmediate 避免遞迴太深
        setImmediate(() => processUploadQueue().catch(console.error));
        return;
    }

    // 如果有需要重試的項目，30 秒後再次處理
    if (retryLaterCount > 0) {
        console.log(`[WORKER] Scheduling retry for ${retryLaterCount} items in 30 seconds...`);
        setTimeout(() => processUploadQueue().catch(console.error), 30000);
    }
}

/**
 * 建立模擬 Flickr 照片物件（用於前端渲染）
 */
function createLocalPhotoObject(item, baseUrl) {
    const localUrl = `${baseUrl}/uploads/${item.localFilename}`;
    return {
        id: item.localId,
        title: item.title || item.originalFilename,
        isprimary: '0',
        ispublic: '0',
        isfriend: '1',
        isfamily: '1',
        tags: item.tags || '',
        datetaken: item.createdAt,
        dateupload: Math.floor(new Date(item.createdAt).getTime() / 1000).toString(),
        // 本地 URL（模擬 Flickr URL 結構）
        url_sq: localUrl,
        url_t: localUrl,
        url_s: localUrl,
        url_m: localUrl,
        url_l: localUrl,
        url_o: localUrl,
        // 標記為本地照片
        _isLocal: true,
        _localStatus: item.status,
        _localId: item.localId,
        // 媒體類型
        media: item.mimetype?.startsWith('video/') ? 'video' : 'photo'
    };
}

// Multer 設定 - 暫存上傳檔案
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB max (Flickr limit)
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/mpeg'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('不支援的檔案格式'));
        }
    }
});

// 取得 Git 版本資訊
const GIT_VERSION = process.env.RAILWAY_GIT_COMMIT_SHA ||
    (fs.existsSync('.git') ? require('child_process').execSync('git rev-parse --short HEAD').toString().trim() : 'dev');

// 強制 CORS 設定 (Manual Headers)
app.use((req, res, next) => {
    // 允許任何來源 (Reflect origin)
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }

    // 允許的 Headers
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // 處理 Preflight
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

// 靜態檔案服務 - 提供本地上傳檔案存取
app.use('/uploads', express.static(UPLOADS_DIR));

// OAuth 設定
const oauth = new OAuth(
    'https://www.flickr.com/services/oauth/request_token',
    'https://www.flickr.com/services/oauth/access_token',
    process.env.FLICKR_API_KEY,
    process.env.FLICKR_API_SECRET,
    '1.0A',
    null,
    'HMAC-SHA1'
);

// 儲存 OAuth tokens（生產環境應該用資料庫）
let oauthTokens = {
    accessToken: process.env.FLICKR_OAUTH_TOKEN || '',
    accessTokenSecret: process.env.FLICKR_OAUTH_TOKEN_SECRET || ''
};

// 暫存 request token
let tempRequestTokens = {};

// ==================== API 路由 ====================

// 版本檢查頁面
app.get('/version', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Timehut Backend Version</title>
            <style>
                body { font-family: monospace; padding: 20px; background: #1a1a1a; color: #0f0; }
                .box { border: 1px solid #333; padding: 20px; border-radius: 8px; max-width: 600px; margin: 0 auto; }
                h1 { margin-top: 0; color: #fff; }
                .label { color: #888; }
                .value { font-size: 1.2em; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="box">
                <h1>Backend Status</h1>
                <p><span class="label">Version (Git SHA):</span><br><span class="value">${GIT_VERSION}</span></p>
                <p><span class="label">Time:</span><br><span class="value">${new Date().toISOString()}</span></p>
                <p><span class="label">Environment:</span><br><span class="value">${process.env.RAILWAY_ENVIRONMENT || 'Local'}</span></p>
                <hr style="border-color: #333">
                <p style="color: #aaa">CORS is enabled for all origins.</p>
            </div>
        </body>
        </html>
    `);
});

// 健康檢查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: GIT_VERSION,
        authenticated: !!oauthTokens.accessToken,
        timestamp: new Date().toISOString()
    });
});

// 檢查授權狀態
app.get('/api/auth/status', (req, res) => {
    res.json({
        authenticated: !!oauthTokens.accessToken,
        userId: process.env.FLICKR_USER_ID,
        version: '1.3'
    });
});

// 開始 OAuth 授權流程
app.get('/api/auth/start', (req, res) => {
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/callback`;

    oauth.getOAuthRequestToken({ oauth_callback: callbackUrl }, (error, token, tokenSecret) => {
        if (error) {
            console.error('OAuth Request Token Error:', error);
            return res.status(500).json({ error: '無法開始授權流程' });
        }

        // 暫存 token secret
        tempRequestTokens[token] = tokenSecret;

        // 回傳授權 URL
        const authUrl = `https://www.flickr.com/services/oauth/authorize?oauth_token=${token}&perms=delete`;
        res.json({ authUrl });
    });
});

// OAuth 回調
app.get('/api/auth/callback', (req, res) => {
    const { oauth_token, oauth_verifier } = req.query;
    const tokenSecret = tempRequestTokens[oauth_token];

    if (!tokenSecret) {
        return res.status(400).send('無效的授權請求');
    }

    oauth.getOAuthAccessToken(
        oauth_token,
        tokenSecret,
        oauth_verifier,
        (error, accessToken, accessTokenSecret, results) => {
            if (error) {
                console.error('OAuth Access Token Error:', error);
                return res.status(500).send('授權失敗');
            }

            // 儲存 access tokens
            oauthTokens.accessToken = accessToken;
            oauthTokens.accessTokenSecret = accessTokenSecret;

            // 清理暫存
            delete tempRequestTokens[oauth_token];

            console.log('✅ Flickr 授權成功！');
            console.log('請將以下 token 加入環境變數：');
            console.log(`FLICKR_OAUTH_TOKEN=${accessToken}`);
            console.log(`FLICKR_OAUTH_TOKEN_SECRET=${accessTokenSecret}`);

            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>授權成功</title>
                    <style>
                        body { font-family: sans-serif; text-align: center; padding: 50px; }
                        h1 { color: #28a745; }
                        .token-box { background: #f5f5f5; padding: 20px; margin: 20px; border-radius: 8px; text-align: left; }
                        code { background: #e9e9e9; padding: 2px 6px; border-radius: 4px; }
                    </style>
                </head>
                <body>
                    <h1>✅ Flickr 授權成功！</h1>
                    <p>您現在可以關閉此視窗，回到黃家小屋上傳照片了。</p>
                    <div class="token-box">
                        <p><strong>請將以下環境變數加入 Railway：</strong></p>
                        <p><code>FLICKR_OAUTH_TOKEN=${accessToken}</code></p>
                        <p><code>FLICKR_OAUTH_TOKEN_SECRET=${accessTokenSecret}</code></p>
                    </div>
                    <script>
                        // 通知父視窗授權完成
                        if (window.opener) {
                            window.opener.postMessage({ type: 'FLICKR_AUTH_SUCCESS' }, '*');
                        }
                    </script>
                </body>
                </html>
            `);
        }
    );
});

// 上傳照片/影片 - Staged Upload (v2.0)
// 先存本地並立即回應，背景上傳到 Flickr
app.post('/api/upload', upload.array('files', 20), async (req, res) => {
    console.log('[UPLOAD] Received staged upload request');

    // 檢查授權（仍需授權，但上傳會在背景進行）
    if (!oauthTokens.accessToken) {
        console.log('[UPLOAD] Unauthorized: Missing access token');
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: '請選擇要上傳的檔案' });
    }

    const { albumId, title, description, tags, date } = req.body;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    console.log('[UPLOAD] Request Body:', { albumId, title, description, tags, date });

    const results = [];
    const queuedItems = [];

    for (const file of req.files) {
        try {
            // 產生唯一 ID
            const localId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const localFilename = path.basename(file.path);

            // 建立佇列項目
            const queueItem = {
                localId,
                localFilename,
                localPath: file.path,
                originalFilename: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                albumId: albumId || null,
                title: title || file.originalname,
                description: description || '',
                tags: tags || '',
                date: date || null,
                status: 'pending',
                createdAt: new Date().toISOString(),
                flickrPhotoId: null
            };

            // 加入佇列
            addToQueue(queueItem);
            queuedItems.push(queueItem);

            // 建立本地照片物件（模擬 Flickr 格式）
            const localPhotoObject = createLocalPhotoObject(queueItem, baseUrl);

            results.push({
                filename: file.originalname,
                success: true,
                localId: localId,
                photo: localPhotoObject,
                _staged: true
            });

            console.log(`[UPLOAD] Queued: ${file.originalname} -> ${localId}`);

        } catch (error) {
            console.error(`[UPLOAD] Error queuing ${file.originalname}:`, error);
            results.push({
                filename: file.originalname,
                success: false,
                error: error.message
            });

            // 嘗試清理檔案
            try { fs.unlinkSync(file.path); } catch (e) { }
        }
    }

    // 立即回應前端
    const successCount = results.filter(r => r.success).length;
    console.log(`[UPLOAD] Queued ${successCount}/${results.length} files, starting background processing...`);

    res.json({
        message: `已收到 ${successCount}/${results.length} 個檔案，正在背景上傳到 Flickr`,
        results,
        _staged: true
    });

    // 觸發背景上傳（fire-and-forget）
    setImmediate(() => {
        processUploadQueue().catch(err => {
            console.error('[UPLOAD] Background processing error:', err);
        });
    });
});

// 傳統同步上傳 API（保留用於需要立即確認的場景）
app.post('/api/upload/sync', upload.array('files', 20), async (req, res) => {
    console.log('[UPLOAD-SYNC] Received synchronous upload request');

    if (!oauthTokens.accessToken) {
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: '請選擇要上傳的檔案' });
    }

    const { albumId, title, description, tags } = req.body;
    const results = [];

    for (const file of req.files) {
        try {
            console.log(`[UPLOAD-SYNC] Uploading: ${file.originalname}`);
            const photoId = await uploadToFlickr(file, title, description, tags);

            if (albumId && photoId) {
                try {
                    await addPhotoToAlbumWithRetry(photoId, albumId);
                } catch (albumError) {
                    console.error(`[UPLOAD-SYNC] Album error:`, albumError);
                }
            }

            if (req.body.date && photoId) {
                try {
                    await setPhotoDate(photoId, req.body.date);
                } catch (dateError) {
                    console.error(`[UPLOAD-SYNC] Date error:`, dateError);
                }
            }

            results.push({
                filename: file.originalname,
                success: true,
                photoId
            });

            fs.unlinkSync(file.path);

        } catch (error) {
            console.error(`[UPLOAD-SYNC] Failed ${file.originalname}:`, error);
            results.push({
                filename: file.originalname,
                success: false,
                error: error.message
            });
            try { fs.unlinkSync(file.path); } catch (e) { }
        }
    }

    res.json({
        message: `上傳完成：${results.filter(r => r.success).length}/${results.length} 個檔案成功`,
        results
    });
});

// 刪除照片 API
app.delete('/api/photo/:photoId', async (req, res) => {
    if (!oauthTokens.accessToken) {
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    const { photoId } = req.params;
    console.log(`[DELETE] Deleting photo: ${photoId}`);

    try {
        const result = await deletePhotoFromFlickr(photoId);
        console.log(`[DELETE] Photo ${photoId} deleted successfully`);
        res.json({ success: true, photoId });
    } catch (error) {
        console.error(`[DELETE] Failed to delete photo ${photoId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// 批量刪除照片 API
app.post('/api/photos/delete', async (req, res) => {
    if (!oauthTokens.accessToken) {
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    const { photoIds } = req.body;

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
        return res.status(400).json({ error: '請提供要刪除的照片 ID 陣列' });
    }

    console.log(`[DELETE] Batch deleting ${photoIds.length} photos`);

    const results = [];
    for (const photoId of photoIds) {
        try {
            await deletePhotoFromFlickr(photoId);
            results.push({ photoId, success: true });
        } catch (error) {
            results.push({ photoId, success: false, error: error.message });
        }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[DELETE] Batch delete complete: ${successCount}/${photoIds.length} succeeded`);

    res.json({
        success: successCount > 0,
        deleted: successCount,
        message: `刪除完成：${successCount}/${photoIds.length} 張成功`,
        results
    });
});

// 批量加標籤 API (P1)
app.post('/api/photos/tags/add', async (req, res) => {
    if (!oauthTokens.accessToken) {
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    const { photoIds, tags } = req.body;
    if (!photoIds || !Array.isArray(photoIds) || !tags) {
        return res.status(400).json({ error: '參數錯誤' });
    }

    console.log(`[BATCH-TAGS] Adding tags "${tags}" to ${photoIds.length} photos`);

    const results = [];
    for (const photoId of photoIds) {
        try {
            await addPhotoTags(photoId, tags);
            results.push({ photoId, success: true });
        } catch (error) {
            results.push({ photoId, success: false, error: error.message });
        }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
        message: `標籤添加完成：${successCount}/${photoIds.length} 張成功`,
        results
    });
});

// 批量加入相簿 API (P1)
app.post('/api/album/:albumId/add_photos', async (req, res) => {
    if (!oauthTokens.accessToken) {
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    const { albumId } = req.params;
    const { photoIds } = req.body;

    if (!photoIds || !Array.isArray(photoIds)) {
        return res.status(400).json({ error: '請提供照片 ID' });
    }

    console.log(`[BATCH-ALBUM] Adding ${photoIds.length} photos to album ${albumId}`);

    const results = [];
    for (const photoId of photoIds) {
        try {
            await addPhotoToAlbum(photoId, albumId);
            results.push({ photoId, success: true });
        } catch (error) {
            // Error 1: Photo already in set (code 1) - treat as success or ignore
            if (error.message.includes('code 1')) {
                results.push({ photoId, success: true, message: 'Already in album' });
            } else {
                results.push({ photoId, success: false, error: error.message });
            }
        }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
        message: `加入相簿完成：${successCount}/${photoIds.length} 張成功`,
        results
    });
});

// 批量更新照片日期 API（用於移動相集功能）
app.post('/api/photos/update-date', async (req, res) => {
    if (!oauthTokens.accessToken) {
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    const { photoIds, targetDate } = req.body;

    if (!photoIds || !Array.isArray(photoIds)) {
        return res.status(400).json({ error: '請提供照片 ID' });
    }

    if (!targetDate) {
        return res.status(400).json({ error: '請提供目標日期' });
    }

    console.log(`[UPDATE-DATE] Updating ${photoIds.length} photos to ${targetDate}`);

    const results = [];
    for (const photoId of photoIds) {
        try {
            await setPhotoDate(photoId, targetDate);
            results.push({ photoId, success: true });
        } catch (error) {
            console.error(`[UPDATE-DATE] Failed for ${photoId}:`, error.message);
            results.push({ photoId, success: false, error: error.message });
        }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
        message: `更新日期完成：${successCount}/${photoIds.length} 張成功`,
        results
    });
});

// 圖片/影片代理 API (Enhanced: Resolves /play/ URLs)
app.get('/api/proxy-video', async (req, res) => {
    let url = req.query.url;
    if (!url) return res.status(400).send('Missing url');

    try {
        console.log(`[PROXY-VIDEO] Original URL: ${url}`);

        // NEW: If this is a Flickr /play/ URL, resolve it first
        if (url.includes('flickr.com') && url.includes('/play/')) {
            console.log(`[PROXY-VIDEO] Detected /play/ URL. Attempting redirect resolution...`);
            try {
                const resolveResp = await fetch(url, {
                    method: 'GET',
                    redirect: 'follow',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.flickr.com/',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                    }
                });

                console.log(`[PROXY-VIDEO] Resolved Status: ${resolveResp.status}, Final URL: ${resolveResp.url}`);
                const contentType = resolveResp.headers.get('content-type');
                console.log(`[PROXY-VIDEO] Resolved Content-Type: ${contentType}`);

                if (contentType && contentType.includes('video')) {
                    url = resolveResp.url;
                    console.log(`[PROXY-VIDEO] Using resolved video URL.`);
                }
            } catch (resolveErr) {
                console.error(`[PROXY-VIDEO] Redirect resolution failed: ${resolveErr.message}`);
            }
        }

        console.log(`[PROXY-VIDEO] Fetching URL: ${url}`);
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.flickr.com/'
        };
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
            console.log(`[PROXY-VIDEO] Range request: ${req.headers.range}`);
        }

        const response = await fetch(url, { headers });
        console.log(`[PROXY-VIDEO] Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            console.error(`[PROXY-VIDEO] Fetch failed: ${response.status} ${response.statusText} for ${url}`);
            return res.status(response.status).send(`Fetch failed: ${response.statusText}`);
        }

        const contentTypes = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
        contentTypes.forEach(type => {
            const val = response.headers.get(type);
            if (val) res.setHeader(type, val);
        });

        res.status(response.status);

        if (response.body && typeof response.body.pipe === 'function') {
            response.body.pipe(res);
        } else {
            const { Readable } = require('stream');
            if (response.body) {
                Readable.fromWeb(response.body).pipe(res);
            } else {
                res.end();
            }
        }
    } catch (error) {
        console.error('Proxy Error:', error);
        if (!res.headersSent) res.status(500).send('Failed to fetch media');
    }
});

// 編輯照片標籤 API (P0)
app.put('/api/photo/:photoId/tags', async (req, res) => {
    if (!oauthTokens.accessToken) {
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    const { photoId } = req.params;
    const { tags } = req.body;

    console.log(`[TAGS] Setting tags for photo ${photoId}: ${tags}`);

    try {
        await setPhotoTags(photoId, tags);
        console.log(`[TAGS] Tags updated successfully for photo ${photoId}`);
        res.json({ success: true, photoId, tags });
    } catch (error) {
        console.error(`[TAGS] Failed to set tags for photo ${photoId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// 取得相簿列表
app.get('/api/albums', async (req, res) => {
    // ... (保持原樣)
});

// ==================== 上傳狀態 API (v2.0) ====================

// 取得上傳佇列狀態
app.get('/api/uploads/status', (req, res) => {
    const queue = readQueue();
    const pending = queue.filter(item => item.status === 'pending').length;
    const uploading = queue.filter(item => item.status === 'uploading').length;
    const completed = queue.filter(item => item.status === 'completed').length;
    const error = queue.filter(item => item.status === 'error').length;

    res.json({
        total: queue.length,
        pending,
        uploading,
        completed,
        error,
        isProcessing: isProcessingQueue,
        items: queue.map(item => ({
            localId: item.localId,
            filename: item.originalFilename,
            status: item.status,
            flickrPhotoId: item.flickrPhotoId,
            error: item.error,
            createdAt: item.createdAt
        }))
    });
});

// 取得單一上傳項目狀態
app.get('/api/uploads/status/:localId', (req, res) => {
    const { localId } = req.params;
    const queue = readQueue();
    const item = queue.find(i => i.localId === localId);

    if (!item) {
        return res.status(404).json({ error: 'Upload not found' });
    }

    res.json({
        localId: item.localId,
        filename: item.originalFilename,
        status: item.status,
        flickrPhotoId: item.flickrPhotoId,
        error: item.error,
        createdAt: item.createdAt,
        completedAt: item.completedAt
    });
});

// 重試失敗的上傳
app.post('/api/uploads/retry', async (req, res) => {
    const { localIds } = req.body;
    const queue = readQueue();

    let retryCount = 0;
    for (const localId of (localIds || [])) {
        const item = queue.find(i => i.localId === localId && i.status === 'error');
        if (item) {
            updateQueueItem(localId, { status: 'pending', error: null });
            retryCount++;
        }
    }

    if (retryCount > 0) {
        // 觸發背景處理
        setImmediate(() => processUploadQueue().catch(console.error));
    }

    res.json({
        message: `已重新排入 ${retryCount} 個項目`,
        retryCount
    });
});

// 取消/刪除上傳項目
app.delete('/api/uploads/:localId', (req, res) => {
    const { localId } = req.params;
    const queue = readQueue();
    const item = queue.find(i => i.localId === localId);

    if (!item) {
        return res.status(404).json({ error: 'Upload not found' });
    }

    // 刪除本地檔案（如果存在）
    if (item.localPath && fs.existsSync(item.localPath)) {
        try {
            fs.unlinkSync(item.localPath);
        } catch (e) {
            console.error('[DELETE-UPLOAD] Failed to delete file:', e);
        }
    }

    // 從佇列移除
    removeFromQueue(localId);

    res.json({ success: true, localId });
});

// 取得相簿照片 (Proxy) - v2.0: 合併本地待上傳照片
app.get('/api/album/:id/photos', async (req, res) => {
    if (!oauthTokens.accessToken) {
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    const { id } = req.params;
    const { page = 1, per_page = 50 } = req.query;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    try {
        // 1. 取得本地待上傳照片
        const localPhotos = getLocalPhotosForAlbum(id);
        const localPhotoObjects = localPhotos.map(item => createLocalPhotoObject(item, baseUrl));

        console.log(`[ALBUM] Found ${localPhotoObjects.length} local photos for album ${id}`);

        // 2. 取得 Flickr 照片
        const url = 'https://api.flickr.com/services/rest/';
        const params = {
            method: 'flickr.photosets.getPhotos',
            api_key: process.env.FLICKR_API_KEY,
            user_id: process.env.FLICKR_USER_ID,
            photoset_id: id,
            extras: 'date_taken,date_upload,description,tags,url_sq,url_t,url_s,url_m,url_l,url_o,media',
            page: page.toString(),
            per_page: per_page.toString(),
            format: 'json',
            nojsoncallback: '1',
            oauth_consumer_key: process.env.FLICKR_API_KEY,
            oauth_token: oauthTokens.accessToken,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: Math.floor(Date.now() / 1000),
            oauth_nonce: Math.random().toString(36).substring(2),
            oauth_version: '1.0'
        };

        // 建立簽名
        const crypto = require('crypto');
        const baseString = buildBaseString('GET', url, params);
        const signingKey = `${encodeURIComponent(process.env.FLICKR_API_SECRET)}&${encodeURIComponent(oauthTokens.accessTokenSecret)}`;
        const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

        params.oauth_signature = signature;

        // 建立 Query String
        const queryString = Object.keys(params)
            .sort()
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');

        const response = await fetch(`${url}?${queryString}`);
        const data = await response.json();

        if (data.stat === 'ok') {
            // 3. 合併：本地照片在前，Flickr 照片在後（僅第一頁）
            if (parseInt(page) === 1 && localPhotoObjects.length > 0) {
                data.photoset.photo = [...localPhotoObjects, ...data.photoset.photo];
                data.photoset.total = (parseInt(data.photoset.total) + localPhotoObjects.length).toString();
                data._hasLocalPhotos = true;
                data._localCount = localPhotoObjects.length;
                console.log(`[ALBUM] Merged ${localPhotoObjects.length} local + ${data.photoset.photo.length - localPhotoObjects.length} Flickr photos`);
            }

            res.json(data);
        } else {
            console.error('Flickr API Error (getPhotos):', data);
            res.status(500).json({ error: data.message });
        }
    } catch (error) {
        console.error('取得照片失敗:', error);
        res.status(500).json({ error: '無法取得照片' });
    }
});

// Helper: Set photo to public using Flickr API
async function setPhotoPublic(photoId) {
    if (!oauthTokens.accessToken) {
        throw new Error('尚未授權 Flickr');
    }

    const url = 'https://api.flickr.com/services/rest/';
    const params = {
        method: 'flickr.photos.setPerms',
        api_key: process.env.FLICKR_API_KEY,
        photo_id: photoId,
        is_public: '1',
        is_friend: '0',
        is_family: '0',
        perm_comment: '3',
        perm_addmeta: '3',
        format: 'json',
        nojsoncallback: '1',
        oauth_consumer_key: process.env.FLICKR_API_KEY,
        oauth_token: oauthTokens.accessToken,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000),
        oauth_nonce: Math.random().toString(36).substring(2),
        oauth_version: '1.0'
    };

    const crypto = require('crypto');
    const baseString = buildBaseString('POST', url, params);
    const signingKey = `${encodeURIComponent(process.env.FLICKR_API_SECRET)}&${encodeURIComponent(oauthTokens.accessTokenSecret)}`;
    const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
    params.oauth_signature = signature;

    const body = Object.keys(params)
        .sort()
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    const data = await response.json();

    if (data.stat !== 'ok') {
        console.warn(`[setPhotoPublic] Failed for ${photoId}:`, data.message);
        return false;
    }
    return true;
}

// Helper: 從 Flickr /play/ URL 取得真實的 MP4 URL
async function resolveFlickrVideoUrl(playUrl) {
    try {
        // Flickr /play/ URLs 會重定向到實際的 MP4 URL
        // 我們需要跟隨重定向取得最終的 URL
        const response = await fetch(playUrl, {
            method: 'HEAD',
            redirect: 'follow'
        });

        // 檢查最終 URL 是否是 MP4
        const finalUrl = response.url;
        if (finalUrl && finalUrl.includes('.mp4')) {
            console.log(`[resolveVideoUrl] Resolved to: ${finalUrl.substring(0, 100)}...`);
            return finalUrl;
        }

        // 如果 HEAD 不行，嘗試 GET 並檢查重定向
        const getResponse = await fetch(playUrl, {
            redirect: 'manual'
        });

        const location = getResponse.headers.get('location');
        if (location && location.includes('.mp4')) {
            console.log(`[resolveVideoUrl] Redirect to: ${location.substring(0, 100)}...`);
            return location;
        }

        return null;
    } catch (error) {
        console.error(`[resolveVideoUrl] Error: ${error.message}`);
        return null;
    }
}

// 取得照片尺寸/影片來源 (Proxy)
// 對於影片，會先設為公開以取得可播放的 MP4 URL
// 取得照片尺寸/影片來源 (Proxy)
// 對於影片，會先設為公開以取得可播放的 MP4 URL，並嘗試匿名存取以獲得真實連結
app.get('/api/photo/:id/sizes', async (req, res) => {
    if (!oauthTokens.accessToken) {
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    const { id } = req.params;
    const isVideo = req.query.media === 'video';
    const url = 'https://api.flickr.com/services/rest/';

    console.log(`[getSizes] Request for ${id}, isVideo=${isVideo}`);

    try {
        // 1. Force Public for Videos
        if (isVideo) {
            console.log(`[getSizes] Setting video ${id} to public...`);
            await setPhotoPublic(id);
            // Wait for Flickr propagation
            await new Promise(r => setTimeout(r, 2000));
        }

        // 2. Authenticated Call
        const params = {
            method: 'flickr.photos.getSizes',
            api_key: process.env.FLICKR_API_KEY,
            photo_id: id,
            format: 'json',
            nojsoncallback: '1',
            oauth_consumer_key: process.env.FLICKR_API_KEY,
            oauth_token: oauthTokens.accessToken,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: Math.floor(Date.now() / 1000),
            oauth_nonce: Math.random().toString(36).substring(2),
            oauth_version: '1.0'
        };

        const crypto = require('crypto');
        const baseString = buildBaseString('GET', url, params);
        const signingKey = `${encodeURIComponent(process.env.FLICKR_API_SECRET)}&${encodeURIComponent(oauthTokens.accessTokenSecret)}`;
        const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
        params.oauth_signature = signature;

        const qs = Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
        const authRes = await fetch(`${url}?${qs}`);
        const authData = await authRes.json();

        if (authData.stat !== 'ok') {
            console.error('[getSizes] Auth call failed:', authData);
            return res.status(500).json({ error: authData.message });
        }

        // 3. Scan for Direct MP4 in Auth Response
        let foundMp4 = null;
        if (authData.sizes && authData.sizes.size) {
            const mp4Size = authData.sizes.size.find(s =>
                s.label.includes('Site MP4') ||
                s.label.includes('Mobile MP4') ||
                (s.source && s.source.includes('.mp4'))
            );
            if (mp4Size) {
                console.log(`[getSizes] Found MP4 in Auth response: ${mp4Size.label}`);
                foundMp4 = mp4Size;
            }
        }

        // 4. Anonymous Fallback (if no MP4 found yet)
        if (isVideo && !foundMp4) {
            console.log('[getSizes] No MP4 in auth response. Constructing CDN URL...');

            // Extract secret from existing photo URLs to construct video CDN URL
            // Pattern: https://live.staticflickr.com/31337/{id}_{secret}_{size}.jpg
            // Video pattern: https://live.staticflickr.com/video/{id}_{secret}_mobile.mp4
            const photoSize = authData.sizes.size.find(s => s.source && s.source.includes('live.staticflickr.com'));
            if (photoSize) {
                const match = photoSize.source.match(/\/(\d+)_(\w+)_/);
                if (match) {
                    const photoId = match[1];
                    const secret = match[2];

                    // Try multiple CDN URL patterns
                    const cdnPatterns = [
                        `https://live.staticflickr.com/video/${photoId}_${secret}_mobile.mp4`,
                        `https://live.staticflickr.com/video/${photoId}_${secret}.mp4`,
                        `https://live.staticflickr.com/video/${photoId}/${secret}/720p.mp4`
                    ];

                    console.log(`[getSizes] Trying CDN patterns with secret: ${secret}`);

                    for (const cdnUrl of cdnPatterns) {
                        try {
                            const headResp = await fetch(cdnUrl, { method: 'HEAD' });
                            console.log(`[getSizes] HEAD ${cdnUrl}: ${headResp.status}`);

                            if (headResp.ok) {
                                console.log(`[getSizes] Found working CDN URL: ${cdnUrl}`);
                                authData.sizes.size.unshift({
                                    label: 'Site MP4 (CDN)',
                                    width: '720',
                                    height: '1280',
                                    source: cdnUrl,
                                    url: cdnUrl,
                                    media: 'video'
                                });
                                break;
                            }
                        } catch (e) {
                            console.error(`[getSizes] CDN probe failed for ${cdnUrl}: ${e.message}`);
                        }
                    }
                }
            }
        }

        res.json(authData);

    } catch (error) {
        console.error('取得 Sizes 失敗:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

// 設定照片權限為公開 API
app.post('/api/photo/:id/set_public', async (req, res) => {
    if (!oauthTokens.accessToken) {
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    const { id } = req.params;
    const url = 'https://api.flickr.com/services/rest/';

    // 參數準備
    const params = {
        method: 'flickr.photos.setPerms',
        api_key: process.env.FLICKR_API_KEY,
        photo_id: id,
        is_public: '1',
        is_friend: '0',
        is_family: '0',
        perm_comment: '3',
        perm_addmeta: '3',
        format: 'json',
        nojsoncallback: '1',
        oauth_consumer_key: process.env.FLICKR_API_KEY,
        oauth_token: oauthTokens.accessToken,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000),
        oauth_nonce: Math.random().toString(36).substring(2),
        oauth_version: '1.0'
    };

    try {
        const crypto = require('crypto');
        const baseString = buildBaseString('POST', url, params);
        const signingKey = `${encodeURIComponent(process.env.FLICKR_API_SECRET)}&${encodeURIComponent(oauthTokens.accessTokenSecret)}`;
        const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
        params.oauth_signature = signature;

        const formData = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            formData.append(key, value);
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });
        const data = await response.json();

        if (data.stat === 'ok') {
            console.log(`[PERMS] Set public for photo ${id}: Success`);
            res.json({ success: true, message: 'Permissions updated to public' });
        } else {
            console.error('Flickr API Error (setPerms):', data);
            res.status(500).json({ error: data.message });
        }
    } catch (error) {
        console.error('設定權限失敗:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});


// Debug Endpoint REMOVED for Ghostbusting

app.get('/api/version', (req, res) => {
    res.json({ version: 'v4.0-GHOSTBUSTING', timestamp: Date.now() });
});


async function uploadToFlickr(file, title, description, tags) {
    return new Promise((resolve, reject) => {
        const FormData = require('form-data');
        const form = new FormData();

        // 設定超時
        const UPLOAD_TIMEOUT = UPLOAD_CONFIG.uploadTimeoutMs; // 5 分鐘
        let timeoutId;
        let isCompleted = false;

        // 準備 OAuth 簽名參數
        const uploadUrl = 'https://up.flickr.com/services/upload/';
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = Math.random().toString(36).substring(2);

        // 非二進制的表單參數（這些需要參與簽名）
        const uploadParams = {
            is_public: '1',
            is_friend: '1',
            is_family: '1'
        };

        const oauthParams = {
            oauth_consumer_key: process.env.FLICKR_API_KEY,
            oauth_token: oauthTokens.accessToken,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_nonce: nonce,
            oauth_version: '1.0'
        };

        // 合併所有參數用於簽名（OAuth 參數 + 上傳參數）
        const allParams = { ...oauthParams, ...uploadParams };

        // 建立簽名
        const crypto = require('crypto');
        const baseString = buildBaseString('POST', uploadUrl, allParams);
        const signingKey = `${encodeURIComponent(process.env.FLICKR_API_SECRET)}&${encodeURIComponent(oauthTokens.accessTokenSecret)}`;
        const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

        oauthParams.oauth_signature = signature;

        // 建立 Authorization header
        const authHeader = 'OAuth ' + Object.keys(oauthParams)
            .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
            .join(', ');

        // 準備表單資料（照片必須在其他參數之後）
        Object.entries(uploadParams).forEach(([key, value]) => {
            form.append(key, value);
        });

        form.append('photo', fs.createReadStream(file.path), {
            filename: file.originalname,
            contentType: file.mimetype
        });

        // 發送請求
        const options = {
            method: 'POST',
            hostname: 'up.flickr.com',
            path: '/services/upload/',
            headers: {
                ...form.getHeaders(),
                'Authorization': authHeader
            },
            timeout: UPLOAD_TIMEOUT
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (isCompleted) return;
                isCompleted = true;
                clearTimeout(timeoutId);

                console.log('Flickr Upload Response Status:', res.statusCode);
                console.log('Flickr Upload Response:', data.substring(0, 500));

                // 檢查 HTTP 狀態碼
                if (res.statusCode >= 500) {
                    reject(new Error(`Flickr server error: ${res.statusCode}`));
                    return;
                }

                // 解析 XML 回應
                const photoIdMatch = data.match(/<photoid>(\d+)<\/photoid>/);
                const ticketIdMatch = data.match(/<ticketid>(\d+)<\/ticketid>/);

                if (photoIdMatch) {
                    console.log('✅ 上傳成功，Photo ID:', photoIdMatch[1]);
                    resolve(photoIdMatch[1]);
                } else if (ticketIdMatch) {
                    console.log('✅ 上傳成功 (Async Ticket)，Ticket ID:', ticketIdMatch[1]);
                    console.warn('Received Ticket ID. Video is processing asynchronously.');
                    resolve(null);
                } else {
                    const errMatch = data.match(/<err code="(\d+)" msg="([^"]+)"/);
                    if (errMatch) {
                        console.error('❌ Flickr 錯誤:', errMatch[1], errMatch[2]);
                        reject(new Error(`Flickr 錯誤: ${errMatch[2]}`));
                    } else {
                        console.error('❌ 無法解析回應，完整內容:', data);
                        reject(new Error('上傳失敗，無法解析回應'));
                    }
                }
            });
        });

        // 超時處理
        timeoutId = setTimeout(() => {
            if (!isCompleted) {
                isCompleted = true;
                req.destroy();
                reject(new Error(`Upload timeout after ${UPLOAD_TIMEOUT / 1000} seconds`));
            }
        }, UPLOAD_TIMEOUT);

        // 請求超時事件
        req.on('timeout', () => {
            if (!isCompleted) {
                isCompleted = true;
                clearTimeout(timeoutId);
                req.destroy();
                reject(new Error('Request timeout'));
            }
        });

        // 錯誤處理
        req.on('error', (err) => {
            if (!isCompleted) {
                isCompleted = true;
                clearTimeout(timeoutId);
                reject(err);
            }
        });

        form.pipe(req);
    });
}

async function addPhotoToAlbum(photoId, albumId) {
    return new Promise((resolve, reject) => {
        const url = new URL('https://api.flickr.com/services/rest/');
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = Math.random().toString(36).substring(2);

        const params = {
            method: 'flickr.photosets.addPhoto',
            api_key: process.env.FLICKR_API_KEY,
            photoset_id: albumId,
            photo_id: photoId,
            format: 'json',
            nojsoncallback: '1',
            oauth_consumer_key: process.env.FLICKR_API_KEY,
            oauth_token: oauthTokens.accessToken,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_nonce: nonce,
            oauth_version: '1.0'
        };

        // 建立簽名
        const crypto = require('crypto');
        const baseString = buildBaseString('POST', 'https://api.flickr.com/services/rest/', params);
        const signingKey = `${encodeURIComponent(process.env.FLICKR_API_SECRET)}&${encodeURIComponent(oauthTokens.accessTokenSecret)}`;
        const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

        params.oauth_signature = signature;

        // 建立 form data
        const formData = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            formData.append(key, value);
        });

        fetch('https://api.flickr.com/services/rest/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        })
            .then(res => res.json())
            .then(data => {
                if (data.stat === 'ok') {
                    resolve(true);
                } else {
                    reject(new Error(data.message || '加入相簿失敗'));
                }
            })
            .catch(reject);
    });
}

/**
 * Retry wrapper for adding photo to album
 * Retries 3 times with 1.5s delay
 */
async function addPhotoToAlbumWithRetry(photoId, albumId, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await addPhotoToAlbum(photoId, albumId);
            return true;
        } catch (error) {
            console.log(`[ALBUM-RETRY] Attempt ${i + 1}/${retries} failed: ${error.message}`);
            if (i === retries - 1) throw error;
            // Wait 1.5s before retry
            await new Promise(r => setTimeout(r, 1500));
        }
    }
}

// 設定照片拍攝日期
async function setPhotoDate(photoId, dateStr) {
    return new Promise((resolve, reject) => {
        // 解析日期: 2023年06月 -> 2023-06-01 12:00:00
        let dateTaken = dateStr;
        const match = dateStr.match(/(\d{4})年(\d{2})月/);
        if (match) {
            dateTaken = `${match[1]}-${match[2]}-01 12:00:00`;
        }

        console.log(`[DATE] Setting date for photo ${photoId} to ${dateTaken}`);

        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = Math.random().toString(36).substring(2);

        const params = {
            method: 'flickr.photos.setDates',
            api_key: process.env.FLICKR_API_KEY,
            photo_id: photoId,
            date_taken: dateTaken,
            date_taken_granularity: '4', // 4 = Month level
            format: 'json',
            nojsoncallback: '1',
            oauth_consumer_key: process.env.FLICKR_API_KEY,
            oauth_token: oauthTokens.accessToken,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_nonce: nonce,
            oauth_version: '1.0'
        };

        // 建立簽名
        const crypto = require('crypto');
        const baseString = buildBaseString('POST', 'https://api.flickr.com/services/rest/', params);
        const signingKey = `${encodeURIComponent(process.env.FLICKR_API_SECRET)}&${encodeURIComponent(oauthTokens.accessTokenSecret)}`;
        const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

        params.oauth_signature = signature;

        // 建立 form data
        const formData = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            formData.append(key, value);
        });

        fetch('https://api.flickr.com/services/rest/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        })
            .then(res => res.json())
            .then(data => {
                console.log(`[DATE] Flickr API response:`, JSON.stringify(data));
                if (data.stat === 'ok') {
                    resolve(true);
                } else {
                    reject(new Error(data.message || '設定日期失敗'));
                }
            })
            .catch(reject);
    });
}

function buildBaseString(method, url, params) {
    const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');

    return `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
}

// 刪除 Flickr 照片
async function deletePhotoFromFlickr(photoId) {
    console.log(`[DELETE] Starting delete for photo: ${photoId}`);
    return new Promise((resolve, reject) => {
        const url = new URL('https://api.flickr.com/services/rest/');
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = Math.random().toString(36).substring(2);

        const params = {
            method: 'flickr.photos.delete',
            api_key: process.env.FLICKR_API_KEY,
            photo_id: photoId,
            format: 'json',
            nojsoncallback: '1',
            oauth_consumer_key: process.env.FLICKR_API_KEY,
            oauth_token: oauthTokens.accessToken,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_nonce: nonce,
            oauth_version: '1.0'
        };

        console.log(`[DELETE] OAuth token present: ${!!oauthTokens.accessToken}`);
        console.log(`[DELETE] OAuth secret present: ${!!oauthTokens.accessTokenSecret}`);

        // 建立簽名
        const crypto = require('crypto');
        const baseString = buildBaseString('POST', 'https://api.flickr.com/services/rest/', params);
        const signingKey = `${encodeURIComponent(process.env.FLICKR_API_SECRET)}&${encodeURIComponent(oauthTokens.accessTokenSecret)}`;
        const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

        params.oauth_signature = signature;

        // 建立 form data
        const formData = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            formData.append(key, value);
        });

        console.log(`[DELETE] Sending request to Flickr API...`);

        fetch('https://api.flickr.com/services/rest/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        })
            .then(res => {
                console.log(`[DELETE] Response status: ${res.status}`);
                return res.json();
            })
            .then(data => {
                console.log(`[DELETE] Flickr API response:`, JSON.stringify(data));
                if (data.stat === 'ok') {
                    console.log(`[DELETE] Photo ${photoId} deleted successfully`);
                    resolve(true);
                } else {
                    console.error(`[DELETE] Flickr API error: ${data.message || JSON.stringify(data)}`);
                    reject(new Error(data.message || '刪除照片失敗'));
                }
            })
            .catch(err => {
                console.error(`[DELETE] Fetch error:`, err);
                reject(err);
            });
    });
}

// 設定照片標籤 (P0: Tag Editing)
async function setPhotoTags(photoId, tags) {
    console.log(`[TAGS] Starting setTags for photo: ${photoId}`);
    return new Promise((resolve, reject) => {
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = Math.random().toString(36).substring(2);

        const params = {
            method: 'flickr.photos.setTags',
            api_key: process.env.FLICKR_API_KEY,
            photo_id: photoId,
            tags: tags,
            format: 'json',
            nojsoncallback: '1',
            oauth_consumer_key: process.env.FLICKR_API_KEY,
            oauth_token: oauthTokens.accessToken,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_nonce: nonce,
            oauth_version: '1.0'
        };

        // 建立簽名
        const crypto = require('crypto');
        const baseString = buildBaseString('POST', 'https://api.flickr.com/services/rest/', params);
        const signingKey = `${encodeURIComponent(process.env.FLICKR_API_SECRET)}&${encodeURIComponent(oauthTokens.accessTokenSecret)}`;
        const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

        params.oauth_signature = signature;

        // 建立 form data
        const formData = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            formData.append(key, value);
        });

        fetch('https://api.flickr.com/services/rest/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        })
            .then(res => res.json())
            .then(data => {
                console.log(`[TAGS] Flickr API response:`, JSON.stringify(data));
                if (data.stat === 'ok') {
                    resolve(true);
                } else {
                    reject(new Error(data.message || '設定標籤失敗'));
                }
            })
            .catch(reject);
    });
}

// 增加照片標籤 (P1: Batch Add Tags)
async function addPhotoTags(photoId, tags) {
    console.log(`[TAGS-ADD] Adding tags to photo: ${photoId}`);
    return new Promise((resolve, reject) => {
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = Math.random().toString(36).substring(2);

        const params = {
            method: 'flickr.photos.addTags',
            api_key: process.env.FLICKR_API_KEY,
            photo_id: photoId,
            tags: tags,
            format: 'json',
            nojsoncallback: '1',
            oauth_consumer_key: process.env.FLICKR_API_KEY,
            oauth_token: oauthTokens.accessToken,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_nonce: nonce,
            oauth_version: '1.0'
        };

        const crypto = require('crypto');
        const baseString = buildBaseString('POST', 'https://api.flickr.com/services/rest/', params);
        const signingKey = `${encodeURIComponent(process.env.FLICKR_API_SECRET)}&${encodeURIComponent(oauthTokens.accessTokenSecret)}`;
        const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

        params.oauth_signature = signature;

        const formData = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            formData.append(key, value);
        });

        fetch('https://api.flickr.com/services/rest/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        })
            .then(res => res.json())
            .then(data => {
                if (data.stat === 'ok') {
                    resolve(true);
                } else {
                    reject(new Error(data.message || '增加標籤失敗'));
                }
            })
            .catch(reject);
    });
}

// ==================== 啟動伺服器 ====================
// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Deploy Version: Deploy to GitHub Pages #52`);
    console.log(`Backend Version (Git SHA): ${GIT_VERSION}`);
    console.log(`Environment: ${process.env.RAILWAY_ENVIRONMENT || 'Local'}`);
    console.log(`Uploads directory: ${UPLOADS_DIR}`);
    console.log(`\n🏠 黃家小屋 Flickr 上傳服務 v2.0 (Staged Upload)`);
    console.log(`📡 運行於 http://localhost:${PORT}`);
    console.log(`\n狀態：`);
    console.log(`  • API Key: ${process.env.FLICKR_API_KEY ? '✅ 已設定' : '❌ 未設定'}`);
    console.log(`  • API Secret: ${process.env.FLICKR_API_SECRET ? '✅ 已設定' : '❌ 未設定'}`);
    console.log(`  • OAuth Token: ${oauthTokens.accessToken ? '✅ 已授權' : '⚠️ 需要授權'}`);

    // 檢查待處理佇列
    const pendingQueue = getPendingItems();
    if (pendingQueue.length > 0) {
        console.log(`\n📦 發現 ${pendingQueue.length} 個待處理上傳項目`);
        // 啟動背景處理
        setTimeout(() => {
            console.log('[STARTUP] Starting background queue processing...');
            processUploadQueue().catch(err => {
                console.error('[STARTUP] Queue processing error:', err);
            });
        }, 3000); // 延遲 3 秒啟動，確保伺服器完全啟動
    }

    if (!oauthTokens.accessToken) {
        console.log(`\n⚠️ 首次使用請訪問以下網址進行授權：`);
        console.log(`   http://localhost:${PORT}/api/auth/start`);
    }

    console.log(`\n📝 API 端點：`);
    console.log(`  • POST /api/upload - 分階段上傳（立即回應，背景處理）`);
    console.log(`  • POST /api/upload/sync - 同步上傳（等待完成）`);
    console.log(`  • GET  /api/uploads/status - 查看上傳佇列狀態`);
    console.log(`  • GET  /api/album/:id/photos - 取得相簿照片（含本地待上傳）`);
});
