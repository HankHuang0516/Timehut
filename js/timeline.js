/**
 * 黃家小屋 - 時間軸邏輯
 * Timeline logic for Timehut Clone
 */

// Global state
const TimelineState = {
    currentChildIndex: parseInt((window.TimehutStorage?.local || localStorage).getItem('timehut_current_child') || '0'),
    photos: [],
    groupedPhotos: [],
    currentPage: 0,
    totalPages: 1,
    isLoading: false,
    loadRequestId: 0,
    listGeneration: 0,
    searchQuery: '',
    searchTimer: null,
    loadFailed: false,
    failedPage: null,
    activeLoad: null,
    ageNavigationRequest: 0,
    ageNavigationBusy: false,
    ageReadMode: null,
    inventoryRevision: null,
    ageFilter: null,
    ageCounts: null,
    currentModalIndex: 0,
    allPhotosFlat: [],
    momentData: new Map(), // Store moment data for album navigation
    SCROLL_POSITION_KEY: 'timehut_timeline_scroll_position'
};

// Selection state for batch operations
const SelectionState = {
    isSelectMode: false,
    selectedPhotos: new Set(),
    revision: 0,
    signature: '',
    downloadBusy: false
};

// Moment Selection state for batch moment operations
const MomentSelectionState = {
    isSelectMode: false,
    selectedMoments: new Map() // Map of momentDataId -> { photos: [], timestamp: ... }
};

// Cross-document return bookmarks contain navigation metadata only. Photos and
// media tickets are always re-read under the freshly admitted account context.
const TIMELINE_RETURN_KEY = 'timehut:timeline-return:v1';
// At most two positive, completely verified ages share one display buffer.
// This is never an all-album pagination prefix or a media authorization proof.
const VerifiedAgeViews=new Map();
function clearVerifiedAgeViews(){VerifiedAgeViews.clear();}
function ageDisplayScopeKey(){const scope=timelineReturnScope(),actor=window.TimehutAccounts?.status();return scope&&actor?.authenticated&&!actor.unconfirmed?JSON.stringify({...scope,generation:actor.generation}):null;}
function ageSourceProofKey(proof){return JSON.stringify([proof.inventory_revision,proof.user_id,proof.album_id,proof.birth_date,proof.time_zone,proof.source_total,Object.entries(proof.age_counts).sort((a,b)=>Number(a[0])-Number(b[0]))]);}
function prepareVerifiedAgeDisplay(years,result){
    const key=ageDisplayScopeKey(),proof=result.ageSelection;
    const bad=()=>Object.assign(new Error('此歲數的顯示範圍尚未確認'),{ageReadIntegrity:true});
    if(!key||!proof||proof.complete!==true||proof.age!==years||result.photos.length!==proof.selected_total||result.total!==proof.selected_total||!result.found||result.inventoryRevision!==proof.inventory_revision)throw bad();
    const scope=JSON.parse(key);
    if(proof.user_id!==scope.owner||proof.album_id!==scope.album||proof.birth_date!==scope.birthDate||proof.time_zone!==scope.timeZone||!Number.isSafeInteger(proof.source_total)||proof.source_total<proof.selected_total||!proof.age_counts||proof.age_counts[years]!==proof.selected_total)throw bad();
    const prior=[...VerifiedAgeViews.values()][0],sourceKey=ageSourceProofKey(proof);
    if(prior&&(prior.key!==key||prior.revision!==proof.inventory_revision))clearVerifiedAgeViews();
    else if(prior&&prior.sourceKey!==sourceKey){clearVerifiedAgeViews();throw bad();}
    VerifiedAgeViews.delete(years);VerifiedAgeViews.set(years,{key,revision:proof.inventory_revision,sourceKey,result:{...result,photos:result.photos.slice()}});
    while(VerifiedAgeViews.size>2)VerifiedAgeViews.delete(VerifiedAgeViews.keys().next().value);
    const photos=[],ids=new Set();
    for(const view of VerifiedAgeViews.values())for(const photo of view.result.photos){
        if(ids.has(photo.id)){clearVerifiedAgeViews();throw bad();}ids.add(photo.id);photos.push(photo);
    }
    const pages=Math.max(1,Math.ceil(photos.length/30));
    return {result:{photos,total:photos.length,pages,page:pages,inventoryRevision:proof.inventory_revision,ageCounts:{...proof.age_counts},ageBatchSize:480,verifiedAgeDisplay:true},filter:{years,loadedYears:[...VerifiedAgeViews.keys()].sort((a,b)=>a-b),scopeKey:key,revision:proof.inventory_revision,sourceTotal:proof.source_total}};
}
function jumpToVerifiedLoadedAge(years,{closeMenu}){
    if(TimelineState.searchQuery||document.getElementById('searchInput').value.trim()||!TimelineState.ageFilter)return false;
    const view=VerifiedAgeViews.get(years),key=ageDisplayScopeKey();
    if(!view||!key||view.key!==key||TimelineState.ageFilter.scopeKey!==key||TimelineState.inventoryRevision!==view.revision){if(view)clearVerifiedAgeViews();return false;}
    const selected=TimelineState.photos.filter(photo=>calculateAge(JSON.parse(key).birthDate,photoCalendarDay(photo)).years===years),ids=new Set(selected.map(photo=>photo.id));
    if(selected.length!==view.result.photos.length||ids.size!==selected.length||view.result.photos.some(photo=>!ids.has(photo.id))){clearVerifiedAgeViews();return false;}
    const group=TimelineState.groupedPhotos.filter(group=>Math.floor(group.sortKey/100)===years).sort((a,b)=>a.sortKey-b.sortKey)[0];
    if(!group||!document.getElementById(`age-${group.sortKey}`))return false;
    cancelAgeNavigation();TimelineState.loadRequestId++;TimelineState.activeLoad=null;TimelineState.isLoading=false;
    document.getElementById('loadingIndicator').style.display='none';if(!scrollToAgeGroup(group))return false;
    VerifiedAgeViews.delete(years);VerifiedAgeViews.set(years,view);TimelineState.ageFilter.years=years;ageNavigationStatus('');
    if(closeMenu){document.getElementById('timeTravelMenu').style.display='none';document.getElementById('timeTravelBtn').setAttribute('aria-expanded','false');document.getElementById('timeTravelBtn').focus({preventScroll:true});}
    return true;
}
for(const event of ['pagehide','timehut-account-changed'])window.addEventListener(event,clearVerifiedAgeViews);
let timelineReturnSequence = 0;
function timelineReturnScope(index = TimelineState.currentChildIndex) {
    const actor = window.TimehutAccounts?.status(), child = CONFIG.CHILDREN[index];
    if (!actor?.authenticated || actor.unconfirmed || !actor.user?.id || !child?.albumId) return null;
    return {owner:actor.user.id, album:child.albumId,
        birthDate:(window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${index}_birthdate`) || child.birthDate,
        timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
}
function readTimelineReturn() {
    try {
        const params = new URLSearchParams(location.search), token = params.get('returnTo');
        if (!/^[a-f0-9-]{36}$/.test(token || '')) return null;
        const value = JSON.parse(sessionStorage.getItem(TIMELINE_RETURN_KEY) || 'null');
        const index = CONFIG.CHILDREN.findIndex(child => child.albumId === params.get('album'));
        const scope = timelineReturnScope(index);
        if (!value || !scope || value.token !== token || value.version !== 1 ||
            !Object.keys(scope).every(key => value[key] === scope[key]) ||
            !Number.isFinite(value.at) || Date.now() < value.at || Date.now() - value.at > 30 * 60 * 1000 ||
            !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || !Number.isInteger(value.age) || value.age < 0 || value.age > 150 ||
            calculateAge(scope.birthDate, value.day).years !== value.age ||
            !Number.isFinite(value.top) || Math.abs(value.top) > 10000) return null;
        return value;
    } catch (_) { return null; }
}
function rememberTimelineReturn(momentData) {
    try {
        const scope = timelineReturnScope(), day = photoCalendarDay(momentData.photos[0]);
        if (!scope || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
        const node = [...document.querySelectorAll('.moment-item')].find(el => el.dataset.timelineDay === day);
        const value = {...scope,version:1,token:crypto.randomUUID(),at:Date.now(),day,
            age:calculateAge(scope.birthDate,day).years,top:node?.getBoundingClientRect().top || 0};
        sessionStorage.setItem(TIMELINE_RETURN_KEY, JSON.stringify(value));
        const url = new URL(location.href);url.searchParams.set('album',scope.album);url.searchParams.set('returnTo',value.token);
        history.replaceState(history.state, '', url);
        return value.token;
    } catch (_) { return null; }
}

// Keep only the original, scope-bound reading bookmark while live search changes the view.
let searchNavigationOrigin = null;
function clearSearchNavigationOrigin() { searchNavigationOrigin = null; }
function currentSearchNavigationContext() {
    if (!searchNavigationOrigin) return undefined;
    const origin=searchNavigationOrigin, actor=window.TimehutAccounts?.status(), scope=timelineReturnScope();
    if (!origin.context || !origin.scope || !scope || !actor?.authenticated || actor.unconfirmed ||
        actor.generation !== origin.generation ||
        !['owner','album','birthDate','timeZone'].every(key=>origin.scope[key]===scope[key])) return null;
    const saved=readTimelineReturn();
    return saved?.token===origin.context.token && saved.album===origin.context.album ? {...origin.context} : null;
}
function captureSearchNavigationOrigin() {
    if (searchNavigationOrigin) return;
    searchNavigationOrigin={scope:timelineReturnScope(),generation:window.TimehutAccounts?.status().generation,
        context:rememberCurrentTimelineNavigation({ignoreSearchOrigin:true})};
}

function rememberCurrentTimelineNavigation({ignoreSearchOrigin=false}={}) {
    if (!ignoreSearchOrigin) { const original=currentSearchNavigationContext();if (original!==undefined) return original; }
    if (TimelineState.returnRestoring || TimelineState.ageNavigationBusy || TimelineState.currentPage < 1) return null;
    const header = Math.max(0, document.querySelector('.header')?.getBoundingClientRect().bottom || 0);
    const node = [...document.querySelectorAll('#timelineContainer .moment-item')].find(card => {
        const r = card.getBoundingClientRect();return r.bottom > header && r.top < innerHeight;
    });
    const day = node?.dataset.timelineDay;
    const photo = TimelineState.allPhotosFlat.find(item => photoCalendarDay(item) === day);
    if (!photo) return null;
    const scope = timelineReturnScope(), token = rememberTimelineReturn({photos:[photo]});
    return scope && token ? {album:scope.album, token} : null;
}

function cancelTimelineReturn({retire=true}={}) {
    timelineReturnSequence++;
    if (TimelineState.returnRestoring && retire) {
        TimelineState.ageNavigationRequest++;TimelineState.ageNavigationBusy=false;TimelineState.ageReadMode=null;resumeAgeImages();
    }
    TimelineState.returnRestoring = false;
    document.getElementById('timelineReturnStatus')?.remove();
    const container = document.getElementById('timelineContainer');
    if (container) { container.style.visibility = ''; container.removeAttribute('aria-busy'); }
}
window.addEventListener('timehut-account-changed', () => {
    cancelTimelineReturn();
    try { sessionStorage.removeItem(TIMELINE_RETURN_KEY); } catch (_) { /* Optional bookmark. */ }
});
window.addEventListener('pagehide', cancelTimelineReturn);
function bindTimelineReturnLinks() {
    if (!location.pathname.endsWith('/album.html')) return;
    // The album's authenticated context must match before its links carry a bookmark.
    const saved = readTimelineReturn(), album = new URLSearchParams(location.search).get('album');
    if (!CONFIG.CHILDREN.some(child => child.albumId === album)) return;
    const url = new URL('timeline.html', location.href);url.searchParams.set('album',album);
    if (saved) url.searchParams.set('returnTo',saved.token);
    for (const link of document.querySelectorAll('a[href="timeline.html"]')) link.href = url.href;
}
async function restoreTimelineReturn(saved) {
    const sequence = ++timelineReturnSequence, actor = TimehutAccounts.status();
    const expectedAuthority = {owner:actor.user?.id,generation:actor.generation};
    const current = () => {
        const now = TimehutAccounts.status(), scope = timelineReturnScope();
        return sequence === timelineReturnSequence && now.authenticated && !now.unconfirmed &&
            now.user?.id === expectedAuthority.owner && now.generation === expectedAuthority.generation &&
            scope && ['owner','album','birthDate','timeZone'].every(key => scope[key] === saved[key]);
    };
    const container = document.getElementById('timelineContainer');
    TimelineState.returnRestoring = true;container.style.visibility = 'hidden';container.setAttribute('aria-busy','true');
    const status = document.createElement('div');status.id = 'timelineReturnStatus';status.setAttribute('role','status');status.className = 'empty-state';
    status.textContent = '正在回到上次閱讀的位置…';
    const stop = document.createElement('button');stop.type = 'button';stop.className = 'btn-secondary';stop.textContent = '停止返回';stop.onclick = async () => {
        const pending = TimelineState.activeLoad;
        cancelTimelineReturn();const stoppedAt = timelineReturnSequence;
        if (pending) await pending;
        if (stoppedAt === timelineReturnSequence && currentScopeMatches(saved) && TimelineState.currentPage === 0) void loadPhotos(1);
    };
    status.append(stop);container.before(status);
    let restored = false;
    try {
        const fresh = await TimehutAccounts.request('/api/accounts/me', {expectedAuthority});
        if (!current() || fresh.user?.id !== saved.owner) return;
        // An authenticated age destination does not need the unrelated newest page.
        // The age reader retains its existing ordinary-query fallback when needed.
        if (!(CONFIG.ACCOUNT_MODE && typeof FlickrAPI.seekAlbumAge === 'function')) {
            if (!await loadPhotos(1, {ageGuard:current}) || !current()) return;
        }
        await scrollToAge(saved.age, {closeMenu:true,fromReturn:true,returnGuard:current});
        if (!current()) return;
        const hasAge = () => TimelineState.groupedPhotos.some(group => Math.floor(group.sortKey / 100) === saved.age);
        const findDay = () => [...container.querySelectorAll('.moment-item')].find(el => el.dataset.timelineDay === saved.day);
        // A year can span several ordinary pages. Re-read until the recorded day
        // exists; never manufacture a card from cached private photo metadata.
        const deadline = Date.now() + 30000;
        while (!findDay() && hasAge() && current() && TimelineState.currentPage < TimelineState.totalPages && Date.now() < deadline) {
            const previousPage = TimelineState.currentPage;
            if (!await loadPhotos(previousPage + 1, {ageGuard:current}) || TimelineState.currentPage <= previousPage) break;
        }
        if (!current()) return;
        const node = findDay();
        if (node) {
            // Remove the temporary block before measuring the final page layout.
            // The timeline stays hidden until finally retires the restoration UI.
            status.remove();
            const headerBottom = Math.max(0,document.querySelector('.header')?.getBoundingClientRect().bottom || 0);
            restoreTimelineAnchor({day:saved.day,top:Math.max(headerBottom,Math.min(saved.top,innerHeight / 2))});
            restored = true;
        }
    } catch (_) { /* Preserve the fresh view; expose a failed return explicitly. */ }
    finally {
        if (sequence === timelineReturnSequence) {
            cancelTimelineReturn({retire:false});
            TimelinePreviewQueue.schedule();
            if (!restored && currentScopeMatches(saved)) showToast('原本的閱讀位置尚未恢復，請重新選擇歲數。','warning');
        }
    }
}
function currentScopeMatches(saved) {
    const scope = timelineReturnScope();
    return scope && ['owner','album','birthDate','timeZone'].every(key => scope[key] === saved[key]);
}

/**
 * 導向搜尋結果頁面
 */
function navigateToSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (query) {
        captureSearchNavigationOrigin();
        clearTimeout(TimelineState.searchTimer);TimelineState.searchTimer=null;
        const target = `search.html?q=${encodeURIComponent(query)}`;
        window.location.href = window.TimehutEntry?.navigationDestination(target,rememberCurrentTimelineNavigation()) || target;
    }
}

/**
 * 導向同日照片詳情頁面
 * @param {string} momentId - Moment 識別碼
 */
function navigateToAlbum(momentId) {
    const momentData = TimelineState.momentData.get(momentId);
    if (momentData) {
        // Store moment photos in sessionStorage for album page
        (window.TimehutStorage?.session || sessionStorage).setItem('albumPhotos', JSON.stringify(momentData.photos));
        (window.TimehutStorage?.session || sessionStorage).setItem('albumDate', momentData.dateStr);
        (window.TimehutStorage?.session || sessionStorage).setItem('albumMomentId', momentId);
        const album = CONFIG.CHILDREN[TimelineState.currentChildIndex].albumId;
        const date = photoCalendarDay(momentData.photos[0]);
        const query = new URLSearchParams({ id: momentId, album, date, child: TimelineState.currentChildIndex });
        const photoIds = momentData.photos.map(photo => String(photo.id));
        // Carry only bounded identifiers, never private media URLs or credentials.
        // The next page still reads through the authenticated album endpoint.
        if (photoIds.length <= 200 && photoIds.every(id => /^[0-9]{1,32}$/.test(id)))
            query.set('photos', [...new Set(photoIds)].join(','));
        const returnToken = rememberTimelineReturn(momentData);
        if (returnToken) query.set('returnTo', returnToken);
        window.location.href = `album.html?${query}`;
    } else {
        console.error('Moment data not found:', momentId);
    }
}

/**
 * 顯示 Toast 通知
 * @param {string} message - 訊息內容
 * @param {string} type - 類型 ('success' | 'error' | 'warning' | 'info')
 */
function showToast(message, type = 'success') {
    // Create container if not exists
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const viewer = document.querySelector('.photo-modal.active .modal-info');
    container.classList.toggle('viewer-toast', Boolean(viewer));
    if (viewer) viewer.prepend(container);
    else document.body.appendChild(container);

    // Get icon based on type
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    const icon = icons[type] || '✅';

    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = `${icon} ${message}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    container.replaceChildren(toast);

    // Keep viewer feedback visible until the next action or photo. Moving to a
    // different photo clears it, so an old failure cannot label the new media.
    if (viewer) {
        toast.scrollIntoView({block:'nearest',behavior:'instant'});
        return;
    }

    // Auto remove after 2.5s
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

function clearViewerFeedback() {
    document.querySelector('.toast-container.viewer-toast')?.replaceChildren();
}

/**
 * 切換時光旅行選單顯示
 */
function toggleTimeTravelMenu() {
    const menu = document.getElementById('timeTravelMenu');
    if (menu.style.display === 'none') {
        populateTimeTravelMenu();
        menu.style.display = 'block';
    } else {
        menu.style.display = 'none';
    }
    document.getElementById('timeTravelBtn').setAttribute('aria-expanded', String(menu.style.display !== 'none'));
    if(menu.style.display==='none'){cancelAgeNavigation();document.getElementById('timeTravelBtn').focus({preventScroll:true});}
}

/**
 * 填充時光旅行選單
 */
function populateTimeTravelMenu() {
    const list=document.getElementById('timeTravelList');
    if(!list)return;
    const child=CONFIG.CHILDREN[TimelineState.currentChildIndex];
    const birthDate=(window.TimehutStorage?.local||localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`)||child.birthDate;
    const milestones=generateAgeNavigation(birthDate);
    list.replaceChildren();
    for(const item of milestones){
        const groups=TimelineState.groupedPhotos.filter(group=>Math.floor(group.sortKey/100)===item.value);
        const count=groups.reduce((total,group)=>total+group.photos.length,0);
        const button=document.createElement('button');button.type='button';button.className='time-travel-item';button.dataset.age=String(item.value);
        const label=document.createElement('span');label.className='age-label';label.textContent=item.label;
        const amount=document.createElement('span');amount.className='photo-count';
        amount.textContent=TimelineState.ageCounts?`${TimelineState.ageCounts[item.value]||0} 筆`:TimelineState.currentPage<TimelineState.totalPages?(count?`已載入 ${count} 筆`:'尚未載入'):`${count} 筆`;
        button.append(label,amount);button.onclick=()=>scrollToAge(item.value,{closeMenu:true});list.append(button);
    }
}

function ageNavigationStatus(text) {
    let status=document.getElementById('ageNavigationStatus');
    if(!status){status=document.createElement('p');status.id='ageNavigationStatus';status.setAttribute('role','status');document.getElementById('timeTravelList')?.before(status);}
    status.textContent=text;
}

function cancelAgeNavigation() {
    TimelineState.ageNavigationRequest++;
    TimelineState.ageNavigationBusy=false;
    TimelineState.ageReadMode=null;
    resumeAgeImages({restartInitial:true});
    ageNavigationStatus('');syncTimelineLoadMoreControl();
}

// Pause only images that have no decoded pixels yet. The already-visible old
// view remains usable until a correctly scoped age response replaces it.
let ageImagePause=null;
function ageImageScopeMatches(pause){
    const account=window.TimehutAccounts?.status();
    return pause&&pause.view===TimelineState.listGeneration&&pause.child===TimelineState.currentChildIndex&&pause.album===CONFIG.CHILDREN[pause.child]?.albumId&&pause.account===account?.generation&&pause.owner===account?.user?.id;
}
function resumeAgeImages({restore=true,restartInitial=false}={}){
    const pause=ageImagePause;ageImagePause=null;if(!pause)return;
    const allowed=restore&&ageImageScopeMatches(pause);
    if(allowed)TimelinePreviewQueue.resume();else TimelinePreviewQueue.clear();
    for(const [img,source]of pause.images){
        if(img.dataset.timehutAgePaused!==pause.token)continue;
        delete img.dataset.timehutAgePaused;
        if(allowed&&img.isConnected&&img.closest('#timelineContainer')&&!img.hasAttribute('src'))img.setAttribute('src',source);
    }
    if(allowed&&restartInitial&&pause.initialLoad&&TimelineState.currentPage===0&&!TimelineState.activeLoad&&!TimelineState.isLoading)loadPhotos(1);
}
function pauseAgeImages(request){
    TimelinePreviewQueue.pause();
    if(ageImagePause&&!ageImageScopeMatches(ageImagePause))resumeAgeImages({restore:false});
    if(!ageImagePause){const account=window.TimehutAccounts?.status();ageImagePause={view:TimelineState.listGeneration,child:TimelineState.currentChildIndex,album:CONFIG.CHILDREN[TimelineState.currentChildIndex]?.albumId,account:account?.generation,owner:account?.user?.id,token:String(request),initialLoad:TimelineState.currentPage===0&&TimelineState.isLoading,images:new Map()};}
    ageImagePause.request=request;
    for(const img of document.querySelectorAll('#timelineContainer .moment-photo-container img')){
        const source=img.getAttribute('src');if(!source||img.complete||img.naturalWidth>0)continue;
        ageImagePause.images.set(img,source);img.dataset.timehutAgePaused=ageImagePause.token;img.removeAttribute('src');
    }
    // An admitted old pagination response must not create a fresh batch of old
    // images while the age query is in flight. Its late result is discarded.
    TimelineState.loadRequestId++;TimelineState.activeLoad=null;TimelineState.isLoading=false;
    document.getElementById('loadingIndicator').style.display='none';
    return ageImagePause;
}

/**
 * 初始化時間軸頁面
 */
/**
 * 初始化時間軸頁面
 */
async function initTimeline() {
    if(!new URLSearchParams(location.search).has('album')&&window.TimehutPage?.empty())return;
    const profiles=document.querySelector('.child-profiles')||document.querySelector('.profile-btn')?.parentElement;
    if(profiles&&CONFIG.ACCOUNT_MODE){profiles.replaceChildren(...CONFIG.CHILDREN.map((child,index)=>{const button=document.createElement('button');button.className='profile-btn';button.dataset.child=String(index);button.title=child.name;button.setAttribute('aria-label',`查看 ${child.name} 的相簿`);const emoji=document.createElement('span');emoji.className='profile-emoji';emoji.textContent=child.emoji;button.append(emoji);return button;}));}
    // Check for URL params (e.g. tag filter)
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const tagName = urlParams.get('tag_name');
    const q = urlParams.get('q');

    // Get selected child from localStorage (set by album sidebar)
    let selectedChild=null;try{selectedChild=(window.TimehutStorage?.local||localStorage).getItem('timehut_current_child');}catch(_){/* Preferences are optional. */}
    TimelineState.currentChildIndex = selectedChild !== null ? parseInt(selectedChild, 10) : 0;
    if(!CONFIG.CHILDREN[TimelineState.currentChildIndex])TimelineState.currentChildIndex=0;

    // A deep link is an explicit destination, not an optional saved preference.
    const requestedAlbum=new URLSearchParams(location.search).get('album');
    if(requestedAlbum!==null){
        const requiredIndex=CONFIG.CHILDREN.findIndex(child=>child.albumId===requestedAlbum);
        if(requiredIndex<0){
            document.getElementById('loadingIndicator').style.display='none';
            const empty=document.getElementById('emptyState');empty.style.display='block';
            empty.querySelector('h3').textContent='這本相簿尚未確認';
            empty.querySelector('p').textContent='請重新載入確認相簿，或回到帳戶選擇其他相簿。';
            const retry=document.createElement('button');retry.type='button';retry.className='btn-secondary';retry.textContent='重新載入';retry.onclick=()=>location.reload();empty.append(retry);return;
        }
        TimelineState.currentChildIndex=requiredIndex;
        try{(window.TimehutStorage?.local||localStorage).setItem('timehut_current_child',String(requiredIndex));}catch(_){/* Selection remains valid without preferences. */}
    }

    // Update UI with selected child
    updateChildDisplay();

    // Setup event listeners
    setupEventListeners();

    // Setup loading timeout - show reload button after 8 seconds
    const loadingTimeout = setTimeout(() => {
        const reloadBtn = document.getElementById('reloadBtn');
        const loadingText = document.getElementById('loadingText');
        if (reloadBtn && TimelineState.isLoading) {
            reloadBtn.style.display = 'block';
            if (loadingText) loadingText.textContent = '載入時間較長，請稍候或嘗試重新載入';
        }
    }, 8000);

    // Clear timeout when photos are loaded
    TimelineState.loadingTimeout = loadingTimeout;

    // Load the authenticated return destination before exposing a fresh list.
    const savedReturn = readTimelineReturn();
    if (!tagName && !q && savedReturn) { await restoreTimelineReturn(savedReturn); return; }

    // Load initial data
    if (tagName) {
        // Switch to search mode for tag
        document.getElementById('searchInput').value = tagName;
        await handleSearch({ target: { value: tagName } }, true);
    } else if (q) {
        document.getElementById('searchInput').value = q;
        await handleSearch({ target: { value: q } }, true);
    } else {
        await loadPhotos();
    }
}

/**
 * 更新目前選擇的小孩顯示
 */
function updateChildDisplay() {
    const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];

    // Get birthdate from localStorage or use default
    const birthDate = (window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`)
        || child.birthDate;

    // Update header
    document.getElementById('currentChildName').textContent = child.name;

    // Calculate current age using saved birthdate
    const age = calculateAge(birthDate, new Date());
    document.getElementById('currentChildAge').textContent = formatAgeString(age.years, age.months, age.days);

    // Update sidebar buttons
    document.querySelectorAll('.profile-btn').forEach((btn, index) => {
        btn.classList.toggle('active', index === TimelineState.currentChildIndex);
        btn.setAttribute('aria-pressed', String(index === TimelineState.currentChildIndex));
    });
    document.querySelectorAll('.sidebar-album-card').forEach((btn, index) => {
        btn.classList.toggle('active', index === TimelineState.currentChildIndex);
        btn.setAttribute('aria-pressed', String(index === TimelineState.currentChildIndex));
    });

    // Build age navigation with saved birthdate
    buildAgeNavigation(birthDate);
}

/**
 * 設置事件監聽器
 */
function setupEventListeners() {
    // Child profile buttons
    document.querySelectorAll('.profile-btn').forEach((btn, index) => {
        btn.addEventListener('click', () => switchChild(index));
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', event=>{if(event.target.value.trim())captureSearchNavigationOrigin();clearTimeout(TimelineState.searchTimer);TimelineState.searchTimer=setTimeout(()=>handleSearch(event),500);});
    }

    // Keyboard navigation for modal
    document.addEventListener('keydown', handleKeyboard);

    // Selection mode buttons
    const selectModeBtn = document.getElementById('selectModeBtn');
    if (selectModeBtn) {
        selectModeBtn.addEventListener('click', toggleSelectMode);
    }

    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (deleteSelectedBtn && !deleteSelectedBtn.hasAttribute('onclick')) {
        deleteSelectedBtn.addEventListener('click', deleteSelectedPhotos);
    }

    const cancelSelectBtn = document.getElementById('cancelSelectBtn');
    if (cancelSelectBtn) {
        cancelSelectBtn.addEventListener('click', () => {
            SelectionState.selectedPhotos.clear();
            toggleSelectMode();
        });
    }

    // Infinite scroll
    window.addEventListener('scroll', throttle(handleScroll, 200));

    // Photo gestures are scoped to the image by photo-viewer-gestures.js.
    const modal = document.getElementById('photoModal');

    // Fix: Click background to close photo modal
    if (modal) {
        modal.addEventListener('click', (e) => {
            // Close if clicking the modal container itself, the overlay, or the content wrapper (empty space)
            if (e.target === modal || 
                e.target.classList.contains('modal-overlay') || 
                e.target.classList.contains('modal-content')) {
                closeModal();
            }
        });
    }
}

/**
 * 切換小孩
 * @param {number} index - 小孩索引
 */
async function switchChild(index) {
    cancelTimelineReturn();
    if (!Number.isInteger(index) || !CONFIG.CHILDREN[index]) return;
    (window.TimehutStorage?.local || localStorage).setItem('timehut_current_child', String(index));
    (window.TimehutStorage?.session || sessionStorage).setItem('selectedChild', String(index));
    if (index === TimelineState.currentChildIndex) return;
    if (SelectionState.isSelectMode) toggleSelectMode();
    if (MomentSelectionState.isSelectMode) window.toggleMomentSelectMode();

    resetTimelineView();
    TimelineState.currentChildIndex = index;
    TimelineState.searchQuery='';
    document.getElementById('searchInput').value='';

    (window.TimehutStorage?.session || sessionStorage).setItem('selectedChild', index);

    updateChildDisplay();
    await loadPhotos();
}

/**
 * 載入照片
 */
function retireTimelineRequests() {
    clearTimeout(TimelineState.searchTimer);TimelineState.searchTimer=null;
    TimelineState.ageNavigationRequest++;TimelineState.ageNavigationBusy=false;TimelineState.ageReadMode=null;resumeAgeImages();ageNavigationStatus('');TimelineState.listGeneration++;TimelineState.loadRequestId++;
    TimelineState.activeLoad=null;TimelineState.isLoading=false;
}
function resetTimelineView({preserveAgeViews=false,preserveSearchOrigin=false}={}) {
    if(!preserveSearchOrigin)clearSearchNavigationOrigin();
    if(!preserveAgeViews)clearVerifiedAgeViews();
    TimelinePreviewQueue.clear();
    TimelineState.programmaticScrollTop=undefined;
    TimelineState.loadedAlbumPrefix=null;
    TimelineState.inventoryRevision=null;
    resumeAgeImages({restore:false});
    retireTimelineRequests();TimelineState.loadFailed=false;TimelineState.failedPage=null;
    TimelineState.currentPage=0;TimelineState.totalPages=1;syncTimelineLoadMoreControl();
    TimelineState.photos=[];TimelineState.groupedPhotos=[];TimelineState.allPhotosFlat=[];TimelineState.momentData.clear();
    TimelineState.ageFilter=null;TimelineState.ageCounts=null;document.getElementById('ageFilterSummary')?.remove();
    const empty=document.getElementById('emptyState');if(empty?.dataset.ageDefaultTitle!==undefined){empty.querySelector('h3').textContent=empty.dataset.ageDefaultTitle;empty.querySelector('p').textContent=empty.dataset.ageDefaultText;}
}
// Retain the currently visible calendar card when a later upload is sorted
// into an earlier age. Capture at commit time so manual scrolling wins.
function captureTimelineAnchor() {
    const top=Math.max(0,document.querySelector('.header')?.getBoundingClientRect().bottom||0);
    const nodes=[...document.querySelectorAll('#timelineContainer .age-group-header,#timelineContainer .moment-item')];
    const node=nodes.find(el=>{const r=el.getBoundingClientRect();return r.bottom>top&&r.top<innerHeight;});
    if(!node)return null;
    return {id:node.classList.contains('age-group-header')?node.id:null,day:node.dataset.timelineDay,top:node.getBoundingClientRect().top};
}
function restoreTimelineAnchor(anchor) {
    if(!anchor)return;
    const node=anchor.id?document.getElementById(anchor.id):[...document.querySelectorAll('#timelineContainer .moment-item')].find(el=>el.dataset.timelineDay===anchor.day);
    if(!node)return;
    window.scrollBy({top:node.getBoundingClientRect().top-anchor.top,behavior:'instant'});
    TimelineState.programmaticScrollTop=window.scrollY;
}
function syncTimelineLoadMoreControl() {
    const loader=document.getElementById('loadingIndicator');if(!loader)return;
    let button=document.getElementById('loadingMoreButton');
    if(!button){button=document.createElement('button');button.id='loadingMoreButton';button.type='button';button.className='btn-secondary timeline-load-more';button.style.margin='16px auto';button.style.minHeight='48px';button.addEventListener('click',()=>void loadMorePhotos());loader.after(button);}
    const visible=!TimelineState.searchQuery&&!TimelineState.loadFailed&&!TimelineState.ageNavigationBusy&&TimelineState.currentPage>0&&TimelineState.currentPage<TimelineState.totalPages;
    button.hidden=!visible;button.style.display=visible?'block':'none';button.disabled=TimelineState.isLoading;
    button.textContent=TimelineState.isLoading?'正在讀取回憶…':'載入更多回憶';button.setAttribute('aria-busy',String(TimelineState.isLoading));
}
function commitTimelinePage(result,page,child) {
    if(!Array.isArray(result.photos)||!Number.isInteger(result.pages)||result.pages<1)throw Error('照片頁面尚未確認');
    const revision=result.inventoryRevision||null;
    if(page===1)TimelineState.initialPageOnly=result.initialPageOnly===true;
    if(page>1&&revision!==TimelineState.inventoryRevision)
        throw Object.assign(new Error('相簿內容已更新，請重新載入。'),{inventoryChanged:true,ageReadIntegrity:true});
    if(page===1)TimelineState.inventoryRevision=revision;
    const container=document.getElementById('timelineContainer');
    const anchor=page>1?captureTimelineAnchor():null;
    if(page===1)Array.from(container.children).filter(el=>!el.id?.includes('loading')&&!el.id?.includes('empty')).forEach(el=>el.remove());
    TimelineState.photos=page===1?result.photos:[...new Map([...TimelineState.photos,...result.photos].map(photo=>[String(photo.id),photo])).values()];
    TimelineState.currentPage=page;TimelineState.totalPages=result.pages;
    const actor=window.TimehutAccounts?.status(),prior=TimelineState.loadedAlbumPrefix;
    const effectivePage=page===1&&Number.isSafeInteger(result.page)?result.page:page;
    const continuous=page===1||prior&&prior.page===page-1&&prior.owner===actor?.user?.id&&prior.generation===actor?.generation&&prior.albumId===child.albumId&&prior.total===result.total&&prior.pages===result.pages;
    TimelineState.loadedAlbumPrefix=!TimelineState.initialPageOnly&&continuous&&!TimelineState.searchQuery&&!TimelineState.ageFilter&&Number.isSafeInteger(result.total)&&result.total>=0&&effectivePage>0&&TimelineState.photos.length===Math.min(effectivePage*30,result.total)?{owner:actor?.user?.id,generation:actor?.generation,albumId:child.albumId,view:TimelineState.listGeneration,birthDate:(window.TimehutStorage?.local||localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`)||child.birthDate,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,batchSize:[240,480].includes(result.ageBatchSize)?result.ageBatchSize:30,inventoryRevision:revision,photos:TimelineState.photos,ids:TimelineState.photos.map(photo=>photo.id),total:result.total,pages:result.pages,page:effectivePage}:null;

    if(TimelineState.ageFilter&&result.ageCounts)TimelineState.ageCounts=result.ageCounts;
    document.getElementById('loadingIndicator').style.display='none';
    const empty=document.getElementById('emptyState');empty.style.display=TimelineState.photos.length?'none':'block';
    if(!TimelineState.photos.length&&TimelineState.ageFilter){if(empty.dataset.ageDefaultTitle===undefined){empty.dataset.ageDefaultTitle=empty.querySelector('h3').textContent;empty.dataset.ageDefaultText=empty.querySelector('p').textContent;}empty.querySelector('h3').textContent=`${TimelineState.ageFilter.years} 歲尚無照片或影片`;empty.querySelector('p').textContent='可以選擇其他年齡，或返回完整時間軸。';}
    if(TimelineState.photos.length){
        TimelineState.photoBatches=calculatePhotoBatches(TimelineState.photos);
        const birthDate=(window.TimehutStorage?.local||localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`)||child.birthDate;
        TimelineState.groupedPhotos=groupPhotosByAge(TimelineState.photos,birthDate);renderTimeline({preserveAgeViews:result.verifiedAgeDisplay===true});restoreTimelineAnchor(anchor);updateAgeNavCounts();
        (window.TimehutStorage?.session||sessionStorage).setItem('allPhotos',JSON.stringify(TimelineState.photos));
        (window.TimehutStorage?.session||sessionStorage).setItem('allPhotosChild',String(TimelineState.currentChildIndex));
    }
}
function showAgeFilter(years,{loadedYears=[years]}={}) {
    document.getElementById('ageFilterSummary')?.remove();
    const summary=document.createElement('div');summary.id='ageFilterSummary';summary.className='age-filter-summary';
    const label=document.createElement('p');label.textContent=`已載入 ${loadedYears.map(age=>age===0?'新生兒':`${age} 歲`).join('、')} 的回憶`;
    const back=document.createElement('button');back.type='button';back.className='btn-secondary';back.textContent='返回完整時間軸';
    back.onclick=()=>{resetTimelineView();loadPhotos(1);};summary.append(label,back);document.getElementById('timelineContainer').before(summary);
}
function bindTimelineFailedRetry() {
    const failure=TimelineState.failedPage,button=document.querySelector('.timeline-load-error button'),view=TimelineState.listGeneration;
    if(!failure||!button)return;
    button.onclick=()=>{
        if(TimelineState.failedPage!==failure||TimelineState.listGeneration!==view||TimelineState.currentChildIndex!==failure.childIndex||CONFIG.CHILDREN[failure.childIndex]?.albumId!==failure.albumId||window.TimehutAccounts?.status().generation!==failure.accountGeneration)return;
        if(failure.inventoryChanged){location.reload();return;}
        loadPhotos(failure.page);
    };
}
function loadPhotos(page=Math.max(1,TimelineState.currentPage),{ageGuard=null,forceInventory=false}={}) {
    if(ageGuard&&!ageGuard())return Promise.resolve(false);
    if(TimelineState.ageReadMode==='accelerated')return Promise.resolve(false);
    if(TimelineState.activeLoad)return TimelineState.activeLoad;
    const pending=loadTimelinePage(page,{ageGuard,forceInventory});TimelineState.activeLoad=pending;
    const clear=()=>{if(TimelineState.activeLoad===pending)TimelineState.activeLoad=null;};pending.then(clear,clear);
    return pending;
}

async function loadTimelinePage(page,{ageGuard=null,forceInventory=false}={}) {
    if(ageGuard&&!ageGuard())return false;
    const loadingEl = document.getElementById('loadingIndicator');
    const emptyEl = document.getElementById('emptyState');
    const containerEl = document.getElementById('timelineContainer');

    if (TimelineState.isLoading) return;
    TimelineState.isLoading = true;TimelineState.loadFailed=false;TimelineState.failedPage=null;syncTimelineLoadMoreControl();
    let succeeded=false;
    const requestId = ++TimelineState.loadRequestId;
    const childIndex = TimelineState.currentChildIndex,albumId=CONFIG.CHILDREN[TimelineState.currentChildIndex]?.albumId,view=TimelineState.listGeneration,account=window.TimehutAccounts?.status().generation;
    const isCurrentView=()=>TimelineState.listGeneration===view&&TimelineState.currentChildIndex===childIndex&&CONFIG.CHILDREN[childIndex]?.albumId===albumId&&window.TimehutAccounts?.status().generation===account;
    const isCurrentRequest = () => isCurrentView()&&TimelineState.loadRequestId === requestId&&(!ageGuard||ageGuard());
    const retireAgeLoad=()=>{if(isCurrentView()&&TimelineState.loadRequestId===requestId){TimelineState.isLoading=false;loadingEl.style.display='none';}};
    containerEl.querySelectorAll('.timeline-load-error').forEach(el=>el.remove());

    // Show loading, hide empty state
    loadingEl.style.display = 'block';
    emptyEl.style.display = 'none';

    // Clear existing photos if first page
    if (page === 1) {
        // Remove photo cards but keep loading/empty elements
        Array.from(containerEl.children).forEach(child => {
            if (!child.id?.includes('loading') && !child.id?.includes('empty') && !child.classList.contains('age-group-header')) {
                child.remove();
            }
        });
        const headers = containerEl.querySelectorAll('.age-group-header');
        headers.forEach(h => h.remove());
    }

    try {
        const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];
        let result;

        if (child.albumId) {
            // Load from specific album
            result = await FlickrAPI.getAlbumPhotos(child.albumId, page, CONFIG.PHOTOS_PER_PAGE, {expectedAuthority:{generation:account,owner:window.TimehutAccounts?.status().user?.id},initialTimeline:page===1&&!forceInventory&&!ageGuard&&!TimelineState.ageNavigationBusy&&!TimelineState.searchQuery&&!TimelineState.ageFilter});
        } else {
            // Load public photos
            result = await FlickrAPI.getPublicPhotos(page);
        }

        if (!isCurrentRequest()) {retireAgeLoad();return false;}
        commitTimelinePage(result,page,child);
        succeeded=true;

    } catch (error) {
        if (!isCurrentRequest()) {retireAgeLoad();return false;}
        TimelineState.loadFailed=true;
        TimelineState.failedPage={page,childIndex,albumId,accountGeneration:account,inventoryChanged:error.inventoryChanged===true};
        console.error('Error loading photos:', error);
        loadingEl.style.display = 'none';

        // Show error message
        const errorEl = document.createElement('div');
        errorEl.className = 'empty-state timeline-load-error';
        const heading=document.createElement('h3'),explanation=document.createElement('p'),retry=document.createElement('button');
        heading.textContent=error.inventoryChanged?'相簿內容已更新':'載入失敗';explanation.textContent=error.inventoryChanged?'請重新載入，以顯示目前的相簿內容。':'照片尚未載入，請檢查連線後重試。';
        retry.className='upload-btn';retry.textContent=error.inventoryChanged?'重新載入':'重試';
        errorEl.append(heading,explanation,retry);
        containerEl.appendChild(errorEl);
        bindTimelineFailedRetry();
    }

    // Clear loading timeout and hide reload button
    if (TimelineState.loadingTimeout) {
        clearTimeout(TimelineState.loadingTimeout);
        TimelineState.loadingTimeout = null;
    }
    const reloadBtn = document.getElementById('reloadBtn');
    if (reloadBtn) reloadBtn.style.display = 'none';

    TimelineState.isLoading = false;syncTimelineLoadMoreControl();

    // Restore scroll position if returning from album page
    const savedScrollPosition = (window.TimehutStorage?.session || sessionStorage).getItem(TimelineState.SCROLL_POSITION_KEY);
    if (savedScrollPosition) {
        setTimeout(() => {
            window.scrollTo(0, parseInt(savedScrollPosition));
            (window.TimehutStorage?.session || sessionStorage).removeItem(TimelineState.SCROLL_POSITION_KEY);
        }, 100);
    }
    return succeeded;
}

/**
 * 處理滾動事件（無限滾動載入更多）
 */
function handleScroll() {
    if (TimelineState.returnRestoring) return;
    // Programmatic age/anchor movement must not start a pagination cascade.
    // The visible load-more control also works when the destination is at the end.
    if(TimelineState.programmaticScrollTop!==undefined){if(Math.abs(window.scrollY-TimelineState.programmaticScrollTop)<2)return;TimelineState.programmaticScrollTop=undefined;}
    if(TimelineState.ageNavigationBusy||TimelineState.searchQuery||TimelineState.loadFailed)return;
    // Check if we're near the bottom of the page
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = window.innerHeight;

    // Load more when within 500px of bottom
    if (scrollTop + clientHeight >= scrollHeight - 500) {
        loadMorePhotos();
    }
}

/**
 * 載入更多照片（下一頁）
 */
async function loadMorePhotos({ageGuard=null}={}) {
    if(TimelineState.isLoading||TimelineState.searchQuery||TimelineState.currentPage<1||TimelineState.currentPage>=TimelineState.totalPages)return false;
    if(TimelineState.initialPageOnly){
        const view=TimelineState.listGeneration,account=window.TimehutAccounts?.status().generation,album=CONFIG.CHILDREN[TimelineState.currentChildIndex]?.albumId;
        if(!await loadPhotos(1,{ageGuard,forceInventory:true}))return false;
        if(view!==TimelineState.listGeneration||account!==window.TimehutAccounts?.status().generation||album!==CONFIG.CHILDREN[TimelineState.currentChildIndex]?.albumId||TimelineState.initialPageOnly)return false;
        if(TimelineState.currentPage>=TimelineState.totalPages)return true;
    }
    return loadPhotos(TimelineState.currentPage+1,{ageGuard});
}

/**
 * 渲染時間軸
 */
/**
 * 渲染時間軸 (Moment Card Layout)
 */
function renderTimeline({preserveAgeViews=false}={}) {
    if(!preserveAgeViews)clearVerifiedAgeViews();
    TimelinePreviewQueue.clear();
    const containerEl = document.getElementById('timelineContainer');
    const loadingEl = document.getElementById('loadingIndicator');

    // Build flat array for modal navigation
    TimelineState.allPhotosFlat = [];

    // Clear existing content (keep loading/empty)
    Array.from(containerEl.children).forEach(child => {
        if (!child.id?.includes('loading') && !child.id?.includes('empty')) {
            child.remove();
        }
    });

    const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];

    TimelineState.groupedPhotos.forEach(group => {
        // Add age group header for time travel targeting
        const groupHeader = document.createElement('div');
        groupHeader.className = 'age-group-header';
        groupHeader.id = `age-${group.sortKey}`;
        groupHeader.setAttribute('data-age-label', group.label);
        const groupTitle = document.createElement('h2'); groupTitle.className = 'age-group-title'; groupTitle.textContent = group.label;
        const groupCount = document.createElement('span'); groupCount.className = 'age-group-summary';
        groupCount.textContent = `${groupPhotosToMoments(group.photos).length} 組同日照片 · ${group.photos.filter(photo => photo.media !== 'video').length} 張照片 · ${group.photos.filter(photo => photo.media === 'video').length} 部影片`;
        groupHeader.append(groupTitle, groupCount);
        containerEl.insertBefore(groupHeader, loadingEl);

        // Group photos into Moments
        const moments = groupPhotosToMoments(group.photos);

        moments.forEach(moment => {
            // Add photos to flat list and track flatIndex for each photo
            moment.flatStartIndex = TimelineState.allPhotosFlat.length;
            moment.photos.forEach(p => TimelineState.allPhotosFlat.push(p));

            const birthDate = (window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`) || child.birthDate;
            const cardEl = createMomentCard(moment, birthDate);
            containerEl.insertBefore(cardEl, loadingEl);
        });
    });
    updateMomentClickHandlers();
    syncTimelineLoadMoreControl();
}

/**
 * 將照片分組為 Moments (Batches)
 * 規則：同一拍攝日期的照片會合併為一組同日照片
 */
function groupPhotosToMoments(photos) {
    if (!photos || photos.length === 0) return [];

    // Group by date taken (YYYY-MM-DD)
    const momentsByDate = new Map();

    photos.forEach(photo => {
        // Get uploader
        const tags = photo.tags ? photo.tags.split(' ') : [];
        const uploaderTag = findUploaderTag(tags);
        const uploader = uploaderTag ? uploaderTag.replace('uploader:', '') : '未知';

        // Use datetaken for grouping, fallback to dateupload
        const dateKey = photoCalendarDay(photo);

        if (!momentsByDate.has(dateKey)) {
            const photoTime = dateKey === 'unknown'
                ? new Date(photo.datetaken || Number(photo.dateupload) * 1000).getTime()
                : new Date(dateKey + 'T12:00:00').getTime();

            momentsByDate.set(dateKey, {
                uploader: uploader,
                timestamp: photoTime,
                date: photo.datetaken || new Date(photoTime).toISOString(),
                dateKey: dateKey,
                photos: []
            });
        }
        momentsByDate.get(dateKey).photos.push(photo);
    });

    // Convert to array and sort by date (newest first)
    return Array.from(momentsByDate.values())
        .sort((a, b) => b.timestamp - a.timestamp);
}


/**
 * 建立 Moment Card (Batch View)
 */
function createMomentCard(moment, birthDate) {
    const card = document.createElement('div');
    card.className = 'moment-item';
    card.dataset.timelineDay=moment.dateKey;

    const count = moment.photos.length;
    const firstPhoto = moment.photos[0];
    const dateObj = new Date(moment.timestamp);
    const day = dateObj.getDate();
    const month = dateObj.getMonth() + 1;
    const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    const monthStr = months[month - 1];

    // Calculate precise age
    const ageObj = calculateAge(birthDate, moment.dateKey);
    const age = formatAgeString(ageObj.years, ageObj.months, ageObj.days);

    // Store moment data for album navigation
    const momentDataId = `moment_${firstPhoto.id}`;
    TimelineState.momentData.set(momentDataId, {
        photos: moment.photos,
        dateStr: `${monthStr} ${day}日 - ${age}`,
        timestamp: moment.timestamp
    });

    // Add data attribute for moment selection
    card.setAttribute('data-moment-id', momentDataId);

    // Uploader info (hidden from header per Timehut design)
    const uploaderEmoji = getUploaderEmoji(moment.uploader);

    // Grid Logic
    let gridHtml = '';
    // Management shows every loaded photo, while the ordinary timeline keeps its collage.
    const displayPhotos = SelectionState.isSelectMode ? moment.photos : moment.photos.slice(0, 5);
    const remaining = count - 5;

    // Grid class based on count (capped at 5 for layout logic)
    const gridCount = Math.min(count, 5);
    let extraClass = count > 3 ? 'multi-grid' : '';

    gridHtml = `<div class="moment-grid ${extraClass}" data-count="${gridCount}">`;

    displayPhotos.forEach((photo, idx) => {
        const imgUrl = FlickrAPI.getPhotoUrl(photo, 'm'); // Medium size
        const isLast = idx === 4;
        const flatIndex = moment.flatStartIndex + idx;

        let overlayHtml = '';
        if (!SelectionState.isSelectMode && isLast && remaining > 0) {
            overlayHtml = `<div class="moment-overlay" onclick="openBatchView(TimelineState.photoBatches.get('${firstPhoto.id}'))">+${remaining + 1}</div>`;
        }

        // Click handler logic
        // If single photo -> Open Modal
        // If batch -> Click opens Modal for specific photo, OR user wants "Enter Album"?
        // User HTML implies "Enter Album" is a separate button at bottom.
        // Clicking images usually opens lightbox.

        const clickAttr = SelectionState.isSelectMode ? `onclick="togglePhotoSelection('${photo.id}')"` : `onclick="openModal(${flatIndex})"`;

        gridHtml += `
            <div class="moment-photo-container">
                <img class="moment-photo" loading="lazy" alt="照片預覽" ${clickAttr}>
                ${photo.media === 'video' ? '<span class="video-badge" aria-hidden="true">▶</span>' : ''}
                ${overlayHtml}
            </div>
        `;
    });
    gridHtml += `</div>`;

    // Footer Logic
    // "Enter Album" button if count > 1 (or always? User HTML always has it)
    // Use momentDataId already declared above
    const enterAlbumHtml = count > 1 ?
        `<div class="moment-album-link" onclick="navigateToAlbum('${momentDataId}')">進入同日照片 ></div>` : '';

    // Stats
    const photoCount = moment.photos.filter(p => !p.media || p.media === 'photo').length;
    const videoCount = moment.photos.filter(p => p.media === 'video').length;
    let statsText = '';
    if (photoCount > 0) statsText += `照片 ${photoCount} `;
    if (videoCount > 0) statsText += `+ 影片 ${videoCount}`;

    card.innerHTML = `
        <div class="moment-line"></div>
        <div class="moment-header">
            <div class="moment-date-box">
                <span class="moment-month">${monthStr}</span>
                <span class="moment-day">${day}</span>
            </div>
            <div class="moment-info">
                <div class="moment-age">${age}</div>
            </div>
        </div>
        
        <div class="moment-content-box">
            ${gridHtml}
            
            <div class="moment-footer">
                
                <div class="moment-stats-right">
                    <span>${statsText}</span>
                    ${count > 1 ? `<span class="moment-album-link" onclick="navigateToAlbum('${momentDataId}')">· 進入同日照片 ></span>` : ''}
                </div>
            </div>
        </div>
    `;

    const tags = [...new Set(moment.photos.flatMap(photo => (photo.tags || '').split(' ')))].filter(tag => tag && !findUploaderTag([tag])).slice(0, 3);
    if (tags.length) {
        const row = document.createElement('div'); row.className = 'moment-tags';
        tags.forEach(tag => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'moment-tag'; button.textContent = tag;
            button.addEventListener('click', event => { event.stopPropagation(); filterByTag(tag); }); row.append(button);
        });
        card.querySelector('.moment-content-box').insertBefore(row, card.querySelector('.moment-footer'));
    }
    card.querySelectorAll('.moment-album-link').forEach(link => {
        link.setAttribute('role', 'button'); link.tabIndex = 0;
        link.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigateToAlbum(momentDataId); } });
    });
    const dateLabel = document.createElement('span'); dateLabel.className = 'moment-full-date';
    dateLabel.textContent = dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
    card.querySelector('.moment-date-box').append(dateLabel);
    const title = document.createElement('h3'); title.className = 'moment-title'; title.textContent = moment.photos[0].title || '我們的小日常';
    card.querySelector('.moment-grid').after(title);
    card.querySelectorAll('.moment-photo-container img').forEach((img, index) => {
        bindTimelinePreview(img,displayPhotos[index],moment.flatStartIndex+index);
        img.tabIndex = 0; img.setAttribute('role', 'button');
        img.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); img.click(); } });
        const photoId = String(displayPhotos[index].id), cell = img.parentElement;
        cell.dataset.photoId = photoId;
        const select = document.createElement('button'); select.type = 'button'; select.className = 'timeline-photo-select';
        select.setAttribute('aria-label', `選取${displayPhotos[index].media === 'video' ? '影片' : '照片'}`);
        const selected = SelectionState.selectedPhotos.has(photoId);
        select.setAttribute('aria-pressed', String(selected)); select.textContent = selected ? '✓' : '○';
        cell.classList.toggle('selected', selected);
        select.addEventListener('click', event => { event.stopPropagation(); togglePhotoSelection(photoId); });
        cell.append(select);
    });

    return card;
}

// Only near-screen previews enter the network, with two complete preview
// journeys at a time. Medium/large/expired-ticket fallbacks share that slot.
const TimelinePreviewQueue={
    jobs:new Map(),active:new Set(),observer:null,paused:false,scheduled:false,
    clear(){
        this.paused=true;this.observer?.disconnect();this.observer=null;
        for(const job of this.jobs.values())this.cancel(job);
        this.jobs.clear();this.active.clear();this.paused=false;
    },
    cancel(job){
        const loading=job.state==='active';job.state='queued';job.cleanup?.();job.cleanup=null;
        if(loading)job.img.removeAttribute('src');this.active.delete(job);
    },
    pause(){this.paused=true;for(const job of [...this.active])this.cancel(job);},
    resume(){this.paused=false;this.schedule();},
    schedule(){
        if(this.scheduled||this.paused)return;this.scheduled=true;
        requestAnimationFrame(()=>{this.scheduled=false;this.drain();});
    },
    drain(){
        if(this.paused)return;
        const top=Math.max(0,document.querySelector('.header')?.getBoundingClientRect().bottom||0);
        const near=job=>{const r=job.img.getBoundingClientRect();return job.img.isConnected&&r.bottom>top-200&&r.top<innerHeight+200;};
        const visible=job=>{const r=job.img.getBoundingClientRect();return r.bottom>top&&r.top<innerHeight;};
        const waiting=[...this.jobs.values()].filter(job=>job.state==='queued'&&near(job));
        waiting.sort((a,b)=>Number(visible(b))-Number(visible(a))||Math.abs(a.img.getBoundingClientRect().top-top)-Math.abs(b.img.getBoundingClientRect().top-top));
        for(const job of waiting){
            if(this.active.size>=2)break;
            job.state='active';this.active.add(job);job.img.loading='eager';
            const view=TimelineState.listGeneration;
            job.cleanup=FlickrAPI.bindPhotoPreview(job.img,job.photo,{
                isCurrent:()=>view===TimelineState.listGeneration&&this.jobs.get(job.img)===job&&job.state!=='queued'&&String(TimelineState.allPhotosFlat[job.flatIndex]?.id)===String(job.photo.id),
                onOpen:()=>openModal(job.flatIndex),
                onSettled:()=>{if(job.state==='active'){job.state='done';this.active.delete(job);this.schedule();}}
            });
        }
    },
    add(img,photo,flatIndex){
        const job={img,photo,flatIndex,state:'queued',cleanup:null};this.jobs.set(img,job);
        if(!this.observer&&typeof IntersectionObserver==='function')this.observer=new IntersectionObserver(()=>this.schedule(),{rootMargin:'200px 0px'});
        this.observer?.observe(img);this.schedule();
    }
};
window.addEventListener('scroll',()=>TimelinePreviewQueue.schedule(),{passive:true});
window.addEventListener('resize',()=>TimelinePreviewQueue.schedule());
for(const event of ['pagehide','timehut-account-changed'])window.addEventListener(event,()=>TimelinePreviewQueue.clear());
function bindTimelinePreview(img,photo,flatIndex) {TimelinePreviewQueue.add(img,photo,flatIndex);}

function createSelectionOverlay(photoId) {
    const isSelected = SelectionState.selectedPhotos.has(photoId);
    return `
        <div class="photo-select-overlay ${isSelected ? 'selected' : ''}" onclick="event.stopPropagation(); togglePhotoSelection('${photoId}')">
            <div class="select-checkbox ${isSelected ? 'checked' : ''}"></div>
        </div>
    `;
}


/**
 * 取得上傳者的 Emoji
 * @param {string} uploader - 上傳者名稱
 * @returns {string} Emoji
 */
function getUploaderEmoji(uploader) {
    const emojiMap = {
        '爸爸': '👨',
        '媽媽': '👩',
        '爺爺': '👴',
        '奶奶': '👵',
        '外公': '👴',
        '外婆': '👵',
        '其他': '👤'
    };
    return emojiMap[uploader] || '👤';
}

/**
 * 依標籤過濾
 * @param {string} tag - 標籤名稱
 */
async function filterByTag(tag) {
    const searchInput = document.getElementById('searchInput');
    searchInput.value = tag;
    await handleSearch({ target: { value: tag } }, true);

    // Update URL without reloading
    const newUrl = `${window.location.pathname}#/timeline/tagDetail?tag_name=${encodeURIComponent(tag)}`;
    history.pushState({ path: newUrl }, '', newUrl);
}

/**
 * 建立年齡導航
 * @param {string} birthDate - 出生日期
 */
function buildAgeNavigation(birthDate) {
    const ageListEl = document.getElementById('ageList');
    const navItems = generateAgeNavigation(birthDate);

    ageListEl.innerHTML = navItems.map((item, index) => `
        <div class="age-item ${index === 0 ? 'active' : ''}" 
             data-age="${item.value}" 
             onclick="scrollToAge(${item.value})">
            <span class="age-dot"></span>
            <span class="age-label">${item.label}</span>
            <span class="age-count" id="age-count-${item.value}">0</span>
        </div>
    `).join('');
}

/**
 * 更新年齡導航的照片數量
 */
function updateAgeNavCounts() {
    if(TimelineState.ageCounts){document.querySelectorAll('.age-count').forEach(item=>{item.textContent=String(TimelineState.ageCounts[item.id.replace('age-count-','')]||0);});return;}
    document.querySelectorAll('.age-count').forEach(item => { item.textContent = '0'; });
    TimelineState.groupedPhotos.forEach(group => {
        // Extract years from sortKey
        const years = Math.floor(group.sortKey / 100);
        const countEl = document.getElementById(`age-count-${years}`);
        if (countEl) {
            const currentCount = parseInt(countEl.textContent, 10) || 0;
            countEl.textContent = currentCount + group.photos.length;
        }
    });
}

// Both age controls use the actual destination group for the selected year.
function scrollToAgeGroup(group) {
    const headerEl = document.getElementById(`age-${group.sortKey}`);
    if (!headerEl) return false;
    headerEl.scrollIntoView({ behavior: 'instant', block: 'start' });
    TimelineState.programmaticScrollTop=window.scrollY;
    const years = Math.floor(group.sortKey / 100);
    document.querySelectorAll('.age-item').forEach(item => {
        item.classList.toggle('active', parseInt(item.dataset.age, 10) === years);
    });
    return true;
}

/**
 * 滾動到指定年齡
 * @param {number} years - 年齡（年）
 */
function currentAlbumPrefix() {
    const prefix=TimelineState.loadedAlbumPrefix,actor=window.TimehutAccounts?.status();
    if(!prefix||TimelineState.searchQuery||TimelineState.ageFilter||prefix.view!==TimelineState.listGeneration||prefix.birthDate!==((window.TimehutStorage?.local||localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`)||CONFIG.CHILDREN[TimelineState.currentChildIndex]?.birthDate)||prefix.timeZone!==Intl.DateTimeFormat().resolvedOptions().timeZone||prefix.albumId!==CONFIG.CHILDREN[TimelineState.currentChildIndex]?.albumId||prefix.owner!==actor?.user?.id||prefix.generation!==actor?.generation||prefix.photos!==TimelineState.photos||prefix.ids.length!==TimelineState.photos.length||prefix.ids.some((id,index)=>id!==TimelineState.photos[index]?.id))return null;
    return {...prefix,photos:prefix.photos.slice()};
}
function jumpToLoadedAge(years,{closeMenu}) {
    if(jumpToVerifiedLoadedAge(years,{closeMenu}))return true;
    if(TimelineState.searchQuery||TimelineState.ageFilter||document.getElementById('searchInput').value.trim())return false;
    const prefix=currentAlbumPrefix();if(!prefix||prefix.photos.length!==prefix.total||prefix.page!==prefix.pages)return false;
    const group=TimelineState.groupedPhotos.filter(group=>Math.floor(group.sortKey/100)===years).sort((a,b)=>a.sortKey-b.sortKey)[0];
    if(!group||!document.getElementById(`age-${group.sortKey}`))return false;
    cancelAgeNavigation();TimelineState.loadRequestId++;TimelineState.activeLoad=null;TimelineState.isLoading=false;
    document.getElementById('loadingIndicator').style.display='none';
    if(!scrollToAgeGroup(group))return false;
    ageNavigationStatus('');
    if(closeMenu){document.getElementById('timeTravelMenu').style.display='none';document.getElementById('timeTravelBtn').setAttribute('aria-expanded','false');document.getElementById('timeTravelBtn').focus({preventScroll:true});}
    return true;
}
// Show stable, localized guidance; native transport errors may contain hostnames.
// Error classification and authority/fallback decisions remain in the reader.
function ageReadFailureMessage(error) {
    if(error?.unauthorized||error?.accountChanged||error?.status===401)return '登入狀態已變更，請重新登入後再試。';
    if(error?.status===403||error?.status===404)return '相簿目前無法讀取，請重新整理或確認存取權限。';
    if(error?.ageReadIntegrity)return '照片清單尚未完整確認，請重新整理後再選擇歲數。';
    if(error?.ageReadBudgetExpired)return '讀取時間較長，請再次選擇歲數重試。';
    if(error?.status===429)return '讀取次數較多，請稍候再試。';
    return '照片暫時無法讀取，請確認網路連線後，再選擇歲數重試。';
}

async function scrollToAge(years,{closeMenu=true,fromReturn=false,returnGuard=null}={}) {
    if (!fromReturn) cancelTimelineReturn();
    if(!Number.isInteger(years)||years<0)return;
    clearSearchNavigationOrigin();
    clearTimeout(TimelineState.searchTimer);TimelineState.searchTimer=null;
    if(jumpToLoadedAge(years,{closeMenu}))return;
    if(CONFIG.ACCOUNT_MODE&&typeof FlickrAPI.seekAlbumAge==='function'){
        const request=++TimelineState.ageNavigationRequest,childIndex=TimelineState.currentChildIndex,child=CONFIG.CHILDREN[childIndex],view=TimelineState.listGeneration,account=window.TimehutAccounts?.status().generation;
        const birthDate=(window.TimehutStorage?.local||localStorage).getItem(`timehut_child_${childIndex}_birthdate`)||child.birthDate;
        const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,deadline=Date.now()+90000;
        const current=()=>(!returnGuard||returnGuard())&&request===TimelineState.ageNavigationRequest&&view===TimelineState.listGeneration&&childIndex===TimelineState.currentChildIndex&&child?.albumId===CONFIG.CHILDREN[childIndex]?.albumId&&account===window.TimehutAccounts?.status().generation&&birthDate===((window.TimehutStorage?.local||localStorage).getItem(`timehut_child_${childIndex}_birthdate`)||child.birthDate)&&timeZone===Intl.DateTimeFormat().resolvedOptions().timeZone;
        TimelineState.ageNavigationBusy=true;TimelineState.ageReadMode='accelerated';syncTimelineLoadMoreControl();
        ageNavigationStatus(`正在前往 ${years} 歲的回憶…`);
        const paused=pauseAgeImages(request);
        let useFallback=false;
        try{
            const result=await FlickrAPI.seekAlbumAge(child.albumId,years,birthDate,{prefix:currentAlbumPrefix(),perPage:currentAlbumPrefix()?.batchSize||30,isCurrent:current,deadline,onProgress:({completed,pages})=>{
                if(current())ageNavigationStatus(`正在尋找 ${years} 歲的照片，已讀取 ${completed} / ${pages} 頁；關閉選單即可停止。`);
            }});
            if(!current())return;
            // A fresh complete zero leaves the previously displayed age usable.
            // Empty/unknown destinations never enter the positive display cache.
            if(result.ageSelection&&!result.found){ageNavigationStatus(`${years} 歲尚無照片或影片。`);return;}
            const selectedDisplay=result.ageSelection?prepareVerifiedAgeDisplay(years,result):null;
            if(SelectionState.isSelectMode)toggleSelectMode();if(MomentSelectionState.isSelectMode)window.toggleMomentSelectMode();
            resumeAgeImages({restore:false});resetTimelineView({preserveAgeViews:!!selectedDisplay});TimelineState.searchQuery='';document.getElementById('searchInput').value='';
            if(selectedDisplay){TimelineState.ageFilter=selectedDisplay.filter;showAgeFilter(years,{loadedYears:selectedDisplay.filter.loadedYears});}
            const display=selectedDisplay?.result||result;
            commitTimelinePage(display,1,child);TimelineState.currentPage=display.page;
            const group=TimelineState.groupedPhotos.filter(group=>Math.floor(group.sortKey/100)===years).sort((a,b)=>a.sortKey-b.sortKey)[0];
            if(!result.found){ageNavigationStatus(`${years} 歲尚無照片或影片。`);return;}
            if(!group||!scrollToAgeGroup(group)){ageNavigationStatus('照片尚未顯示，請稍後再試。');return;}
            ageNavigationStatus('');
            if(closeMenu){document.getElementById('timeTravelMenu').style.display='none';document.getElementById('timeTravelBtn').setAttribute('aria-expanded','false');document.getElementById('timeTravelBtn').focus({preventScroll:true});}
        }catch(error){
            if(!current()||error.cancelled)return;
            // Authentication/ownership failures must remain failures. Only a
            // read-only transient or paging failure may use the original seek.
            if(error.unauthorized||error.accountChanged||[401,403,404].includes(error.status)){
                ageNavigationStatus(ageReadFailureMessage(error));
            }else if(FlickrAPI.canFallbackAgeRead(error)){useFallback=true;ageNavigationStatus('正在使用原查詢尋找回憶…');}
            else ageNavigationStatus(ageReadFailureMessage(error));
        }finally{
            if(request===TimelineState.ageNavigationRequest){TimelineState.ageNavigationBusy=false;TimelineState.ageReadMode=null;syncTimelineLoadMoreControl();if(!current())ageNavigationStatus('');if(ageImagePause===paused&&paused.request===request)resumeAgeImages({restartInitial:!useFallback});}
        }
        if(useFallback&&current())return scrollToAgeLegacy(years,{closeMenu,deadline,requireFreshScan:true,returnGuard});
        return;
    }
    return scrollToAgeLegacy(years,{closeMenu,returnGuard});
}

async function scrollToAgeLegacy(years,{closeMenu=true,deadline=Date.now()+90000,requireFreshScan=false,returnGuard=null}={}) {
    // An accelerated read failure must not turn an old exhausted cursor into a negative result.
    if(requireFreshScan)resetTimelineView();
    if(TimelineState.searchQuery||document.getElementById('searchInput').value.trim()){resetTimelineView();TimelineState.searchQuery='';document.getElementById('searchInput').value='';}
    const request=++TimelineState.ageNavigationRequest,child=TimelineState.currentChildIndex,album=CONFIG.CHILDREN[child]?.albumId,view=TimelineState.listGeneration;
    const accountGeneration=window.TimehutAccounts?.status().generation;
    const current=()=>(!returnGuard||returnGuard())&&request===TimelineState.ageNavigationRequest&&view===TimelineState.listGeneration&&child===TimelineState.currentChildIndex&&album===CONFIG.CHILDREN[child]?.albumId&&accountGeneration===window.TimehutAccounts?.status().generation;
    const birthDate=(window.TimehutStorage?.local||localStorage).getItem(`timehut_child_${child}_birthdate`)||CONFIG.CHILDREN[child]?.birthDate,timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    const contextCurrent=()=>birthDate===((window.TimehutStorage?.local||localStorage).getItem(`timehut_child_${child}_birthdate`)||CONFIG.CHILDREN[child]?.birthDate)&&timeZone===Intl.DateTimeFormat().resolvedOptions().timeZone;
    const ageGuard=()=>current()&&contextCurrent()&&Date.now()<=deadline;
    TimelineState.ageNavigationBusy=true;syncTimelineLoadMoreControl();
    const feedback=text=>{if(text){document.getElementById('timeTravelMenu').style.display='block';document.getElementById('timeTravelBtn').setAttribute('aria-expanded','true');}ageNavigationStatus(text);};
    const target=()=>TimelineState.groupedPhotos.filter(group=>Math.floor(group.sortKey/100)===years).sort((a,b)=>a.sortKey-b.sortKey)[0];
    try{
        if(!ageGuard()){if(current())feedback('尋找已停止，請再次選擇歲數重試。');return;}
        if(TimelineState.activeLoad){const loaded=await TimelineState.activeLoad;if(!loaded){if(current())feedback('照片尚未載入，請檢查連線後重試。');return;}}
        if(!ageGuard())return;
        if(current()&&TimelineState.currentPage===0){const loaded=await loadPhotos(1,{ageGuard});if(!loaded){if(current())feedback('照片尚未載入，請檢查連線後重試。');return;}}
        while(ageGuard()&&!target()&&TimelineState.currentPage<TimelineState.totalPages){
            if(Date.now()>deadline){feedback('尋找時間較長，請再次選擇歲數重試。');return;}
            feedback(`正在尋找 ${years} 歲的照片，已讀取 ${TimelineState.currentPage} / ${TimelineState.totalPages} 頁；關閉選單即可停止。`);
            if(!await loadMorePhotos({ageGuard})){if(ageGuard())feedback('照片尚未載入完成，請再次點選年齡重試。');return;}
        }
        if(!current())return;
        if(!ageGuard())return;
        const group=target();
        if(!group){
            // A negative result needs a complete, contiguous, count-consistent scan.
            const proof=currentAlbumPrefix();
            const complete=proof&&proof.page===proof.pages&&proof.pages===Math.max(1,Math.ceil(proof.total/30))&&proof.photos.length===proof.total&&new Set(proof.ids).size===proof.total;
            feedback(complete?`${years} 歲尚無照片或影片。`:'照片尚未完整讀取，請再次點選年齡重試。');return;
        }
        if(!scrollToAgeGroup(group)){feedback('照片尚未顯示，請稍後再試。');return;}feedback('');
        if(closeMenu){document.getElementById('timeTravelMenu').style.display='none';document.getElementById('timeTravelBtn').setAttribute('aria-expanded','false');document.getElementById('timeTravelBtn').focus({preventScroll:true});}
    }catch(error){if(current())feedback('照片尚未載入完成，請再次點選年齡重試。');}
    finally{if(request===TimelineState.ageNavigationRequest){TimelineState.ageNavigationBusy=false;syncTimelineLoadMoreControl();if(!contextCurrent()||Date.now()>deadline)ageNavigationStatus('尋找已停止，請再次選擇歲數重試。');}}
}

/**
 * 打開照片 Modal
 * @param {number} index - 照片索引
 */
const ViewerTagState = {view:0, authority:0, pending:new Map(), observed:new WeakSet()};
const ViewerNavigationState = {transitionTimer:null, cleanupTimer:null};
function cancelViewerNavigation() {
    clearTimeout(ViewerNavigationState.transitionTimer);
    clearTimeout(ViewerNavigationState.cleanupTimer);
    ViewerNavigationState.transitionTimer = ViewerNavigationState.cleanupTimer = null;
    document.getElementById('modalImage')?.classList.remove('swipe-left-exit','swipe-right-exit','swipe-left-enter','swipe-right-enter');
}
function viewerTagOwner() {
    return window.TimehutAccounts?.status?.().user?.id || (CONFIG.ACCOUNT_MODE ? null : `legacy:${CONFIG.FLICKR_USER_ID}`);
}
function viewerTagKey(owner, id) { return JSON.stringify([ViewerTagState.authority, owner, String(id)]); }
function syncViewerTagButton() {
    const button=document.querySelector('.save-tags-btn'),input=document.getElementById('editTagsInput');
    if (!button || !input) return;
    const photo=TimelineState.allPhotosFlat[TimelineState.currentModalIndex],owner=viewerTagOwner();
    const pending=photo&&owner&&ViewerTagState.pending.has(viewerTagKey(owner,photo.id));
    button.disabled=Boolean(pending)||!owner;
    button.textContent=pending?'⏳':'儲存標籤';
    button.setAttribute('aria-label',pending?'正在確認標籤儲存':'儲存標籤');
    if (!ViewerTagState.observed.has(input)) {
        ViewerTagState.observed.add(input);
        input.addEventListener('input',()=>{clearViewerFeedback();syncViewerTagButton();});
    }
}
for (const event of ['timehut-account-changed','pagehide']) window.addEventListener(event,()=>{
    if(event==='timehut-account-changed')resetTimelineView();
    else {
        // History may keep this document and its already-rendered card handlers.
        // Retire pending responses while preserving their committed model.
        retireTimelineRequests();
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
    cancelViewerNavigation();clearViewerFeedback();
    ViewerTagState.authority++;ViewerTagState.view++;ViewerTagState.pending.clear();
});
let previewRestoreSequence=0;
for(const event of ['pagehide','timehut-account-changed'])window.addEventListener(event,()=>previewRestoreSequence++);
async function restoreTimelinePreviewsAfterHistory() {
    if(TimelineState.currentPage<1||!TimelineState.groupedPhotos.length)return;
    const state=window.TimehutAccounts?.status(),owner=state?.user?.id,generation=state?.generation;
    const sequence=++previewRestoreSequence,view=TimelineState.listGeneration,album=CONFIG.CHILDREN[TimelineState.currentChildIndex]?.albumId;
    if(CONFIG.ACCOUNT_MODE){
        if(!state?.authenticated||state.unconfirmed||!owner)return;
        let fresh;try{fresh=await TimehutAccounts.request('/api/accounts/me',{expectedAuthority:{owner,generation}});}catch(_){return;}
        const now=TimehutAccounts.status();
        if(fresh?.user?.id!==owner||!now.authenticated||now.unconfirmed||now.user?.id!==owner||now.generation!==generation)return;
    }
    if(sequence!==previewRestoreSequence||view!==TimelineState.listGeneration||album!==CONFIG.CHILDREN[TimelineState.currentChildIndex]?.albumId)return;
    // Rebind the retained DOM only. Pagination failure/retry, selection, focus
    // and the exact viewport remain in place; history never retries metadata.
    const indexes=new Map(TimelineState.allPhotosFlat.map((photo,index)=>[String(photo.id),index]));
    for(const img of document.querySelectorAll('#timelineContainer .moment-photo-container img')){
        const index=indexes.get(img.closest('.moment-photo-container')?.dataset.photoId);
        if(index!==undefined)bindTimelinePreview(img,TimelineState.allPhotosFlat[index],index);
    }
    if(TimelineState.loadFailed&&TimelineState.failedPage)bindTimelineFailedRetry();
}
window.addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    void restoreTimelinePreviewsAfterHistory();
    const input=document.getElementById('searchInput');
    if(!input)return;
    if(input.value.trim()!==TimelineState.searchQuery||TimelineState.searchQuery&&!TimelineState.groupedPhotos.length)handleSearch({target:input});
    else if(TimelineState.loadFailed&&TimelineState.failedPage)bindTimelineFailedRetry();
    else if(TimelineState.currentPage===0&&!TimelineState.searchQuery)loadPhotos(1);
});

function openModal(index) {
    TimelineState.currentModalIndex = index;
    const photo = TimelineState.allPhotosFlat[index];

    if (!photo) return;
    if (SelectionState.isSelectMode) { togglePhotoSelection(String(photo.id)); return; }
    ViewerTagState.view++;

    cancelViewerNavigation();clearViewerFeedback();

    const modal = document.getElementById('photoModal');
    const modalImg = document.getElementById('modalImage');
    const modalTitle = document.getElementById('modalTitle');
    const modalDate = document.getElementById('modalDate');
    const modalAge = document.getElementById('modalAge');

    // Use larger image for modal
    // The shared renderer owns pixels and async image identity.
    modalImg.alt = photo.title || '照片';

    modalTitle.textContent = photo.title || '未命名';
    modalDate.textContent = formatDate(photo.datetaken || photo.dateupload);
    modalAge.textContent = photo.ageString;

    // P1: Extract and display uploader
    const allTags = photo.tags ? photo.tags.split(' ').filter(t => t) : [];
    const uploaderTag = findUploaderTag(allTags);
    const uploader = uploaderTag ? uploaderTag.replace('uploader:', '') : null;

    const modalUploader = document.getElementById('modalUploader');
    if (modalUploader) {
        if (uploader) {
            modalUploader.textContent = `${getUploaderEmoji(uploader)} ${uploader}上傳`;
            modalUploader.style.display = 'inline';
        } else {
            modalUploader.style.display = 'none';
        }
    }

    // P0: Populate tag editing input (excluding uploader tag)
    const displayTags = allTags.filter(t => !findUploaderTag([t])).join(' ');
    const editTagsInput = document.getElementById('editTagsInput');
    if (editTagsInput) {
        editTagsInput.value = displayTags;
    }

    // Update page indicator (e.g., "1 / 10")
    const pageIndicator = document.getElementById('modalPageIndicator');
    if (pageIndicator) {
        pageIndicator.textContent = `${index + 1} / ${TimelineState.allPhotosFlat.length}`;
    }

    let videoLink = document.getElementById('modalVideoLink');
    if (!videoLink) {
        videoLink = document.createElement('a'); videoLink.id = 'modalVideoLink'; videoLink.className = 'modal-download-btn';
        videoLink.target = '_blank'; videoLink.rel = 'noopener'; videoLink.textContent = '▶ 在 Flickr 開啟影片';
        document.querySelector('#photoModal .modal-info').append(videoLink);
    }
    videoLink.hidden = CONFIG.ACCOUNT_MODE || photo.media !== 'video';
    videoLink.href = `https://www.flickr.com/photos/${encodeURIComponent(CONFIG.FLICKR_USER_ID)}/${encodeURIComponent(photo.id)}`;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    window.TimehutViewerMedia?.show(photo,{photos:TimelineState.allPhotosFlat,index});
    window.TimehutViewerOverview?.set({photos:TimelineState.allPhotosFlat,index,select:id=>{
        const target = TimelineState.allPhotosFlat.findIndex(item=>String(item.id)===id);
        if (target >= 0) openModal(target);
    }});
    syncViewerTagButton();
}

/**
 * 關閉 Modal
 */
function closeModal() {
    ViewerTagState.view++;
    cancelViewerNavigation();clearViewerFeedback();
    window.TimehutViewerOverview?.clear();
    window.TimehutViewerMedia?.stop();
    const modal = document.getElementById('photoModal');
    modal?.classList.remove('active');
    document.body.style.overflow = '';
}

/**
 * 導航照片（上一張/下一張）- 含卡片式滑動動畫
 * @param {number} direction - 方向 (-1: 上一張, 1: 下一張)
 */
function navigatePhoto(direction) {
    const modal = document.getElementById('photoModal');
    if (!modal?.classList.contains('active')) return;
    cancelViewerNavigation();
    const newIndex = TimelineState.currentModalIndex + direction;
    if (newIndex >= 0 && newIndex < TimelineState.allPhotosFlat.length) openModal(newIndex);
}

/**
 * 處理鍵盤事件
 * @param {KeyboardEvent} event - 鍵盤事件
 */
function handleKeyboard(event) {
    if (document.querySelector('.timehut-dialog')) return;
    if (event.key !== 'Escape' && event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const modal = document.getElementById('photoModal');

    if (!modal.classList.contains('active')) return;

    switch (event.key) {
        case 'Escape':
            closeModal();
            break;
        case 'ArrowLeft':
            navigatePhoto(-1);
            break;
        case 'ArrowRight':
            navigatePhoto(1);
            break;
    }
}

/**
 * 處理搜尋（含標籤）
 * @param {Event} event - 輸入事件
 */
async function handleSearch(event) {
    const query = event.target.value.trim(),cached=TimelineState.photos;
    if(query)captureSearchNavigationOrigin();
    // Keep only the already-authorized current reading set for inline filtering.
    // Account-wide network search runs on explicit Search/Enter, never each keystroke.
    const localSource = CONFIG.ACCOUNT_MODE && !currentSearchNavigationContext() ? [] : cached;
    cancelTimelineReturn();
    resetTimelineView({preserveSearchOrigin:!!query});TimelineState.searchQuery=query;
    if(CONFIG.ACCOUNT_MODE && query) TimelineState.photos=localSource;
    const view=TimelineState.listGeneration,childIndex=TimelineState.currentChildIndex,account=window.TimehutAccounts?.status().generation;
    const current=()=>view===TimelineState.listGeneration&&childIndex===TimelineState.currentChildIndex&&account===window.TimehutAccounts?.status().generation;

    if (!query) {
        // Reset to normal view
        await loadPhotos(1);
        return;
    }

    const loadingEl = document.getElementById('loadingIndicator');
    const containerEl = document.getElementById('timelineContainer');
    const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];

    // Show loading and clear the previous query's empty state.
    loadingEl.style.display = 'block';
    document.getElementById('emptyState').style.display = 'none';

    // Clear existing photos
    Array.from(containerEl.children).forEach(child => {
        if (!child.id?.includes('loading') && !child.id?.includes('empty')) {
            child.remove();
        }
    });

    try {
        // First, try to filter locally loaded photos (instant results)
        let filteredPhotos = [];

        if (localSource.length > 0) {
            filteredPhotos = FlickrAPI.filterPhotosLocally(localSource, query);
        }

        // If local filter found results, show them
        if (filteredPhotos.length > 0) {
            TimelineState.groupedPhotos = groupPhotosByAge(filteredPhotos, (window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`) || child.birthDate);
            loadingEl.style.display = 'none';
            renderTimeline();
            return;
        }

        if(CONFIG.ACCOUNT_MODE){
            loadingEl.style.display='none';
            document.getElementById('emptyState').style.display='block';
            document.querySelector('#emptyState h3').textContent='搜尋更多回憶';
            document.querySelector('#emptyState p').textContent='按上方「搜尋」，尋找其他日期的照片與回憶。';
            return;
        }

        // Fallback to API search for broader results
        const result = await FlickrAPI.searchPhotos(query);
        if(!current())return;

        if (result.photos.length === 0) {
            loadingEl.style.display = 'none';
            document.getElementById('emptyState').style.display = 'block';
            document.querySelector('#emptyState h3').textContent = '找不到照片';
            document.querySelector('#emptyState p').textContent = `沒有符合「${query}」的照片`;
        } else {
            TimelineState.photos = result.photos;
            TimelineState.groupedPhotos = groupPhotosByAge(result.photos, (window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`) || child.birthDate);
            loadingEl.style.display = 'none';
            renderTimeline();
        }

    } catch (error) {
        if(!current())return;
        console.error('Search error:', error);
        loadingEl.style.display = 'none';
    }
}

// =====================================================
// BATCH DELETE / SELECTION MODE FUNCTIONS
// =====================================================

/**
 * 顯示確認對話框 (Promise-based)
 * @param {string} title - 標題
 * @param {string} message - 訊息
 * @param {string} confirmText - 確認按鈕文字
 * @returns {Promise<boolean>}
 */
function showConfirmModal(title, message, confirmText = '確認') {
    return TimehutDialogs.confirm(message,{title,confirmText,danger:/刪除|移除/.test(title+confirmText),dialogId:'confirmModal',okId:'confirmOkBtn',cancelId:'confirmCancelBtn'}).then(value=>value===true);
}

/**
 * 切換選擇模式
 */
function toggleSelectMode() {
    if (!SelectionState.isSelectMode && MomentSelectionState.isSelectMode) window.toggleMomentSelectMode();
    SelectionState.isSelectMode = !SelectionState.isSelectMode;
    document.body.classList.toggle('select-mode', SelectionState.isSelectMode);
    document.getElementById('selectionBar').classList.toggle('hidden', !SelectionState.isSelectMode);
    document.getElementById('selectModeBtn')?.classList.toggle('active', SelectionState.isSelectMode);
    document.getElementById('selectModeBtn')?.setAttribute('aria-pressed', String(SelectionState.isSelectMode));

    if (!SelectionState.isSelectMode) {
        // Clear selections when exiting select mode
        SelectionState.selectedPhotos.clear();
        document.querySelectorAll('.photo-card.selected,.moment-photo-container.selected').forEach(card => {
            card.classList.remove('selected');
        });
    }

    renderTimeline();
    updateSelectionUI();
}

/**
 * 切換照片選擇狀態
 * @param {string} photoId - 照片 ID
 */
function togglePhotoSelection(photoId) {
    if (!SelectionState.isSelectMode) return;

    if (SelectionState.selectedPhotos.has(photoId)) {
        SelectionState.selectedPhotos.delete(photoId);
    } else {
        SelectionState.selectedPhotos.add(photoId);
    }

    // Update UI for this card
    const card = document.querySelector(`.photo-card[data-id="${photoId}"]`);
    if (card) {
        card.classList.toggle('selected', SelectionState.selectedPhotos.has(photoId));
    }

    updateSelectionUI();
}

/**
 * 更新選擇 UI
 */
function updateSelectionUI() {
    const signature=JSON.stringify([TimelineState.currentChildIndex,SelectionState.isSelectMode,[...SelectionState.selectedPhotos].sort()]);
    if(signature!==SelectionState.signature){SelectionState.signature=signature;SelectionState.revision++;}
    document.getElementById('selectedCount').textContent = SelectionState.selectedPhotos.size;

    // Enable/disable buttons based on selection
    const count = SelectionState.selectedPhotos.size;
    const buttons = document.querySelectorAll('#selectionBar .selection-actions button:not(#cancelSelectBtn)');
    buttons.forEach(btn => btn.disabled = count === 0);
    document.getElementById('batchDownloadBtn').disabled = count === 0 || SelectionState.downloadBusy;
    document.querySelectorAll('.moment-photo-container[data-photo-id]').forEach(cell => {
        const selected = SelectionState.selectedPhotos.has(cell.dataset.photoId);
        cell.classList.toggle('selected', selected);
        const button = cell.querySelector('.timeline-photo-select');
        if (button) { button.setAttribute('aria-pressed', String(selected)); button.textContent = selected ? '✓' : '○'; }
    });
}

/**
 * 刪除選取的照片
 */
function removeConfirmedTimelineSelections(succeeded) {
    const done = new Set(succeeded.map(String));
    succeeded.forEach(id => SelectionState.selectedPhotos.delete(String(id)));
    for (const [id, moment] of MomentSelectionState.selectedMoments) {
        const remaining = moment.photos.filter(photo => !done.has(String(photo.id)));
        if (remaining.length) MomentSelectionState.selectedMoments.set(id, {...moment, photos: remaining});
        else MomentSelectionState.selectedMoments.delete(id);
    }
}

function refreshTimelineAfterBatch() {
    const viewedId = TimelineState.allPhotosFlat[TimelineState.currentModalIndex]?.id;
    const pendingMomentPhotos = new Set(getSelectedMomentPhotoIds().map(String));
    TimelineState.photoBatches = calculatePhotoBatches(TimelineState.photos);
    const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];
    const birthDate = (window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${TimelineState.currentChildIndex}_birthdate`) || child.birthDate;
    TimelineState.groupedPhotos = groupPhotosByAge(TimelineState.photos, birthDate);
    TimelineState.momentData.clear();
    MomentSelectionState.selectedMoments.clear();
    renderTimeline();
    // A moment's key is derived from its first photo, which may have been
    // deleted. Rebind remaining selected photos to the newly rendered key.
    for (const [id, moment] of TimelineState.momentData) {
        const remaining = moment.photos.filter(photo => pendingMomentPhotos.has(String(photo.id)));
        if (remaining.length) MomentSelectionState.selectedMoments.set(id, {...moment, photos: remaining});
    }
    updateMomentClickHandlers();
    updateMomentSelectionUI();
    updateSelectionUI();
    updateAgeNavCounts();
    document.getElementById('emptyState').style.display = TimelineState.photos.length ? 'none' : 'block';
    TimehutResults.invalidateAlbumCache();
    const viewedIndex = TimelineState.allPhotosFlat.findIndex(photo => String(photo.id) === String(viewedId));
    if (viewedIndex < 0) window.closeModal();
    TimelineState.currentModalIndex = Math.max(0, viewedIndex);
}

function applyTimelineDeletedPhotos(succeeded) {
    if (!succeeded.length) return;
    const deleted = new Set(succeeded.map(String));
    removeConfirmedTimelineSelections(succeeded);
    TimelineState.photos = TimelineState.photos.filter(photo => !deleted.has(String(photo.id)));
    refreshTimelineAfterBatch();
}

async function deleteSelectedPhotos() {
    console.log('[DELETE] deleteSelectedPhotos called');
    const count = SelectionState.selectedPhotos.size;

    if (count === 0) {
        alert('請先選擇要刪除的照片');
        return;
    }

    // Use custom modal instead of native confirm
    const confirmed = await showConfirmModal(
        '確認刪除',
        `確定要背景刪除 ${count} 張照片嗎？\n⚠️ 此操作無法復原！\n手機已保存的檔案仍會保留。`,
        '🗑️ 確認刪除'
    );

    if (!confirmed) return;

    const photoIds = Array.from(SelectionState.selectedPhotos);
    console.log('[DELETE] Deleting IDs:', photoIds);

    // Hand off to background worker
    if (typeof BackgroundWorker !== 'undefined') {
        const deletion = await BackgroundWorker.startDelete(photoIds);
        if (!deletion.accepted) { alert('目前已有作業進行中，選取已保留'); return; }
        applyTimelineDeletedPhotos(deletion.succeeded);
        if (deletion.failed.length) { alert(`已確認刪除 ${deletion.succeeded.length} 張；${deletion.failed.length} 張未完成，僅保留未完成項目供重試`); return; }

        if (SelectionState.isSelectMode && SelectionState.selectedPhotos.size === 0) toggleSelectMode();
        showToast(`已確認刪除 ${deletion.succeeded.length} 張照片`, 'success');
    } else {
        // Fallback to old blocking method if BackgroundWorker not available
        console.warn('BackgroundWorker not available, using blocking delete');
        const deleteBtn = document.getElementById('deleteSelectedBtn');
        if (deleteBtn) {
            deleteBtn.disabled = true;
            deleteBtn.textContent = '刪除中...';
        }

        try {
            const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photos/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoIds })
            });

            const result = await response.json();

            if (response.ok) {
                const confirmed = TimehutResults.confirmed(result, photoIds);
                applyTimelineDeletedPhotos(confirmed.succeeded);
                if (confirmed.failed.length) { alert(`已確認刪除 ${confirmed.succeeded.length} 張；${confirmed.failed.length} 張未完成，僅保留未完成項目供重試`); return; }
                const successCount = confirmed.succeeded.length;
                TimehutResults.invalidateAlbumCache();
                showToast(`刪除完成！成功：${successCount} 張`, 'success');

                // Exit select mode and reload entire page for fresh data
                SelectionState.selectedPhotos.clear();
                toggleSelectMode();

                // Auto-refresh page after short delay
                setTimeout(() => {
                    location.reload();
                }, 1000);
            } else {
                alert(`刪除失敗：${result.error}`);
            }
        } catch (error) {
            console.error('Delete error:', error);
            alert('刪除時發生錯誤，請稍後再試');
        } finally {
            if (deleteBtn) {
                deleteBtn.disabled = false;
                deleteBtn.textContent = '🗑️ 刪除選取';
            }
            updateSelectionUI();
        }
    }
}

// Make selection functions globally available
// Make selection functions globally available
window.togglePhotoSelection = togglePhotoSelection;
window.deleteSelectedPhotos = deleteSelectedPhotos;

/**
 * 批量下載照片 (P1)
 */
async function batchDownload() {
    if (SelectionState.downloadBusy) return;
    const selected=[...SelectionState.selectedPhotos];
    if (!selected.length) return alert('請先選擇照片');
    const photos=selected.map(id=>TimelineState.allPhotosFlat.find(photo=>photo.id===id)).filter(Boolean).map(photo=>({...photo}));
    const btn=document.getElementById('batchDownloadBtn');
    updateSelectionUI();const revision=SelectionState.revision;
    SelectionState.downloadBusy=true;updateSelectionUI();
    try {
        if(photos.length!==selected.length)throw new Error('選取檔案已變更，請重新選取');
        if(!await TimehutTransfers.confirmDownloads(photos))return;
        if(revision!==SelectionState.revision)throw new Error('選取內容已變更，請重新確認下載');
        btn.textContent='準備下載…';
        const native=await TimehutTransfers.downloadMany(photos);
        if(native){
            if(revision===SelectionState.revision){native.accepted.forEach(id=>SelectionState.selectedPhotos.delete(id));updateSelectionUI();}
            alert(`手機系統已接受 ${native.accepted.length} 個下載，${native.failed.length} 個尚未送出；請到傳輸中心確認。`);return;
        }
        const zip=new JSZip(),acquired=[];let failed=0;
        for(const photo of photos){
            try{
                const url=await TimehutTransfers.mediaUrl(photo);
                const response=await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(url);if(!response.ok)throw new Error('下載失敗');
                const blob=await response.blob();
                const filename=photo.media==='video'?`${photo.id}.${blob.type.split(';')[0].trim().toLowerCase()==='video/quicktime'?'mov':'mp4'}`:`${photo.id}-${new URL(url).pathname.split('/').at(-1)||'media'}`;
                zip.file(filename,blob);acquired.push(photo.id);
                if(revision===SelectionState.revision)btn.textContent=`已取得 ${acquired.length}/${photos.length}`;
            }catch(error){failed++;console.error('Batch file download failed',photo.id,error);}
        }
        if(!acquired.length)throw new Error('本次檔案下載全部失敗，請確認選取內容後再試');
        if(revision===SelectionState.revision)btn.textContent='產生 ZIP…';
        const content=await zip.generateAsync({type:'blob'});saveAs(content,`timehut_photos_${new Date().toISOString().slice(0,10)}.zip`);
        const selectionUnchanged=revision===SelectionState.revision;
        if(selectionUnchanged){acquired.forEach(id=>SelectionState.selectedPhotos.delete(id));updateSelectionUI();}
        alert(`已交給瀏覽器 ${acquired.length} 個檔案的 ZIP；${failed?`${failed} 個檔案未能下載。${selectionUnchanged?'失敗項目仍保留供重試。':'選取內容已變更，請重新選取失敗項目後重試。'}`:'請確認實際下載結果。'}`);
    }catch(error){console.error('Batch download error:',error);alert(error.message||'下載失敗，請稍後再試');}
    finally{SelectionState.downloadBusy=false;btn.textContent='⬇️ 下載';updateSelectionUI();}
}
window.batchDownload = batchDownload;

/**
 * 批量加標籤 (P1)
 */
async function batchAddTags() {
    const count = SelectionState.selectedPhotos.size;
    if (count === 0) return alert('請先選擇照片');

    const tags = await TimehutDialogs.tags(`為 ${count} 張照片增加標籤 (以空格分隔):`);
    if (!tags) return;

    const photoIds = Array.from(SelectionState.selectedPhotos);
    const btn = document.getElementById('batchTagBtn');
    btn.disabled = true;
    btn.textContent = '處理中...';

    try {
        const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photos/tags/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds, tags })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.message || '操作失敗');
        const { succeeded, failed } = TimehutResults.confirmed(result, photoIds);
        const succeededIds = new Set(succeeded);
        TimelineState.photos.forEach(photo => { if (succeededIds.has(String(photo.id))) photo.tags = [photo.tags, tags].filter(Boolean).join(' '); });
        TimehutResults.invalidateAlbumCache();
        succeeded.forEach(id => SelectionState.selectedPhotos.delete(id));
        updateSelectionUI();
        if (failed.length) {
            const status = succeeded.length ? '標籤部分完成' : '標籤尚未完成';
            showToast(`${status}：已完成 ${succeeded.length}/${photoIds.length} 張；${failed.length} 張尚未完成，已保留選取供重試`, succeeded.length ? 'warning' : 'error');
            return;
        }
        showToast(result.message || '操作完成', 'success');

        // Reload to update UI
        SelectionState.selectedPhotos.clear();
        toggleSelectMode();
        TimelineState.photos = [];
        TimelineState.currentPage = 1;
        loadPhotos();
    } catch (error) {
        showToast('加標籤失敗: ' + error.message, 'error');
    } finally {
        btn.disabled = SelectionState.selectedPhotos.size === 0;
        btn.textContent = '🏷️ 加標籤';
    }
}
window.batchAddTags = batchAddTags;

/**
 * 批量加入相簿 (P1)
 */
async function batchAddToAlbum() {
    const count = SelectionState.selectedPhotos.size;
    if (count === 0) return alert('請先選擇照片');

    let albumId,targetAuthority;
    if(CONFIG.ACCOUNT_MODE){const chosen=await TimehutDialogs.chooseAlbum({title:'加入相簿',message:`將 ${count} 張照片加入一本相簿；原本的相簿與原圖會保留。`,confirmText:'加入所選相簿'});if(!chosen)return;albumId=chosen.id;targetAuthority=chosen.authority;}
    else {
    // Simple prompts for selection
    let albumList = "選擇目標相簿：\n";
    CONFIG.CHILDREN.forEach((child, index) => {
        albumList += `${index + 1}. ${child.name} (${child.emoji})\n`;
    });

    const input = await TimehutDialogs.album(albumList);
    if (!input) return;

    albumId = input.trim();
    // Check if user entered encoded index (1, 2)
    const index = parseInt(input) - 1;
    if (!isNaN(index) && CONFIG.CHILDREN[index]) {
        albumId = CONFIG.CHILDREN[index].albumId;
    }

    if (!albumId) return alert('無效的相簿 ID');

    }

    const photoIds = Array.from(SelectionState.selectedPhotos);
    const btn = document.getElementById('batchAlbumBtn');
    btn.disabled = true;
    btn.textContent = '處理中...';

    try {
        const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/album/${albumId}/add_photos`, {
            method: 'POST',
            expectedAuthority:targetAuthority,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.message || '操作失敗');
        const { succeeded, failed } = TimehutResults.confirmed(result, photoIds);
        TimehutResults.invalidateAlbumCache();
        succeeded.forEach(id => SelectionState.selectedPhotos.delete(id));
        updateSelectionUI();
        if (failed.length) {
            alert(`已加入相簿 ${succeeded.length}/${photoIds.length} 張；${failed.length} 張尚未完成，已保留選取供重試`);
            return;
        }
        alert(result.message || '操作完成');

        SelectionState.selectedPhotos.clear();
        toggleSelectMode();
    } catch (error) {
        alert('加入相簿失敗: ' + error.message);
    } finally {
        btn.disabled = SelectionState.selectedPhotos.size === 0;
        btn.textContent = '📁 加入相簿';
    }
}
window.batchAddToAlbum = batchAddToAlbum;

// Initialize when DOM is ready
(window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))( () => {
    bindTimelineReturnLinks();
    if (document.getElementById('timelineContainer')) {
        initTimeline();
    }
});

// Make functions globally available for onclick handlers
window.closeModal = closeModal;
window.navigatePhoto = navigatePhoto;
window.scrollToAge = scrollToAge;

// =====================================================
// P0: TAG EDITING FUNCTION
// =====================================================

/**
 * 儲存照片標籤
 */
async function savePhotoTags() {
    const photo = TimelineState.allPhotosFlat[TimelineState.currentModalIndex];
    const owner=viewerTagOwner();
    if (!photo || !owner || !document.getElementById('photoModal')?.classList.contains('active')) return;
    const key=viewerTagKey(owner,photo.id);
    if (ViewerTagState.pending.has(key)) return;
    clearViewerFeedback();

    const editTagsInput = document.getElementById('editTagsInput');
    const newTags = editTagsInput ? editTagsInput.value.trim() : '';

    // Get existing uploader tag to preserve it
    const existingTags = photo.tags ? photo.tags.split(' ').filter(t => t) : [];
    const uploaderTag = findUploaderTag(existingTags);

    // Combine uploader tag with new user tags
    const finalTags = uploaderTag ? `${uploaderTag} ${newTags}` : newTags;

    const entry={owner,photoId:String(photo.id),authority:ViewerTagState.authority,view:ViewerTagState.view};
    const sameAuthority=()=>entry.authority===ViewerTagState.authority&&entry.owner===viewerTagOwner();
    const samePhoto=()=>sameAuthority()&&document.getElementById('photoModal')?.classList.contains('active')&&String(TimelineState.allPhotosFlat[TimelineState.currentModalIndex]?.id)===entry.photoId;
    const sameView=()=>samePhoto()&&entry.view===ViewerTagState.view;
    let succeeded=false,errorMessage='儲存結果尚未確認';
    ViewerTagState.pending.set(key,entry);syncViewerTagButton();
    try {
        const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photo/${photo.id}/tags`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: finalTags })
        });

        const result = await response.json();

        if (response.ok && result?.success===true && (result.tags===undefined||typeof result.tags==='string')) {
            // Update local photo object
            const savedTags = typeof result.tags === 'string' ? result.tags : finalTags;
            if(sameAuthority()){
                photo.tags = savedTags;
                TimehutResults.invalidateAlbumCache();
                TimelineState.photos.filter(item => String(item.id)===entry.photoId).forEach(item => { item.tags = savedTags; });
            }
            succeeded=true;
        } else {
            throw new Error(typeof result?.error==='string'&&result.error?result.error:'儲存結果尚未確認');
        }
    } catch (error) {
        console.error('Save tags error:', error);
        errorMessage=error instanceof SyntaxError||error instanceof TypeError?'目前無法確認儲存結果，請重新載入後確認':error.message||errorMessage;
    } finally {
        if(ViewerTagState.pending.get(key)===entry)ViewerTagState.pending.delete(key);
        if(samePhoto())syncViewerTagButton();
    }
    if(!sameView())return;
    if(succeeded){
        if(editTagsInput.value.trim()===newTags){
            const button=document.querySelector('.save-tags-btn');
            if(button){button.textContent='✅';button.setAttribute('aria-label','標籤已儲存');}
            showToast('標籤已儲存！','success');
        }else showToast('先前內容已儲存，目前的新內容尚未儲存。','info');
    }else{
        showToast('儲存標籤失敗：'+errorMessage,'error');
    }
}

// Make savePhotoTags globally available
window.savePhotoTags = savePhotoTags;

// =====================================================
// P0: PHOTO BATCH GROUPING (進入同日照片)
// =====================================================

/**
 * 計算照片的批次分組
 * 條件：同一上傳者 + 上傳時間間隔不超過 30 分鐘
 */
function calculatePhotoBatches(photos) {
    if (!photos || photos.length === 0) return new Map();

    // Sort by upload time descending
    const sortedPhotos = [...photos].sort((a, b) => {
        const timeA = parseInt(a.dateupload, 10) || 0;
        const timeB = parseInt(b.dateupload, 10) || 0;
        return timeB - timeA;
    });

    const batches = new Map(); // photoId -> batchId
    let currentBatchId = 0;
    let batchPhotos = []; // Track photos in each batch for size calculation

    sortedPhotos.forEach((photo, idx) => {
        const uploader = extractUploader(photo);
        const uploadTime = parseInt(photo.dateupload, 10) * 1000;

        if (idx === 0) {
            // First photo starts a new batch
            currentBatchId++;
            batchPhotos[currentBatchId] = [photo.id];
            batches.set(photo.id, { batchId: currentBatchId, uploader, time: uploadTime });
        } else {
            const prevPhoto = sortedPhotos[idx - 1];
            const prevBatch = batches.get(prevPhoto.id);
            const prevUploader = extractUploader(prevPhoto);
            const prevTime = parseInt(prevPhoto.dateupload, 10) * 1000;
            const timeDiff = Math.abs(uploadTime - prevTime) / 60000; // in minutes

            if (uploader === prevUploader && timeDiff <= 30) {
                // Same batch
                batches.set(photo.id, { batchId: prevBatch.batchId, uploader, time: uploadTime });
                batchPhotos[prevBatch.batchId].push(photo.id);
            } else {
                // New batch
                currentBatchId++;
                batchPhotos[currentBatchId] = [photo.id];
                batches.set(photo.id, { batchId: currentBatchId, uploader, time: uploadTime });
            }
        }
    });

    // Add batch size info
    batches.forEach((value, key) => {
        value.batchSize = batchPhotos[value.batchId].length;
        value.batchPhotoIds = batchPhotos[value.batchId];
    });

    return batches;
}

/**
 * 從照片標籤中提取上傳者
 */
function extractUploader(photo) {
    const tags = photo.tags ? photo.tags.split(' ').filter(t => t) : [];
    const uploaderTag = findUploaderTag(tags);
    return uploaderTag ? uploaderTag.replace('uploader:', '') : 'unknown';
}

function findUploaderTag(tags) {
    const raw = tags.find(tag => tag.startsWith('uploader:'));
    if (raw) return raw;
    // Recognize only configured family names in Flickr's normalized album-list tags.
    const normalized = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const member = (CONFIG.FAMILY_MEMBERS || []).find(person =>
        tags.some(tag => tag === normalized('uploader:' + person.name)));
    return member ? 'uploader:' + member.name : null;
}

/**
 * 顯示批次同日照片視圖
 */
function openBatchView(batchInfo) {
    const photos = batchInfo.batchPhotoIds.map(id =>
        TimelineState.allPhotosFlat.find(p => p.id === id)
    ).filter(p => p);

    if (photos.length === 0) return;

    // Create batch view modal (simplified - shows photos in a gallery)
    const batchModal = document.createElement('div');
    batchModal.className = 'batch-view-modal';
    batchModal.innerHTML = `
        <div class="batch-view-overlay" onclick="closeBatchView()"></div>
        <div class="batch-view-content">
            <button class="batch-view-close" onclick="closeBatchView()">✕</button>
            <h3>📷 ${batchInfo.uploader}的同日照片 (${photos.length}張)</h3>
            <div class="batch-gallery">
                ${photos.map((p, idx) => `
                    <img src="${FlickrAPI.getPhotoUrl(p, 'm')}" 
                         alt="${p.title || ''}" 
                         onclick="closeBatchView(); openModal(${TimelineState.allPhotosFlat.indexOf(p)})">
                `).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(batchModal);
    document.body.style.overflow = 'hidden';
}

function closeBatchView() {
    const modal = document.querySelector('.batch-view-modal');
    if (modal) modal.remove();
    document.body.style.overflow = '';
}

window.openBatchView = openBatchView;
window.closeBatchView = closeBatchView;

// =====================================================
// UPLOAD MODAL FUNCTIONS
// =====================================================

// Upload state
const UploadState = {
    files: [],
    isUploading: false
};

/**
 * 打開上傳 Modal
 */
async function openUploadModal() {
    const capabilities=await window.TimehutTransfers?.ready;
    if(capabilities?.nativeError){showToast(capabilities.nativeError,'error');return;}
    if (capabilities?.nativeBackgroundUpload) {
        const context = rememberCurrentTimelineNavigation();
        location.href = window.TimehutEntry?.navigationDestination('transfer.html',context) || 'transfer.html';return;
    }
    const modal = document.getElementById('uploadModal');
    modal.style.removeProperty('display');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Choose before network work; a late response must not replace a user's selection.
    if (window.UploadUI) {
        // Auto-select current child's album
        const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];
        const albumSelect = document.getElementById('albumSelect');
        if (albumSelect && child.albumId) {
            const destination = UploadUI.fileList.length > 0 && UploadUI.retryAlbumId
                ? UploadUI.retryAlbumId : child.albumId;
            albumSelect.value = destination;
        }
        void window.UploadUI.checkAndPrepare();
    }

    // Update album upload link based on current child
    updateAlbumUploadLink();

    // Setup dropzone events
    if (!window.UploadUI) setupDropzone();
}

/**
 * 關閉上傳 Modal
 */
function closeUploadModal() {
    window.UploadUI?.cancelPreparation();
    const modal = document.getElementById('uploadModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';

    // Clear upload queue
    clearUploadQueue();
}

/**
 * 更新相簿上傳連結
 */
function updateAlbumUploadLink() {
    const child = CONFIG.CHILDREN[TimelineState.currentChildIndex];
    const albumLink = document.getElementById('albumUploadLink');

    if (!albumLink) return;
    if(CONFIG.ACCOUNT_MODE){albumLink.href='account.html';albumLink.textContent='前往我的相簿';return;}

    if (child.albumId) {
        // Link to specific album
        albumLink.href = `https://www.flickr.com/photos/${CONFIG.FLICKR_USER_ID}/albums/${child.albumId}`;
        albumLink.textContent = `前往 ${child.name} 相簿`;
    } else {
        // Link to general upload
        albumLink.href = `https://www.flickr.com/photos/${CONFIG.FLICKR_USER_ID}/`;
        albumLink.textContent = '前往 Flickr 相簿';
    }
}

/**
 * 設置拖放區域
 */
function setupDropzone() {
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('fileInput');

    // Click to select files
    dropzone.onclick = () => fileInput.click();

    // Drag events
    dropzone.ondragover = (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    };

    dropzone.ondragleave = () => {
        dropzone.classList.remove('dragover');
    };

    dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    };

    // File input change
    fileInput.onchange = (e) => {
        handleFiles(e.target.files);
    };
}

/**
 * 處理選擇的檔案
 * @param {FileList} files - 檔案列表
 */
function handleFiles(files) {
    const validFiles = Array.from(files).filter(file =>
        file.type.startsWith('image/')
    );

    if (validFiles.length === 0) {
        alert('請選擇圖片檔案');
        return;
    }

    UploadState.files = [...UploadState.files, ...validFiles];
    renderUploadQueue();
}

/**
 * 渲染上傳佇列
 */
function renderUploadQueue() {
    const queueContainer = document.getElementById('uploadQueue');
    const queueList = document.getElementById('queueList');

    if (UploadState.files.length === 0) {
        queueContainer.style.display = 'none';
        return;
    }

    queueContainer.style.display = 'block';
    queueList.innerHTML = '';

    UploadState.files.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'queue-item';

        // Create thumbnail
        const img = document.createElement('img');
        img.className = 'queue-thumbnail';
        img.src = URL.createObjectURL(file);

        item.innerHTML = `
            <span class="queue-filename">${file.name}</span>
            <button class="queue-remove" onclick="removeFromQueue(${index})">✕</button>
        `;
        item.prepend(img);

        queueList.appendChild(item);
    });
}

/**
 * 從佇列移除檔案
 * @param {number} index - 檔案索引
 */
function removeFromQueue(index) {
    UploadState.files.splice(index, 1);
    renderUploadQueue();
}

/**
 * 清空上傳佇列
 */
function clearUploadQueue() {
    if (window.UploadUI) UploadUI.clearQueue();
    UploadState.files = [];
    renderUploadQueue();

    // Reset file input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
}

/**
 * 開始上傳 - 由於 Flickr 需要 OAuth，這裡引導用戶到 Flickr
 */
function startUpload() {
    if (UploadState.files.length === 0) return;

    // Since we can't directly upload to Flickr without OAuth,
    // we'll show a message and open Flickr upload page
    const message = `您選擇了 ${UploadState.files.length} 張照片。\n\n由於安全限制，需要在 Flickr 網站上傳照片。\n\n提示：您可以在 Flickr 上傳頁面選擇相同的照片進行上傳。`;

    if (confirm(message)) {
        window.open('https://www.flickr.com/photos/upload/', '_blank');
        closeUploadModal();
    }
}

// Make upload functions globally available
window.openUploadModal = openUploadModal;
window.closeUploadModal = closeUploadModal;
window.clearUploadQueue = clearUploadQueue;
window.startUpload = startUpload;
window.removeFromQueue = removeFromQueue;

// Make navigation and timeline functions globally available
window.navigateToSearch = navigateToSearch;
window.navigateToAlbum = navigateToAlbum;
window.initTimeline = initTimeline;
window.openModal = openModal;
window.closeModal = closeModal;
window.navigatePhoto = navigatePhoto;
window.toggleSelectMode = toggleSelectMode;
window.deleteSelectedPhotos = deleteSelectedPhotos;
window.setTaggingMode = typeof setTaggingMode === 'function' ? setTaggingMode : function () { };

// Time Travel functions
window.toggleTimeTravelMenu = toggleTimeTravelMenu;
window.populateTimeTravelMenu = populateTimeTravelMenu;

// Toast notification
window.showToast = showToast;

/**
 * 下載當前照片 - 直接下載到手機
 */
async function downloadCurrentPhoto() {
    const photo = TimelineState.allPhotosFlat[TimelineState.currentModalIndex];
    if (!photo) {
        showToast('無法下載照片', 'error');
        return;
    }
    try { if (await window.TimehutTransfers?.download(photo)) return; }
    catch (error) { showToast(error.message || '原生下載未開始', 'error'); return; }

    // Get the largest available URL
    let downloadUrl;
    try { downloadUrl = await TimehutTransfers.mediaUrl(photo); }
    catch (error) { showToast(error.message, 'error'); return; }
    if (!downloadUrl) {
        showToast('無法取得照片網址', 'error');
        return;
    }

    showToast('正在下載...', 'info');

    try {
        // Fetch the image as blob for direct download
        const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(downloadUrl);
        if (!response.ok) throw new Error('下載失敗');
        const blob = await response.blob();

        // Create blob URL and trigger download
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = photo.media === 'video' ? `${photo.id}.${blob.type.split(';')[0].trim().toLowerCase() === 'video/quicktime' ? 'mov' : 'mp4'}` : `${photo.id}-${new URL(downloadUrl).pathname.split('/').at(-1) || 'photo.jpg'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);

        showToast('已交給瀏覽器下載', 'success');
    } catch (error) {
        console.error('Download error:', error);
        if (photo.media === 'video') {
            showToast('影片原檔下載失敗，請稍後按下載重試', 'error');
            return;
        }
        // Fallback: open in new tab for cross-origin images
        window.open(downloadUrl, '_blank');
        showToast('已在新分頁開啟，請長按圖片儲存', 'info');
    }
}

window.downloadCurrentPhoto = downloadCurrentPhoto;

// =====================================================
// ALBUM SIDEBAR (Swipe from left)
// =====================================================

/**
 * 初始化相簿側邊欄
 */
function initAlbumSidebar() {
    const sidebarAlbums = document.getElementById('sidebarAlbums');
    if (!sidebarAlbums) return;

    const currentChildIndex = parseInt((window.TimehutStorage?.local || localStorage).getItem('timehut_current_child') || '0');

    // Render album cards
    sidebarAlbums.innerHTML = CONFIG.CHILDREN.map((child, index) => {
        // Use correct calculateAge from utils.js (returns object)
        const age = calculateAge((window.TimehutStorage?.local || localStorage).getItem(`timehut_child_${index}_birthdate`) || child.birthDate, new Date());
        const ageString = formatAgeString(age.years, age.months, age.days);

        return `
            <button type="button" class="sidebar-album-card ${index === currentChildIndex ? 'active' : ''}"
                 aria-pressed="${index === currentChildIndex}" onclick="switchAlbum(${index})">
                <span class="album-card-emoji">${child.emoji}</span>
                <span class="album-card-info">
                    <span class="album-card-name">${escapeTimehutText(child.name)}</span>
                    <span class="album-card-subtitle">${ageString}</span>
                </span>
            </button>
        `;
    }).join('');

    // Initialize swipe gesture
    initSwipeGesture();
}

// calculateAge is defined in utils.js - DO NOT REDEFINE HERE

/**
 * 初始化滑動手勢
 */
function initSwipeGesture() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if(document.getElementById('photoModal')?.classList.contains('active'))return;
        touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;

        const diffX = touchEndX - touchStartX;
        const diffY = Math.abs(touchEndY - touchStartY);

        // Only trigger if horizontal swipe is significant and starts from left edge
        if (touchStartX < 30 && diffX > 80 && diffY < 100) {
            openAlbumSidebar();
        }
    }, { passive: true });
}

/**
 * 開啟相簿側邊欄
 */
let albumSidebarPreviousFocus = null;

function openAlbumSidebar() {
    const sidebar = document.getElementById('albumSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const tabHandle = document.getElementById('sidebarTabHandle');
    if (sidebar) {
        if (!sidebar.classList.contains('open')) albumSidebarPreviousFocus = document.activeElement;
        sidebar.inert = false;
        sidebar.classList.add('open');
        sidebar.querySelector('.sidebar-close').focus();
    }
    document.querySelectorAll('[aria-controls="albumSidebar"]').forEach(btn => btn.setAttribute('aria-expanded', 'true'));
    if (overlay) overlay.classList.add('visible');
    if (tabHandle) tabHandle.classList.add('hidden');
}

/**
 * 關閉相簿側邊欄
 */
function closeAlbumSidebar() {
    const sidebar = document.getElementById('albumSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const tabHandle = document.getElementById('sidebarTabHandle');
    if (sidebar) {
        sidebar.classList.remove('open');
        sidebar.inert = true;
    }
    document.querySelectorAll('[aria-controls="albumSidebar"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
    if (overlay) overlay.classList.remove('visible');
    if (tabHandle) tabHandle.classList.remove('hidden');
    if (albumSidebarPreviousFocus?.isConnected) albumSidebarPreviousFocus.focus();
}

document.addEventListener('keydown', event => {
    const sidebar = document.getElementById('albumSidebar');
    if (!sidebar?.classList.contains('open')) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeAlbumSidebar();
    } else if (event.key === 'Tab') {
        const buttons = [...sidebar.querySelectorAll('button')];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
});

(window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))( () => {
    const header = document.querySelector('.timeline-page .header');
    if (header) new ResizeObserver(() => {
        document.documentElement.style.setProperty('--timeline-header-height', `${header.getBoundingClientRect().height}px`);
    }).observe(header);
});

/**
 * 切換相簿
 */
async function switchAlbum(childIndex) {
    if (!Number.isInteger(childIndex) || !CONFIG.CHILDREN[childIndex]) return;
    closeAlbumSidebar();
    await switchChild(childIndex);
    if (TimelineState.currentChildIndex === childIndex) showToast(`切換到 ${CONFIG.CHILDREN[childIndex].name} 的相簿`, 'success');
}

// Export sidebar functions
window.openAlbumSidebar = openAlbumSidebar;
window.closeAlbumSidebar = closeAlbumSidebar;
window.switchAlbum = switchAlbum;

// Initialize sidebar on DOMContentLoaded
(window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))( initAlbumSidebar);

// Save scroll position when leaving the page
window.addEventListener('beforeunload', () => {
    // Account redirects may leave before context is ready; scroll restoration is optional.
    if (typeof window.TimehutPage?.owner === 'function' && !window.TimehutPage.owner()) return;
    try {
        (window.TimehutStorage?.session || sessionStorage).setItem(TimelineState.SCROLL_POSITION_KEY, window.scrollY.toString());
    } catch (_) { /* An unavailable scroll cache must not interrupt navigation. */ }
});

// =====================================================
// MOMENT BATCH OPERATIONS (同日照片批量操作)
// =====================================================

/**
 * 切換同日照片選擇模式
 */
window.toggleMomentSelectMode = function toggleMomentSelectMode() {
    if (!MomentSelectionState.isSelectMode && SelectionState.isSelectMode) toggleSelectMode();
    MomentSelectionState.isSelectMode = !MomentSelectionState.isSelectMode;
    document.body.classList.toggle('moment-select-mode', MomentSelectionState.isSelectMode);
    document.getElementById('momentSelectionBar').classList.toggle('hidden', !MomentSelectionState.isSelectMode);
    document.getElementById('batchMomentBtn').classList.toggle('active', MomentSelectionState.isSelectMode);
    document.getElementById('batchMomentBtn').setAttribute('aria-pressed', String(MomentSelectionState.isSelectMode));

    if (!MomentSelectionState.isSelectMode) {
        // Clear selections when exiting select mode
        MomentSelectionState.selectedMoments.clear();
        document.querySelectorAll('.moment-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
    }

    // Add click handlers to moment items
    updateMomentClickHandlers();
    updateMomentSelectionUI();
}

/**
 * 更新同日照片點擊事件
 */
function updateMomentClickHandlers() {
    document.querySelectorAll('.moment-item').forEach(item => {
        const header = item.querySelector('.moment-header');
        const id = item.dataset.momentId;
        item.classList.toggle('selected', MomentSelectionState.selectedMoments.has(id));
        if (MomentSelectionState.selectedMoments.has(id) && TimelineState.momentData.has(id)) {
            const selectedIds = new Set(MomentSelectionState.selectedMoments.get(id).photos.map(photo => String(photo.id)));
            const current = TimelineState.momentData.get(id);
            MomentSelectionState.selectedMoments.set(id, {...current, photos: current.photos.filter(photo => selectedIds.has(String(photo.id)))});
        }
        header.tabIndex = MomentSelectionState.isSelectMode ? 0 : -1;
        header.setAttribute('role', 'button');
        header.setAttribute('aria-label', '選取此同日照片');
        header.setAttribute('aria-pressed', String(MomentSelectionState.selectedMoments.has(id)));
        header.onkeydown = event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleMomentSelection(item); }
        };
        if (MomentSelectionState.isSelectMode) {
            item.onclick = (e) => {
                // Prevent click on photos from triggering selection
                if (e.target.closest('.moment-photo-container')) return;
                toggleMomentSelection(item);
            };
        } else {
            item.onclick = null;
        }
    });
}

/**
 * 切換同日照片選擇狀態
 */
function toggleMomentSelection(momentItem) {
    if (!MomentSelectionState.isSelectMode) return;

    // Get momentDataId from data attribute
    const momentDataId = momentItem.getAttribute('data-moment-id');
    if (!momentDataId) return;

    if (MomentSelectionState.selectedMoments.has(momentDataId)) {
        MomentSelectionState.selectedMoments.delete(momentDataId);
        momentItem.classList.remove('selected');
    } else {
        const momentData = TimelineState.momentData.get(momentDataId);
        if (momentData) {
            MomentSelectionState.selectedMoments.set(momentDataId, momentData);
            momentItem.classList.add('selected');
        }
    }

    momentItem.querySelector('.moment-header').setAttribute('aria-pressed', String(MomentSelectionState.selectedMoments.has(momentDataId)));
    updateMomentSelectionUI();
}

/**
 * 更新同日照片選擇 UI
 */
function updateMomentSelectionUI() {
    const count = MomentSelectionState.selectedMoments.size;
    document.getElementById('selectedMomentCount').textContent = count;

    // Enable/disable action buttons
    const disableActions = count === 0;
    document.getElementById('momentBatchTagBtn').disabled = disableActions;
    document.getElementById('momentMoveCollectionBtn').disabled = disableActions;
    document.getElementById('momentMoveAlbumBtn').disabled = disableActions;
    document.getElementById('momentDeleteBtn').disabled = disableActions;
}

/**
 * 取得所有選中同日照片的照片ID
 */
function getSelectedMomentPhotoIds() {
    const photoIds = [];
    MomentSelectionState.selectedMoments.forEach(momentData => {
        momentData.photos.forEach(photo => {
            if (!photoIds.includes(photo.id)) {
                photoIds.push(photo.id);
            }
        });
    });
    return photoIds;
}

/**
 * 批量刪除同日照片
 */
window.batchMomentDelete = async function batchMomentDelete() {
    const count = MomentSelectionState.selectedMoments.size;
    if (count === 0) return alert('請先選擇同日照片');

    const photoIds = getSelectedMomentPhotoIds();
    const photoCount = photoIds.length;

    if (!await TimehutDialogs.confirm(`確定要永久刪除 ${count} 組同日照片（共 ${photoCount} 張照片）嗎？\n此操作無法復原！\n手機已保存的檔案仍會保留。`, {title:'永久刪除照片',confirmText:'永久刪除',danger:true})) return;

    // Hand off to background worker
    if (typeof BackgroundWorker !== 'undefined') {
        const deletion = await BackgroundWorker.startDelete(photoIds);
        if (!deletion.accepted) { alert('目前已有作業進行中，選取已保留'); return; }
        applyTimelineDeletedPhotos(deletion.succeeded);
        if (deletion.failed.length) { alert(`已確認刪除 ${deletion.succeeded.length} 張；${deletion.failed.length} 張未完成，僅保留未完成項目供重試`); return; }

        if (MomentSelectionState.isSelectMode && MomentSelectionState.selectedMoments.size === 0) toggleMomentSelectMode();
        showToast(`已確認刪除 ${deletion.succeeded.length} 張照片`, 'success');
    } else {
        // Fallback to old blocking method
        console.warn('BackgroundWorker not available, using blocking delete');
        const btn = document.getElementById('momentDeleteBtn');
        btn.disabled = true;
        btn.textContent = '刪除中...';

        try {
            const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photos/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoIds })
            });

            const result = await response.json();

            if (response.ok) {
                const receipt = TimehutResults.confirmed(result, photoIds);
                applyTimelineDeletedPhotos(receipt.succeeded);
                if (receipt.failed.length) { alert(`已確認刪除 ${receipt.succeeded.length} 張；${receipt.failed.length} 張未完成，僅保留未完成項目供重試`); return; }
                const successCount = receipt.succeeded.length;
                TimehutResults.invalidateAlbumCache();
                showToast(`刪除完成！成功：${successCount} 張照片`, 'success');

                // Exit select mode and reload
                MomentSelectionState.selectedMoments.clear();
                toggleMomentSelectMode();

                setTimeout(() => {
                    location.reload();
                }, 1000);
            } else {
                alert(`刪除失敗：${result.error}`);
            }
        } catch (error) {
            console.error('Delete error:', error);
            alert('刪除時發生錯誤，請稍後再試');
        } finally {
            btn.disabled = false;
            btn.textContent = '🗑️ 刪除';
        }
    }
}

/**
 * 批量為同日照片加標籤
 */
window.batchMomentAddTags = async function batchMomentAddTags() {
    const count = MomentSelectionState.selectedMoments.size;
    if (count === 0) return alert('請先選擇同日照片');

    const photoIds = getSelectedMomentPhotoIds();
    const tags = await TimehutDialogs.tags(`為 ${count} 組同日照片（${photoIds.length} 張照片）增加標籤（以空格分隔）:`);
    if (!tags) return;

    const btn = document.getElementById('momentBatchTagBtn');
    btn.disabled = true;
    btn.textContent = '處理中...';

    try {
        const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photos/tags/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds, tags })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.message || '加標籤失敗');
        const { succeeded, failed } = TimehutResults.confirmed(result, photoIds);
        const succeededIds = new Set(succeeded);
        TimelineState.photos.forEach(photo => { if (succeededIds.has(String(photo.id))) photo.tags = [photo.tags, tags].filter(Boolean).join(' '); });
        TimehutResults.invalidateAlbumCache();
        if (failed.length) {
            for (const [id, moment] of MomentSelectionState.selectedMoments) {
                const remaining = moment.photos.filter(photo => !succeededIds.has(String(photo.id)));
                if (remaining.length) MomentSelectionState.selectedMoments.set(id, {...moment, photos: remaining});
                else MomentSelectionState.selectedMoments.delete(id);
            }
            updateMomentClickHandlers(); updateMomentSelectionUI();
            alert(`成功為 ${succeeded.length}/${photoIds.length} 張照片加上標籤；${failed.length} 張尚未完成，已保留選取供重試`);
            return;
        }
        showToast(result.message || '標籤添加成功', 'success');

        // Reload to update UI
        MomentSelectionState.selectedMoments.clear();
        toggleMomentSelectMode();
        TimelineState.photos = [];
        TimelineState.currentPage = 1;
        loadPhotos();
    } catch (error) {
        alert('加標籤失敗: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '🏷️ 加標籤';
    }
}

/**
 * 批量移動同日照片到其他時間點（合併同日照片）- 視覺化 Modal 版
 */
window.batchMomentMoveCollection = async function batchMomentMoveCollection() {
    const count = MomentSelectionState.selectedMoments.size;
    if (count === 0) return alert('請先選擇同日照片');

    // Get photos to move
    const photoIds = getSelectedMomentPhotoIds();

    // Use the visual modal
    moveCollectionState.isFromMomentSelection = true;
    showMoveCollectionModal(photoIds.length, photoIds);
}

/**
 * 批量移動同日照片到其他相簿
 */
window.batchMomentMoveAlbum = async function batchMomentMoveAlbum() {
    const count = MomentSelectionState.selectedMoments.size;
    if (count === 0) return alert('請先選擇同日照片');

    const photoIds = getSelectedMomentPhotoIds();
    const sourceChildIndex = TimelineState.currentChildIndex;
    const sourceAlbumId = CONFIG.CHILDREN[sourceChildIndex].albumId;

    let targetChild,targetAuthority;
    if(CONFIG.ACCOUNT_MODE){const chosen=await TimehutDialogs.chooseAlbum({title:'移動到其他相簿',message:`將 ${count} 組同日照片（${photoIds.length} 張）移到所選相簿，並從原相簿移出；照片原檔會保留。`,confirmText:'移動到所選相簿',excludedAlbumId:sourceAlbumId});if(!chosen)return;targetChild={albumId:chosen.id,name:chosen.title};targetAuthority=chosen.authority;}
    else {
    // Build album selection options
    let albumList = '選擇目標相簿：\n\n';
    CONFIG.CHILDREN.forEach((child, index) => {
        const current = index === sourceChildIndex ? ' (目前)' : '';
        albumList += `${index + 1}. ${child.emoji} ${child.name}${current}\n`;
    });

    const input = await TimehutDialogs.album(albumList, false);
    if (!input) return;

    const targetIdx = parseInt(input) - 1;
    if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= CONFIG.CHILDREN.length) {
        return alert('無效的選擇');
    }

    if (targetIdx === sourceChildIndex) {
        return alert('照片已在此相簿中');
    }

    targetChild = CONFIG.CHILDREN[targetIdx];


    if (!await TimehutDialogs.confirm(`確定要將 ${count} 組同日照片（${photoIds.length} 張照片）移動到「${targetChild.name}」的相簿嗎？`, {title:'移動相簿',confirmText:'確認移動'})) return;

    }
    const targetAlbumId=targetChild.albumId;

    const btn = document.getElementById('momentMoveAlbumBtn');
    btn.disabled = true;
    btn.textContent = '處理中...';

    try {
        // First add photos to new album
        const addResponse = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/album/${targetAlbumId}/add_photos`, {
            method: 'POST',
            expectedAuthority:targetAuthority,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds })
        });

        const addResult = await addResponse.json();

        if (!addResponse.ok) {
            throw new Error(addResult.error || '加入新相簿失敗');
        }

        const added = TimehutResults.confirmed(addResult, photoIds);
        if (added.failed.length) {
            throw new Error(`已確認 ${added.succeeded.length}/${photoIds.length} 張加入目標相簿；尚未從原相簿移出任何照片，請重試未完成的移動`);
        }

        // Only confirmed destination membership permits removing originals.
        // The user may switch children while the destination request is pending.
        const removeResponse = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/album/${sourceAlbumId}/remove_photos`, {
            method: 'POST',
            expectedAuthority:targetAuthority,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds })
        });

        const removeResult = await removeResponse.json();

        if (removeResponse.ok) {
            const { succeeded, failed } = TimehutResults.confirmed(removeResult, photoIds);
            const viewingSource = TimelineState.currentChildIndex === sourceChildIndex;
            if (succeeded.length && viewingSource) {
                const moved = new Set(succeeded);
                removeConfirmedTimelineSelections(succeeded);
                TimelineState.photos = TimelineState.photos.filter(photo => !moved.has(String(photo.id)));
                refreshTimelineAfterBatch();
                if (MomentSelectionState.isSelectMode && MomentSelectionState.selectedMoments.size === 0) toggleMomentSelectMode();
            }
            TimehutResults.invalidateAlbumCache();
            if (failed.length) {
                const nextStep = viewingSource ? '未完成項目已保留選取供重試' : '請返回原相簿確認未完成項目並重試';
                alert(`已完成移動 ${succeeded.length}/${photoIds.length} 張；${failed.length} 張尚未從原相簿移出。${nextStep}`);
                return;
            }
            showToast(`成功將 ${photoIds.length} 張照片移動到「${targetChild.name}」的相簿`, 'success');
        } else {
            showToast(`照片已加入新相簿，但從原相簿移除失敗：${removeResult.error}`, 'warning');
        }
    } catch (error) {
        console.error('Move album error:', error);
        alert('移動相簿時發生錯誤：' + error.message);
    } finally {
        btn.disabled = MomentSelectionState.selectedMoments.size === 0;
        btn.textContent = '📚 移動相簿';
    }
}

// =====================================================
// INDIVIDUAL PHOTO BATCH MOVE TO COLLECTION (Visual Modal)
// =====================================================

// State for move collection modal
let moveCollectionState = {
    targetDate: null,
    targetLabel: null,
    collections: [],
    // Track which selection mode triggered the modal
    isFromMomentSelection: false
};

function refreshMoveCollectionDateCounts(succeeded, targetDate) {
    const done = new Set(succeeded.map(String));
    const selectedDate = moveCollectionState.targetDate;
    const previous = new Map(moveCollectionState.collections.map(collection => [collection.date, collection]));
    const photos = new Map(moveCollectionState.collections.flatMap(collection => collection.photos).map(photo => [String(photo.id), photo]));
    const groups = new Map();
    for (const [id, photo] of photos) {
        if (done.has(id)) photo.datetaken = targetDate;
        const date = photoCalendarDay(photo);
        if (!groups.has(date)) groups.set(date, {...previous.get(date), date, photos: []});
        groups.get(date).photos.push(photo);
    }
    moveCollectionState.collections = [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
    renderCollectionList(moveCollectionState.collections);
    const selected = [...document.querySelectorAll('#collectionList .collection-item')].find(item => item.dataset.date === selectedDate);
    if (selected) selectCollection(selected);
}

/**
 * 批量移動單獨選取的照片到其他同日照片（改變拍攝日期）- 視覺化 Modal 版
 */
async function batchMoveToCollection() {
    const count = SelectionState.selectedPhotos.size;
    if (count === 0) return alert('請先選擇照片');

    moveCollectionState.isFromMomentSelection = false;
    showMoveCollectionModal(count, Array.from(SelectionState.selectedPhotos));
}

/**
 * 顯示移動同日照片 Modal
 */
async function showMoveCollectionModal(count, photoIds) {
    document.getElementById('moveCollectionCount').textContent = count;
    document.getElementById('collectionSelectionPrompt').textContent = '請先選擇目的同日照片。';
    document.getElementById('moveCollectionModal').classList.remove('hidden');
    document.getElementById('collectionListLoading').style.display = 'block';
    document.getElementById('collectionList').style.display = 'none';
    document.getElementById('moveCollectionConfirmBtn').disabled = true;
    moveCollectionState.targetDate = null;
    moveCollectionState.photoIds = photoIds;

    // Use existing momentData from timeline
    const moments = Array.from(TimelineState.momentData.entries());

    if (moments.length < 2) {
        document.getElementById('collectionListLoading').innerHTML =
            '<div style="color: var(--color-danger);">需要至少兩組同日照片才能移動</div>';
        return;
    }

    // Build collections list from momentData
    const collections = moments.map(([id, data]) => ({
        id: id,
        date: photoCalendarDay(data.photos[0]),
        label: data.dateStr,
        photos: data.photos,
        timestamp: data.timestamp
    })).sort((a, b) => b.timestamp - a.timestamp);

    moveCollectionState.collections = collections;
    renderCollectionList(collections);
}

/**
 * 渲染同日照片列表
 */
function renderCollectionList(collections) {
    const listEl = document.getElementById('collectionList');

    if (collections.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--color-text-muted);">無可用的同日照片</div>';
    } else {
        listEl.innerHTML = collections.map((col, idx) => `
            <button type="button" class="collection-item" aria-pressed="false" data-date="${col.date}" data-label="${col.label}" onclick="selectCollection(this)">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${FlickrAPI.getPhotoUrl(col.photos[0], 'm')}" 
                         style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;">
                    <div class="collection-text">
                        <strong class="collection-title">${col.label.split(' - ')[0]}</strong>
                        <span class="collection-age">${col.label.split(' - ').slice(1).join(' - ')}</span>
                        <span class="collection-detail">${col.date} · ${col.photos.length} 張</span>
                    </div>
                </div>
                <div class="collection-check" style="display: none;">✓</div>
            </button>
        `).join('');
    }

    document.getElementById('collectionListLoading').style.display = 'none';
    listEl.style.display = 'block';
}

/**
 * 選擇同日照片
 */
function selectCollection(element) {
    // 移除其他選取
    document.querySelectorAll('.collection-item').forEach(el => {
        el.classList.remove('selected');
        el.setAttribute('aria-pressed','false');
        el.querySelector('.collection-check').style.display = 'none';
    });

    // 選取當前
    element.classList.add('selected');
    element.setAttribute('aria-pressed','true');
    element.querySelector('.collection-check').style.display = 'block';

    moveCollectionState.targetDate = element.dataset.date;
    moveCollectionState.targetLabel = element.dataset.label;
    document.getElementById('collectionSelectionPrompt').textContent = `已選擇：${element.dataset.label}。`;
    document.getElementById('moveCollectionConfirmBtn').disabled = false;
}

/**
 * 關閉移動同日照片 Modal
 */
function closeMoveCollectionModal() {
    document.getElementById('moveCollectionModal').classList.add('hidden');
    moveCollectionState.targetDate = null;
}

/**
 * 確認移動同日照片
 */
async function confirmMoveCollection() {
    if (!moveCollectionState.targetDate) return;

    const photoIds = moveCollectionState.photoIds;
    const count = photoIds.length;
    const targetLabel = moveCollectionState.targetLabel;
    const targetDate = moveCollectionState.targetDate + ' 12:00:00';

    // The picker already names the selected date and consequences; its explicit action is the confirmation.

    const btn = document.getElementById('moveCollectionConfirmBtn');
    btn.disabled = true;
    btn.textContent = '處理中...';

    try {
        const response = await (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(`${CONFIG.UPLOAD_API_URL}/api/photos/update-date`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoIds, targetDate })
        });

        const result = await response.json();

        if (response.ok) {
            const { succeeded, failed } = TimehutResults.confirmed(result, photoIds);
            const done = new Set(succeeded);
            TimelineState.photos.forEach(photo => { if (done.has(String(photo.id))) photo.datetaken = targetDate; });
            removeConfirmedTimelineSelections(succeeded);
            if (succeeded.length) refreshTimelineAfterBatch();
            moveCollectionState.photoIds = failed;
            document.getElementById('moveCollectionCount').textContent = failed.length;
            if (failed.length) {
                if (succeeded.length) refreshMoveCollectionDateCounts(succeeded, targetDate);
                alert(`已更新 ${succeeded.length}/${photoIds.length} 張的日期；${failed.length} 張未完成，僅保留未完成項目供重試`);
                return;
            }
            TimehutResults.invalidateAlbumCache();
            showToast(result.message || '移動成功', 'success');
            closeMoveCollectionModal();

            // Clear selection based on mode
            if (moveCollectionState.isFromMomentSelection) {
                MomentSelectionState.selectedMoments.clear();
                toggleMomentSelectMode();
            } else {
                SelectionState.selectedPhotos.clear();
                toggleSelectMode();
            }

            setTimeout(() => location.reload(), 1000);
        } else {
            alert('移動失敗: ' + (result.error || result.message));
        }
    } catch (error) {
        alert('移動失敗: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '修改日期並合併';
    }
}

// Export functions
window.batchMoveToCollection = batchMoveToCollection;
window.showMoveCollectionModal = showMoveCollectionModal;
window.selectCollection = selectCollection;
window.closeMoveCollectionModal = closeMoveCollectionModal;
window.confirmMoveCollection = confirmMoveCollection;
window.renderCollectionList = renderCollectionList;
