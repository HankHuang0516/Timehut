/* Queue presentation is separate from native receipts and original files. */
window.TimehutQueueActions = (() => {
    'use strict';
    const terminal=new Set(['completed','saved','photo_deleted','file_ready']);
    const retryStages=new Set(['failed','cancelled','waiting_network','waiting_wifi','waiting_system','waiting_account']);
    const cancelStages=new Set(['queued','preparing','transferring','waiting_network','waiting_wifi','waiting_system','failed','cancelled']);
    const validID=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
    function canRetry(row) {return (retryStages.has(row.stage)||row.canRetryQueued)&&!row.scheduleAccepted&&!!row.endpoint&&!row.retryBlocked&&!row.networkPolicyPending&&row.errorCode!=='RECEIPT_CANCELLED';}
    function canRemove(row) {return !row.retryBlocked&&!row.networkPolicyPending&&(terminal.has(row.stage)||cancelStages.has(row.stage));}
    function uploadUnconfirmed(row) {return row.direction==='upload'&&!terminal.has(row.stage)&&!!(row.serverReceiptId||row.contentSha256||row.bytesTransferred>0);}
    function confirmAction(title,description,action,destructive=false) {
        if(typeof HTMLDialogElement==='undefined')return Promise.resolve(window.confirm(title+'\n\n'+description));
        return new Promise(resolve=>{
            const dialog=document.createElement('dialog');dialog.className='queue-confirm';
            const h=document.createElement('h2');h.id='queue-confirm-title';h.textContent=title;
            const p=document.createElement('p');p.textContent=description;
            const buttons=document.createElement('div');buttons.className='queue-confirm-actions';
            const cancel=document.createElement('button');cancel.textContent='取消';cancel.className='btn-secondary';cancel.type='button';
            const accept=document.createElement('button');accept.textContent=action;accept.className=destructive?'queue-destructive':'btn-tag';accept.type='button';
            dialog.setAttribute('aria-labelledby',h.id);buttons.append(cancel,accept);dialog.append(h,p,buttons);document.body.append(dialog);
            let done=false;
            const finish=value=>{if(done)return;done=true;window.removeEventListener('timehut-account-changed',abort);window.removeEventListener('pagehide',abort);dialog.close();dialog.remove();resolve(value);};
            const abort=()=>finish(false);
            cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
            window.addEventListener('timehut-account-changed',abort);window.addEventListener('pagehide',abort);dialog.showModal();cancel.focus();
        });
    }
    function create({plugin,list,actor,render,isEditing=()=>false,retryMany=null,removeMany=null}) {
        const retryButton=document.getElementById('retryQueue'),removeButton=document.getElementById('removeQueue'),status=document.getElementById('queueActionStatus');
        let busy=false,known=[],storageError=false,cacheOwner=null,cacheGeneration=null,cacheRaw=undefined,cacheIds=new Set();
        const current=()=>{const a=actor();if(!a?.authenticated||!a.user?.id)throw new Error('請先確認登入帳戶');return {owner:a.user.id,generation:a.generation};};
        const check=scope=>{const a=current();if(a.owner!==scope.owner||a.generation!==scope.generation)throw new Error('帳戶已變更，操作已停止');};
        const key=scope=>'timehut:removed-queue:v1:'+scope.owner;
        function read(scope) {
            check(scope);const raw=localStorage.getItem(key(scope));if(cacheOwner===scope.owner&&cacheGeneration===scope.generation&&cacheRaw===raw)return cacheIds;if(raw===null){cacheOwner=scope.owner;cacheGeneration=scope.generation;cacheRaw=null;cacheIds=new Set();return cacheIds;}
            const value=JSON.parse(raw);if(value.version!==1||!Array.isArray(value.ids)||value.ids.length>5000||!value.ids.every(validID))throw new Error('移除紀錄無法讀取，既有任務已保留');cacheOwner=scope.owner;cacheGeneration=scope.generation;cacheRaw=raw;cacheIds=new Set(value.ids);return cacheIds;
        }
        function persist(scope,change) {
            const ids=new Set(read(scope));change(ids);if(ids.size>5000)throw new Error('移除紀錄已滿，請先整理歷史紀錄');check(scope);
            const value=JSON.stringify({version:1,ids:[...ids]});localStorage.setItem(key(scope),value);if(localStorage.getItem(key(scope))!==value)throw new Error('移除紀錄尚未保存，請更新狀態');cacheOwner=scope.owner;cacheGeneration=scope.generation;cacheRaw=value;cacheIds=ids;
        }
        function isRemoved(row){try{const scope=current();return (cacheOwner===scope.owner&&cacheGeneration===scope.generation?cacheIds:read(scope)).has(row.id);}catch(_){storageError=true;return false;}}
        function update(rows=known) {
            known=rows;
            let visible=rows;
            try{const removed=read(current());visible=rows.filter(row=>!removed.has(row.id));storageError=false;}
            catch(_){storageError=true;status.textContent='移除紀錄暫時無法讀取，所有任務仍保留。';}
            retryButton.disabled=!plugin||busy||storageError||!visible.some(canRetry);
            removeButton.disabled=!plugin||busy||storageError||!visible.some(canRemove);
            retryButton.textContent='整批重試'+(visible.filter(canRetry).length?'（'+visible.filter(canRetry).length+'）':'');
            removeButton.textContent='移除佇列';
            document.getElementById('queueBatchActions').hidden=!plugin;
        }
        async function run(mode) {
            if(busy||isEditing())return;
            busy=true;update();let scope;
            try {
                scope=current();const rows=await list();check(scope);const removed=read(scope);
                const active=rows.filter(row=>!removed.has(row.id));
                const targets=active.filter(mode==='retry'?canRetry:canRemove).map(row=>row.id);
                if(!targets.length){status.textContent='目前沒有可'+(mode==='retry'?'重試':'移除')+'的任務。';return;}
                const protectedCount=active.length-targets.length;
                const description=mode==='retry'?'將重試 '+targets.length+' 個失敗或暫停的任務，沿用原任務與收據。已完成及雲端處理中的照片會保留。':'將停止可取消的手機傳輸，並移出清單。手機相簿與雲端照片都會保留。已送出但結果未確認的上傳會留下追蹤。'+(protectedCount?'另有 '+protectedCount+' 個項目會保留，請查看各項狀態。':'');
                if(!await confirmAction(mode==='retry'?'重試這些任務？':'移除這批任務？',description,mode==='retry'?'重試 '+targets.length+' 個':'停止並移除',mode==='remove'))return;
                check(scope);let success=0,failed=0,held=0,stopped=0;
                if(mode==='retry'&&retryMany){
                    const reply=await retryMany(targets);check(scope);if(!Array.isArray(reply.accepted)||!Array.isArray(reply.held)||!Array.isArray(reply.failed))throw new Error('重試結果尚未確認，請更新狀態');
                    success=reply.accepted.length;held=reply.held.length;failed=reply.failed.length;
                }else if(mode==='remove'&&removeMany){
                    const reply=await removeMany(targets);check(scope);if(!Array.isArray(reply.removed)||!Array.isArray(reply.held)||!Array.isArray(reply.failed)||!reply.removed.every(id=>targets.includes(id)))throw new Error('移除結果尚未確認，原紀錄保留');
                    persist(scope,ids=>reply.removed.forEach(id=>ids.add(id)));success=reply.removed.length;held=reply.held.length;failed=reply.failed.length;stopped=Number(reply.stopped)||0;
                }else for(const id of targets) {
                    check(scope);
                    try {
                        const fresh=(await list()).find(row=>row.id===id);check(scope);
                        if(!fresh||read(scope).has(id)){held++;continue;}
                        if(mode==='retry') {
                            if(!canRetry(fresh)){held++;continue;}
                            await plugin.retry({id});check(scope);success++;
                        } else {
                            if(!canRemove(fresh)){held++;continue;}
                            if(!terminal.has(fresh.stage)&&fresh.stage!=='cancelled') {await plugin.cancel({id});check(scope);stopped++;}
                            const after=(await list()).find(row=>row.id===id);check(scope);
                            if(!after||(!terminal.has(after.stage)&&after.stage!=='cancelled')){held++;continue;}
                            if(uploadUnconfirmed(after)){held++;continue;}
                            persist(scope,ids=>ids.add(id));success++;
                        }
                    }catch(error){check(scope);failed++;}
                }
                check(scope);
                status.textContent=mode==='retry'?'已送出 '+success+' 個重試。':'已移除 '+success+' 個項目。'+(stopped?'已要求停止 '+stopped+' 個手機傳輸。':'');
                if(held+protectedCount)status.textContent+=' '+(held+protectedCount)+' 個項目保留原狀，詳細狀態請查看清單。';
                if(failed)status.textContent+=' '+failed+' 個操作尚未確認，請更新狀態。';
                await render();
            }catch(error){status.textContent=error.message||'操作尚未確認，既有任務已保留。';}
            finally{busy=false;update();}
        }
        retryButton.addEventListener('click',()=>run('retry'));removeButton.addEventListener('click',()=>run('remove'));
        return {get busy(){return busy;},isRemoved,observe:update,async restore(id){if(busy)return;const scope=current();persist(scope,ids=>ids.delete(id));await render();}};
    }
    return {create};
})();
