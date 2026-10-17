document.addEventListener('DOMContentLoaded', async () => {
    const accounts = window.TimehutAccounts, $ = id => document.getElementById(id);
    if($('remember-device-label'))$('remember-device-label').hidden=!!window.Capacitor?.isNativePlatform?.();
    const deletionIntent = new URLSearchParams(location.search).get('intent') === 'delete';
    let registering = false, selected = null, page = 1, pages = 1, viewGeneration = 0, albumListPage=1, albumListPages=1, albumListBusy=false;
    const moreAlbums=document.createElement('button');moreAlbums.type='button';moreAlbums.className='secondary';moreAlbums.textContent='載入更多相簿';moreAlbums.hidden=true;$('account-albums').after(moreAlbums);
    moreAlbums.addEventListener('click',()=>{if(!albumListBusy&&albumListPage<albumListPages)albums(albumListPage+1).catch(error=>message(error.message));});
    const message = text => { $('account-message').textContent = text; };
    function returnToNext(){const next=new URLSearchParams(location.search).get('next');if(!next)return false;const target=new URL(next,location.href),base=new URL('index.html',location.href).pathname.replace(/index\.html$/,'');if(target.origin===location.origin&&!target.hash&&['index.html','timeline.html','album.html','search.html','settings.html','transfer.html'].some(page=>target.pathname===base+page)){location.replace(target.href);return true;}return false;}

    const busy = (form, enabled) => form.querySelectorAll('input,button').forEach(control => { control.disabled = enabled; });
    function registrationMode(enabled) { enabled = enabled && !deletionIntent; registering = enabled; $('display-name-label').hidden = !enabled; $('account-form').elements.displayName.required = enabled; $('account-form').elements.password.autocomplete = enabled ? 'new-password' : 'current-password'; $('auth-title').textContent = enabled ? '建立我的帳戶' : deletionIntent ? '登入以刪除帳戶' : '登入我的相簿'; $('account-submit').textContent = enabled ? '建立帳戶' : '登入'; $('account-toggle').textContent = enabled ? '已有帳戶？前往登入' : '還沒有帳戶？建立帳戶'; $('account-toggle').hidden = deletionIntent; }
    function updateNameDisclosure() {
        const greeting = $('account-greeting'), details = $('account-name-details');
        details.hidden = $('account-home').hidden || greeting.scrollHeight <= greeting.clientHeight + 1;
        if (details.hidden) details.open = false;
    }
    if (window.ResizeObserver) new ResizeObserver(updateNameDisclosure).observe($('account-greeting'));
    window.addEventListener('resize', updateNameDisclosure);
    document.fonts?.ready.then(updateNameDisclosure);
    function refreshIdentity() {
        viewGeneration++;selected=null;albumListPage=1;albumListPages=1;moreAlbums.hidden=true;if($('account-open-timeline'))$('account-open-timeline').hidden=true;if($('account-manage-albums'))$('account-manage-albums').href='settings.html'; $('account-photos').replaceChildren(); $('account-albums').replaceChildren();
        $('selected-album').textContent = '選擇相簿'; $('photos-page').textContent = ''; $('photos-previous').hidden = true; $('photos-next').hidden = true; $('account-upload').hidden = true; $('account-upload-note').hidden = true;
        const state = accounts.status(); $('account-auth').hidden = state.authenticated; $('account-home').hidden = !state.authenticated;
        if (!state.authenticated) registrationMode(false);
        $('account-greeting').textContent = state.user ? `${state.user.displayName}的相簿` : '我的相簿'; $('account-greeting').title=$('account-greeting').textContent;
        $('account-full-name').textContent = state.authenticated ? $('account-greeting').textContent : '';
        $('account-name-details').open = false;
        requestAnimationFrame(updateNameDisclosure);
        if (deletionIntent && state.authenticated) { const panel = $('account-deletion'); panel.open = true; requestAnimationFrame(() => panel.scrollIntoView({block:'start'})); }
    }
    async function albums(requestedPage=1) {
        const authority = viewGeneration;albumListBusy=true;moreAlbums.disabled=true;let result;try{result=await accounts.request('/api/accounts/albums?page='+requestedPage+'&per_page=30');}finally{albumListBusy=false;moreAlbums.disabled=false;}if(authority!==viewGeneration)return;albumListPage=Number(result.page)||1;albumListPages=Number(result.pages)||1;moreAlbums.hidden=albumListPage>=albumListPages;
        if(requestedPage===1)$('account-albums').replaceChildren();
        $('account-albums').append(...result.albums.map(album => { const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.textContent = album.title; button.dataset.album = album.id; button.addEventListener('click', () => photos(album, 1).catch(error => message(error.message))); return button; }));
        $('album-empty').textContent = result.albums.length ? '選擇一本相簿，查看收藏的回憶。' : '建立第一本相簿，開始收藏回憶。';
    }
    async function photos(album, requestedPage) {
        selected = album; page = requestedPage; const authority = ++viewGeneration;
        const result = await accounts.request(`/api/album/${encodeURIComponent(album.id)}/photos?page=${page}&per_page=30`);
        if (authority !== viewGeneration) return; pages = result.photoset.pages;
        localStorage.setItem('timehut:album-choice:'+accounts.status().user.id,album.id);
        document.getElementById('account-manage-albums')?.setAttribute('href','settings.html?'+new URLSearchParams({album:album.id})+'#settings-album-'+album.id);
        if($('account-open-timeline')){$('account-open-timeline').hidden=false;$('account-open-timeline').href='timeline.html?'+new URLSearchParams({album:album.id});}
        $('selected-album').textContent = album.title; $('album-empty').textContent = result.photoset.total ? '' : '這本相簿還沒有照片。';
        $('account-upload').hidden = false; $('account-upload-note').hidden = false;
        $('account-upload-note').textContent = accounts.status().native ? 'App 可選取原檔並加入背景傳輸，實際執行時間由手機系統安排。' : '網頁傳送期間請保持此頁開啟。切換 App 或鎖屏後仍需傳輸，請使用 Android 安裝版。';
        $('account-albums').querySelectorAll('button').forEach(button => button.setAttribute('aria-current', String(button.dataset.album === album.id)));
        $('account-photos').replaceChildren(...result.photoset.photo.map(photo => {
            const card = document.createElement('article'), image = document.createElement('img'), title = document.createElement('p'), download = document.createElement('button'); card.className = 'photo-card'; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.alt = photo.title || '相簿照片';
            const source = new URL(photo.url_m); if (source.origin !== 'https://just-healing-production.up.railway.app' || !source.pathname.startsWith('/api/photo/')) throw new Error('照片來源尚未確認'); image.src = source.href;
            title.textContent = photo.title || (photo.media === 'video' ? '影片' : '照片'); download.type = 'button'; download.textContent = '下載原檔';
            download.addEventListener('click', async () => { download.disabled = true; try { await accounts.download(photo); message(accounts.status().native ? '已加入手機下載佇列，可到傳輸中心查看。' : '原檔已交由瀏覽器保存。'); } catch (error) { message(error.message); } finally { download.disabled = false; } });
            card.append(image, title, download); return card;
        }));
        $('photos-page').textContent = result.photoset.total ? `${page} / ${pages}` : ''; $('photos-previous').hidden = page <= 1; $('photos-next').hidden = page >= pages;
    }
    $('account-toggle').addEventListener('click', () => registrationMode(!registering));
    $('account-form').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); busy(form, true); message(registering ? '正在建立帳戶…' : '正在登入…'); try { await accounts.signIn({username:data.get('username'), password:data.get('password'), displayName:data.get('displayName'), register:registering,rememberDevice:data.get('rememberDevice')==='on'}); form.elements.password.value = ''; refreshIdentity(); await albums(); message('已登入。');returnToNext(); } catch (error) { message(error.message); } finally { busy(form, false); } });
    $('album-form').elements.birthDate.value = new Date().toLocaleDateString('en-CA');
    let albumCreateBusy=false,albumCreateAttempt=null;
    $('album-form').addEventListener('submit', async event => { event.preventDefault();if(albumCreateBusy)return;albumCreateBusy=true; const form = event.currentTarget, data = new FormData(form); busy(form, true); try { const result = await accounts.request('/api/accounts/albums', {method:'POST', body:{title:data.get('title'), birthDate:data.get('birthDate'),creationRequestId:(()=>{const signature=JSON.stringify([data.get('title'),data.get('birthDate')]);if(albumCreateAttempt?.signature!==signature)albumCreateAttempt={signature,id:crypto.randomUUID()};return albumCreateAttempt.id;})()}}); form.elements.title.value = '';albumCreateAttempt=null;await albums(); await photos(result.album, 1); message('相簿已建立。'); } catch (error) { message(error.message); } finally {albumCreateBusy=false;busy(form, false); } });
    $('photos-previous').addEventListener('click', () => { if (selected && page > 1) photos(selected, page - 1).catch(error => message(error.message)); });
    $('photos-next').addEventListener('click', () => { if (selected && page < pages) photos(selected, page + 1).catch(error => message(error.message)); });
    async function uploadSelected(files) { if (!selected) return; $('account-upload').disabled = true; try { message(accounts.status().native?'正在選取原檔…':'正在傳送，請保持此頁開啟…');const result = await accounts.upload(selected.id,files); message(`${result.native?'已加入手機佇列':'伺服器已收件'} ${result.accepted.length} 個；${result.errors.length ? result.errors.join('；') : '可到傳輸中心查看 Flickr 處理結果。'}`); } catch (error) { message(error.message); } finally { $('account-upload').disabled = false; } }
    const filePicker=document.createElement('input');filePicker.type='file';filePicker.multiple=true;filePicker.accept='image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime';filePicker.hidden=true;filePicker.id='account-upload-files';document.body.append(filePicker);
    $('account-upload').addEventListener('click',()=>{if(accounts.status().native)uploadSelected();else filePicker.click();});
    filePicker.addEventListener('change',()=>{const files=Array.from(filePicker.files);filePicker.value='';if(files.length)uploadSelected(files);});
    $('account-logout').addEventListener('click', async () => { $('account-logout').disabled = true; try { const result = await accounts.signOut(); refreshIdentity(); message(result.serverConfirmed ? '已登出。' : '已在此裝置登出；伺服器端登出尚未確認，請恢復連線後再確認。'); } catch (error) { message(error.message); } finally { $('account-logout').disabled = false; } });
    $('delete-account-form').addEventListener('submit', async event => { event.preventDefault(); if (!confirm('提出刪除帳戶及資料申請？送出後將停止登入與新傳輸。')) return; const form = event.currentTarget, password = form.elements.password.value; busy(form, true); try { const result = await accounts.request('/api/accounts/me', {method:'DELETE', body:{password}}); if (result.status !== 'deletion_requested' || !/^[A-Za-z0-9_-]{43}$/.test(result.deletionReceipt || '')) throw new Error('刪除申請尚未確認'); form.elements.password.value = ''; $('deletion-status-form').elements.receipt.value = result.deletionReceipt; $('deletion-status-panel').open = true; await accounts.signOut(); refreshIdentity(); message('刪除申請已送出，請保留查詢碼並查看進度。'); } catch (error) { message(error.message); } finally { busy(form, false); } });
    $('deletion-status-form').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; busy(form, true); try { const result = await accounts.deletionStatus(form.elements.receipt.value.trim()), labels = {requested:'已收到申請，等待清除。', waiting_upload:'上傳結果仍待核對，清除尚未完成。', waiting_provider:'照片清除尚未確認，服務會繼續重試。', erasing:'正在清除照片與帳戶資料。', scrubbing:'照片已移除，正在完成帳戶資料清除。', complete:'照片移除與帳戶清除已完成。'}; if (!labels[result.status] || (result.status === 'complete' && (result.remoteErasureComplete !== true || result.dataErasureComplete !== true))) throw new Error('刪除狀態尚未確認'); $('deletion-status-message').textContent = labels[result.status]; } catch (error) { $('deletion-status-message').textContent = error.message; } finally { busy(form, false); } });
    window.addEventListener('timehut-account-changed', refreshIdentity);
    if (location.hash === '#deletion-status-panel') $('deletion-status-panel').open = true;
    try { await accounts.ready; refreshIdentity(); if(accounts.status().unconfirmed)message('連線暫時未完成，登入狀態尚未確認。可稍後重試，原有資料會保留。');if (accounts.status().authenticated){if(!returnToNext())await albums();} } catch (error) { message('帳戶連線尚未確認，請稍後重新開啟。'); }
});
