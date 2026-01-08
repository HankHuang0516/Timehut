/**
 * 時光小屋 - 時間軸邏輯
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

/**
 * 初始化時間軸頁面
 */
async function initTimeline() {
    // Get selected child from session storage
    const selectedChild = sessionStorage.getItem('selectedChild');
    TimelineState.currentChildIndex = selectedChild !== null ? parseInt(selectedChild, 10) : 0;

    // Update UI with selected child
    updateChildDisplay();

    // Setup event listeners
    setupEventListeners();

    // Load photos
    await loadPhotos();
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
            if (!child.id?.includes('loading') && !child.id?.includes('empty')) {
                child.remove();
            }
        });
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
        const headerEl = document.createElement('div');
        headerEl.className = 'age-group-header';
        headerEl.id = `age-${group.sortKey}`;
        headerEl.innerHTML = `
            <div class="age-group-line"></div>
            <span class="age-group-label">${group.label}</span>
            <div class="age-group-line"></div>
        `;
        containerEl.insertBefore(headerEl, containerEl.querySelector('#loadingIndicator'));

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
    card.onclick = () => openModal(index);

    const imgUrl = FlickrAPI.getPhotoUrl(photo, 'm');
    const title = photo.title || '未命名';
    const date = formatDate(photo.datetaken || photo.dateupload);

    card.innerHTML = `
        <div class="photo-wrapper">
            <img src="${imgUrl}" alt="${title}" loading="lazy">
        </div>
        <div class="photo-info">
            <h3 class="photo-title">${title}</h3>
            <div class="photo-meta">
                <span class="photo-date">${date}</span>
                <span class="photo-age">${photo.ageString}</span>
            </div>
        </div>
    `;

    return card;
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
 * 處理搜尋
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

    // Show loading
    loadingEl.style.display = 'block';

    // Clear existing photos
    Array.from(containerEl.children).forEach(child => {
        if (!child.id?.includes('loading') && !child.id?.includes('empty')) {
            child.remove();
        }
    });

    try {
        const result = await FlickrAPI.searchPhotos(query);
        const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];

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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initTimeline);

// Make functions globally available for onclick handlers
window.closeModal = closeModal;
window.navigatePhoto = navigatePhoto;
window.scrollToAge = scrollToAge;
