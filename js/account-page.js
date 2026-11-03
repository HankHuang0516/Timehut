document.addEventListener('DOMContentLoaded', async () => {
    const accounts = window.TimehutAccounts, $ = id => document.getElementById(id);
    if($('remember-device-label'))$('remember-device-label').hidden=!!window.Capacitor?.isNativePlatform?.();
    const deletionIntent = new URLSearchParams(location.search).get('intent') === 'delete';
    let registering = false, selected = null, page = 1, pages = 1, viewGeneration = 0, albumListPage=1, albumListPages=1, albumListBusy=false;
    let recoveryLink=null;
    function openRecoveryLink(){
        const params=new URLSearchParams(location.hash.slice(1));
        if(!['verify','reset'].includes(params.get('action'))||!/^[A-Za-z0-9_-]{43}$/.test(params.get('token')||''))return;
        recoveryLink={kind:params.get('action'),token:params.get('token')};history.replaceState(null,'',location.pathname+location.search);
        $('recovery-link-panel').hidden=false;$('recovery-link-form').hidden=false;$('recovery-link-form').reset();$('recovery-link-message').textContent='';
        $('reset-password-fields').hidden=recoveryLink.kind!=='reset';for(const input of $('reset-password-fields').querySelectorAll('input'))input.required=recoveryLink.kind==='reset';
        $('recovery-link-title').textContent=recoveryLink.kind==='verify'?'驗證復原信箱':'重設密碼';$('recovery-link-submit').textContent=recoveryLink.kind==='verify'?'驗證信箱':'重設密碼';
    }
    openRecoveryLink();window.addEventListener('hashchange',openRecoveryLink);
    const moreAlbums=document.createElement('button');moreAlbums.type='button';moreAlbums.className='secondary';moreAlbums.textContent='載入更多相簿';moreAlbums.hidden=true;$('account-albums').after(moreAlbums);
    moreAlbums.addEventListener('click',()=>{if(!albumListBusy&&albumListPage<albumListPages)albums(albumListPage+1).catch(error=>message(error.message));});
    const message = (text,error=false) => {const target=$('account-message');target.textContent=text;target.dataset.state=error?'error':'info';target.setAttribute('role',error?'alert':'status');};
    function returnToNext(){const next=new URLSearchParams(location.search).get('next');if(!next)return false;const target=new URL(next,location.href),base=new URL('index.html',location.href).pathname.replace(/index\.html$/,'');if(target.origin===location.origin&&target.pathname===base+'golden.html'&&!target.hash&&[...target.searchParams.keys()].every(k=>k==='album')&&target.searchParams.getAll('album').length<=1&&(!target.searchParams.has('album')||/^[A-Za-z0-9_-]{1,128}$/.test(target.searchParams.get('album')))){location.replace(target.href);return true;}if(target.origin===location.origin&&target.pathname===base+'line-albums.html'&&!target.search&&!target.hash){location.replace(target.href);return true;}if(target.origin===location.origin&&(!target.hash||target.pathname===base+'memories.html'&&target.hash==='#exploration-settings')&&['index.html','timeline.html','album.html','search.html','settings.html','transfer.html','memories.html'].some(page=>target.pathname===base+page)){if(target.pathname===base+'index.html'&&!target.searchParams.has('album'))return false;location.replace(target.href);return true;}return false;}

    const entryRetry=document.createElement('button');entryRetry.type='button';entryRetry.className='secondary';entryRetry.textContent='重新開啟相簿';entryRetry.hidden=true;$('account-message').after(entryRetry);
    const connectRetry=document.createElement('button');connectRetry.type='button';connectRetry.className='secondary';connectRetry.textContent='重新連線';connectRetry.hidden=true;entryRetry.after(connectRetry);connectRetry.addEventListener('click',()=>location.reload());
    const nativeRecovery=document.createElement('button');nativeRecovery.type='button';nativeRecovery.className='secondary';nativeRecovery.textContent='更新登入狀態';nativeRecovery.hidden=true;connectRetry.after(nativeRecovery);
    let nativeRecoveryRequired=false,nativeRecoveryBusy=false,nativeSignInBusy=false;
    function updateNativeRecovery(){
        const state=accounts.status(),guestNative=state.native===true&&!state.authenticated;
        nativeRecovery.hidden=!guestNative;nativeRecovery.disabled=nativeRecoveryBusy||nativeSignInBusy;
        if(guestNative){$('account-submit').disabled=nativeRecoveryRequired||nativeRecoveryBusy||nativeSignInBusy;$('account-toggle').disabled=nativeRecoveryBusy||nativeSignInBusy;}
    }
    nativeRecovery.addEventListener('click',async()=>{
        if(nativeRecoveryBusy||nativeSignInBusy||accounts.status().authenticated||accounts.status().native!==true)return;
        $('account-form').elements.password.value = '';
        nativeRecoveryBusy=true;nativeRecoveryRequired=true;updateNativeRecovery();message('正在確認前次登入已取消…');
        try{
            const result=await accounts.signOut();
            if(accounts.status().authenticated)return;
            refreshIdentity();
            if(result?.signedOut===true&&result.serverConfirmed===true){nativeRecoveryRequired=false;message('前次登入已取消，可重新輸入帳號密碼登入。');}
            else message('前次登入仍待確認。請恢復連線後再按「更新登入狀態」；原有資料與待確認紀錄保留。',true);
        }catch(_){if(!accounts.status().authenticated)message('登入狀態仍待確認。請稍後再按「更新登入狀態」；原有資料與待確認紀錄保留。',true);}
        finally{nativeRecoveryBusy=false;updateNativeRecovery();}
    });
    let openingReading=false,pendingReadingAlbum=null;
    async function enterReading(preferredAlbumId){
        if(openingReading)return;if(preferredAlbumId)pendingReadingAlbum=preferredAlbumId;openingReading=true;document.body.classList.add('account-entry-opening');entryRetry.hidden=true;entryRetry.disabled=true;message('正在開啟你的相簿…');
        try{if(window.TimehutEntry)await TimehutEntry.openReading({requiredAlbumId:pendingReadingAlbum||undefined});else location.replace('index.html'+(pendingReadingAlbum?'?'+new URLSearchParams({album:pendingReadingAlbum}):''));}
        catch(error){message(accounts.status().authenticated?'你已登入，相簿暫時未能開啟。'+error.message:error.message,true);entryRetry.hidden=!accounts.status().authenticated;}
        finally{openingReading=false;entryRetry.disabled=false;}
    }
    entryRetry.addEventListener('click',()=>void enterReading());
    function shouldEnterReading(){return !deletionIntent&&!recoveryLink&&!['#create-album','#account-recovery','#account-password','#account-deletion','#deletion-status-panel'].includes(location.hash)&&new URLSearchParams(location.search).get('entry')!=='create'&&new URLSearchParams(location.search).get('manage')!=='1';}
    const busy = (form, enabled) => {form.querySelectorAll('input,button').forEach(control => { control.disabled = enabled; });if(form.id==='account-form')$('account-toggle').disabled=enabled;};
    function registrationMode(enabled) { enabled = enabled && !deletionIntent; registering = enabled; $('display-name-label').hidden = !enabled; $('adult-confirmation-label').hidden = !enabled; $('account-form').elements.adultConfirmed.required = enabled; $('account-form').elements.adultConfirmed.checked = false; $('account-form').elements.displayName.required = enabled; $('account-form').elements.password.autocomplete = enabled ? 'new-password' : 'current-password'; $('auth-title').textContent = enabled ? '建立我的帳戶' : deletionIntent ? '登入以刪除帳戶' : '登入我的相簿'; $('account-submit').textContent = enabled ? '建立帳戶' : deletionIntent ? '登入以管理刪除申請' : '登入，翻開相簿 →';if($('auth-caption'))$('auth-caption').textContent=enabled?'建立帳戶，收藏自己的成長時光。':'繼續翻閱，屬於你的成長時光。'; $('account-toggle').textContent = enabled ? '已有帳戶？前往登入' : '還沒有帳戶？建立帳戶'; $('account-toggle').hidden = deletionIntent; }
    function updateNameDisclosure() {
        const greeting = $('account-greeting'), details = $('account-name-details');
        details.hidden = $('account-home').hidden || greeting.scrollHeight <= greeting.clientHeight + 1;
        if (details.hidden) details.open = false;
    }
    if (window.ResizeObserver) new ResizeObserver(updateNameDisclosure).observe($('account-greeting'));
    window.addEventListener('resize', updateNameDisclosure);
    document.fonts?.ready.then(updateNameDisclosure);
    function refreshIdentity() {
        $('change-password-form')?.reset();
        $('recovery-email-form')?.reset();$('recovery-email-message').textContent='';$('change-password-message').textContent='';$('recovery-email-status').textContent='尚未設定復原信箱。';
        viewGeneration++;selected=null;albumListPage=1;albumListPages=1;moreAlbums.hidden=true;if($('account-open-timeline'))$('account-open-timeline').hidden=true;if($('account-manage-albums'))$('account-manage-albums').href='settings.html#albums'; $('account-photos').replaceChildren(); $('account-albums').replaceChildren();
        $('selected-album').textContent = '選擇相簿'; $('photos-page').textContent = ''; $('photos-previous').hidden = true; $('photos-next').hidden = true; $('account-upload').hidden = true; $('account-upload-note').hidden = true;
        entryRetry.hidden=true;pendingReadingAlbum=null;const state = accounts.status();
        const guest=!state.authenticated;document.body.classList.toggle('is-authenticated',state.authenticated);document.body.classList.remove('account-entry-pending');document.body.classList.toggle('account-entry-auth',guest);document.body.classList.toggle('account-entry-native',!!state.native);
        document.body.classList.toggle('account-entry-onboarding',new URLSearchParams(location.search).get('entry')==='create');
        if($('account-entry-top'))$('account-entry-top').hidden=!guest;if($('account-entry-layout'))$('account-entry-layout').hidden=!guest||state.unconfirmed===true;if($('account-entry-loading'))$('account-entry-loading').hidden=true;
        connectRetry.hidden=state.unconfirmed!==true;
 $('account-auth').hidden = state.authenticated; $('account-home').hidden = !state.authenticated;
        if(state.authenticated)refreshRecovery(state.user.id,state.generation);
        if (!state.authenticated) registrationMode(false);
        $('account-greeting').textContent = state.user ? state.user.displayName : '我的相簿'; $('account-greeting').title=$('account-greeting').textContent;
        $('account-full-name').textContent = state.authenticated ? $('account-greeting').textContent : '';
        $('account-name-details').open = false;
        requestAnimationFrame(updateNameDisclosure);
        if(state.authenticated&&['#account-recovery','#account-password','#account-deletion'].includes(location.hash)){const panel=document.querySelector(location.hash);if(panel){panel.open=true;requestAnimationFrame(()=>panel.scrollIntoView({block:'start'}));}}
        if(state.authenticated)nativeRecoveryRequired=false;updateNativeRecovery();
        if (deletionIntent && state.authenticated) { const panel = $('account-deletion'); panel.open = true; requestAnimationFrame(() => panel.scrollIntoView({block:'start'})); }
    }
    async function refreshRecovery(owner,generation){
        try{const result=await accounts.recoveryEmail();if(accounts.status().user?.id!==owner||accounts.status().generation!==generation)return;$('recovery-email-status').textContent=result.verified?'已驗證：'+result.email:result.configured?'尚未設定復原信箱。':'寄信服務暫時無法使用，請稍後重試。';}
        catch(_){if(accounts.status().user?.id===owner&&accounts.status().generation===generation)$('recovery-email-status').textContent='復原信箱尚未讀取，請稍後重新開啟。';}
    }
    async function albums(requestedPage=1) {
        const authority = viewGeneration;albumListBusy=true;moreAlbums.disabled=true;let result;try{result=await accounts.request('/api/accounts/albums?page='+requestedPage+'&per_page=30');}finally{albumListBusy=false;moreAlbums.disabled=false;}if(authority!==viewGeneration)return;albumListPage=Number(result.page)||1;albumListPages=Number(result.pages)||1;moreAlbums.hidden=albumListPage>=albumListPages;
        if(requestedPage===1)$('account-albums').replaceChildren();
        $('account-albums').append(...result.albums.map(album => { const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.textContent = album.title; button.dataset.album = album.id; button.addEventListener('click', () => void enterReading(album.id)); return button; }));
        $('album-empty').textContent = result.albums.length ? '選擇一本相簿，查看收藏的回憶。' : '建立第一本相簿，開始收藏回憶。';
    }
    $('account-toggle').addEventListener('click', () => registrationMode(!registering));
    $('entry-forgot-link')?.addEventListener('click',()=>{const panel=$('forgot-password');panel.open=true;panel.querySelector('input[name=username]').value=$('account-form').elements.username.value;panel.scrollIntoView({block:'center'});panel.querySelector('input[name=username]').focus({preventScroll:true});});
    $('account-password-eye')?.addEventListener('click',()=>{const input=$('account-form').elements.password,button=$('account-password-eye');input.type=input.type==='password'?'text':'password';button.setAttribute('aria-label',input.type==='password'?'顯示密碼':'隱藏密碼');button.setAttribute('aria-pressed',String(input.type==='text'));});
    $('account-form').addEventListener('submit', async event => { event.preventDefault();if(nativeRecoveryBusy||nativeSignInBusy){message(nativeRecoveryBusy?'正在確認登入狀態，請稍候。':'登入正在處理，請稍候。');return;}if(nativeRecoveryRequired){message('請先按「更新登入狀態」確認前次登入已取消。',true);return;}nativeSignInBusy=true;updateNativeRecovery(); const form = event.currentTarget, data = new FormData(form); busy(form, true); message(registering ? '正在建立帳戶…' : '正在登入…'); try { await accounts.signIn({username:data.get('username'), password:data.get('password'), displayName:data.get('displayName'), register:registering,adultConfirmed:data.get('adultConfirmed')==='on',rememberDevice:data.get('rememberDevice')==='on'}); form.elements.password.value = ''; refreshIdentity();if(returnToNext())return;if(shouldEnterReading()){await enterReading();return;}await albums();message('已登入。'); } catch (error) {if(accounts.status().native===true){nativeRecoveryRequired=true;form.elements.password.value='';}message(error.message,true); } finally {nativeSignInBusy=false;busy(form, false);updateNativeRecovery(); } });
    $('album-form').elements.birthDate.value = new Date().toLocaleDateString('en-CA');
    let albumCreateBusy=false,albumCreateAttempt=null;
    $('album-form').addEventListener('submit', async event => { event.preventDefault();if(albumCreateBusy)return;albumCreateBusy=true; const form = event.currentTarget, data = new FormData(form); busy(form, true); try { const result = await accounts.request('/api/accounts/albums', {method:'POST', body:{title:data.get('title'), birthDate:data.get('birthDate'),creationRequestId:(()=>{const signature=JSON.stringify([data.get('title'),data.get('birthDate')]);if(albumCreateAttempt?.signature!==signature)albumCreateAttempt={signature,id:crypto.randomUUID()};return albumCreateAttempt.id;})()}});if(!result.album||typeof result.album.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(result.album.id))throw new Error('建立結果尚未確認，請保留原資料並重新連線。'); form.elements.title.value = '';albumCreateAttempt=null;await enterReading(result.album.id);return; } catch (error) { message(error.message,true); } finally {albumCreateBusy=false;busy(form, false); } });
    $('change-password-form').addEventListener('submit', async event => {
        event.preventDefault();const form=event.currentTarget,feedback=$('change-password-message'),owner=accounts.status().user?.id,authority=viewGeneration;
        if(form.elements.newPassword.value!==form.elements.confirmPassword.value){feedback.textContent='兩次新密碼不一致，請重新確認。';return;}
        busy(form,true);feedback.textContent='正在修改密碼…';
        try{await accounts.changePassword(form.elements.currentPassword.value,form.elements.newPassword.value);form.reset();if(!accounts.status().authenticated){refreshIdentity();message('密碼已修改，請用新密碼重新登入。');}}
        catch(error){if(accounts.status().authenticated&&(viewGeneration!==authority||accounts.status().user?.id!==owner))return;feedback.textContent='修改結果尚未確認，請檢查目前密碼及連線；若連線曾中斷，請先用新密碼登入確認。';if(!accounts.status().authenticated){const text=feedback.textContent;refreshIdentity();message(text);}}
        finally{busy(form,false);}
    });
    $('recovery-email-form').addEventListener('submit',async event=>{
        event.preventDefault();const form=event.currentTarget,owner=accounts.status().user?.id,generation=accounts.status().generation;busy(form,true);$('recovery-email-message').textContent='正在寄送驗證信…';
        try{const result=await accounts.bindRecoveryEmail(form.elements.email.value,form.elements.password.value);if(accounts.status().user?.id!==owner||accounts.status().generation!==generation)return;if(result.verificationRequested!==true)throw new Error('驗證信寄送尚未確認');form.elements.password.value='';$('recovery-email-message').textContent='驗證信已交由寄信服務處理，請查看郵件並開啟連結。完成驗證前不會變更復原信箱。';}
        catch(_){if(accounts.status().user?.id===owner&&accounts.status().generation===generation)$('recovery-email-message').textContent='寄送結果尚未確認，請確認目前密碼與信箱，並稍後查看收件匣或垃圾郵件。';}
        finally{busy(form,false);}
    });
    $('forgot-password-form').addEventListener('submit',async event=>{
        event.preventDefault();const form=event.currentTarget;busy(form,true);
        try{const result=await accounts.recoveryAction('forgot',{username:form.elements.username.value});if(result.resetRequested!==true)throw new Error();$('forgot-password-message').textContent='若此帳號已綁定驗證信箱，將寄出重設連結。請查看收件匣與垃圾郵件；若未設定復原信箱，無法透過郵件重設，請查看上方帳戶協助。請勿提供密碼或私人照片。';}
        catch(_){$('forgot-password-message').textContent='寄送結果尚未確認，請稍後查看郵件或再試一次。';}finally{busy(form,false);}
    });
    $('recovery-link-form').addEventListener('submit',async event=>{
        event.preventDefault();if(!recoveryLink)return;const form=event.currentTarget,kind=recoveryLink.kind;
        if(kind==='reset'&&form.elements.newPassword.value!==form.elements.confirmPassword.value){$('recovery-link-message').textContent='兩次新密碼不一致，請重新確認。';return;}
        busy(form,true);
        try{const result=await accounts.recoveryAction(kind,{token:recoveryLink.token,...(kind==='reset'?{newPassword:form.elements.newPassword.value}:{})});if(kind==='verify'?result.emailVerified!==true:result.passwordReset!==true||result.signInRequired!==true)throw new Error();recoveryLink=null;form.reset();form.hidden=true;$('recovery-link-message').textContent=kind==='verify'?'復原信箱已驗證。':'密碼已重設，請用新密碼登入原帳號。';if(accounts.status().authenticated)refreshRecovery(accounts.status().user.id,accounts.status().generation);}
        catch(_){$('recovery-link-message').textContent='結果尚未確認；連結可能已使用或逾期。若重設時曾中斷，請先用新密碼登入確認；需要時可重新申請連結。';}finally{busy(form,false);}
    });
    $('account-logout').addEventListener('click', async () => { $('account-logout').disabled = true; try { const result = await accounts.signOut(); refreshIdentity(); message(result.serverConfirmed ? '已登出。' : '已在此裝置登出；伺服器端登出尚未確認，請恢復連線後再確認。'); } catch (error) { message(error.message,true); } finally { $('account-logout').disabled = false; } });
    $('delete-account-form').addEventListener('submit', async event => { event.preventDefault(); const form=event.currentTarget; if(!await TimehutDialogs.confirm('提出刪除帳戶及資料申請？送出後將停止登入與新傳輸。照片移除與進度請依申請收據核對。',{title:'刪除帳戶與資料',confirmText:'提出刪除申請',danger:true}))return;const password=form.elements.password.value; busy(form, true); try { const result = await accounts.request('/api/accounts/me', {method:'DELETE', body:{password}}); if (result.status !== 'deletion_requested' || !/^[A-Za-z0-9_-]{43}$/.test(result.deletionReceipt || '')) throw new Error('刪除申請尚未確認'); form.elements.password.value = ''; $('deletion-status-form').elements.receipt.value = result.deletionReceipt; $('deletion-status-panel').open = true; await accounts.signOut(); refreshIdentity(); message('刪除申請已送出，請保留查詢碼並查看進度。'); } catch (error) { message(error.message,true); } finally { busy(form, false); } });
    $('deletion-status-form').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; busy(form, true); try { const result = await accounts.deletionStatus(form.elements.receipt.value.trim()), labels = {requested:'已收到申請，等待清除。', waiting_upload:'上傳結果仍待核對，清除尚未完成。', waiting_provider:'照片清除尚未確認，服務會繼續重試。', erasing:'正在清除照片與帳戶資料。', scrubbing:'照片已移除，正在完成帳戶資料清除。', complete:'照片移除與帳戶清除已完成。'}; if (!labels[result.status] || (result.status === 'complete' && (result.remoteErasureComplete !== true || result.dataErasureComplete !== true))) throw new Error('刪除狀態尚未確認'); $('deletion-status-message').textContent = labels[result.status]; } catch (error) { $('deletion-status-message').textContent = error.message; } finally { busy(form, false); } });
    window.addEventListener('timehut-account-changed', refreshIdentity);
    if (location.hash === '#deletion-status-panel') $('deletion-status-panel').open = true;
    try { await accounts.ready; refreshIdentity(); if(accounts.status().unconfirmed)message('連線暫時未完成，登入狀態尚未確認。可稍後重試，原有資料會保留。');if (accounts.status().authenticated){if(!returnToNext()){if(new URLSearchParams(location.search).has('next')&&shouldEnterReading())await enterReading();else await albums();}} } catch (error) {document.body.classList.remove('account-entry-pending');document.body.classList.add('account-entry-auth');if($('account-entry-loading'))$('account-entry-loading').hidden=true;if($('account-entry-top'))$('account-entry-top').hidden=false;if($('account-entry-layout'))$('account-entry-layout').hidden=true;connectRetry.hidden=false;message('帳戶連線尚未確認，請稍後重新開啟。',true);}
});
