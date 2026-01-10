/**
 * 合併標籤資料到照片 JSON
 * 將 timehut_photo_tags.json 中的標籤資訊合併到 timehut_photos.json
 */

const fs = require('fs');
const path = require('path');

// 讀取檔案
const photosPath = path.join(__dirname, '..', 'timehut_photos.json');
const tagsPath = path.join(__dirname, '..', 'timehut_photo_tags.json');
const outputPath = path.join(__dirname, '..', 'timehut_photos_with_tags.json');

console.log('📂 讀取照片資料...');
const photos = JSON.parse(fs.readFileSync(photosPath, 'utf8'));
console.log(`   找到 ${photos.length} 張照片`);

console.log('🏷️ 讀取標籤資料...');
const tagsData = JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
console.log(`   找到 ${tagsData.length} 筆標籤資料`);

// 建立檔名 -> 標籤的對照表
const tagMap = new Map();
tagsData.forEach(item => {
    // 從 URL 提取檔名
    const filename = item.url.split('/').pop().split('?')[0].split('!')[0];
    tagMap.set(filename, item.tags);
});
console.log(`   建立了 ${tagMap.size} 個檔名對照`);

// 合併標籤到照片資料
let matchedCount = 0;
const merged = photos.map(photo => {
    const filename = photo.url.split('/').pop().split('?')[0].split('!')[0];
    const tags = tagMap.get(filename);

    if (tags && tags.length > 0) {
        matchedCount++;
        return {
            ...photo,
            filename,
            tags
        };
    }

    return {
        ...photo,
        filename,
        tags: []
    };
});

console.log(`\n✅ 合併完成！`);
console.log(`   總照片數：${merged.length}`);
console.log(`   有標籤的照片：${matchedCount}`);
console.log(`   無標籤的照片：${merged.length - matchedCount}`);

// 統計標籤使用情況
const tagStats = {};
merged.forEach(photo => {
    photo.tags.forEach(tag => {
        tagStats[tag] = (tagStats[tag] || 0) + 1;
    });
});

console.log('\n📊 標籤統計：');
Object.entries(tagStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tag, count]) => {
        console.log(`   ${tag}: ${count} 張`);
    });

// 輸出合併後的檔案
fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2), 'utf8');
console.log(`\n📁 已儲存到: ${outputPath}`);
