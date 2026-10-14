/**
 * 黃家小屋 - 前端上傳模組
 * 連接後端 API，支援批量上傳照片和影片
 */

const Uploader = {
    // 後端 API URL（部署後要換成 Railway URL）
    apiUrl: CONFIG.UPLOAD_API_URL || 'http://localhost:3000',

    // 檢查授權狀態
    async checkAuth() {
        try {
            const response = await fetch(`${this.apiUrl}/api/auth/status`);
            const data = await response.json();
            return data.authenticated;
        } catch (error) {
            console.error('檢查授權狀態失敗:', error);
            return false;
        }
    },

    // 開始授權流程
    async startAuth() {
        try {
            const response = await fetch(`${this.apiUrl}/api/auth/start`);
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
    async getAlbums() {
        try {
            const response = await fetch(`${this.apiUrl}/api/albums`);
            const data = await response.json();
            return data.albums || [];
        } catch (error) {
            console.error('取得相簿列表失敗:', error);
            return [];
        }
    },

    // 上傳檔案 (Modified to use XHR for progress)
    uploadFiles(files, options = {}) {
        const { albumId, title, description, tags, onProgress } = options;

        return new Promise((resolve, reject) => {
            const formData = new FormData();

            // 加入所有檔案
            for (const file of files) {
                formData.append('files', file);
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
                console.error('XHR aborted');
                reject(new Error('上傳被取消'));
            };

            console.log('Sending upload request to:', `${this.apiUrl}/api/upload`);
            xhr.send(formData);
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

    init() {
        this.globalBar = document.getElementById('globalUploadBar');
        this.progressBar = document.getElementById('globalProgressBar');
        this.statusText = document.getElementById('globalStatusText');
        this.percentText = document.getElementById('globalPercentText');

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

        this.isUploading = true;
        this.totalFiles = files.length;
        this.completedFiles = 0;
        this.showGlobalBar();

        // Process sequentially
        this.processQueue(files, options);
    },

    async processQueue(files, options) {
        let successCount = 0;
        let failCount = 0;
        const { albumId, tags, onCompletion } = options;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            // Update status text
            this.updateStatus(`正在上傳 ${i + 1}/${files.length}: ${file.name}`);
            this.updateProgress(0);

            try {
                // Per-file tags for individual mode handled by caller preparing 'tags'
                // Here we assume batch tags or pre-processed logic passed down could be complex
                // But to simplify refactor, we stick to current "one batch call" flow if possible, 
                // OR we loop here. Current Uploader.js loops in UI. We move that loop here.

                // Wait for single file upload
                await Uploader.uploadFiles([file], {
                    albumId,
                    tags, // Helper: If individual mode, caller should pass specific tag for this file? 
                    // Actually, UI logic complexity: 'individual' mode has different tags per file.
                    // To support that, 'options' needs to be smarter or 'files' needs to be objects.
                    onProgress: (percent) => {
                        this.updateProgress(percent);
                    }
                });
                successCount++;
            } catch (error) {
                console.error(`Failed: ${file.name}`, error);
                failCount++;
            }
            this.completedFiles++;
        }

        this.finish(successCount, failCount);
    },

    // Refactored to support the exact logic from UploadUI:
    // UI passes the entire logic. Actually, better to let UI do the preparation 
    // and pass a list of "tasks" to BackgroundUploader.
    async startTasks(tasks) {
        // tasks: Array of { file, albumId, tags }
        if (this.isUploading) return;

        this.isUploading = true;
        this.totalFiles = tasks.length;
        this.completedFiles = 0;
        this.failedFiles = []; // 記錄失敗的檔案和原因
        this.showGlobalBar();

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            this.updateStatus(`上傳中 (${i + 1}/${this.totalFiles}): ${task.file.name}`);
            this.updateProgress(0);

            try {
                await Uploader.uploadFiles([task.file], {
                    albumId: task.albumId,
                    tags: task.tags,
                    onProgress: (percent) => {
                        this.updateProgress(percent);
                    }
                });
                successCount++;
            } catch (error) {
                console.error(`Failed: ${task.file.name}`, error);
                failCount++;
                // 記錄失敗原因
                this.failedFiles.push({
                    name: task.file.name,
                    reason: this.translateError(error.message)
                });
            }
        }

        this.finish(successCount, failCount);
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

    finish(success, fail) {
        this.isUploading = false;
        this.updateStatus('上傳完成！');
        this.updateProgress(100);

        setTimeout(() => {
            let message = `上傳完成！\n成功：${success} 個\n失敗：${fail} 個`;

            // 顯示失敗原因
            if (this.failedFiles && this.failedFiles.length > 0) {
                message += '\n\n失敗的檔案：';
                this.failedFiles.forEach(f => {
                    message += `\n• ${f.name}\n  原因：${f.reason}`;
                });
            }

            if (success > 0) {
                message += '\n\n頁面即將刷新以顯示新照片。';
            }

            alert(message);
            this.hideGlobalBar();
            if (success > 0) {
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
            return;
        }

        this.isBusy = true;
        this.showBar();

        const total = photoIds.length;
        let processed = 0;
        const chunkSize = 5;
        let failedCount = 0;

        try {
            // Split into chunks for better progress tracking
            for (let i = 0; i < total; i += chunkSize) {
                const chunk = photoIds.slice(i, i + chunkSize);

                this.updateStatus(`正在刪除... (${processed}/${total})`);
                this.updateProgress((processed / total) * 100);

                try {
                    // Call Delete API
                    const response = await fetch(`${CONFIG.UPLOAD_API_URL}/api/photos/delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ photoIds: chunk })
                    });

                    if (!response.ok) {
                        console.error('Delete chunk failed:', await response.text());
                        failedCount += chunk.length;
                    }

                    processed += chunk.length;
                } catch (e) {
                    console.error('Delete chunk failed', e);
                    failedCount += chunk.length;
                    // Continue with next chunk
                }
            }

            this.updateStatus('刪除完成');
            this.updateProgress(100);

            setTimeout(() => {
                const successCount = total - failedCount;
                let message = `刪除完成！\n成功：${successCount} 個\n失敗：${failedCount} 個`;
                if (successCount > 0) {
                    message += '\n\n頁面即將刷新以顯示變更。';
                }
                alert(message);
                this.hideBar();
                if (successCount > 0) {
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
document.addEventListener('DOMContentLoaded', () => {
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

    init() {
        this.modal = document.getElementById('uploadModal');
        this.dropzone = document.getElementById('uploadDropzone');
        this.fileInput = document.getElementById('fileInput');

        // Removed injectStyles as CSS is now in style.css

        if (!this.dropzone || !this.fileInput) return;

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
        const currentChildIndex = parseInt(localStorage.getItem('timehut_current_child') || '0');

        // Generate options from CONFIG.CHILDREN
        albumSelect.innerHTML = CONFIG.CHILDREN.map((child, index) => `
            <option value="${child.albumId}" ${index === currentChildIndex ? 'selected' : ''}>
                ${child.emoji} ${child.name}
            </option>
        `).join('');
    },

    async addFiles(files) {
        for (const file of files) {
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
        this.fileList.splice(index, 1);
        this.renderFileList();
        if (this.fileList.length === 0) {
            this.hideUploadQueue();
        }
    },

    renderFileList() {
        const queueList = document.getElementById('queueList');
        if (!queueList) return;

        // Save existing individual tag values before re-rendering
        document.querySelectorAll('.queue-item-tags').forEach(input => {
            const idx = input.dataset.fileIndex;
            if (idx !== undefined) {
                this.individualTags[idx] = input.value;
            }
        });

        queueList.innerHTML = this.fileList.map((file, index) => {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            const hasWarning = this.videoWarnings[index];
            const icon = isVideo ? (hasWarning ? '⚠️' : '🎬') : '🖼️';
            const size = this.formatFileSize(file.size);
            const warningText = hasWarning ? '<div class="video-warning" style="color:#e67e22;font-size:0.8rem;margin-top:4px;">此影片可能使用 H.265 編碼，Flickr 可能無法處理</div>' : '';

            // P1: In individual mode, show per-file tag input with preserved value
            const savedTag = this.individualTags[index] || '';
            const tagInput = this.taggingMode === 'individual'
                ? `<input type="text" class="queue-item-tags" data-file-index="${index}" placeholder="此照片的標籤..." value="${savedTag}">`
                : '';

            return `
                <div class="queue-item" data-index="${index}" id="queue-item-${index}">
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        <span class="queue-icon">${icon}</span>
                        <span class="queue-filename">${file.name}</span>
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

    async checkAndPrepare() {
        // 檢查後端是否可用
        try {
            const isAuth = await Uploader.checkAuth();

            if (!isAuth) {
                // 顯示需要授權的提示
                this.showAuthRequired();
            } else {
                // 載入相簿列表
                await this.loadAlbums();
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

    async loadAlbums() {
        const albums = await Uploader.getAlbums();
        const select = document.getElementById('albumSelect');

        if (select && albums.length > 0) {
            select.innerHTML = '<option value="">選擇相簿（可選）</option>' +
                albums.map(album => `<option value="${album.id}">${album.title}</option>`).join('');
            select.style.display = 'block';
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
            document.getElementById('uploadModal').classList.remove('active');
            document.body.style.overflow = '';
            document.getElementById('uploadModal').style.removeProperty('display');

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
            const uploader = uploaderInput ? uploaderInput.value : '爸爸';
            const uploaderTag = `uploader:${uploader}`;

            if (this.taggingMode === 'individual') {
                for (let i = 0; i < this.fileList.length; i++) {
                    const file = this.fileList[i];
                    const tagInput = document.querySelector(`input[data-file-index="${i}"]`);
                    const fileTags = tagInput ? tagInput.value : '';
                    const tags = `${uploaderTag} ${fileTags}`.trim();
                    tasks.push({ file, albumId, tags, index: i }); // Add index for progress tracking
                }
            } else {
                const tagsInput = document.getElementById('tagsInput');
                const batchTags = tagsInput ? tagsInput.value : '';
                const tags = `${uploaderTag} ${batchTags}`.trim();

                this.fileList.forEach((file, index) => {
                    tasks.push({ file, albumId, tags, index: index }); // Add index for progress tracking
                });
            }

            // Handover to BackgroundUploader
            BackgroundUploader.startTasks(tasks);

            // Clear local list
            this.fileList = [];
            this.renderFileList();

        } catch (error) {
            console.error('Critical error in startUpload:', error);
            alert('系統錯誤：' + error.message);
            // Re-open modal if failed immediately?
            document.getElementById('uploadModal').style.display = 'flex';
        }
    },

    clearQueue() {
        this.fileList = [];
        this.renderFileList();
        this.hideUploadQueue();
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
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
    UploadUI.taggingMode = mode;

    // Update button states
    const batchBtn = document.getElementById('batchModeBtn');
    const individualBtn = document.getElementById('individualModeBtn');
    const hint = document.getElementById('taggingModeHint');
    const tagsInput = document.getElementById('tagsInput');

    if (batchBtn && individualBtn) {
        batchBtn.classList.toggle('active', mode === 'batch');
        individualBtn.classList.toggle('active', mode === 'individual');
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
