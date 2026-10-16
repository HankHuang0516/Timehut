/**
 * 黃家小屋 - 時間軸邏輯
 * Timeline logic for Timehut Clone
 */

// Global state
const TimelineState = {
    currentChildIndex: parseInt((window.TimehutStorage?.local || localStorage).getItem('timehut_current_child') || '0'),
    photos: [],
    groupedPhotos: [],
    currentPage: 1,
    totalPages: 1,
    isLoading: false,
    loadRequestId: 0,
    currentModalIndex: 0,
    allPhotosFlat: [],
    momentData: new Map(), // Store moment data for album navigation
    SCROLL_POSITION_KEY: 'timehut_timeline_scroll_position'
};

// Selection state for batch operations
const SelectionState = {
    isSelectMode: false,
    selectedPhotos: new Set(),
    revision: 0,
    signature: '',
    downloadBusy: false
};

// Moment Selection state for batch moment operations
const MomentSelectionState = {
    isSelectMode: false,
    selectedMoments: new Map() // Map of momentDataId -> { photos: [], timestamp: ... }
};

/**
 * 導向搜尋結果頁面
 */
function navigateToSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (query) {
        window.location.href = `search.html?q=${encodeURIComponent(query)}`;
    }
}

/**
 * 導向相集詳情頁面
 * @param {string} momentId - Moment 識別碼
 */
function navigateToAlbum(momentId) {
    const momentData = TimelineState.momentData.get(momentId);
    if (momentData) {
        // Store moment photos in sessionStorage for album page
        (window.TimehutStorage?.session || sessionStorage).setItem('albumPhotos', JSON.stringify(momentData.photos));
        (window.TimehutStorage?.session || sessionStorage).setItem('albumDate', momentData.dateStr);
        (window.TimehutStorage?.session || sessionStorage).setItem('albumMomentId', momentId);
        const album = CONFIG.CHILDREN[TimelineState.currentChildIndex].albumId;
        const date = momentData.photos[0].datetaken?.split(' ')[0] || new Date(momentData.timestamp).toISOString().slice(0, 10);
        window.location.href = `album.html?${new URLSearchParams({ id: momentId, album, date, child: TimelineState.currentChildIndex })}`;
    } else {
        console.error('Moment data not found:', momentId);
    }
}

/**
 * 顯示 Toast 通知
 * @param {string} message - 訊息內容
 * @param {string} type - 類型 ('success' | 'error' | 'info')
 */
function showToast(message, type = 'success') {
    // Create container if not exists
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const viewer = document.querySelector('.photo-modal.active .modal-info');
    container.classList.toggle('viewer-toast', Boolean(viewer));
    if (viewer) viewer.insertBefore(container, viewer.querySelector('.modal-actions'));
    else document.body.appendChild(container);

    // Get icon based on type
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };
    const icon = icons[type] || '✅';

    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = `${icon} ${message}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    container.replaceChildren(toast);

    // Auto remove after 2.5s
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

/**
 * 切換時光旅行選單顯示
 */
function toggleTimeTravelMenu() {
    const menu = document.getElementById('timeTravelMenu');
    if (menu.style.display === 'none') {
        populateTimeTravelMenu();
        menu.style.display = 'block';
    } else {
        menu.style.display = 'none';
    }
    document.getElementById('timeTravelBtn').setAttribute('aria-expanded', String(menu.style.display !== 'none'));
}

/**
 * 填充時光旅行選單
 */
function populateTimeTravelMenu() {
    const list = document.getElementById('timeTravelList');
    if (!list) return;

    list.innerHTML = '';

    // groupedPhotos is an array of { label, sortKey, photos: [] }
    if (TimelineState.groupedPhotos && TimelineState.groupedPhotos.length > 0) {
        TimelineState.groupedPhotos.forEach(group => {
            const photoCount = group.photos.filter(photo => photo.media !== 'video').length;
            const videoCount = group.photos.length - photoCount;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'time-travel-item';
            item.innerHTML = `
                <span class="age-label">${group.label}</span>
                <span class="photo-count">${photoCount} 張照片${videoCount ? ` · ${videoCount} 部影片` : ''}</span>
            `;
            item.onclick = () => {
                // Scroll to age section header
                const header = document.querySelector(`[data-age-label="${group.label}"]`);
                if (header) {
                    header.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                toggleTimeTravelMenu();
            };
            list.appendChild(item);
        });
    }

    if (list.children.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--color-text-muted);">尚未載入照片</p>';
    }
}

/**
 * 初始化時間軸頁面
 */
/**
 * 初始化時間軸頁面
 */
async function initTimeline() {
    if(window.TimehutPage?.empty())return;
    const profiles=document.querySelector('.child-profiles')||document.querySelector('.profile-btn')?.parentElement;
    if(profiles&&CONFIG.ACCOUNT_MODE){profiles.replaceChildren(...CONFIG.CHILDREN.map((child,index)=>{const button=document.createElement('button');button.className='profile-btn';button.dataset.child=String(index);button.title=child.name;button.setAttribute('aria-label',`查看 ${child.name} 的相簿`);const emoji=document.createElement('span');emoji.className='profile-emoji';emoji.textContent=child.emoji;button.append(emoji);return button;}));}
    // Check for URL params (e.g. tag filter)
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const tagName = urlParams.get('tag_name');
    const q = urlParams.get('q');

    // Get selected child from localStorage (set by album sidebar)
    const selectedChild = (window.TimehutStorage?.local || localStorage).getItem('timehut_current_child');
    TimelineState.currentChildIndex = selectedChild !== null ? parseInt(selectedChild, 10) : 0;
    if(!CONFIG.CHILDREN[TimelineState.currentChildIndex])TimelineState.currentChildIndex=0;

    // Update UI with selected child
    updateChildDisplay();

    // Setup event listeners
    setupEventListeners();

    // Setup loading timeout - show reload button after 8 seconds
    const loadingTimeout = setTimeout(() => {
        const reloadBtn = document.getElementById('reloadBtn');
        const loadingText = document.getElementById('loadingText');
        if (reloadBtn && TimelineState.isLoading) {
            reloadBtn.style.display = 'block';
            if (loadingText) loadingText.textContent = '載入時間較長，請稍候或嘗試重新載入';
        }
    }, 8000);

    // Clear timeout when photos are loaded
    TimelineState.loadingTimeout = loadingTimeout;

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

    // Get birthdate from localStorage or use default
    const birthDate = (window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`)
        || child.birthDate;

    // Update header
    document.getElementById('currentChildName').textContent = child.name;

    // Calculate current age using saved birthdate
    const age = calculateAge(birthDate, new Date());
    document.getElementById('currentChildAge').textContent = formatAgeString(age.years, age.months, age.days);

    // Update sidebar buttons
    document.querySelectorAll('.profile-btn').forEach((btn, index) => {
        btn.classList.toggle('active', index === TimelineState.currentChildIndex);
        btn.setAttribute('aria-pressed', String(index === TimelineState.currentChildIndex));
    });
    document.querySelectorAll('.sidebar-album-card').forEach((btn, index) => {
        btn.classList.toggle('active', index === TimelineState.currentChildIndex);
        btn.setAttribute('aria-pressed', String(index === TimelineState.currentChildIndex));
    });

    // Build age navigation with saved birthdate
    buildAgeNavigation(birthDate);
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
    if (deleteSelectedBtn && !deleteSelectedBtn.hasAttribute('onclick')) {
        deleteSelectedBtn.addEventListener('click', deleteSelectedPhotos);
    }

    const cancelSelectBtn = document.getElementById('cancelSelectBtn');
    if (cancelSelectBtn) {
        cancelSelectBtn.addEventListener('click', () => {
            SelectionState.selectedPhotos.clear();
            toggleSelectMode();
        });
    }

    // Infinite scroll
    window.addEventListener('scroll', throttle(handleScroll, 200));

    // Touch swipe for photo navigation in modal
    const modal = document.getElementById('photoModal');
    if (modal) {
        let touchStartX = 0;
        let touchEndX = 0;

        modal.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        modal.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, { passive: true });

        function handleSwipe() {
            const swipeThreshold = 50;
            const diff = touchStartX - touchEndX;

            if (Math.abs(diff) > swipeThreshold && modal.classList.contains('active')) {
                if (diff > 0) {
                    // Swipe left -> Next photo
                    navigatePhoto(1);
                } else {
                    // Swipe right -> Previous photo
                    navigatePhoto(-1);
                }
            }
        }
    }
    
    // Fix: Click background to close photo modal
    if (modal) {
        modal.addEventListener('click', (e) => {
            // Close if clicking the modal container itself, the overlay, or the content wrapper (empty space)
            if (e.target === modal || 
                e.target.classList.contains('modal-overlay') || 
                e.target.classList.contains('modal-content')) {
                closeModal();
            }
        });
    }
}

/**
 * 切換小孩
 * @param {number} index - 小孩索引
 */
async function switchChild(index) {
    if (!Number.isInteger(index) || !CONFIG.CHILDREN[index]) return;
    (window.TimehutStorage?.local || localStorage).setItem('timehut_current_child', String(index));
    (window.TimehutStorage?.session || sessionStorage).setItem('selectedChild', String(index));
    if (index === TimelineState.currentChildIndex) return;
    if (SelectionState.isSelectMode) toggleSelectMode();
    if (MomentSelectionState.isSelectMode) window.toggleMomentSelectMode();

    // A previous child's pending GET must not block or populate the next view.
    TimelineState.loadRequestId++;
    TimelineState.isLoading = false;
    TimelineState.currentChildIndex = index;
    TimelineState.currentPage = 1;
    TimelineState.photos = [];
    TimelineState.groupedPhotos = [];

    (window.TimehutStorage?.session || sessionStorage).setItem('selectedChild', index);

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
    const requestId = ++TimelineState.loadRequestId;
    const childIndex = TimelineState.currentChildIndex;
    const isCurrentRequest = () => TimelineState.loadRequestId === requestId && TimelineState.currentChildIndex === childIndex;

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

        if (!isCurrentRequest()) return;
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

            // Get birthdate from localStorage or use default
            const birthDate = (window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`)
                || child.birthDate;

            // Group photos by age and render
            TimelineState.groupedPhotos = groupPhotosByAge(TimelineState.photos, birthDate);
            renderTimeline();
            updateAgeNavCounts();

            // Sync photos to sessionStorage for search.html to use
            (window.TimehutStorage?.session || sessionStorage).setItem('allPhotos', JSON.stringify(TimelineState.photos));
            (window.TimehutStorage?.session || sessionStorage).setItem('allPhotosChild', String(TimelineState.currentChildIndex));
        }

    } catch (error) {
        if (!isCurrentRequest()) return;
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

    // Clear loading timeout and hide reload button
    if (TimelineState.loadingTimeout) {
        clearTimeout(TimelineState.loadingTimeout);
        TimelineState.loadingTimeout = null;
    }
    const reloadBtn = document.getElementById('reloadBtn');
    if (reloadBtn) reloadBtn.style.display = 'none';

    TimelineState.isLoading = false;

    // Restore scroll position if returning from album page
    const savedScrollPosition = (window.TimehutStorage?.session || sessionStorage).getItem(TimelineState.SCROLL_POSITION_KEY);
    if (savedScrollPosition) {
        setTimeout(() => {
            window.scrollTo(0, parseInt(savedScrollPosition));
            (window.TimehutStorage?.session || sessionStorage).removeItem(TimelineState.SCROLL_POSITION_KEY);
        }, 100);
    }
}

/**
 * 處理滾動事件（無限滾動載入更多）
 */
function handleScroll() {
    // Check if we're near the bottom of the page
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = window.innerHeight;

    // Load more when within 500px of bottom
    if (scrollTop + clientHeight >= scrollHeight - 500) {
        loadMorePhotos();
    }
}

/**
 * 載入更多照片（下一頁）
 */
async function loadMorePhotos() {
    if (TimelineState.isLoading) return;
    if (TimelineState.currentPage >= TimelineState.totalPages) return;

    TimelineState.currentPage++;
    console.log(`[PAGINATION] Loading page ${TimelineState.currentPage} of ${TimelineState.totalPages}`);
    await loadPhotos();
}

/**
 * 渲染時間軸
 */
/**
 * 渲染時間軸 (Moment Card Layout)
 */
function renderTimeline() {
    const containerEl = document.getElementById('timelineContainer');
    const loadingEl = document.getElementById('loadingIndicator');

    // Build flat array for modal navigation
    TimelineState.allPhotosFlat = [];

    // Clear existing content (keep loading/empty)
    Array.from(containerEl.children).forEach(child => {
        if (!child.id?.includes('loading') && !child.id?.includes('empty')) {
            child.remove();
        }
    });

    const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];

    TimelineState.groupedPhotos.forEach(group => {
        // Add age group header for time travel targeting
        const groupHeader = document.createElement('div');
        groupHeader.className = 'age-group-header';
        groupHeader.id = `age-${group.sortKey}`;
        groupHeader.setAttribute('data-age-label', group.label);
        const groupTitle = document.createElement('h2'); groupTitle.className = 'age-group-title'; groupTitle.textContent = group.label;
        const groupCount = document.createElement('span'); groupCount.className = 'age-group-summary';
        groupCount.textContent = `${groupPhotosToMoments(group.photos).length} 個相集 · ${group.photos.filter(photo => photo.media !== 'video').length} 張照片 · ${group.photos.filter(photo => photo.media === 'video').length} 部影片`;
        groupHeader.append(groupTitle, groupCount);
        containerEl.insertBefore(groupHeader, loadingEl);

        // Group photos into Moments
        const moments = groupPhotosToMoments(group.photos);

        moments.forEach(moment => {
            // Add photos to flat list and track flatIndex for each photo
            moment.flatStartIndex = TimelineState.allPhotosFlat.length;
            moment.photos.forEach(p => TimelineState.allPhotosFlat.push(p));

            const birthDate = (window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`) || child.birthDate;
            const cardEl = createMomentCard(moment, birthDate);
            containerEl.insertBefore(cardEl, loadingEl);
        });
    });
    updateMomentClickHandlers();
}

/**
 * 將照片分組為 Moments (Batches)
 * 規則：同一拍攝日期的照片會合併為一個相集
 */
function groupPhotosToMoments(photos) {
    if (!photos || photos.length === 0) return [];

    // Group by date taken (YYYY-MM-DD)
    const momentsByDate = new Map();

    photos.forEach(photo => {
        // Get uploader
        const tags = photo.tags ? photo.tags.split(' ') : [];
        const uploaderTag = findUploaderTag(tags);
        const uploader = uploaderTag ? uploaderTag.replace('uploader:', '') : '未知';

        // Use datetaken for grouping, fallback to dateupload
        let dateKey;
        if (photo.datetaken) {
            dateKey = photo.datetaken.split(' ')[0]; // YYYY-MM-DD
        } else {
            const uploadTime = parseInt(photo.dateupload) * 1000;
            dateKey = new Date(uploadTime).toISOString().split('T')[0];
        }

        if (!momentsByDate.has(dateKey)) {
            const photoTime = photo.datetaken
                ? new Date(photo.datetaken).getTime()
                : parseInt(photo.dateupload) * 1000;

            momentsByDate.set(dateKey, {
                uploader: uploader,
                timestamp: photoTime,
                date: photo.datetaken || new Date(photoTime).toISOString(),
                dateKey: dateKey,
                photos: []
            });
        }
        momentsByDate.get(dateKey).photos.push(photo);
    });

    // Convert to array and sort by date (newest first)
    return Array.from(momentsByDate.values())
        .sort((a, b) => b.timestamp - a.timestamp);
}


/**
 * 建立 Moment Card (Batch View)
 */
function createMomentCard(moment, birthDate) {
    const card = document.createElement('div');
    card.className = 'moment-item';

    const count = moment.photos.length;
    const firstPhoto = moment.photos[0];
    const dateObj = new Date(moment.timestamp);
    const day = dateObj.getDate();
    const month = dateObj.getMonth() + 1;
    const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    const monthStr = months[month - 1];

    // Calculate precise age
    const ageObj = calculateAge(birthDate, moment.date.split(' ')[0]);
    const age = formatAgeString(ageObj.years, ageObj.months, ageObj.days);

    // Store moment data for album navigation
    const momentDataId = `moment_${firstPhoto.id}`;
    TimelineState.momentData.set(momentDataId, {
        photos: moment.photos,
        dateStr: `${monthStr} ${day}日 - ${age}`,
        timestamp: moment.timestamp
    });

    // Add data attribute for moment selection
    card.setAttribute('data-moment-id', momentDataId);

    // Uploader info (hidden from header per Timehut design)
    const uploaderEmoji = getUploaderEmoji(moment.uploader);

    // Grid Logic
    let gridHtml = '';
    // Management shows every loaded photo, while the ordinary timeline keeps its collage.
    const displayPhotos = SelectionState.isSelectMode ? moment.photos : moment.photos.slice(0, 5);
    const remaining = count - 5;

    // Grid class based on count (capped at 5 for layout logic)
    const gridCount = Math.min(count, 5);
    let extraClass = count > 3 ? 'multi-grid' : '';

    gridHtml = `<div class="moment-grid ${extraClass}" data-count="${gridCount}">`;

    displayPhotos.forEach((photo, idx) => {
        const imgUrl = FlickrAPI.getPhotoUrl(photo, 'm'); // Medium size
        const isLast = idx === 4;
        const flatIndex = moment.flatStartIndex + idx;

        let overlayHtml = '';
        if (!SelectionState.isSelectMode && isLast && remaining > 0) {
            overlayHtml = `<div class="moment-overlay" onclick="openBatchView(TimelineState.photoBatches.get('${firstPhoto.id}'))">+${remaining + 1}</div>`;
        }

        // Click handler logic
        // If single photo -> Open Modal
        // If batch -> Click opens Modal for specific photo, OR user wants "Enter Album"?
        // User HTML implies "Enter Album" is a separate button at bottom.
        // Clicking images usually opens lightbox.

        const clickAttr = SelectionState.isSelectMode ? `onclick="togglePhotoSelection('${photo.id}')"` : `onclick="openModal(${flatIndex})"`;

        gridHtml += `
            <div class="moment-photo-container">
                <img class="moment-photo" loading="lazy" alt="照片預覽" ${clickAttr}>
                ${photo.media === 'video' ? '<span class="video-badge" aria-hidden="true">▶</span>' : ''}
                ${overlayHtml}
            </div>
        `;
    });
    gridHtml += `</div>`;

    // Footer Logic
    // "Enter Album" button if count > 1 (or always? User HTML always has it)
    // Use momentDataId already declared above
    const enterAlbumHtml = count > 1 ?
        `<div class="moment-album-link" onclick="navigateToAlbum('${momentDataId}')">進入相集 ></div>` : '';

    // Stats
    const photoCount = moment.photos.filter(p => !p.media || p.media === 'photo').length;
    const videoCount = moment.photos.filter(p => p.media === 'video').length;
    let statsText = '';
    if (photoCount > 0) statsText += `照片 ${photoCount} `;
    if (videoCount > 0) statsText += `+ 影片 ${videoCount}`;

    card.innerHTML = `
        <div class="moment-line"></div>
        <div class="moment-header">
            <div class="moment-date-box">
                <span class="moment-month">${monthStr}</span>
                <span class="moment-day">${day}</span>
            </div>
            <div class="moment-info">
                <div class="moment-age">${age}</div>
            </div>
        </div>
        
        <div class="moment-content-box">
            ${gridHtml}
            
            <div class="moment-footer">
                <div class="moment-actions">
                    <span class="moment-icon">❤️</span>
                    <span class="moment-count">0</span>
                    <span class="moment-icon" style="margin-left: 20px;">💬</span>
                    <span class="moment-count">0</span>
                </div>
                <div class="moment-stats-right">
                    <span>${statsText}</span>
                    ${count > 1 ? `<span class="moment-album-link" onclick="navigateToAlbum('${momentDataId}')">· 進入相集 ></span>` : ''}
                </div>
            </div>
        </div>
    `;

    const tags = [...new Set(moment.photos.flatMap(photo => (photo.tags || '').split(' ')))].filter(tag => tag && !findUploaderTag([tag])).slice(0, 3);
    if (tags.length) {
        const row = document.createElement('div'); row.className = 'moment-tags';
        tags.forEach(tag => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'moment-tag'; button.textContent = tag;
            button.addEventListener('click', event => { event.stopPropagation(); filterByTag(tag); }); row.append(button);
        });
        card.querySelector('.moment-content-box').insertBefore(row, card.querySelector('.moment-footer'));
    }
    card.querySelectorAll('.moment-album-link').forEach(link => {
        link.setAttribute('role', 'button'); link.tabIndex = 0;
        link.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigateToAlbum(momentDataId); } });
    });
    const dateLabel = document.createElement('span'); dateLabel.className = 'moment-full-date';
    dateLabel.textContent = dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
    card.querySelector('.moment-date-box').append(dateLabel);
    const title = document.createElement('h3'); title.className = 'moment-title'; title.textContent = moment.photos[0].title || '我們的小日常';
    card.querySelector('.moment-grid').after(title);
    card.querySelectorAll('.moment-photo-container img').forEach((img, index) => {
        img.src = FlickrAPI.getPhotoUrl(displayPhotos[index], 'm');
        img.tabIndex = 0; img.setAttribute('role', 'button');
        img.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); img.click(); } });
        const photoId = String(displayPhotos[index].id), cell = img.parentElement;
        cell.dataset.photoId = photoId;
        const select = document.createElement('button'); select.type = 'button'; select.className = 'timeline-photo-select';
        select.setAttribute('aria-label', `選取${displayPhotos[index].media === 'video' ? '影片' : '照片'}`);
        const selected = SelectionState.selectedPhotos.has(photoId);
        select.setAttribute('aria-pressed', String(selected)); select.textContent = selected ? '✓' : '○';
        cell.classList.toggle('selected', selected);
        select.addEventListener('click', event => { event.stopPropagation(); togglePhotoSelection(photoId); });
        cell.append(select);
    });

    return card;
}

function createSelectionOverlay(photoId) {
    const isSelected = SelectionState.selectedPhotos.has(photoId);
    return `
        <div class="photo-select-overlay ${isSelected ? 'selected' : ''}" onclick="event.stopPropagation(); togglePhotoSelection('${photoId}')">
            <div class="select-checkbox ${isSelected ? 'checked' : ''}"></div>
        </div>
    `;
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
    document.querySelectorAll('.age-count').forEach(item => { item.textContent = '0'; });
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
    if (SelectionState.isSelectMode) { togglePhotoSelection(String(photo.id)); return; }

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
    const uploaderTag = findUploaderTag(allTags);
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
    const displayTags = allTags.filter(t => !findUploaderTag([t])).join(' ');
    const editTagsInput = document.getElementById('editTagsInput');
    if (editTagsInput) {
        editTagsInput.value = displayTags;
    }

    // Update page indicator (e.g., "1 / 10")
    const pageIndicator = document.getElementById('modalPageIndicator');
    if (pageIndicator) {
        pageIndicator.textContent = `${index + 1} / ${TimelineState.allPhotosFlat.length}`;
    }

    let videoLink = document.getElementById('modalVideoLink');
    if (!videoLink) {
        videoLink = document.createElement('a'); videoLink.id = 'modalVideoLink'; videoLink.className = 'modal-download-btn';
        videoLink.target = '_blank'; videoLink.rel = 'noopener'; videoLink.textContent = '▶ 在 Flickr 開啟影片';
        document.querySelector('#photoModal .modal-info').append(videoLink);
    }
    videoLink.hidden = CONFIG.ACCOUNT_MODE || photo.media !== 'video';
    videoLink.href = `https://www.flickr.com/photos/${encodeURIComponent(CONFIG.FLICKR_USER_ID)}/${encodeURIComponent(photo.id)}`;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    window.TimehutViewerMedia?.show(photo);
}

/**
 * 關閉 Modal
 */
function closeModal() {
    window.TimehutViewerMedia?.stop();
    const modal = document.getElementById('photoModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

/**
 * 導航照片（上一張/下一張）- 含卡片式滑動動畫
 * @param {number} direction - 方向 (-1: 上一張, 1: 下一張)
 */
function navigatePhoto(direction) {
    const newIndex = TimelineState.currentModalIndex + direction;

    if (newIndex >= 0 && newIndex < TimelineState.allPhotosFlat.length) {
        // Add swipe animation
        const modalImage = document.getElementById('modalImage');
        if (modalImage) {
            const exitClass = direction > 0 ? 'swipe-left-exit' : 'swipe-right-exit';
            const enterClass = direction > 0 ? 'swipe-left-enter' : 'swipe-right-enter';

            modalImage.classList.add(exitClass);

            setTimeout(() => {
                openModal(newIndex);
                modalImage.classList.remove(exitClass);
                modalImage.classList.add(enterClass);

                setTimeout(() => {
                    modalImage.classList.remove(enterClass);
                }, 300);
            }, 150);
        } else {
            openModal(newIndex);
        }
    }
}

/**
 * 處理鍵盤事件
 * @param {KeyboardEvent} event - 鍵盤事件
 */
function handleKeyboard(event) {
    if (document.querySelector('.timehut-dialog')) return;
    if (event.key !== 'Escape' && event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
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

    // Show loading and clear the previous query's empty state.
    loadingEl.style.display = 'block';
    document.getElementById('emptyState').style.display = 'none';

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
            TimelineState.groupedPhotos = groupPhotosByAge(filteredPhotos, (window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`) || child.birthDate);
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
            TimelineState.groupedPhotos = groupPhotosByAge(result.photos, (window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`) || child.birthDate);
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
 * 顯示確認對話框 (Promise-based)
 * @param {string} title - 標題
 * @param {string} message - 訊息
 * @param {string} confirmText - 確認按鈕文字
 * @returns {Promise<boolean>}
 */
function showConfirmModal(title, message, confirmText = '確認') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmTitle');
        const msgEl = document.getElementById('confirmMessage');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');

        titleEl.textContent = title;
        msgEl.textContent = message;
        msgEl.style.whiteSpace = 'pre-line';
        okBtn.textContent = confirmText;

        modal.classList.remove('hidden');

        const cleanup = () => {
            modal.classList.add('hidden');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        okBtn.onclick = () => {
            cleanup();
            resolve(true);
        };

        cancelBtn.onclick = () => {
            cleanup();
            resolve(false);
        };
    });
}

/**
 * 切換選擇模式
 */
function toggleSelectMode() {
    if (!SelectionState.isSelectMode && MomentSelectionState.isSelectMode) window.toggleMomentSelectMode();
    SelectionState.isSelectMode = !SelectionState.isSelectMode;
    document.body.classList.toggle('select-mode', SelectionState.isSelectMode);
    document.getElementById('selectionBar').classList.toggle('hidden', !SelectionState.isSelectMode);
    document.getElementById('selectModeBtn')?.classList.toggle('active', SelectionState.isSelectMode);
    document.getElementById('selectModeBtn')?.setAttribute('aria-pressed', String(SelectionState.isSelectMode));

    if (!SelectionState.isSelectMode) {
        // Clear selections when exiting select mode
        SelectionState.selectedPhotos.clear();
        document.querySelectorAll('.photo-card.selected,.moment-photo-container.selected').forEach(card => {
            card.classList.remove('selected');
        });
    }

    renderTimeline();
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

    // Update UI for this card
    const card = document.querySelector(`.photo-card[data-id="${photoId}"]`);
    if (card) {
        card.classList.toggle('selected', SelectionState.selectedPhotos.has(photoId));
    }

    updateSelectionUI();
}

/**
 * 更新選擇 UI
 */
function updateSelectionUI() {
    const signature=JSON.stringify([TimelineState.currentChildIndex,SelectionState.isSelectMode,[...SelectionState.selectedPhotos].sort()]);
    if(signature!==SelectionState.signature){SelectionState.signature=signature;SelectionState.revision++;}
    document.getElementById('selectedCount').textContent = SelectionState.selectedPhotos.size;

    // Enable/disable buttons based on selection
    const count = SelectionState.selectedPhotos.size;
    const buttons = document.querySelectorAll('#selectionBar .selection-actions button:not(#cancelSelectBtn)');
    buttons.forEach(btn => btn.disabled = count === 0);
    document.getElementById('batchDownloadBtn').disabled = count === 0 || SelectionState.downloadBusy;
    document.querySelectorAll('.moment-photo-container[data-photo-id]').forEach(cell => {
        const selected = SelectionState.selectedPhotos.has(cell.dataset.photoId);
        cell.classList.toggle('selected', selected);
        const button = cell.querySelector('.timeline-photo-select');
        if (button) { button.setAttribute('aria-pressed', String(selected)); button.textContent = selected ? '✓' : '○'; }
    });
}

/**
 * 刪除選取的照片
 */
function removeConfirmedTimelineSelections(succeeded) {
    const done = new Set(succeeded.map(String));
    succeeded.forEach(id => SelectionState.selectedPhotos.delete(String(id)));
    for (const [id, moment] of MomentSelectionState.selectedMoments) {
        const remaining = moment.photos.filter(photo => !done.has(String(photo.id)));
        if (remaining.length) MomentSelectionState.selectedMoments.set(id, {...moment, photos: remaining});
        else MomentSelectionState.selectedMoments.delete(id);
    }
}

function refreshTimelineAfterBatch() {
    const viewedId = TimelineState.allPhotosFlat[TimelineState.currentModalIndex]?.id;
    const pendingMomentPhotos = new Set(getSelectedMomentPhotoIds().map(String));
    TimelineState.photoBatches = calculatePhotoBatches(TimelineState.photos);
    const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];
    const birthDate = (window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`) || child.birthDate;
    TimelineState.groupedPhotos = groupPhotosByAge(TimelineState.photos, birthDate);
    TimelineState.momentData.clear();
    MomentSelectionState.selectedMoments.clear();
    renderTimeline();
    // A moment's key is derived from its first photo, which may have been
    // deleted. Rebind remaining selected photos to the newly rendered key.
    for (const [id, moment] of TimelineState.momentData) {
        const remaining = moment.photos.filter(photo => pendingMomentPhotos.has(String(photo.id)));
        if (remaining.length) MomentSelectionState.selectedMoments.set(id, {...moment, photos: remaining});
    }
    updateMomentClickHandlers();
    updateMomentSelectionUI();
    updateSelectionUI();
    updateAgeNavCounts();
    document.getElementById('emptyState').style.display = TimelineState.photos.length ? 'none' : 'block';
    TimehutResults.invalidateAlbumCache();
    const viewedIndex = TimelineState.allPhotosFlat.findIndex(photo => String(photo.id) === String(viewedId));
    if (viewedIndex < 0) window.closeModal();
    TimelineState.currentModalIndex = Math.max(0, viewedIndex);
}

function applyTimelineDeletedPhotos(succeeded) {
    if (!succeeded.length) return;
    const deleted = new Set(succeeded.map(String));
    removeConfirmedTimelineSelections(succeeded);
    TimelineState.photos = TimelineState.photos.filter(photo => !deleted.has(String(photo.id)));
    refreshTimelineAfterBatch();
}

async function deleteSelectedPhotos() {
    console.log('[DELETE] deleteSelectedPhotos called');
    const count = SelectionState.selectedPhotos.size;

    if (count === 0) {
        alert('請先選擇要刪除的照片');
        return;
    }

    // Use custom modal instead of native confirm
    const confirmed = await showConfirmModal(
        '確認刪除',
        `確定要背景刪除 ${count} 張照片嗎？\n⚠️ 此操作無法復原！\n手機已保存的檔案仍會保留。`,
        '🗑️ 確認刪除'
    );

    if (!confirmed) return;

    const photoIds = Array.from(SelectionState.selectedPhotos);
    console.log('[DELETE] Deleting IDs:', photoIds);

    // Hand off to background worker
    if (typeof BackgroundWorker !== 'undefined') {
        const deletion = await BackgroundWorker.startDelete(photoIds);
        if (!deletion.accepted) { alert('目前已有作業進行中，選取已保留'); return; }
        applyTimelineDeletedPhotos(deletion.succeeded);
        if (deletion.failed.length) { alert(`已確認刪除 ${deletion.succeeded.length} 張；${deletion.failed.length} 張未完成，僅保留未完成項目供重試`); return; }

        if (SelectionState.isSelectMode && SelectionState.selectedPhotos.size === 0) toggleSelectMode();
        showToast(`已確認刪除 ${deletion.succeeded.length} 張照片`, 'success');
    } else {
        // Fallback to old blocking method if BackgroundWorker not available
        console.warn('BackgroundWorker not available, using blocking delete');
        const deleteBtn = document.getElementById('deleteSelectedBtn');
        if (deleteBtn) {
            deleteBtn.disabled = true;
            deleteBtn.textContent = '刪除中...';
        }

        try {
            const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photos/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoIds })
            });

            const result = await response.json();

            if (response.ok) {
                const confirmed = TimehutResults.confirmed(result, photoIds);
                applyTimelineDeletedPhotos(confirmed.succeeded);
                if (confirmed.failed.length) { alert(`已確認刪除 ${confirmed.succeeded.length} 張；${confirmed.failed.length} 張未完成，僅保留未完成項目供重試`); return; }
                const successCount = confirmed.succeeded.length;
                TimehutResults.invalidateAlbumCache();
                showToast(`刪除完成！成功：${successCount} 張`, 'success');

                // Exit select mode and reload entire page for fresh data
                SelectionState.selectedPhotos.clear();
                toggleSelectMode();

                // Auto-refresh page after short delay
                setTimeout(() => {
                    location.reload();
                }, 1000);
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
}

// Make selection functions globally available
// Make selection functions globally available
window.togglePhotoSelection = togglePhotoSelection;
window.deleteSelectedPhotos = deleteSelectedPhotos;

/**
 * 批量下載照片 (P1)
 */
async function batchDownload() {
    if (SelectionState.downloadBusy) return;
    const selected=[...SelectionState.selectedPhotos];
    if (!selected.length) return alert('請先選擇照片');
    const photos=selected.map(id=>TimelineState.allPhotosFlat.find(photo=>photo.id===id)).filter(Boolean).map(photo=>({...photo}));
    const btn=document.getElementById('batchDownloadBtn');
    updateSelectionUI();const revision=SelectionState.revision;
    SelectionState.downloadBusy=true;updateSelectionUI();
    try {
        if(photos.length!==selected.length)throw new Error('選取檔案已變更，請重新選取');
        if(!await TimehutTransfers.confirmDownloads(photos))return;
        if(revision!==SelectionState.revision)throw new Error('選取內容已變更，請重新確認下載');
        btn.textContent='準備下載…';
        const native=await TimehutTransfers.downloadMany(photos);
        if(native){
            if(revision===SelectionState.revision){native.accepted.forEach(id=>SelectionState.selectedPhotos.delete(id));updateSelectionUI();}
            alert(`手機系統已接受 ${native.accepted.length} 個下載，${native.failed.length} 個尚未送出；請到傳輸中心確認。`);return;
        }
        const zip=new JSZip(),acquired=[];let failed=0;
        for(const photo of photos){
            try{
                const url=await TimehutTransfers.mediaUrl(photo);
                const response=await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(url);if(!response.ok)throw new Error('下載失敗');
                const blob=await response.blob();
                const filename=photo.media==='video'?`${photo.id}.${blob.type.split(';')[0].trim().toLowerCase()==='video/quicktime'?'mov':'mp4'}`:`${photo.id}-${new URL(url).pathname.split('/').at(-1)||'media'}`;
                zip.file(filename,blob);acquired.push(photo.id);
                if(revision===SelectionState.revision)btn.textContent=`已取得 ${acquired.length}/${photos.length}`;
            }catch(error){failed++;console.error('Batch file download failed',photo.id,error);}
        }
        if(!acquired.length)throw new Error('本次檔案下載全部失敗，請確認選取內容後再試');
        if(revision===SelectionState.revision)btn.textContent='產生 ZIP…';
        const content=await zip.generateAsync({type:'blob'});saveAs(content,`timehut_photos_${new Date().toISOString().slice(0,10)}.zip`);
        const selectionUnchanged=revision===SelectionState.revision;
        if(selectionUnchanged){acquired.forEach(id=>SelectionState.selectedPhotos.delete(id));updateSelectionUI();}
        alert(`已交給瀏覽器 ${acquired.length} 個檔案的 ZIP；${failed?`${failed} 個檔案未能下載。${selectionUnchanged?'失敗項目仍保留供重試。':'選取內容已變更，請重新選取失敗項目後重試。'}`:'請確認實際下載結果。'}`);
    }catch(error){console.error('Batch download error:',error);alert(error.message||'下載失敗，請稍後再試');}
    finally{SelectionState.downloadBusy=false;btn.textContent='⬇️ 下載';updateSelectionUI();}
}
window.batchDownload = batchDownload;

/**
 * 批量加標籤 (P1)
 */
async function batchAddTags() {
    const count = SelectionState.selectedPhotos.size;
    if (count === 0) return alert('請先選擇照片');

    const tags = await TimehutDialogs.tags(`為 ${count} 張照片增加標籤 (以空格分隔):`);
    if (!tags) return;

    const photoIds = Array.from(SelectionState.selectedPhotos);
    const btn = document.getElementById('batchTagBtn');
    btn.disabled = true;
    btn.textContent = '處理中...';

    try {
        const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photos/tags/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds, tags })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.message || '操作失敗');
        const { succeeded, failed } = TimehutResults.confirmed(result, photoIds);
        const succeededIds = new Set(succeeded);
        TimelineState.photos.forEach(photo => { if (succeededIds.has(String(photo.id))) photo.tags = [photo.tags, tags].filter(Boolean).join(' '); });
        TimehutResults.invalidateAlbumCache();
        succeeded.forEach(id => SelectionState.selectedPhotos.delete(id));
        updateSelectionUI();
        if (failed.length) {
            showToast(`成功為 ${succeeded.length}/${photoIds.length} 張照片加上標籤；${failed.length} 張尚未完成，已保留選取供重試`, 'warning');
            return;
        }
        showToast(result.message || '操作完成', 'success');

        // Reload to update UI
        SelectionState.selectedPhotos.clear();
        toggleSelectMode();
        TimelineState.photos = [];
        TimelineState.currentPage = 1;
        loadPhotos();
    } catch (error) {
        showToast('加標籤失敗: ' + error.message, 'error');
    } finally {
        btn.disabled = SelectionState.selectedPhotos.size === 0;
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
    let albumList = "選擇目標相簿：\n";
    CONFIG.CHILDREN.forEach((child, index) => {
        albumList += `${index + 1}. ${child.name} (${child.emoji})\n`;
    });

    const input = await TimehutDialogs.album(albumList);
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
        const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/album/${albumId}/add_photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.message || '操作失敗');
        const { succeeded, failed } = TimehutResults.confirmed(result, photoIds);
        TimehutResults.invalidateAlbumCache();
        succeeded.forEach(id => SelectionState.selectedPhotos.delete(id));
        updateSelectionUI();
        if (failed.length) {
            alert(`已加入相簿 ${succeeded.length}/${photoIds.length} 張；${failed.length} 張尚未完成，已保留選取供重試`);
            return;
        }
        alert(result.message || '操作完成');

        SelectionState.selectedPhotos.clear();
        toggleSelectMode();
    } catch (error) {
        alert('加入相簿失敗: ' + error.message);
    } finally {
        btn.disabled = SelectionState.selectedPhotos.size === 0;
        btn.textContent = '📁 加入相簿';
    }
}
window.batchAddToAlbum = batchAddToAlbum;

// Initialize when DOM is ready
(window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))( () => {
    if (document.getElementById('timelineContainer')) {
        initTimeline();
    }
});

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
    const uploaderTag = findUploaderTag(existingTags);

    // Combine uploader tag with new user tags
    const finalTags = uploaderTag ? `${uploaderTag} ${newTags}` : newTags;

    const saveBtn = document.querySelector('.save-tags-btn');
    const originalEmoji = saveBtn ? saveBtn.textContent : '💾';

    try {
        if (saveBtn) saveBtn.textContent = '⏳';

        const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photo/${photo.id}/tags`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: finalTags })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // Update local photo object
            const savedTags = typeof result.tags === 'string' ? result.tags : finalTags;
            photo.tags = savedTags;
            TimehutResults.invalidateAlbumCache();
            TimelineState.photos.filter(item => item.id === photo.id).forEach(item => { item.tags = savedTags; });
            if (saveBtn) saveBtn.textContent = '✅';
            showToast('標籤已儲存！', 'success');
            setTimeout(() => { if (saveBtn) saveBtn.textContent = originalEmoji; }, 1500);
        } else {
            throw new Error(result.error || '儲存失敗');
        }
    } catch (error) {
        console.error('Save tags error:', error);
        showToast('儲存標籤失敗：' + error.message, 'error');
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
    const uploaderTag = findUploaderTag(tags);
    return uploaderTag ? uploaderTag.replace('uploader:', '') : 'unknown';
}

function findUploaderTag(tags) {
    const raw = tags.find(tag => tag.startsWith('uploader:'));
    if (raw) return raw;
    // Recognize only configured family names in Flickr's normalized album-list tags.
    const normalized = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const member = (CONFIG.FAMILY_MEMBERS || []).find(person =>
        tags.some(tag => tag === normalized('uploader:' + person.name)));
    return member ? 'uploader:' + member.name : null;
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
    const capabilities=await window.TimehutTransfers?.ready;
    if(capabilities?.nativeError){showToast(capabilities.nativeError,'error');return;}
    if (capabilities?.nativeBackgroundUpload) { location.href = 'transfer.html'; return; }
    const modal = document.getElementById('uploadModal');
    modal.style.removeProperty('display');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Choose before network work; a late response must not replace a user's selection.
    if (window.UploadUI) {
        // Auto-select current child's album
        const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];
        const albumSelect = document.getElementById('albumSelect');
        if (albumSelect && child.albumId) {
            const destination = UploadUI.fileList.length > 0 && UploadUI.retryAlbumId
                ? UploadUI.retryAlbumId : child.albumId;
            albumSelect.value = destination;
        }
        void window.UploadUI.checkAndPrepare();
    }

    // Update album upload link based on current child
    updateAlbumUploadLink();

    // Setup dropzone events
    if (!window.UploadUI) setupDropzone();
}

/**
 * 關閉上傳 Modal
 */
function closeUploadModal() {
    window.UploadUI?.cancelPreparation();
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

    if (!albumLink) return;
    if(CONFIG.ACCOUNT_MODE){albumLink.href='account.html';albumLink.textContent='前往我的相簿';return;}

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
    if (window.UploadUI) UploadUI.clearQueue();
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

// Make navigation and timeline functions globally available
window.navigateToSearch = navigateToSearch;
window.navigateToAlbum = navigateToAlbum;
window.initTimeline = initTimeline;
window.openModal = openModal;
window.closeModal = closeModal;
window.navigatePhoto = navigatePhoto;
window.toggleSelectMode = toggleSelectMode;
window.deleteSelectedPhotos = deleteSelectedPhotos;
window.setTaggingMode = typeof setTaggingMode === 'function' ? setTaggingMode : function () { };

// Time Travel functions
window.toggleTimeTravelMenu = toggleTimeTravelMenu;
window.populateTimeTravelMenu = populateTimeTravelMenu;

// Toast notification
window.showToast = showToast;

/**
 * 下載當前照片 - 直接下載到手機
 */
async function downloadCurrentPhoto() {
    const photo = TimelineState.allPhotosFlat[TimelineState.currentModalIndex];
    if (!photo) {
        showToast('無法下載照片', 'error');
        return;
    }
    try { if (await window.TimehutTransfers?.download(photo)) return; }
    catch (error) { showToast(error.message || '原生下載未開始', 'error'); return; }

    // Get the largest available URL
    let downloadUrl;
    try { downloadUrl = await TimehutTransfers.mediaUrl(photo); }
    catch (error) { showToast(error.message, 'error'); return; }
    if (!downloadUrl) {
        showToast('無法取得照片網址', 'error');
        return;
    }

    showToast('正在下載...', 'info');

    try {
        // Fetch the image as blob for direct download
        const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(downloadUrl);
        if (!response.ok) throw new Error('下載失敗');
        const blob = await response.blob();

        // Create blob URL and trigger download
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = photo.media === 'video' ? `${photo.id}.${blob.type.split(';')[0].trim().toLowerCase() === 'video/quicktime' ? 'mov' : 'mp4'}` : `${photo.id}-${new URL(downloadUrl).pathname.split('/').at(-1) || 'photo.jpg'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);

        showToast('已交給瀏覽器下載', 'success');
    } catch (error) {
        console.error('Download error:', error);
        if (photo.media === 'video') {
            showToast('影片原檔下載失敗，請稍後按下載重試', 'error');
            return;
        }
        // Fallback: open in new tab for cross-origin images
        window.open(downloadUrl, '_blank');
        showToast('已在新分頁開啟，請長按圖片儲存', 'info');
    }
}

window.downloadCurrentPhoto = downloadCurrentPhoto;

// =====================================================
// ALBUM SIDEBAR (Swipe from left)
// =====================================================

/**
 * 初始化相簿側邊欄
 */
function initAlbumSidebar() {
    const sidebarAlbums = document.getElementById('sidebarAlbums');
    if (!sidebarAlbums) return;

    const currentChildIndex = parseInt((window.TimehutStorage?.local || localStorage).getItem('timehut_current_child') || '0');

    // Render album cards
    sidebarAlbums.innerHTML = CONFIG.CHILDREN.map((child, index) => {
        // Use correct calculateAge from utils.js (returns object)
        const age = calculateAge((window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${index}_birthdate`) || child.birthDate, new Date());
        const ageString = formatAgeString(age.years, age.months, age.days);

        return `
            <button type="button" class="sidebar-album-card ${index === currentChildIndex ? 'active' : ''}"
                 aria-pressed="${index === currentChildIndex}" onclick="switchAlbum(${index})">
                <span class="album-card-emoji">${child.emoji}</span>
                <span class="album-card-info">
                    <span class="album-card-name">${escapeTimehutText(child.name)}</span>
                    <span class="album-card-subtitle">${ageString}</span>
                </span>
            </button>
        `;
    }).join('');

    // Initialize swipe gesture
    initSwipeGesture();
}

// calculateAge is defined in utils.js - DO NOT REDEFINE HERE

/**
 * 初始化滑動手勢
 */
function initSwipeGesture() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;

        const diffX = touchEndX - touchStartX;
        const diffY = Math.abs(touchEndY - touchStartY);

        // Only trigger if horizontal swipe is significant and starts from left edge
        if (touchStartX < 30 && diffX > 80 && diffY < 100) {
            openAlbumSidebar();
        }
    }, { passive: true });
}

/**
 * 開啟相簿側邊欄
 */
let albumSidebarPreviousFocus = null;

function openAlbumSidebar() {
    const sidebar = document.getElementById('albumSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const tabHandle = document.getElementById('sidebarTabHandle');
    if (sidebar) {
        if (!sidebar.classList.contains('open')) albumSidebarPreviousFocus = document.activeElement;
        sidebar.inert = false;
        sidebar.classList.add('open');
        sidebar.querySelector('.sidebar-close').focus();
    }
    document.querySelectorAll('[aria-controls="albumSidebar"]').forEach(btn => btn.setAttribute('aria-expanded', 'true'));
    if (overlay) overlay.classList.add('visible');
    if (tabHandle) tabHandle.classList.add('hidden');
}

/**
 * 關閉相簿側邊欄
 */
function closeAlbumSidebar() {
    const sidebar = document.getElementById('albumSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const tabHandle = document.getElementById('sidebarTabHandle');
    if (sidebar) {
        sidebar.classList.remove('open');
        sidebar.inert = true;
    }
    document.querySelectorAll('[aria-controls="albumSidebar"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
    if (overlay) overlay.classList.remove('visible');
    if (tabHandle) tabHandle.classList.remove('hidden');
    if (albumSidebarPreviousFocus?.isConnected) albumSidebarPreviousFocus.focus();
}

document.addEventListener('keydown', event => {
    const sidebar = document.getElementById('albumSidebar');
    if (!sidebar?.classList.contains('open')) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeAlbumSidebar();
    } else if (event.key === 'Tab') {
        const buttons = [...sidebar.querySelectorAll('button')];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
});

(window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))( () => {
    const header = document.querySelector('.timeline-page .header');
    if (header) new ResizeObserver(() => {
        document.documentElement.style.setProperty('--timeline-header-height', `${header.getBoundingClientRect().height}px`);
    }).observe(header);
});

/**
 * 切換相簿
 */
async function switchAlbum(childIndex) {
    if (!Number.isInteger(childIndex) || !CONFIG.CHILDREN[childIndex]) return;
    closeAlbumSidebar();
    await switchChild(childIndex);
    if (TimelineState.currentChildIndex === childIndex) showToast(`切換到 ${CONFIG.CHILDREN[childIndex].name} 的相簿`, 'success');
}

// Export sidebar functions
window.openAlbumSidebar = openAlbumSidebar;
window.closeAlbumSidebar = closeAlbumSidebar;
window.switchAlbum = switchAlbum;

// Initialize sidebar on DOMContentLoaded
(window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))( initAlbumSidebar);

// Save scroll position when leaving the page
window.addEventListener('beforeunload', () => {
    (window.TimehutStorage?.session || sessionStorage).setItem(TimelineState.SCROLL_POSITION_KEY, window.scrollY.toString());
});

// =====================================================
// MOMENT BATCH OPERATIONS (相集批量操作)
// =====================================================

/**
 * 切換相集選擇模式
 */
window.toggleMomentSelectMode = function toggleMomentSelectMode() {
    if (!MomentSelectionState.isSelectMode && SelectionState.isSelectMode) toggleSelectMode();
    MomentSelectionState.isSelectMode = !MomentSelectionState.isSelectMode;
    document.body.classList.toggle('moment-select-mode', MomentSelectionState.isSelectMode);
    document.getElementById('momentSelectionBar').classList.toggle('hidden', !MomentSelectionState.isSelectMode);
    document.getElementById('batchMomentBtn').classList.toggle('active', MomentSelectionState.isSelectMode);
    document.getElementById('batchMomentBtn').setAttribute('aria-pressed', String(MomentSelectionState.isSelectMode));

    if (!MomentSelectionState.isSelectMode) {
        // Clear selections when exiting select mode
        MomentSelectionState.selectedMoments.clear();
        document.querySelectorAll('.moment-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
    }

    // Add click handlers to moment items
    updateMomentClickHandlers();
    updateMomentSelectionUI();
}

/**
 * 更新相集點擊事件
 */
function updateMomentClickHandlers() {
    document.querySelectorAll('.moment-item').forEach(item => {
        const header = item.querySelector('.moment-header');
        const id = item.dataset.momentId;
        item.classList.toggle('selected', MomentSelectionState.selectedMoments.has(id));
        if (MomentSelectionState.selectedMoments.has(id) && TimelineState.momentData.has(id)) {
            const selectedIds = new Set(MomentSelectionState.selectedMoments.get(id).photos.map(photo => String(photo.id)));
            const current = TimelineState.momentData.get(id);
            MomentSelectionState.selectedMoments.set(id, {...current, photos: current.photos.filter(photo => selectedIds.has(String(photo.id)))});
        }
        header.tabIndex = MomentSelectionState.isSelectMode ? 0 : -1;
        header.setAttribute('role', 'button');
        header.setAttribute('aria-label', '選取此相集');
        header.setAttribute('aria-pressed', String(MomentSelectionState.selectedMoments.has(id)));
        header.onkeydown = event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleMomentSelection(item); }
        };
        if (MomentSelectionState.isSelectMode) {
            item.onclick = (e) => {
                // Prevent click on photos from triggering selection
                if (e.target.closest('.moment-photo-container')) return;
                toggleMomentSelection(item);
            };
        } else {
            item.onclick = null;
        }
    });
}

/**
 * 切換相集選擇狀態
 */
function toggleMomentSelection(momentItem) {
    if (!MomentSelectionState.isSelectMode) return;

    // Get momentDataId from data attribute
    const momentDataId = momentItem.getAttribute('data-moment-id');
    if (!momentDataId) return;

    if (MomentSelectionState.selectedMoments.has(momentDataId)) {
        MomentSelectionState.selectedMoments.delete(momentDataId);
        momentItem.classList.remove('selected');
    } else {
        const momentData = TimelineState.momentData.get(momentDataId);
        if (momentData) {
            MomentSelectionState.selectedMoments.set(momentDataId, momentData);
            momentItem.classList.add('selected');
        }
    }

    momentItem.querySelector('.moment-header').setAttribute('aria-pressed', String(MomentSelectionState.selectedMoments.has(momentDataId)));
    updateMomentSelectionUI();
}

/**
 * 更新相集選擇 UI
 */
function updateMomentSelectionUI() {
    const count = MomentSelectionState.selectedMoments.size;
    document.getElementById('selectedMomentCount').textContent = count;

    // Enable/disable action buttons
    const disableActions = count === 0;
    document.getElementById('momentBatchTagBtn').disabled = disableActions;
    document.getElementById('momentMoveCollectionBtn').disabled = disableActions;
    document.getElementById('momentMoveAlbumBtn').disabled = disableActions;
    document.getElementById('momentDeleteBtn').disabled = disableActions;
}

/**
 * 取得所有選中相集的照片ID
 */
function getSelectedMomentPhotoIds() {
    const photoIds = [];
    MomentSelectionState.selectedMoments.forEach(momentData => {
        momentData.photos.forEach(photo => {
            if (!photoIds.includes(photo.id)) {
                photoIds.push(photo.id);
            }
        });
    });
    return photoIds;
}

/**
 * 批量刪除相集
 */
window.batchMomentDelete = async function batchMomentDelete() {
    const count = MomentSelectionState.selectedMoments.size;
    if (count === 0) return alert('請先選擇相集');

    const photoIds = getSelectedMomentPhotoIds();
    const photoCount = photoIds.length;

    if (!await TimehutDialogs.confirm(`確定要永久刪除 ${count} 個相集（共 ${photoCount} 張照片）嗎？\n此操作無法復原！\n手機已保存的檔案仍會保留。`, {title:'永久刪除照片',confirmText:'永久刪除',danger:true})) return;

    // Hand off to background worker
    if (typeof BackgroundWorker !== 'undefined') {
        const deletion = await BackgroundWorker.startDelete(photoIds);
        if (!deletion.accepted) { alert('目前已有作業進行中，選取已保留'); return; }
        applyTimelineDeletedPhotos(deletion.succeeded);
        if (deletion.failed.length) { alert(`已確認刪除 ${deletion.succeeded.length} 張；${deletion.failed.length} 張未完成，僅保留未完成項目供重試`); return; }

        if (MomentSelectionState.isSelectMode && MomentSelectionState.selectedMoments.size === 0) toggleMomentSelectMode();
        showToast(`已確認刪除 ${deletion.succeeded.length} 張照片`, 'success');
    } else {
        // Fallback to old blocking method
        console.warn('BackgroundWorker not available, using blocking delete');
        const btn = document.getElementById('momentDeleteBtn');
        btn.disabled = true;
        btn.textContent = '刪除中...';

        try {
            const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photos/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoIds })
            });

            const result = await response.json();

            if (response.ok) {
                const receipt = TimehutResults.confirmed(result, photoIds);
                applyTimelineDeletedPhotos(receipt.succeeded);
                if (receipt.failed.length) { alert(`已確認刪除 ${receipt.succeeded.length} 張；${receipt.failed.length} 張未完成，僅保留未完成項目供重試`); return; }
                const successCount = receipt.succeeded.length;
                TimehutResults.invalidateAlbumCache();
                showToast(`刪除完成！成功：${successCount} 張照片`, 'success');

                // Exit select mode and reload
                MomentSelectionState.selectedMoments.clear();
                toggleMomentSelectMode();

                setTimeout(() => {
                    location.reload();
                }, 1000);
            } else {
                alert(`刪除失敗：${result.error}`);
            }
        } catch (error) {
            console.error('Delete error:', error);
            alert('刪除時發生錯誤，請稍後再試');
        } finally {
            btn.disabled = false;
            btn.textContent = '🗑️ 刪除';
        }
    }
}

/**
 * 批量為相集加標籤
 */
window.batchMomentAddTags = async function batchMomentAddTags() {
    const count = MomentSelectionState.selectedMoments.size;
    if (count === 0) return alert('請先選擇相集');

    const photoIds = getSelectedMomentPhotoIds();
    const tags = await TimehutDialogs.tags(`為 ${count} 個相集（${photoIds.length} 張照片）增加標籤（以空格分隔）:`);
    if (!tags) return;

    const btn = document.getElementById('momentBatchTagBtn');
    btn.disabled = true;
    btn.textContent = '處理中...';

    try {
        const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photos/tags/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds, tags })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.message || '加標籤失敗');
        const { succeeded, failed } = TimehutResults.confirmed(result, photoIds);
        const succeededIds = new Set(succeeded);
        TimelineState.photos.forEach(photo => { if (succeededIds.has(String(photo.id))) photo.tags = [photo.tags, tags].filter(Boolean).join(' '); });
        TimehutResults.invalidateAlbumCache();
        if (failed.length) {
            for (const [id, moment] of MomentSelectionState.selectedMoments) {
                const remaining = moment.photos.filter(photo => !succeededIds.has(String(photo.id)));
                if (remaining.length) MomentSelectionState.selectedMoments.set(id, {...moment, photos: remaining});
                else MomentSelectionState.selectedMoments.delete(id);
            }
            updateMomentClickHandlers(); updateMomentSelectionUI();
            alert(`成功為 ${succeeded.length}/${photoIds.length} 張照片加上標籤；${failed.length} 張尚未完成，已保留選取供重試`);
            return;
        }
        showToast(result.message || '標籤添加成功', 'success');

        // Reload to update UI
        MomentSelectionState.selectedMoments.clear();
        toggleMomentSelectMode();
        TimelineState.photos = [];
        TimelineState.currentPage = 1;
        loadPhotos();
    } catch (error) {
        alert('加標籤失敗: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '🏷️ 加標籤';
    }
}

/**
 * 批量移動相集到其他時間點（合併相集）- 視覺化 Modal 版
 */
window.batchMomentMoveCollection = async function batchMomentMoveCollection() {
    const count = MomentSelectionState.selectedMoments.size;
    if (count === 0) return alert('請先選擇相集');

    // Get photos to move
    const photoIds = getSelectedMomentPhotoIds();

    // Use the visual modal
    moveCollectionState.isFromMomentSelection = true;
    showMoveCollectionModal(photoIds.length, photoIds);
}

/**
 * 批量移動相集到其他相簿
 */
window.batchMomentMoveAlbum = async function batchMomentMoveAlbum() {
    const count = MomentSelectionState.selectedMoments.size;
    if (count === 0) return alert('請先選擇相集');

    const photoIds = getSelectedMomentPhotoIds();
    const sourceChildIndex = TimelineState.currentChildIndex;
    const sourceAlbumId = CONFIG.CHILDREN[sourceChildIndex].albumId;

    // Build album selection options
    let albumList = '選擇目標相簿：\n\n';
    CONFIG.CHILDREN.forEach((child, index) => {
        const current = index === sourceChildIndex ? ' (目前)' : '';
        albumList += `${index + 1}. ${child.emoji} ${child.name}${current}\n`;
    });

    const input = await TimehutDialogs.album(albumList, false);
    if (!input) return;

    const targetIdx = parseInt(input) - 1;
    if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= CONFIG.CHILDREN.length) {
        return alert('無效的選擇');
    }

    if (targetIdx === sourceChildIndex) {
        return alert('照片已在此相簿中');
    }

    const targetChild = CONFIG.CHILDREN[targetIdx];
    const targetAlbumId = targetChild.albumId;

    if (!await TimehutDialogs.confirm(`確定要將 ${count} 個相集（${photoIds.length} 張照片）移動到「${targetChild.name}」的相簿嗎？`, {title:'移動相簿',confirmText:'確認移動'})) return;

    const btn = document.getElementById('momentMoveAlbumBtn');
    btn.disabled = true;
    btn.textContent = '處理中...';

    try {
        // First add photos to new album
        const addResponse = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/album/${targetAlbumId}/add_photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds })
        });

        const addResult = await addResponse.json();

        if (!addResponse.ok) {
            throw new Error(addResult.error || '加入新相簿失敗');
        }

        const added = TimehutResults.confirmed(addResult, photoIds);
        if (added.failed.length) {
            throw new Error(`已確認 ${added.succeeded.length}/${photoIds.length} 張加入目標相簿；尚未從原相簿移出任何照片，請重試未完成的移動`);
        }

        // Only confirmed destination membership permits removing originals.
        // The user may switch children while the destination request is pending.
        const removeResponse = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/album/${sourceAlbumId}/remove_photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds })
        });

        const removeResult = await removeResponse.json();

        if (removeResponse.ok) {
            const { succeeded, failed } = TimehutResults.confirmed(removeResult, photoIds);
            const viewingSource = TimelineState.currentChildIndex === sourceChildIndex;
            if (succeeded.length && viewingSource) {
                const moved = new Set(succeeded);
                removeConfirmedTimelineSelections(succeeded);
                TimelineState.photos = TimelineState.photos.filter(photo => !moved.has(String(photo.id)));
                refreshTimelineAfterBatch();
                if (MomentSelectionState.isSelectMode && MomentSelectionState.selectedMoments.size === 0) toggleMomentSelectMode();
            }
            TimehutResults.invalidateAlbumCache();
            if (failed.length) {
                const nextStep = viewingSource ? '未完成項目已保留選取供重試' : '請返回原相簿確認未完成項目並重試';
                alert(`已完成移動 ${succeeded.length}/${photoIds.length} 張；${failed.length} 張尚未從原相簿移出。${nextStep}`);
                return;
            }
            showToast(`成功將 ${photoIds.length} 張照片移動到「${targetChild.name}」的相簿`, 'success');
        } else {
            showToast(`照片已加入新相簿，但從原相簿移除失敗：${removeResult.error}`, 'warning');
        }
    } catch (error) {
        console.error('Move album error:', error);
        alert('移動相簿時發生錯誤：' + error.message);
    } finally {
        btn.disabled = MomentSelectionState.selectedMoments.size === 0;
        btn.textContent = '📚 移動相簿';
    }
}

// =====================================================
// INDIVIDUAL PHOTO BATCH MOVE TO COLLECTION (Visual Modal)
// =====================================================

// State for move collection modal
let moveCollectionState = {
    targetDate: null,
    targetLabel: null,
    collections: [],
    // Track which selection mode triggered the modal
    isFromMomentSelection: false
};

function refreshMoveCollectionDateCounts(succeeded, targetDate) {
    const done = new Set(succeeded.map(String));
    const selectedDate = moveCollectionState.targetDate;
    const previous = new Map(moveCollectionState.collections.map(collection => [collection.date, collection]));
    const photos = new Map(moveCollectionState.collections.flatMap(collection => collection.photos).map(photo => [String(photo.id), photo]));
    const groups = new Map();
    for (const [id, photo] of photos) {
        if (done.has(id)) photo.datetaken = targetDate;
        const uploadedAt = new Date(Number(photo.dateupload) * 1000);
        const date = photo.datetaken?.split(' ')[0] || (Number.isNaN(uploadedAt.valueOf()) ? 'unknown' : uploadedAt.toISOString().slice(0, 10));
        if (!groups.has(date)) groups.set(date, {...previous.get(date), date, photos: []});
        groups.get(date).photos.push(photo);
    }
    moveCollectionState.collections = [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
    renderCollectionList(moveCollectionState.collections);
    const selected = [...document.querySelectorAll('#collectionList .collection-item')].find(item => item.dataset.date === selectedDate);
    if (selected) selectCollection(selected);
}

/**
 * 批量移動單獨選取的照片到其他相集（改變拍攝日期）- 視覺化 Modal 版
 */
async function batchMoveToCollection() {
    const count = SelectionState.selectedPhotos.size;
    if (count === 0) return alert('請先選擇照片');

    moveCollectionState.isFromMomentSelection = false;
    showMoveCollectionModal(count, Array.from(SelectionState.selectedPhotos));
}

/**
 * 顯示移動相集 Modal
 */
async function showMoveCollectionModal(count, photoIds) {
    document.getElementById('moveCollectionCount').textContent = count;
    document.getElementById('collectionSelectionPrompt').textContent = '請先選擇目的相集。';
    document.getElementById('moveCollectionModal').classList.remove('hidden');
    document.getElementById('collectionListLoading').style.display = 'block';
    document.getElementById('collectionList').style.display = 'none';
    document.getElementById('moveCollectionConfirmBtn').disabled = true;
    moveCollectionState.targetDate = null;
    moveCollectionState.photoIds = photoIds;

    // Use existing momentData from timeline
    const moments = Array.from(TimelineState.momentData.entries());

    if (moments.length < 2) {
        document.getElementById('collectionListLoading').innerHTML =
            '<div style="color: var(--color-danger);">需要至少兩個相集才能移動</div>';
        return;
    }

    // Build collections list from momentData
    const collections = moments.map(([id, data]) => ({
        id: id,
        date: data.photos[0]?.datetaken?.split(' ')[0] || 'unknown',
        label: data.dateStr,
        photos: data.photos,
        timestamp: data.timestamp
    })).sort((a, b) => b.timestamp - a.timestamp);

    moveCollectionState.collections = collections;
    renderCollectionList(collections);
}

/**
 * 渲染相集列表
 */
function renderCollectionList(collections) {
    const listEl = document.getElementById('collectionList');

    if (collections.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--color-text-muted);">無可用的相集</div>';
    } else {
        listEl.innerHTML = collections.map((col, idx) => `
            <button type="button" class="collection-item" aria-pressed="false" data-date="${col.date}" data-label="${col.label}" onclick="selectCollection(this)">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${FlickrAPI.getPhotoUrl(col.photos[0], 'sq')}" 
                         style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;">
                    <div class="collection-text">
                        <strong class="collection-title">${col.label.split(' - ')[0]}</strong>
                        <span class="collection-age">${col.label.split(' - ').slice(1).join(' - ')}</span>
                        <span class="collection-detail">${col.date} · ${col.photos.length} 張</span>
                    </div>
                </div>
                <div class="collection-check" style="display: none;">✓</div>
            </button>
        `).join('');
    }

    document.getElementById('collectionListLoading').style.display = 'none';
    listEl.style.display = 'block';
}

/**
 * 選擇相集
 */
function selectCollection(element) {
    // 移除其他選取
    document.querySelectorAll('.collection-item').forEach(el => {
        el.classList.remove('selected');
        el.setAttribute('aria-pressed','false');
        el.querySelector('.collection-check').style.display = 'none';
    });

    // 選取當前
    element.classList.add('selected');
    element.setAttribute('aria-pressed','true');
    element.querySelector('.collection-check').style.display = 'block';

    moveCollectionState.targetDate = element.dataset.date;
    moveCollectionState.targetLabel = element.dataset.label;
    document.getElementById('collectionSelectionPrompt').textContent = `已選擇：${element.dataset.label}。`;
    document.getElementById('moveCollectionConfirmBtn').disabled = false;
}

/**
 * 關閉移動相集 Modal
 */
function closeMoveCollectionModal() {
    document.getElementById('moveCollectionModal').classList.add('hidden');
    moveCollectionState.targetDate = null;
}

/**
 * 確認移動相集
 */
async function confirmMoveCollection() {
    if (!moveCollectionState.targetDate) return;

    const photoIds = moveCollectionState.photoIds;
    const count = photoIds.length;
    const targetLabel = moveCollectionState.targetLabel;
    const targetDate = moveCollectionState.targetDate + ' 12:00:00';

    if (!await TimehutDialogs.confirm(`將 ${count} 張照片合併至「${targetLabel}」。\n拍攝日時會改為 ${targetDate}，照片原檔不變。`, {title:'確認修改拍攝日時',confirmText:'修改日期並合併'})) return;

    const btn = document.getElementById('moveCollectionConfirmBtn');
    btn.disabled = true;
    btn.textContent = '處理中...';

    try {
        const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photos/update-date`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds, targetDate })
        });

        const result = await response.json();

        if (response.ok) {
            const { succeeded, failed } = TimehutResults.confirmed(result, photoIds);
            const done = new Set(succeeded);
            TimelineState.photos.forEach(photo => { if (done.has(String(photo.id))) photo.datetaken = targetDate; });
            removeConfirmedTimelineSelections(succeeded);
            if (succeeded.length) refreshTimelineAfterBatch();
            moveCollectionState.photoIds = failed;
            document.getElementById('moveCollectionCount').textContent = failed.length;
            if (failed.length) {
                if (succeeded.length) refreshMoveCollectionDateCounts(succeeded, targetDate);
                alert(`已更新 ${succeeded.length}/${photoIds.length} 張的日期；${failed.length} 張未完成，僅保留未完成項目供重試`);
                return;
            }
            TimehutResults.invalidateAlbumCache();
            showToast(result.message || '移動成功', 'success');
            closeMoveCollectionModal();

            // Clear selection based on mode
            if (moveCollectionState.isFromMomentSelection) {
                MomentSelectionState.selectedMoments.clear();
                toggleMomentSelectMode();
            } else {
                SelectionState.selectedPhotos.clear();
                toggleSelectMode();
            }

            setTimeout(() => location.reload(), 1000);
        } else {
            alert('移動失敗: ' + (result.error || result.message));
        }
    } catch (error) {
        alert('移動失敗: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '確認移動';
    }
}

// Export functions
window.batchMoveToCollection = batchMoveToCollection;
window.showMoveCollectionModal = showMoveCollectionModal;
window.selectCollection = selectCollection;
window.closeMoveCollectionModal = closeMoveCollectionModal;
window.confirmMoveCollection = confirmMoveCollection;
window.renderCollectionList = renderCollectionList;
