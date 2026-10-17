/* Browser transfers stay in this foreground page. Only opaque receipts survive reload. */
window.TimehutWebUpload = (() => {
    const backend = 'https://just-healing-production.up.railway.app';
    const prefix = 'timehut:web-upload:v1:';
    const retained = new WeakMap(), active = new Set();
    const moduleUrl = new URL('vendor/noble-hashes-2.4.0/sha2.js', document.currentScript.src).href;
    const encoder = new TextEncoder();
    let hashes;
    const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const albumIdentity=value=>typeof value==='string'&&(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)||(TimehutAccounts.status().legacyOwner===true&&/^[0-9]{1,32}$/.test(value)));
    function actor() {
        const status = window.TimehutAccounts.status();
        if (!status.authenticated || status.native || location.origin !== backend) throw new Error('請登入網站，或使用 Android App 加入背景上傳佇列');
        return {owner:status.user.id, generation:status.generation};
    }
    function check(authority, signal) {
        if (signal?.aborted) throw new DOMException('本頁傳送已停止；請查看原收據', 'AbortError');
        const now = actor();
        if (now.owner !== authority.owner || now.generation !== authority.generation) throw new Error('帳戶已變更，請重新選取檔案');
    }
    function key(owner, id) { return prefix + owner + ':' + id; }
    function rows(owner) {
        const result = [];
        for (let i = 0; i < localStorage.length; i++) {
            const name = localStorage.key(i);
            if (!name?.startsWith(prefix + owner + ':')) continue;
            let row;try{row=JSON.parse(localStorage.getItem(name));}catch(_){throw new Error('收件識別無法讀取，既有紀錄已保留');}
            if (row?.owner !== owner || !/^web_[a-f0-9]{64}$/.test(row.id || '') || name !== key(owner,row.id) || !/^[a-f0-9]{64}$/.test(row.content || '') || !/^[a-f0-9]{64}$/.test(row.metadata || '') || !albumIdentity(row.album) || !['prepared','uncertain','accepted','not_accepted'].includes(row.state) || (row.receipt && !/^local_[A-Za-z0-9_-]+$/.test(row.receipt))) throw new Error('收件識別無法讀取，既有紀錄已保留');
            result.push(row);
        }
        return result;
    }
    function save(row) {
        localStorage.setItem(key(row.owner,row.id), JSON.stringify(row));
        if (localStorage.getItem(key(row.owner,row.id)) !== JSON.stringify(row)) throw new Error('收件識別未能保存，尚未開始傳送');
        window.dispatchEvent(new Event('timehut-receipt-changed'));
    }
    async function digest(file, authority, signal) {
        hashes ||= import(moduleUrl);
        const {sha256} = await hashes, hash = sha256.create();
        try {
            for (let start = 0; start < file.size; start += 1024 * 1024) {
                check(authority, signal);
                hash.update(new Uint8Array(await file.slice(start, start + 1024 * 1024).arrayBuffer()));
                // Give stop/account-switch events a turn between bounded 1 MiB reads.
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            check(authority, signal); return hex(hash.digest());
        } finally { hash.destroy(); }
    }
    async function lookup(row, authority, signal) {
        check(authority,signal);
        const result = await window.TimehutAccounts.request('/api/uploads/admission/'+row.id);
        check(authority,signal);
        if (!['not_found','not_accepted','receiving','accepted','completed'].includes(result.admissionStatus)) throw new Error('收件狀態尚未確認；請保留原檔');
        if (result.localId) {
            if (!/^local_[A-Za-z0-9_-]+$/.test(result.localId)) {if(!row.receipt){row.state='uncertain';save(row);}throw new Error('原收據格式尚未確認');}
            row.receipt = result.localId; row.state = 'accepted'; save(row);
            if (result.status === 'deleted') throw new Error('原照片已刪除，這張收據不會重新上傳');
            if (result.status === 'cancelled') throw new Error('原收據已取消，不能另建上傳');
            return {_staged:result.status !== 'completed',results:[{success:true,localId:result.localId,photoId:result.flickrPhotoId,_staged:result.status !== 'completed'}]};
        }
        if (row.receipt || ['accepted','completed','receiving'].includes(result.admissionStatus) || result.retryBlocked === true) {if(!row.receipt&&row.state!=='uncertain'){row.state='uncertain';save(row);}throw new Error('原收件仍待確認；請保留原檔，不會重新傳送');}
        if (result.admissionStatus === 'not_found' && row.state !== 'prepared') throw new Error('先前傳送結果未知；找不到收据不能當成未收件');
        if (result.admissionStatus === 'not_accepted' && row.state !== 'not_accepted') { row.state = 'not_accepted'; save(row); }
        return null;
    }
    function send(file, options, row, authority) {
        return new Promise((resolve,reject) => {
            check(authority, options.signal);
            const form = new FormData();
            form.append('files',file,file.name);form.append('albumId',row.album);form.append('clientUploadId',row.id);
            form.append('title',options.title);form.append('description',options.description);form.append('tags',options.tags);
            if (options.date) form.append('date',options.date);
            const xhr = new XMLHttpRequest(), abort = () => xhr.abort();
            xhr.open('POST',backend+'/api/upload');xhr.withCredentials=true;xhr.timeout=600000;
            for (const [name,value] of Object.entries({'X-Timehut-Expected-User':row.owner,'X-Timehut-Album':row.album,'X-Timehut-Upload':row.id,'X-Timehut-Content-SHA256':row.content,'X-Timehut-Metadata-SHA256':row.metadata})) xhr.setRequestHeader(name,value);
            xhr.upload.onprogress = event => {try{check(authority,options.signal);if(event.lengthComputable)options.onProgress?.(Math.min(99,event.loaded/event.total*100));}catch(_){xhr.abort();}};
            xhr.onload = () => {
                try {
                    check(authority,options.signal);
                    if (xhr.getResponseHeader('X-Timehut-Account') !== row.owner) throw new Error('帳戶回應尚未確認；請查看原收據');
                    const result = JSON.parse(xhr.responseText);
                    if (xhr.status < 200 || xhr.status >= 300 || !Array.isArray(result.results) || result.results.length !== 1 || result.results[0].success !== true || !/^local_[A-Za-z0-9_-]+$/.test(result.results[0].localId || '')) throw new Error('傳送尚未確認；請查看原收據');
                    row.receipt=result.results[0].localId;row.state='accepted';save(row);resolve(result);
                } catch (error) { reject(error); }
            };
            xhr.onerror = xhr.ontimeout = () => reject(new Error('連線中斷，先查原收據；請保留原檔'));
            xhr.onabort = () => reject(new DOMException('本頁傳送已停止；請查看原收據','AbortError'));
            xhr.onloadend = () => {active.delete(xhr);options.signal?.removeEventListener('abort',abort);};
            // Persist uncertainty BEFORE dispatch. A crash here conservatively prevents blind replay.
            row.state='uncertain';save(row);active.add(xhr);options.signal?.addEventListener('abort',abort,{once:true});
            try { check(authority,options.signal);xhr.send(form); }
            catch(error) {active.delete(xhr);options.signal?.removeEventListener('abort',abort);reject(error);}
        });
    }
    async function upload(file, options={}) {
        await window.TimehutAccounts.ready;
        const authority=actor();check(authority,options.signal);
        if (!(file instanceof File) || !file.size || file.size > 500*1024*1024 || !['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/x-msvideo','video/mpeg'].includes(file.type) || /[\\/\r\n\0]/.test(file.name)) throw new Error('請選擇 500 MiB 以內的照片或影片原檔');
        const metadata={albumId:options.albumId,title:options.title||file.name,description:options.description||'',tags:options.tags||'',date:options.date||''};
        if (!albumIdentity(metadata.albumId) || Object.values(metadata).some(v=>typeof v!=='string'||encoder.encode(v).length>16384)) throw new Error('上傳設定尚未確認');
        hashes ||= import(moduleUrl);const {sha256}=await hashes;
        const parts=[metadata.albumId,file.name,file.type,metadata.tags,metadata.title,metadata.description,metadata.date],mh=sha256.create();
        for (const part of parts) {const bytes=encoder.encode(part);mh.update(encoder.encode(bytes.length+'\n')).update(bytes).update(encoder.encode('\n'));}
        const meta=hex(mh.digest());mh.destroy();
        let row=retained.get(file);
        if (row && (row.owner!==authority.owner || row.metadata!==meta)) throw new Error('重試須沿用原帳戶與上傳設定');
        if (!row) {
            const content=await digest(file,authority,options.signal),id='web_'+hex(sha256(encoder.encode(authority.owner+'\n'+content+'\n'+meta)));
            const existing=rows(authority.owner);
            if(existing.some(r=>r.content===content&&r.id!==id&&r.state==='uncertain'))throw new Error('此原檔先前傳送結果未知，請先查看原收據');
            row=existing.find(r=>r.id===id)||{owner:authority.owner,id,content,metadata:meta,album:metadata.albumId,state:'prepared'};
            save(row);retained.set(file,row);
        }
        const run=async()=>{check(authority,options.signal);const saved=rows(authority.owner).find(r=>r.id===row.id);if(saved)Object.assign(row,saved);const known=await lookup(row,authority,options.signal);if(known)return known;try{return await send(file,{...options,...metadata},row,authority);}catch(error){if(error.name==='AbortError')throw error;try{const recovered=await lookup(row,authority,options.signal);if(recovered)return recovered;}catch(recovery){throw recovery;}throw error;}};
        return navigator.locks ? navigator.locks.request(key(row.owner,row.id),run) : run();
    }
    async function pendingReceipts() {
        await window.TimehutAccounts.ready;const authority=actor(),result=[];
        for(const row of rows(authority.owner)) {
            if(row.receipt)continue;
            try{await lookup(row,authority);if(row.receipt)continue;}catch(_){check(authority);}
            if(row.receipt)continue;
            result.push({id:row.id,albumId:row.album,direction:'upload',filename:'原檔（收件尚未確認）',stage:'failed',retryBlocked:true,waitReason:row.state==='not_accepted'||row.state==='prepared'?'尚未收件，請重新選取同一原檔與原設定':'結果未知；保留原檔，先查同一收件編號',createdAt:''});
        }
        return result;
    }
    window.addEventListener('timehut-account-changed',()=>{for(const xhr of active)xhr.abort();});
    return {upload,pendingReceipts};
})();
