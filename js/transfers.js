/* Native capabilities come from the installed plugin; a PWA stays a web client. */
window.TimehutTransfers = (() => {
    const key = 'timehut_transfer_receipts_v1';
    let plugin = null;
    let webPoll = null;
    const drafts = new Map();
    function friendlyTransferMessage(row={}) {
        if(row.requiresReselection)return "原檔尚未準備完成，請重新選取原檔；原任務紀錄會保留。";
        if(row.duplicateOf)return "已依先前完成紀錄略過此原檔，沒有再次傳送。";
        if(row.stage==='completed')return "照片已保存成功。";
        if(row.retryBlocked)return '上傳結果仍在確認中，請保留原檔；請勿重複上傳。';
        if(['waiting_wifi','waiting_network'].includes(row.stage))return '正在等待可用網路，原檔會保留。';
        if(row.stage==='cancelled')return '已停止這次傳輸，已完成的照片仍保留。';
        if(row.direction==='download')return '照片尚未下載或保存完成，請查看狀態後重試。';
        if(row.stage==='waiting_account')return '請確認已登入原帳戶後按重試；原檔與收據保留。';
        if(row.stage==='waiting_system')return row.waitReason||'手機系統尚未接受傳輸，請回到 App 後按重試；原檔與收據保留。';
        return '這次傳輸尚未完成，原檔會保留。請確認網路後使用下方操作繼續。';
    }
    const labels = {preparing:'準備檔案',queued:'等待送出',transferring:'手機傳輸中',waiting_network:'等待網路',waiting_wifi:'等待 Wi-Fi',waiting_system:'等待手機系統',waiting_account:'等待原帳戶確認',server_accepted:'照片已送達，正在處理',server_processing:'照片處理中',file_ready:'已下載至 App',saving:'保存至手機相簿',saved:'已保存至手機相簿',completed:'已完成',photo_deleted:'照片已刪除',failed:'未完成',cancelled:'手機傳輸已停止'};
    const webCapabilities = {nativeBackgroundUpload:false,nativeBackgroundDownload:false,photoLibrarySave:false,completionNotifications:false,localThumbnails:false,platform:'web'};
    const ready = (async () => {
        const cap = window.Capacitor;
        if (!cap?.isNativePlatform?.()) return webCapabilities;
        if (!cap.isPluginAvailable?.('TimehutTransfer')) return {...webCapabilities,platform:cap.getPlatform?.() || 'native',nativeError:'原生傳輸功能未能啟動，請先確認 App 安裝與儲存狀態'};
        try {
            plugin = cap.registerPlugin('TimehutTransfer');
            const capabilities=await plugin.capabilities();
            if(cap.getPlatform?.()==='android') {
                const raw=plugin,owned=new Set(['list','thumbnail','prepareUpload','enqueueUpload','enqueueDownload','cancel','retry','retryMany','removeMany','saveToPhotos','deviceMediaStatus','deviceMediaAlbums','requestDeviceMedia','openDeviceMediaSettings','deviceMediaList','deviceMediaReconcile','deviceMediaThumbnail','uploadDeviceMedia']);
                plugin=new Proxy(raw,{get(target,name){return owned.has(name)?options=>window.TimehutAccounts.transfer(name,options):Reflect.get(target,name);}});
            }
            return capabilities;
        }
        catch (error) { plugin = null; return {...webCapabilities,platform:cap.getPlatform?.() || 'native',nativeError:'手機傳輸功能暫時無法啟動，請重新開啟 App；原有紀錄會保留。'}; }
    })();
    // Small previews live only in this page's memory. No arbitrary image URL or private path is loaded.
    const thumbnailCache = new Map(), thumbnailQueue = [];
    let thumbnailActive = 0;
    const thumbnailKey = row => JSON.stringify([row.id,row.direction,row.mediaType,row.direction === 'upload' ? row.sourceReference : row.destinationReference,row.byteSize]);
    function validThumbnail(result) {
        const prefix='data:image/jpeg;base64,';
        if(result?.available !== true || !Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width < 1 || result.height < 1 || result.width > 160 || result.height > 160 || typeof result.dataUrl !== 'string' || result.dataUrl.length > 87408 || !result.dataUrl.startsWith(prefix)) return null;
        const base64=result.dataUrl.slice(prefix.length);
        if(!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
        try { const bytes=atob(base64);if(bytes.length > 65536 || bytes.length < 5 || bytes.charCodeAt(0)!==255 || bytes.charCodeAt(1)!==216 || bytes.charCodeAt(2)!==255 || bytes.charCodeAt(bytes.length-2)!==255 || bytes.charCodeAt(bytes.length-1)!==217)return null; }
        catch (_) { return null; }
        return result.dataUrl;
    }
    function pumpThumbnails() {
        while(thumbnailActive < 2 && thumbnailQueue.length) {
            const entry=thumbnailQueue.shift();
            if(entry.expired) { entry.finished=true;continue; }
            entry.running=true;thumbnailActive++;
            Promise.resolve().then(()=>plugin.thumbnail({id:entry.id})).then(validThumbnail).catch(()=>null).then(data=>{
                clearTimeout(entry.timer);entry.data=data;entry.promise=Promise.resolve(data);entry.resolve(data);
            }).finally(()=>{entry.running=false;entry.finished=true;thumbnailActive--;pumpThumbnails();});
        }
    }
    function localThumbnail(row) {
        const key=thumbnailKey(row), cached=thumbnailCache.get(key);
        if(cached) { thumbnailCache.delete(key);thumbnailCache.set(key,cached);return cached.promise; }
        if(thumbnailCache.size >= 48) {
            const discard=[...thumbnailCache].find(([,entry])=>entry.finished);
            if(!discard)return Promise.resolve(null);
            thumbnailCache.delete(discard[0]);
        }
        const entry={id:row.id,data:null,finished:false,running:false,expired:false};
        entry.promise=new Promise(resolve=>entry.resolve=resolve);
        // Stop the visible spinner without releasing a native concurrency slot while it is still decoding.
        entry.timer=setTimeout(()=>{entry.expired=true;entry.resolve(null);},8000);
        thumbnailCache.set(key,entry);thumbnailQueue.push(entry);pumpThumbnails();return entry.promise;
    }
    function markThumbnailUnavailable(row) {
        const entry=thumbnailCache.get(thumbnailKey(row));
        if(entry?.finished){entry.data=null;entry.promise=Promise.resolve(null);}
    }
    function receipts() {
        try { const rows=JSON.parse((window.TimehutStorage?.local || localStorage).getItem(key)||'[]');if(!Array.isArray(rows))throw new Error();return rows; }
        catch (_) { throw new Error('傳輸收據無法讀取，既有紀錄已保留'); }
    }
    function trackReceipt(receipt, filename, options = {}) {
        if (CONFIG.ACCOUNT_MODE) { window.dispatchEvent(new Event('timehut-receipt-changed')); return; }
        const rows = receipts();
        for (const item of receipt.results || []) {
            if (!item.localId || rows.some(row => row.serverReceiptId === item.localId)) continue;
            rows.push({id:item.localId,direction:'upload',filename,stage:'server_accepted',serverReceiptId:item.localId,createdAt:new Date().toISOString(),client:'web',albumId:options.albumId || null,byteSize:Number.isFinite(options.byteSize) ? options.byteSize : null});
        }
        (window.TimehutStorage?.local || localStorage).setItem(key, JSON.stringify(rows));
        window.dispatchEvent(new Event('timehut-receipt-changed'));
    }
    async function list() {
        await ready;
        if (plugin) return (await plugin.list()).tasks;
        if (webPoll) return webPoll;
        webPoll = pollReceipts();
        try { return await webPoll; }
        finally { webPoll = null; }
    }
    async function pollReceipts() {
        if (CONFIG.ACCOUNT_MODE) {
            const data = await window.TimehutAccounts.request('/api/uploads/status');
            if (!Array.isArray(data.items)) throw new Error('傳輸收據尚未確認');
            const rows = data.items.map(item => ({id:item.localId,serverReceiptId:item.localId,direction:'upload',filename:item.filename,albumId:item.albumId,byteSize:item.byteSize,stage:item.status==='deleted'?'photo_deleted':item.status==='completed'&&item.flickrPhotoId?'completed':item.status==='error'?'failed':item.status==='cancelled'?'cancelled':item.status==='pending'?'server_accepted':'server_processing',flickrPhotoId:item.flickrPhotoId,retryBlocked:item.retryBlocked===true,errorCode:item.error||'',createdAt:item.createdAt,client:'web'}));
            return [...rows,...await window.TimehutWebUpload.pendingReceipts()];
        }
        const rows = receipts();
        const resolved = new Set();
        await Promise.all(rows.filter(row => row.stage !== 'completed').map(async row => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
                const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/uploads/status/${encodeURIComponent(row.serverReceiptId)}`, {signal:controller.signal});
                if (!response.ok) throw new Error(response.status === 404 ? '找不到收據，尚未確認完成' : '暫時無法確認收據');
                const data = await response.json();
                // An unresolved creation must stay blocked across old-server replies and reloads.
                // A known Flickr identity is required before clearing that retained restriction.
                const saved = receipts().find(item => item.serverReceiptId === row.serverReceiptId);
                row.retryBlocked = row.retryBlocked === true || saved?.retryBlocked === true || data.retryBlocked === true;
                if (data.flickrPhotoId) row.flickrPhotoId = data.flickrPhotoId;
                if (data.flickrPhotoId && data.retryBlocked === false) { row.retryBlocked = false; resolved.add(row.serverReceiptId); }
                if (data.status === 'completed' && data.flickrPhotoId) { row.stage = 'completed'; row.retryBlocked = false; row.errorCode = ''; resolved.add(row.serverReceiptId); }
                else if (data.status === 'error') { row.stage = 'failed'; row.errorCode = data.error || 'Flickr 處理失敗'; }
                else { row.stage = 'server_processing'; row.errorCode = ''; }
                row.waitReason = '';
            } catch (error) { row.waitReason = controller.signal.aborted ? '暫時無法確認收據，請稍後重新整理' : error.message; }
            finally { clearTimeout(timeout); }
        }));
        // Upload receipts may be added, or a retry may be refused, during this poll.
        // Merge into the latest store so an old response cannot drop either change.
        const updates = new Map(rows.map(row => [row.serverReceiptId, row]));
        const merged = receipts().map(saved => {
            const update = updates.get(saved.serverReceiptId);
            if (!update || saved.stage === 'completed') return saved;
            const row = {...saved, ...update};
            if (saved.retryBlocked && !resolved.has(saved.serverReceiptId)) row.retryBlocked = true;
            return row;
        });
        (window.TimehutStorage?.local || localStorage).setItem(key, JSON.stringify(merged)); return merged;
    }
    async function mediaUrl(photo) {
        if (!photo) throw new Error('找不到可下載的媒體');
        let url = photo.url_o || photo.url_l || photo.url_m;
        if (photo.media === 'video') {
            url = `${CONFIG.UPLOAD_API_URL}/api/photo/${encodeURIComponent(photo.id)}/video?purpose=original`;
        }
        if (!url) throw new Error('沒有可下載的媒體原檔');
        return new URL(url, location.href).href;
    }
    async function download(photo) {
        const capabilities = await ready;
        if (!capabilities.nativeBackgroundDownload) return false;
        const url = await mediaUrl(photo);
        const extension = photo.media === 'video' ? 'mp4' : new URL(url, location.href).pathname.split('.').at(-1);
        await plugin.enqueueDownload({url,filename:`${photo.id}.${/^[a-z0-9]{2,5}$/i.test(extension) ? extension : 'jpg'}`,mediaType:photo.media === 'video' ? 'video' : 'photo'});
        window.dispatchEvent(new Event('timehut-receipt-changed'));
        showToast('手機系統已接受下載，可到傳輸中心查看', 'info'); return true;
    }
    async function downloadMany(photos) {
        if (!(await ready).nativeBackgroundDownload) return null;
        const accepted=[],failed=[];
        for (const photo of photos) {
            try { await download(photo); accepted.push(photo.id); }
            catch(error) { failed.push({id:photo.id,error:error.message}); }
        }
        return {accepted,failed};
    }
    async function confirmDownloads(photos) {
        if(!Array.isArray(photos)||!photos.length||photos.some(photo=>!photo?.id))throw new Error('選取檔案已變更，請重新選取');
        let timer;
        const capabilities=await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('傳輸功能暫時無法確認，請稍後重試')),8000);})]).finally(()=>clearTimeout(timer));
        if(capabilities.nativeError)throw new Error('手機傳輸功能暫時無法啟動，請重新開啟 App 後確認');
        let known=0,unknown=0,bytes=0;
        for(const photo of photos){
            // Only explicitly URL-bound size metadata describes the selected rendition.
            let url;try{url=await mediaUrl(photo);}catch{url=null;}
            const size=photo.downloadByteSize;
            if(typeof url==='string'&&url&&Number.isSafeInteger(size)&&size>0&&photo.downloadByteSizeUrl===url&&Number.isSafeInteger(bytes+size)){known++;bytes+=size;}else unknown++;
        }
        const sizeText=bytes<1024?`${bytes} bytes`:bytes<1024**2?`${(bytes/1024).toFixed(1)} KiB`:`${(bytes/1024**2).toFixed(1)} MiB`;
        const videos=photos.filter(photo=>photo.media==='video').length,photoCount=photos.length-videos;
        const sizeLine=unknown?(known?`已知參考容量 ${sizeText}；另有 ${unknown} 個大小未知，總容量未確認。`:`${unknown} 個檔案大小尚未取得，總容量未確認。`):`參考容量 ${sizeText}；不含打包與暫存空間。`;
        const mode=capabilities.nativeBackgroundDownload?'加入手機 App 下載佇列；完成後請到傳輸中心另行保存至相簿。':'網頁版會交由瀏覽器下載 ZIP；請保持頁面開啟，這不代表已存入手機相簿。';
        return !!await TimehutDialogs.confirm(`共 ${photos.length} 個檔案：${photoCount} 張照片、${videos} 段影片。\n${sizeLine}\n${mode}`,{title:'確認批次下載',confirmText:capabilities.nativeBackgroundDownload?'加入下載佇列':'開始下載'});
    }
    function initQueueEntry(){
        const count=document.getElementById('transferQueueCount'),detail=document.getElementById('transferQueueDetail');if(!count||!detail)return;
        let stopped=false,busy=false,pending=false,generation=0,timer;
        const write=(target,value)=>{if(target.textContent!==value)target.textContent=value;};
        async function refresh(){
            if(stopped||document.visibilityState!=='visible')return;if(busy){pending=true;return;}busy=true;const current=++generation;let timeout;
            const unavailable=()=>{if(!stopped&&current===generation){write(count,'任務數量待確認');write(detail,'暫時無法讀取任務；仍可開啟傳輸中心查看與更新狀態。');}};
            // A display deadline must not release an outstanding native read.
            timeout=setTimeout(unavailable,9000);
            try{
                const cap=await ready;
                if(stopped||current!==generation)return;
                if(cap.nativeError)throw new Error('native unavailable');
                const rows=await list();
                if(stopped||current!==generation)return;
                if(!Array.isArray(rows)||rows.some(row=>!row||typeof row.id!=='string'||!row.id||!['upload','download'].includes(row.direction)||!Object.hasOwn(labels,row.stage))||new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('invalid task list');
                const unfinished=rows.filter(row=>!['completed','saved','cancelled'].includes(row.stage));
                const uploads=unfinished.filter(row=>row.direction==='upload').length,downloads=unfinished.length-uploads,attention=unfinished.filter(row=>row.stage==='failed'||row.stage==='file_ready'||row.retryBlocked).length;
                write(count,unfinished.length?`待完成 ${unfinished.length}`:'沒有已記錄的待完成任務');
                const summary=`上傳 ${uploads} · 下載 ${downloads} · 待處理／保存 ${attention}。`;
                write(detail,summary+(cap.nativeBackgroundUpload?' 開啟傳輸中心查看進度與等待原因。':' 這裡顯示已送出的收據；網頁檔案尚在送出時，請查看上傳進度。'));
            }catch{unavailable();}
            finally{clearTimeout(timeout);busy=false;const again=pending;pending=false;if(again&&!stopped)refresh();}
        }
        function start(){stopped=false;clearInterval(timer);timer=setInterval(refresh,15000);refresh();}
        document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
        window.addEventListener('storage',event=>{if(event.key===key||event.key===null)refresh();});
        window.addEventListener('timehut-receipt-changed',refresh);
        window.addEventListener('pagehide',()=>{stopped=true;generation++;pending=false;clearInterval(timer);});
        window.addEventListener('pageshow',event=>{if(event.persisted)start();});start();
    }
    async function initCenter() {
        const listEl = document.getElementById('transferList'); if (!listEl) return;
        const capabilities = await ready;
        document.getElementById('transferCapability').textContent = capabilities.nativeError || (capabilities.nativeBackgroundUpload ? '選取後會先準備檔案與交接排程；顯示系統已接手後，即可切換 App。' : '目前為網頁版。送出期間請保持頁面開啟；照片送達後，服務會繼續整理。');
        document.getElementById('nativePickButton').hidden = !capabilities.nativeBackgroundUpload;
        const notificationToggle=document.getElementById('completionNotifications'), notificationStatus=document.getElementById('notificationStatus');
        const supportsCompletion=!!plugin && capabilities.completionNotifications===true;
        let notificationGeneration=0, notificationBusy=false, notificationState=null;
        function showNotificationState(value) {
            if(!value || typeof value.enabled!=='boolean' || typeof value.canNotify!=='boolean' || !['prompt','granted','denied','provisional'].includes(value.permission) || typeof value.systemEnabled!=='boolean' || typeof value.channelEnabled!=='boolean')throw new Error('通知設定回覆不完整，請更新狀態');
            if(value.canNotify !== (value.enabled && ['granted','provisional'].includes(value.permission) && value.systemEnabled && value.channelEnabled))throw new Error('通知設定回覆互相矛盾，請更新狀態');
            notificationState=value;notificationToggle.checked=value.enabled;
            notificationStatus.textContent=value.canNotify ? (value.permission==='provisional'?'已開啟靜音完成通知；請回傳輸中心確認結果。':'已開啟完成通知；顯示時間仍由手機系統決定。') : value.permission==='denied' ? (value.enabled?'完成通知偏好已保留，但系統尚未允許通知，請到手機設定允許；傳輸不受影響。':'系統尚未允許通知，請依手機權限提示或到系統設定允許；傳輸不受影響。') : !value.channelEnabled || (value.permission!=='prompt' && !value.systemEnabled) ? '手機系統已關閉此類通知，請在系統設定開啟；傳輸不受影響。' : '完成通知已關閉；仍可在此查看上傳、下載與保存結果。';
        }
        async function refreshNotificationSettings() {
            if(!supportsCompletion || notificationBusy)return;
            const generation=++notificationGeneration;
            try {
                const state=await plugin.notificationSettings();
                if(generation===notificationGeneration && !notificationBusy)showNotificationState(state);
            } catch(error) { if(generation===notificationGeneration && !notificationBusy)notificationStatus.textContent='通知設定暫時無法讀取，請更新狀態；傳輸不受影響。'; }
            finally { if(generation===notificationGeneration && !notificationBusy)notificationToggle.disabled=false; }
        }
        if(supportsCompletion){
            refreshNotificationSettings();
            notificationToggle.addEventListener('change',async()=>{
                if(notificationBusy)return;
                const enabled=notificationToggle.checked,generation=++notificationGeneration;
                notificationBusy=true;notificationToggle.disabled=true;notificationStatus.textContent=enabled?'請依手機提示選擇通知權限…':'正在關閉完成通知…';
                try { const state=await plugin.setCompletionNotifications({enabled});if(generation===notificationGeneration)showNotificationState(state); }
                catch(error) { if(generation===notificationGeneration){notificationToggle.checked=notificationState?.enabled===true;notificationStatus.textContent='通知設定未能確認，請更新狀態；傳輸不受影響。';} }
                finally { if(generation===notificationGeneration){notificationBusy=false;notificationToggle.disabled=false;} }
            });
            document.getElementById('refreshTransfers').addEventListener('click',refreshNotificationSettings);
            document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshNotificationSettings();});
        } else notificationStatus.textContent=plugin?'此 App 版本尚不支援完成通知；請回此頁查看結果。':'網頁版尚不支援完成通知；請回此頁查看結果。';
        const networkToggle=document.getElementById('wifiOnly'),networkStatus=document.getElementById('networkStatus');
        const supportsNetwork=!!plugin && capabilities.wifiPolicy===true;
        let networkGeneration=0,networkBusy=false,networkState=null;
        function showNetworkState(value){
            if(!value || typeof value.wifiOnly!=='boolean' || value.appliesTo!=='unfinished' || !['wifi','non-cellular'].includes(value.restriction) || !Number.isInteger(value.rescheduleFailures) || value.rescheduleFailures<0 || (value.applying!==undefined && typeof value.applying!=='boolean'))throw new Error('網路設定回覆不完整');
            if(value.restriction !== (capabilities.platform==='ios'?'non-cellular':'wifi'))throw new Error('網路限制與平台不符');
            networkState=value;networkToggle.checked=value.wifiOnly;
            document.getElementById('wifiOnlyLabel').textContent=value.restriction==='non-cellular'?'僅 Wi-Fi／有線網路傳輸':'僅 Wi-Fi 傳輸';
            networkStatus.textContent=value.applying?'已保存設定；未完成任務正在切換，原檔與收據保留。':value.rescheduleFailures>0?'設定已保存；部分任務仍在等待，請查看下方狀態後重試。':value.wifiOnly?(value.restriction==='non-cellular'?'所有未完成傳輸僅使用 Wi-Fi／有線網路，不使用行動數據。':'所有未完成傳輸僅使用 Wi-Fi，沒有 Wi-Fi 時保留原檔等待。'):'未限制 Wi-Fi，未完成傳輸可能使用行動數據。';
        }
        async function refreshNetworkSettings(){
            if(!supportsNetwork || networkBusy)return;
            const generation=++networkGeneration;
            try{const state=await plugin.networkSettings();if(generation===networkGeneration && !networkBusy)showNetworkState(state);}
            catch(error){if(generation===networkGeneration && !networkBusy)networkStatus.textContent='網路設定暫時無法確認，請更新狀態；不要依勾選外觀判斷是否已限制。';}
            finally{if(generation===networkGeneration && !networkBusy)networkToggle.disabled=false;}
        }
        if(supportsNetwork){
            refreshNetworkSettings();
            networkToggle.addEventListener('change',async()=>{
                if(networkBusy)return;const enabled=networkToggle.checked,generation=++networkGeneration;
                networkBusy=true;networkToggle.disabled=true;networkStatus.textContent='正在套用至未完成任務；原檔與收據會保留…';
                try{const state=await plugin.setWifiOnly({enabled});if(generation===networkGeneration)showNetworkState(state);await render();}
                catch(error){if(generation===networkGeneration){networkToggle.checked=networkState?.wifiOnly===true;networkStatus.textContent='網路設定未能確認，請更新狀態；原檔與收據保留。';}}
                finally{if(generation===networkGeneration){networkBusy=false;networkToggle.disabled=false;}}
            });
            document.getElementById('refreshTransfers').addEventListener('click',refreshNetworkSettings);
            document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshNetworkSettings();});
        }else networkStatus.textContent=plugin?'此 App 版本尚不支援 Wi-Fi 限制；請勿依此頁假設已限制網路。':'網頁版無法限制傳輸網路；請先確認手機的 Wi-Fi 連線。';
        const album = document.getElementById('transferAlbum');
        CONFIG.CHILDREN.forEach(child => album.add(new Option(child.name, child.albumId)));
        const chosenChild = Number((window.TimehutStorage?.local || localStorage).getItem('timehut_current_child'));
        if (Number.isInteger(chosenChild) && CONFIG.CHILDREN[chosenChild]) album.value = CONFIG.CHILDREN[chosenChild].albumId;
        const previewObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries=>{
            entries.forEach(entry=>{if(entry.isIntersecting){previewObserver.unobserve(entry.target);entry.target.loadPreview?.();}});
        },{rootMargin:'160px 0px'}) : null;
        const previewFrames=new Map();
        function previewFor(row) {
            const key=thumbnailKey(row),existing=previewFrames.get(key);
            if(existing){if(existing.dataset.previewState!=='ready')previewObserver?.observe(existing);return existing;}
            const video=row.mediaType==='video', kind=video?'影片':row.mediaType==='photo'?'照片':'檔案';
            const frame=document.createElement('div');frame.className='transfer-thumbnail';frame.dataset.previewState='unavailable';frame.setAttribute('role','img');frame.setAttribute('aria-label',`${kind}：${row.filename}，暫無本機預覽`);previewFrames.set(key,frame);
            const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('transfer-thumbnail-symbol');
            const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',video?'M4 5h11v14H4z M15 9l5-3v12l-5-3':'M3 4h18v16H3z M4 17l5-6 4 4 3-3 5 6 M15 8h.01');svg.append(path);
            const caption=document.createElement('span');caption.className='transfer-thumbnail-kind';caption.textContent=kind;frame.append(svg,caption);
            const local= row.direction==='upload' ? row.sourceReference : ['file_ready','saving','saved'].includes(row.stage) ? row.destinationReference : '';
            if(!plugin || capabilities.localThumbnails!==true || !local || !['photo','video'].includes(row.mediaType)) return frame;
            frame.loadPreview=async()=>{
                if(!frame.isConnected||frame.previewRequested)return;
                frame.previewRequested=true;frame.dataset.previewState='loading';
                const data=await localThumbnail(row);if(!frame.isConnected)return;
                if(!data){frame.dataset.previewState='unavailable';return;}
                const img=document.createElement('img');img.alt='';img.decoding='async';
                img.onload=()=>{
                    if(!frame.isConnected)return;
                    if(img.naturalWidth < 1 || img.naturalHeight < 1 || img.naturalWidth > 160 || img.naturalHeight > 160){img.remove();frame.dataset.previewState='unavailable';markThumbnailUnavailable(row);return;}
                    frame.dataset.previewState='ready';frame.setAttribute('aria-label',`${kind}預覽：${row.filename}`);svg.style.display='none';
                };
                img.onerror=()=>{img.remove();frame.dataset.previewState='unavailable';markThumbnailUnavailable(row);};
                frame.prepend(img);img.src=data;
            };
            if(previewObserver)previewObserver.observe(frame);else queueMicrotask(()=>frame.loadPreview());
            return frame;
        }
        let filter = 'all',renderLimit=50;let queueActions=null,reselectButton=null;
        const isComplete = row => ['saved','completed','photo_deleted'].includes(row.stage);
        const albumNames = new Map(CONFIG.CHILDREN.map(child => [String(child.albumId), child.name]));
        const nameOwner = window.TimehutAccounts?.status(), nameInFlight = new Set(), nameRetryAfter = new Map();
        let namePageActive = true, renderGeneration = 0, composingEditor = null;
        const taskEditor = node => !!node?.closest?.('.transfer-task') && node.matches('input,select,textarea,[contenteditable=true]');
        listEl.addEventListener('compositionstart',event=>{if(taskEditor(event.target))composingEditor=event.target;});
        listEl.addEventListener('compositionend',event=>{if(composingEditor===event.target)composingEditor=null;});
        const sameNameOwner = () => {
            const current = window.TimehutAccounts?.status();
            return current?.authenticated && current.user?.id === nameOwner?.user?.id && current.generation === nameOwner?.generation;
        };
        const currentNameOwner = () => namePageActive && sameNameOwner();
        const albumName = id => albumNames.get(String(id)) || '尚未確認相簿';
        function resolveAlbumNames(rows) {
            if (!CONFIG.ACCOUNT_MODE || !currentNameOwner()) return;
            const ids = [...new Set(rows.filter(row => row.direction === 'upload').map(row => String(row.albumId || '')))];
            for (const id of ids) {
                if (nameInFlight.size >= 3) break;
                if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || albumNames.has(id) || nameInFlight.has(id) || (nameRetryAfter.get(id) || 0) > Date.now()) continue;
                nameInFlight.add(id);
                window.TimehutAccounts.request('/api/accounts/context?album=' + encodeURIComponent(id)).then(context => {
                    if (!currentNameOwner() || context.user?.id !== nameOwner.user.id || !Array.isArray(context.children)) return;
                    const child = context.children.find(child => child?.albumId === id);
                    if (!child || typeof child.name !== 'string' || !child.name) return;
                    albumNames.set(id, child.name);
                    listEl.querySelectorAll('[data-destination-album]').forEach(node => {
                        if (node.dataset.destinationAlbum === id) node.textContent = '上傳至：' + child.name;
                    });
                }).catch(() => {}).finally(() => {
                    nameInFlight.delete(id);
                    if (sameNameOwner() && !albumNames.has(id)) nameRetryAfter.set(id, Date.now() + 15000);
                });
            }
        }
        window.addEventListener('pagehide', () => { namePageActive = false; renderGeneration++; composingEditor=null; });
        window.addEventListener('pageshow', event => { if (event.persisted) namePageActive = true; });
        window.addEventListener('timehut-account-changed', () => { namePageActive = false; renderGeneration++; composingEditor=null; previewFrames.clear();listEl.replaceChildren();albumNames.clear(); nameRetryAfter.clear(); });
        const sizeText = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`;
        album.addEventListener('change', () => {
            listEl.querySelectorAll('[data-upload-destination]').forEach(node => { node.dataset.destinationAlbum = album.value; node.textContent = '上傳至：' + albumName(album.value); });
        });
        const enqueueStarting=new Set();
        async function enqueuePrepared(row,tagValue,destination) {
            if(enqueueStarting.has(row.id))throw new Error('這個檔案正在加入佇列，請稍候。');
            if(CONFIG.ACCOUNT_MODE&&!currentNameOwner())throw new Error('帳戶已變更，請重新開啟傳輸中心；原檔會保留。');
            if(!CONFIG.CHILDREN.some(child=>String(child.albumId)===destination))throw new Error('請先確認上傳相簿。');
            const actor=window.TimehutAccounts?.status().user;
            if(CONFIG.ACCOUNT_MODE&&!actor?.username)throw new Error('請先登入帳戶');
            const uploader=CONFIG.ACCOUNT_MODE?actor.username:CONFIG.FAMILY_MEMBERS?.[0]?.name;
            const tags=[uploader?`uploader:${uploader}`:'',String(tagValue).trim()].filter(Boolean).join(' ');
            enqueueStarting.add(row.id);
            try {
                const fresh=(await list()).find(item=>item.id===row.id);
                if(!fresh||fresh.direction!=='upload'||fresh.stage!=='queued'||fresh.endpoint)throw new Error('這個檔案已送出或狀態已變更，請核對下方任務。');
                if(stopBusy||(batchBusy&&cancelPicked))throw new Error('已要求停止這次選取，尚未送出的原檔會保留。');
                if(CONFIG.ACCOUNT_MODE&&!currentNameOwner())throw new Error('帳戶已變更，未送出的原檔會保留。');
                await plugin.enqueueUpload({id:row.id,endpoint:CONFIG.UPLOAD_API_URL,albumId:destination,tags,skipUploaded:document.getElementById("skipUploaded").checked});drafts.delete(row.id);
            }
            finally { enqueueStarting.delete(row.id); }
        }
        let renderFlight=null,renderAgain=false,renderTimer=null;
        function queueRender(){
            if(document.visibilityState!=='visible'||renderTimer!==null)return;
            renderTimer=setTimeout(()=>{renderTimer=null;render().catch(()=>{});},150);
        }
        async function render(){
            if(renderFlight){renderAgain=true;return renderFlight;}
            renderFlight=renderRows();
            try{return await renderFlight;}finally{renderFlight=null;if(renderAgain){renderAgain=false;queueRender();}}
        }
        async function renderRows() {
            const generation=++renderGeneration;
            const ownsRender=()=>generation===renderGeneration&&namePageActive&&(!CONFIG.ACCOUNT_MODE||sameNameOwner());
            const editing=()=>taskEditor(document.activeElement)||composingEditor!==null;
            if(!ownsRender()||editing())return;
            const before=window.TimehutAccounts.status();let rows=await list();const after=window.TimehutAccounts.status();
            if(!ownsRender()||editing())return;
            if(CONFIG.ACCOUNT_MODE&&(!after.authenticated||before.generation!==after.generation||before.user?.id!==after.user?.id))return;
            if(reselectButton)reselectButton.hidden=!rows.some(row=>row.requiresReselection&&row.assetIdentifier);queueActions?.observe(rows); previewObserver?.disconnect();listEl.replaceChildren();
            const latestBatch=rows.filter(row=>row.batchId).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())[0]?.batchId;
            if(latestBatch){
                const batch=rows.filter(row=>row.batchId===latestBatch),stopped=batch.filter(row=>row.stage==='cancelled').length,done=batch.filter(row=>row.stage==='completed').length;
                const preparing=batch.filter(row=>!['cancelled','photo_deleted'].includes(row.stage)),prepared=preparing.filter(row=>row.sourceReady).length;
                const unscheduled=batch.filter(row=>row.errorCode==='schedule_not_accepted'||(['queued','waiting_system'].includes(row.stage)&&row.scheduleAccepted===false));
                const attention=batch.filter(row=>['failed','waiting_account','waiting_system'].includes(row.stage)).length;
                const handingOff=capabilities.platform==='ios'&&batch.some(row=>!['completed','cancelled','failed','waiting_system','photo_deleted'].includes(row.stage)&&row.scheduleAccepted!==true);
                document.getElementById('transferCapability').textContent=batch.some(row=>row.requiresReselection)?'部分原檔尚未完成準備；請重新選取未準備完成的原檔，原任務紀錄仍保留。':handingOff?`已保留 ${batch.length} 個選取紀錄，正在準備 ${prepared}／${batch.length}。請保持此畫面開啟，等候手機系統接手。`:stopped===batch.length?'這批已停止手機傳輸；手機原檔與雲端照片保留。':done===batch.length?`這批已完成 ${done}／${batch.length}。`:unscheduled.length?`${batch.length} 個選取紀錄已保留，${unscheduled.length} 個尚未交給系統。請留在此畫面按重試。`:attention?`已完成 ${done}／${batch.length}；${attention} 個項目需要處理，請查看下方狀態。`:prepared<preparing.length?`手機系統已接手，可切換 App。正在準備 ${prepared}／${preparing.length}。`:`手機系統已接手，可切換 App。已完成 ${done}／${batch.length}`+(stopped?`，已停止 ${stopped} 個。`:'，其餘仍在傳輸或確認中。');
            }
            const retainedHistoryCount=rows.length;
            rows=rows.filter(row=>filter==='removed'?queueActions?.isRemoved(row):!queueActions?.isRemoved(row));
            const active = rows.filter(row => ['preparing','transferring','saving'].includes(row.stage)).length;
            const attention = rows.filter(row => row.canRetryQueued||['failed','cancelled','file_ready','waiting_system','waiting_account'].includes(row.stage)).length;
            const completed = rows.filter(isComplete).length;
            document.getElementById('transferSummary').textContent = `進行中 ${active} · 等待 ${rows.length-active-attention-completed} · 需處理 ${attention} · 已完成 ${completed}`;
            const visibleRows = rows.filter(row => filter === 'removed' || filter === 'all' || (filter === 'attention' ? row.retryBlocked||row.canRetryQueued||['failed','cancelled','waiting_system','waiting_account'].includes(row.stage) : filter === 'completed' ? isComplete(row) : row.direction === filter)).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()||(a.selectionIndex||0)-(b.selectionIndex||0));
            if (!visibleRows.length) { const empty = document.createElement('p'); empty.className='transfer-empty'; empty.textContent=rows.length?'目前沒有這類傳輸任務。':retainedHistoryCount?'目前清單沒有項目，可查看「已移除」紀錄或選擇新的照片。':'還沒有傳輸任務，下一段小回憶從一張照片開始。'; listEl.append(empty); }
            const previewKeys=new Set(visibleRows.slice(0,renderLimit).map(thumbnailKey));for(const key of previewFrames.keys())if(!previewKeys.has(key))previewFrames.delete(key);
            for (const row of visibleRows.slice(0,renderLimit)) {
                const card = document.createElement('article'); card.className = 'transfer-task';
                const title = document.createElement('h3'); title.textContent = row.filename;
                card.dataset.stage = row.stage;card.dataset.taskId=row.id;
                const status = document.createElement('p'); status.className='transfer-stage'; status.textContent = row.duplicateOf?"✓ 先前已上傳 · 未重複傳送":`${row.direction === 'download' ? '↓ 下載' : '↑ 上傳'} · ${row.stage==='photo_deleted' ? labels.photo_deleted : row.retryBlocked ? '需要核對上傳結果' : labels[row.stage] || '等待確認'}`;
                const detail = document.createElement('p'); detail.className='storybook-note'; detail.textContent = row.errorCode||row.waitReason ? friendlyTransferMessage(row) : Number.isFinite(row.byteSize) && row.byteSize > 0 ? `檔案大小 ${sizeText(row.byteSize)}` : '正在確認檔案大小';
                const overview=document.createElement('div');overview.className='transfer-task-overview';const meta=document.createElement('div');meta.className='transfer-task-meta';meta.append(title,status,detail);overview.append(previewFor(row),meta);card.append(overview);
                if (row.retryBlocked) {
                    const note=document.createElement('p');note.className='transfer-review-note storybook-note';
                    note.textContent=row.stage==='photo_deleted'?'照片已刪除；原上傳收據保留，不會再次上傳。手機已保存的檔案仍保留。':'上傳結果仍在確認，請先更新狀態，避免重複上傳。';card.append(note);
                }
                if (row.direction === 'upload') {
                    const destination = document.createElement('p'); destination.className='transfer-destination';
                    if (row.stage === 'queued' && !row.endpoint) destination.dataset.uploadDestination = '';
                    destination.dataset.destinationAlbum = String(row.albumId || (row.stage === 'queued' && !row.endpoint ? album.value : ''));
                    destination.textContent = '上傳至：' + albumName(destination.dataset.destinationAlbum);
                    card.append(destination);
                }
                if (['transferring','waiting_network','waiting_wifi'].includes(row.stage)) {
                    const progress = document.createElement('progress'); progress.className='transfer-progress'; progress.setAttribute('aria-label','手機檔案傳輸進度');
                    const known = Number.isFinite(row.byteSize) && row.byteSize > 0 && Number.isFinite(row.bytesTransferred) && row.bytesTransferred >= 0;
                    const amount = document.createElement('p'); amount.className='storybook-note';
                    if (known) { progress.max=row.byteSize;progress.value=Math.min(row.bytesTransferred,row.byteSize);amount.textContent=`手機檔案傳輸 ${Math.floor(progress.value/progress.max*100)}% · ${sizeText(progress.value)} / ${sizeText(progress.max)}`; }
                    else amount.textContent='正在等待手機回報傳輸進度';
                    card.append(progress,amount);
                }
                if (plugin) {
                    const add = (label, action) => { const button=document.createElement('button'); button.className='btn-tag'; button.type='button'; button.textContent=label; button.addEventListener('click',async()=>{if(queueActions?.busy)return;button.disabled=true;try{await action();await render();}catch(error){detail.textContent='操作暫時未完成，請重新整理狀態後再試。';}finally{button.disabled=false;}});card.append(button); };
                    if(row.requiresReselection&&row.assetIdentifier&&!queueActions?.isRemoved(row))add('重新選取原檔',()=>plugin.prepareUpload({resumeIds:[row.id],endpoint:row.endpoint,albumId:row.albumId,tags:row.tags,skipUploaded:row.skipUploaded===true}));
                    if(queueActions?.isRemoved(row)){status.textContent='已移出佇列 · 原任務收據保留';add('放回清單',()=>queueActions.restore(row.id));}
                    else if (row.direction==='upload' && row.stage==='queued' && !row.endpoint) {
                        const label=document.createElement('label'); label.textContent='這個檔案的標籤';
                        const input=document.createElement('input'); input.className='upload-input'; input.value=drafts.get(row.id) ?? document.getElementById('transferTags').value.trim(); input.placeholder='例如：公園 家人 開心';
                        input.dataset.uploadTags='';input.disabled=batchBusy||enqueueStarting.has(row.id);input.addEventListener('input',()=>drafts.set(row.id,input.value));label.append(input);card.append(label);
                        add('開始上傳這個檔案',()=>{if(batchBusy||stopBusy)throw new Error('正在開始或停止這次選取，請稍候。');return enqueuePrepared(row,input.value.trim(),album.value);});
                        add('停止手機傳輸',()=>plugin.cancel({id:row.id}));
                    }
                    else if (['queued','transferring','waiting_network','waiting_wifi'].includes(row.stage)) add('停止手機傳輸',()=>plugin.cancel({id:row.id}));
                    if (!row.requiresReselection && !queueActions?.isRemoved(row) && (row.canRetryQueued || ['failed','cancelled','waiting_network','waiting_wifi','waiting_system','waiting_account'].includes(row.stage)) && !row.scheduleAccepted && row.endpoint && !row.networkPolicyPending) add('重試',()=>plugin.retry({id:row.id}));
                    if (!queueActions?.isRemoved(row) && row.stage==='file_ready' && capabilities.photoLibrarySave) add('保存至手機相簿',()=>plugin.saveToPhotos({id:row.id}));
                } else if(row.stage==='failed' && row.serverReceiptId && !row.retryBlocked && !row.waitReason && !capabilities.nativeError) {
                    const retry=document.createElement('button');retry.className='btn-tag';retry.textContent='重試照片處理';
                    retry.addEventListener('click',async()=>{retry.disabled=true;try{
                        const response=await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/uploads/retry`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({localIds:[row.serverReceiptId]})});
                        if(response.status===409) {
                            const rows=receipts();const saved=rows.find(item=>item.serverReceiptId===row.serverReceiptId);
                            if(saved && !(saved.stage==='completed' && saved.flickrPhotoId)){saved.retryBlocked=true;saved.errorCode='Flickr 結果尚未確認，請先核對，避免重複上傳';(window.TimehutStorage?.local || localStorage).setItem(key,JSON.stringify(rows));}
                            await render();return;
                        }
                        if(!response.ok)throw new Error('Flickr 處理重試未被接受');await render();
                    }catch(error){detail.textContent='操作暫時未完成，請重新整理狀態後再試。';}finally{retry.disabled=false;}});card.append(retry);
                }
                listEl.append(card);
            }
            if(visibleRows.length>renderLimit){const more=document.createElement('button');more.type='button';more.className='btn-secondary transfer-load-more';more.id='transferLoadMore';more.textContent=`再顯示 ${Math.min(50,visibleRows.length-renderLimit)} 個（還有 ${visibleRows.length-renderLimit} 個）`;more.addEventListener('click',()=>{renderLimit+=50;render().catch(()=>{});});listEl.append(more);}
            resolveAlbumNames(rows);
        }
        const pickButton=document.getElementById('nativePickButton'), capabilityText=document.getElementById('transferCapability');
        let pickBusy=false, batchBusy=false, stopBusy=false, cancelPicked=false, pickedActor=null;
        reselectButton=document.createElement('button');reselectButton.type='button';reselectButton.className='btn-secondary';reselectButton.textContent='重新選取未準備完成的原檔';reselectButton.hidden=true;pickButton.after(reselectButton);
        reselectButton.addEventListener('click',async()=>{if(pickBusy||stopBusy||queueActions?.busy)return;pickBusy=true;reselectButton.disabled=true;try{const pending=(await list()).filter(row=>row.requiresReselection&&row.assetIdentifier);if(!pending.length)return;await plugin.prepareUpload({resumeIds:pending.map(row=>row.id),endpoint:CONFIG.UPLOAD_API_URL,albumId:album.value,tags:'',skipUploaded:true});await render();}catch(_){capabilityText.textContent='重新選取尚未確認，原任務仍保留；請確認選取原來的照片後再試。';}finally{pickBusy=false;reselectButton.disabled=false;}});

        window.addEventListener('timehut-account-changed',()=>{cancelPicked=true;pickedActor=null;drafts.clear();pickedIds.clear();startBatch.hidden=true;});
        const pickedIds=new Set(), stopPicked=document.createElement('button');
        stopPicked.type='button';stopPicked.className='btn-secondary';stopPicked.textContent='停止這次選取的傳輸';stopPicked.hidden=true;const startBatch=document.createElement('button');startBatch.type='button';startBatch.className='btn-tag';startBatch.textContent='開始這次選取的上傳';startBatch.hidden=true;pickButton.after(startBatch,stopPicked);
        stopPicked.addEventListener('click',async()=>{
            if(stopBusy||CONFIG.ACCOUNT_MODE&&TimehutAccounts.status().user?.id!==pickedActor)return;
            const stoppingActor=pickedActor,stoppingIds=new Set(pickedIds);stopBusy=true;cancelPicked=true;stopPicked.disabled=true;pickButton.disabled=true;
            let stopped=0;const failures=[];
            try{
                const rows=await list();
                if(CONFIG.ACCOUNT_MODE&&TimehutAccounts.status().user?.id!==stoppingActor)return;
                for(const row of rows.filter(row=>stoppingIds.has(row.id)&&!['completed','photo_deleted','saved','cancelled'].includes(row.stage)))
                    try{if(CONFIG.ACCOUNT_MODE&&TimehutAccounts.status().user?.id!==stoppingActor)throw Error('帳戶已變更，停止操作尚未確認');await plugin.cancel({id:row.id});stopped++;}catch(error){failures.push(error.message);}
                capabilityText.textContent=failures.length?'部分停止結果尚未確認，請核對下方任務後重試。':`已停止 ${stopped} 個未完成傳輸；已完成的照片仍會保留。`;
                await render();
            }catch(error){capabilityText.textContent='操作結果尚未確認，請更新下方狀態；請勿重複加入檔案。';}
            finally{stopBusy=false;stopPicked.disabled=false;if(!pickBusy&&!batchBusy)pickButton.disabled=false;}
        });
        startBatch.addEventListener('click',async()=>{
            if(queueActions?.busy||pickBusy||batchBusy||stopBusy||cancelPicked)return;
            if(CONFIG.ACCOUNT_MODE&&!currentNameOwner()){capabilityText.textContent='帳戶已變更，請重新開啟傳輸中心。';return;}
            batchBusy=true;startBatch.disabled=true;pickButton.disabled=true;album.disabled=true;document.getElementById('transferTags').disabled=true;
            listEl.querySelectorAll('[data-upload-tags]').forEach(input=>{input.disabled=true;});
            const destination=album.value,ids=new Set(pickedIds);let accepted=0;const errors=[];
            try {
                const rows=(await list()).filter(row=>ids.has(row.id)&&row.direction==='upload'&&row.stage==='queued'&&!row.endpoint);
                const pending=rows.map(row=>({row,tags:drafts.get(row.id)??document.getElementById('transferTags').value.trim()}));
                for(const item of pending){
                    if(cancelPicked)break;
                    if(CONFIG.ACCOUNT_MODE&&!currentNameOwner())throw new Error('帳戶已變更，未送出的原檔會保留。');
                    try{await enqueuePrepared(item.row,item.tags,destination);accepted++;}catch(error){errors.push(`${item.row.filename||'檔案'}：${error.message||'加入佇列尚未確認'}`);}
                    capabilityText.textContent=`已加入 ${accepted}／${pending.length} 個上傳佇列。`;
                }
                capabilityText.textContent=cancelPicked?'已要求停止這次選取，請核對下方任務狀態。':errors.length?`已加入 ${accepted} 個；${errors.join('；')}`:accepted?`已加入 ${accepted} 個上傳佇列，請在下方查看完成結果。`:'這次選取沒有尚待送出的檔案，請核對下方狀態。';
            }catch(error){capabilityText.textContent=error.message||'加入佇列尚未確認，原檔會保留。';}
            finally{batchBusy=false;startBatch.disabled=false;pickButton.disabled=stopBusy;album.disabled=false;document.getElementById('transferTags').disabled=false;listEl.querySelectorAll('[data-upload-tags]').forEach(input=>{input.disabled=false;});await render().catch(error=>{capabilityText.textContent='操作結果尚未確認，請更新下方狀態；請勿重複加入檔案。';});}
        });
        pickButton.textContent='選擇照片／影片';
        pickButton.addEventListener('click',async()=>{
            if(queueActions?.busy||pickBusy||batchBusy||stopBusy)return;
            const destination=album.value, actor=window.TimehutAccounts?.status().user;
            if(!CONFIG.CHILDREN.some(child=>String(child.albumId)===destination)||(CONFIG.ACCOUNT_MODE&&!actor?.id)){
                capabilityText.textContent='請先登入並選擇上傳相簿。';return;
            }
            const defaultTags=document.getElementById('transferTags').value.trim();const uploader=CONFIG.ACCOUNT_MODE?actor.username:CONFIG.FAMILY_MEMBERS?.[0]?.name;const tags=[uploader?`uploader:${uploader}`:'',defaultTags].filter(Boolean).join(' ');
            pickBusy=true;pickButton.disabled=true;album.disabled=true;document.getElementById('transferTags').disabled=true;
            cancelPicked=false;pickedIds.clear();pickedActor=actor?.id;stopPicked.hidden=true;startBatch.hidden=true;
            let accepted=0;const errors=[];
            try{
                capabilityText.textContent='請選取照片／影片。確認後請稍等排程、留在此畫面；顯示系統已接手後即可切換 App。';
                const result=await plugin.prepareUpload({endpoint:CONFIG.UPLOAD_API_URL,albumId:destination,tags,skipUploaded:document.getElementById("skipUploaded").checked}),seen=new Set();
                if(result.nativeBatch){accepted=(result.tasks||[]).filter(row=>row.errorCode!=='schedule_not_accepted'&&row.scheduleAccepted!==false).length;capabilityText.textContent=accepted===result.tasks.length?`手機系統已接手 ${accepted} 個檔案，可切換 App。準備與上傳進度請看下方。`:(capabilities.platform==='ios'?'選取紀錄已保留，正在準備檔案與交接排程；請保持此畫面開啟。':'選取紀錄已保留，尚未交給系統；請留在此畫面並按重試。');await render();return;}
                errors.push(...(result.errors||[]));
                for(const row of result.tasks||[])if(typeof row.id==='string')pickedIds.add(row.id);
                stopPicked.hidden=pickedIds.size===0;startBatch.hidden=pickedIds.size===0;
                for(const row of result.tasks||[]){
                    if(typeof row.id!=='string'||seen.has(row.id))continue;seen.add(row.id);
                    if(CONFIG.ACCOUNT_MODE&&window.TimehutAccounts?.status().user?.id!==actor.id)throw new Error('帳戶已變更，未送出的原檔會保留在原帳戶。');
                    if(cancelPicked){await plugin.cancel({id:row.id});continue;}
                    drafts.set(row.id,defaultTags);accepted++;
                }
                capabilityText.textContent=cancelPicked?'已要求停止這次選取，請核對下方任務狀態。':errors.length?`已準備 ${accepted} 個；${errors.join('；')}`:accepted?`已準備 ${accepted} 個檔案。請逐檔確認標籤，再開始這次選取的上傳，或單獨上傳各檔案。`:'未選取檔案，沒有新增上傳。';
                await render();
            }catch(error){capabilityText.textContent='選取結果尚未確認，請更新下方狀態；請勿重複加入檔案。';}
            finally{pickBusy=false;pickButton.disabled=stopBusy;album.disabled=false;document.getElementById('transferTags').disabled=false;}
        });
        document.getElementById('refreshTransfers').addEventListener('click',()=>{nameRetryAfter.clear();render().catch(error=>{capabilityText.textContent='操作結果尚未確認，請更新下方狀態；請勿重複加入檔案。';});});
        document.querySelectorAll('[data-transfer-filter]').forEach(button => button.addEventListener('click', () => {
            filter=button.dataset.transferFilter;renderLimit=50;
            document.querySelectorAll('[data-transfer-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
            render().catch(error => { document.getElementById('transferCapability').textContent='暫時無法讀取傳輸狀態，請稍後更新狀態。'; });
        }));
        if (plugin && capabilities.platform === 'ios') await plugin.addListener('transferChanged',()=>{queueRender();if(networkState?.applying)refreshNetworkSettings();});
        queueActions=window.TimehutQueueActions.create({plugin,list,actor:()=>window.TimehutAccounts.status(),render,isEditing:()=>pickBusy||batchBusy||stopBusy||taskEditor(document.activeElement)||composingEditor!==null,retryMany:capabilities.nativeBatchRetry?ids=>plugin.retryMany({ids}):null,removeMany:capabilities.nativeBatchRemove?ids=>plugin.removeMany({ids}):null});
        window.TimehutDevicePicker?.attach({plugin,capabilities,render,isBusy:()=>pickBusy||batchBusy||stopBusy||queueActions?.busy});
        const timer = setInterval(()=>{if(document.visibilityState==='visible')render().catch(()=>{});},3000);
        window.addEventListener('pagehide',()=>{clearInterval(timer);clearTimeout(renderTimer);renderTimer=null;previewObserver?.disconnect();},{once:true});
        document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render().catch(()=>{});});
        await render();
    }
    function initDeviceSettings() {
        const section=document.querySelector('.device-settings');if(!section)return;
        const appStatus=document.getElementById('deviceAppStatus'),notificationStatus=document.getElementById('deviceNotificationStatus')||{textContent:''},photoStatus=document.getElementById('devicePhotoStatus');
        const displayMode=matchMedia('(display-mode: standalone)');let installedEvent=false,generation=0,disposed=false;
        function openedAsNative(){try{return window.Capacitor?.isNativePlatform?.()===true;}catch{return false;}}
        function renderOpenState(){
            appStatus.textContent=openedAsNative()?'目前使用手機 App，可在傳輸中心查看上傳、下載與保存結果。':displayMode.matches||navigator.standalone===true?'目前已以獨立網頁 App 視窗開啟；背景長時間傳輸仍須使用手機 App。':installedEvent?'已收到網頁 App 安裝完成通知；請從主畫面開啟，確認獨立 App 視窗。':'目前在瀏覽器中開啟；此畫面無法判定是否已在其他地方安裝，請查看安裝方式。';
        }
        function bounded(request){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('timeout')),8000);Promise.resolve().then(request).then(resolve,reject).finally(()=>clearTimeout(timer));});}
        function notificationText(value){
            if(!value||typeof value.enabled!=='boolean'||typeof value.canNotify!=='boolean'||!['prompt','granted','denied','provisional'].includes(value.permission)||typeof value.systemEnabled!=='boolean'||typeof value.channelEnabled!=='boolean')throw new Error('invalid notification state');
            if(value.canNotify!==(value.enabled&&['granted','provisional'].includes(value.permission)&&value.systemEnabled&&value.channelEnabled))throw new Error('contradictory notification state');
            if(value.permission==='denied')return '手機系統未允許通知；可到手機設定允許，再到傳輸中心確認完成通知選項。';
            if(!value.channelEnabled||(value.permission!=='prompt'&&!value.systemEnabled))return '手機系統已關閉此類通知；可到手機設定開啟，傳輸不受影響。';
            if(value.canNotify)return value.permission==='provisional'?'已開啟靜音完成通知；請回傳輸中心確認實際結果。':'已開啟完成通知；實際顯示仍由手機系統決定。';
            return '完成通知尚未開啟；可到傳輸中心選擇，必要時才會詢問手機權限。';
        }
        function photoText(value,platform){
            if(!value||typeof value.supported!=='boolean'||typeof value.canSave!=='boolean')throw new Error('invalid photo state');
            if(platform==='android'){
                if(value.supported&&value.canSave&&value.permission==='not-required'&&value.scope==='own-media')return '保存本 App 下載的照片與影片不需額外相簿權限；下載後仍須在傳輸中心點選保存並確認結果。';
                if(!value.supported&&!value.canSave&&value.permission==='unsupported'&&value.scope==='none')return '此 Android 版本尚不支援 App 內保存至相簿；不要把檔案已下載當作已存入相簿。';
                throw new Error('contradictory Android photo state');
            }
            if(platform!=='ios'||!value.supported||value.scope!=='add-only'||!['prompt','granted','limited','denied','restricted','unknown'].includes(value.permission)||value.canSave!==['granted','limited'].includes(value.permission))throw new Error('contradictory iOS photo state');
            const messages={prompt:'尚未詢問新增照片權限；下載後，在傳輸中心點選保存時才會顯示提示。',granted:'已允許新增照片與影片；不代表 App 可讀取整個相簿。下載後仍須點選保存並確認結果。',limited:'系統回報有限的照片授權；新增保存仍以實際結果為準，不代表可讀取整個相簿。',denied:'尚未允許新增照片；可到手機設定允許，再回傳輸中心重試保存。下載原檔仍保留。',restricted:'手機系統限制新增照片，可能由裝置管理或使用限制設定；下載原檔仍保留，請確認手機設定。',unknown:'照片權限狀態尚無法辨識；請更新手機狀態，不能據此確認可以保存。'};
            return messages[value.permission];
        }
        async function refresh(){
            const current=++generation;renderOpenState();
            if(!openedAsNative()){
                notificationStatus.textContent='網頁版不提供手機 App 的完成通知；請回傳輸中心查看結果。';
                photoStatus.textContent='網頁下載由瀏覽器處理；此處無法讀取手機相簿權限，也不能確認檔案已保存至相簿。';return;
            }
            notificationStatus.textContent='正在讀取通知狀態…';photoStatus.textContent='正在讀取照片權限…';
            let capabilities;
            try{capabilities=await bounded(()=>ready);}catch{}
            if(disposed||current!==generation)return;
            if(!plugin||!capabilities||capabilities.nativeError){notificationStatus.textContent='手機 App 狀態暫時無法讀取；請重新開啟 App 後確認。';photoStatus.textContent='照片儲存功能暫時無法確認；不影響此頁生日設定。';return;}
            const read=async(enabled,method,target,convert,fallback)=>{
                if(!enabled){target.textContent=fallback;return;}
                try{const value=await bounded(()=>plugin[method]());if(!disposed&&current===generation)target.textContent=convert(value);}
                catch{if(!disposed&&current===generation)target.textContent='狀態暫時無法確認；請更新手機狀態，或回傳輸中心查看。';}
            };
            await Promise.all([
                
                read(capabilities.photoLibraryStatus===true,'photoLibrarySettings',photoStatus,value=>photoText(value,capabilities.platform),'此 App 版本尚無法讀取照片權限；下載後請到傳輸中心查看保存結果。')
            ]);
        }
        document.getElementById('refreshDeviceSettings').addEventListener('click',refresh);
        document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
        displayMode.addEventListener?.('change',renderOpenState);
        window.addEventListener('appinstalled',()=>{installedEvent=true;renderOpenState();});
        window.addEventListener('pagehide',()=>{disposed=true;generation++;});
        window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;refresh();}});
        refresh();
    }
    (window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))(initDeviceSettings);
    (window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))(initQueueEntry);
    (window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))(()=>initCenter().catch(error=>{const e=document.getElementById('transferCapability');if(e)e.textContent='暫時無法讀取傳輸狀態，請稍後更新狀態。';}));
    return {ready,trackReceipt,list,mediaUrl,download,downloadMany,confirmDownloads};
})();
