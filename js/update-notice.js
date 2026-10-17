/* Public released versions only. No push, email, private reports or new grants. */
(function(global){
    'use strict';
    const ORIGIN='https://just-healing-production.up.railway.app';
    const CHANNELS={'android-private-test':'android','android-play':'android','ios-appstore':'ios','ios-testflight':'ios',web:'web'};
    function validateCatalog(data){
        if(data?.schema!==1||!Array.isArray(data.releases)||data.releases.length>5)throw Error('版本資料尚未確認');
        const seen=new Set();
        return data.releases.map(row=>{
            if(!row||CHANNELS[row.channel]!==row.platform||seen.has(row.channel)||row.available!==true||typeof row.version!=='string'||!row.version.trim()||row.version.length>80||!Number.isSafeInteger(row.versionCode)||row.versionCode<1||typeof row.notes!=='string'||!row.notes.trim()||row.notes.length>240||!Number.isFinite(Date.parse(row.verifiedAt)))throw Error('版本資料尚未確認');
            const u=new URL(row.url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('更新入口尚未確認');
            const good=row.channel==='android-private-test'?u.hostname==='github.com'&&/^\/HankHuang0516\/Timehut\/releases\/download\/android-test-[0-9.-]+\/HuangJiaXiaoWu-[0-9.-]+-test\d+\.apk$/.test(u.pathname)&&!u.search&&/^[a-f0-9]{64}$/.test(row.sha256||''):
                row.channel==='android-play'?u.hostname==='play.google.com'&&u.pathname==='/store/apps/details'&&u.searchParams.get('id')==='tw.aihankapps.timehut':
                row.channel==='ios-appstore'?u.hostname==='apps.apple.com'&&/\/id\d+$/.test(u.pathname):
                row.channel==='ios-testflight'?u.hostname==='testflight.apple.com'&&/^\/join\/[A-Za-z0-9]+$/.test(u.pathname):u.origin===ORIGIN&&u.pathname==='/app/index.html'&&!u.search;
            if(!good)throw Error('更新入口尚未確認');seen.add(row.channel);return Object.freeze({...row,url:u.href});
        });
    }
    function currentBuild(build,nativePlatform){
        const platform=['android','ios'].includes(nativePlatform)?nativePlatform:'web';
        const channel=platform==='web'?'web':CHANNELS[build?.channel]===platform?build.channel:null;
        return {platform,channel,version:typeof build?.version==='string'?build.version:null,versionCode:Number.isSafeInteger(build?.versionCode)&&build.versionCode>0?build.versionCode:null,preview:build?.channel==='ui-preview'};
    }
    function webOrder(version){const m=/^(\d{4})\.(\d{2})\.(\d{2})-web\.(\d+)$/.exec(version||'');return m?m.slice(1).map(Number):null;}
    function assess(current,releases){
        if(!current.channel)return {state:'unknown',release:null};
        const release=releases.find(r=>r.channel===current.channel&&r.platform===current.platform);if(!release)return {state:'unavailable',release:null};
        if(!current.version)return {state:'unknown',release};
        if(current.preview)return {state:'preview',release};
        let comparison;
        if(current.platform==='web'){const a=webOrder(current.version),b=webOrder(release.version);if(!a||!b)return {state:'unknown',release};comparison=0;for(let i=0;i<4;i++){if(a[i]!==b[i]){comparison=Math.sign(a[i]-b[i]);break;}}}
        else{if(!current.versionCode)return {state:'unknown',release};comparison=Math.sign(current.versionCode-release.versionCode);}
        return {state:comparison<0?'update':comparison>0?'ahead':current.version===release.version?'current':'unknown',release};
    }
    function seenKey(actor,release){return 'timehut.release-notice.v1:'+encodeURIComponent(actor||'this-browser')+':'+release.channel+':'+release.versionCode+':'+release.version;}
    const api=Object.freeze({validateCatalog,currentBuild,assess,seenKey});
    if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
    global.TimehutUpdateNotice=api;
    const ready=global.TimehutPage?.onReady||(fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn());
    ready(async()=>{
        const container=document.querySelector('.settings-container');if(!container)return;
        const panel=document.createElement('section');panel.className='settings-section';panel.id='app-updates';panel.setAttribute('aria-labelledby','appUpdatesTitle');
        const heading=document.createElement('h2');heading.id='appUpdatesTitle';heading.className='section-title';heading.textContent='應用程式更新';
        const installed=document.createElement('p'),status=document.createElement('p'),notes=document.createElement('p'),actions=document.createElement('div');status.setAttribute('role','status');status.setAttribute('aria-live','polite');notes.className='storybook-note';actions.className='feedback-actions';actions.style.marginBottom='var(--ui-space-4,16px)';
        const refresh=document.createElement('button');refresh.type='button';refresh.className='btn-secondary';refresh.textContent='檢查更新';
        panel.append(heading,installed,status,notes,actions,refresh);container.insertBefore(panel,container.querySelector('.service-card'));
        let generation=0;const actor=()=>global.TimehutAccounts?.status?.().user?.id||'this-browser';
        async function check(){
            const sequence=++generation,owner=actor(),current=currentBuild(global.TimehutBuild,global.Capacitor?.isNativePlatform?.()?global.Capacitor.getPlatform():'web');
            installed.textContent='目前版本：'+(current.version||'尚未取得');status.textContent='正在檢查可用版本…';notes.textContent='';actions.replaceChildren();refresh.disabled=true;
            try{
                const response=await fetch(ORIGIN+'/app/releases.json',{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('版本資訊暫時無法取得');
                const result=assess(current,validateCatalog(await response.json()));if(sequence!==generation||owner!==actor())return;
                const release=result.release;
                status.textContent=result.state==='current'?'已是最新版':result.state==='update'?'有新版可更新：'+release.version:result.state==='ahead'?'目前安裝的版本較新':result.state==='preview'?'目前為測試預覽版':result.state==='unavailable'?'此安裝管道尚無可取得的更新':'目前版本資料不足，尚無法比較';
                if(!release)return;
                notes.textContent='可用版本：'+release.version+'。'+release.notes;
                if(result.state==='update'||['unknown','preview'].includes(result.state)){
                    const link=document.createElement('a');link.className='btn-secondary';link.href=release.url;link.textContent=current.platform==='web'?'開啟正式網站':result.state==='update'?'下載更新版':'查看可用版本';actions.append(link);
                }
                if(result.state==='update'){
                    const key=seenKey(owner,release);let seen=false;try{seen=localStorage.getItem(key)==='seen';}catch(_){}
                    if(!seen){status.textContent='有新版可更新：'+release.version+'（尚未讀取）';const read=document.createElement('button');read.type='button';read.className='btn-secondary';read.textContent='已知道，稍後更新';read.addEventListener('click',()=>{if(owner!==actor())return;try{localStorage.setItem(key,'seen');}catch(_){}status.textContent='有新版可更新：'+release.version;read.remove();});actions.append(read);}
                }
            }catch(_){if(sequence===generation&&owner===actor()){status.textContent='暫時無法檢查更新，請稍後再試';notes.textContent='';actions.replaceChildren();}}
            finally{if(sequence===generation)refresh.disabled=false;}
        }
        refresh.addEventListener('click',check);await check();
    });
})(typeof window==='undefined'?globalThis:window);
