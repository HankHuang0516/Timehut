/**
 * 黃家小屋 - Flickr API 整合
 * Flickr API Integration for Timehut Clone
 */

const FlickrAPI = {
    /**
     * 呼叫 Flickr API
     * @param {string} method - API 方法名稱
     * @param {Object} params - 額外參數
     * @returns {Promise<Object>} API 回應
     */
    async call(method, params = {}) {
        const url = new URL(CONFIG.FLICKR_API_BASE);

        const queryParams = {
            method,
            api_key: CONFIG.FLICKR_API_KEY,
            format: 'json',
            nojsoncallback: 1,
            ...params
        };

        Object.entries(queryParams).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });

        try {
            const response = await fetch(url.toString());

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.stat !== 'ok') {
                throw new Error(data.message || 'Flickr API error');
            }

            return data;
        } catch (error) {
            console.error('Flickr API Error:', error);
            throw error;
        }
    },

    /**
     * 取得使用者的相簿列表
     * @returns {Promise<Array>} 相簿列表
     */
    async getAlbums() {
        const data = await this.call('flickr.photosets.getList', {
            user_id: CONFIG.FLICKR_USER_ID
        });

        return data.photosets?.photoset || [];
    },

    /**
     * 取得相簿中的照片
     * @param {string} albumId - 相簿 ID
     * @param {number} page - 頁碼
     * @param {number} perPage - 每頁數量
     * @returns {Promise<Object>} { photos, total, pages }
     */
    /**
     * 取得相簿中的照片 (透過後端 Proxy 以存取私有照片)
     * @param {string} albumId - 相簿 ID
     * @param {number} page - 頁碼
     * @param {number} perPage - 每頁數量
     * @returns {Promise<Object>} { photos, total, pages }
     */
    async getAlbumPhotos(albumId, page = 1, perPage = CONFIG.PHOTOS_PER_PAGE) {
        // Use backend proxy to access private photos
        const url = `${CONFIG.UPLOAD_API_URL}/api/album/${albumId}/photos?page=${page}&per_page=${perPage}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data.stat !== 'ok') {
                throw new Error(data.message || 'Flickr API error');
            }

            const photoset = data.photoset;
            return {
                photos: photoset.photo || [],
                total: parseInt(photoset.total, 10),
                pages: parseInt(photoset.pages, 10),
                page: parseInt(photoset.page, 10)
            };
        } catch (error) {
            console.error('API Proxy Error:', error);
            throw error;
        }
    },

    /**
     * 取得使用者所有公開照片（如果沒有設定相簿）
     * @param {number} page - 頁碼
     * @param {number} perPage - 每頁數量
     * @returns {Promise<Object>} { photos, total, pages }
     */
    async getPublicPhotos(page = 1, perPage = CONFIG.PHOTOS_PER_PAGE) {
        const data = await this.call('flickr.people.getPublicPhotos', {
            user_id: CONFIG.FLICKR_USER_ID,
            extras: 'date_taken,date_upload,description,tags,url_sq,url_t,url_s,url_m,url_l,url_o,media',
            page,
            per_page: perPage
        });

        const photos = data.photos;

        return {
            photos: photos.photo || [],
            total: parseInt(photos.total, 10),
            pages: parseInt(photos.pages, 10),
            page: parseInt(photos.page, 10)
        };
    },

    /**
     * 取得照片詳細資訊
     * @param {string} photoId - 照片 ID
     * @returns {Promise<Object>} 照片資訊
     */
    async getPhotoInfo(photoId) {
        const data = await this.call('flickr.photos.getInfo', {
            photo_id: photoId
        });

        return data.photo;
    },

    /**
     * 取得影片來源 URL (透過 getSizes)
     * @param {Object} photo - 照片物件
     * @returns {Promise<string>} 影片 URL (MP4)
     */
    /**
     * 取得影片來源 URL (透過 getSizes)
     * @param {Object} photo - 照片物件
     * @returns {Promise<string>} 影片 URL (MP4)
     */
    async getVideoUrl(photo) {
        try {
            // Use backend proxy to access private video sizes
            const url = `${CONFIG.UPLOAD_API_URL}/api/photo/${photo.id}/sizes`;
            const response = await fetch(url);

            if (!response.ok) {
                // If proxy fails (e.g. not connected), maybe try direct call as backup?
                // But mostly we need proxy for private. Let's throw to trigger fallback
                throw new Error(`Proxy error: ${response.status}`);
            }

            const data = await response.json();

            if (data.stat !== 'ok') {
                throw new Error(data.message || 'Flickr API error');
            }

            const sizes = data.sizes.size;
            // 找尋 media="video" 的來源，或者最大的 video 格式
            // 通常 label 為 "Site MP4", "Mobile MP4", "HD MP4", "Video Original"

            const sizes = data.sizes.size;
            console.log('[FlickrAPI] Video Sizes Available:', sizes.filter(s => s.media === 'video'));

            // 優先順序: Site MP4 (通常是最佳 MP4) > HD MP4 > Mobile MP4 > Video Original
            // 因為 "Video Original" 可能是網頁播放器連結，而非直接檔案
            const videoLabels = ['Site MP4', 'HD MP4', 'Mobile MP4', 'Video Original'];
            let videoSource = null;

            for (const label of videoLabels) {
                const found = sizes.find(s => s.label === label && s.media === 'video');
                if (found) {
                    videoSource = found;
                    break;
                }
            }

            // 如果沒找到指定標籤，退回任何影片來源
            if (!videoSource) {
                videoSource = sizes.find(s => s.media === 'video');
            }

            // 最後隨便找一個是 video 的
            if (!videoSource) {
                videoSource = sizes.find(s => s.media === 'video');
            }

            return videoSource ? videoSource.source : this.getPhotoUrl(photo, 'o');
        } catch (error) {
            console.error('Failed to get video url:', error);
            // Fallback to direct call (might fail for private) or original photo url
            try {
                const data = await this.call('flickr.photos.getSizes', { photo_id: photo.id });
                // ... same logic if we want to dupe it, but for now just fallback to .o
                // actually, if proxy failed, maybe we are local/offline or it's public? 
                // Let's just return the best guess
            } catch (e) { }
            return this.getPhotoUrl(photo, 'o');
        }
    },

    /**
     * 建構照片 URL
     * @param {Object} photo - 照片物件
     * @param {string} size - 尺寸代碼 (sq, t, s, m, l, o)
     * @returns {string} 照片 URL
     */
    getPhotoUrl(photo, size = 'm') {
        // If URL is already in photo object
        const urlKey = `url_${size}`;
        if (photo[urlKey]) {
            return photo[urlKey];
        }

        // Build URL from photo data
        const sizeMap = {
            'sq': '_sq',  // 75x75
            't': '_t',    // 100px
            's': '_s',    // 240px
            'm': '_m',    // 500px
            'l': '_b',    // 1024px
            'o': '_o'     // Original
        };

        const suffix = sizeMap[size] || '_m';
        return `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}${suffix}.jpg`;
    },

    /**
     * 建構照片頁面 URL
     * @param {Object} photo - 照片物件
     * @returns {string} Flickr 照片頁面 URL
     */
    getPhotoPageUrl(photo) {
        return `https://www.flickr.com/photos/${CONFIG.FLICKR_USER_ID}/${photo.id}`;
    },

    /**
     * 搜尋照片（支援標籤搜尋）
     * For private photos, uses local filtering from pre-loaded album data
     * @param {string} query - 搜尋關鍵字
     * @param {Object} options - 額外選項 (albumId, page, perPage, allPhotos)
     * @returns {Promise<Object>} 搜尋結果
     */
    async searchPhotos(query, options = {}) {
        // If we have pre-loaded photos, filter locally (for private albums)
        if (options.allPhotos && options.allPhotos.length > 0) {
            const filtered = this.filterPhotosLocally(options.allPhotos, query);
            const page = options.page || 1;
            const perPage = options.perPage || 50;
            const start = (page - 1) * perPage;
            const paged = filtered.slice(start, start + perPage);

            return {
                photos: paged,
                total: filtered.length,
                pages: Math.ceil(filtered.length / perPage),
                page: page
            };
        }

        // Fallback: try Flickr public API search (for public photos)
        try {
            const data = await this.call('flickr.photos.search', {
                user_id: CONFIG.FLICKR_USER_ID,
                text: query,
                tags: query.replace(/\s+/g, ','),
                tag_mode: 'any',
                extras: 'date_taken,date_upload,description,tags,url_sq,url_t,url_s,url_m,url_l,media',
                page: options.page || 1,
                per_page: options.perPage || CONFIG.PHOTOS_PER_PAGE
            });

            const photos = data.photos;
            return {
                photos: photos.photo || [],
                total: parseInt(photos.total, 10),
                pages: parseInt(photos.pages, 10),
                page: parseInt(photos.page, 10)
            };
        } catch (error) {
            console.error('Search API failed, returning empty:', error);
            return { photos: [], total: 0, pages: 0, page: 1 };
        }
    },

    /**
     * 本地過濾照片（搜尋標題、描述、標籤）
     * @param {Array} photos - 照片陣列
     * @param {string} query - 搜尋關鍵字
     * @returns {Array} 過濾後的照片
     */
    filterPhotosLocally(photos, query) {
        if (!query) return photos;

        const lowerQuery = query.toLowerCase();

        return photos.filter(photo => {
            const title = (photo.title || '').toLowerCase();
            // Handle Flickr description which can be { _content: "..." } or string
            let descStr = '';
            if (photo.description) {
                if (typeof photo.description === 'object' && photo.description._content) {
                    descStr = photo.description._content;
                } else if (typeof photo.description === 'string') {
                    descStr = photo.description;
                }
            }
            const description = descStr.toLowerCase();
            const tags = (photo.tags || '').toLowerCase();

            return title.includes(lowerQuery) ||
                description.includes(lowerQuery) ||
                tags.includes(lowerQuery);
        });
    }
};

// Make FlickrAPI globally available
window.FlickrAPI = FlickrAPI;
