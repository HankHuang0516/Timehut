/**
 * 黃家小屋 - Flickr 上傳後端服務
 * 支援批量上傳、照片、影片
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
        userId: process.env.FLICKR_USER_ID
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

// 上傳照片/影片到 Flickr
app.post('/api/upload', upload.array('files', 20), async (req, res) => {
    console.log('[DEBUG] Received upload request');
    // 檢查授權
    if (!oauthTokens.accessToken) {
        console.log('[DEBUG] Unauthorized: Missing access token');
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: '請選擇要上傳的檔案' });
    }

    const { albumId, title, description, tags } = req.body;
    console.log('Upload Request Body:', { albumId, title, description, tags });

    const results = [];

    for (const file of req.files) {
        try {
            console.log(`Uploading file: ${file.originalname}`);
            const photoId = await uploadToFlickr(file, title, description, tags);
            console.log(`Uploaded to Flickr. Photo ID: ${photoId}`);

            // 如果指定了相簿，加入相簿
            if (albumId && photoId) {
                console.log(`Adding photo ${photoId} to album ${albumId}...`);
                try {
                    await addPhotoToAlbum(photoId, albumId);
                    console.log(`Successfully added to album.`);
                } catch (albumError) {
                    console.error(`Failed to add to album:`, albumError);
                    // Don't fail the whole request, just log it
                }
            } else {
                console.log('Skipping album addition (no albumId or photoId).');
            }

            results.push({
                filename: file.originalname,
                success: true,
                photoId
            });

            // 清理暫存檔案
            fs.unlinkSync(file.path);

        } catch (error) {
            console.error(`上傳失敗 ${file.originalname}:`, error);
            results.push({
                filename: file.originalname,
                success: false,
                error: error.message
            });

            // 嘗試清理暫存檔案
            try { fs.unlinkSync(file.path); } catch (e) { }
        }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
        message: `上傳完成：${successCount}/${results.length} 個檔案成功`,
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
        message: `刪除完成：${successCount}/${photoIds.length} 張成功`,
        results
    });
});

// 取得相簿列表
app.get('/api/albums', async (req, res) => {
    // ... (保持原樣)
});

// 取得相簿照片 (Proxy)
app.get('/api/album/:id/photos', async (req, res) => {
    if (!oauthTokens.accessToken) {
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    const { id } = req.params;
    const { page = 1, per_page = 50 } = req.query;

    try {
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
                if (photoIdMatch) {
                    console.log('✅ 上傳成功，Photo ID:', photoIdMatch[1]);
                    resolve(photoIdMatch[1]);
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

// ==================== 啟動伺服器 ====================

app.listen(PORT, () => {
    console.log(`\n🏠 黃家小屋 Flickr 上傳服務`);
    console.log(`📡 運行於 http://localhost:${PORT}`);
    console.log(`\n狀態：`);
    console.log(`  • API Key: ${process.env.FLICKR_API_KEY ? '✅ 已設定' : '❌ 未設定'}`);
    console.log(`  • API Secret: ${process.env.FLICKR_API_SECRET ? '✅ 已設定' : '❌ 未設定'}`);
    console.log(`  • OAuth Token: ${oauthTokens.accessToken ? '✅ 已授權' : '⚠️ 需要授權'}`);

    if (!oauthTokens.accessToken) {
        console.log(`\n⚠️ 首次使用請訪問以下網址進行授權：`);
        console.log(`   http://localhost:${PORT}/api/auth/start`);
    }
});
