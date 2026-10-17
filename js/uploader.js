/**
 * 黃家小屋 - 前端上傳模組
 * 連接後端 API，支援批量上傳照片和影片
 */

const Uploader = {
    // 後端 API URL（部署後要換成 Railway URL）
    apiUrl: CONFIG.UPLOAD_API_URL || 'http://localhost:3000',
    fileUploadIds: new WeakMap(),

    // 檢查授權狀態
    async checkAuth({ signal } = {}) {
        try {
            const data = await this.readJSON('/api/auth/status', { signal });
            return data.authenticated;
        } catch (error) {
            console.error('檢查授權狀態失敗:', error);
            return false;
        }
    },

    // 開始授權流程
    async startAuth() {
        try {
            const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${this.apiUrl}/api/auth/start`);
            const data = await response.json();

            if (data.authUrl) {
                // 開啟新視窗進行授權
                const authWindow = window.open(data.authUrl, 'flickr-auth', 'width=600,height=700');

                // 監聽授權完成訊息
                return new Promise((resolve) => {
                    window.addEventListener('message', function handler(event) {
                        if (event.data.type === 'FLICKR_AUTH_SUCCESS') {
                            window.removeEventListener('message', handler);
                            if (authWindow) authWindow.close();
                            resolve(true);
                        }
                    });
                });
            }
        } catch (error) {
            console.error('開始授權失敗:', error);
            throw error;
        }
    },

    // 取得相簿列表
    async readJSON(path, { signal } = {}) {
        const controller = new AbortController();
        const cancel = () => controller.abort();
        if (signal?.aborted) controller.abort();
        signal?.addEventListener('abort', cancel, { once: true });
        const timeout = setTimeout(cancel, 8000);
        try {
            const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${this.apiUrl}${path}`, { signal: controller.signal });
            if (!response.ok) throw new Error('目前無法取得相簿服務回應');
            return await response.json();
        } finally {
            clearTimeout(timeout);
            signal?.removeEventListener('abort', cancel);
        }
    },

    async getAlbums(options = {}) {
        const validate = data => {
            if (!data || !Array.isArray(data.albums) || data.albums.some(album =>
                !album || typeof album.id !== 'string' || !album.id || typeof album.title !== 'string')) {
                throw new Error('相簿清單格式不完整');
            }
        };
        if (!CONFIG.ACCOUNT_MODE) {
            const data = await this.readJSON('/api/albums', options);
            validate(data);
            return data.albums;
        }
        const albums = [], seen = new Set();
        let page = 1, pages = 1, total = null;
        do {
            if (options.signal?.aborted) throw new DOMException('相簿讀取已停止', 'AbortError');
            const data = await this.readJSON(`/api/accounts/albums?page=${page}&per_page=30`, options);
            validate(data);
            if (data.page !== page || !Number.isSafeInteger(data.total) || data.total < 0 ||
                !Number.isSafeInteger(data.pages) || data.pages < 1 || data.pages > 100000 ||
                data.pages !== Math.max(1, Math.ceil(data.total / 30)) ||
                (total !== null && (data.total !== total || data.pages !== pages)) ||
                data.albums.length !== Math.min(30, Math.max(0, data.total - (page - 1) * 30))) {
                throw new Error('相簿分頁尚未確認');
            }
            total = data.total; pages = data.pages;
            for (const album of data.albums) {
                if (seen.has(album.id)) throw new Error('相簿分頁有重複項目，請重試');
                seen.add(album.id); albums.push(album);
            }
            page++;
        } while (page <= pages);
        if (albums.length !== total) throw new Error('相簿總數尚未確認');
        return albums;
    },

    // 上傳檔案 (Modified to use XHR for progress)
    uploadFiles(files, options = {}) {
        if (CONFIG.ACCOUNT_MODE) {
            if (files.length !== 1) return Promise.reject(new Error('每個檔案需要獨立收件，請依序上傳'));
            return window.TimehutWebUpload.upload(files[0], options);
        }
        const { albumId, title, description, tags, onProgress, signal } = options;

        return new Promise((resolve, reject) => {
            const stopped = () => new DOMException('本機傳送已停止；伺服器是否收到與 Flickr 結果尚未確認', 'AbortError');
            if (signal?.aborted) { reject(stopped()); return; }
            const formData = new FormData();

            // 加入所有檔案
            for (const file of files) {
                formData.append('files', file);
            }
            // Reuse the identity when the same retained File is retried after a lost reply.
            if (files.length === 1) {
                const file = files[0];
                if (!this.fileUploadIds.has(file)) {
                    const random = crypto.randomUUID ? crypto.randomUUID()
                        : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
                    this.fileUploadIds.set(file, `web_${random}`);
                }
                formData.append('clientUploadId', this.fileUploadIds.get(file));
            }

            if (albumId) formData.append('albumId', albumId);
            if (title) formData.append('title', title);
            if (description) formData.append('description', description);
            if (tags) formData.append('tags', tags);

            const xhr = new XMLHttpRequest();

            // 監聽上傳進度
            if (xhr.upload) {
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable && onProgress) {
                        const percent = (event.loaded / event.total) * 100;
                        onProgress(percent);
                    }
                });
            }

            xhr.open('POST', `${this.apiUrl}/api/upload`);

            // 設定較長的超時時間（10分鐘），影片處理需要較長時間
            xhr.timeout = 600000;

            xhr.ontimeout = () => {
                console.error('XHR timeout - upload took too long');
                reject(new Error('上傳超時，請稍後再試'));
            };

            xhr.onload = () => {
                console.log('XHR response status:', xhr.status);
                console.log('XHR response text:', xhr.responseText.substring(0, 500));
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        if (!Array.isArray(data.results) || data.results.length === 0 || data.results.some(item => !item.success)) {
                            reject(new Error(data.results?.find(item => !item.success)?.error || data.error || '缺少有效的上傳收據'));
                            return;
                        }
                        resolve(data);
                    } catch (e) {
                        console.error('Failed to parse response:', e);
                        reject(new Error('無法解析伺服器回應'));
                    }
                } else {
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        console.error('Server error:', errorData);
                        reject(new Error(errorData.error || `上傳失敗 (${xhr.status})`));
                    } catch (e) {
                        console.error('Failed to parse error response:', xhr.responseText);
                        reject(new Error(`上傳失敗 (${xhr.status}): ${xhr.responseText.substring(0, 100)}`));
                    }
                }
            };

            xhr.onerror = (e) => {
                console.error('XHR onerror triggered:', e);
                reject(new Error('網路錯誤，無法連線到伺服器'));
            };

            xhr.onabort = () => {
                reject(stopped());
            };

            const abort = () => xhr.abort();
            signal?.addEventListener('abort', abort, { once: true });
            xhr.onloadend = () => signal?.removeEventListener('abort', abort);
            console.log('Sending upload request to:', `${this.apiUrl}/api/upload`);
            try { xhr.send(formData); }
            catch (error) { signal?.removeEventListener('abort', abort); reject(error); }
        });
    }
};

/**
 * Background Uploader - Handles upload queue independently of the modal
 */
const BackgroundUploader = {
    isUploading: false,
    uploadQueue: [], // Array of {file, albumId, tags}
    totalFiles: 0,
    completedFiles: 0,

    // UI Elements
    globalBar: null,
    progressBar: null,
    statusText: null,
    percentText: null,
    stopButton: null,
    controller: null,
    stopRequested: false,
    finishTimer: null,

    init() {
        this.globalBar = document.getElementById('globalUploadBar');
        this.progressBar = document.getElementById('globalProgressBar');
        this.statusText = document.getElementById('globalStatusText');
        this.percentText = document.getElementById('globalPercentText');
        const actions = this.globalBar?.querySelector('.global-upload-actions');
        if (actions && !this.stopButton) {
            this.stopButton = document.createElement('button');
            this.stopButton.id = 'stopUploadBtn';
            this.stopButton.type = 'button';
            this.stopButton.className = 'btn btn-secondary';
            this.stopButton.textContent = '停止傳送';
            this.stopButton.title = '停止本頁傳送與剩餘佇列，不會撤回伺服器已收到的檔案';
            this.stopButton.hidden = true;
            this.stopButton.addEventListener('click', () => this.stop());
            actions.append(this.stopButton);
        }

        // Prevent navigation warning for both upload and delete operations
        window.onbeforeunload = (e) => {
            if (this.isUploading || (window.BackgroundWorker && window.BackgroundWorker.isBusy)) {
                const msg = '任務正在背景執行中，離開頁面將會中斷。確定要離開嗎？';
                e.returnValue = msg;
                return msg;
            }
        };
    },

    startBatch(files, options) {
        if (this.isUploading) {
            alert('已有上傳正在進行中');
            return;
        }

        return this.processQueue(files, options);
    },

    processQueue(files, options) {
        return this.startTasks(files.map(file => ({ ...options, file })));
    },

    stop() {
        if (!this.isUploading || this.stopRequested) return;
        this.stopRequested = true;
        if (this.stopButton) this.stopButton.disabled = true;
        this.updateStatus('正在停止本機傳送…');
        this.controller?.abort();
    },

    async startTasks(tasks) {
        if (this.isUploading || !tasks.length) return;
        clearTimeout(this.finishTimer);
        document.getElementById('uploadStopNotice')?.remove();
        this.isUploading = true;
        this.stopRequested = false;
        this.controller = new AbortController();
        this.uploadQueue = tasks.slice();
        this.totalFiles = tasks.length;
        this.completedFiles = 0;
        this.failedFiles = [];
        this.receiptWarnings = [];
        if (this.stopButton) { this.stopButton.hidden = false; this.stopButton.disabled = false; }
        this.showGlobalBar();

        let successCount = 0;
        let failCount = 0;
        let stagedCount = 0;
        for (const [i, task] of this.uploadQueue.entries()) {
            if (this.stopRequested) {
                this.failedFiles.push({ name: task.file.name, reason: '尚未送出', state: 'not_sent', task });
                continue;
            }
            this.updateStatus(`上傳中 (${i + 1}/${this.totalFiles}): ${task.file.name}`);
            this.updateProgress(0);
            try {
                const receipt = await Uploader.uploadFiles([task.file], {
                    ...task,
                    signal: this.controller.signal,
                    onProgress: percent => this.updateProgress(percent)
                });
                // An acknowledged file must never become a resend candidate, even
                // if persisting its receipt fails. Preserve the receipt in memory.
                task.receipt = receipt;
                if (receipt._staged || receipt.results?.some(item => item._staged)) stagedCount++;
                successCount++;
                try { window.TimehutTransfers?.trackReceipt(receipt, task.file.name, {albumId: task.albumId, byteSize: task.file.size}); }
                catch (error) { this.receiptWarnings.push(`${task.file.name}：收據未能儲存（${error.message}）；已收件，不會重傳`); }
            } catch (error) {
                const unknown = error.name === 'AbortError';
                if (!unknown) failCount++;
                this.failedFiles.push({
                    name: task.file.name,
                    reason: unknown ? '傳送已停止；伺服器是否收到與 Flickr 結果未知' : this.translateError(error.message),
                    state: unknown ? 'unknown' : 'failed',
                    task
                });
            }
            this.completedFiles++;
        }
        this.controller = null;
        this.finish(successCount, failCount, stagedCount);
    },

    /**
     * 將 Flickr 錯誤訊息翻譯為友善的中文提示
     */
    translateError(errorMsg) {
        if (errorMsg.includes('Filetype was not recognised')) {
            return '影片格式不支援。Flickr 需要 H.264 編碼。\n建議：在 iPhone 設定 > 相機 > 格式，選擇「相容性最高」';
        }
        if (errorMsg.includes('File size limit')) {
            return '檔案太大，超過 Flickr 500MB 限制';
        }
        if (errorMsg.includes('timeout') || errorMsg.includes('超時')) {
            return '上傳超時，請檢查網路連線後重試';
        }
        if (errorMsg.includes('網路錯誤')) {
            return '網路連線問題，請稍後重試';
        }
        return errorMsg;
    },

    updateStatus(text) {
        if (this.statusText) this.statusText.textContent = text;
    },

    updateProgress(percent) {
        if (this.progressBar) this.progressBar.style.width = `${percent}%`;
        if (this.percentText) this.percentText.textContent = `${Math.round(percent)}%`;
    },

    showGlobalBar() {
        if (this.globalBar) this.globalBar.classList.add('visible');
    },

    hideGlobalBar() {
        if (this.globalBar) this.globalBar.classList.remove('visible');
    },

    finish(success, fail, staged = 0) {
        const stopped = this.stopRequested;
        const unknown = this.failedFiles.filter(item => item.state === 'unknown').length;
        const unsent = this.failedFiles.filter(item => item.state === 'not_sent').length;
        let message = `${stopped ? '已停止本機傳送' : '上傳作業結束'}\n已送到伺服器、待 Flickr 確認：${staged} 個\n伺服器回報已完成：${success - staged} 個\n送出失敗：${fail} 個`;
        if (stopped) message += `\n結果未知：${unknown} 個；尚未送出：${unsent} 個\n停止僅中止本頁傳送，不代表 Flickr 已取消、刪除或未收到；已收到的檔案仍可能繼續處理。`;
        if (staged > 0) message += '\n檔案送出不代表已存入 Flickr；請到傳輸中心確認處理狀態。';
        if (this.receiptWarnings.length) message += '\n' + this.receiptWarnings.join('\n');

        if (this.failedFiles.length) {
            message += '\n\n未完成的檔案：';
            this.failedFiles.forEach(item => { message += `\n• ${item.name}\n  ${item.reason}`; });
            // Restore before making the uploader idle: a fast reopen/retry must
            // not race a delayed finish callback or lose the original File/ID.
            const drafts = UploadUI.fileList.map((file, index) => ({ file, tags: UploadUI.individualTags[index] || '', warning: UploadUI.videoWarnings[index] }));
            this.failedFiles.forEach(item => UploadUI.retainedTasks.set(item.task.file, item.task));
            UploadUI.fileList = [...this.failedFiles.map(item => item.task.file), ...drafts.map(item => item.file)];
            UploadUI.individualTags = Object.fromEntries([
                ...this.failedFiles.map(item => typeof item.task.userTags === 'string'
                    ? item.task.userTags : item.task.tags?.replace(/^uploader:\S+\s*/, '') || ''), ...drafts.map(item => item.tags)
            ].map((tags, index) => [index, tags]));
            UploadUI.videoWarnings = Object.fromEntries([
                ...this.failedFiles.map(item => item.task.videoWarning), ...drafts.map(item => item.warning)
            ].map((warning, index) => [index, warning]));
            UploadUI.retryAlbumId = this.failedFiles[0].task.albumId;
            document.querySelectorAll('.queue-item-tags').forEach(input => input.remove());
            setTaggingMode('individual');
            UploadUI.showUploadQueue();
            message += '\n\n未完成檔案與原設定已保留在本頁，請重新開啟上傳視窗重試；關閉或重新整理頁面會失去未完成檔案。';
        } else if (success > 0 && !this.receiptWarnings.length && !stopped) {
            message += '\n\n頁面即將刷新以查看照片與待處理檔案。';
        }
        if (stopped) {
            const notice = document.createElement('div');
            notice.id = 'uploadStopNotice';
            notice.setAttribute('role', 'status');
            const summary = document.createElement('p');
            summary.textContent = `已停止本頁傳送，未完成 ${this.failedFiles.length} 個。檔案僅保留在本頁，請勿重新整理；停止不代表 Flickr 撤回。`;
            const details = document.createElement('details');
            const heading = document.createElement('summary');
            heading.textContent = '查看收件狀態與重試說明';
            const explanation = document.createElement('p');
            explanation.textContent = `伺服器已收件 ${success} 個（${staged} 個待 Flickr 確認）；結果未知 ${unknown} 個、尚未送出 ${unsent} 個。停止不代表 Flickr 已取消、刪除或未收到。未完成檔案與原設定僅保留在本頁，請重試，勿重新整理。`;
            details.append(heading, explanation);
            notice.append(summary, details);
            document.getElementById('uploadQueue')?.prepend(notice);
        }
        this.isUploading = false;
        if (this.stopButton) this.stopButton.hidden = true;
        this.updateStatus(stopped ? `已停止傳送；結果未知 ${unknown}、未送出 ${unsent}` : (staged > 0 ? '檔案已送出，Flickr 處理中' : '上傳作業結束'));
        this.updateProgress(stopped ? success / this.totalFiles * 100 : 100);
        if (stopped && this.percentText) this.percentText.textContent = '已停止';
        this.finishTimer = setTimeout(() => {
            alert(message);
            this.hideGlobalBar();
            if (success > 0 && fail === 0 && !stopped && !this.receiptWarnings.length && !UploadUI.fileList.length) {
                TimehutResults.invalidateAlbumCache();
                location.reload();
            }
        }, 500);
    }

};

/**
 * Background Worker - Handles background deletion tasks using the same UI as uploads
 */
const BackgroundWorker = {
    isBusy: false,
    operationSequence: 0,

    // Reuse UI elements from BackgroundUploader
    get globalBar() {
        return document.getElementById('globalUploadBar');
    },
    get progressBar() {
        return document.getElementById('globalProgressBar');
    },
    get statusText() {
        return document.getElementById('globalStatusText');
    },
    get percentText() {
        return document.getElementById('globalPercentText');
    },

    async startDelete(photoIds) {
        if (this.isBusy || BackgroundUploader.isUploading) {
            console.warn('Another background task is running');
            return { accepted: false, succeeded: [], failed: photoIds };
        }

        this.isBusy = true;
        const operation = ++this.operationSequence;
        this.showBar();

        const total = photoIds.length;
        let processed = 0;
        const chunkSize = 5;
        let failedCount = 0;
        const succeeded = [];

        try {
            // Split into chunks for better progress tracking
            for (let i = 0; i < total; i += chunkSize) {
                const chunk = photoIds.slice(i, i + chunkSize);

                this.updateStatus(`正在刪除... (${processed}/${total})`);
                this.updateProgress((processed / total) * 100);

                try {
                    // Call Delete API
                    const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photos/delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ photoIds: chunk })
                    });

                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || '刪除失敗');
                    const receipt = TimehutResults.confirmed(result, chunk);
                    succeeded.push(...receipt.succeeded);
                    failedCount += receipt.failed.length;
                    processed += chunk.length;
                } catch (e) {
                    console.error('Delete chunk failed', e);
                    failedCount += chunk.length;
                    // Continue with next chunk
                }
            }

            this.updateStatus(failedCount ? `刪除未全部完成：成功 ${succeeded.length}、未完成 ${failedCount}` : `已確認刪除 ${succeeded.length} 個`);
            this.updateProgress(100);

            setTimeout(() => {
                // A previous result must not hide the progress bar or reload
                // the page after the user has already started another task.
                if (this.operationSequence !== operation || this.isBusy || BackgroundUploader.isUploading) return;
                const successCount = total - failedCount;
                let message = `刪除作業結束\n成功：${successCount} 個\n未完成：${failedCount} 個`;
                if (successCount > 0 && failedCount === 0) {
                    message += '\n\n頁面即將刷新以顯示變更。';
                }
                alert(message);
                this.hideBar();
                if (successCount > 0 && failedCount === 0) {
                    TimehutResults.invalidateAlbumCache();
                    location.reload();
                }
            }, 1000);
        } catch (error) {
            console.error('Critical error in background delete:', error);
            this.updateStatus('刪除失敗');
            setTimeout(() => {
                alert('刪除過程發生錯誤：' + error.message);
                this.hideBar();
            }, 1000);
        } finally {
            this.isBusy = false;
        }
        return { accepted: true, succeeded, failed: photoIds.filter(id => !succeeded.includes(String(id))) };
    },

    updateStatus(text) {
        if (this.statusText) this.statusText.textContent = text;
    },

    updateProgress(percent) {
        if (this.progressBar) this.progressBar.style.width = `${percent}%`;
        if (this.percentText) this.percentText.textContent = `${Math.round(percent)}%`;
    },

    showBar() {
        if (this.globalBar) this.globalBar.classList.add('visible');
    },

    hideBar() {
        if (this.globalBar) this.globalBar.classList.remove('visible');
    }
};

// Start Global Init
(window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))( () => {
    BackgroundUploader.init();
});

// UI Logic
const UploadUI = {
    modal: null,
    dropzone: null,
    fileInput: null,
    fileList: [],
    albumSelect: null,
    taggingMode: 'batch', // 'batch' or 'individual'
    individualTags: {}, // Store individual tags by file index
    videoWarnings: {}, // Store video compatibility warnings by file index
    retryAlbumId: null,
    retainedTasks: new WeakMap(),
    preparationController: null,

    init() {
        this.modal = document.getElementById('uploadModal');
        this.dropzone = document.getElementById('uploadDropzone');
        this.fileInput = document.getElementById('fileInput');

        // Removed injectStyles as CSS is now in style.css

        if (!this.dropzone || !this.fileInput) return;

        if (CONFIG.ACCOUNT_MODE) {
            const name = window.TimehutAccounts.status().user?.displayName || '';
            const input = document.getElementById('uploaderValue');
            const label = document.querySelector('#uploaderDisplay .uploader-name');
            if (input) input.value = name;
            if (label) label.textContent = name || '請先登入';
            if (window.TimehutAccounts.status().native) {
                document.getElementById('nativeBackgroundUploadLink')?.removeAttribute('hidden');
                const submit = document.getElementById('startUploadBtn');
                if (submit) submit.textContent = '網頁傳送（保持開啟）';
            }
        }

        // 點擊 dropzone 觸發檔案選擇
        this.dropzone.addEventListener('click', () => {
            this.fileInput.click();
        });

        // 檔案選擇變更
        this.fileInput.addEventListener('change', (e) => {
            this.addFiles(e.target.files);
        });

        // 拖放事件
        this.dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropzone.classList.add('dragover');
        });

        this.dropzone.addEventListener('dragleave', () => {
            this.dropzone.classList.remove('dragover');
        });

        this.dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropzone.classList.remove('dragover');
            this.addFiles(e.dataTransfer.files);
        });

        // Populate album select from CONFIG.CHILDREN
        this.populateAlbumSelect();
        document.getElementById('retryAlbumLoadBtn')?.addEventListener('click', () => this.checkAndPrepare());

        // Bind start upload button
        const startUploadBtn = document.getElementById('startUploadBtn');
        if (startUploadBtn) {
            startUploadBtn.addEventListener('click', () => {
                console.log('Start Upload button clicked');
                this.startUpload();
            });
        } else {
            console.error('Start Upload button not found');
        }
    },

    // injectStyles removed


    /**
     * 填充相簿選擇下拉選單 - 從 CONFIG.CHILDREN 讀取，預設為當前相簿
     */
    populateAlbumSelect() {
        const albumSelect = document.getElementById('albumSelect');
        if (!albumSelect || typeof CONFIG === 'undefined') return;

        // Get current child index from localStorage
        const currentChildIndex = parseInt((window.TimehutStorage?.local || localStorage).getItem('timehut_current_child') || '0');

        albumSelect.replaceChildren(...CONFIG.CHILDREN.map((child, index) =>
            new Option(`${child.emoji || ''} ${escapeTimehutText(child.name)}`, child.albumId, false, index === currentChildIndex)));
    },

    async addFiles(files) {
        for (const file of files) {
            if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
            // 檢查是否已存在
            if (!this.fileList.some(f => f.name === file.name && f.size === file.size)) {
                const index = this.fileList.length;
                this.fileList.push(file);

                // 檢查影片格式相容性
                if (file.type.startsWith('video/')) {
                    const isCompatible = await this.checkVideoCompatibility(file);
                    if (!isCompatible) {
                        this.videoWarnings[index] = true;
                    }
                }
            }
        }
        this.renderFileList();
        this.showUploadQueue();
    },

    /**
     * 檢查影片是否與 Flickr 相容
     * Flickr 需要 H.264 編碼，不支援 H.265/HEVC
     */
    checkVideoCompatibility(file) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';

            const timeout = setTimeout(() => {
                URL.revokeObjectURL(video.src);
                resolve(false); // 超時視為可能不相容
            }, 3000);

            video.onloadedmetadata = () => {
                clearTimeout(timeout);
                URL.revokeObjectURL(video.src);
                // 如果能成功載入 metadata，通常是相容的格式
                resolve(true);
            };

            video.onerror = () => {
                clearTimeout(timeout);
                URL.revokeObjectURL(video.src);
                // 無法載入可能表示格式不支援
                resolve(false);
            };

            video.src = URL.createObjectURL(file);
        });
    },

    removeFile(index) {
        // Preserve per-file labels before indices shift after a removal.
        document.querySelectorAll('.queue-item-tags').forEach(input => { this.individualTags[input.dataset.fileIndex] = input.value; });
        this.fileList.splice(index, 1);
        const reindex = values => Object.fromEntries(Object.entries(values).filter(([key]) => Number(key) !== index).map(([key, value]) => [Number(key) > index ? Number(key) - 1 : key, value]));
        this.individualTags = reindex(this.individualTags);
        this.videoWarnings = reindex(this.videoWarnings);
        document.querySelectorAll('.queue-item-tags').forEach(input => input.remove());
        this.renderFileList();
        if (this.fileList.length === 0) {
            this.hideUploadQueue();
        }
    },

    renderFileList() {
        const queueList = document.getElementById('queueList');
        if (!queueList) return;
        const retained = this.fileList.some(file => this.retainedTasks.has(file));
        const album = document.getElementById('albumSelect');
        if (album) album.disabled = retained;
        const batch = document.getElementById('batchModeBtn');
        if (batch) batch.disabled = retained;

        // Save existing individual tag values before re-rendering
        document.querySelectorAll('.queue-item-tags').forEach(input => {
            const idx = input.dataset.fileIndex;
            if (idx !== undefined) {
                this.individualTags[idx] = input.value;
            }
        });

        (this.previewUrls || []).forEach(url => URL.revokeObjectURL(url));
        this.previewUrls = [];
        queueList.innerHTML = this.fileList.map((file, index) => {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            const hasWarning = this.videoWarnings[index];
            const icon = isVideo ? (hasWarning ? '⚠️' : '🎬') : '🖼️';
            const size = this.formatFileSize(file.size);
            const warningText = hasWarning ? '<div class="video-warning" style="color:#e67e22;font-size:0.8rem;margin-top:4px;">此影片可能使用 H.265 編碼，Flickr 可能無法處理</div>' : '';

            // P1: In individual mode, show per-file tag input with preserved value
            const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
            const savedTag = escape(this.individualTags[index] || '');
            const tagInput = this.taggingMode === 'individual'
                ? `<input type="text" class="queue-item-tags" data-file-index="${index}" placeholder="此照片的標籤..." value="${savedTag}" ${this.retainedTasks.has(file) ? 'readonly title="重試沿用原始上傳設定"' : ''}>`
                : '';
            const url = URL.createObjectURL(file); this.previewUrls.push(url);
            const preview = isImage ? `<img class="queue-preview" src="${url}" alt="">` : `<video class="queue-preview" src="${url}" muted preload="metadata" aria-hidden="true"></video>`;

            return `
                <div class="queue-item" data-index="${index}" id="queue-item-${index}">
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        ${preview}
                        <span class="queue-filename">${escape(file.name)}</span>
                        <span class="queue-size">${size}</span>
                        <button class="queue-remove" onclick="UploadUI.removeFile(${index})">✕</button>
                    </div>
                    ${warningText}
                    ${tagInput}
                    <div class="progress-container">
                        <div class="progress-bar" id="progress-bar-${index}"></div>
                    </div>
                    <div style="text-align: right;">
                        <span class="progress-text" id="progress-text-${index}"></span>
                    </div>
                </div>
            `;
        }).join('');
    },

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    showUploadQueue() {
        const queue = document.getElementById('uploadQueue');
        if (queue) queue.style.display = 'block';
    },

    hideUploadQueue() {
        const queue = document.getElementById('uploadQueue');
        if (queue) queue.style.display = 'none';
    },

    cancelPreparation() {
        this.preparationController?.abort();
        this.preparationController = null;
    },

    setAlbumStatus(message, retry = false) {
        const status = document.getElementById('albumLoadStatus');
        if (!status) return;
        status.hidden = !message;
        status.querySelector('span').textContent = message;
        document.getElementById('retryAlbumLoadBtn').hidden = !retry;
    },

    async checkAndPrepare() {
        this.cancelPreparation();
        const controller = new AbortController();
        this.preparationController = controller;
        const { signal } = controller;
        this.setAlbumStatus('正在確認相簿清單…');
        // A restored retry queue must start at its first filename, rather than
        // retaining the scroll position of the previous per-file tag editor.
        if (document.getElementById('uploadStopNotice')) {
            const list = document.getElementById('queueList');
            if (list) list.scrollTop = 0;
        }
        // 檢查後端是否可用
        try {
            const isAuth = await Uploader.checkAuth({ signal });
            if (signal.aborted) return;

            if (!isAuth) {
                // 顯示需要授權的提示
                this.showAuthRequired();
                this.setAlbumStatus('尚未確認 Flickr 連線，請連接或重試。', true);
            } else {
                const authBtn = document.getElementById('authFlickrBtn');
                if (authBtn) authBtn.style.display = 'none';
                // 載入相簿列表
                await this.loadAlbums({ signal });
            }
        } catch (error) {
            // 後端不可用，顯示 Flickr 直接上傳選項
            console.log('後端不可用，使用 Flickr 直接上傳');
        }
    },

    showAuthRequired() {
        const authBtn = document.getElementById('authFlickrBtn');
        if (authBtn) {
            authBtn.style.display = 'block';
            authBtn.onclick = async () => {
                try {
                    await Uploader.startAuth();
                    alert('授權成功！現在可以上傳照片了。');
                    location.reload();
                } catch (error) {
                    alert('授權失敗，請重試');
                }
            };
        }
    },

    async loadAlbums({ signal } = {}) {
        try {
            const albums = await Uploader.getAlbums({ signal });
            if (signal?.aborted) return;
            const select = document.getElementById('albumSelect');
            if (select && albums.length) {
                // Keep the current choice, including one made while the request was pending.
                const selected = select.value;
                const options = new Map(Array.from(select.options, option => [option.value, option.textContent]));
                for (const album of albums) options.set(album.id, album.title);
                select.replaceChildren(...Array.from(options, ([id, title]) => new Option(title, id)));
                select.value = selected;
            }
            this.setAlbumStatus(albums.length ? '' : '未取得其他相簿，仍可使用已設定的目的相簿。', !albums.length);
        } catch (error) {
            if (!signal?.aborted) this.setAlbumStatus('暫時無法更新清單，已保留目前的目的相簿。', true);
        }
    },

    updateProgress(index, percent) {
        const item = document.getElementById(`queue-item-${index}`);
        const bar = document.getElementById(`progress-bar-${index}`);
        const text = document.getElementById(`progress-text-${index}`);
        if (item && bar) {
            item.classList.add('uploading');
            bar.style.width = `${percent}%`;
            if (text) {
                text.textContent = Math.round(percent) + '%';
            }
        }
    },

    async startUpload() {
        console.log('startUpload called');
        try {
            if (this.fileList.length === 0) {
                alert('請選擇要上傳的檔案');
                return;
            }

            // Close Modal immediately to allow background processing
            this.hideUploadQueue(); // Or close entire modal?
            // Better to close modal to show "Background" effect
            // closeUploadModal(); // Global function from timeline.html/js? need verification. 
            // In timeline.html we have 'closeUploadModal()' defined in script? 
            // Actually it's an onclick handler on div, likely defined in timeline.js?
            // Checked timeline.js, nope. timeline.html has `onclick="closeUploadModal()"` but 
            // function might be missing or inline? 
            // Wait, checking timeline.html... 
            // It has `onclick="closeUploadModal()"` on overlay. 
            // I should find where `closeUploadModal` is defined. 
            // If not found, I can manipulate DOM directly.
            if (BackgroundUploader.isUploading) {
                alert('已有上傳正在進行中，請等待完成');
                this.showUploadQueue(); return;
            }

            // Prepare tasks
            const tasks = [];

            const albumSelect = document.getElementById('albumSelect');
            let albumId = albumSelect ? albumSelect.value : '';

            // Fallback (same logic as before)
            if (!albumId && typeof CONFIG !== 'undefined' && typeof TimelineState !== 'undefined') {
                const currentChild = CONFIG.CHILDREN[TimelineState.currentChildIndex];
                if (currentChild && currentChild.albumId) {
                    albumId = currentChild.albumId;
                }
            }

            // Uploader tag
            const uploaderInput = document.getElementById('uploaderValue');
            const uploader = CONFIG.ACCOUNT_MODE ? window.TimehutAccounts.status().user?.displayName : (uploaderInput ? uploaderInput.value : '爸爸');
            if (!uploader) throw new Error('請先登入帳戶再上傳');
            const uploaderTag = `uploader:${uploader}`;

            if (this.taggingMode === 'individual') {
                for (let i = 0; i < this.fileList.length; i++) {
                    const file = this.fileList[i];
                    const tagInput = document.querySelector(`input[data-file-index="${i}"]`);
                    const fileTags = tagInput ? tagInput.value : '';
                    const tags = `${uploaderTag} ${fileTags}`.trim();
                    tasks.push({ file, albumId, tags, userTags: fileTags, index: i }); // Keep the original field independent of the uploader name.
                }
            } else {
                const tagsInput = document.getElementById('tagsInput');
                const batchTags = tagsInput ? tagsInput.value : '';
                const tags = `${uploaderTag} ${batchTags}`.trim();

                this.fileList.forEach((file, index) => {
                    tasks.push({ file, albumId, tags, userTags: batchTags, index: index }); // Keep the original field for a retained retry.
                });
            }

            // Handover to BackgroundUploader
            this.cancelPreparation();
            const modal = document.getElementById('uploadModal');
            modal.classList.remove('active'); modal.style.removeProperty('display');
            document.body.style.overflow = '';
            const retained = tasks.map(task => this.retainedTasks.get(task.file) || { ...task, videoWarning: this.videoWarnings[task.index] });

            // Clear local list
            this.fileList = [];
            this.individualTags = {}; this.videoWarnings = {};
            this.renderFileList();
            BackgroundUploader.startTasks(retained);

        } catch (error) {
            console.error('Critical error in startUpload:', error);
            alert('系統錯誤：' + error.message);
            // Re-open modal if failed immediately?
            document.getElementById('uploadModal').style.display = 'flex';
        }
    },

    clearQueue() {
        document.getElementById('uploadStopNotice')?.remove();
        this.fileList = [];
        this.retryAlbumId = null;
        this.individualTags = {}; this.videoWarnings = {};
        if (this.fileInput) this.fileInput.value = '';
        this.renderFileList();
        this.hideUploadQueue();
    }
};

// 初始化
(window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))( () => {
    UploadUI.init();
});

// 全域函數供 HTML 調用
function clearUploadQueue() {
    UploadUI.clearQueue();
}

function startUpload() {
    UploadUI.startUpload();
}

// P1: Switch tagging mode (batch/individual)
function setTaggingMode(mode) {
    if (!['batch', 'individual'].includes(mode)) return;
    UploadUI.taggingMode = mode;

    // Update button states
    const batchBtn = document.getElementById('batchModeBtn');
    const individualBtn = document.getElementById('individualModeBtn');
    const hint = document.getElementById('taggingModeHint');
    const tagsInput = document.getElementById('tagsInput');

    if (batchBtn && individualBtn) {
        batchBtn.classList.toggle('active', mode === 'batch');
        individualBtn.classList.toggle('active', mode === 'individual');
        batchBtn.setAttribute('aria-pressed', String(mode === 'batch'));
        individualBtn.setAttribute('aria-pressed', String(mode === 'individual'));
    }

    // Update hint text
    if (hint) {
        hint.textContent = mode === 'batch'
            ? '目前：所有照片使用相同標籤'
            : '目前：每張照片可設定不同標籤';
    }

    // Show/hide batch tags input
    if (tagsInput) {
        tagsInput.parentElement.style.display = mode === 'batch' ? 'block' : 'none';
    }

    // Re-render file list to show/hide individual inputs
    UploadUI.renderFileList();
}

window.UploadUI = UploadUI;
window.setTaggingMode = setTaggingMode;
