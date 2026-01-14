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

        // Prevent navigation warning
        window.onbeforeunload = (e) => {
            if (this.isUploading) {
                const msg = '上傳正在進行中，離開頁面將會中斷上傳。確定要離開嗎？';
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
            }
        }

        this.finish(successCount, failCount);
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
            alert(`上傳完成！\n成功：${success} 個\n失敗：${fail} 個\n頁面即將刷新以顯示新照片。`);
            this.hideGlobalBar();
            location.reload();
        }, 500);
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

    addFiles(files) {
        for (const file of files) {
            // 檢查是否已存在
            if (!this.fileList.some(f => f.name === file.name && f.size === file.size)) {
                this.fileList.push(file);
            }
        }
        this.renderFileList();
        this.showUploadQueue();
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
            const icon = isVideo ? '🎬' : '🖼️';
            const size = this.formatFileSize(file.size);

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
            document.getElementById('uploadModal').style.display = 'none';

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
