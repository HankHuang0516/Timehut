/**
 * 黃家小屋 - 工具函數
 * Utility functions for Timehut Clone
 */

/**
 * 計算從出生日期到照片日期的年齡
 * @param {string|Date} birthDate - 出生日期
 * @param {string|Date} targetDate - 目標日期（照片拍攝日期）
 * @returns {Object} { years, months, days, totalDays }
 */
function calculateAge(birthDate, targetDate) {
    const birth = new Date(birthDate);
    const target = new Date(targetDate);

    // Calculate total days for sorting
    const totalDays = Math.floor((target - birth) / (1000 * 60 * 60 * 24));

    let years = target.getFullYear() - birth.getFullYear();
    let months = target.getMonth() - birth.getMonth();
    let days = target.getDate() - birth.getDate();

    // Adjust for negative days
    if (days < 0) {
        months--;
        const lastMonth = new Date(target.getFullYear(), target.getMonth(), 0);
        days += lastMonth.getDate();
    }

    // Adjust for negative months
    if (months < 0) {
        years--;
        months += 12;
    }

    return { years, months, days, totalDays };
}

/**
 * 格式化年齡字串
 * @param {number} years - 年
 * @param {number} months - 月
 * @param {number} days - 日
 * @returns {string} 格式化的年齡字串
 */
function formatAgeString(years, months, days) {
    const parts = [];

    if (years > 0) {
        parts.push(`${years}歲`);
    }

    if (months > 0) {
        parts.push(`${months}個月`);
    }

    if (years === 0 && months === 0 && days >= 0) {
        parts.push(`${days}天`);
    }

    return parts.join('') || '剛出生';
}

/**
 * 取得年齡的簡短標籤（用於分組）
 * @param {number} years - 年
 * @param {number} months - 月
 * @returns {string} 簡短年齡標籤
 */
function getAgeLabel(years, months) {
    if (years >= 1) {
        return `${years}歲`;
    } else if (months >= 1) {
        return `${months}個月`;
    } else {
        return '新生兒';
    }
}

/**
 * 取得用於排序的年齡 key
 * @param {number} years - 年
 * @param {number} months - 月
 * @returns {string} 排序 key
 */
function getAgeSortKey(years, months) {
    return years * 100 + months;
}

/**
 * 將照片按年齡分組
 * @param {Array} photos - 照片陣列
 * @param {string} birthDate - 出生日期
 * @returns {Object} 按年齡分組的照片物件
 */
function groupPhotosByAge(photos, birthDate) {
    const groups = {};

    photos.forEach(photo => {
        const photoDate = photo.datetaken || photo.dateupload * 1000;
        const age = calculateAge(birthDate, new Date(photoDate));
        const label = getAgeLabel(age.years, age.months);
        const sortKey = getAgeSortKey(age.years, age.months);

        if (!groups[label]) {
            groups[label] = {
                label,
                sortKey,
                photos: []
            };
        }

        groups[label].photos.push({
            ...photo,
            age,
            ageString: formatAgeString(age.years, age.months, age.days)
        });
    });

    // Sort groups by age (newest first)
    return Object.values(groups).sort((a, b) => b.sortKey - a.sortKey);
}

/**
 * 格式化日期為易讀格式
 * @param {string|Date|number} date - 日期
 * @returns {string} 格式化的日期字串
 */
function formatDate(date) {
    const d = new Date(typeof date === 'number' ? date * 1000 : date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${year}年${month}月${day}日`;
}

/**
 * 建立年齡導航資料
 * @param {string} birthDate - 出生日期
 * @returns {Array} 年齡導航項目陣列
 */
function generateAgeNavigation(birthDate) {
    const now = new Date();
    const age = calculateAge(birthDate, now);
    const items = [];

    // Add year milestones
    for (let y = age.years; y >= 0; y--) {
        items.push({
            label: y > 0 ? `${y}歲` : '新生兒',
            value: y,
            type: 'year'
        });
    }

    return items;
}

/**
 * 防抖函數
 * @param {Function} func - 要防抖的函數
 * @param {number} wait - 等待時間（毫秒）
 * @returns {Function} 防抖後的函數
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 節流函數
 * @param {Function} func - 要節流的函數
 * @param {number} limit - 限制時間（毫秒）
 * @returns {Function} 節流後的函數
 */
function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
