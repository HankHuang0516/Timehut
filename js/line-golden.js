/* Hank1028: Entire golden setup stays in the App's authenticated WebView. */
/* Hank1030: The selected photos now define this album's reference person. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),root='/api/accounts/line-albums/golden',origin='https://just-healing-production.up.railway.app';
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 let initialized=false,starting=false;
 let authority=null,alive=true,busy=false,blocked=false,album='',revision=0,page=1,pages=1,epoch=0,savedEnabled=false;
 let selected=new Set(),saved=[],photos=new Map(),albums=new Map();
 const message=t=>{$('golden-status').textContent=t;};
 function check(e=epoch){const s=TimehutAccounts.status();if(!authority||!alive||e!==epoch||s.user?.id!==authority.owner||s.generation!==authority.generation)throw Error('帳戶或相簿已變更，請重新開啟。');}
 async function api(suffix='',options={}){const e=epoch;check(e);const v=await TimehutAccounts.request(root+suffix,{...options,expectedAuthority:authority});check(e);return v;}
 const dirty=()=>JSON.stringify([...selected])!==JSON.stringify(saved),changed=()=>dirty();
 function previewSource(photo,source){const u=new URL(source),backend=new URL(TimehutAccounts.status().backend||origin);if(!/^\d{1,32}$/.test(photo.id)||u.protocol!==backend.protocol||u.origin!==backend.origin||u.username||u.password||u.hash||u.pathname!=='/api/photo/'+photo.id+'/image'||u.searchParams.getAll('size').length!==1||!['m','s','sq','t'].includes(u.searchParams.get('size'))||u.searchParams.getAll('ticket').length!==1||!u.searchParams.get('ticket')||[...u.searchParams.keys()].some(k=>!['size','ticket'].includes(k)))throw Error('照片連結未確認');return u.href;}
 const previews=TimehutGoldenPhotoPreviews.create({isCurrent:()=>{try{check();return true;}catch(_){return false;}},validate:previewSource,refresh:async photo=>{
  const e=epoch;check(e);const v=await TimehutAccounts.request('/api/photo/'+photo.id+'/sizes',{expectedAuthority:authority});check(e);
  if(v?.stat!=='ok'||!Array.isArray(v.sizes?.size)||v.sizes.size.length>100)throw Error('照片連結未確認');
  const rows=v.sizes.size.filter(r=>r&&r.media!=='video').map(r=>{try{return previewSource(photo,r.source);}catch(_){return null;}}).filter(Boolean);
  const ordered=['m','s','sq','t'].map(size=>rows.find(url=>new URL(url).searchParams.get('size')===size)).filter(Boolean);if(!ordered.length)throw Error('照片尚無法使用');return ordered;
 }});
 function preview(parent,photo,group,input=null){const host=node('span');host.className='golden-preview';const status=node('span','照片載入中…');status.className='golden-preview-status';host.append(status);const retry=node('button','重新載入照片');retry.type='button';retry.className='golden-preview-retry';retry.hidden=true;retry.setAttribute('aria-label','重新載入照片 '+photo.id);parent.append(host);return {host,status,retry,bind:()=>previews.add(host,photo,{group,status,retry,priority:group==='selected',onState:value=>{if(input)input.disabled=value!=='loaded';}})};}
 const ask=(text,options={})=>TimehutDialogs.confirm(text,{title:'尚未儲存的變更',confirmText:'放棄變更',...options});
 function image(photo){const u=new URL(photo.url_m);const backend=new URL(TimehutAccounts.status().backend||origin);if(!/^\d{1,32}$/.test(photo.id)||u.origin!==backend.origin||u.pathname!=='/api/photo/'+photo.id+'/image'||u.searchParams.get('size')!=='m'||!u.searchParams.has('ticket'))throw Error('照片連結未確認，請重新讀取。');return u.href;}
 function controls(){const enabled=alive&&!busy&&!starting&&!blocked&&!!album;$('golden-controls').disabled=!enabled;$('golden-refresh').disabled=busy||starting;$('golden-album').disabled=busy||starting||blocked;
  $('golden-prev').disabled=page<=1||busy;$('golden-next').disabled=page>=pages||busy;
  $('golden-save').disabled=!enabled||selected.size<3||selected.size>5||!changed();
  $('golden-disable').hidden=!savedEnabled;$('golden-count').textContent=`已選 ${selected.size} / 5 張`;
  $('golden-hint').textContent=selected.size<3?`還需選擇 ${3-selected.size} 張`:selected.size>5?'最多選擇 5 張':!changed()?'參考人物已儲存':'可以儲存這位參考人物';
 }
 function selection(){const list=$('golden-selected');previews.removeGroup('selected');list.replaceChildren();
  for(const id of selected){const item=node('div');item.className='golden-selected-item';const p=photos.get(id);
   let view;if(p){view=preview(item,p,'selected');item.append(view.retry);}else{const missing=node('span','照片尚未載入');missing.className='golden-missing';item.append(missing);}
   const remove=node('button','取消選取');remove.type='button';remove.setAttribute('aria-label','取消參考照片 '+id);remove.onclick=()=>toggle(id,false);item.append(remove);list.append(item);view?.bind();
  }
  if(!selected.size)list.append(node('p','從下方相簿勾選至少 3 張照片。'));
  for(const input of $('golden-grid').querySelectorAll('input'))input.checked=selected.has(input.value);controls();
 }
 function toggle(id,on){if(busy||blocked||!alive)return;if(on&&selected.size>=5){message('最多選擇 5 張，請先取消一張再更換。');selection();return;}
  if(on)selected.add(id);else selected.delete(id);selection();message(selected.size<3?`已選 ${selected.size} 張，至少還需 ${3-selected.size} 張。`:'選好後即可儲存參考人物。');
 }
 async function grid(){const v=await api('/'+album+'/photos?page='+page),set=v.photoset;
  if(set?.id!==album||Number(set.page)!==page||!Array.isArray(set.photo)||set.photo.length>30||!Number.isSafeInteger(Number(set.pages))||Number(set.pages)<1)throw Error('相簿照片尚未完整，請重新讀取。');pages=Number(set.pages);
  const ids=new Set();for(const p of set.photo){if(ids.has(p.id)||p.media==='video')throw Error('照片頁面格式無效。');ids.add(p.id);image(p);photos.set(p.id,p);}
  previews.removeGroup('grid');$('golden-grid').replaceChildren();
  for(const p of set.photo){const card=node('div');card.className='golden-photo';const label=node('label');label.className='golden-photo-choice';
   const input=node('input');input.type='checkbox';input.value=p.id;input.checked=selected.has(p.id);input.disabled=true;input.setAttribute('aria-label','選取照片 '+p.id);input.onchange=()=>toggle(p.id,input.checked);label.append(input);const view=preview(label,p,'grid',input);card.append(label,view.retry);$('golden-grid').append(card);view.bind();
  }
  if(!set.photo.length)$('golden-grid').append(node('p','這一頁沒有可選照片。'));$('golden-page').textContent=`第 ${page} / ${pages} 頁`;selection();
 }
 async function task(fn,{read=false}={}){if(busy||!alive||blocked&&!read)return;busy=true;controls();try{await fn();}catch(e){if(alive){blocked=true;const detail=typeof e.message==='string'&&/[\u3400-\u9fff]/.test(e.message)?e.message:'連線暫時未完成，結果尚未確認。';message(detail+' 請重新讀取確認，不會自動重送。');$('golden-refresh').hidden=false;}}finally{busy=false;controls();}}
 async function profile(){const v=await api('/'+album);
  if(v.schema!==1||v.albumId!==album||!Number.isSafeInteger(v.revision)||!Array.isArray(v.photoIds)||v.photoIds.length>5||v.photoIds.some(id=>typeof id!=='string'||!/^\d{1,32}$/.test(id))||new Set(v.photoIds).size!==v.photoIds.length||v.minimum!==3||v.maximum!==5)throw Error('參考照片設定尚未完整。');
  revision=v.revision;savedEnabled=v.enabled===true;saved=[...v.photoIds];selected=new Set(saved);photos.clear();for(const p of v.referencePhotos||[]){image(p);photos.set(p.id,p);}
  $('golden-saved-state').textContent=savedEnabled?`已儲存參考人物（${saved.length} 張照片）`:'尚未設定參考人物';
  if(v.referencesAvailable===false)message('部分參考照片已無法使用，請取消或更換後儲存。');else message(savedEnabled?'可以繼續更換參考人物的照片，或返回 LINE 設定。':'請勾選至少 3 張有同一位目標人物的照片，最好是臉部清楚的單人照。');
 }
 async function loadAlbum(){epoch++;previews.clear();photos.clear();selected.clear();saved=[];revision=0;page=1;pages=1;savedEnabled=false;blocked=false;album=$('golden-album').value;$('golden-grid').replaceChildren();$('golden-selected').replaceChildren();if(!album){message('目前還沒有可設定的相簿，請先在 App 建立相簿。');controls();return;}await task(async()=>{await profile();await grid();});}
 $('golden-album').onchange=async()=>{if(dirty()&&!await ask('這次選取尚未儲存，切換相簿會放棄變更。仍要切換嗎？')){$('golden-album').value=album;return;}void loadAlbum();};
 $('golden-prev').onclick=()=>{if(page<=1)return;void task(async()=>{page--;await grid();});};$('golden-next').onclick=()=>{if(page>=pages)return;void task(async()=>{page++;await grid();});};
 $('golden-refresh').onclick=async()=>{if(!initialized){if(!authority){location.reload();return;}blocked=false;return initialize();}if(dirty()&&!blocked&&!await ask('重新讀取會放棄尚未儲存的選取，繼續嗎？'))return;blocked=false;void task(async()=>{await profile();await grid();$('golden-refresh').hidden=true;},{read:true});};
 $('golden-save').onclick=()=>{if(selected.size<3||selected.size>5||!changed())return;void task(async()=>{
  const ids=[...selected],v=await api('/'+album,{method:'PUT',body:{photoIds:ids,expectedRevision:revision}});
  if(v.albumId!==album||v.revision!==revision+1||v.enabled!==true||JSON.stringify(v.photoIds)!==JSON.stringify(ids))throw Error('儲存結果未確認。');
  saved=ids;revision=v.revision;savedEnabled=true;message('參考人物已儲存。');location.assign('line-albums.html#line-golden');
 });};
 $('golden-disable').onclick=async()=>{if(!savedEnabled||!await ask('停用這本相簿的參考人物？原相簿照片會保留。',{title:'停用參考人物',confirmText:'停用參考人物',danger:true}))return;void task(async()=>{const v=await api('/'+album,{method:'DELETE',body:{expectedRevision:revision}});if(v.albumId!==album||v.enabled!==false||v.revision!==revision+1)throw Error('停用結果未確認。');saved=[];selected.clear();revision=v.revision;savedEnabled=false;$('golden-saved-state').textContent='參考人物已停用';selection();message('已停用參考人物，原相簿照片仍保留。');});};
 $('golden-back').onclick=async e=>{if(!dirty())return;e.preventDefault();if(await ask('尚未儲存這次選取，要返回 LINE 設定嗎？')&&alive)location.assign('line-albums.html#line-golden');};
 function retire(){alive=false;epoch++;previews.retire();selected.clear();saved=[];photos.clear();albums.clear();$('golden-grid').replaceChildren();$('golden-selected').replaceChildren();$('golden-album').replaceChildren();$('golden-saved-state').textContent='';message('帳戶已變更，請重新開啟設定。');controls();}
 window.addEventListener('timehut-account-changed',()=>{if(authority)retire();});window.addEventListener('pagehide',retire,{once:true});window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
 async function initialize(){if(starting||!alive)return;starting=true;controls();try{
  await TimehutAccounts.ready;const s=TimehutAccounts.status();if(s.unconfirmed)throw Error('登入狀態尚未確認。');
  if(!s.native&&location.origin!==origin&&!['localhost','127.0.0.1'].includes(location.hostname)){location.replace(origin+'/app/golden.html'+location.search);return;}
  if(!s.authenticated){location.replace('account.html?next='+encodeURIComponent('golden.html'+location.search));return;}
  authority={owner:s.user.id,generation:s.generation};albums.clear();photos.clear();$('golden-album').replaceChildren();let p=1,last=1;
  do{const v=await TimehutAccounts.request('/api/accounts/albums?page='+p+'&per_page=30',{expectedAuthority:authority});check();if(!Array.isArray(v.albums)||!Number.isSafeInteger(v.pages)||v.pages<p||v.pages>100)throw Error('相簿清單未確認。');for(const a of v.albums){if(!/^[A-Za-z0-9_-]{1,128}$/.test(a.id)||albums.has(a.id))throw Error('相簿清單無效。');albums.set(a.id,a);const option=node('option',a.title);option.value=a.id;$('golden-album').append(option);}last=v.pages;p++;}while(p<=last);
  const wanted=new URLSearchParams(location.search).get('album');if(albums.has(wanted))$('golden-album').value=wanted;initialized=true;starting=false;await loadAlbum();
 }catch(e){if(alive){blocked=true;message(e.message||'無法讀取參考人物設定。');$('golden-refresh').hidden=false;}}finally{starting=false;controls();}}
 document.addEventListener('DOMContentLoaded',()=>initialize());
})();
