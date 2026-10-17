/* Private support images use authenticated, resumable chunks; never public links. */
(window.TimehutPage?.onReady||(fn=>document.addEventListener('DOMContentLoaded',fn)))(async()=>{
    if(!CONFIG.ACCOUNT_MODE)return;
    const accounts=TimehutAccounts,actor=accounts.status().user?.id;if(!actor)return;
    const current=()=>accounts.status().user?.id===actor;
    const panel=document.createElement('section');panel.className='settings-section feedback-section';panel.id='problem-feedback';
    panel.innerHTML='<h2>問題回饋</h2><p class="storybook-note">描述問題並加入一張截圖。只有你和管理者能查看回饋；不會附上其他相簿照片或登入憑證。</p><form id="feedback-form"><label>問題描述<textarea id="feedback-description" required maxlength="4000" rows="4" placeholder="發生什麼問題？當時按了哪些按鈕？"></textarea></label><label>問題圖片（選填）<input id="feedback-image" type="file" accept="image/jpeg,image/png,image/webp"></label><img id="feedback-preview" alt="將送出的問題圖片預覽" hidden><button id="feedback-remove-image" type="button" class="btn-secondary" hidden>移除圖片</button><p class="storybook-note">圖片會以此預覽副本送出，手機原圖不會修改。</p><div class="feedback-actions"><button id="feedback-submit" type="submit" class="btn-tag">送出回饋</button><button id="feedback-cancel" type="button" class="btn-secondary">清除未送出的內容</button></div><progress id="feedback-progress" hidden></progress><p id="feedback-status" role="status" aria-live="polite"></p></form><details id="my-feedback"><summary>我的回報</summary><div id="feedback-reports"></div><button id="feedback-more" type="button" class="btn-secondary" hidden>載入更多回報</button></details><details id="feedback-admin" hidden><summary>管理員問題回報後台</summary><div id="feedback-inbox"></div><button id="feedback-inbox-more" type="button" class="btn-secondary" hidden>載入更多回報</button></details><h3>問題處理通知</h3><label class="feedback-notification-toggle"><input id="bug-notifications-enabled" type="checkbox" disabled>接收問題處理通知（站內）</label><p class="storybook-note">修復經確認且對應版本已可取得後，會在這裡告知你；不會自動開啟手機推播。</p><div id="bug-notifications" aria-live="polite"></div><button id="feedback-refresh" type="button" class="btn-secondary">更新回報與通知</button>';
    (document.querySelector('.settings-container')||document.querySelector('main')||document.body).append(panel);
    const $=id=>panel.querySelector('#'+id),message=text=>{if(current())$('feedback-status').textContent=text;};
    const native=window.Capacitor?.isNativePlatform?.(),platform=native?window.Capacitor.getPlatform():'web';
    const version=String(window.TimehutBuild?.version||'未知版本'),versionCode=Number.isSafeInteger(window.TimehutBuild?.versionCode)?TimehutBuild.versionCode:Number(version.match(/-test\.(\d+)$/)?.[1]||0);
    const channel=platform==='android'?(window.TimehutBuild?.channel==='android-play'?'android-play':'android-private-test'):platform==='ios'?(window.TimehutBuild?.channel==='ios-testflight'?'ios-testflight':'ios-appstore'):'web';
    const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const encode=bytes=>{let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);};
    let picture=null,previewURL=null,imageGeneration=0,imagePreparing=false,imageFailed=false,attempt=null,busy=false,cancelRequested=false,reportPage=1,inboxPage=1,preference=false;
    function clearPreview(){imageGeneration++;imagePreparing=false;imageFailed=false;if(!busy)$('feedback-submit').disabled=false;picture=null;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;$('feedback-preview').hidden=true;$('feedback-preview').removeAttribute('src');$('feedback-remove-image').hidden=true;$('feedback-image').value='';}
    function resetDraft(){attempt=null;cancelRequested=false;clearPreview();$('feedback-description').value='';$('feedback-description').readOnly=false;$('feedback-image').disabled=false;$('feedback-submit').textContent='送出回饋';$('feedback-progress').hidden=true;}
    $('feedback-remove-image').addEventListener('click',()=>{if(!attempt&&!busy)clearPreview();});
    $('feedback-image').addEventListener('change',async()=>{
        const file=$('feedback-image').files[0];if(!file)return;
        if(busy||attempt&&!attempt.resuming)return;
        clearPreview();imagePreparing=true;$('feedback-submit').disabled=true;message('正在準備附圖，請稍候…');if(attempt?.resuming)attempt.bytes=null;const sequence=imageGeneration;
        try{
            if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('請選擇5 MB以內的JPEG、PNG或WebP圖片。');
            const source=URL.createObjectURL(file),image=new Image();let bytes;
            try{image.src=source;await image.decode();if(image.naturalWidth*image.naturalHeight>16000000)throw Error('圖片尺寸過大，請改用截圖。');const scale=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.78));if(!blob||blob.size>400*1024)throw Error('圖片內容太大，請改選較小的截圖。');bytes=new Uint8Array(await blob.arrayBuffer());}finally{URL.revokeObjectURL(source);}
            const sha256=await digest(bytes);if(sequence!==imageGeneration||!current())return;
            const manifest={mime:'image/jpeg',bytes:bytes.length,sha256,chunks:Math.ceil(bytes.length/6144)};
            if(attempt?.resuming&&JSON.stringify(manifest)!==JSON.stringify(attempt.metadata.image))throw Error('請重新選取同一張問題圖片，或取消這份未完成回報後再建立。');
            picture={bytes,manifest};if(attempt?.resuming)attempt.bytes=bytes;
            previewURL=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));$('feedback-preview').src=previewURL;$('feedback-preview').hidden=false;$('feedback-remove-image').hidden=!!attempt;message('圖片已準備好，確認描述後再送出。');
        }catch(error){if(sequence===imageGeneration){imageFailed=true;$('feedback-remove-image').hidden=false;message(error.message+' 請重新選圖，或移除附圖後再送出。');}}finally{if(sequence===imageGeneration){imagePreparing=false;if(!busy)$('feedback-submit').disabled=imageFailed;}}
    });
    async function cancelAttempt(){
        cancelRequested=true;
        if(!attempt){resetDraft();message('已清除，沒有送出回饋。');return;}
        if(!attempt.id){message('正在核對收件結果，請再按重試以確認取消。');return;}
        const result=await accounts.request('/api/accounts/feedback/'+attempt.id+'/cancel',{method:'POST',body:{}});
        if(result.status!=='cancelled'||!current())throw Error('取消結果尚未確認');resetDraft();message('未完成回報已取消。');await loadReports();
    }
    $('feedback-cancel').addEventListener('click',()=>cancelAttempt().catch(error=>message(error.message)));
    $('feedback-form').addEventListener('submit',async event=>{
        event.preventDefault();if(busy||imagePreparing||imageFailed||!current())return;
        const description=$('feedback-description').value.trim();if(!description){message('請填寫問題描述。');return;}
        if(attempt?.metadata.image&&!attempt.bytes){message('請重新選取同一張問題圖片，接續這份回報。');return;}
        if(!attempt)attempt={metadata:{clientId:crypto.randomUUID(),description,platform,channel,version,versionCode,image:picture?.manifest||null},bytes:picture?.bytes||null,id:null};
        const sending=attempt;busy=true;$('feedback-submit').disabled=true;$('feedback-description').readOnly=true;$('feedback-image').disabled=true;
        try{
            message('正在送出回饋…');let row=await accounts.request('/api/accounts/feedback',{method:'POST',body:sending.metadata});if(!current()||attempt!==sending)return;if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.id)||!['receiving','open','resolved','cancelled'].includes(row.status))throw Error('回饋收件狀態尚未確認');sending.id=row.id;
            if(row.status==='cancelled'){resetDraft();message('這份未完成回報已取消。');return;}
            if(cancelRequested&&row.status==='receiving'){await cancelAttempt();return;}
            if(row.status==='receiving'){
                row=await accounts.request('/api/accounts/feedback/'+row.id);const received=new Set(row.received),progress=$('feedback-progress');progress.hidden=false;progress.max=sending.metadata.image.chunks;progress.value=received.size;
                for(let index=0;index<sending.metadata.image.chunks;index++){
                    if(!current()||attempt!==sending)return;if(cancelRequested){await cancelAttempt();return;}
                    if(!received.has(index)){const ack=await accounts.request(`/api/accounts/feedback/${row.id}/chunks/${index}`,{method:'POST',body:{data:encode(sending.bytes.subarray(index*6144,(index+1)*6144))}});if(ack.id!==row.id||ack.index!==index||ack.received!==true)throw Error('附圖收件狀態尚未確認');received.add(index);}
                    progress.value=received.size;message(`正在送出附圖 ${received.size}／${progress.max}…`);
                }
                if(cancelRequested){await cancelAttempt();return;}
                row=await accounts.request('/api/accounts/feedback/'+row.id+'/complete',{method:'POST',body:{}});
            }
            const proof=await accounts.request('/api/accounts/feedback/'+row.id);if(!current()||attempt!==sending)return;
            if(proof.id!==row.id||!['open','resolved'].includes(proof.status)||sending.metadata.image&&(proof.image?.sha256!==sending.metadata.image.sha256||proof.image?.bytes!==sending.metadata.image.bytes))throw Error('回饋收件尚未確認，請重試核對。');
            resetDraft();message('回饋已送出，回報編號：'+proof.id);await loadReports();
        }catch(error){if(current()){$('feedback-submit').textContent='重試核對同一份回饋';message(error.message||'送出結果尚未確認，原內容已保留，請重試。');}}
        finally{busy=false;if(current())$('feedback-submit').disabled=false;}
    });
    async function showImage(row,button,holder){
        button.disabled=true;try{const parts=[];for(let index=0;index<row.image.chunks;index++){const reply=await accounts.request(`/api/accounts/feedback/${row.id}/image/${index}`);if(!current())return;const raw=atob(reply.data);parts.push(Uint8Array.from(raw,c=>c.charCodeAt(0)));}const blob=new Blob(parts,{type:row.image.mime});if(await digest(await blob.arrayBuffer())!==row.image.sha256)throw Error('附圖內容尚未確認');const url=URL.createObjectURL(blob),image=document.createElement('img');image.className='feedback-saved-image';image.alt='問題回報附圖';image.src=url;holder.append(image);button.remove();window.addEventListener('pagehide',()=>URL.revokeObjectURL(url),{once:true});}catch(error){message(error.message);}finally{button.disabled=false;}
    }
    function reportCard(row,admin=false){
        const card=document.createElement('article');card.className='feedback-report';card.dataset.reportId=row.id;
        const title=document.createElement('p');title.textContent=`${({open:'待處理',resolved:'已處理',receiving:'附圖未完成',cancelled:'已取消'})[row.status]||'待核對'} · ${new Date(row.createdAt).toLocaleString()}`;
        const id=document.createElement('small');id.textContent='回報編號：'+row.id;const text=document.createElement('p');text.textContent=row.description;const build=document.createElement('p');build.className='storybook-note';build.textContent=`${row.platform} · ${row.version}`;card.append(title,id,text,build);
        if(row.image&&['open','resolved'].includes(row.status)){const view=document.createElement('button');view.type='button';view.className='btn-secondary';view.textContent='查看附圖';view.addEventListener('click',()=>showImage(row,view,card));card.append(view);}
        if(!admin&&row.status==='receiving'){
            const resume=document.createElement('button');resume.type='button';resume.className='btn-secondary';resume.textContent='接續這份回報';resume.addEventListener('click',()=>{if(busy)return;clearPreview();attempt={id:row.id,resuming:true,bytes:null,metadata:{clientId:row.clientId,description:row.description,platform:row.platform,channel:row.channel,version:row.version,versionCode:row.versionCode,image:row.image}};cancelRequested=false;$('feedback-description').value=row.description;$('feedback-description').readOnly=true;$('feedback-image').disabled=false;message('請重新選取同一張問題圖片，再按送出接續。');$('feedback-form').scrollIntoView({block:'start'});});card.append(resume);
            const cancel=document.createElement('button');cancel.type='button';cancel.className='btn-secondary';cancel.textContent='取消未完成回報';cancel.addEventListener('click',async()=>{cancel.disabled=true;try{await accounts.request('/api/accounts/feedback/'+row.id+'/cancel',{method:'POST',body:{}});await loadReports();}catch(error){message(error.message);}finally{cancel.disabled=false;}});card.append(cancel);
        }
        return card;
    }
    async function loadReports(page=1,admin=false){const result=await accounts.request('/api/accounts/feedback'+(admin?'/inbox':'')+'?page='+page);if(!current())return;const holder=$(admin?'feedback-inbox':'feedback-reports');if(page===1)holder.replaceChildren();result.reports.forEach(row=>holder.append(reportCard(row,admin)));if(!result.total&&page===1){const empty=document.createElement('p');empty.textContent='目前沒有回報。';holder.append(empty);}$(admin?'feedback-inbox-more':'feedback-more').hidden=page>=result.pages;if(admin)inboxPage=page;else reportPage=page;}
    $('feedback-more').addEventListener('click',()=>loadReports(reportPage+1).catch(error=>message(error.message)));
    if(accounts.status().legacyOwner){$('feedback-admin').hidden=false;$('feedback-admin').addEventListener('toggle',()=>{if($('feedback-admin').open)loadReports(1,true).catch(error=>message(error.message));});}
    $('feedback-inbox-more').addEventListener('click',()=>loadReports(inboxPage+1,true).catch(error=>message(error.message)));
    async function refresh(){
        const setting=await accounts.request('/api/accounts/notification-settings');if(!current())return;if(typeof setting.enabled!=='boolean'||setting.channel!=='in-app')throw Error('通知設定尚未確認');preference=setting.enabled;$('bug-notifications-enabled').checked=preference;$('bug-notifications-enabled').disabled=false;
        const result=await accounts.request('/api/accounts/notifications?'+new URLSearchParams({platform,channel,includeTests:'true'}));if(!current())return;const holder=$('bug-notifications');holder.replaceChildren();
        for(const item of result.notifications){
            const card=document.createElement('article');card.className='feedback-notification';card.dataset.notificationId=item.id;const text=document.createElement('p');
            const included=item.kind==='app-update'&&versionCode>0&&versionCode>=item.versionCode;
            text.textContent=(item.test===true?'測試通知 · ':'')+(item.readAt?'已讀 · ':'未讀 · ')+(item.kind==='service-fix'?'回報問題已由服務修復，可重新操作。':item.kind==='web-refresh'?'回報問題已修復，重新開啟網站即可。':included?'回報問題已處理，目前版本已包含修正。':`回報問題已修復，${item.version} 已可取得。`);card.append(text);
            if(!included&&item.kind!=='service-fix'){const url=new URL(item.url);if(url.protocol!=='https:'||!['github.com','play.google.com','apps.apple.com','testflight.apple.com','just-healing-production.up.railway.app'].includes(url.hostname))throw Error('更新入口尚未確認');const link=document.createElement('a');link.className='btn-secondary';link.href=url.href;link.textContent=item.kind==='web-refresh'?'重新開啟網站':versionCode>0?'請更新至修正版':'查看可用版本';card.append(link);}
            if(!item.readAt){const read=document.createElement('button');read.type='button';read.className='btn-secondary';read.textContent='標為已讀';read.addEventListener('click',async()=>{read.disabled=true;try{const ack=await accounts.request('/api/accounts/notifications/'+item.id+'/read',{method:'POST',body:{}});if(ack.id!==item.id)throw Error('已讀狀態未確認');await refresh();}catch(error){message(error.message);read.disabled=false;}});card.append(read);}holder.append(card);
        }
        if(!result.notifications.length){const empty=document.createElement('p');empty.textContent='目前沒有問題處理通知。';holder.append(empty);}
        await loadReports();
    }
    $('bug-notifications-enabled').addEventListener('change',async()=>{const toggle=$('bug-notifications-enabled');toggle.disabled=true;try{const saved=await accounts.request('/api/accounts/notification-settings',{method:'PUT',body:{enabled:toggle.checked}});if(typeof saved.enabled!=='boolean'||saved.channel!=='in-app')throw Error('通知設定尚未確認');preference=saved.enabled;toggle.checked=preference;message(preference?'已開啟站內問題處理通知。':'已關閉後續站內問題處理通知。');}catch(error){toggle.checked=preference;message(error.message);}finally{toggle.disabled=false;}});
    $('feedback-refresh').addEventListener('click',()=>refresh().catch(error=>message(error.message)));
    window.addEventListener('timehut-account-changed',()=>{cancelRequested=true;});
    window.addEventListener('pagehide',()=>{if(previewURL)URL.revokeObjectURL(previewURL);},{once:true});
    await refresh().catch(()=>message('問題回饋暫時無法連線，請稍後更新狀態。未送出的內容會留在此頁。'));
});
