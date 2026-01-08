/**
 * 時光小屋 - 配置檔案
 * Configuration for Timehut Clone
 */

const CONFIG = {
    // Flickr API Configuration
    FLICKR_API_KEY: 'YOUR_API_KEY_HERE', // 請替換成你的 API Key
    FLICKR_USER_ID: 'twopiggyhavefun',
    
    // Children Configuration
    CHILDREN: [
        {
            name: '大寶',
            birthDate: '2019-11-11',
            albumId: '', // 請填入 Flickr 相簿 ID
            emoji: '👶'
        },
        {
            name: '小寶',
            birthDate: '2022-09-05',
            albumId: '', // 請填入 Flickr 相簿 ID
            emoji: '👼'
        }
    ],
    
    // UI Settings
    PHOTOS_PER_PAGE: 50,
    
    // Flickr API Base URL
    FLICKR_API_BASE: 'https://api.flickr.com/services/rest/'
};

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
