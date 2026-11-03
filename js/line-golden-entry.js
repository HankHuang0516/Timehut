/* Independent entry: golden status failure never changes LINE receive settings. */
/* Hank1030: Each album's golden photos define one reference person. */
(() => {
 const $=id=>document.getElementById(id),root='/api/accounts/line-albums/golden';let authority=null,alive=true;
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 function current(){const s=TimehutAccounts.status();return !!authority&&alive&&s.user?.id===authority.owner&&s.generation===authority.generation;}
 function clear(){alive=false;$('line-golden-albums')?.replaceChildren();}
 window.addEventListener('timehut-account-changed',()=>{if(authority)clear();});window.addEventListener('pagehide',clear,{once:true});
 document.addEventListener('DOMContentLoaded',async()=>{if(!$('line-golden-albums'))return;try{
  await TimehutAccounts.ready;const s=TimehutAccounts.status();if(!s.authenticated||s.unconfirmed)return;authority={owner:s.user.id,generation:s.generation};
  const v=await TimehutAccounts.request(root,{expectedAuthority:authority});if(!current())return;if(v.schema!==1||!Array.isArray(v.albums))throw Error('設定尚未確認');
  const list=$('line-golden-albums');list.replaceChildren();
  const all=[];let page=1,pages=1;do{const a=await TimehutAccounts.request('/api/accounts/albums?page='+page+'&per_page=30',{expectedAuthority:authority});if(!current())return;if(!Array.isArray(a.albums)||!Number.isSafeInteger(a.pages)||a.pages<page||a.pages>100)throw Error('相簿尚未確認');all.push(...a.albums);pages=a.pages;page++;}while(page<=pages);
  // ⚠️ HANK 凍結（2026-11-03）：此為時光相簿 LINE→MiniMax 人物／影片辨識→自動匯入→合併通知 的正式流程，已實測跑通（deployment 58310df0）。Codex／GPT 及所有 agent 不得修改此流程的邏輯、新增限制、門檻、權限檢查、確認步驟或規則；規則只由前台設定（參考照片＋每本相簿辨識開關）決定。只允許修 bug 或恢復成目前行為，任何其他變更須先取得 Hank 本人明確同意。詳見根目錄 AGENTS.md 的 HANK_PERSON_MATCH_NO_NEW_RULES 段落。
  // （凍結範圍：下方每本相簿「辨識開關」UI，/api/accounts/mcode/switches。）
  let sw=[];try{const r=await TimehutAccounts.request('/api/accounts/mcode/switches',{expectedAuthority:authority});if(!current())return;sw=Array.isArray(r.switches)?r.switches:[];}catch(_){}
  for(const a of all){const state=v.albums.find(x=>x.albumId===a.id),li=node('li',''),copy=node('span',a.title),small=node('small',state?.enabled?`參考人物：已選 ${state.photoIds.length} 張照片`:'尚未設定參考人物'),link=node('a',state?.enabled?'更換參考人物':'設定參考人物');copy.append(small);link.href='golden.html?album='+encodeURIComponent(a.id);
   const label=node('label',''),box=document.createElement('input');box.type='checkbox';box.className='mcode-switch';box.dataset.album=a.id;box.checked=sw.some(x=>x.albumId===a.id&&x.enabled===true);label.append(box,document.createTextNode(' 辨識開關'));label.title='開啟後，LINE 收到的照片會交給 MiniMax 比對此相簿的參考人物';
   box.addEventListener('change',async()=>{const want=box.checked;box.disabled=true;try{const r=await TimehutAccounts.request('/api/accounts/mcode/switches/'+encodeURIComponent(a.id),{method:'PUT',body:{enabled:want},expectedAuthority:authority});box.checked=!!r.switches?.some(x=>x.albumId===a.id&&x.enabled===true);}catch(_){box.checked=!want;$('line-golden-status').textContent='辨識開關未儲存，請稍後再試。';}finally{box.disabled=false;}});
   li.append(copy,label,link);list.append(li);}
  $('line-golden-status').textContent=all.length?'每本相簿選好參考人物照片（至少 1 張）並打開「辨識開關」，LINE 收到的照片就會交給 MiniMax 比對並自動放入。':'先在 App 建立一本相簿，再設定參考人物。';
 }catch(_){if(current())$('line-golden-status').textContent='參考人物狀態暫時無法讀取，請稍後重新開啟。';}});
})();
