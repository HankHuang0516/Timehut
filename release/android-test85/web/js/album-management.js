/* Recoverable app-album removal. This never deletes provider albums or media. */
(window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))(async () => {
    const container=document.getElementById('childrenList');
    if(!container||!CONFIG.ACCOUNT_MODE)return;
    const actor=TimehutAccounts.status().user?.id, busy=new Set(), renameDrafts=new Map();
    const current=()=>actor&&TimehutAccounts.status().user?.id===actor;
    const status=document.createElement('p');status.className='storybook-note';status.setAttribute('role','status');
    const section=document.createElement('details');section.id='deleted-albums';section.className='settings-section';
    const summary=document.createElement('summary');summary.textContent='已刪除相簿';
    const explanation=document.createElement('p');explanation.className='storybook-note';explanation.textContent='相簿可以復原；照片、影片與 Flickr 原相簿會保留。';
    const rows=document.createElement('div');section.append(summary,explanation,rows,status);container.after(section);
    const change=async(album,operation,button)=>{
        if(!current()||busy.has(album.id))return;
        busy.add(album.id);button.disabled=true;
        try{
            if(operation==='archive'&&!await TimehutDialogs.confirm(`將「${album.name||album.title}」移至已刪除相簿？\n照片、影片與 Flickr 原相簿都會保留，可以隨時復原。`,{title:'刪除相簿',confirmText:'移至已刪除相簿'}))return;
            if(!current())return;
            const result=await TimehutAccounts.request(`/api/accounts/albums/${encodeURIComponent(album.albumId||album.id)}/${operation}`,{method:'POST',body:{}});
            if(!current())return;
            if(result.status!==(operation==='archive'?'archived':'restored')||result.photosDeleted!==false||result.album?.id!==(album.albumId||album.id))throw new Error('相簿變更尚未確認，請更新頁面核對。');
            if(operation==='archive'&&localStorage.getItem('timehut:album-choice:'+actor)===(album.albumId||album.id)){localStorage.removeItem('timehut:album-choice:'+actor);localStorage.setItem('timehut:choice:'+actor,'0');}
            if(operation==='restore')localStorage.setItem('timehut:album-choice:'+actor,album.id);
            location.replace(`settings.html?album-action=${operation==='archive'?'archived':'restored'}${operation==='archive'?'#deleted-albums':''}`);
        }catch(error){if(current()){status.textContent=error.message||'相簿變更未完成，請再試一次。';section.open=true;}}
        finally{busy.delete(album.id);if(current())button.disabled=false;}
    };
    try{
        const result=await TimehutAccounts.request('/api/accounts/albums/archived');if(!current())return;
        if(!Array.isArray(result.albums))throw new Error('已刪除相簿資料尚未確認');
        CONFIG.CHILDREN.forEach((album,index)=>{
            const info=container.querySelectorAll('.child-info')[index];if(!info)return;
            info.closest('.child-card').id='settings-album-'+album.albumId;
            const menu=document.createElement('details');menu.className='album-menu';const label=document.createElement('summary');label.textContent='管理相簿';menu.append(label);
            const rename=document.createElement('button');rename.type='button';rename.className='btn-secondary';rename.textContent='重新命名';rename.dataset.albumId=album.albumId;
            rename.addEventListener('click',async()=>{
                if(!current()||busy.has(album.albumId))return;busy.add(album.albumId);rename.disabled=true;
                try{
                    const value=await TimehutDialogs.albumTitle(renameDrafts.get(album.albumId)||album.name);if(value===null||!current())return;
                    renameDrafts.set(album.albumId,value);
                    const saved=await TimehutAccounts.request(`/api/accounts/albums/${encodeURIComponent(album.albumId)}/title`,{method:'PUT',body:{title:value}});
                    if(!current())return;if(saved.album?.id!==album.albumId||saved.album.title!==value.trim())throw new Error('相簿名稱尚未確認');
                    renameDrafts.delete(album.albumId);location.replace('settings.html?'+new URLSearchParams({album:album.albumId}));
                }catch(error){if(current()){status.textContent=error.message||'名稱尚未儲存，請再試一次。';section.open=true;}}
                finally{busy.delete(album.albumId);if(current())rename.disabled=false;}
            });
            const button=document.createElement('button');button.type='button';button.className='btn-secondary album-remove';button.textContent='刪除相簿';button.dataset.albumId=album.albumId;
            button.addEventListener('click',()=>change({...album,id:album.albumId},'archive',button));menu.append(rename,button);info.append(menu);
        });
        summary.textContent=`已刪除相簿（${Number(result.total)||result.albums.length}）`;
        if(Number(CONFIG.ALBUM_TOTAL)>CONFIG.CHILDREN.length){const directory=document.createElement('a');directory.className='btn-secondary';directory.href='account.html';directory.textContent='查看與管理全部相簿';container.after(directory);}
        const appendArchived=albums=>{
        if(!result.albums.length){const empty=document.createElement('p');empty.textContent='目前沒有已刪除相簿。';rows.append(empty);}
        for(const album of albums){
            if(typeof album.id!=='string'||typeof album.title!=='string'||!Number.isSafeInteger(album.archivedAt))throw new Error('已刪除相簿資料尚未確認');
            const row=document.createElement('div');row.className='album-restore-row';const name=document.createElement('span');name.textContent=album.title;
            const button=document.createElement('button');button.type='button';button.className='btn-secondary';button.textContent='復原相簿';button.dataset.albumId=album.id;button.addEventListener('click',()=>change(album,'restore',button));row.append(name,button);rows.append(row);
        }
        };appendArchived(result.albums);
        let archivedPage=Number(result.page)||1,archivedPages=Number(result.pages)||1;
        const more=document.createElement('button');more.type='button';more.className='btn-secondary';more.textContent='載入更多已刪除相簿';more.hidden=archivedPage>=archivedPages;rows.after(more);
        more.addEventListener('click',async()=>{if(!current()||more.disabled)return;more.disabled=true;try{const next=await TimehutAccounts.request('/api/accounts/albums/archived?page='+(archivedPage+1));if(!current())return;if(!Array.isArray(next.albums)||next.page!==archivedPage+1)throw Error('相簿分頁尚未確認');appendArchived(next.albums);archivedPage=next.page;archivedPages=next.pages;more.hidden=archivedPage>=archivedPages;}catch(error){if(current())status.textContent='尚未載入更多相簿，請再試一次。';}finally{more.disabled=false;}});
        if(location.hash==='#deleted-albums')section.open=true;
        const action=new URLSearchParams(location.search).get('album-action');
        if(action==='archived')status.textContent='相簿已移至這裡，照片與影片仍保留。';
        if(action==='restored')status.textContent='相簿已復原。';
    }catch(error){if(current())status.textContent='相簿管理暫時無法讀取，請稍後更新頁面再試。';}
});
