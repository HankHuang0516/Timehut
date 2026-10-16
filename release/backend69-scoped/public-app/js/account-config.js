/* Public configuration contains no household names, birthdays, password or Flickr key. */
const CONFIG = {ACCOUNT_MODE:true, UPLOAD_API_URL:'https://just-healing-production.up.railway.app', PHOTOS_PER_PAGE:30, CHILDREN:[], FAMILY_MEMBERS:[], FAMILY_PASSWORD:null};
window.TimehutPage = (() => {
    const accounts=window.TimehutAccounts, native=window.Capacitor?.isNativePlatform?.(), pages=['index.html','timeline.html','album.html','search.html','settings.html','transfer.html'];
    let owner=null, admitted=false;
    const memory={local:new Map(),session:new Map()};
    function facade(kind){return {getItem(key){if(!owner)return null;if(key==='timehut_current_child'||key==='selectedChild'){const chosen=localStorage.getItem('timehut:album-choice:'+owner),index=CONFIG.CHILDREN.findIndex(child=>child.albumId===chosen);return index>=0?String(index):localStorage.getItem('timehut:choice:'+owner);}return memory[kind].get(String(key))??null;},setItem(key,value){if(!owner)throw new Error('帳戶尚未確認');if(key==='timehut_current_child'||key==='selectedChild'){if(!/^\d{1,4}$/.test(String(value)))throw new Error('相簿選擇尚未確認');localStorage.setItem('timehut:choice:'+owner,String(value));const album=CONFIG.CHILDREN[Number(value)]?.albumId;if(album)localStorage.setItem('timehut:album-choice:'+owner,album);}else memory[kind].set(String(key),String(value));},removeItem:key=>memory[kind].delete(String(key))};}
    const storage={local:facade('local'),session:facade('session')};
    function show(message){const section=document.createElement('main');section.className='account-shell';const text=document.createElement('p');text.textContent=message;const link=document.createElement('a');link.href='account.html';link.textContent='前往我的帳戶';const retry=document.createElement('button');retry.type='button';retry.textContent='重新連線';retry.addEventListener('click',()=>location.reload());section.append(text,retry,link);document.body.replaceChildren(section);document.documentElement.removeAttribute('data-timehut-loading');}
    const domReady=()=>document.readyState==='loading'?new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true})):Promise.resolve();
    const ready=(async()=>{
        document.documentElement.setAttribute('data-timehut-loading','true');
        if(!native&&location.origin!==CONFIG.UPLOAD_API_URL){const page=location.pathname.split('/').pop(),safe=pages.includes(page)?page:'index.html';location.replace(CONFIG.UPLOAD_API_URL+'/app/'+safe+location.search);return false;}
        await accounts.ready;
        if(native)CONFIG.UPLOAD_API_URL=accounts.status().backend;
        if(accounts.status().unconfirmed)throw new Error('連線暫時未完成，登入狀態尚未確認。請重新連線，原有傳輸紀錄會保留。');
        if(!accounts.status().authenticated){await domReady();location.replace('account.html?next='+encodeURIComponent(location.pathname.split('/').pop()+location.search));return false;}
        const actor=accounts.status().user;const requested=new URLSearchParams(location.search).get('album')||localStorage.getItem('timehut:album-choice:'+actor.id);const selection=requested&&/^[A-Za-z0-9_-]{1,128}$/.test(requested)?'?'+new URLSearchParams({album:requested}):'';const context=await accounts.request('/api/accounts/context'+selection);
        if(!actor||context.user?.id!==actor.id||!Array.isArray(context.children))throw new Error('帳戶資料尚未確認');
        const colors=['#a6c5b3','#e6bfad','#b6c9db','#d3bdde','#e4ce9f'];
        CONFIG.CHILDREN=context.children.map((child,index)=>{if(typeof child.name!=='string'||typeof child.albumId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(child.albumId)||!/^\d{4}-\d{2}-\d{2}$/.test(child.birthDate))throw new Error('相簿資料尚未確認');return {...child,emoji:'📷',color:colors[index%colors.length]};});
        CONFIG.ALBUM_TOTAL=Number.isSafeInteger(context.albumPagination?.total)?context.albumPagination.total:CONFIG.CHILDREN.length;
        CONFIG.FAMILY_MEMBERS=[{id:actor.id,name:actor.displayName,emoji:'👤'}];owner=actor.id;
        admitted=true;await domReady();document.documentElement.removeAttribute('data-timehut-loading');return true;
    })().catch(async error=>{await domReady();show(error.message||'帳戶連線尚未確認，請稍後重新開啟。');return false;});
    function onReady(fn){const run=async()=>{if(await ready)try{await fn();}catch(error){console.error('頁面尚未完成初始化');}};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else queueMicrotask(run);}
    function empty(){if(CONFIG.CHILDREN.length)return false;show('建立第一本相簿，開始收藏回憶。');return true;}
    window.addEventListener('timehut-account-changed',()=>{if(!admitted)return;admitted=false;owner=null;CONFIG.CHILDREN=[];CONFIG.FAMILY_MEMBERS=[];memory.local.clear();memory.session.clear();show('帳戶已變更，請重新開啟我的帳戶。');location.replace('account.html');});
    return {ready,onReady,empty,storage,owner:()=>owner};
})();
window.TimehutStorage=window.TimehutPage.storage;
function escapeTimehutText(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
window.TimehutAPI = {
    async json(path,options={}){if(!await TimehutPage.ready)throw new Error('請先登入帳戶');return TimehutAccounts.request(path,options);},
    async fetch(value,options={}){const url=new URL(value,location.href);if(url.origin!==CONFIG.UPLOAD_API_URL||!url.pathname.startsWith('/api/'))return fetch(value,options);if(/\/photo\/[0-9]+\/(image|video)$/.test(url.pathname)||url.pathname.startsWith('/api/uploads/file/'))return TimehutAccounts.mediaFetch(url.href,options);let body;if(options.body){if(typeof options.body!=='string')throw new Error('請使用 App 加入原檔傳輸佇列');body=JSON.parse(options.body);}const data=await this.json(url.pathname+url.search,{method:options.method||'GET',body});return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});}
};
