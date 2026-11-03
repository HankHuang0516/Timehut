/**
 * 黃家小屋 - Flickr API 整合
 * Flickr API Integration for Timehut Clone
 */

const PhotoPreviewScope={epoch:0,bindings:new WeakMap()};
let PhotoPreviewRenewals=new WeakMap();
for(const event of ['pagehide','timehut-account-changed'])window.addEventListener?.(event,()=>{PhotoPreviewScope.epoch++;PhotoPreviewRenewals=new WeakMap();});
const AlbumAgeReadPool = {active: 0, waiting: []};
async function withAlbumAgeRead(read) {
    if (AlbumAgeReadPool.active >= 3) await new Promise(resolve => AlbumAgeReadPool.waiting.push(resolve));
    else AlbumAgeReadPool.active++;
    try { return await read(); }
    finally {
        const next = AlbumAgeReadPool.waiting.shift();
        if (next) next(); else AlbumAgeReadPool.active--;
    }
}

const FlickrAPI = {
    async getSelectedDayPhotos(albumId,date,requestedIds,{expectedAuthority,isCurrent=()=>true}={}) {
        const invalid=()=>Object.assign(new Error('同日照片清單尚未確認，請返回時間軸重新開啟'),{ageReadIntegrity:true});
        if(!Array.isArray(requestedIds)||!requestedIds.length||requestedIds.length>200||
            requestedIds.some(id=>typeof id!=='string'||! /^[1-9]\d{0,31}$/.test(id))||new Set(requestedIds).size!==requestedIds.length||
            typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number(date.slice(0,4))<1)throw invalid();
        const calendar=new Date(date+'T12:00:00Z');
        if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==date)throw invalid();
        const check=()=>{const now=window.TimehutAccounts?.status();if(!isCurrent()||now?.user?.id!==expectedAuthority?.owner||now?.generation!==expectedAuthority?.generation)throw Object.assign(new Error('已停止讀取同日照片'),{cancelled:true});};
        check();
        const query=new URLSearchParams({photos:requestedIds.join(','),date});
        const data=await TimehutAccounts.request(`/api/album/${encodeURIComponent(albumId)}/photos?${query}`,{expectedAuthority});
        check();
        if(data?.stat!=='ok')throw invalid();
        const proof=data?.photoset?.selection;
        if(data?.selection!==undefined){
            const fallback=data.selection;
            if(data.stat!=='ok'||data.photoset!==undefined||fallback?.complete!==false||fallback.unsupported!==true||
                !['date_unverifiable','missing_photo','date_mismatch'].includes(fallback.reason))throw invalid();
            return null;
        }
        // An older backend ignores the optional selector and returns its regular page.
        // Only a complete explicit selection proof can be treated as the selected day.
        if(proof===undefined){
            const legacy=data.photoset;
            if(legacy?.id!==albumId||!Array.isArray(legacy.photo)||!Number.isSafeInteger(Number(legacy.total))||Number(legacy.total)<0||
                !Number.isSafeInteger(Number(legacy.pages))||Number(legacy.pages)<1||Number(legacy.page)!==1)throw invalid();
            return null;
        }
        const set=data.photoset,photos=set.photo,revision=set.inventory_revision;
        if(data.stat!=='ok'||set.id!==albumId||set.page!==1||set.pages!==1||set.total!==requestedIds.length||
            proof?.complete!==true||proof.calendar_date!==date||proof.count!==requestedIds.length||
            !Number.isSafeInteger(proof.source_total)||proof.source_total<requestedIds.length||
            typeof revision!=='string'||!/^[a-f0-9]{64}$/.test(revision)||proof.inventory_revision!==revision||
            !Array.isArray(proof.requested_ids)||proof.requested_ids.length!==requestedIds.length||
            proof.requested_ids.some((id,index)=>id!==requestedIds[index])||
            !Array.isArray(photos)||photos.length!==requestedIds.length||
            photos.some((photo,index)=>!photo||photo.id!==requestedIds[index]||photoCalendarDay(photo)!==date))throw invalid();
        return photos;
    },
    canFallbackAgeRead(error) {
        return Boolean(error && !error.ageReadIntegrity && !error.cancelled && !error.unauthorized && !error.accountChanged && !error.ageReadBudgetExpired && ![401,403,404,429].includes(error.status) &&
            (error.ageReadFallback === true || [500,502,503,504].includes(error.status)));
    },
    // A page reload intentionally loses the account's in-memory photo cache.
    // Read bounded pages concurrently and expose matching rows as they arrive.
    async getAlbumDayPhotos(albumId, date, onProgress = () => {}, requestedIds = null) {
        let perPage = 240;
        const results = new Map(), ids = new Set(), actor=window.TimehutAccounts?.status(),expectedAuthority={owner:actor?.user?.id,generation:actor?.generation},epoch=PhotoPreviewScope.epoch;
        const check=()=>{const current=window.TimehutAccounts?.status();if(epoch!==PhotoPreviewScope.epoch||CONFIG.ACCOUNT_MODE&&(current?.user?.id!==expectedAuthority.owner||current?.generation!==expectedAuthority.generation))throw Object.assign(new Error('已停止讀取同日照片'),{cancelled:true});};
        const read=async page=>{check();const data=await this.getAlbumPhotos(albumId,page,perPage,{expectedAuthority});check();return data;};
        const wanted = requestedIds ? new Set(requestedIds) : null;
        if(CONFIG.ACCOUNT_MODE&&requestedIds?.length&&requestedIds.length<=200){
            const selected=await this.getSelectedDayPhotos(albumId,date,requestedIds,{expectedAuthority,isCurrent:()=>{check();return true;}});
            check();if(selected){onProgress(selected,{completed:1,pages:1});return selected;}
        }
        let pages = 1, next = 2, completed = 0, stopped = false, dayRevision, dayTotal;
        const photoDate = photoCalendarDay;
        const accept = (data, page) => {
            check();
            if (!Array.isArray(data.photos) || !Number.isSafeInteger(data.pages)
                || data.pages < 0 || data.pages > 10000 || data.page !== page)
                throw new Error('相簿分頁資料尚未確認');
            if (completed===0) {dayRevision=data.inventoryRevision||null;dayTotal=data.total;}
            else if ((data.inventoryRevision||null)!==dayRevision||data.total!==dayTotal)
                throw new Error('相簿內容已變更，請返回時間軸重新開啟');
            results.set(page, data.photos.filter(photo => photoDate(photo) === date
                && (!wanted || wanted.has(String(photo.id)))));
            completed++;
            const rows = [...results].sort((a, b) => a[0] - b[0]).flatMap(row => row[1]);
            ids.clear();
            const unique = rows.filter(photo => !ids.has(photo.id) && ids.add(photo.id));
            onProgress(unique, { completed, pages });
            return unique;
        };
        let first = await read(1);
        if(first.ageBatchSize!==240){perPage=30;if(first.photos.length>30)first=await read(1);}
        pages = Math.max(1, first.pages);
        let photos = accept(first, 1);
        if (wanted && photos.length === wanted.size) return photos;
        return new Promise((resolve,reject)=>{
            let readers=Math.min(3,pages-1),settled=false;
            const finish=(error)=>{if(settled)return;settled=true;stopped=true;if(error)reject(error);else resolve(photos);};
            if(!readers){finish(wanted&&photos.length!==wanted.size?new Error('部分照片已變更，請返回時間軸重新開啟'):null);return;}
            for(let reader=0;reader<readers;reader++)(async()=>{
                try{while(!stopped){const page=next++;if(page>pages)return;const data=await read(page);if(stopped)return;
                    if(Math.max(1,data.pages)!==pages)throw new Error('相簿內容已變更，請重新載入');photos=accept(data,page);
                    if(wanted&&photos.length===wanted.size){finish();return;}
                }}catch(error){if(!settled)finish(error);}finally{readers--;if(!readers&&!settled)finish(wanted&&photos.length!==wanted.size?new Error('部分照片已變更，請返回時間軸重新開啟'):null);}
            })();
        });
    },
    /**
     * 呼叫 Flickr API
     * @param {string} method - API 方法名稱
     * @param {Object} params - 額外參數
     * @returns {Promise<Object>} API 回應
     */
    async call(method, params = {}) {
        if(CONFIG.ACCOUNT_MODE){
            if(method==='flickr.photosets.getList'){const data=await TimehutAccounts.request('/api/accounts/albums');return {stat:'ok',photosets:{photoset:data.albums.map(row=>({id:row.id,title:{_content:row.title}}))}};}
            if(['flickr.photos.search','flickr.people.getPublicPhotos'].includes(method)){const query=new URLSearchParams({page:params.page||1,per_page:Math.min(30,params.per_page||30),query:params.text||''});return TimehutAccounts.request('/api/accounts/photos?'+query);}
            throw new Error('此照片操作尚未接上我的帳戶');
        }
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
    // A scoped display projection is distinct from the full album cursor.
    // Unsupported servers retain the original complete-inventory reader below.
    async getCompleteAgeSelection(albumId, age, birthDate, {expectedAuthority, check, onProgress}) {
        const bad = text => Object.assign(new Error(text || '此歲數的完整清單尚未確認'), {ageReadIntegrity:true});
        const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,per=480;
        if(!Number.isSafeInteger(age)||age<0||age>150||typeof birthDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))return null;
        const [year,month,day]=birthDate.split('-').map(Number),anniversary=offset=>{const date=new Date(0);date.setUTCFullYear(year+offset,month-1,day);return date.toISOString().slice(0,10);};
        const from=anniversary(age),before=anniversary(age+1);
        const unsupported=data=>{
            const value=data?.age_selection;
            if(value===undefined)return false;
            if(data.stat!=='ok'||data.photoset!==undefined||value?.protocol!=='complete-age-v1'||value.supported!==false||value.fallback!=='full-inventory'||!['calendar_unverifiable','preview_capacity','response_capacity'].includes(value.reason))throw bad();
            return true;
        };
        const read=page=>withAlbumAgeRead(async()=>{
            check();const query=new URLSearchParams({age_selection:'complete-age-v1',age:String(age),birth_date:birthDate,time_zone:timeZone,page:String(page),per_page:String(per)});
            try{const data=await TimehutAccounts.request(`/api/album/${encodeURIComponent(albumId)}/photos?${query}`,{expectedAuthority});check();return data;}
            catch(error){if(error.status===409)error.ageReadIntegrity=true;throw error;}
        });
        const rows=new Map(),ids=new Set();let pages,total,proof,fingerprint,next=2,failure=null;
        // Native JSON bridges may reorder object keys on each response.
        // Compare every proof value canonically; array order remains meaningful.
        const canonicalProof=value=>{
            if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
            if(Array.isArray(value))return value.map(canonicalProof);
            if(value&&typeof value==='object'){
                const keys=Object.keys(value).sort();if(keys.includes('__proto__'))throw bad();
                return Object.fromEntries(keys.map(key=>[key,canonicalProof(value[key])]));
            }
            throw bad();
        };
        const accept=(data,page)=>{
            check();const set=data?.photoset,p=set?.age_selection;
            if(data?.stat!=='ok'||set?.id!==albumId||set.representation!=='preview'||set.age_batch_size!==480||!p||p.protocol!=='complete-age-v1'||p.complete!==true||p.user_id!==expectedAuthority.owner||p.album_id!==albumId||p.age!==age||p.birth_date!==birthDate||p.time_zone!==timeZone||p.calendar_method!=='timeline-dates-v1'||p.from!==from||p.before!==before||typeof p.canonical_time_zone!=='string'||!p.canonical_time_zone||p.canonical_time_zone.length>100||typeof p.inventory_revision!=='string'||!/^[a-f0-9]{64}$/.test(p.inventory_revision)||set.inventory_revision!==p.inventory_revision)throw bad();
            try{if(new Intl.DateTimeFormat('en-CA',{timeZone:p.canonical_time_zone}).resolvedOptions().timeZone!==new Intl.DateTimeFormat('en-CA',{timeZone}).resolvedOptions().timeZone)throw bad();}catch(_){throw bad();}
            if(!Number.isSafeInteger(p.source_total)||p.source_total<0||p.source_total>50000||!Number.isSafeInteger(p.selected_total)||p.selected_total<0||p.selected_total>p.source_total||!p.age_counts||typeof p.age_counts!=='object'||Array.isArray(p.age_counts))throw bad();
            let sum=0;const counts=Object.entries(p.age_counts);
            for(const [key,count]of counts){if(!/^-?(?:0|[1-9]\d{0,3})$/.test(key)||String(Number(key))!==key||!Number.isSafeInteger(count)||count<=0||count>50000)throw bad();sum+=count;}
            if(sum!==p.source_total||(p.age_counts[age]||0)!==p.selected_total)throw bad();
            const wantedPages=Math.max(1,Math.ceil(p.selected_total/per));
            if(set.total!==p.selected_total||set.page!==page||set.pages!==wantedPages||page>wantedPages||!Array.isArray(set.photo)||set.photo.length!==Math.max(0,Math.min(per,p.selected_total-(page-1)*per)))throw bad();
            const signature=JSON.stringify(canonicalProof(p));
            if(fingerprint!==undefined&&fingerprint!==signature)throw bad('相簿版本或年齡範圍已變更，請重新讀取');
            const pageIds=new Set();
            for(const photo of set.photo){
                if(!photo||typeof photo.id!=='string'||!/^\d{1,32}$/.test(photo.id)||pageIds.has(photo.id)||ids.has(photo.id)||calculateAge(birthDate,photoCalendarDay(photo)).years!==age||['m','l','o'].some(size=>typeof photo['url_'+size]!=='string'||!photo['url_'+size]))throw bad();
                pageIds.add(photo.id);
            }
            for(const id of pageIds)ids.add(id);pages=wantedPages;total=p.selected_total;proof=p;fingerprint=signature;rows.set(page,set.photo);
            if(!failure)onProgress({completed:rows.size,pages});
        };
        const first=await read(1);
        if(unsupported(first))return null;
        // An older authenticated endpoint ignores the additive query. Its full
        // representation is never accepted as an age selection.
        if(first?.stat==='ok'&&first.photoset?.id===albumId&&first.photoset.age_selection===undefined&&first.photoset.age_batch_size!==480&&first.photoset.representation!=='preview')return null;
        accept(first,1);
        const worker=async()=>{
            try{while(!failure&&next<=pages){const page=next++,data=await read(page);if(unsupported(data))throw Object.assign(new Error('此歲數改用原完整查詢'),{ageSelectionUnsupported:true,ageReadFallback:true});accept(data,page);}}
            catch(error){if(!failure||failure.ageSelectionUnsupported&&!error.ageSelectionUnsupported||!this.canFallbackAgeRead(error))failure=error;}
        };
        await Promise.allSettled(Array.from({length:Math.min(3,pages-1)},worker));check();
        if(failure?.ageSelectionUnsupported)return null;if(failure)throw failure;
        const photos=[];for(let page=1;page<=pages;page++){if(!rows.has(page))throw bad();photos.push(...rows.get(page));}
        if(photos.length!==total||ids.size!==total)throw bad();
        const uiPages=Math.max(1,Math.ceil(total/30));
        return {photos,total,pages:uiPages,page:uiPages,found:total>0,ageBatchSize:480,inventoryRevision:proof.inventory_revision,ageSelection:proof,ageCounts:proof.age_counts};
    },
    // Read the existing authenticated route; verified inventory revisions keep
    // concurrent pages from mixing snapshots. Media tickets are never cached.
    async seekAlbumAge(albumId, age, birthDate, {prefix = null, perPage = 30, isCurrent = () => true, onProgress = () => {}, deadline = Date.now() + 90000, preferCompact = true, preferAgeSelection = true} = {}) {
        if(![30,240,480].includes(perPage))throw Object.assign(new Error('相簿讀取大小尚未確認'),{ageReadFallback:true});
        const account = window.TimehutAccounts?.status();
        const owner = account?.user?.id, generation = account?.generation;
        const expectedAuthority = {owner, generation};
        const check = () => {
            const current = window.TimehutAccounts?.status();
            if (!isCurrent() || current?.generation !== generation || current?.user?.id !== owner)
                throw Object.assign(new Error('已停止尋找回憶'), {cancelled: true});
            if (Date.now() > deadline) throw Object.assign(new Error('尋找時間較長，請再次選擇歲數重試。'), {ageReadBudgetExpired: true});
        };
        if(preferAgeSelection&&CONFIG.ACCOUNT_MODE){
            const selected=await this.getCompleteAgeSelection(albumId,age,birthDate,{expectedAuthority,check,onProgress});
            check();if(selected)return selected;
        }
        const read = page => withAlbumAgeRead(async () => {
            check();
            const result = await this.getAlbumPhotos(albumId, page, perPage, {expectedAuthority});
            check(); return result;
        });
        const pagingError = message => Object.assign(new Error(message), {ageReadIntegrity: true});
        const results = new Map(), acceptedIds=new Set();
        let pages, total, inventoryRevision, revisionSet=false, next = 2, foundPage = Infinity, failure = null;
        const accept = (result, page) => {
            check();
            if (!Array.isArray(result.photos) || result.photos.length > perPage || result.page !== page ||
                !Number.isSafeInteger(result.pages) || result.pages < 0 || result.pages > 10000 ||
                !Number.isSafeInteger(result.total) || result.total < 0 ||
                pages !== undefined && (Math.max(1, result.pages) !== pages || result.total !== total))
                throw pagingError('相簿內容已變更，請重新尋找回憶');
            if(perPage>=240&&(Math.max(1,Math.ceil(result.total/perPage))!==Math.max(1,result.pages)||result.photos.length!==Math.max(0,Math.min(perPage,result.total-(page-1)*perPage))))throw Object.assign(new Error('照片總數與分頁不一致，尚未完整讀取，暫時無法確認此歲數的照片。請稍後重試。'),{ageReadIntegrity:true});
            const revision=result.inventoryRevision||null;
            if(revisionSet&&revision!==inventoryRevision)throw Object.assign(new Error('相簿內容已變更，請重新尋找回憶'),{ageReadIntegrity:true});
            const pageIds=new Set();
            for(const photo of result.photos){
                if(!photo||typeof photo.id!=='string'||!/^\d{1,32}$/.test(photo.id)||pageIds.has(photo.id)||acceptedIds.has(photo.id))throw pagingError('相簿清單包含重複或未確認的照片');
                pageIds.add(photo.id);
            }
            for(const id of pageIds)acceptedIds.add(id);
            inventoryRevision=revision;revisionSet=true;
            pages = Math.max(1, result.pages); total = result.total;
            results.set(page, result.photos);
            if (result.photos.some(photo => calculateAge(birthDate, photoCalendarDay(photo)).years === age))
                foundPage = Math.min(foundPage, page);
            if(!failure)onProgress({completed: results.size, pages});
        };
        check();
        const usablePrefix=prefix&&prefix.photos?.length===prefix.total&&(perPage===30||prefix.photos?.length%perPage===0||prefix.photos?.length===prefix.total)&&prefix.owner===owner&&prefix.generation===generation&&prefix.albumId===albumId&&Number.isSafeInteger(prefix.page)&&prefix.page>=1&&Number.isSafeInteger(prefix.pages)&&prefix.pages>=prefix.page&&prefix.pages<=10000&&Number.isSafeInteger(prefix.total)&&prefix.total>=0&&Math.max(1,Math.ceil(prefix.total/30))===prefix.pages&&Array.isArray(prefix.photos)&&prefix.photos.length===Math.min(prefix.page*30,prefix.total)&&prefix.photos.every(photo=>photo&&typeof photo.id==='string'&&/^[0-9]{1,32}$/.test(photo.id))&&new Set(prefix.photos.map(photo=>photo.id)).size===prefix.photos.length;
        if(usablePrefix){
            const prefixPages=Math.max(1,Math.ceil(prefix.photos.length/perPage));
            for(let page=1;page<=prefixPages;page++)accept({photos:prefix.photos.slice((page-1)*perPage,page*perPage),page,pages:Math.max(1,Math.ceil(prefix.total/perPage)),total:prefix.total,inventoryRevision:prefix.inventoryRevision},page);
            next=prefixPages+1;
        }else {
            // A fresh page may not have finished its initial30-row read when
            // time travel is tapped. Negotiate the wide capability here instead
            // of relying on a previously committed timeline prefix.
            perPage=preferCompact?480:240;
            let first=await read(1);
            if(perPage===480&&(first.previewUnsupported||first.ageBatchSize!==480)){
                perPage=240;
                first=await read(1);
            }
            if(![240,480].includes(first.ageBatchSize)){
                perPage=30;
                if(first.photos.length>30)first=await read(1);
            }
            accept(first,1);
        }
        // Provider album order may follow upload time rather than capture date.
        // Only the complete verified inventory can identify the latest day in an age.
        const worker = async () => {
            try {
                while (!failure && next <= pages) {
                    check(); const page = next++;
                    const result = await read(page);
                    if(result.previewUnsupported)throw Object.assign(new Error('此頁改用標準清單讀取'),{agePreviewUnsupported:true,ageReadFallback:true});
                    // Already admitted responses must still be validated after a
                    // sibling fails. A capacity downgrade cannot hide bad data.
                    accept(result, page);
                }
            } catch (error) {
                if (!failure || failure.agePreviewUnsupported&&!error.agePreviewUnsupported || !this.canFallbackAgeRead(error)) failure = error;
            }
        };
        await Promise.all(Array.from({length: Math.min(3, pages - 1)}, worker));
        check();
        // A later compact page can exceed the unchanged JSON/ticket budget.
        // Drain every admitted reader before restarting with the standard240 route.
        if(failure?.agePreviewUnsupported&&perPage===480)return this.seekAlbumAge(albumId,age,birthDate,{perPage:240,isCurrent,onProgress,deadline,preferCompact:false,preferAgeSelection:false});
        if (failure) throw failure;
        // Loaded rows may navigate to known content, but cannot prove an age is absent.
        // Re-read before an absent-age result if this scan reused an earlier prefix.
        if(usablePrefix&&!Number.isFinite(foundPage))return this.seekAlbumAge(albumId,age,birthDate,{perPage,isCurrent,onProgress,deadline,preferCompact,preferAgeSelection:false});
        const lastPage = pages, photos = [], ids = new Set();
        for (let page = 1; page <= lastPage; page++) {
            if (!results.has(page)) throw pagingError('照片尚未讀取完整，請重試');
            for (const photo of results.get(page)) {
                if (!photo || typeof photo.id !== 'string' || !/^[0-9]{1,32}$/.test(photo.id) || ids.has(photo.id))
                    throw pagingError('相簿內容已變更，請重新尋找回憶');
                ids.add(photo.id); photos.push(photo);
            }
        }
        if (photos.length !== total) throw pagingError('照片尚未讀取完整，請重試');
        if(perPage>=240){
            const index=photos.findIndex(photo=>calculateAge(birthDate,photoCalendarDay(photo)).years===age),uiPages=Math.max(1,Math.ceil(total/30));
            return {photos,total,pages:uiPages,page:uiPages,found:index>=0,ageBatchSize:perPage,inventoryRevision};
        }
        return {photos, total, pages, page: lastPage, found: Number.isFinite(foundPage),ageBatchSize:30,inventoryRevision};
    },
    async getAlbumPhotos(albumId, page = 1, perPage = CONFIG.PHOTOS_PER_PAGE, {expectedAuthority = null,initialTimeline = false} = {}) {
        if(CONFIG.ACCOUNT_MODE){
            const batch=perPage===480?480:Math.min(240,perPage);
            const bootstrap=await TimehutAccounts.takeTimelinePage?.(albumId,{page,perPage:batch,expectedAuthority});
            const data=bootstrap??await TimehutAccounts.request(`/api/album/${encodeURIComponent(albumId)}/photos?page=${page}&per_page=${batch}${batch===480?'&representation=preview':''}${initialTimeline&&page===1&&batch===30?'&initial_page=timeline-v1':''}`, {expectedAuthority});
            if(data?.age_read!==undefined){
                const capability=data.age_read;
                if(batch!==480||data.stat!=='ok'||data.photoset!==undefined||capability?.representation!=='preview'||capability.batch_size!==480||capability.supported!==false||capability.fallback_batch_size!==240)
                    throw Object.assign(new Error('相簿讀取能力尚未確認'),{ageReadIntegrity:true});
                return {previewUnsupported:true,ageBatchSize:240};
            }
            const count=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:
                typeof value==='string'&&/^\d{1,16}$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):NaN;
            const set=data?.photoset,total=count(set?.total),pages=count(set?.pages),actualPage=count(set?.page);
            if(data?.stat!=='ok'||set?.id!==albumId)throw Object.assign(new Error('相簿回應來源尚未確認'),{ageReadIntegrity:true});
            const photos=Array.isArray(set?.photo)?set.photo:total===0&&set?.photo==null?[]:null;
            if(!photos||!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(pages)||pages<0||actualPage!==page||photos.length>batch||photos.some(photo=>!photo||typeof photo.id!=='string'||!/^\d{1,32}$/.test(photo.id))||total>0&&(!photos.length||pages<1)||total===0&&(photos.length>0||pages>1||actualPage!==1))
                throw Object.assign(new Error('照片頁面尚未完整，請重新載入'),{ageReadFallback:true});
            const initialPageOnly=set.initial_page!==undefined;
            if(initialPageOnly&&(!initialTimeline||page!==1||batch!==30||set.initial_page?.protocol!=='timeline-v1'||set.initial_page.partial!==true||set.initial_page.full_inventory_required!==true||set.inventory_revision!==undefined))throw Object.assign(new Error('Initial page contract unavailable'),{ageReadIntegrity:true});
            const inventoryRevision=set.inventory_revision;
            if(inventoryRevision!==undefined&&!(typeof inventoryRevision==='string'&&/^[a-f0-9]{64}$/.test(inventoryRevision)))throw Object.assign(new Error('相簿清單版本尚未確認'),{ageReadIntegrity:true});
            const compact=set.age_batch_size===480;
            if(compact&&(batch!==480||set.representation!=='preview'||!inventoryRevision||photos.some(photo=>['m','l','o'].some(size=>typeof photo['url_'+size]!=='string'||!photo['url_'+size]))))
                throw Object.assign(new Error('相簿預覽資料尚未確認'),{ageReadIntegrity:true});
            return {photos,total,pages,page:actualPage,inventoryRevision,initialPageOnly,ageBatchSize:compact?480:set.age_batch_size===240?240:30};
        }
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
            extras: 'date_taken,date_upload,description,tags,url_sq,url_t,url_s,url_m,url_l,url_o,media',
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
     * 取得影片來源 URL (透過 getSizes)
     * @param {Object} photo - 照片物件
     * @returns {Promise<string>} 影片 URL (MP4)
     */
    /**
     * 取得影片來源 URL (透過 getSizes)
     * @param {Object} photo - 照片物件
     * @returns {Promise<string>} 影片 URL (MP4)
     */
    async getVideoUrl(photo) {
        if (photo?.media !== 'video' || !photo.id) throw new Error('找不到可播放的影片');
        if(CONFIG.ACCOUNT_MODE){if(!photo.videoPlayback)throw new Error('影片來源尚未確認');return photo.videoPlayback;}
        return `${CONFIG.UPLOAD_API_URL}/api/photo/${encodeURIComponent(photo.id)}/video?purpose=playback`;
    },

    /**
     * 建構照片 URL
     * @param {Object} photo - 照片物件
     * @param {string} size - 尺寸代碼 (sq, t, s, m, l, o)
     * @returns {string} 照片 URL
     */
    async refreshPhotoPreviewSource(source,{isCurrent=()=>true,photo=null}={}) {
        if(!CONFIG.ACCOUNT_MODE||typeof source!=='string')return null;
        const actor=window.TimehutAccounts?.status(),owner=actor?.user?.id,generation=actor?.generation;
        if(!owner||!isCurrent())return null;
        let old,base;
        try{old=new URL(source);base=new URL(CONFIG.UPLOAD_API_URL);}catch(_){return null;}
        const match=/^\/api\/photo\/([0-9]+)\/image$/.exec(old.pathname);
        const valid=url=>url.protocol==='https:'&&url.origin===base.origin&&!url.username&&!url.password&&!url.hash&&url.pathname===old.pathname&&
            url.searchParams.getAll('size').length===1&&url.searchParams.getAll('ticket').length===1&&Boolean(url.searchParams.get('ticket'))&&
            [...url.searchParams.keys()].every(key=>key==='size'||key==='ticket');
        const previewEpoch=PhotoPreviewScope.epoch;
        const size=old.searchParams.get('size');
        if(!match||!valid(old)||!['sq','t','s','m','l','o'].includes(size))return null;
        if(photo&&(typeof photo!=='object'||photo.id!==match[1]))return null;
        const current=()=>previewEpoch===PhotoPreviewScope.epoch&&owner===window.TimehutAccounts?.status()?.user?.id&&generation===window.TimehutAccounts?.status()?.generation&&isCurrent();
        if(!current())return null;
        const data=await TimehutAccounts.request('/api/photo/'+match[1]+'/sizes',{expectedAuthority:{owner,generation}});
        if(!current()||data?.stat!=='ok'||!Array.isArray(data.sizes?.size)||data.sizes.size.length>100)return null;
        const urls=data.sizes.size.filter(row=>row?.media!=='video').flatMap(row=>{
            try{const url=new URL(row.source);return valid(url)&&url.href!==old.href?[url]:[];}catch(_){return [];}
        });
        const renewed=urls.find(url=>url.searchParams.get('size')===size)||
            (size==='l'?urls.find(url=>url.searchParams.get('size')==='m'):null);
        if(!renewed||!current())return null;
        // This private weak cache never mutates the serializable photo row.
        // A new binding may reuse it only within the same live account epoch.
        if(photo){
            const previews={};
            for(const key of ['m','l']){
                const fresh=urls.find(url=>url.searchParams.get('size')===key);
                if(fresh)previews[key]=fresh.href;
            }
            PhotoPreviewRenewals.set(photo,{owner,generation,epoch:previewEpoch,photoId:photo.id,urls:Object.freeze(previews)});
        }
        return renewed.href;
    },
    bindPhotoPreview(img,photo,{isCurrent=()=>true,onOpen=null,onSettled=()=>{}}={}) {
        PhotoPreviewScope.bindings.get(img)?.();
        const actor=window.TimehutAccounts?.status(),owner=actor?.user?.id,generation=actor?.generation,epoch=PhotoPreviewScope.epoch;
        let settled=false;const finish=()=>{if(!settled){settled=true;onSettled();}};
        const baseAlt=(img.getAttribute('alt')||'照片預覽').replace(/（(?:載入中|已載入)）$/,'');img.alt=baseAlt+'（載入中）';img.setAttribute('aria-busy','true');
        const remembered=PhotoPreviewRenewals.get(photo);
        const renewed=remembered&&remembered.owner===owner&&remembered.generation===generation&&remembered.epoch===epoch&&remembered.photoId===photo.id?remembered.urls:null;
        const medium=renewed?.m||this.getPhotoUrl(photo,'m'),large=renewed?.l||this.getPhotoUrl(photo,'l');let source=medium,attempt=0,failed=false,active=true,button=null,refreshTried=false,refreshing=false;
        const current=()=>active&&epoch===PhotoPreviewScope.epoch&&img.isConnected&&owner===window.TimehutAccounts?.status()?.user?.id&&generation===window.TimehutAccounts?.status()?.generation&&isCurrent()&&img.getAttribute('src')===source;
        const error=async()=>{
            if(!current()||failed||refreshing)return;
            if(attempt++===0&&large&&large!==source){source=large;img.src=source;return;}
            if(CONFIG.ACCOUNT_MODE&&!refreshTried){
                refreshTried=true;refreshing=true;let fresh=null;
                try{fresh=await this.refreshPhotoPreviewSource(source,{isCurrent:current,photo});}catch(_){/* Keep the existing visible failure state. */}
                refreshing=false;if(!current())return;
                if(fresh){source=fresh;img.src=source;return;}
            }
            failed=true;placeholder.hidden=true;img.hidden=true;button=document.createElement('button');button.type='button';button.className='photo-preview-failed timeline-preview-failed';button.textContent='縮圖未載入，點此看照片';button.disabled=typeof onOpen!=='function';
            button.addEventListener('click',event=>{event.stopPropagation();if(current())onOpen?.(event);});img.parentElement.append(button);finish();
        };
        const placeholder=document.createElement('span');placeholder.className='photo-preview-pending';placeholder.textContent='照片載入中…';placeholder.setAttribute('aria-hidden','true');queueMicrotask(()=>{if(active&&img.parentElement){if(getComputedStyle(img.parentElement).position==='static')img.parentElement.style.position='relative';img.parentElement.append(placeholder);if(img.complete&&img.naturalWidth)loaded();}});const loaded=async()=>{if(!current()||!img.naturalWidth)return;const loadedSource=source;try{if(typeof img.decode==='function')await img.decode();}catch(_){if(current()&&source===loadedSource)error();return;}if(!current()||source!==loadedSource)return;img.alt=baseAlt+'（已載入）';img.setAttribute('aria-busy','false');placeholder.hidden=true;finish();};img.addEventListener('load',loaded);
        const cleanup=()=>{active=false;img.removeEventListener('error',error);img.removeEventListener('load',loaded);placeholder.remove();button?.remove();finish();};PhotoPreviewScope.bindings.set(img,cleanup);
        img.hidden=false;img.decoding='async';img.addEventListener('error',error);img.src=source;return cleanup;
    },
    getPhotoUrl(photo, size = 'm') {
        // If URL is already in photo object
        const urlKey = `url_${size}`;
        if (photo[urlKey]) {
            return photo[urlKey];
        }
        if(CONFIG.ACCOUNT_MODE&&['sq','t','s'].includes(size)&&photo.url_m)return photo.url_m;
        if(CONFIG.ACCOUNT_MODE)return '';

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
        if(CONFIG.ACCOUNT_MODE)return '#';
        return `https://www.flickr.com/photos/${CONFIG.FLICKR_USER_ID}/${photo.id}`;
    },

    /**
     * 搜尋照片（支援標籤搜尋）
     * For private photos, uses local filtering from pre-loaded album data
     * @param {string} query - 搜尋關鍵字
     * @param {Object} options - 額外選項 (albumId, page, perPage, allPhotos)
     * @returns {Promise<Object>} 搜尋結果
     */
    async searchPhotos(query, options = {}) {
        if(CONFIG.ACCOUNT_MODE){const params=new URLSearchParams({query:query||'',page:options.page||1,per_page:Math.min(30,options.perPage||30)});const selected=Number.parseInt(TimehutStorage.local.getItem('timehut_current_child')||'0',10),album=CONFIG.CHILDREN[selected];if(album)params.set('album',album.albumId);const result=await TimehutAccounts.request('/api/accounts/photos?'+params);return {photos:result.photos.photo||[],total:Number(result.photos.total),pages:Number(result.photos.pages),page:Number(result.photos.page)};}
        // If we have pre-loaded photos, filter locally (for private albums)
        if (options.allPhotos && options.allPhotos.length > 0) {
            const filtered = this.filterPhotosLocally(options.allPhotos, query);
            const page = options.page || 1;
            const perPage = options.perPage || 50;
            const start = (page - 1) * perPage;
            const paged = filtered.slice(start, start + perPage);

            return {
                photos: paged,
                total: filtered.length,
                pages: Math.ceil(filtered.length / perPage),
                page: page
            };
        }

        // Fallback: try Flickr public API search (for public photos)
        try {
            const data = await this.call('flickr.photos.search', {
                user_id: CONFIG.FLICKR_USER_ID,
                text: query,
                tags: query.replace(/\s+/g, ','),
                tag_mode: 'any',
                extras: 'date_taken,date_upload,description,tags,url_sq,url_t,url_s,url_m,url_l,media',
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
        } catch (error) {
            console.error('Search API failed, returning empty:', error);
            return { photos: [], total: 0, pages: 0, page: 1 };
        }
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
            // Handle Flickr description which can be { _content: "..." } or string
            let descStr = '';
            if (photo.description) {
                if (typeof photo.description === 'object' && photo.description._content) {
                    descStr = photo.description._content;
                } else if (typeof photo.description === 'string') {
                    descStr = photo.description;
                }
            }
            const description = descStr.toLowerCase();
            const tags = (photo.tags || '').toLowerCase();

            return title.includes(lowerQuery) ||
                description.includes(lowerQuery) ||
                tags.includes(lowerQuery);
        });
    }
};

// Make FlickrAPI globally available
window.FlickrAPI = FlickrAPI;
