/**
 * 黃家小屋 - 時間軸邏輯
 * Timeline logic for Timehut Clone
 */

// Global state
const TimelineState = {
    currentChildIndex: 0,
    photos: [],
    groupedPhotos: [],
    currentPage: 1,
    totalPages: 1,
    isLoading: false,
    currentModalIndex: 0,
    allPhotosFlat: []
};

// Selection state for batch operations
const SelectionState = {
    isSelectMode: false,
    selectedPhotos: new Set()
};

/**
 * 初始化時間軸頁面
 */
/**
 * 初始化時間軸頁面
 */
async function initTimeline() {
    // Check for URL params (e.g. tag filter)
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const tagName = urlParams.get('tag_name');
    const q = urlParams.get('q');

    // Get selected child from session storage
    const selectedChild = sessionStorage.getItem('selectedChild');
    TimelineState.currentChildIndex = selectedChild !== null ? parseInt(selectedChild, 10) : 0;

    // Update UI with selected child
    updateChildDisplay();

    // Setup event listeners
    setupEventListeners();

    // Load initial data
    if (tagName) {
        // Switch to search mode for tag
        document.getElementById('searchInput').value = tagName;
        await handleSearch({ target: { value: tagName } }, true);
    } else if (q) {
        document.getElementById('searchInput').value = q;
        await handleSearch({ target: { value: q } }, true);
    } else {
        await loadPhotos();
    }
}

/**
 * 更新目前選擇的小孩顯示
 */
function updateChildDisplay() {
    const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];

    // Update header
    document.getElementById('currentChildName').textContent = child.name;

    // Calculate current age
    const age = calculateAge(child.birthDate, new Date());
    document.getElementById('currentChildAge').textContent = formatAgeString(age.years, age.months, age.days);

    // Update sidebar buttons
    document.querySelectorAll('.profile-btn').forEach((btn, index) => {
        btn.classList.toggle('active', index === TimelineState.currentChildIndex);
    });

    // Build age navigation
    buildAgeNavigation(child.birthDate);
}

/**
 * 設置事件監聽器
 */
function setupEventListeners() {
    // Child profile buttons
    document.querySelectorAll('.profile-btn').forEach((btn, index) => {
        btn.addEventListener('click', () => switchChild(index));
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 500));
    }

    // Keyboard navigation for modal
    document.addEventListener('keydown', handleKeyboard);

    // Selection mode buttons
    const selectModeBtn = document.getElementById('selectModeBtn');
    if (selectModeBtn) {
        selectModeBtn.addEventListener('click', toggleSelectMode);
    }

    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', deleteSelectedPhotos);
    }

    const cancelSelectBtn = document.getElementById('cancelSelectBtn');
    if (cancelSelectBtn) {
        cancelSelectBtn.addEventListener('click', () => {
            SelectionState.selectedPhotos.clear();
            toggleSelectMode();
        });
    }

    // Infinite scroll (optional)
    // window.addEventListener('scroll', throttle(handleScroll, 200));
}

/**
 * 切換小孩
 * @param {number} index - 小孩索引
 */
async function switchChild(index) {
    if (index === TimelineState.currentChildIndex) return;

    TimelineState.currentChildIndex = index;
    TimelineState.currentPage = 1;
    TimelineState.photos = [];
    TimelineState.groupedPhotos = [];

    sessionStorage.setItem('selectedChild', index);

    updateChildDisplay();
    await loadPhotos();
}

/**
 * 載入照片
 */
async function loadPhotos() {
    const loadingEl = document.getElementById('loadingIndicator');
    const emptyEl = document.getElementById('emptyState');
    const containerEl = document.getElementById('timelineContainer');

    if (TimelineState.isLoading) return;
    TimelineState.isLoading = true;

    // Show loading, hide empty state
    loadingEl.style.display = 'block';
    emptyEl.style.display = 'none';

    // Clear existing photos if first page
    if (TimelineState.currentPage === 1) {
        // Remove photo cards but keep loading/empty elements
        Array.from(containerEl.children).forEach(child => {
            if (!child.id?.includes('loading') && !child.id?.includes('empty') && !child.classList.contains('age-group-header')) {
                child.remove();
            }
        });
        const headers = containerEl.querySelectorAll('.age-group-header');
        headers.forEach(h => h.remove());
    }

    try {
        const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];
        let result;

        if (child.albumId) {
            // Load from specific album
            result = await FlickrAPI.getAlbumPhotos(child.albumId, TimelineState.currentPage);
        } else {
            // Load public photos
            result = await FlickrAPI.getPublicPhotos(TimelineState.currentPage);
        }

        TimelineState.photos = [...TimelineState.photos, ...result.photos];
        TimelineState.totalPages = result.pages;

        // Hide loading
        loadingEl.style.display = 'none';

        if (TimelineState.photos.length === 0) {
            // Show empty state
            emptyEl.style.display = 'block';
        } else {
            // P0: Calculate photo batches
            TimelineState.photoBatches = calculatePhotoBatches(TimelineState.photos);

            // Group photos by age and render
            TimelineState.groupedPhotos = groupPhotosByAge(TimelineState.photos, child.birthDate);
            renderTimeline();
            updateAgeNavCounts();
        }

    } catch (error) {
        console.error('Error loading photos:', error);
        loadingEl.style.display = 'none';

        // Show error message
        const errorEl = document.createElement('div');
        errorEl.className = 'empty-state';
        errorEl.innerHTML = `
            <div class="empty-icon">⚠️</div>
            <h3>載入失敗</h3>
            <p>${error.message || '無法連接到 Flickr'}</p>
            <button class="upload-btn" onclick="loadPhotos()">重試</button>
        `;
        containerEl.appendChild(errorEl);
    }

    TimelineState.isLoading = false;
}

/**
 * 渲染時間軸
 */
function renderTimeline() {
    const containerEl = document.getElementById('timelineContainer');

    // Build flat array for modal navigation
    TimelineState.allPhotosFlat = [];

    TimelineState.groupedPhotos.forEach(group => {
        // Add age group header
        let headerEl = document.getElementById(`age-${group.sortKey}`);
        if (!headerEl) {
            headerEl = document.createElement('div');
            headerEl.className = 'age-group-header';
            headerEl.id = `age-${group.sortKey}`;
            headerEl.innerHTML = `
                <div class="age-group-line"></div>
                <span class="age-group-label">${group.label}</span>
                <div class="age-group-line"></div>
            `;
            containerEl.insertBefore(headerEl, containerEl.querySelector('#loadingIndicator'));
        }

        // Add photo cards
        group.photos.forEach((photo, photoIndex) => {
            TimelineState.allPhotosFlat.push(photo);
            const flatIndex = TimelineState.allPhotosFlat.length - 1;

            const cardEl = createPhotoCard(photo, flatIndex);
            containerEl.insertBefore(cardEl, containerEl.querySelector('#loadingIndicator'));
        });
    });
}

/**
 * 建立照片卡片
 * @param {Object} photo - 照片物件
 * @param {number} index - 全域索引
 * @returns {HTMLElement} 照片卡片元素
 */
function createPhotoCard(photo, index) {
    const card = document.createElement('article');
    card.className = 'photo-card';
    card.dataset.id = photo.id; // Add data-id for selection

    card.onclick = (e) => {
        // Don't open modal if clicking on a tag or batch badge
        if (e.target.classList.contains('photo-tag') ||
            e.target.classList.contains('photo-batch-badge')) return;

        // Handle selection mode
        if (SelectionState.isSelectMode) {
            togglePhotoSelection(photo.id);
            return;
        }

        openModal(index);
    };

    const imgUrl = FlickrAPI.getPhotoUrl(photo, 'm');
    const title = photo.title || '未命名';
    const date = formatDate(photo.datetaken || photo.dateupload);

    // P1: Extract uploader from tags
    const allTags = photo.tags ? photo.tags.split(' ').filter(t => t) : [];
    const uploaderTag = allTags.find(t => t.startsWith('uploader:'));
    const uploader = uploaderTag ? uploaderTag.replace('uploader:', '') : null;
    const uploaderEmoji = getUploaderEmoji(uploader);

    // P0: Check for photo batch
    let batchHtml = '';
    const batchInfo = TimelineState.photoBatches ? TimelineState.photoBatches.get(photo.id) : null;
    if (batchInfo && batchInfo.batchSize > 1 && batchInfo.batchPhotoIds[0] === photo.id) {
        batchHtml = `<span class="photo-batch-badge" onclick="openBatchView(TimelineState.photoBatches.get('${photo.id}'))">進入相集 (${batchInfo.batchSize})</span>`;
    }

    // Process tags (P1: Display tags on cards, excluding uploader tag)
    const displayTags = allTags.filter(t => !t.startsWith('uploader:')).slice(0, 3);
    const tagsHtml = displayTags.map(tag =>
        `<span class="photo-tag" onclick="filterByTag('${tag}')">#${tag}</span>`
    ).join('');

    card.innerHTML = `
        <div class="photo-wrapper">
            <img src="${imgUrl}" alt="${title}" loading="lazy">
            ${uploader ? `<span class="photo-uploader" title="${uploader}上傳">${uploaderEmoji}</span>` : ''}
            ${batchHtml}
        </div>
        <div class="photo-info">
            <h3 class="photo-title">${title}</h3>
            <div class="photo-meta">
                <span class="photo-date">${date}</span>
                <span class="photo-age">${photo.ageString}</span>
            </div>
            ${tagsHtml ? `<div class="photo-tags">${tagsHtml}</div>` : ''}
        </div>
    `;

    return card;
}

/**
 * 取得上傳者的 Emoji
 * @param {string} uploader - 上傳者名稱
 * @returns {string} Emoji
 */
function getUploaderEmoji(uploader) {
    const emojiMap = {
        '爸爸': '👨',
        '媽媽': '👩',
        '爺爺': '👴',
        '奶奶': '👵',
        '外公': '👴',
        '外婆': '👵',
        '其他': '👤'
    };
    return emojiMap[uploader] || '👤';
}

/**
 * 依標籤過濾
 * @param {string} tag - 標籤名稱
 */
async function filterByTag(tag) {
    const searchInput = document.getElementById('searchInput');
    searchInput.value = tag;
    await handleSearch({ target: { value: tag } }, true);

    // Update URL without reloading
    const newUrl = `${window.location.pathname}#/timeline/tagDetail?tag_name=${encodeURIComponent(tag)}`;
    history.pushState({ path: newUrl }, '', newUrl);
}

/**
 * 建立年齡導航
 * @param {string} birthDate - 出生日期
 */
function buildAgeNavigation(birthDate) {
    const ageListEl = document.getElementById('ageList');
    const navItems = generateAgeNavigation(birthDate);

    ageListEl.innerHTML = navItems.map((item, index) => `
        <div class="age-item ${index === 0 ? 'active' : ''}" 
             data-age="${item.value}" 
             onclick="scrollToAge(${item.value})">
            <span class="age-dot"></span>
            <span class="age-label">${item.label}</span>
            <span class="age-count" id="age-count-${item.value}">0</span>
        </div>
    `).join('');
}

/**
 * 更新年齡導航的照片數量
 */
function updateAgeNavCounts() {
    TimelineState.groupedPhotos.forEach(group => {
        // Extract years from sortKey
        const years = Math.floor(group.sortKey / 100);
        const countEl = document.getElementById(`age-count-${years}`);
        if (countEl) {
            const currentCount = parseInt(countEl.textContent, 10) || 0;
            countEl.textContent = currentCount + group.photos.length;
        }
    });
}

/**
 * 滾動到指定年齡
 * @param {number} years - 年齡（年）
 */
function scrollToAge(years) {
    // Find the closest matching age group
    const targetSortKey = years * 100;
    let closestGroup = TimelineState.groupedPhotos[0];
    let closestDiff = Infinity;

    TimelineState.groupedPhotos.forEach(group => {
        const diff = Math.abs(group.sortKey - targetSortKey);
        if (diff < closestDiff) {
            closestDiff = diff;
            closestGroup = group;
        }
    });

    if (closestGroup) {
        const headerEl = document.getElementById(`age-${closestGroup.sortKey}`);
        if (headerEl) {
            headerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // Update active state
    document.querySelectorAll('.age-item').forEach(item => {
        item.classList.toggle('active', parseInt(item.dataset.age, 10) === years);
    });
}

/**
 * 打開照片 Modal
 * @param {number} index - 照片索引
 */
function openModal(index) {
    TimelineState.currentModalIndex = index;
    const photo = TimelineState.allPhotosFlat[index];

    if (!photo) return;

    const modal = document.getElementById('photoModal');
    const modalImg = document.getElementById('modalImage');
    const modalTitle = document.getElementById('modalTitle');
    const modalDate = document.getElementById('modalDate');
    const modalAge = document.getElementById('modalAge');

    // Use larger image for modal
    modalImg.src = FlickrAPI.getPhotoUrl(photo, 'l') || FlickrAPI.getPhotoUrl(photo, 'm');
    modalImg.alt = photo.title || '照片';

    modalTitle.textContent = photo.title || '未命名';
    modalDate.textContent = formatDate(photo.datetaken || photo.dateupload);
    modalAge.textContent = photo.ageString;

    // P1: Extract and display uploader
    const allTags = photo.tags ? photo.tags.split(' ').filter(t => t) : [];
    const uploaderTag = allTags.find(t => t.startsWith('uploader:'));
    const uploader = uploaderTag ? uploaderTag.replace('uploader:', '') : null;

    const modalUploader = document.getElementById('modalUploader');
    if (modalUploader) {
        if (uploader) {
            modalUploader.textContent = `${getUploaderEmoji(uploader)} ${uploader}上傳`;
            modalUploader.style.display = 'inline';
        } else {
            modalUploader.style.display = 'none';
        }
    }

    // P0: Populate tag editing input (excluding uploader tag)
    const displayTags = allTags.filter(t => !t.startsWith('uploader:')).join(' ');
    const editTagsInput = document.getElementById('editTagsInput');
    if (editTagsInput) {
        editTagsInput.value = displayTags;
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * 關閉 Modal
 */
function closeModal() {
    const modal = document.getElementById('photoModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

/**
 * 導航照片（上一張/下一張）
 * @param {number} direction - 方向 (-1: 上一張, 1: 下一張)
 */
function navigatePhoto(direction) {
    const newIndex = TimelineState.currentModalIndex + direction;

    if (newIndex >= 0 && newIndex < TimelineState.allPhotosFlat.length) {
        openModal(newIndex);
    }
}

/**
 * 處理鍵盤事件
 * @param {KeyboardEvent} event - 鍵盤事件
 */
function handleKeyboard(event) {
    const modal = document.getElementById('photoModal');

    if (!modal.classList.contains('active')) return;

    switch (event.key) {
        case 'Escape':
            closeModal();
            break;
        case 'ArrowLeft':
            navigatePhoto(-1);
            break;
        case 'ArrowRight':
            navigatePhoto(1);
            break;
    }
}

/**
 * 處理搜尋（含標籤）
 * @param {Event} event - 輸入事件
 */
async function handleSearch(event) {
    const query = event.target.value.trim();

    if (!query) {
        // Reset to normal view
        TimelineState.currentPage = 1;
        TimelineState.photos = [];
        await loadPhotos();
        return;
    }

    const loadingEl = document.getElementById('loadingIndicator');
    const containerEl = document.getElementById('timelineContainer');
    const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];

    // Show loading
    loadingEl.style.display = 'block';

    // Clear existing photos
    Array.from(containerEl.children).forEach(child => {
        if (!child.id?.includes('loading') && !child.id?.includes('empty')) {
            child.remove();
        }
    });

    try {
        // First, try to filter locally loaded photos (instant results)
        let filteredPhotos = [];

        if (TimelineState.photos.length > 0) {
            filteredPhotos = FlickrAPI.filterPhotosLocally(TimelineState.photos, query);
        }

        // If local filter found results, show them
        if (filteredPhotos.length > 0) {
            TimelineState.groupedPhotos = groupPhotosByAge(filteredPhotos, child.birthDate);
            loadingEl.style.display = 'none';
            renderTimeline();
            return;
        }

        // Fallback to API search for broader results
        const result = await FlickrAPI.searchPhotos(query);

        if (result.photos.length === 0) {
            loadingEl.style.display = 'none';
            document.getElementById('emptyState').style.display = 'block';
            document.querySelector('#emptyState h3').textContent = '找不到照片';
            document.querySelector('#emptyState p').textContent = `沒有符合「${query}」的照片`;
        } else {
            TimelineState.photos = result.photos;
            TimelineState.groupedPhotos = groupPhotosByAge(result.photos, child.birthDate);
            loadingEl.style.display = 'none';
            renderTimeline();
        }

    } catch (error) {
        console.error('Search error:', error);
        loadingEl.style.display = 'none';
    }
}

// =====================================================
// BATCH DELETE / SELECTION MODE FUNCTIONS
// =====================================================

/**
 * 切換選擇模式
 */
function toggleSelectMode() {
    SelectionState.isSelectMode = !SelectionState.isSelectMode;
    document.body.classList.toggle('select-mode', SelectionState.isSelectMode);
    document.getElementById('selectionBar').classList.toggle('hidden', !SelectionState.isSelectMode);

    if (!SelectionState.isSelectMode) {
        // Clear selections when exiting select mode
        SelectionState.selectedPhotos.clear();
        document.querySelectorAll('.photo-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
    }

    updateSelectionUI();
}

/**
 * 切換照片選擇狀態
 * @param {string} photoId - 照片 ID
 */
function togglePhotoSelection(photoId) {
    if (!SelectionState.isSelectMode) return;

    if (SelectionState.selectedPhotos.has(photoId)) {
        SelectionState.selectedPhotos.delete(photoId);
    } else {
        SelectionState.selectedPhotos.add(photoId);
    }

    // Update card visual
    const card = document.querySelector(`.photo-card[data-id="${photoId}"]`);
    if (card) {
        card.classList.toggle('selected', SelectionState.selectedPhotos.has(photoId));
    }

    updateSelectionUI();
}

/**
 * 更新選擇狀態 UI
 */
function updateSelectionUI() {
    const count = SelectionState.selectedPhotos.size;
    document.getElementById('selectedCount').textContent = count;

    // Disable delete button if nothing selected
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    if (deleteBtn) {
        deleteBtn.disabled = count === 0;
        deleteBtn.style.opacity = count === 0 ? '0.5' : '1';
    }
}

/**
 * 刪除選取的照片
 */
async function deleteSelectedPhotos() {
    console.log('[DELETE] deleteSelectedPhotos called');
    const count = SelectionState.selectedPhotos.size;

    if (count === 0) {
        alert('請先選擇要刪除的照片');
        return;
    }

    if (!confirm(`確定要刪除 ${count} 張照片嗎？\n\n⚠️ 此操作無法復原！`)) {
        return;
    }

    const photoIds = Array.from(SelectionState.selectedPhotos);
    console.log('[DELETE] Deleting IDs:', photoIds);

    const deleteBtn = document.getElementById('deleteSelectedBtn');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = '刪除中...';
    }

    try {
        const response = await fetch(`${CONFIG.UPLOAD_API_URL}/api/photos/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds })
        });

        const result = await response.json();

        if (response.ok) {
            const successCount = result.results?.filter(r => r.success).length || 0;
            alert(`刪除完成！\n成功：${successCount} 張\n失敗：${count - successCount} 張`);

            // Exit select mode and reload photos
            SelectionState.selectedPhotos.clear();
            toggleSelectMode();
            await loadPhotos();
        } else {
            alert(`刪除失敗：${result.error}`);
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('刪除時發生錯誤，請稍後再試');
    } finally {
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = '🗑️ 刪除選取';
        }
        updateSelectionUI();
    }
}

// Make selection functions globally available
// Make selection functions globally available
window.togglePhotoSelection = togglePhotoSelection;
window.deleteSelectedPhotos = deleteSelectedPhotos;

/**
 * 批量下載照片 (P1)
 */
async function batchDownload() {
    const count = SelectionState.selectedPhotos.size;
    if (count === 0) return alert('請先選擇照片');

    const btn = document.getElementById('batchDownloadBtn');
    if (!confirm(`確定要下載 ${count} 張照片嗎？`)) return;

    btn.disabled = true;
    btn.textContent = '📦 打包中...';

    try {
        const zip = new JSZip();
        const photos = Array.from(SelectionState.selectedPhotos).map(id =>
            TimelineState.allPhotosFlat.find(p => p.id === id)
        ).filter(p => p);

        let processed = 0;

        // Parallel fetching with limit could be better, but sequential for simplicity
        for (const photo of photos) {
            const url = FlickrAPI.getPhotoUrl(photo, 'b'); // Large size
            const filename = `${photo.title || photo.id}.jpg`;

            // Use backend proxy to avoid CORS
            const proxyUrl = `${CONFIG.UPLOAD_API_URL}/api/proxy-image?url=${encodeURIComponent(url)}`;

            try {
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error('Fetch failed');
                const blob = await response.blob();
                zip.file(filename, blob);
                processed++;
                btn.textContent = `📦 ${processed}/${count}`;
            } catch (e) {
                console.error(`Failed to download ${filename}`, e);
            }
        }

        btn.textContent = '💾 產生 ZIP...';
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `timehut_photos_${new Date().toISOString().slice(0, 10)}.zip`);

    } catch (error) {
        console.error('Batch download error:', error);
        alert('下載失敗，請稍後再試');
    } finally {
        btn.disabled = false;
        btn.textContent = '⬇️ 下載';
    }
}
window.batchDownload = batchDownload;

/**
 * 批量加標籤 (P1)
 */
async function batchAddTags() {
    const count = SelectionState.selectedPhotos.size;
    if (count === 0) return alert('請先選擇照片');

    const tags = prompt(`為 ${count} 張照片增加標籤 (以空格分隔):`);
    if (!tags) return;

    const photoIds = Array.from(SelectionState.selectedPhotos);
    const btn = document.getElementById('batchTagBtn');
    btn.disabled = true;
    btn.textContent = '處理中...';

    try {
        const response = await fetch(`${CONFIG.UPLOAD_API_URL}/api/photos/tags/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds, tags })
        });
        const result = await response.json();
        alert(result.message);

        // Reload to update UI
        SelectionState.selectedPhotos.clear();
        toggleSelectMode();
        loadPhotos();
    } catch (error) {
        alert('加標籤失敗: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '🏷️ 加標籤';
    }
}
window.batchAddTags = batchAddTags;

/**
 * 批量加入相簿 (P1)
 */
async function batchAddToAlbum() {
    const count = SelectionState.selectedPhotos.size;
    if (count === 0) return alert('請先選擇照片');

    // Simple prompts for selection
    let albumList = "請輸入目標相簿 ID 或選擇:\n";
    CONFIG.CHILDREN.forEach((child, index) => {
        albumList += `${index + 1}. ${child.name} (${child.emoji})\n`;
    });

    const input = prompt(albumList);
    if (!input) return;

    let albumId = input.trim();
    // Check if user entered encoded index (1, 2)
    const index = parseInt(input) - 1;
    if (!isNaN(index) && CONFIG.CHILDREN[index]) {
        albumId = CONFIG.CHILDREN[index].albumId;
    }

    if (!albumId) return alert('無效的相簿 ID');

    const photoIds = Array.from(SelectionState.selectedPhotos);
    const btn = document.getElementById('batchAlbumBtn');
    btn.disabled = true;
    btn.textContent = '處理中...';

    try {
        const response = await fetch(`${CONFIG.UPLOAD_API_URL}/api/album/${albumId}/add_photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds })
        });
        const result = await response.json();
        alert(result.message);

        SelectionState.selectedPhotos.clear();
        toggleSelectMode();
    } catch (error) {
        alert('加入相簿失敗: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '📁 加入相簿';
    }
}
window.batchAddToAlbum = batchAddToAlbum;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initTimeline);

// Make functions globally available for onclick handlers
window.closeModal = closeModal;
window.navigatePhoto = navigatePhoto;
window.scrollToAge = scrollToAge;

// =====================================================
// P0: TAG EDITING FUNCTION
// =====================================================

/**
 * 儲存照片標籤
 */
async function savePhotoTags() {
    const photo = TimelineState.allPhotosFlat[TimelineState.currentModalIndex];
    if (!photo) return;

    const editTagsInput = document.getElementById('editTagsInput');
    const newTags = editTagsInput ? editTagsInput.value.trim() : '';

    // Get existing uploader tag to preserve it
    const existingTags = photo.tags ? photo.tags.split(' ').filter(t => t) : [];
    const uploaderTag = existingTags.find(t => t.startsWith('uploader:'));

    // Combine uploader tag with new user tags
    const finalTags = uploaderTag ? `${uploaderTag} ${newTags}` : newTags;

    const saveBtn = document.querySelector('.save-tags-btn');
    const originalEmoji = saveBtn ? saveBtn.textContent : '💾';

    try {
        if (saveBtn) saveBtn.textContent = '⏳';

        const response = await fetch(`${CONFIG.UPLOAD_API_URL}/api/photo/${photo.id}/tags`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: finalTags })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // Update local photo object
            photo.tags = finalTags;
            if (saveBtn) saveBtn.textContent = '✅';
            setTimeout(() => { if (saveBtn) saveBtn.textContent = originalEmoji; }, 1500);
        } else {
            throw new Error(result.error || '儲存失敗');
        }
    } catch (error) {
        console.error('Save tags error:', error);
        alert('儲存標籤失敗：' + error.message);
        if (saveBtn) saveBtn.textContent = originalEmoji;
    }
}

// Make savePhotoTags globally available
window.savePhotoTags = savePhotoTags;

// =====================================================
// P0: PHOTO BATCH GROUPING (進入相集)
// =====================================================

/**
 * 計算照片的批次分組
 * 條件：同一上傳者 + 上傳時間間隔不超過 30 分鐘
 */
function calculatePhotoBatches(photos) {
    if (!photos || photos.length === 0) return new Map();

    // Sort by upload time descending
    const sortedPhotos = [...photos].sort((a, b) => {
        const timeA = parseInt(a.dateupload, 10) || 0;
        const timeB = parseInt(b.dateupload, 10) || 0;
        return timeB - timeA;
    });

    const batches = new Map(); // photoId -> batchId
    let currentBatchId = 0;
    let batchPhotos = []; // Track photos in each batch for size calculation

    sortedPhotos.forEach((photo, idx) => {
        const uploader = extractUploader(photo);
        const uploadTime = parseInt(photo.dateupload, 10) * 1000;

        if (idx === 0) {
            // First photo starts a new batch
            currentBatchId++;
            batchPhotos[currentBatchId] = [photo.id];
            batches.set(photo.id, { batchId: currentBatchId, uploader, time: uploadTime });
        } else {
            const prevPhoto = sortedPhotos[idx - 1];
            const prevBatch = batches.get(prevPhoto.id);
            const prevUploader = extractUploader(prevPhoto);
            const prevTime = parseInt(prevPhoto.dateupload, 10) * 1000;
            const timeDiff = Math.abs(uploadTime - prevTime) / 60000; // in minutes

            if (uploader === prevUploader && timeDiff <= 30) {
                // Same batch
                batches.set(photo.id, { batchId: prevBatch.batchId, uploader, time: uploadTime });
                batchPhotos[prevBatch.batchId].push(photo.id);
            } else {
                // New batch
                currentBatchId++;
                batchPhotos[currentBatchId] = [photo.id];
                batches.set(photo.id, { batchId: currentBatchId, uploader, time: uploadTime });
            }
        }
    });

    // Add batch size info
    batches.forEach((value, key) => {
        value.batchSize = batchPhotos[value.batchId].length;
        value.batchPhotoIds = batchPhotos[value.batchId];
    });

    return batches;
}

/**
 * 從照片標籤中提取上傳者
 */
function extractUploader(photo) {
    const tags = photo.tags ? photo.tags.split(' ').filter(t => t) : [];
    const uploaderTag = tags.find(t => t.startsWith('uploader:'));
    return uploaderTag ? uploaderTag.replace('uploader:', '') : 'unknown';
}

/**
 * 顯示批次相集視圖
 */
function openBatchView(batchInfo) {
    const photos = batchInfo.batchPhotoIds.map(id =>
        TimelineState.allPhotosFlat.find(p => p.id === id)
    ).filter(p => p);

    if (photos.length === 0) return;

    // Create batch view modal (simplified - shows photos in a gallery)
    const batchModal = document.createElement('div');
    batchModal.className = 'batch-view-modal';
    batchModal.innerHTML = `
        <div class="batch-view-overlay" onclick="closeBatchView()"></div>
        <div class="batch-view-content">
            <button class="batch-view-close" onclick="closeBatchView()">✕</button>
            <h3>📷 ${batchInfo.uploader}的相集 (${photos.length}張)</h3>
            <div class="batch-gallery">
                ${photos.map((p, idx) => `
                    <img src="${FlickrAPI.getPhotoUrl(p, 'm')}" 
                         alt="${p.title || ''}" 
                         onclick="closeBatchView(); openModal(${TimelineState.allPhotosFlat.indexOf(p)})">
                `).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(batchModal);
    document.body.style.overflow = 'hidden';
}

function closeBatchView() {
    const modal = document.querySelector('.batch-view-modal');
    if (modal) modal.remove();
    document.body.style.overflow = '';
}

window.openBatchView = openBatchView;
window.closeBatchView = closeBatchView;

// =====================================================
// UPLOAD MODAL FUNCTIONS
// =====================================================

// Upload state
const UploadState = {
    files: [],
    isUploading: false
};

/**
 * 打開上傳 Modal
 */
async function openUploadModal() {
    const modal = document.getElementById('uploadModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Initialize uploader and load albums
    if (window.UploadUI) {
        await window.UploadUI.checkAndPrepare();

        // Auto-select current child's album
        const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];
        const albumSelect = document.getElementById('albumSelect');
        if (albumSelect && child.albumId) {
            // Wait a tick to ensure options are rendered
            setTimeout(() => {
                albumSelect.value = child.albumId;
            }, 0);
        }
    }

    // Update album upload link based on current child
    updateAlbumUploadLink();

    // Setup dropzone events
    setupDropzone();
}

/**
 * 關閉上傳 Modal
 */
function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';

    // Clear upload queue
    clearUploadQueue();
}

/**
 * 更新相簿上傳連結
 */
function updateAlbumUploadLink() {
    const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];
    const albumLink = document.getElementById('albumUploadLink');

    if (child.albumId) {
        // Link to specific album
        albumLink.href = `https://www.flickr.com/photos/${CONFIG.FLICKR_USER_ID}/albums/${child.albumId}`;
        albumLink.textContent = `前往 ${child.name} 相簿`;
    } else {
        // Link to general upload
        albumLink.href = `https://www.flickr.com/photos/${CONFIG.FLICKR_USER_ID}/`;
        albumLink.textContent = '前往 Flickr 相簿';
    }
}

/**
 * 設置拖放區域
 */
function setupDropzone() {
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('fileInput');

    // Click to select files
    dropzone.onclick = () => fileInput.click();

    // Drag events
    dropzone.ondragover = (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    };

    dropzone.ondragleave = () => {
        dropzone.classList.remove('dragover');
    };

    dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    };

    // File input change
    fileInput.onchange = (e) => {
        handleFiles(e.target.files);
    };
}

/**
 * 處理選擇的檔案
 * @param {FileList} files - 檔案列表
 */
function handleFiles(files) {
    const validFiles = Array.from(files).filter(file =>
        file.type.startsWith('image/')
    );

    if (validFiles.length === 0) {
        alert('請選擇圖片檔案');
        return;
    }

    UploadState.files = [...UploadState.files, ...validFiles];
    renderUploadQueue();
}

/**
 * 渲染上傳佇列
 */
function renderUploadQueue() {
    const queueContainer = document.getElementById('uploadQueue');
    const queueList = document.getElementById('queueList');

    if (UploadState.files.length === 0) {
        queueContainer.style.display = 'none';
        return;
    }

    queueContainer.style.display = 'block';
    queueList.innerHTML = '';

    UploadState.files.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'queue-item';

        // Create thumbnail
        const img = document.createElement('img');
        img.className = 'queue-thumbnail';
        img.src = URL.createObjectURL(file);

        item.innerHTML = `
            <span class="queue-filename">${file.name}</span>
            <button class="queue-remove" onclick="removeFromQueue(${index})">✕</button>
        `;
        item.prepend(img);

        queueList.appendChild(item);
    });
}

/**
 * 從佇列移除檔案
 * @param {number} index - 檔案索引
 */
function removeFromQueue(index) {
    UploadState.files.splice(index, 1);
    renderUploadQueue();
}

/**
 * 清空上傳佇列
 */
function clearUploadQueue() {
    UploadState.files = [];
    renderUploadQueue();

    // Reset file input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
}

/**
 * 開始上傳 - 由於 Flickr 需要 OAuth，這裡引導用戶到 Flickr
 */
function startUpload() {
    if (UploadState.files.length === 0) return;

    // Since we can't directly upload to Flickr without OAuth,
    // we'll show a message and open Flickr upload page
    const message = `您選擇了 ${UploadState.files.length} 張照片。\n\n由於安全限制，需要在 Flickr 網站上傳照片。\n\n提示：您可以在 Flickr 上傳頁面選擇相同的照片進行上傳。`;

    if (confirm(message)) {
        window.open('https://www.flickr.com/photos/upload/', '_blank');
        closeUploadModal();
    }
}

// Make upload functions globally available
window.openUploadModal = openUploadModal;
window.closeUploadModal = closeUploadModal;
window.clearUploadQueue = clearUploadQueue;
window.startUpload = startUpload;
window.removeFromQueue = removeFromQueue;
