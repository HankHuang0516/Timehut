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
const uploadHash = require('node:crypto');
const { OAuth } = require('oauth');
const https = require('https');
const FormData = require('form-data');
const { flickrRequest } = require('./flickr-api');
const { setUserPhotoTags } = require('./photo-tags');

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_VERSION = '1.0.69';
const BACKEND_BUILD = '2026.10.16.3';

console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
console.log("!!!!!!!! SERVER UNIFIED FIX STARTING - TIMESTAMP: " + Date.now() + " !!!!!!!");
console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

// Retired: reading/debugging media must never change photo permissions.
app.get('/api/test_video_fix/:id', (req, res) => res.status(410).json({ error: '此舊診斷功能已停用；不會修改公開性' }));

// ==================== 上傳佇列管理 ====================
const QUEUE_FILE = path.join(__dirname, 'uploads', 'queue.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
let accountStore = null;
let scopedAccountMedia = null;
let accountUploadJournal = null;
let accountPhotoMutations = null;
let accountPhotoDeletion = null;
let accountUploadReceiver = null;
let accountErasure = null;
const activeAccountUploads = new Set();

// 確保 uploads 目錄存在
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
// Once account data exists, a configuration rollback must not reopen the
// legacy global API. Pausing signup is independent of account isolation.
if (process.env.TIMEHUT_PUBLIC_REGISTRATION !== 'true') {
    let accountStatePresent = false;
    try { fs.lstatSync(path.join(UPLOADS_DIR, '.accounts')); accountStatePresent = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (accountStatePresent || readQueue().some(row => row?.ownerUserId)) {
        throw new Error('Existing account data requires account isolation; original files preserved');
    }
}
if (process.env.TIMEHUT_ACCEPT_SIGNUPS !== undefined && !['true', 'false'].includes(process.env.TIMEHUT_ACCEPT_SIGNUPS)) {
    throw new Error('Invalid signup configuration; account data preserved');
}

/**
 * 讀取上傳佇列
 */
function readQueue() {
    try {
        if (fs.existsSync(QUEUE_FILE)) {
            const data = fs.readFileSync(QUEUE_FILE, 'utf8');
            const queue = JSON.parse(data);
            if (!Array.isArray(queue)) throw new Error('Invalid receipt store shape');
            if(accountUploadJournal){if(queue.some(row=>row.ownerUserId))throw new Error('Earlier public receipts require explicit journal migration');return [...queue,...accountUploadJournal.list()];}
            return queue;
        }
    } catch (error) {
        console.error('[QUEUE] Error reading queue:', error);
        throw new Error('Upload receipt store is unreadable; existing receipts are preserved');
    }
    return accountUploadJournal?accountUploadJournal.list():[];
}

/**
 * 寫入上傳佇列
 */
function writeQueue(queue) {
    if(queue.some(row=>row.ownerUserId))throw new Error('Public receipts must be written through the atomic journal');
    const temporary = QUEUE_FILE + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(queue, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, QUEUE_FILE);
}

/**
 * 新增項目到佇列
 */
function addToQueue(item) {
    if(item.ownerUserId)throw new Error('Public original requires its admission journal');
    const queue = readQueue().filter(row=>!row.ownerUserId);
    queue.push(item);
    writeQueue(queue);
    return item;
}

/**
 * 更新佇列項目
 */
function updateQueueItem(localId, updates) {
    if(accountUploadJournal?.get(localId))return accountUploadJournal.update(localId,updates);
    const queue = readQueue().filter(row=>!row.ownerUserId);
    const index = queue.findIndex(item => item.localId === localId);
    if (index !== -1) {
        queue[index] = { ...queue[index], ...updates };
        writeQueue(queue);
        return queue[index];
    }
    return null;
}

/**
 * 取得待處理的佇列項目
 */
function getPendingItems() {
    return readQueue().filter(item => item.status === 'pending' && !item.retryBlocked);
}

// A known Flickr ID can safely resume metadata. An unknown remote outcome must
// never be automatically uploaded again after a worker process dies.
function recoverInterruptedUploads() {
    const queue = readQueue();
    let changed = false;
    for (const item of queue) {
        if (!['uploading', 'processing'].includes(item.status)) continue;
        changed = true;
        if (item.flickrPhotoId) {
            item.status = 'pending'; item.error = '伺服器重新啟動，繼續核對 Flickr 相簿與資料';
            item.retryBlocked = false;
        } else {
            item.status = 'error'; item.retryBlocked = true;
            item.error = '上次 Flickr 上傳結果尚未確認；已保留原檔與收據，請先核對 Flickr，避免重複上傳';
        }
    }
    if (changed){if(accountUploadJournal){for(const row of queue.filter(row=>row.ownerUserId))updateQueueItem(row.localId,{status:row.status,error:row.error,retryBlocked:row.retryBlocked});writeQueue(queue.filter(row=>!row.ownerUserId));}else writeQueue(queue);}
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
async function uploadToFlickrWithRetry(file, title, description, tags, credentialSnapshot=null) {
    // Flickr creation has no idempotency key. A lost response cannot safely be
    // retried: preserve the local file and receipt until the outcome is known.
    try {
        return await uploadToFlickr(file, title, description, tags,credentialSnapshot);
    } catch (error) {
        error.uploadOutcomeUnknown = true;
        throw error;
    }
}

/**
 * 處理單一上傳項目的核心邏輯
 */
async function processSingleItem(item) {
    if(!item||activeAccountUploads.has(item.localId))return{success:false,type:'not_pending'};
    activeAccountUploads.add(item.localId);
    try{return await processSingleItemImpl(item);}finally{activeAccountUploads.delete(item.localId);if(accountErasure)setImmediate(()=>accountErasure.run().catch(console.error));}
}
async function processSingleItemImpl(item) {
    item = readQueue().find(row => row.localId === item.localId);
    if (!item || item.status === 'cancelled') return { success: false, type: 'cancelled' };
    if (item.ownerUserId && (!accountStore || !accountStore.owns(item.ownerUserId, 'receipt', item.localId))) {
        updateQueueItem(item.localId, { status: 'error', error: 'Account is unavailable; upload and original retained', retryBlocked: item.retryBlocked===true||(!item.flickrPhotoId&&['uploading','processing'].includes(item.status)) });
        return { success: false, type: 'account_unavailable' };
    }
    if (item.retryBlocked && !item.flickrPhotoId) return { success: false, type: 'unknown' };
    if(item.ownerUserId&&accountUploadJournal){const claimed=accountUploadJournal.claim(item.localId);if(!claimed)return{success:false,type:'not_pending'};item=claimed;}
    console.log(`[WORKER] Processing: ${item.originalFilename} (${item.localId})`);

    // 更新狀態為上傳中，記錄嘗試次數
    const retryCount = (item.retryCount || 0) + 1;
    updateQueueItem(item.localId, {
        status: 'uploading',
        // Persist the replay block before Flickr creation. If saving its returned
        // ID fails, neither the scheduler nor a restart may create it again.
        retryBlocked: !item.flickrPhotoId,
        retryCount,
        lastAttempt: new Date().toISOString()
    });

    // 檢查檔案是否存在
    if (!item.flickrPhotoId && !fs.existsSync(item.localPath)) {
        console.error(`[WORKER] File not found: ${item.localPath}`);
        updateQueueItem(item.localId, {
            status: 'error',
            retryBlocked: false,
            error: 'File not found (永久錯誤)'
        });
        return { success: false, type: 'permanent' };
    }

    let photoId = item.flickrPhotoId || null;
    try {
        let credentialSnapshot=null;
        if(item.ownerUserId){
            try{credentialSnapshot={...flickrCredentials()};const identity=await flickrRequest('flickr.test.login',{},credentialSnapshot,'GET');if(identity.stat!=='ok'||identity.user?.id!==process.env.FLICKR_USER_ID)throw new Error('Identity unconfirmed');}
            catch(_){const failure=new Error('儲存帳戶尚未確認，原檔與收據會保留');failure.storagePrincipalUnconfirmed=true;throw failure;}
        }
        // 上傳到 Flickr（帶重試）
        const file = {
            path: item.localPath,
            originalname: item.originalFilename,
            mimetype: item.mimetype
        };

        photoId ||= await uploadToFlickrWithRetry(file, item.title, item.description, item.tags,credentialSnapshot);
        if (photoId) updateQueueItem(item.localId, { flickrPhotoId: photoId, retryBlocked: false });
        if (photoId && item.ownerUserId) accountStore.attachPhoto(item.ownerUserId, item.localId, photoId, {
            title: item.title, tags: item.tags, date: item.date, media: item.mimetype.startsWith('video/') ? 'video' : 'photo',
            originalFilename: item.originalFilename, bytes: item.size
        });
        console.log(`[WORKER] Uploaded to Flickr, photoId: ${photoId}`);

        if (photoId) {
            // Completion includes the requested membership and date metadata.
            const providerAlbumId=item.albumId||(item.ownerUserId?require('./account-owner-bootstrap').legacyAlbumTarget(accountStore,item.ownerUserId,item.accountAlbumId):null);
            if (providerAlbumId) await addPhotoToAlbumWithRetry(photoId, providerAlbumId);
            if (item.date) await setPhotoDate(photoId, item.date);

            // 更新佇列：標記完成並記錄 Flickr photoId
            updateQueueItem(item.localId, {
                status: 'completed',
                error: null,
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

            // Keep the terminal receipt across client/OS restarts; remove file bytes only.
            console.log(`[WORKER] ✅ Completed: ${item.originalFilename}`);
            return { success: true, type: 'completed' };

        } else {
            // Flickr 返回 null（可能是影片處理中）
            updateQueueItem(item.localId, {
                status: 'processing',
                message: 'Video is being processed by Flickr'
            });
            console.log(`[WORKER] ⏳ Video processing: ${item.originalFilename}`);
            return { success: true, type: 'processing' };
        }

    } catch (error) {
        console.error(`[WORKER] Error processing ${item.localId}:`, error.message);
        if(error.storagePrincipalUnconfirmed){updateQueueItem(item.localId,{status:'error',retryBlocked:false,error:'儲存帳戶尚未確認，原檔與收據會保留'});return{success:false,type:'storage_unavailable'};}

        const saved = readQueue().find(row => row.localId === item.localId);
        if (!saved?.flickrPhotoId && (error.uploadOutcomeUnknown || photoId)) {
            updateQueueItem(item.localId, {
                status: 'error',
                retryBlocked: !photoId,
                ...(photoId ? { flickrPhotoId: photoId } : {}),
                error: photoId ? 'Flickr 已建立，收據保存曾失敗；已保留同一照片編號，重試只核對相簿與資料'
                    : 'Flickr 上傳結果尚未確認；已保留原檔與收據，請先核對，避免重複上傳'
            });
            return { success: false, type: 'unknown' };
        }

        const currentRetryCount = retryCount;
        const isRetryable = isRetryableError(error);

        if (isRetryable && currentRetryCount < 5) {
            // 可重試錯誤，標記為 pending 稍後重試
            updateQueueItem(item.localId, {
                status: 'pending',
                error: `${error.message} (將自動重試)`,
                retryCount: currentRetryCount
            });
            console.log(`[WORKER] ⏳ Will retry later: ${item.originalFilename} (attempt ${currentRetryCount})`);
            return { success: false, type: 'retry' };
        } else {
            // 永久錯誤或超過重試次數
            updateQueueItem(item.localId, {
                status: 'error',
                error: isRetryable ? `${error.message} (已達最大重試次數)` : error.message
            });
            console.log(`[WORKER] ❌ Failed permanently: ${item.originalFilename}`);
            return { success: false, type: 'permanent' };
        }
    }
}

/**
 * 處理上傳佇列（背景執行）- 並發版本
 * 支援 3 個並發 worker 同時處理上傳
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

    const initialPendingItems = getPendingItems();
    if (initialPendingItems.length === 0) {
        console.log('[WORKER] No pending items in queue');
        return;
    }

    // Claim the queue before the first await: simultaneous staged uploads must
    // not start competing workers for the same pending file.
    isProcessingQueue = true;
    console.log(`[WORKER] Starting to process ${initialPendingItems.length} pending uploads with concurrency...`);

    const CONCURRENCY_LIMIT = 3;
    const activePromises = new Set();
    let successCount = 0;
    let failCount = 0;
    let retryLaterCount = 0;

    try {
        const isOnline = await checkNetworkConnectivity();
        if (!isOnline) {
            console.log('[WORKER] Network appears offline, scheduling retry in 30 seconds...');
            setTimeout(() => processUploadQueue().catch(console.error), 30000);
            return;
        }
        while (true) {
            // 動態讀取待處理項目（可能有新加入的）
            const pendingItems = getPendingItems();

            // 如果沒有待處理項目且沒有正在執行的任務，結束
            if (pendingItems.length === 0 && activePromises.size === 0) {
                break;
            }

            // 填充 worker slots 直到達到並發限制
            while (activePromises.size < CONCURRENCY_LIMIT && pendingItems.length > 0) {
                const item = pendingItems.shift();

                // 建立處理 promise
                const promise = (async () => {
                    try {
                        const result = await processSingleItem(item);

                        // 統計結果
                        if (result.success) {
                            if (result.type === 'completed') {
                                successCount++;
                            }
                        } else {
                            if (result.type === 'retry') {
                                retryLaterCount++;
                            } else {
                                failCount++;
                            }
                        }
                    } catch (e) {
                        console.error('[WORKER] Unexpected error in worker:', e);
                        failCount++;
                    }
                })();

                // 加入 active set
                activePromises.add(promise);

                // Promise 完成後從 set 中移除
                promise.then(() => activePromises.delete(promise))
                    .catch(() => activePromises.delete(promise));

                // 小延遲避免同時啟動太多請求
                await delay(100);
            }

            // 等待至少一個任務完成
            if (activePromises.size > 0) {
                await Promise.race(activePromises);
            }
        }
    } finally {
        isProcessingQueue = false;
        console.log(`[WORKER] Queue processing completed: ${successCount} success, ${failCount} failed, ${retryLaterCount} retry later`);
    }

    // 重新檢查是否有新增的待處理項目
    const newPendingItems = getPendingItems();
    if (newPendingItems.length > 0) {
        console.log(`[WORKER] Found ${newPendingItems.length} new pending items, processing immediately...`);
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
    if (process.env.TIMEHUT_PUBLIC_REGISTRATION === 'true' && origin &&
        !['https://just-healing-production.up.railway.app','https://hankhuang0516.github.io', 'https://localhost', 'capacitor://localhost'].includes(origin)) {
        return res.status(403).json({ error: 'Origin rejected' });
    }
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }

    // 允許的 Headers
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Timehut-Album, X-Timehut-Upload, X-Timehut-Content-SHA256, X-Timehut-Metadata-SHA256, X-Timehut-Expected-User');
    res.setHeader('Access-Control-Expose-Headers','X-Timehut-Account');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // 處理 Preflight
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json({ limit: process.env.TIMEHUT_PUBLIC_REGISTRATION === 'true' ? '16kb' : '100kb' }));

// Staged migration. Enabling this requires an explicit account owner, updated
// web/native account clients and complete media/deletion gates; default is off.
if (process.env.TIMEHUT_PUBLIC_REGISTRATION === 'true') {
    const { SQLiteAccountStore } = require('./account-sqlite-store');
    const { AccountUploadJournal } = require('./account-upload-journal');
    const { publicUploadReceiver } = require('./account-upload-receiver');
    const { AccountErasure } = require('./account-erasure');
    const { flickrErasure } = require('./flickr-erasure');
    const { accountRouter } = require('./account-routes');
    const { accountGateway } = require('./account-gateway');
    const { accountAlbumMembership } = require('./account-album-membership');
    const { AccountPhotoMutations } = require('./account-photo-mutations');
    const { flickrPhotoMutations } = require('./flickr-photo-mutations');
    const { AccountPhotoDeletion } = require('./account-photo-deletion');
    const { mediaTickets } = require('./media-tickets');
    const { accountMedia } = require('./account-media');
    accountStore = new SQLiteAccountStore(path.join(UPLOADS_DIR, '.accounts'));
    const ownerBootstrap=require('./account-owner-bootstrap');
    const legacyOwnerId=ownerBootstrap.requireOwner(accountStore,process.env.TIMEHUT_LEGACY_OWNER_ID);
    const {familyMedia}=require('./account-family-media');let originalFamilyMedia;
    accountUploadJournal = new AccountUploadJournal(accountStore,UPLOADS_DIR);
    accountPhotoMutations = new AccountPhotoMutations(accountStore,flickrPhotoMutations(flickrRequest,flickrCredentials,process.env.FLICKR_USER_ID));
    accountPhotoDeletion = new AccountPhotoDeletion(accountStore,accountUploadJournal,{uploadsDirectory:UPLOADS_DIR,readQueue,deletePhoto:flickrErasure(flickrRequest,flickrCredentials,process.env.FLICKR_USER_ID).deletePhoto,isActive:(id,receipt)=>activeAccountUploads.has(receipt)||Object.values(accountStore.state.photoMutations||{}).some(job=>job.photoId===id&&accountPhotoMutations.active.has(job.id))});
    // Fail closed if an earlier scoped queue has not been explicitly migrated.
    readQueue();
    accountErasure=new AccountErasure(accountStore,accountUploadJournal,{uploadsDirectory:UPLOADS_DIR,legacyOwnerId,readQueue,isActive:id=>activeAccountUploads.has(id),...flickrErasure(flickrRequest,flickrCredentials,process.env.FLICKR_USER_ID)});
    const accounts = accountRouter(express, accountStore, { enabled: true, registrationEnabled: process.env.TIMEHUT_ACCEPT_SIGNUPS !== 'false', legacyOwnerId,
        allowedOrigins: ['https://just-healing-production.up.railway.app','https://hankhuang0516.github.io', 'https://localhost', 'capacitor://localhost'],onDeletion:()=>setImmediate(()=>accountErasure.run().catch(console.error)),photoView:(row,req)=>scopedAccountMedia.photoView(row,req),familyContext:id=>ownerBootstrap.familyContext(accountStore,id),familyPhotos:(req,res)=>originalFamilyMedia.photos(req,res),feedback:new (require('./account-feedback').AccountFeedback)(accountStore,UPLOADS_DIR) });
    const tickets = mediaTickets(accountStore,{legacyPhotoOwner:(userId,id)=>originalFamilyMedia?.eligible(userId,id)===true});
    scopedAccountMedia = accountMedia(accountStore, tickets, { readQueue, uploadsDirectory: UPLOADS_DIR,
        providerRequest: flickrRequest, credentials: flickrCredentials });
    originalFamilyMedia=familyMedia(accountStore,tickets,{providerRequest:flickrRequest,credentials:flickrCredentials,storageUserId:process.env.FLICKR_USER_ID,request:fetch,photoView:scopedAccountMedia.photoView});
    const gateway = accountGateway(accountStore, accounts.authenticate, {
        legacyOwnerId, readQueue,
        callbackAllowed: token => typeof token === 'string' && Object.hasOwn(tempRequestTokens, token)&&typeof tempRequestTokens[token]==='string',
        tickets, photoView: scopedAccountMedia.photoView, sizesView: scopedAccountMedia.sizesView, delivery: scopedAccountMedia.delivery, familyMedia:originalFamilyMedia
    });
    accountUploadReceiver=publicUploadReceiver(multer,{store:accountStore,journal:accountUploadJournal,uploadsDirectory:UPLOADS_DIR,providerConnected:()=>!!oauthTokens.accessToken,onAccepted:()=>setImmediate(()=>processUploadQueue().catch(console.error)),legacyLookup:(userId,clientId)=>userId===legacyOwnerId?readQueue().find(row=>!row.ownerUserId&&row.clientUploadId===clientId):null});
    app.use('/api/accounts', accounts.router);
    app.get('/api/uploads/admission/:clientId',accounts.authenticate,accountUploadReceiver.lookup);
    app.use(['/api', '/uploads'], gateway.guard);
    app.post('/api/album/:albumId/:operation',accountAlbumMembership(accountStore));
    app.put('/api/photo/:photoId/tags',accountPhotoMutations.handler());
    app.post(['/api/photos/tags/add','/api/photos/update-date'],accountPhotoMutations.handler());
    app.delete('/api/photo/:photoId',accountPhotoDeletion.handler());
    app.post('/api/photos/delete',accountPhotoDeletion.handler());
    app.use('/app',express.static(path.join(__dirname,'public-app'),{dotfiles:'deny',index:'index.html',setHeaders:res=>res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'})}));
    const erasureTimer=setInterval(()=>accountErasure.run().catch(console.error),30000);erasureTimer?.unref?.();
    setImmediate(()=>accountErasure.run().catch(console.error));
    const photoMutationTimer=setInterval(()=>accountPhotoMutations.run().catch(console.error),30000);photoMutationTimer?.unref?.();
    setImmediate(()=>accountPhotoMutations.run().catch(console.error));
    const photoDeletionTimer=setInterval(()=>accountPhotoDeletion.run().catch(console.error),30000);photoDeletionTimer?.unref?.();
    setImmediate(()=>accountPhotoDeletion.run().catch(console.error));
}

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
        version: BACKEND_VERSION,
        build: BACKEND_BUILD,
        sourceRevision: GIT_VERSION,
        authenticated: !!oauthTokens.accessToken,
        timestamp: new Date().toISOString()
    });
});

// Register after CORS middleware so the website can verify this manual-upload build.
app.get('/api/version', (req, res) => {
    res.json({ version: BACKEND_VERSION, build: BACKEND_BUILD, sourceRevision: GIT_VERSION, timestamp: Date.now() });
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
    res.set('Cache-Control','no-store');
    const { oauth_token, oauth_verifier } = req.query;
    const tokenSecret = typeof oauth_token==='string'&&Object.hasOwn(tempRequestTokens,oauth_token)?tempRequestTokens[oauth_token]:null;

    if (!tokenSecret) {
        return res.status(400).send('無效的授權請求');
    }

    oauth.getOAuthAccessToken(
        oauth_token,
        tokenSecret,
        oauth_verifier,
        (error, accessToken, accessTokenSecret, results) => {
            if (error) {
                console.error('OAuth access request failed');
                return res.status(500).send('授權失敗');
            }

            if(process.env.TIMEHUT_PUBLIC_REGISTRATION==='true'&&results?.user_nsid!==process.env.FLICKR_USER_ID){delete tempRequestTokens[oauth_token];return res.status(403).send('儲存帳戶不符，既有授權已保留');}

            // 儲存 access tokens
            oauthTokens.accessToken = accessToken;
            oauthTokens.accessTokenSecret = accessTokenSecret;

            // 清理暫存
            delete tempRequestTokens[oauth_token];

            console.log('✅ Flickr 授權成功！');
            res.set('Cache-Control','no-store');

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
app.post('/api/upload', (req,res,next)=>req.memberAdmission?accountUploadReceiver.handle(req,res):upload.array('files',20)(req,res,next), async (req, res) => {
    console.log('[UPLOAD] Received staged upload request');

    // 檢查授權（仍需授權，但上傳會在背景進行）
    if (!oauthTokens.accessToken) {
        console.log('[UPLOAD] Unauthorized: Missing access token');
        return res.status(401).json({ error: '尚未授權 Flickr' });
    }

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: '請選擇要上傳的檔案' });
    }

    const { albumId, title, description, tags, date, clientUploadId } = req.body;
    const admission = req.memberAdmission;
    if (admission && (albumId !== admission.albumId || !accountStore.owns(admission.userId, 'album', albumId))) {
        for (const file of req.files) try { fs.unlinkSync(file.path); } catch (_) {}
        return res.status(404).json({ error: 'Resource unavailable' });
    }
    if (admission && (!clientUploadId || req.files.length !== 1)) {
        for (const file of req.files) try { fs.unlinkSync(file.path); } catch (_) {}
        return res.status(400).json({ error: 'A per-file upload identity is required' });
    }
    try {
        if (clientUploadId) for (const file of req.files) {
            const digest = uploadHash.createHash('sha256');
            for await (const bytes of fs.createReadStream(file.path)) digest.update(bytes);
            file.contentSha256 = digest.digest('hex');
        }
        readQueue();
    } catch (_) {
        for (const file of req.files) try { fs.unlinkSync(file.path); } catch (_) {}
        return res.status(503).json({ error: '上傳收據暫時無法保存，既有收據已保留；請稍後重試' });
    }
    if (clientUploadId) {
        if (!/^[a-zA-Z0-9_-]{16,80}$/.test(clientUploadId) || req.files.length !== 1) {
            for (const file of req.files) try { fs.unlinkSync(file.path); } catch (_) {}
            return res.status(400).json({ error: 'Invalid per-file upload identity' });
        }
        const existing = readQueue().find(item => item.clientUploadId === clientUploadId &&
            (admission ? item.ownerUserId === admission.userId : !item.ownerUserId));
        if (existing) {
            const file = req.files[0];
            try { fs.unlinkSync(file.path); } catch (_) {}
            if (existing.status === 'cancelled') {
                return res.status(409).json({ error: '此上傳已取消；原收件編號保留，不能重新建立', localId: existing.localId, retryBlocked: true });
            }
            if (existing.size !== file.size || existing.contentSha256 !== file.contentSha256 || existing.originalFilename !== file.originalname || (admission ? existing.accountAlbumId : existing.albumId) !== (albumId || null) || existing.tags !== (tags || '') || existing.title !== (title || file.originalname) || existing.description !== (description || '') || existing.date !== (date || null)) {
                return res.status(409).json({ error: 'Upload identity belongs to different file metadata' });
            }
            return res.json({ _staged: existing.status !== 'completed', results: [{ success: true, localId: existing.localId, photoId: existing.flickrPhotoId, _staged: existing.status !== 'completed' }] });
        }
    }
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
                clientUploadId: clientUploadId || null,
                contentSha256: file.contentSha256 || null,
                localFilename,
                localPath: file.path,
                originalFilename: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                // Public account album IDs are app-owned; they are never sent
                // to central Flickr as arbitrary provider album IDs.
                albumId: admission ? null : albumId || null,
                ...(admission ? { ownerUserId: admission.userId, accountAlbumId: admission.albumId } : {}),
                title: title || file.originalname,
                description: description || '',
                tags: tags || '',
                date: date || null,
                status: 'pending',
                createdAt: new Date().toISOString(),
                flickrPhotoId: null
            };

            // 加入佇列
            if (admission) accountStore.attachReceipt(admission.userId, admission.albumId, localId);
            addToQueue(queueItem);
            queuedItems.push(queueItem);

            // 建立本地照片物件（模擬 Flickr 格式）
            const localPhotoObject = createLocalPhotoObject(queueItem, baseUrl);
            if (admission) {
                const localUrl = scopedAccountMedia.localURL(queueItem, req);
                for (const size of ['sq','t','s','m','l','o']) localPhotoObject['url_' + size] = localUrl;
            }

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
                await addPhotoToAlbumWithRetry(photoId, albumId);
            }

            if (req.body.date && photoId) {
                await setPhotoDate(photoId, req.body.date);
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
            results.push({ photoId, success: false, error: error.message });
        }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
        message: `加入相簿完成：${successCount}/${photoIds.length} 張成功`,
        results
    });
});

// Remove membership only. Permanent photo deletion uses a separate endpoint.
app.post('/api/album/:albumId/remove_photos', async (req, res) => {
    if (!oauthTokens.accessToken) return res.status(401).json({ error: '尚未授權 Flickr' });
    const { photoIds } = req.body;
    if (!Array.isArray(photoIds) || !photoIds.length || photoIds.length > 500 || photoIds.some(id => !/^\d+$/.test(String(id)))) {
        return res.status(400).json({ error: '請提供有效照片 ID' });
    }
    const results = [];
    for (const photoId of photoIds) {
        try {
            await flickrRequest('flickr.photosets.removePhoto', { photoset_id: req.params.albumId, photo_id: photoId }, flickrCredentials());
            results.push({ photoId, success: true });
        } catch (error) {
            if (error.code === 3) results.push({ photoId, success: true, message: 'Already outside album' });
            else results.push({ photoId, success: false, error: error.message });
        }
    }
    res.json({ results, message: `已移出 ${results.filter(row => row.success).length}/${photoIds.length} 張` });
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
        const savedTags = await setUserPhotoTags(photoId, tags, flickrCredentials());
        console.log(`[TAGS] Tags updated successfully for photo ${photoId}`);
        res.json({ success: true, photoId, tags: savedTags });
    } catch (error) {
        console.error(`[TAGS] Failed to set tags for photo ${photoId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// 取得相簿列表
app.get('/api/albums', async (req, res) => {
    // Account-wide metadata needs a caller-access contract before it can be exposed.
    // Give existing clients a bounded, explicit failure instead of an unanswered request.
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ error: '相簿清單暫時無法使用', code: 'ALBUM_LIST_UNAVAILABLE' });
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
            retryBlocked: item.retryBlocked === true||item.photoDeletedAt!==undefined,
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
        status: item.photoDeletedAt!==undefined?'deleted':item.status,
        flickrPhotoId: item.flickrPhotoId,
        error: item.error,
        retryBlocked: item.retryBlocked === true||item.photoDeletedAt!==undefined,
        createdAt: item.createdAt,
        completedAt: item.completedAt
    });
});

// 重試失敗的上傳
app.post('/api/uploads/retry', async (req, res) => {
    const { localIds } = req.body;
    if (!Array.isArray(localIds) || !localIds.length || localIds.length > 500 || localIds.some(id => typeof id !== 'string')) return res.status(400).json({ error: '請提供要重試的收據' });
    const queue = readQueue();
    const blocked = queue.filter(item => localIds.includes(item.localId) && (item.retryBlocked||item.photoDeletedAt!==undefined));
    if (blocked.length) return res.status(409).json({ error: 'Flickr 結果尚未確認，請先核對，避免重複上傳', localIds: blocked.map(item => item.localId) });

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
    if (item.photoDeletedAt !== undefined) return res.status(409).json({error:'照片已刪除，原上傳收據保留，不能取消或重新上傳',localId,retryBlocked:true});
    if (item.status === 'completed') {
        return res.json({ success: true, localId, status: 'completed' });
    }
    if (['uploading', 'processing'].includes(item.status) || (item.retryBlocked && !item.flickrPhotoId && item.status !== 'cancelled')) {
        return res.status(409).json({ error: '傳送中或 Flickr 結果尚未確認，已保留原檔與收據，不能移除', localId, retryBlocked: true });
    }

    // Keep the identity even when cancelling a never-started transfer. A client
    // replay must find this tombstone instead of creating another Flickr upload.
    updateQueueItem(localId, { status: 'cancelled', retryBlocked: true, cancelledAt: new Date().toISOString() });

    // 刪除本地檔案（如果存在）
    if (item.localPath && fs.existsSync(item.localPath)) {
        try {
            fs.unlinkSync(item.localPath);
            if(item.ownerUserId&&accountUploadJournal)accountUploadJournal.releaseCancelled(localId);
        } catch (e) {
            console.error('[DELETE-UPLOAD] Failed to delete file:', e);
        }
    }

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
app.get('/api/photo/:id/video', require('./video-media').createVideoHandler(flickrCredentials));

app.get('/api/photo/:id/sizes', async (req, res) => {
    if (!oauthTokens.accessToken) return res.status(401).json({ error: '尚未授權 Flickr' });
    try {
        const data = await flickrRequest('flickr.photos.getSizes', { photo_id: req.params.id }, flickrCredentials(), 'GET');
        res.json(data);
    } catch (error) {
        res.status(502).json({ error: error.message });
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


async function uploadToFlickr(file, title, description, tags,credentialSnapshot=null) {
    return new Promise((resolve, reject) => {
        const FormData = require('form-data');
        const form = new FormData();
        const credentials=credentialSnapshot||flickrCredentials();

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
            is_public: '0',
            is_friend: '0',
            is_family: '0',
            ...(title ? { title } : {}),
            ...(description ? { description } : {}),
            ...(tags ? { tags } : {})
        };

        const oauthParams = {
            oauth_consumer_key: credentials.key,
            oauth_token: credentials.token,
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
        const signingKey = `${encodeURIComponent(credentials.secret)}&${encodeURIComponent(credentials.tokenSecret)}`;
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

function flickrCredentials() {
    return { key: process.env.FLICKR_API_KEY, secret: process.env.FLICKR_API_SECRET,
        token: oauthTokens.accessToken, tokenSecret: oauthTokens.accessTokenSecret };
}

async function addPhotoToAlbum(photoId, albumId) {
    try {
        await flickrRequest('flickr.photosets.addPhoto', { photoset_id: albumId, photo_id: photoId }, flickrCredentials());
        return true;
    } catch (error) {
        // Flickr documents code 3 as already a member; code 1 means missing album.
        if (error.code === 3) return true;
        throw error;
    }
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
            date_taken_granularity: '0', // 0 = Full date level
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
app.listen(PORT, process.env.TIMEHUT_BIND_HOST || '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Backend Release: ${BACKEND_VERSION} (${BACKEND_BUILD})`);
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
    recoverInterruptedUploads();
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
