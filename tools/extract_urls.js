/**
 * 直接提取 Timehut URL 腳本
 * 使用 Playwright 連接到現有瀏覽器並提取資料
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '..', 'downloads', 'timehut_media_urls.json');

async function main() {
    console.log('🚀 Timehut URL 提取器\n');

    // 確保輸出資料夾存在
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log('📡 啟動瀏覽器...');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('🌐 前往 Timehut...');
    await page.goto('https://www.timehut.us/index.html#/timeline');

    // 等待頁面載入
    console.log('⏳ 等待頁面載入...');
    await page.waitForTimeout(5000);

    // 提取所有媒體 URL
    console.log('🔍 開始提取媒體 URL...');

    const result = await page.evaluate(async () => {
        const photos = new Set();
        const videos = new Set();

        const extract = () => {
            document.querySelectorAll('img').forEach(img => {
                const src = img.src || '';
                if (src.includes('peekaboocdn.com')) {
                    if (src.includes('.mp4')) {
                        videos.add(src.split('?')[0].split('!')[0]);
                    } else if (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png')) {
                        photos.add(src.split('!')[0].split('&x-oss-process')[0]);
                    }
                }
            });

            document.querySelectorAll('video, video source').forEach(v => {
                const src = v.src || v.getAttribute('src') || '';
                if (src.includes('peekaboocdn.com') && src.includes('.mp4')) {
                    videos.add(src.split('?')[0].split('&x-oss-process')[0]);
                }
            });
        };

        // 滾動整個頁面
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 2000));

        let lastHeight = 0;
        let sameHeightCount = 0;

        while (sameHeightCount < 10) {
            extract();
            window.scrollBy(0, 1000);
            await new Promise(r => setTimeout(r, 300));

            const newHeight = window.scrollY;
            if (newHeight === lastHeight) {
                sameHeightCount++;
            } else {
                sameHeightCount = 0;
                lastHeight = newHeight;
            }
        }

        extract();

        return {
            exportDate: new Date().toISOString(),
            source: 'timehut.us',
            totalPhotos: photos.size,
            totalVideos: videos.size,
            photos: Array.from(photos),
            videos: Array.from(videos)
        };
    });

    console.log(`\n📊 提取結果:`);
    console.log(`   照片: ${result.totalPhotos}`);
    console.log(`   影片: ${result.totalVideos}`);

    // 儲存到檔案
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    console.log(`\n✅ 已儲存到: ${OUTPUT_FILE}`);

    await browser.close();
    console.log('\n🎉 完成！');
}

main().catch(console.error);
