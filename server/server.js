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

/**
 * 處理上傳佇列（背景執行）
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

    isProcessingQueue = true;
    console.log(`[WORKER] Starting to process ${pendingItems.length} pending uploads...`);

    for (const item of pendingItems) {
        try {
            console.log(`[WORKER] Processing: ${item.originalFilename} (${item.localId})`);

            // 更新狀態為上傳中
            updateQueueItem(item.localId, { status: 'uploading' });

            // 檢查檔案是否存在
            if (!fs.existsSync(item.localPath)) {
                console.error(`[WORKER] File not found: ${item.localPath}`);
                updateQueueItem(item.localId, {
                    status: 'error',
                    error: 'File not found'
                });
                continue;
            }

            // 上傳到 Flickr
            const file = {
                path: item.localPath,
                originalname: item.originalFilename,
                mimetype: item.mimetype
            };

            const photoId = await uploadToFlickr(file, item.title, item.description, item.tags);
            console.log(`[WORKER] Uploaded to Flickr, photoId: ${photoId}`);

            if (photoId) {
                // 加入相簿
                if (item.albumId) {
                    try {
                        await addPhotoToAlbumWithRetry(photoId, item.albumId);
                        console.log(`[WORKER] Added to album ${item.albumId}`);
                    } catch (albumError) {
                        console.error(`[WORKER] Failed to add to album:`, albumError);
                    }
                }

                // 設定日期（如果有）
                if (item.date) {
                    try {
                        await setPhotoDate(photoId, item.date);
                    } catch (dateError) {
                        console.error(`[WORKER] Failed to set date:`, dateError);
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
                    console.error(`[WORKER] Failed to delete local file:`, e);
                }

                // 從佇列移除已完成的項目
                removeFromQueue(item.localId);
                console.log(`[WORKER] Completed: ${item.originalFilename}`);

            } else {
                // Flickr 返回 null（可能是影片處理中）
                updateQueueItem(item.localId, {
                    status: 'processing',
                    message: 'Video is being processed by Flickr'
                });
            }

        } catch (error) {
            console.error(`[WORKER] Error processing ${item.localId}:`, error);
            updateQueueItem(item.localId, {
                status: 'error',
                error: error.message
            });
        }
    }

    isProcessingQueue = false;
    console.log('[WORKER] Queue processing completed');
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

// CORS 設定
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
app.use(cors({
    origin: (origin, callback) => {
        // 允許無 origin（如 Postman）或在允許清單中
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true
}));

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

// 健康檢查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
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

// 圖片代理 API (P1 for Download)
app.get('/api/proxy-image', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing url');

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

        // Forward headers
        res.setHeader('Content-Type', response.headers.get('content-type'));
        res.setHeader('Content-Disposition', `attachment; filename="photo.jpg"`);

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).send('Failed to fetch image');
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
            extras: 'date_taken,date_upload,description,tags,url_sq,url_t,url_s,url_m,url_l,url_o',
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

// ==================== Flickr API 函數 ====================

async function uploadToFlickr(file, title, description, tags) {
    return new Promise((resolve, reject) => {
        const FormData = require('form-data');
        const form = new FormData();

        // 準備 OAuth 簽名參數
        const uploadUrl = 'https://up.flickr.com/services/upload/';
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = Math.random().toString(36).substring(2);

        // 非二進制的表單參數（這些需要參與簽名）
        const uploadParams = {
            is_public: '0',
            is_friend: '1',
            is_family: '1'
        };
        if (title) uploadParams.title = title;
        if (description) uploadParams.description = description;
        if (tags) uploadParams.tags = tags;

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
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('Flickr Upload Response Status:', res.statusCode);
                console.log('Flickr Upload Response:', data.substring(0, 500));

                // 解析 XML 回應
                const photoIdMatch = data.match(/<photoid>(\d+)<\/photoid>/);
                const ticketIdMatch = data.match(/<ticketid>(\d+)<\/ticketid>/);

                if (photoIdMatch) {
                    console.log('✅ 上傳成功，Photo ID:', photoIdMatch[1]);
                    resolve(photoIdMatch[1]);
                } else if (ticketIdMatch) {
                    console.log('✅ 上傳成功 (Async Ticket)，Ticket ID:', ticketIdMatch[1]);
                    // Ticket ID means it's processing async. We can't add to album yet with Photo ID.
                    // But usually for small videos it returns PhotoID. 
                    // If we get ticket, we might treat it as "success but no ID".
                    // For now, resolve null or throw? 
                    // If we resolve null, the main loop will skip album adding, which is correct behavior for Ticket ID (can't add ticket to album).
                    console.warn('Received Ticket ID. Video is processing asynchronously. Cannot add to album immediately.');
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

        req.on('error', reject);
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

app.listen(PORT, () => {
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
