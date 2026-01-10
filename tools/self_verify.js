/**
 * 黃家小屋 - 部署前自動驗證腳本
 * Pre-deployment self-verification script
 * 
 * 使用方式: node tools/self_verify.js
 */

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

const log = {
    pass: (msg) => console.log(`${colors.green}✅ PASS${colors.reset}: ${msg}`),
    fail: (msg) => console.log(`${colors.red}❌ FAIL${colors.reset}: ${msg}`),
    warn: (msg) => console.log(`${colors.yellow}⚠️ WARN${colors.reset}: ${msg}`),
    info: (msg) => console.log(`${colors.blue}ℹ️ INFO${colors.reset}: ${msg}`)
};

// Test results
const results = {
    passed: 0,
    failed: 0,
    warnings: 0
};

// ========================================
// Test Functions
// ========================================

/**
 * 檢查後端 API 健康狀態
 */
async function checkBackendHealth() {
    log.info('檢查後端 API 狀態...');

    try {
        const response = await fetch('https://just-healing-production.up.railway.app/api/auth/status');
        const data = await response.json();

        if (data.version) {
            log.pass(`後端版本: ${data.version}`);
            results.passed++;
        } else {
            log.warn('後端未返回版本號');
            results.warnings++;
        }

        if (data.authenticated) {
            log.pass('Flickr 授權: 有效');
            results.passed++;
        } else {
            log.fail('Flickr 授權: 已失效，需要重新授權！');
            results.failed++;
        }

        return true;
    } catch (error) {
        log.fail(`後端連線失敗: ${error.message}`);
        results.failed++;
        return false;
    }
}

/**
 * 檢查前端關鍵檔案語法
 */
function checkFrontendSyntax() {
    log.info('檢查前端 JavaScript 語法...');

    const jsFiles = [
        'js/config.js',
        'js/flickr.js',
        'js/timeline.js',
        'js/uploader.js',
        'js/utils.js'
    ];

    let allPassed = true;

    for (const file of jsFiles) {
        const filePath = path.join(__dirname, '..', file);

        if (!fs.existsSync(filePath)) {
            log.warn(`檔案不存在: ${file}`);
            results.warnings++;
            continue;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            // Basic syntax check using Function constructor
            new Function(content);
            log.pass(`語法正確: ${file}`);
            results.passed++;
        } catch (error) {
            log.fail(`語法錯誤: ${file} - ${error.message}`);
            results.failed++;
            allPassed = false;
        }
    }

    return allPassed;
}

/**
 * 檢查設定檔關鍵值
 */
function checkConfiguration() {
    log.info('檢查設定檔...');

    const configPath = path.join(__dirname, '..', 'js', 'config.js');
    const content = fs.readFileSync(configPath, 'utf8');

    // Check PHOTOS_PER_PAGE
    const perPageMatch = content.match(/PHOTOS_PER_PAGE:\s*(\d+)/);
    if (perPageMatch) {
        const perPage = parseInt(perPageMatch[1]);
        if (perPage >= 100) {
            log.pass(`PHOTOS_PER_PAGE: ${perPage} (足夠大)`);
            results.passed++;
        } else {
            log.warn(`PHOTOS_PER_PAGE: ${perPage} (建議設為 500)`);
            results.warnings++;
        }
    }

    // Check album IDs are set
    const albumIdMatch = content.match(/albumId:\s*'(\d+)'/g);
    if (albumIdMatch && albumIdMatch.length >= 2) {
        log.pass(`相簿 ID: 已設定 ${albumIdMatch.length} 個`);
        results.passed++;
    } else {
        log.fail('相簿 ID: 未正確設定');
        results.failed++;
    }

    // Check API URL
    if (content.includes('just-healing-production.up.railway.app')) {
        log.pass('UPLOAD_API_URL: 指向 Railway 生產環境');
        results.passed++;
    } else {
        log.warn('UPLOAD_API_URL: 可能指向本地環境');
        results.warnings++;
    }
}

/**
 * 檢查 Flickr 相簿照片數量
 */
async function checkAlbumPhotoCount() {
    log.info('檢查 Flickr 相簿照片數量...');

    try {
        const response = await fetch('https://just-healing-production.up.railway.app/api/album/72177720331376949/photos?page=1&per_page=1');
        const data = await response.json();

        if (data.stat === 'ok' && data.photoset) {
            const total = parseInt(data.photoset.total);
            log.pass(`漢堡相簿照片數: ${total}`);
            results.passed++;

            if (total < 100) {
                log.warn('照片數量偏少，請確認上傳是否完成');
                results.warnings++;
            }
        } else {
            log.fail('無法取得相簿資訊');
            results.failed++;
        }
    } catch (error) {
        log.fail(`相簿檢查失敗: ${error.message}`);
        results.failed++;
    }
}

/**
 * 檢查 server.js 關鍵函數存在
 */
function checkServerFunctions() {
    log.info('檢查後端關鍵函數...');

    const serverPath = path.join(__dirname, '..', 'server', 'server.js');

    if (!fs.existsSync(serverPath)) {
        log.warn('找不到 server/server.js');
        results.warnings++;
        return;
    }

    const content = fs.readFileSync(serverPath, 'utf8');

    const requiredFunctions = [
        'uploadToFlickr',
        'addPhotoToAlbum',
        'setPhotoDate',
        'setPhotoTags'
    ];

    for (const func of requiredFunctions) {
        if (content.includes(`function ${func}`) || content.includes(`async function ${func}`)) {
            log.pass(`函數存在: ${func}`);
            results.passed++;
        } else {
            log.fail(`函數缺失: ${func}`);
            results.failed++;
        }
    }
}

// ========================================
// Main Execution
// ========================================

async function main() {
    console.log('\n========================================');
    console.log('🔍 黃家小屋 - 部署前自動驗證');
    console.log('========================================\n');

    // Run all checks
    await checkBackendHealth();
    console.log('');

    checkFrontendSyntax();
    console.log('');

    checkConfiguration();
    console.log('');

    await checkAlbumPhotoCount();
    console.log('');

    checkServerFunctions();
    console.log('');

    // Summary
    console.log('========================================');
    console.log('📊 驗證結果摘要');
    console.log('========================================');
    console.log(`${colors.green}✅ 通過: ${results.passed}${colors.reset}`);
    console.log(`${colors.red}❌ 失敗: ${results.failed}${colors.reset}`);
    console.log(`${colors.yellow}⚠️ 警告: ${results.warnings}${colors.reset}`);

    if (results.failed > 0) {
        console.log(`\n${colors.red}❌ 驗證未通過，請修復上述問題後再部署！${colors.reset}\n`);
        process.exit(1);
    } else if (results.warnings > 0) {
        console.log(`\n${colors.yellow}⚠️ 驗證通過，但有警告需要注意。${colors.reset}\n`);
        process.exit(0);
    } else {
        console.log(`\n${colors.green}✅ 所有驗證通過，可以安全部署！${colors.reset}\n`);
        process.exit(0);
    }
}

main().catch(console.error);
