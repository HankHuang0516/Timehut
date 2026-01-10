/**
 * 黃家小屋 - 配置檔案
 * Configuration for Timehut Clone
 */

const CONFIG = {
    // ========== 安全設定 ==========
    // 家庭密碼（請自行修改）
    FAMILY_PASSWORD: 'family2026',

    // 家庭成員（可選：用於記錄誰在觀看）
    FAMILY_MEMBERS: [
        { id: 'dad', name: '爸爸', emoji: '👨' },
        { id: 'mom', name: '媽媽', emoji: '👩' },
        { id: 'grandpa', name: '爺爺', emoji: '👴' },
        { id: 'grandma', name: '奶奶', emoji: '👵' },
        { id: 'guest', name: '訪客', emoji: '👤' }
    ],

    // Flickr API Configuration
    FLICKR_API_KEY: '6c25e4db1b6b0b73a4404008ed63929c', // Flickr API Key
    FLICKR_USER_ID: '158881690@N04',

    // Children Configuration
    CHILDREN: [
        {
            name: '漢堡',
            birthDate: '2019-11-11',
            albumId: '72177720331376949', // 待設定
            emoji: '👶'
        },
        {
            name: '涵涵',
            birthDate: '2022-09-05',
            albumId: '72177720331368893', // 待設定
            emoji: '👼'
        }
    ],

    // UI Settings
    PHOTOS_PER_PAGE: 500,

    // Flickr API Base URL
    FLICKR_API_BASE: 'https://api.flickr.com/services/rest/',

    // 上傳後端 API URL
    UPLOAD_API_URL: 'https://just-healing-production.up.railway.app'
};

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
