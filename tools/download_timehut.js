/**
 * Timehut 照片批量下載腳本 (增強版)
 * 
 * 使用方法：
 * 1. 登入 Timehut 並進入時間軸頁面 https://www.timehut.us/index.html#/timeline
 * 2. 滾動頁面或使用右側年齡導航載入所有想要下載的照片
 * 3. 按 F12 打開開發者工具
 * 4. 複製這段程式碼貼到 Console 執行
 * 5. 腳本會自動生成 JSON 清單並提供下載選項
 */

(async function TimehutDownloader() {
    console.log('🚀 Timehut 照片下載器啟動...');

    // 配置
    const CONFIG = {
        DOWNLOAD_DELAY: 800,      // 下載間隔 (毫秒)
        MAX_BATCH_SIZE: 50,       // 每批下載數量
        SAVE_FOLDER: 'timehut_photos'
    };

    // 狀態
    const state = {
        photos: new Set(),
        videos: new Set(),
        downloaded: 0,
        errors: []
    };

    // 提取所有媒體 URL
    function extractMediaUrls() {
        // 從 img 標籤提取
        document.querySelectorAll('img').forEach(img => {
            const src = img.src;
            if (src && src.includes('peekaboocdn.com')) {
                if (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png')) {
                    state.photos.add(src);
                }
            }
        });

        // 從 video 標籤提取
        document.querySelectorAll('video').forEach(video => {
            const src = video.src;
            if (src && src.includes('peekaboocdn.com') && src.includes('.mp4')) {
                state.videos.add(src);
            }
        });

        // 從 background-image 提取
        document.querySelectorAll('[style*="background"]').forEach(el => {
            const style = el.getAttribute('style') || '';
            const match = style.match(/url\(['"]?([^'"]+peekaboocdn[^'"]+)['"]?\)/);
            if (match) state.photos.add(match[1]);
        });

        // 如果有全域變數（從之前的提取）
        if (window.EXTRACTED_PHOTOS) {
            window.EXTRACTED_PHOTOS.forEach(url => state.photos.add(url));
        }
        if (window.EXTRACTED_VIDEOS) {
            window.EXTRACTED_VIDEOS.forEach(url => state.videos.add(url));
        }
        if (window.ALL_EXTRACTED_URLS) {
            window.ALL_EXTRACTED_URLS.forEach(url => {
                if (url.includes('.mp4')) {
                    state.videos.add(url);
                } else if (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png')) {
                    state.photos.add(url);
                }
            });
        }
    }

    // 生成檔名
    function generateFilename(url, index, type) {
        const date = new Date().toISOString().split('T')[0];
        const ext = type === 'video' ? 'mp4' : 'jpg';
        return `timehut_${type}_${date}_${String(index).padStart(4, '0')}.${ext}`;
    }

    // 下載單個檔案
    async function downloadFile(url, filename) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);

            return true;
        } catch (error) {
            state.errors.push({ url, error: error.message });
            return false;
        }
    }

    // 顯示 UI
    function showUI() {
        // 移除舊 UI
        const oldUI = document.getElementById('timehut-downloader-ui');
        if (oldUI) oldUI.remove();

        const ui = document.createElement('div');
        ui.id = 'timehut-downloader-ui';
        ui.innerHTML = `
            <style>
                #timehut-downloader-ui {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    width: 350px;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                    z-index: 99999;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                #timehut-downloader-ui .header {
                    background: #FFEC00;
                    padding: 16px;
                    border-radius: 12px 12px 0 0;
                    font-weight: bold;
                    font-size: 16px;
                }
                #timehut-downloader-ui .content {
                    padding: 16px;
                }
                #timehut-downloader-ui .stats {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    margin-bottom: 16px;
                }
                #timehut-downloader-ui .stat-box {
                    background: #f5f5f5;
                    padding: 12px;
                    border-radius: 8px;
                    text-align: center;
                }
                #timehut-downloader-ui .stat-number {
                    font-size: 24px;
                    font-weight: bold;
                    color: #333;
                }
                #timehut-downloader-ui .stat-label {
                    font-size: 12px;
                    color: #666;
                }
                #timehut-downloader-ui button {
                    width: 100%;
                    padding: 12px;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: bold;
                    cursor: pointer;
                    margin-bottom: 8px;
                    transition: all 0.2s;
                }
                #timehut-downloader-ui .btn-primary {
                    background: #FFEC00;
                    color: #333;
                }
                #timehut-downloader-ui .btn-primary:hover {
                    background: #e6d400;
                }
                #timehut-downloader-ui .btn-secondary {
                    background: #e0e0e0;
                    color: #333;
                }
                #timehut-downloader-ui .progress {
                    height: 8px;
                    background: #e0e0e0;
                    border-radius: 4px;
                    margin: 12px 0;
                    overflow: hidden;
                }
                #timehut-downloader-ui .progress-bar {
                    height: 100%;
                    background: #4CAF50;
                    width: 0%;
                    transition: width 0.3s;
                }
                #timehut-downloader-ui .close-btn {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    background: none;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                    width: auto;
                    padding: 4px;
                }
            </style>
            <div class="header">
                📸 Timehut 下載器
                <button class="close-btn" onclick="this.closest('#timehut-downloader-ui').remove()">✕</button>
            </div>
            <div class="content">
                <div class="stats">
                    <div class="stat-box">
                        <div class="stat-number" id="photo-count">${state.photos.size}</div>
                        <div class="stat-label">照片</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-number" id="video-count">${state.videos.size}</div>
                        <div class="stat-label">影片</div>
                    </div>
                </div>
                <div class="progress" style="display: none;" id="progress-container">
                    <div class="progress-bar" id="progress-bar"></div>
                </div>
                <div id="status-text" style="text-align: center; margin-bottom: 12px; color: #666;"></div>
                <button class="btn-primary" id="btn-export-json">📋 匯出 URL 清單 (JSON)</button>
                <button class="btn-primary" id="btn-download-photos">⬇️ 下載前 ${Math.min(10, state.photos.size)} 張照片</button>
                <button class="btn-secondary" id="btn-rescan">🔄 重新掃描頁面</button>
            </div>
        `;
        document.body.appendChild(ui);

        // 綁定事件
        document.getElementById('btn-export-json').onclick = exportJSON;
        document.getElementById('btn-download-photos').onclick = () => downloadBatch(10);
        document.getElementById('btn-rescan').onclick = () => {
            extractMediaUrls();
            document.getElementById('photo-count').textContent = state.photos.size;
            document.getElementById('video-count').textContent = state.videos.size;
            document.getElementById('status-text').textContent = '✅ 掃描完成！';
        };
    }

    // 匯出 JSON
    function exportJSON() {
        const data = {
            exportDate: new Date().toISOString(),
            totalPhotos: state.photos.size,
            totalVideos: state.videos.size,
            photos: Array.from(state.photos),
            videos: Array.from(state.videos)
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `timehut_export_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        document.getElementById('status-text').textContent = '✅ JSON 已下載！';
    }

    // 批量下載
    async function downloadBatch(count) {
        const progressContainer = document.getElementById('progress-container');
        const progressBar = document.getElementById('progress-bar');
        const statusText = document.getElementById('status-text');

        progressContainer.style.display = 'block';

        const photos = Array.from(state.photos).slice(0, count);

        for (let i = 0; i < photos.length; i++) {
            const url = photos[i];
            const filename = generateFilename(url, i + 1, 'photo');

            statusText.textContent = `下載中 ${i + 1}/${photos.length}: ${filename}`;
            progressBar.style.width = `${((i + 1) / photos.length) * 100}%`;

            const success = await downloadFile(url, filename);
            if (success) {
                state.downloaded++;
            }

            await new Promise(resolve => setTimeout(resolve, CONFIG.DOWNLOAD_DELAY));
        }

        statusText.textContent = `✅ 完成！已下載 ${state.downloaded} 張照片`;

        if (state.errors.length > 0) {
            console.warn('下載失敗的檔案:', state.errors);
        }
    }

    // 執行
    extractMediaUrls();
    showUI();

    console.log(`📸 找到 ${state.photos.size} 張照片`);
    console.log(`🎥 找到 ${state.videos.size} 個影片`);

    return {
        photos: Array.from(state.photos),
        videos: Array.from(state.videos),
        downloadBatch,
        exportJSON
    };
})();
