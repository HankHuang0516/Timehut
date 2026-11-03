'use strict';
(() => {
 const $=id=>document.getElementById(id),key='timehut-line-entry-v1',origin='https://just-healing-production.up.railway.app';
 const incoming=new URL(location.href);let entry=null,alive=true,busy=false,unknown=false,state=null,authority=null;
 let albums=new Map(),selected=new Set(),pollTimer=null,mutating=false;
 const presentation=window.TimehutLineItemStatus;
 for(const [parameter,kind] of [['lineTicket','ticket'],['groupLink','code']]){const value=incoming.searchParams.get(parameter);if(value&&/^[A-Za-z0-9_-]{43}$/.test(value))entry={kind,value,expires:Date.now()+600000};incoming.searchParams.delete(parameter);}
 history.replaceState(null,'',incoming.pathname+incoming.search+(incoming.hash==='#line-golden'?'#line-golden':''));
 try{if(entry)sessionStorage.setItem(key,JSON.stringify(entry));else{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved&&['ticket','code'].includes(saved.kind)&&/^[A-Za-z0-9_-]{43}$/.test(saved.value)&&saved.expires>Date.now())entry=saved;else sessionStorage.removeItem(key);}}catch(_){}
 const text=value=>{$('line-status').textContent=value;},node=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n;};
 if(document.querySelector('main')?.dataset.lineSchema!=='5'||!$('line-albums')||!$('line-items')||!presentation){if($('line-controls'))$('line-controls').disabled=true;text('收件頁面版本尚未一致，請重新載入頁面。');$('line-refresh').onclick=()=>location.reload();return;}
 const actor=()=>{const s=TimehutAccounts.status();return s.authenticated&&!s.unconfirmed?s.user?.id:null;};
 function check(){const s=TimehutAccounts.status();if(!alive||actor()!==authority?.owner||s.generation!==authority.generation)throw Error('帳戶已變更，請重新開啟設定。');}
 async function api(path='',options={}){check();const result=await TimehutAccounts.request('/api/accounts/line-albums'+path,{...options,expectedAuthority:authority});check();return result;}
 function forget(){entry=null;try{sessionStorage.removeItem(key);}catch(_){}}
 function controls(){const enabled=alive&&!mutating&&!unknown&&!!state;$('line-controls').disabled=!enabled;$('line-refresh').disabled=busy;$('line-link').hidden=entry?.kind!=='ticket'||state?.linked;$('line-group').hidden=entry?.kind!=='code';$('line-direct').hidden=entry?.kind==='code';for(const b of $('line-controls').querySelectorAll('button'))b.disabled=!enabled||busy;$('line-direct').disabled=!enabled||busy||!state?.linked;$('line-unlink').disabled=!enabled||busy||!state?.linked;for(const b of $('line-groups').querySelectorAll('button'))b.disabled=!enabled||busy;}
 function names(ids){return ids.map(id=>albums.get(id)?.title||'已無法存取的相簿').join('、');}
 function choices(){
  const list=$('line-albums'),filter=$('line-album-filter').value.trim().toLocaleLowerCase();list.replaceChildren();
  for(const [id,album] of albums){if(filter&&!album.title.toLocaleLowerCase().includes(filter))continue;const label=node('label','');label.className='album-choice';const input=document.createElement('input');input.type='checkbox';input.value=id;input.checked=selected.has(id);input.addEventListener('change',()=>{if(input.checked){if(selected.size>=100){input.checked=false;text('最多選擇100本相簿。');return;}selected.add(id);}else selected.delete(id);selectionCount();});label.append(input,node('span',album.title));list.append(label);}
  if(!list.children.length)list.append(node('p',albums.size?'沒有符合的相簿。':'請先建立一本相簿，再啟用收件。'));selectionCount();
 }
 function selectionCount(){$('line-selection-count').textContent=`已選 ${selected.size} 本相簿。每則媒體只下載一份，由背景服務辨識後放入符合的相簿。`;}
 function validIds(ids){if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Error('收件相簿設定尚未完整，請重新讀取。');return ids;}
 function renderItems(next){
  const imports=new Map(next.imports.map(row=>[row.id,row]));
  const list=$('line-items'),fragment=document.createDocumentFragment();
  for(const item of next.items){
   validIds(item.albumIds);
   const progress=presentation.describe(item,{importRow:imports.get(item.id),albums});
   const row=node('li','');row.className='line-item';row.dataset.stage=progress.stage;
   const heading=node('div','');heading.className='line-item-heading';
   const kind=node('span',item.media==='video'?'影片':'照片');kind.className='line-item-kind';
   const time=node('time',new Date(item.createdAt).toLocaleString()+' · '+(item.sourceType==='group'?'群組':'私訊'));
   heading.append(kind,time);
   const status=node('p',progress.text);status.className='line-item-status';
   row.append(heading,status);
   if(progress.detail){const detail=node('p',progress.detail);detail.className='line-item-detail';row.append(detail);}
   fragment.append(row);
  }
  if(!next.items.length){const empty=node('li','尚未收到照片。傳送照片給 bot 後，處理進度會顯示在這裡。');empty.className='line-empty';fragment.append(empty);}
  list.replaceChildren(fragment);
  $('line-automation').textContent=presentation.automationText(next.automation);
  $('line-updated').textContent='最近 '+next.items.length+' 筆 · 更新於 '+new Date().toLocaleTimeString()+' · 自動更新中';
 }
 async function load({preserveForm=false}={}){
  const next=await api();if(next.schemaVersion!==5)throw Error('多相簿服務版本尚未一致，請重新載入頁面。');validIds(next.directAlbumIds);if(!Array.isArray(next.groups))throw Error('群組設定尚未完整。');for(const g of next.groups)validIds(g.albumIds);
  if(!Array.isArray(next.imports)||!Array.isArray(next.items)||next.items.length>100)throw Error('收件處理紀錄尚未確認。');state=next;if(next.linked&&entry?.kind==='ticket')forget();
  $('line-linked').textContent=next.linked?'LINE 帳號已連結，可直接更新收件相簿。':'尚未連結 LINE 帳號，請先私訊 bot「綁定」。';
  $('line-current').textContent=next.directAlbumIds.length?'目前私訊目的相簿：'+names(next.directAlbumIds):'私訊收件尚未啟用。';
  if(!preserveForm||!$('line-albums').children.length){selected=new Set(entry?.kind==='code'?[]:next.directAlbumIds.filter(id=>albums.has(id)));$('line-album-filter').value='';choices();}
  const groups=$('line-groups');groups.replaceChildren();for(const group of next.groups){const row=node('p','群組 …'+group.id.slice(-6)+' → '+names(group.albumIds)),stop=node('button','停止此群組收件');stop.type='button';stop.onclick=()=>mutate(()=>api('/groups/'+encodeURIComponent(group.id),{method:'DELETE'}),'已停止此群組收件。');row.append(stop);groups.append(row);}if(!next.groups.length)groups.append(node('p','尚未啟用任何群組。'));
  renderItems(next);
  text(entry?.kind==='code'?'請勾選這個群組要開放的相簿，再確認用途。':'收件狀態已更新。辨識與上傳由背景服務接續處理。');
 }
 function schedule(){clearTimeout(pollTimer);if(alive&&authority&&document.visibilityState!=='hidden'&&navigator.onLine!==false)pollTimer=setTimeout(()=>refresh({preserveForm:true}),5000);}
 async function refresh({preserveForm=false}={}){if(busy||!alive){schedule();return;}clearTimeout(pollTimer);busy=true;controls();try{await load({preserveForm});unknown=false;}catch(e){if(alive){unknown=true;text((e.message||'狀態未確認')+' 以下為上次取得的狀態，請稍後重新讀取。');$('line-updated').textContent='連線尚未確認 · 目前顯示上次取得的狀態';}}finally{busy=false;controls();schedule();}}
 async function mutate(task,message){if(busy||unknown||!alive)return;clearTimeout(pollTimer);busy=true;mutating=true;controls();try{await task();check();await load();if(message)text(message);}catch(e){if(alive){unknown=true;text((e.message||'操作未確認')+' 請先重新讀取狀態，不會自動重送。');}}finally{busy=false;mutating=false;controls();schedule();}}
 function albumIds(){const ids=[...selected].sort();if(!ids.length)throw Error('請至少勾選一本相簿。');return ids;}
 $('line-link').onclick=()=>mutate(async()=>{if(entry?.kind!=='ticket')throw Error('連結已失效，請回 LINE 重新發起。');const ticket=entry.value;forget();const result=await api('/link',{method:'POST',body:{ticket}}),url=new URL(result.redirect);if(url.origin!=='https://access.line.me'||url.pathname!=='/dialog/bot/accountLink'||url.username||url.password)throw Error('無法確認 LINE 連結。');check();location.assign(url.href);});
 $('line-direct').onclick=()=>mutate(()=>{return api('/album',{method:'PUT',body:{albumIds:albumIds(),expectedSince:state.directSince,expectedAlbumIds:state.directAlbumIds}});},'私訊的多相簿收件設定已儲存。');
 $('line-group').onclick=()=>mutate(()=>{const ids=albumIds();if(entry?.kind!=='code')throw Error('群組連結已失效，請重新發起。');const code=entry.value;forget();return api('/groups',{method:'POST',body:{albumIds:ids,code}});},'此群組的多相簿收件設定已儲存。');
 $('line-unlink').onclick=()=>mutate(()=>api('',{method:'DELETE'}),'已解除 LINE 連結。');$('line-refresh').onclick=()=>authority?refresh({preserveForm:true}):location.reload();$('line-album-filter').addEventListener('input',choices);
 function retire(clearEntry){alive=false;clearTimeout(pollTimer);state=null;albums.clear();selected.clear();if(clearEntry)forget();$('line-album-filter').value='';$('line-linked').textContent='';$('line-current').textContent='';$('line-albums').replaceChildren();$('line-selection-count').textContent='';$('line-groups').replaceChildren();$('line-items').replaceChildren();$('line-automation').textContent='';$('line-updated').textContent='';text('頁面已結束或帳戶已變更，請重新開啟設定。');controls();}
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')clearTimeout(pollTimer);else if(alive&&authority)refresh({preserveForm:true});});
 window.addEventListener('online',()=>{if(alive&&authority)refresh({preserveForm:true});});
 window.addEventListener('offline',()=>{clearTimeout(pollTimer);if(alive&&authority){unknown=true;text('網路已離線。以下為上次取得的狀態，連線恢復後會繼續更新。');$('line-updated').textContent='離線 · 目前顯示上次取得的狀態';controls();}});
 window.addEventListener('timehut-account-changed',()=>retire(true));window.addEventListener('pagehide',()=>retire(false),{once:true});window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
 document.addEventListener('DOMContentLoaded',async()=>{try{
  await TimehutAccounts.ready;
  if(!TimehutAccounts.status().native&&location.origin!==origin&&!['localhost','127.0.0.1'].includes(location.hostname)){location.replace(origin+'/app/line-albums.html');return;}
  if(TimehutAccounts.status().unconfirmed)throw Error('登入狀態尚未確認，請重新連線；原有連結保留。');if(!actor()){location.replace('account.html?next=line-albums.html');return;}
  const s=TimehutAccounts.status();authority={owner:s.user.id,generation:s.generation};let page=1,pages=1;
  do{const data=await TimehutAccounts.request('/api/accounts/albums?page='+page+'&per_page=30',{expectedAuthority:authority});check();if(!Array.isArray(data.albums)||!Number.isSafeInteger(data.pages)||data.pages<page||data.pages>100||page>1&&data.pages!==pages)throw Error('相簿清單未確認。');for(const a of data.albums){if(typeof a.id!=='string'||typeof a.title!=='string'||albums.has(a.id))throw Error('相簿清單未確認。');albums.set(a.id,a);}pages=data.pages;page++;}while(page<=pages);
  await refresh();
 }catch(e){unknown=true;text(e.message||'無法讀取 LINE 收件設定。');controls();}});
})();
