'use strict';
// ⚠️ HANK 凍結（2026-11-03）：此為時光相簿 LINE→MiniMax 人物／影片辨識→自動匯入→合併通知 的正式流程，已實測跑通（deployment 58310df0）。Codex／GPT 及所有 agent 不得修改此流程的邏輯、新增限制、門檻、權限檢查、確認步驟或規則；規則只由前台設定（參考照片＋每本相簿辨識開關）決定。只允許修 bug 或恢復成目前行為，任何其他變更須先取得 Hank 本人明確同意。詳見根目錄 AGENTS.md 的 HANK_PERSON_MATCH_NO_NEW_RULES 段落。
const crypto=require('node:crypto');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
class LineAlbumImports {
 // Hank1031: true only when this server created a LINE import plan with this client id for this user.
 ownsClientId(userId,clientId){try{return typeof userId==='string'&&typeof clientId==='string'&&!!this.db.prepare("SELECT 1 AS ok FROM imports WHERE user_id=? AND json_extract(plan,'$.clientId')=? LIMIT 1").get(userId,clientId);}catch(_){return false;}}
 constructor(inbox,{journal,stage,addMembership,verifyMembership=null,canRun=()=>false,onAccepted=()=>{},onCompleted=()=>{},automation=null}={}){
  this.onCompleted=onCompleted;this.verifyMembership=verifyMembership;
  // Hank1103: one combined LINE notice per chat source. Imports already completed before this table existed keep their per-batch notice.
  if(!this.db_has(inbox.db,'import_notice_members')){inbox.db.exec('CREATE TABLE import_notice_members(import_id TEXT PRIMARY KEY,notice_id TEXT NOT NULL) STRICT');const ins=inbox.db.prepare('INSERT OR IGNORE INTO import_notice_members VALUES(?,?)');for(const r of inbox.db.prepare("SELECT * FROM imports WHERE status='completed'").all()){const p=JSON.parse(r.plan);if(!Object.hasOwn(p,'automation'))ins.run(r.id,this.legacyNoticeId(r.batch_id,p.source));}}this.inbox=inbox;this.store=inbox.store;this.db=inbox.db;this.journal=journal;this.stage=stage;this.addMembership=addMembership;this.canRun=canRun;this.onAccepted=onAccepted;this.automation=automation;this.busy=false;
  // A receiving reservation without a durable accepted receipt is ambiguous.
  for(const row of this.db.prepare("SELECT * FROM imports WHERE status IN ('receiving','unknown')").all()){
   const p=JSON.parse(row.plan),a=journal.admissions.find(row.user_id,p.clientId),receipt=a?.receiptId&&journal.get(a.receiptId);
   if(receipt&&receipt.ownerUserId===p.userId&&receipt.clientUploadId===p.clientId&&receipt.contentSha256===p.sha256&&receipt.size===p.bytes&&receipt.mimetype===p.mime)this.update(row.id,'staged',receipt.localId);else this.update(row.id,'unknown',null,'receiver_outcome_unknown');
  }
 }
 db_has(db,name){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);}
 legacyNoticeId(batchId,source){const h=hash('line-import-notice:'+batchId+'|'+source);return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
 update(id,status,receipt=null,error=null){this.db.prepare('UPDATE imports SET status=?,receipt_id=COALESCE(?,receipt_id),updated_at=?,error_code=? WHERE id=?').run(status,receipt,this.inbox.now(),error,id);}
 assertManualUnclaimed(user,id){
  // Durable ownership survives a missing/incomplete startup adapter. Both
  // admission and every later provider/staging/notice boundary enforce it.
  const meta=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='line_auto_meta'").get();
  const table=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='line_auto_items'").get();
  if(meta&&!table)fail('自動處理狀態尚未恢復');
  if(table&&this.db.prepare('SELECT 1 FROM line_auto_items WHERE id=?').get(id))fail('這筆收件正在自動處理，不能手動匯入');
  if(this.automation?.assertManualAllowed&&this.automation.assertManualAllowed(user,id)!==true)fail('這筆收件正在自動處理，不能手動匯入');
 }
 current(plan){
  this.store.assertAvailable();const row=this.db.prepare('SELECT * FROM items WHERE id=? AND user_id=?').get(plan.itemId,plan.userId);if(!row||row.status!=='downloaded'||row.binding_since!==plan.bindingSince)fail('這筆LINE收件已停止');
  const allowed=this.inbox.valid(row);if(plan.albumIds.some(id=>!allowed.includes(id)))fail('目的相簿授權已變更');
  for(const [id,since]of plan.targetEpochs){const b=this.db.prepare('SELECT since FROM binding_albums WHERE source=? AND album_id=? AND active=1').get(row.source,id);if(!b||b.since!==since)fail('目的相簿授權已變更');}
  const p=JSON.parse(row.payload||'null');if(!p||p.sha256!==plan.sha256||p.bytes!==plan.bytes||p.mime!==plan.mime)fail('原檔收據已變更');
  // Persisted automated plans must remain guarded after process restart. A
  // missing adapter, a Promise, or a model-supplied flag never authorizes them.
  if(Object.hasOwn(plan,'automation')){if(typeof this.automation?.assertCurrent!=='function'||this.automation.assertCurrent(plan)!==true)fail('自動匯入授權未確認');}else this.assertManualUnclaimed(plan.userId,plan.itemId);
  return row;
 }
 request(user,input={}){return this.#request(user,input,null);}
 // Called only by the dedicated server integration after its durable relevance
 // decision. The public manual HTTP body cannot select this method or context.
 requestAutomated(user,input,proof){
  if(typeof this.automation?.prepare!=='function')fail('自動匯入尚未啟用');
  const context=this.automation.prepare(user,input,proof);
  if(!context||typeof context!=='object'||Array.isArray(context)||Object.keys(context).sort().join(',')!=='decisionDigest,runId,scopeDigest'||!uuid(context.runId)||![context.decisionDigest,context.scopeDigest].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))fail('自動匯入授權未確認');
  return this.#request(user,input,structuredClone(context));
 }
 #request(user,{requestId,itemIds,albumIds,people=[],confirmed}={},automation){
  if(confirmed!==true||!uuid(requestId)||!Array.isArray(itemIds)||!itemIds.length||itemIds.length>20||itemIds.some(id=>!uuid(id))||new Set(itemIds).size!==itemIds.length)fail('請選取照片並確認匯入用途',400);
  const targets=this.inbox.albumSelection(user,albumIds);if(!Array.isArray(people)||people.length>10||people.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>40||/[\u0000-\u001f\u007f]/.test(v))||new Set(people.map(v=>v.trim())).size!==people.length)fail('人物標記格式不正確',400);people=people.map(v=>v.trim());
  return this.inbox.tx(()=>{
   const existing=this.db.prepare('SELECT * FROM imports WHERE batch_id=?').all(requestId);
   if(existing.length){if(existing.length!==itemIds.length||existing.some(r=>r.user_id!==user||!itemIds.includes(r.id)||!same(JSON.parse(r.plan).albumIds,targets)||!same(JSON.parse(r.plan).people,people)||!same(JSON.parse(r.plan).automation??null,automation)))fail('這筆匯入請求的內容已變更');for(const r of existing)this.current(JSON.parse(r.plan));return this.list(user);}
   const plans=itemIds.map(id=>{
    if(this.db.prepare('SELECT 1 FROM imports WHERE id=?').get(id))fail('這筆收件已有匯入結果，請重新讀取狀態');
    const row=this.db.prepare("SELECT * FROM items WHERE id=? AND user_id=? AND status='downloaded'").get(id,user);if(!row)fail('收件尚未下載完成或無權限',404);const receipt=JSON.parse(row.payload),allowed=this.inbox.valid(row);if(targets.some(id=>!allowed.includes(id)))fail('所選照片沒有這本相簿的收件授權',404);
    if(!automation)this.assertManualUnclaimed(user,id);
    return {itemId:id,userId:user,batchId:requestId,source:row.source,messageId:row.message_id,media:row.media,sha256:receipt.sha256,bytes:receipt.bytes,mime:receipt.mime,bindingSince:row.binding_since,albumIds:targets,targetEpochs:targets.map(id=>[id,this.db.prepare('SELECT since FROM binding_albums WHERE source=? AND album_id=? AND active=1').get(row.source,id).since]),people,clientId:'line_'+hash(id).slice(0,48),...(automation?{automation}: {})};
   });
   for(const p of plans){this.current(p);this.db.prepare("INSERT INTO imports VALUES(?,?,?,'pending',?,NULL,?,?,NULL)").run(p.itemId,user,requestId,JSON.stringify(p),this.inbox.now(),this.inbox.now());}return this.list(user);
  });
 }
 list(user){this.inbox.user(user);return this.db.prepare('SELECT id,batch_id AS requestId,status,receipt_id AS receiptId,error_code AS errorCode FROM imports WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(user);}
 assertReceiptCurrent(receiptId){
  let row=this.db.prepare('SELECT * FROM imports WHERE receipt_id=?').get(receiptId);if(!row){const q=this.journal.get(receiptId);if(q)row=this.db.prepare("SELECT * FROM imports WHERE user_id=? AND json_extract(plan,'$.clientId')=?").get(q.ownerUserId,q.clientUploadId);}if(!row)return;
  try{this.current(JSON.parse(row.plan));}catch(error){if([404,409].includes(error.status))error.lineImportRevoked=true;throw error;}
 }
 confirmed(row){
  const p=JSON.parse(row.plan);this.current(p);const q=this.journal.get(row.receipt_id),state=this.store.state,receipt=state.receipts[row.receipt_id],photo=q?.flickrPhotoId&&state.media[q.flickrPhotoId];
  if(!q||q.status!=='completed'||q.photoDeletedAt!==undefined||q.ownerUserId!==p.userId||q.clientUploadId!==p.clientId||q.contentSha256!==p.sha256||q.size!==p.bytes||q.mimetype!==p.mime||q.accountAlbumId!==p.albumIds[0]||receipt?.userId!==p.userId||receipt.albumId!==p.albumIds[0]||!photo||photo.userId!==p.userId||photo.receiptId!==row.receipt_id||photo.bytes!==p.bytes||photo.deletedAt!==undefined||photo.deletionRequestedAt!==undefined)return null;
  return {plan:p,photo,q};
 }
 // Read-only local-retention decision for user-confirmed imports. A completed
 // upload alone is insufficient: all memberships and the exact original-chat
 // notification must still be canonical. Automated plans use their own fenced
 // terminal permits and never enter this compatibility path.
 canReleaseLocal(id){
  if(!uuid(id))return false;
  return this.inbox.tx(()=>{
   const row=this.db.prepare("SELECT * FROM imports WHERE id=? AND status='completed'").get(id);
   if(!row)return false;
   const p=JSON.parse(row.plan);
   if(Object.hasOwn(p,'automation')||p.itemId!==row.id||p.userId!==row.user_id||p.batchId!==row.batch_id)return false;
   const item=this.current(p);
   if(item.source!==p.source||item.message_id!==p.messageId||item.media!==p.media)return false;
   const action={type:'import_complete',userId:row.user_id,batchId:row.batch_id,source:p.source};
   const member=this.db.prepare('SELECT notice_id FROM import_notice_members WHERE import_id=?').get(id),noticeId=member?.notice_id||this.legacyNoticeId(row.batch_id,p.source);
   const notice=this.db.prepare("SELECT * FROM outbox WHERE id=? AND status='sent'").get(noticeId);
   if(!notice||notice.line_id!==p.source.slice(p.source.indexOf(':')+1))return false;
   const payload=JSON.parse(notice.payload);
   if(!(same(payload,action)||Array.isArray(payload.importIds)&&payload.importIds.includes(id)&&payload.userId===row.user_id&&payload.source===p.source))return false;
   const verified=this.notification(payload);
   return !!verified&&verified.to===notice.line_id;
  });
 }
 notification(action){
  if(action.type!=='import_complete')return null;if(Array.isArray(action.importIds))return this.summaryNotification(action);const rows=this.db.prepare('SELECT * FROM imports WHERE user_id=? AND batch_id=? ORDER BY id').all(action.userId,action.batchId).filter(r=>JSON.parse(r.plan).source===action.source);
  if(!rows.length||rows.some(r=>r.status!=='completed'))return null;const verified=rows.map(r=>this.confirmed(r));if(verified.some(v=>!v))return null;
  for(const v of verified)if(v.plan.albumIds.some(id=>!(v.photo.albumIds??[v.photo.albumId]).includes(id)))return null;
  const p=verified[0].plan,ids=[...new Set(verified.flatMap(v=>v.plan.albumIds))],titles=ids.slice(0,8).map(id=>'「'+this.store.state.albums[id].title+'」').join('、')+(ids.length>8?'等'+ids.length+'本相簿':'');
  const images=verified.filter(v=>v.plan.media==='image').length,videos=verified.length-images,count=[images?images+'張照片':'',videos?videos+'段影片':''].filter(Boolean).join('、'),labels=p.people.length?'已確認人物：'+p.people.join('、')+'。\n':'';
  return {to:action.source.slice(action.source.indexOf(':')+1),text:labels+'已將'+count+'上傳至'+titles+'。'};
 }
 // Hank1103: per album "已將 3 張照片、1 支影片傳至漢堡相簿", joined with "；". Only confirmed memberships count.
 summaryNotification(action){
  const counts=new Map();
  for(const id of action.importIds){
   const r=this.db.prepare('SELECT * FROM imports WHERE id=? AND user_id=?').get(id,action.userId);if(!r||r.status!=='completed')continue;
   let v=null;try{v=this.confirmed(r);}catch(_){v=null;}if(!v||v.plan.source!==action.source||Object.hasOwn(v.plan,'automation'))continue;
   const albums=v.photo.albumIds??[v.photo.albumId];
   for(const a of v.plan.albumIds){if(!albums.includes(a))continue;const c=counts.get(a)||{images:0,videos:0};if(v.plan.media==='video')c.videos++;else c.images++;counts.set(a,c);}
  }
  if(!counts.size)return null;
  const parts=[...counts].map(([a,c])=>{const t=String(this.store.state.albums[a]?.title||'');return '已將 '+[c.images?c.images+' 張照片':'',c.videos?c.videos+' 支影片':''].filter(Boolean).join('、')+'傳至'+(t.endsWith('相簿')?t:t+'相簿');});
  return {to:action.source.slice(action.source.indexOf(':')+1),text:parts.join('；')};
 }
 queueSummaries(rows){
  const now=this.inbox.now(),groups=new Map();
  for(const r of rows){const p=JSON.parse(r.plan);if(Object.hasOwn(p,'automation')||this.db.prepare('SELECT 1 FROM import_notice_members WHERE import_id=?').get(r.id))continue;const key=r.user_id+'|'+p.source;if(!groups.has(key))groups.set(key,{userId:r.user_id,source:p.source,rows:[]});groups.get(key).rows.push(r);}
  for(const g of groups.values()){
   // Wait until this chat source has had no new completed import for 60 seconds.
   if(Math.max(...g.rows.map(r=>r.updated_at))>now-60000)continue;
   const importIds=[...g.rows].sort((a,b)=>a.updated_at-b.updated_at||a.id.localeCompare(b.id)).map(r=>r.id),a={type:'import_complete',userId:g.userId,source:g.source,importIds};
   let ok=null;try{ok=this.summaryNotification(a);}catch(_){ok=null;}
   const h=hash('line-import-summary:'+g.source+'|'+importIds.join(',')),id=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);
   this.inbox.tx(()=>{if(ok)this.db.prepare("INSERT OR IGNORE INTO outbox VALUES(?,?,?,'pending',?)").run(id,g.source.slice(g.source.indexOf(':')+1),JSON.stringify(a),now);const ins=this.db.prepare('INSERT OR IGNORE INTO import_notice_members VALUES(?,?)');for(const iid of importIds)ins.run(iid,ok?id:'none');});
  }
 }
 queueNotifications(){
  const rows=this.db.prepare("SELECT * FROM imports WHERE status='completed' ORDER BY id").all(),groups=new Map();this.queueSummaries(rows);for(const r of rows){const p=JSON.parse(r.plan);if(!Object.hasOwn(p,'automation'))continue;const key=r.batch_id+'|'+p.source;if(!groups.has(key))groups.set(key,{type:'import_complete',userId:r.user_id,batchId:r.batch_id,source:p.source});}
  for(const [key,a]of groups){try{if(!this.notification(a))continue;}catch(error){if([404,409].includes(error.status))continue;throw error;}const h=hash('line-import-notice:'+key),id=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);this.db.prepare("INSERT OR IGNORE INTO outbox VALUES(?,?,?,'pending',?)").run(id,a.source.slice(a.source.indexOf(':')+1),JSON.stringify(a),this.inbox.now());}
 }
 async cycle(){
  if(this.busy||!this.canRun())return false;this.busy=true;
  try{
   for(const row of this.db.prepare("SELECT * FROM imports WHERE status='unknown'").all()){
    const p=JSON.parse(row.plan),a=this.journal.admissions.find(row.user_id,p.clientId),q=a?.receiptId&&this.journal.get(a.receiptId);
    if(q&&['pending','completed'].includes(q.status)&&!q.retryBlocked&&q.ownerUserId===p.userId&&q.clientUploadId===p.clientId&&q.contentSha256===p.sha256&&q.size===p.bytes&&q.mimetype===p.mime)this.update(row.id,'staged',q.localId);
   }
   for(const row of this.db.prepare("SELECT * FROM imports WHERE status='staged' ORDER BY created_at LIMIT 20").all()){
    const p=JSON.parse(row.plan);try{if(!this.canRun())return false;this.current(p);const q=this.journal.get(row.receipt_id);if(!q){this.update(row.id,'unknown',null,'receipt_missing');continue;}if(q.status==='pending'){this.onAccepted(q);continue;}if(['error','cancelled'].includes(q.status)){this.update(row.id,q.retryBlocked?'unknown':'failed',null,'provider_not_completed');continue;}const v=this.confirmed(row);if(!v)continue;
     for(const id of p.albumIds){this.current(p);if(!(this.store.state.media[v.photo.id].albumIds??[v.photo.albumId]).includes(id)){await this.addMembership(p.userId,id,v.photo.id,()=>this.current(p));this.current(p);}}
     if(p.albumIds.some(id=>!(this.store.state.media[v.photo.id].albumIds??[v.photo.albumId]).includes(id)))throw Error('Membership not confirmed');if(this.verifyMembership)await this.verifyMembership(p.userId,String(v.photo.id),p.albumIds);this.current(p);this.update(row.id,'completed');
     // Hank1030: all memberships confirmed; hand the photo to the AI queue. A hook error never fails the import.
     try{this.onCompleted({userId:p.userId,photoId:String(v.photo.id),albumIds:[...p.albumIds]});}catch(_){}
    }catch(error){if([404,409].includes(error.status))this.update(row.id,'cancelled',null,'consent_revoked');else this.db.prepare('UPDATE imports SET error_code=? WHERE id=?').run('membership_or_storage_unconfirmed',row.id);}
   }
   this.queueNotifications();if(!this.canRun())return false;
   const row=this.db.prepare("SELECT * FROM imports WHERE status='pending' ORDER BY created_at LIMIT 1").get();if(!row)return false;const p=JSON.parse(row.plan);
   try{this.current(p);this.update(row.id,'receiving');const receipt=await this.stage(p,()=>{if(!this.canRun())throw Error('Import admission closed');return this.current(p);});if(!receipt||receipt.ownerUserId!==p.userId||receipt.clientUploadId!==p.clientId)throw Error('Receipt identity changed');this.update(row.id,'staged',receipt.localId);this.current(p);return true;}
   catch(error){this.update(row.id,error.lineNotAccepted?'failed':[404,409].includes(error.status)?'cancelled':'unknown',null,error.lineNotAccepted?'original_not_accepted':'original_or_consent_unconfirmed');return false;}
  }finally{this.busy=false;}
 }
}
module.exports={LineAlbumImports};
