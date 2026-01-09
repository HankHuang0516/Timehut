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
            extras: 'date_taken,date_upload,description,tags,url_sq,url_t,url_s,url_m,url_l,url_o',
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
     * @param {string} query - 搜尋關鍵字
     * @param {Object} options - 額外選項
     * @returns {Promise<Object>} 搜尋結果
     */
    async searchPhotos(query, options = {}) {
        // Flickr photos.search with text searches title, description, and tags
        const data = await this.call('flickr.photos.search', {
            user_id: CONFIG.FLICKR_USER_ID,
            text: query,
            tags: query.replace(/\s+/g, ','), // Also search as tags (comma-separated)
            tag_mode: 'any',
            extras: 'date_taken,date_upload,description,tags,url_sq,url_t,url_s,url_m,url_l',
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
            const description = (photo.description?._content || photo.description || '').toLowerCase();
            const tags = (photo.tags || '').toLowerCase();

            return title.includes(lowerQuery) ||
                description.includes(lowerQuery) ||
                tags.includes(lowerQuery);
        });
    }
};

// Make FlickrAPI globally available
window.FlickrAPI = FlickrAPI;
