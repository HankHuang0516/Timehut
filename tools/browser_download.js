/**
 * 瀏覽器內下載腳本
 * 
 * 使用方法：
 * 1. 登入 Timehut
 * 2. 打開 Console (F12)
 * 3. 複製貼上此腳本執行
 * 
 * 此腳本會利用瀏覽器已登入的 session 進行下載
 */

const BROWSER_DOWNLOAD_SCRIPT = `
(async function() {
    // 從 localStorage 讀取 URL
    const stored = localStorage.getItem('timehut_export');
    if (!stored) {
        alert('請先執行提取腳本建立 timehut_export!');
        return;
    }
    
    const data = JSON.parse(stored);
    const allUrls = [...data.photos, ...data.videos];
    
    // 建立下載 UI
    const ui = document.createElement('div');
    ui.innerHTML = \`
        <div id="download-panel" style="
            position: fixed; top: 10px; left: 10px; z-index: 99999;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; padding: 20px; border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            font-family: 'Segoe UI', sans-serif; min-width: 350px;
        ">
            <h2 style="margin: 0 0 15px 0; font-size: 18px;">📥 Timehut 下載器</h2>
            <div style="margin-bottom: 10px;">
                <span id="dl-progress">準備中...</span>
            </div>
            <div style="background: rgba(255,255,255,0.2); border-radius: 10px; height: 10px; overflow: hidden;">
                <div id="dl-bar" style="background: white; height: 100%; width: 0%; transition: width 0.3s;"></div>
            </div>
            <div style="margin-top: 15px; font-size: 12px;">
                <span id="dl-stats">✅ 0 | ❌ 0</span>
            </div>
            <button id="dl-start" style="
                margin-top: 15px; padding: 10px 30px; 
                background: white; color: #667eea; border: none;
                border-radius: 25px; font-weight: bold; cursor: pointer;
            ">開始下載</button>
            <button id="dl-close" style="
                margin-top: 15px; margin-left: 10px; padding: 10px 20px; 
                background: rgba(255,255,255,0.2); color: white; border: none;
                border-radius: 25px; cursor: pointer;
            ">關閉</button>
        </div>
    \`;
    document.body.appendChild(ui);
    
    let success = 0, failed = 0, current = 0;
    const total = allUrls.length;
    
    async function downloadFile(url, index) {
        try {
            const response = await fetch(url, { 
                mode: 'cors',
                credentials: 'include'
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            
            const blob = await response.blob();
            const urlParts = new URL(url);
            const filename = urlParts.pathname.split('/').pop() || \`file_\${index}.jpg\`;
            
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
            
            success++;
        } catch (e) {
            failed++;
            console.log('失敗:', url, e.message);
        }
        
        current++;
        const pct = Math.round(current / total * 100);
        document.getElementById('dl-bar').style.width = pct + '%';
        document.getElementById('dl-progress').textContent = \`\${current} / \${total} (\${pct}%)\`;
        document.getElementById('dl-stats').textContent = \`✅ \${success} | ❌ \${failed}\`;
    }
    
    document.getElementById('dl-start').onclick = async function() {
        this.disabled = true;
        this.textContent = '下載中...';
        
        // 一次下載 3 個檔案
        for (let i = 0; i < allUrls.length; i += 3) {
            const batch = allUrls.slice(i, i + 3);
            await Promise.all(batch.map((url, j) => downloadFile(url, i + j)));
            // 稍微延遲避免過載
            await new Promise(r => setTimeout(r, 100));
        }
        
        this.textContent = '完成！';
        alert(\`下載完成！\\n✅ 成功: \${success}\\n❌ 失敗: \${failed}\\n\\n請到瀏覽器的「下載」資料夾查看檔案。\`);
    };
    
    document.getElementById('dl-close').onclick = function() {
        ui.remove();
    };
})();
`;

console.log('='.repeat(60));
console.log('Timehut 瀏覽器下載腳本');
console.log('='.repeat(60));
console.log('\n步驟：');
console.log('1. 登入 https://www.timehut.us/');
console.log('2. 按 F12 打開 Console');
console.log('3. 複製以下程式碼並執行：');
console.log('='.repeat(60));
console.log(BROWSER_DOWNLOAD_SCRIPT);
console.log('='.repeat(60));
