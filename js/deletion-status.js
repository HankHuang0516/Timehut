/* Recover only previously requested, owner-scoped deletion jobs; no media URLs. */
(function(global){
    'use strict';
    const pageState={active:true,epoch:0};
    global.addEventListener('pagehide',()=>{pageState.active=false;pageState.epoch++;});
    global.addEventListener('pageshow',event=>{if(event.persisted){pageState.active=true;pageState.epoch++;}});
    global.addEventListener('timehut-account-changed',()=>{pageState.epoch++;});
    function validate(data,exact=false){
        const perPage=exact?200:30;
        if(!data||!Array.isArray(data.items)||data.items.length>perPage||data.perPage!==perPage||!Number.isSafeInteger(data.total)||data.total<0||!Number.isSafeInteger(data.page)||data.page<1||!Number.isSafeInteger(data.pages)||data.pages!==Math.max(1,Math.ceil(data.total/perPage))||data.items.length>data.total)throw Error('刪除狀態尚未確認');
        const ids=new Set();for(const row of data.items){if(!row||typeof row.photoId!=='string'||!/^\d{1,32}$/.test(row.photoId)||ids.has(row.photoId)||!(exact?['pending','remote_deleted','complete']:['pending','remote_deleted']).includes(row.status)||!Number.isSafeInteger(row.requestedAt)||row.requestedAt<0||typeof row.filename!=='string'||row.filename.length>255||Object.keys(row).some(k=>!['photoId','status','requestedAt','filename'].includes(k)))throw Error('刪除狀態尚未確認');ids.add(row.photoId);}
        return data;
    }
    const owner=()=>global.TimehutAccounts?.status?.().user?.id||null;
    const accountMode=()=>typeof CONFIG!=='undefined'&&CONFIG.ACCOUNT_MODE===true;
    async function inspectAlbum(album,ids){
        if(!accountMode()||!owner()||!Array.isArray(ids)||!ids.length)return null;
        const actor=owner(),epoch=pageState.epoch,query=new URLSearchParams({album,photoIds:ids.join(',')});
        try{const data=validate(await global.TimehutAccounts.request('/api/accounts/photo-deletions?'+query),true);if(data.total!==data.items.length||data.items.some(row=>!ids.includes(row.photoId)))throw Error('刪除狀態尚未確認');return pageState.active&&pageState.epoch===epoch&&owner()===actor?data:null;}catch(_){return null;}
    }
    global.TimehutDeletionStatus=Object.freeze({validate,inspectAlbum});
    const ready=global.TimehutPage?.onReady||(fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn());
    ready(async()=>{
        const list=document.getElementById('transferList');if(!list||!accountMode()||!owner())return;
        const actor=owner(),current=ticket=>pageState.active&&owner()===actor&&(!ticket||ticket.epoch===pageState.epoch);
        const panel=document.createElement('section');panel.id='photo-deletions';panel.className='settings-section';panel.setAttribute('aria-labelledby','photoDeletionTitle');
        const title=document.createElement('h2');title.id='photoDeletionTitle';title.textContent='刪除待確認';
        const note=document.createElement('p');note.className='storybook-note';note.textContent='接續先前要求的雲端刪除；手機已保存的檔案會保留。待確認項目不提供照片預覽。';
        const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
        const rows=document.createElement('div'),refresh=document.createElement('button'),more=document.createElement('button');refresh.type=more.type='button';refresh.className=more.className='btn-secondary';refresh.textContent='查詢刪除狀態';more.textContent='載入更多待確認項目';more.hidden=true;panel.append(title,note,status,rows,refresh,more);list.after(panel);
        let page=1,lastData=null,loading=null,mutation=null;
        function controls(){const blocked=!current()||loading?.epoch===pageState.epoch||mutation?.epoch===pageState.epoch;refresh.disabled=more.disabled=blocked;for(const button of rows.querySelectorAll('button'))button.disabled=blocked;}
        function clearForNavigation(){loading=mutation=null;rows.replaceChildren();lastData=null;page=1;more.hidden=true;status.textContent=owner()===actor?'返回後會重新查詢刪除狀態':'帳戶已變更，請重新開啟傳輸中心';controls();}
        async function load(nextPage=1){
            if(!current()||mutation?.epoch===pageState.epoch)return;const ticket={epoch:pageState.epoch};loading=ticket;controls();status.textContent='正在查詢刪除狀態…';
            try{
                const data=validate(await global.TimehutAccounts.request('/api/accounts/photo-deletions?page='+nextPage));if(!current(ticket)||loading!==ticket)return;
                if(data.page!==nextPage||nextPage<=data.pages&&data.total>0&&!data.items.length)throw Error('刪除狀態尚未確認');
                if(nextPage===1)rows.replaceChildren();
                const known=new Set([...rows.querySelectorAll('[data-deletion-id]')].map(el=>el.dataset.deletionId));
                for(const row of data.items){
                    if(known.has(row.photoId))continue;known.add(row.photoId);const card=document.createElement('article');card.className='transfer-task';card.dataset.deletionId=row.photoId;
                    const name=document.createElement('h3'),state=document.createElement('p'),retry=document.createElement('button');name.textContent=row.filename;state.className='storybook-note';state.textContent='先前已要求刪除，尚未確認完成';retry.type='button';retry.className='btn-secondary';retry.textContent='接續確認刪除';
                    retry.addEventListener('click',async()=>{
                        if(!current()||loading?.epoch===pageState.epoch||mutation?.epoch===pageState.epoch)return;
                        const operation={epoch:pageState.epoch};mutation=operation;controls();state.textContent='正在確認刪除結果…';let confirmed=false;
                        try{
                            const result=await global.TimehutAccounts.request('/api/photos/delete',{method:'POST',body:{photoIds:[row.photoId]}});if(!current(operation)||mutation!==operation)return;
                            const ok=result?.successCount===1&&Array.isArray(result.results)&&result.results.length===1&&result.results[0].photoId===row.photoId&&result.results[0].success===true;
                            if(!ok)throw Error('刪除尚未確認，可稍後接續查詢');confirmed=true;card.remove();status.textContent='已確認刪除';
                        }catch(_){if(current(operation)&&mutation===operation)state.textContent='刪除尚未確認，可稍後接續查詢。';}
                        finally{if(mutation===operation)mutation=null;controls();}
                        if(current(operation)&&confirmed)await load();
                    });card.append(name,state,retry);rows.append(card);
                }
                page=data.page;lastData=data;more.hidden=page>=data.pages;status.textContent=data.total?`還有 ${data.total} 項刪除待確認`:'目前沒有待確認的刪除作業';
            }catch(_){if(current(ticket)&&loading===ticket){status.textContent='暫時無法取得刪除狀態，請稍後重新查詢';more.hidden=true;}}
            finally{if(loading===ticket)loading=null;controls();}
        }
        refresh.addEventListener('click',()=>load());more.addEventListener('click',()=>{if(lastData&&page<lastData.pages)load(page+1);});
        global.addEventListener('pagehide',clearForNavigation);
        global.addEventListener('pageshow',event=>{if(event.persisted){clearForNavigation();if(current())load();}});
        global.addEventListener('timehut-account-changed',()=>{clearForNavigation();if(current())load();});await load();
    });
})(window);
