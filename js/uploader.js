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

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        resolve(data);
                    } catch (e) {
                        reject(new Error('無法解析伺服器回應'));
                    }
                } else {
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        reject(new Error(errorData.error || `上傳失敗 (${xhr.status})`));
                    } catch (e) {
                        reject(new Error(`上傳失敗 (${xhr.status})`));
                    }
                }
            };

            xhr.onerror = () => {
                reject(new Error('網路錯誤，無法連線到伺服器'));
            };

            xhr.send(formData);
        });
    }
};

// 上傳 UI 控制器
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

        this.injectStyles();

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

    injectStyles() {
        const styleId = 'uploader-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .progress-container {
                    width: 100%;
                    height: 4px;
                    background-color: #eee;
                    margin-top: 5px;
                    border-radius: 2px;
                    overflow: hidden;
                    display: none; /* Hidden by default */
                }
                .progress-bar {
                    height: 100%;
                    background-color: #4CAF50;
                    width: 0%;
                    transition: width 0.2s;
                }
                .queue-item.uploading .progress-container {
                    display: block;
                }
            `;
            document.head.appendChild(style);
        }
    },

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
        if (item && bar) {
            item.classList.add('uploading');
            bar.style.width = `${percent}%`;
        }
    },

    async startUpload() {
        console.log('startUpload called');
        try {
            if (this.fileList.length === 0) {
                alert('請選擇要上傳的檔案');
                return;
            }

            const uploadBtn = document.getElementById('startUploadBtn');
            const originalText = uploadBtn.textContent;
            uploadBtn.disabled = true;
            uploadBtn.textContent = '準備中...';

            try {
                const albumSelect = document.getElementById('albumSelect');
                let albumId = albumSelect ? albumSelect.value : '';

                // Fallback to current child's album if dropdown is empty or default
                if (!albumId && typeof CONFIG !== 'undefined' && typeof TimelineState !== 'undefined') {
                    const currentChild = CONFIG.CHILDREN[TimelineState.currentChildIndex];
                    if (currentChild && currentChild.albumId) {
                        albumId = currentChild.albumId;
                        console.log('Using current child albumId:', albumId);
                    }
                }

                // P1: Add uploader to tags for attribution (fixed value)
                const uploaderInput = document.getElementById('uploaderValue');
                const uploader = uploaderInput ? uploaderInput.value : '爸爸';
                const uploaderTag = `uploader:${uploader}`;

                let successCount = 0;
                let failCount = 0;

                if (this.taggingMode === 'individual') {
                    // P1: Individual mode - upload each file with its own tags
                    for (let i = 0; i < this.fileList.length; i++) {
                        const file = this.fileList[i];
                        const tagInput = document.querySelector(`input[data-file-index="${i}"]`);
                        const fileTags = tagInput ? tagInput.value : '';
                        const tags = `${uploaderTag} ${fileTags}`.trim();

                        uploadBtn.textContent = `上傳中... (${i + 1}/${this.fileList.length})`;

                        try {
                            await Uploader.uploadFiles([file], {
                                albumId,
                                tags,
                                onProgress: (percent) => {
                                    this.updateProgress(i, percent);
                                    if (percent >= 100) {
                                        // 100% 後顯示處理中
                                        const info = document.querySelector(`#queue-item-${i} .queue-size`);
                                        if (info) info.textContent = '處理中...';
                                    }
                                }
                            });
                            successCount++;
                            // 完成後標記
                            const item = document.getElementById(`queue-item-${i}`);
                            if (item) item.style.opacity = '0.5';
                        } catch (error) {
                            console.error(`Failed to upload ${file.name}:`, error);
                            failCount++;
                            const info = document.querySelector(`#queue-item-${i} .queue-size`);
                            if (info) {
                                info.textContent = '失敗';
                                info.style.color = 'red';
                            }
                        }
                    }
                } else {
                    // Batch mode - all files use the same tags
                    const tagsInput = document.getElementById('tagsInput');
                    const batchTags = tagsInput ? tagsInput.value : '';
                    const tags = `${uploaderTag} ${batchTags}`.trim();

                    uploadBtn.textContent = '上傳中...';

                    // In batch mode, we update ALL progress bars simultaneously
                    const onBatchProgress = (percent) => {
                        this.fileList.forEach((_, idx) => {
                            this.updateProgress(idx, percent);
                            if (percent >= 100) {
                                const info = document.querySelector(`#queue-item-${idx} .queue-size`);
                                if (info) info.textContent = '處理中...';
                            }
                        });
                    };

                    const result = await Uploader.uploadFiles(this.fileList, {
                        albumId,
                        tags,
                        onProgress: onBatchProgress
                    });

                    successCount = result.results.filter(r => r.success).length;
                    failCount = result.results.length - successCount;
                }

                // 顯示結果
                alert(`上傳完成！\n成功：${successCount} 個\n失敗：${failCount} 個`);

                // 清空檔案列表
                this.fileList = [];
                this.renderFileList();
                this.hideUploadQueue();

                // 刷新頁面顯示新照片
                if (successCount > 0) {
                    setTimeout(() => location.reload(), 1500);
                }

            } catch (error) {
                console.error('Critical error in startUpload:', error);
                alert('系統錯誤：' + error.message);
            } finally {
                if (uploadBtn) {
                    uploadBtn.disabled = false;
                    uploadBtn.textContent = originalText;
                }
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
