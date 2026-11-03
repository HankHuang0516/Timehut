/* First-party accounts. Native tokens stay in OS storage; browser tokens stay in memory. */
window.TimehutAccounts = (() => {
    let backend = 'https://just-healing-production.up.railway.app';
    const cookieMode = location.origin === backend;
    const logoutKey='timehut:pending-web-logout';
    const channel=cookieMode&&typeof BroadcastChannel==='function'?new BroadcastChannel('timehut-accounts'):null;
    let native = null, browserToken = null, profile = null, generation = 0;
    let nativeIOS = false, nativeEpoch = null, closingIntent = null, pendingNativeLogin = null, nativeLogoutScope = null;
    const pending = new Set();
    const changed = () => { for(const controller of pending)controller.abort();window.dispatchEvent(new Event('timehut-account-changed')); };
    function pathAllowed(path) {
        if (typeof path !== 'string' || !path.startsWith('/api/') || path.includes('\\')) return false;
        const url = new URL(path, backend);
        return url.origin === backend && url.pathname.startsWith('/api/') && !url.hash;
    }
    async function browserRequest(path, {method = 'GET', body, token = browserToken, expectedOwner = profile?.user?.id, authRetry=true} = {}) {
        if (!pathAllowed(path)) throw new Error('此帳戶操作不支援');
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
        pending.add(controller);
        try {
            const response = await fetch(backend + path, {method, redirect:'error', credentials:cookieMode?'same-origin':'omit', cache:'no-store', signal:controller.signal,
                headers:{Accept:'application/json', ...(body ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(cookieMode&&expectedOwner?{'X-Timehut-Expected-User':expectedOwner}:{})},
                ...(body ? {body:JSON.stringify(body)} : {})});
            if(response.status===401&&cookieMode&&authRetry&&method==='GET'&&!pendingLogout()){await refreshCookie(expectedOwner);return browserRequest(path,{method,body,token,expectedOwner,authRetry:false});}
            if (response.status === 401) { const signingIn=method==='POST'&&['/api/accounts/session','/api/accounts/login'].includes(path);const error = new Error(signingIn?'登入未成功，請確認帳號與密碼。':'登入已失效，請重新登入'); error.unauthorized = !signingIn; throw error; }
            const actor=response.headers.get('X-Timehut-Account');if(cookieMode&&profile&&token===browserToken&&actor&&actor!==profile.user.id&&!['/api/accounts/session','/api/accounts/login','/api/accounts/register'].includes(path)){const error=new Error('帳戶已變更，請重新開啟頁面');error.accountChanged=true;throw error;}
            if (!response.ok){const error=new Error(response.status === 429 ? '操作較頻繁，請稍後重試' : '操作未完成，請確認內容後重試');error.status=response.status;throw error;}
            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('連線暫時未完成，請稍後重試');
            throw error;
        } finally { clearTimeout(timer); pending.delete(controller); }
    }
    let coordinationDB=null;
    async function cookieCoordination(task){
        if(navigator.locks?.request)return navigator.locks.request('timehut-cookie-refresh',()=>task(async()=>{}));
        // IndexedDB read/write transactions provide cross-document atomicity.
        // This database contains only a short lease ID/time, never credentials.
        if(!window.indexedDB)throw new Error('此瀏覽器無法協調登入續期，請更新瀏覽器或重新登入。');
        coordinationDB??=new Promise((resolve,reject)=>{const request=indexedDB.open('timehut-session-coordination',1);request.onupgradeneeded=()=>request.result.createObjectStore('locks');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('登入續期協調暫時無法開啟'));});
        const db=await coordinationDB,owner=crypto.randomUUID();
        const lease=operation=>new Promise((resolve,reject)=>{const tx=db.transaction('locks','readwrite'),table=tx.objectStore('locks'),request=table.get('refresh');let result=false;
            request.onsuccess=()=>{const old=request.result,now=Date.now();if(operation==='acquire'&&(!old||old.expiresAt<=now)||old?.owner===owner){result=true;if(operation==='release')table.delete('refresh');else table.put({owner,expiresAt:now+120000},'refresh');}};
            tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(new Error('登入續期協調尚未確認'));});
        const end=performance.now()+25000;while(!await lease('acquire')){if(performance.now()>=end)throw new Error('其他頁面正在確認登入，請稍後重試');await new Promise(resolve=>setTimeout(resolve,100));}
        let lost=false;const heartbeat=setInterval(()=>lease('renew').then(ok=>{if(!ok)lost=true;}).catch(()=>{lost=true;}),10000);
        const verify=async()=>{if(lost||!await lease('renew'))throw new Error('登入續期已交由其他頁面處理，請重試。');};
        try{await verify();return await task(verify);}finally{clearInterval(heartbeat);await lease('release').catch(()=>{});}
    }
    let cookieRefresh=null;
    const refreshKey='timehut:remember-rotation';
    async function refreshCookie(expectedOwner=null){
        if(!cookieMode||pendingLogout())throw new Error('請先完成登出確認');
        if(cookieRefresh)return cookieRefresh;
        const authority=generation;
        const run=async(verifyOwnership)=>{
            await verifyOwnership();if(authority!==generation||pendingLogout())throw new Error('帳戶操作已變更');
            // A different tab may already have refreshed the HttpOnly cookie.
            try{const current=await browserRequest('/api/accounts/me',{token:null,expectedOwner,authRetry:false});if(current.expiresAt>Date.now()+60000)return current;}catch(error){if(!error.unauthorized)throw error;}
            let attempt;try{attempt=JSON.parse(localStorage.getItem(refreshKey)||'null');}catch(_){}
            if(!attempt||typeof attempt.id!=='string'||!Number.isSafeInteger(attempt.at)){attempt={id:crypto.randomUUID(),at:Date.now()};localStorage.setItem(refreshKey,JSON.stringify(attempt));}
            try{
                await verifyOwnership();let result=await browserRequest('/api/accounts/session/refresh',{method:'POST',body:{rotationId:attempt.id},token:null,expectedOwner,authRetry:false});
                if(authority!==generation||pendingLogout())throw new Error('帳戶操作已變更');
                if(expectedOwner&&result.user?.id!==expectedOwner){const error=new Error('帳戶已變更，請重新開啟頁面');error.accountChanged=true;throw error;}
                const saved=JSON.parse(localStorage.getItem(refreshKey)||'null');if(saved?.id===attempt.id)localStorage.removeItem(refreshKey);
                if(result.expiresAt<=Date.now()){
                    const followup={id:crypto.randomUUID(),at:Date.now()};localStorage.setItem(refreshKey,JSON.stringify(followup));
                    await verifyOwnership();result=await browserRequest('/api/accounts/session/refresh',{method:'POST',body:{rotationId:followup.id},token:null,expectedOwner,authRetry:false});
                    if(authority!==generation||pendingLogout()||expectedOwner&&result.user?.id!==expectedOwner)throw new Error('帳戶操作已變更');
                    if(result.expiresAt<=Date.now())throw new Error('登入續期尚未確認');localStorage.removeItem(refreshKey);
                }
                return result;
            }catch(error){if(error.unauthorized){localStorage.removeItem(refreshKey);}throw error;}
        };
        cookieRefresh=cookieCoordination(run).then(result=>{if(profile&&authority===generation&&(!expectedOwner||profile.user.id===expectedOwner))profile={...profile,expiresAt:result.expiresAt};return result;}).finally(()=>{cookieRefresh=null;});
        return cookieRefresh;
    }
    async function ensureFreshCookie(){if(cookieMode&&profile&&profile.expiresAt<=Date.now()+60000){const authority=generation;try{await refreshCookie(profile.user.id);}catch(error){if((error.unauthorized||error.accountChanged)&&authority===generation)clearBrowser();throw error;}}}
    function clearBrowser() { nativeEntryContext=null;nativeTimelinePage=null;timelineDocumentEpoch++; browserToken = null; profile = null; nativeEpoch = null; generation++; for (const controller of pending) controller.abort(); changed(); }
    function pendingLogout(){const raw=localStorage.getItem(logoutKey);if(!raw)return null;const row=JSON.parse(raw);if(!row||typeof row.owner!=='string'||typeof row.id!=='string')throw new Error('登出紀錄尚未確認');return row;}
    function confirmLogout(row){const current=pendingLogout();if(current?.id===row.id)localStorage.removeItem(logoutKey);}
    async function logoutRequest(token,expectedOwner){const result=await browserRequest('/api/accounts/logout',{method:'POST',body:{},token,expectedOwner});if(result?.ok!==true)throw new Error('伺服器端登出尚未確認');return result;}
    if(channel)channel.onmessage=event=>{const message=event.data;if(message?.type==='switch'||(message?.type==='logout'&&(!profile||message.owner===profile.user.id)))clearBrowser();};
    if(cookieMode)window.addEventListener('storage',event=>{if(event.key!==logoutKey||!event.newValue)return;try{const intent=JSON.parse(event.newValue);if(typeof intent?.owner==='string'&&(!profile||intent.owner===profile.user.id))clearBrowser();}catch(_){clearBrowser();}});
    const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
    function iosAuthority(value) {
        if (!value || !uuid(value.generation) || typeof value.authenticated !== 'boolean' ||
            (value.authenticated ? !uuid(value.owner) : value.owner !== null)) throw new Error('原生帳戶狀態尚未確認，請更新 App');
        return value;
    }
    async function iosAccounts(raw) {
        const status = async () => {
            const state = await raw.accountStatus(); iosAuthority(state);
            if (state.bridgeVersion !== 2 || typeof state.backend !== 'string') throw new Error('請更新 App 以使用原生帳戶');
            const url = new URL(state.backend);
            if (url.origin !== state.backend || url.username || url.password || url.search || url.hash ||
                !(state.backend === 'https://just-healing-production.up.railway.app' || url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw new Error('原生服務來源尚未確認');
            return state;
        };
        const initial = await status(); backend = initial.backend; nativeEpoch = initial.generation;
        await raw.addListener('accountChanged', value => {
            let state;
            try { state = iosAuthority(value); } catch (_) { clearBrowser(); return; }
            if (profile && (!state.authenticated || state.owner !== profile.user.id || nativeEpoch !== state.generation)) {
                if (!state.authenticated && closingIntent?.generation === generation) { profile = null; changed(); }
                else clearBrowser();
            }
            nativeEpoch = state.generation;
        });
        const unwrap = async (reply, authority, {closed = false, expectedOwner, expectedEpoch} = {}) => {
            if (authority !== generation) throw new Error('帳戶已變更，請重新操作');
            if (reply?.bridgeVersion !== 2 || !reply.data || Array.isArray(reply.data) || typeof reply.data !== 'object') throw new Error('原生回覆尚未確認');
            const state = iosAuthority(reply.authority), current = await status();
            if (authority !== generation || current.backend !== backend || current.generation !== state.generation || current.owner !== state.owner ||
                current.authenticated !== state.authenticated || state.authenticated === closed ||
                (!closed && expectedOwner && (state.owner !== expectedOwner || state.generation !== expectedEpoch))) throw new Error('帳戶已變更，請重新操作');
            nativeEpoch = state.generation; return reply.data;
        };
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            status().then(state => {
                if (profile && (state.owner !== profile.user.id || state.generation !== nativeEpoch || !state.authenticated)) clearBrowser();
            }).catch(() => clearBrowser());
        });
        return {
            transfer:async(method,options={})=>{
                if(!['deviceMediaStatus','deviceMediaAlbums','requestDeviceMedia','openDeviceMediaSettings','deviceMediaList','deviceMediaReconcile','deviceMediaThumbnail','uploadDeviceMedia'].includes(method))return raw[method](options);
                const authority=generation,expectedOwner=profile?.user?.id,expectedEpoch=nativeEpoch,before=await status();
                const owns=state=>authority===generation&&expectedOwner&&state.authenticated&&state.backend===backend&&state.owner===expectedOwner&&state.generation===expectedEpoch;
                if(!owns(before))throw new Error('帳戶已變更，請重新開啟選圖頁');
                const result=await raw[method]({...options,expectedOwner,expectedGeneration:expectedEpoch});
                if(!owns(await status()))throw new Error('帳戶已變更，照片與傳輸紀錄保留');return result;
            },
            prepareUpload: options => raw.prepareUpload(options),
            enqueueUpload: options => raw.enqueueUpload(options),
            enqueueDownload: options => raw.enqueueDownload(options),
            accountStatus: status,
            async accountSignIn(options) {
                const authority = generation, before = await status();
                if (authority !== generation) throw new Error('登入操作已變更，請重試');
                if(pendingNativeLogin){pendingNativeLogin.expectedGeneration=before.generation;pendingNativeLogin.expectedOwner=before.owner??null;}
                const reply = await raw.accountSignIn({...options, expectedGeneration: before.generation});
                const data = await unwrap(reply, authority);
                if (!data.user || data.user.id !== reply.authority.owner || typeof data.legacyOwner !== 'boolean') throw new Error('登入身分尚未確認');
                return data;
            },
            async accountRequest(options) {
                const authority = generation, expectedOwner = profile?.user?.id, expectedEpoch = nativeEpoch;
                const before = await status();
                if (authority !== generation || !before.authenticated || before.backend !== backend ||
                    (expectedOwner && (before.owner !== expectedOwner || before.generation !== expectedEpoch))) throw new Error('帳戶已變更，請重新操作');
                const reply = await raw.accountRequest({...options, expectedGeneration: before.generation, expectedOwner: before.owner});
                return unwrap(reply, authority, {closed: options.method === 'DELETE' && options.path === '/api/accounts/me',
                    expectedOwner: expectedOwner || before.owner, expectedEpoch: expectedOwner ? expectedEpoch : before.generation});
            },
            async accountSignOut(scope) {
                const authority = generation;
                return unwrap(await raw.accountSignOut(scope), authority, {closed: true});
            }
        };
    }
    async function androidAccounts(raw) {
        const invalid=()=>Object.assign(new Error('帳戶已變更，請重新操作'),{accountChanged:true});
        const status=async()=>{
            const state=await raw.accountStatus();
            if(state?.bridgeVersion!==2||state.nativeLoginProtocol!==1||state.accountEvents!==true||typeof state.generation!=='string'||!/^([0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}):[0-9]+$/.test(state.generation)||typeof state.authenticated!=='boolean'||(state.authenticated&&!uuid(state.owner)))throw invalid();
            const url=new URL(state.backend);
            if(url.origin!==state.backend||url.username||url.password||url.search||url.hash||!(state.backend==='https://just-healing-production.up.railway.app'||url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw invalid();
            return state;
        };
        const initial=await status();backend=initial.backend;nativeEpoch=initial.generation;
        let observedEpoch=initial.generation;
        // Compare the validated [0-9]+ counters as digit strings; BigInt does not exist on older Android WebViews.
        const digits=value=>String(value).replace(/^0+(?=\d)/,'');
        const atLeast=(value,floor)=>{const [process,count]=value.split(':'),[prior,minimum]=floor.split(':');const a=digits(count),b=digits(minimum);return process===prior&&/^\d+$/.test(a)&&/^\d+$/.test(b)&&(a.length>b.length||a.length===b.length&&a>=b);};
        const unwrap=async(reply,authority,{closed=false,expectedEpoch,expectedOwner}={})=>{
            if(authority!==generation)throw invalid();
            const scope=reply?._nativeAccountAuthority,current=await status();
            if(authority!==generation||!scope||scope.bridgeVersion!==2||scope.backend!==backend||current.backend!==backend||scope.generation!==current.generation||!atLeast(scope.generation,observedEpoch)||scope.authenticated!==current.authenticated||(scope.owner??null)!==(current.owner??null)||scope.authenticated===closed||(expectedEpoch&&scope.generation!==expectedEpoch)||(expectedOwner&&scope.owner!==expectedOwner))throw invalid();
            observedEpoch=scope.generation;nativeEpoch=scope.generation;const {_nativeAccountAuthority,...data}=reply;return data;
        };
        const refreshAuthority=()=>{
            const authority=generation;
            status().then(value=>{if(!atLeast(value.generation,observedEpoch))return;observedEpoch=value.generation;if(authority===generation&&profile&&(!value.authenticated||value.backend!==backend||value.owner!==profile.user.id||value.generation!==nativeEpoch))clearBrowser();}).catch(()=>{if(authority===generation)clearBrowser();});
        };
        await raw.addListener('accountChanged',refreshAuthority);
        document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshAuthority();});
        const transfer=async(method,options={})=>{
            const authority=generation,expectedOwner=profile?.user?.id,expectedEpoch=nativeEpoch;
            const before=await status();
            if(authority!==generation||!expectedOwner||!before.authenticated||before.backend!==backend||before.owner!==expectedOwner||before.generation!==expectedEpoch)throw invalid();
            const result=await raw[method]({...options,expectedOwner,expectedGeneration:expectedEpoch});
            const after=await status();
            if(authority!==generation||!after.authenticated||after.backend!==backend||after.owner!==expectedOwner||after.generation!==expectedEpoch)throw invalid();
            return result;
        };
        return {
            transfer,prepareUpload:options=>transfer('prepareUpload',options),enqueueUpload:options=>transfer('enqueueUpload',options),enqueueDownload:options=>transfer('enqueueDownload',options),accountStatus:status,
            async accountSignIn(options){const authority=generation,before=await status();if(authority!==generation)throw invalid();if(pendingNativeLogin){pendingNativeLogin.expectedGeneration=before.generation;pendingNativeLogin.expectedOwner=before.owner??null;}const reply=await raw.accountSignIn({...options,expectedGeneration:before.generation});const data=await unwrap(reply,authority);if(data.user?.id!==reply._nativeAccountAuthority.owner)throw invalid();return data;},
            async accountRequest(options){const authority=generation,expectedEpoch=nativeEpoch,expectedOwner=profile?.user?.id??initial.owner;const before=await status();if(authority!==generation||!before.authenticated||before.generation!==expectedEpoch||before.owner!==expectedOwner)throw invalid();try{return await unwrap(await raw.accountRequest({...options,expectedGeneration:expectedEpoch,expectedOwner}),authority,{expectedEpoch,expectedOwner});}catch(error){const current=await status();if(current.generation!==expectedEpoch||current.owner!==expectedOwner||!current.authenticated)throw invalid();throw error;}},
            async accountSignOut(scope){const authority=generation;return unwrap(await raw.accountSignOut(scope),authority,{closed:true});}
        };
    }
    let webInitializationError=null,webRecovery=null,nativeEntryContext=null,nativeTimelinePage=null,timelineDocumentEpoch=0;
    for(const event of ['pagehide','timehut-account-changed'])window.addEventListener(event,()=>{nativeTimelinePage=null;timelineDocumentEpoch++;});
    async function initializeCookie(){
            const authority=generation;let intent=pendingLogout();
            try{
                if(intent){try{await logoutRequest(null,intent.owner);confirmLogout(intent);return;}catch(error){if(error.status!==409)throw error;}}
                const current=await browserRequest('/api/accounts/me',{token:null,expectedOwner:null});
                if(authority!==generation)return {native:false,authenticated:false};
                // Logout may have been written by another tab while /me was in flight.
                intent=pendingLogout();
                if(intent&&intent.owner===current.user.id){await logoutRequest(null,intent.owner);confirmLogout(intent);}
                else if(authority===generation){if(intent)confirmLogout(intent);profile=current;}
            }catch(error){
                if(authority!==generation)return {native:false,authenticated:false};
                if(error.unauthorized){if(intent)confirmLogout(intent);}else throw error;
            }
    }
    async function ensureReady(){
        await ready;if(!webInitializationError)return;
        if(!webRecovery)webRecovery=initializeCookie().then(()=>{webInitializationError=null;}).catch(error=>{webInitializationError=error;throw error;}).finally(()=>{webRecovery=null;});
        await webRecovery;
    }
    const ready = (async () => {
        if(window.__timehutNativeEntryRedirect===true)return {native:false,authenticated:false};
        if (window.Capacitor?.isNativePlatform?.() && ['android','ios'].includes(window.Capacitor.getPlatform())) {
            nativeIOS = window.Capacitor.getPlatform() === 'ios';
            const raw = window.Capacitor.registerPlugin('TimehutTransfer');
            native = nativeIOS ? await iosAccounts(raw) : await androidAccounts(raw);
            const status = await native.accountStatus();
            if (status.authenticated) try {
                // One authenticated read admits the account AND the selected album.
                // The native bridge still validates its current owner/epoch around the reply.
                let album=new URLSearchParams(location.search).get('album');
                if(!album)try{album=localStorage.getItem('timehut:album-choice:'+status.owner);}catch(_){}
                const path='/api/accounts/context'+(typeof album==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(album)?'?'+new URLSearchParams({album}):'');
                const query=new URLSearchParams(path.split('?')[1]||'');
                const timeline=location.pathname.split('/').pop()==='timeline.html';
                if(timeline){query.set('timeline_bootstrap','virtual-first-page-v1');let selected;try{selected=localStorage.getItem('timehut:choice:'+status.owner);}catch(_){}if(typeof selected==='string'&&/^\d{1,4}$/.test(selected))query.set('timeline_child',selected);}
                const documentAtRequest=timelineDocumentEpoch;
                const context=await native.accountRequest({method:'GET',path:timeline?'/api/accounts/context?'+query:path});
                if(context.user?.id!==status.owner||typeof context.legacyOwner!=='boolean'||!Array.isArray(context.children))throw new Error('帳戶資料尚未確認');
                if(timeline&&documentAtRequest!==timelineDocumentEpoch)throw new Error('頁面已變更，請重新開啟');
                if(timeline&&context.timelineBootstrap!==undefined){
                    const proof=context.timelineBootstrap,set=proof?.firstPage?.photoset;
                    if(proof?.protocol!=='virtual-first-page-v1'||proof.owner!==status.owner||typeof proof.albumId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(proof.albumId)||!Number.isSafeInteger(proof.childIndex)||proof.childIndex<0||context.children[proof.childIndex]?.albumId!==proof.albumId||proof.firstPage?.stat!=='ok'||set?.id!==proof.albumId||set.page!==1||set.age_batch_size!==240||!Number.isSafeInteger(set.total)||set.total<0||!Number.isSafeInteger(set.pages)||set.pages!==Math.max(1,Math.ceil(set.total/30))||!Array.isArray(set.photo)||set.photo.length!==Math.min(30,set.total)||set.photo.some(row=>!row||typeof row.id!=='string'||!/^\d{1,32}$/.test(row.id))||new Set(set.photo.map(row=>row.id)).size!==set.photo.length||(set.inventory_revision!==undefined&&(typeof set.inventory_revision!=='string'||!/^[a-f0-9]{64}$/.test(set.inventory_revision))))throw new Error('時間軸來源尚未確認');
                    nativeTimelinePage={albumId:proof.albumId,data:proof.firstPage,owner:status.owner,epoch:nativeEpoch,generation,documentEpoch:documentAtRequest};
                    delete context.timelineBootstrap;
                }
                profile={user:context.user,legacyOwner:context.legacyOwner};
                nativeEntryContext={path,context,owner:status.owner,epoch:nativeEpoch,generation};
            } catch (error) { if ((await native.accountStatus()).authenticated) throw error; }
        }
        else if(cookieMode)try{await initializeCookie();}catch(error){webInitializationError=error;}
        return {native:!!native, authenticated:!!profile};
    })();
    async function request(path, {method = 'GET', body, expectedAuthority = null} = {}) {
        const checkExpected=()=>{if(expectedAuthority&&(expectedAuthority.generation!==generation||expectedAuthority.owner!==profile?.user?.id))throw new Error('帳戶已變更，請重新操作');};
        await ensureReady();checkExpected();await ensureFreshCookie();checkExpected(); if (!profile) throw new Error('請先登入帳戶');
        if (!pathAllowed(path)) throw new Error('此帳戶操作不支援');
        if(method==='GET'&&nativeEntryContext&&path===nativeEntryContext.path){
            const saved=nativeEntryContext;nativeEntryContext=null;
            const current=await native.accountStatus();checkExpected();
            if(saved.generation===generation&&current.authenticated&&current.owner===saved.owner&&current.generation===saved.epoch&&nativeEpoch===saved.epoch)return saved.context;
            throw new Error('帳戶已變更，請重新操作');
        }
        const authority = generation;
        const closing = nativeIOS && method === 'DELETE' && path === '/api/accounts/me' ? {generation: authority} : null;
        if (closing) closingIntent = closing;
        try {
            const result = native ? await native.accountRequest({method, path, ...(body ? {body} : {})}) : await browserRequest(path, {method, body});
            if (authority !== generation) throw new Error('帳戶已變更，請重新操作');
            if (closing) { profile = null; generation++; changed(); }
            return result;
        } catch (error) {
            if ((error.unauthorized||error.accountChanged) && authority === generation) clearBrowser();
            if (native && authority === generation && !(await native.accountStatus()).authenticated) { profile = null; generation++; changed(); }
            throw error;
        } finally { if (closingIntent === closing) closingIntent = null; }
    }
    async function takeTimelinePage(albumId,{page=1,perPage=30,expectedAuthority=null}={}) {
        await ensureReady();const saved=nativeTimelinePage;nativeTimelinePage=null;
        if(!saved)return null;
        const authority=generation,epoch=timelineDocumentEpoch;
        const matches=()=>authority===generation&&saved.generation===generation&&saved.documentEpoch===epoch&&epoch===timelineDocumentEpoch&&profile?.user?.id===saved.owner&&(!expectedAuthority||(expectedAuthority.owner===saved.owner&&expectedAuthority.generation===generation));
        if(!matches())throw new Error('帳戶已變更，請重新操作');
        if(albumId!==saved.albumId||page!==1||perPage!==30)return null;
        const current=await native.accountStatus();
        if(!matches()||!current.authenticated||current.backend!==backend||current.owner!==saved.owner||current.generation!==saved.epoch||nativeEpoch!==saved.epoch)throw new Error('帳戶已變更，請重新操作');
        return saved.data;
    }
    async function signIn({username, password, displayName = '', register = false, adultConfirmed = false, rememberDevice = false}) {
        if (register && adultConfirmed !== true) throw new Error('建立帳戶須確認已滿 18 歲；未滿 18 歲請由家長使用自己的帳戶。');
        await ensureReady();if(native&&!nativeIOS&&pendingNativeLogin)throw new Error('請先確認目前的登入結果');const intent=native?{...(nativeLogoutScope||{expectedGeneration:nativeEpoch,expectedOwner:profile?.user?.id??null}),pendingLogin:!nativeIOS}:null;if(native)clearBrowser();generation++;const authority=generation;if(native){pendingNativeLogin=intent;nativeLogoutScope=intent;}
        try {
        let next;
        if (native) next = await native.accountSignIn({username, password, displayName, register, adultConfirmed});
        else {
            if (register) await browserRequest('/api/accounts/register', {method:'POST', body:{username, password, displayName, adultConfirmed}, token:null});
            const login = await browserRequest(cookieMode?'/api/accounts/session':'/api/accounts/login', {method:'POST', body:{username, password,...(cookieMode?{rememberDevice:rememberDevice===true}:{})}, token:null});
            if(cookieMode){if(authority!==generation)throw new Error('登入操作已變更，請重試');next=login;}
            else {
            if (typeof login.token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(login.token)) throw new Error('登入回應尚未確認');
            next = await browserRequest('/api/accounts/me', {token:login.token});
            if (authority !== generation) throw new Error('登入操作已變更，請重試');
            browserToken = login.token;
            }
        }
        if (authority !== generation) throw new Error('登入操作已變更，請重試');
        profile = {user:next.user, expiresAt:next.expiresAt, legacyOwner:next.legacyOwner};if(native)nativeLogoutScope=null;if(cookieMode){localStorage.removeItem(logoutKey);channel?.postMessage({type:'switch'});}changed(); return profile;
        } finally {if(pendingNativeLogin===intent)pendingNativeLogin=null;}
    }
    async function changePassword(currentPassword, newPassword) {
        const expected={generation,owner:profile?.user?.id,nativeScope:{expectedGeneration:nativeEpoch,expectedOwner:profile?.user?.id}};
        await ensureReady();
        if(!expected.owner)throw new Error('請先登入帳戶');
        const result = await request('/api/accounts/me/password', {method:'PUT', body:{currentPassword, newPassword},expectedAuthority:expected});
        if(result?.passwordChanged!==true||result.signInRequired!==true)throw new Error('密碼修改結果尚未確認，請用新密碼重新登入確認。');
        if(native)await signOut(expected);
        else {
            if(expected.generation!==generation||expected.owner!==profile?.user?.id)throw new Error('帳戶已變更，請使用修改過的帳戶重新登入確認。');
            // Server confirmed all old sessions revoked. No late deletion cookie
            // or logout request may remove a newer browser session.
            clearBrowser();
        }
        return result;
    }
    async function recoveryEmail() { return request('/api/accounts/me/recovery-email'); }
    async function bindRecoveryEmail(email, password) { const expectedAuthority={generation,owner:profile?.user?.id};return request('/api/accounts/me/recovery-email', {method:'POST',body:{email,password},expectedAuthority}); }
    async function recoveryAction(action, body) {
        const paths={forgot:'/api/accounts/password/forgot',verify:'/api/accounts/email/verify',reset:'/api/accounts/password/reset'};
        if(!Object.hasOwn(paths,action))throw new Error('此復原操作不支援');
        return browserRequest(paths[action], {method:'POST',body,token:null,expectedOwner:null,authRetry:false});
    }
    async function signOut(expected = null) {
        await ensureReady();
        if(expected&&(expected.generation!==generation||expected.owner!==profile?.user?.id))throw new Error('帳戶已變更，請使用修改過的帳戶重新登入確認。');
        if (nativeIOS) {
            const scope = expected?.nativeScope||pendingNativeLogin||nativeLogoutScope||{expectedGeneration: nativeEpoch, expectedOwner: profile?.user?.id ?? null};
            clearBrowser(); const authority = generation;
            const result = await native.accountSignOut(scope);
            if (authority !== generation) throw new Error('帳戶已變更，請重新操作');
            if(nativeLogoutScope===scope)nativeLogoutScope=null;
            return result;
        }
        if (native) {
            const scope=expected?.nativeScope||pendingNativeLogin||nativeLogoutScope||{expectedGeneration:nativeEpoch,expectedOwner:profile?.user?.id??null};
            clearBrowser(); const authority = generation;
            const result = await native.accountSignOut(scope);
            if (authority !== generation) throw new Error('帳戶已變更，請重新操作');
            if(nativeLogoutScope===scope)nativeLogoutScope=null;
            return result;
        }
        const token = browserToken,expectedOwner=profile?.user?.id,intent=cookieMode&&expectedOwner?{owner:expectedOwner,id:crypto.randomUUID()}:null;if(intent){localStorage.setItem(logoutKey,JSON.stringify(intent));channel?.postMessage({type:'logout',owner:expectedOwner});}clearBrowser();
        try { await logoutRequest(token,expectedOwner);if(intent)confirmLogout(intent);return {signedOut:true, serverConfirmed:true}; }
        catch (error) { if(intent&&error.unauthorized)confirmLogout(intent);return {signedOut:true, serverConfirmed:!!error.unauthorized}; }
    }
    function status() { return {authenticated:!!profile, unconfirmed:!!webInitializationError, native:!!native, user:profile?.user ? {...profile.user} : null, legacyOwner:!!profile?.legacyOwner, generation, backend}; }
    async function mediaFetch(value,options={}) {
        await ensureReady();await ensureFreshCookie();if(!profile)throw new Error('請先登入帳戶');const url=new URL(value),authority=generation,owner=profile.user.id,token=browserToken;
        if(url.origin!==backend||url.username||url.password||url.hash||!/^\/api\/(photo\/[0-9]+\/(image|video)|uploads\/file\/[A-Za-z0-9_-]+)$/.test(url.pathname))throw new Error('媒體來源尚未確認');
        const controller=new AbortController(),cancel=()=>controller.abort();pending.add(controller);
        const cleanup=()=>{clearTimeout(timer);pending.delete(controller);options.signal?.removeEventListener('abort',cancel);};
        const timer=setTimeout(cancel,120000);controller.signal.addEventListener('abort',cleanup,{once:true});options.signal?.addEventListener('abort',cancel,{once:true});if(options.signal?.aborted)cancel();
        const check=()=>{if(authority!==generation||profile?.user?.id!==owner)throw new Error('帳戶已變更，原檔不會發布');if(controller.signal.aborted)throw new DOMException('媒體讀取已停止','AbortError');};
        const verify=async()=>{check();const current=await request('/api/accounts/me');check();if(current.user?.id!==owner){clearBrowser();throw new Error('帳戶已變更，原檔不會發布');}};
        let readers=0;
        const wrap=response=>{
            readers++;let finished=false,body;
            const finish=()=>{if(finished)return;finished=true;if(--readers===0)cleanup();};
            if(!response.body)finish();
            return new Proxy(response,{get(target,name){
                if(name==='clone')return()=>{check();return wrap(target.clone());};
                if(['blob','arrayBuffer','text','json','formData'].includes(name))return async(...args)=>{try{check();const result=await target[name](...args);await verify();return result;}finally{finish();}};
                if(name==='body'){
                    if(!target.body)return null;
                    if(!body){let reader;body=new ReadableStream({async pull(stream){try{check();reader ||= target.body.getReader();const result=await reader.read();check();if(result.done){await verify();stream.close();finish();}else stream.enqueue(result.value);}catch(error){stream.error(error);reader?.cancel().catch(()=>{});finish();}},cancel(reason){finish();return reader?reader.cancel(reason):target.body.cancel(reason);}},{highWaterMark:0});}
                    return body;
                }
                const value=Reflect.get(target,name,target);return typeof value==='function'?value.bind(target):value;
            }});
        };
        try{
            check();const response=await fetch(url.href,{...options,redirect:'error',credentials:cookieMode?'same-origin':'omit',cache:'no-store',signal:controller.signal,headers:{...options.headers,...(token?{Authorization:`Bearer ${token}`}:{})}});
            check();const actor=response.headers.get('X-Timehut-Account');if(actor&&actor!==owner){response.body?.cancel().catch(()=>{});throw new Error('此媒體不屬於目前帳戶');}
            if(response.status===401){if(authority===generation)clearBrowser();throw new Error('登入已失效，請重新登入');}return wrap(response);
        }catch(error){cancel();cleanup();throw error;}
    }
    async function deletionStatus(receipt) { if (typeof receipt !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(receipt)) throw new Error('請輸入完整的刪除查詢碼'); return browserRequest('/api/accounts/deletion/'+receipt, {token:null}); }
    async function download(photo) {
        await ensureReady(); if (!profile || !photo?.id) throw new Error('請先登入並選擇自己的照片');
        const url = photo.media === 'video' ? photo.videoOriginal : photo.url_o;
        const source = url && new URL(url), variant = photo.media === 'video' ? 'video' : 'image';
        if (!source || source.origin !== backend || source.username || source.password || source.hash || source.pathname !== `/api/photo/${photo.id}/${variant}` || (variant === 'video' ? source.searchParams.get('purpose') !== 'original' : source.searchParams.get('size') !== 'o')) throw new Error('原檔來源尚未確認');
        if (native) return native.enqueueDownload({url, filename:photo.id+(photo.media === 'video'?'.mp4':'.jpg'), mediaType:photo.media === 'video'?'video':'photo'});
        const authority = generation, token = browserToken, controller = new AbortController(), timer = setTimeout(() => controller.abort(), 120000); pending.add(controller);
        try {
            const response = await mediaFetch(url,{signal:controller.signal});
            if (response.status === 401) { if (authority === generation && token === browserToken) clearBrowser(); throw new Error('登入已失效，請重新登入'); }
            if (!response.ok) throw new Error('原檔尚未下載完成');
            const content = await response.blob(), type = content.type.split(';')[0], extensions = {'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','video/quicktime':'mov','video/mp4':'mp4'};
            if (!extensions[type]) throw new Error('下載格式尚未確認');
            if (authority !== generation || !profile) throw new Error('帳戶已變更，下載原件不會發布');
            const object = URL.createObjectURL(content), link = document.createElement('a'); link.href = object; link.download = photo.id+'.'+extensions[type]; link.click(); setTimeout(() => URL.revokeObjectURL(object), 60000);
            return {browserDownloaded:true};
        } finally { clearTimeout(timer); pending.delete(controller); }
    }
    async function upload(albumId, files) {
        await ensureReady(); if (!profile || !(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(albumId || '') || profile.legacyOwner===true&&/^[0-9]{1,32}$/.test(albumId||''))) throw new Error('請登入並選擇自己的相簿');
        const authority = generation, owner = profile.user.id;
        if (native) {
            const prepared = await native.prepareUpload({endpoint:backend,albumId,tags:'',skipUploaded:true}), accepted = [], errors = [...(prepared.errors || [])];
            if (authority !== generation) throw new Error('選取期間帳戶已切換，請重新選取');
            if(prepared.nativeBatch){for(const task of prepared.tasks||[]){if(task.errorCode==='schedule_not_accepted')errors.push('選取紀錄已保留，請到傳輸中心整批重試。');else accepted.push(task);}return {accepted,errors,native:true};}
            for (const task of prepared.tasks) try { accepted.push(await native.enqueueUpload({id:task.id, endpoint:backend, albumId, tags:''})); } catch (error) { errors.push(error.message); }
            return {accepted, errors, native:true};
        }
        const accepted=[],errors=[];
        for(const file of files || []) {
            if(authority!==generation || profile?.user?.id!==owner) throw new Error('帳戶已變更，剩餘原檔未送出');
            try { accepted.push(await window.TimehutWebUpload.upload(file,{albumId,tags:''})); }
            catch(error){errors.push(error.message);break;}
        }
        return {accepted,errors,native:false};
    }
    async function transfer(method,options={}) {
        await ready;
        if(!native||!profile||!['list','thumbnail','prepareUpload','enqueueUpload','enqueueDownload','cancel','retry','retryMany','removeMany','saveToPhotos','deviceMediaStatus','deviceMediaAlbums','requestDeviceMedia','openDeviceMediaSettings','deviceMediaList','deviceMediaReconcile','deviceMediaThumbnail','uploadDeviceMedia'].includes(method))throw new Error('請先登入並確認傳輸功能');
        return native.transfer(method,options);
    }
    return {ready, request, takeTimelinePage, signIn, signOut, changePassword, recoveryEmail, bindRecoveryEmail, recoveryAction, status, deletionStatus, mediaFetch, download, upload, transfer};
})();
