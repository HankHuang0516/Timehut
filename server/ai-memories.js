'use strict';
// Separate database: no photo bytes, account credentials or provider tokens.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {resourceOwned,photoInAlbum}=require('./account-store');
const {photoDay}=require('./timeline-dates');
const {parseQuery,matchPhoto,localDay,cleanResult}=require('./ai-memory-query');
const DEFAULTS={enabled:false,allowedAlbumIds:[],hiddenAlbumIds:[],dailyLimit:20,pollMinutes:30,analyzeExisting:true,notifications:false,timeZone:'Asia/Taipei'};
const LEASE_MS=10*60*1000;
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const numeric=id=>typeof id==='string'&&/^\d{1,32}$/.test(id);
class AIMemories{
 constructor(store,{directory,now=()=>store.now(),globalDailyLimit=200,listLegacyAlbum=null}={}){
  this.store=store;this.directory=directory;this.now=now;this.globalDailyLimit=globalDailyLimit;this.listLegacyAlbum=listLegacyAlbum;this.scanning=false;
  if(!Number.isSafeInteger(globalDailyLimit)||globalDailyLimit<1||globalDailyLimit>10000)throw Error('Invalid AI service limit');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,'ai-memories.sqlite'),exists=fs.existsSync(file);
  if(exists&&(!fs.lstatSync(file).isFile()||fs.statSync(file).size===0))throw Error('AI database requires recovery');
  this.db=new DatabaseSync(file);fs.chmodSync(file,0o600);
  this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;');
  if(exists){const version=this.db.prepare('PRAGMA user_version').get().user_version;if(![1,2].includes(version)||this.db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('AI database requires recovery');if(version===1)this.db.exec("BEGIN IMMEDIATE; ALTER TABLE jobs ADD COLUMN phase TEXT NOT NULL DEFAULT 'waiting'; UPDATE jobs SET status='unconfirmed',lease=NULL,lease_until=NULL WHERE status!='completed' AND attempts>0; PRAGMA user_version=2; COMMIT;");}
  else this.db.exec(`PRAGMA journal_mode=WAL; BEGIN IMMEDIATE;
   CREATE TABLE settings(user_id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL,next_scan INTEGER NOT NULL,started_at INTEGER NOT NULL) STRICT;
   CREATE TABLE catalog(user_id TEXT NOT NULL,photo_id TEXT NOT NULL,album_ids TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(user_id,photo_id)) STRICT;
   CREATE TABLE cursors(user_id TEXT NOT NULL,album_id TEXT NOT NULL,page INTEGER NOT NULL,PRIMARY KEY(user_id,album_id)) STRICT;
   CREATE TABLE analyses(user_id TEXT NOT NULL,photo_id TEXT NOT NULL,payload TEXT NOT NULL,model TEXT NOT NULL,completed_at INTEGER NOT NULL,PRIMARY KEY(user_id,photo_id)) STRICT;
   CREATE TABLE jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,photo_id TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,ready_at INTEGER NOT NULL,lease TEXT,lease_until INTEGER,result_digest TEXT,phase TEXT NOT NULL DEFAULT 'waiting',UNIQUE(user_id,photo_id,revision)) STRICT;
   CREATE TABLE usage(user_id TEXT NOT NULL,day TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(user_id,day)) STRICT;
   CREATE TABLE global_usage(day TEXT PRIMARY KEY,count INTEGER NOT NULL) STRICT;
   CREATE TABLE preferences(user_id TEXT NOT NULL,photo_id TEXT NOT NULL,dismissed INTEGER NOT NULL DEFAULT 0,favorite INTEGER NOT NULL DEFAULT 0,viewed_at INTEGER,PRIMARY KEY(user_id,photo_id)) STRICT;
   CREATE TABLE memories(user_id TEXT NOT NULL,day TEXT NOT NULL,photo_id TEXT NOT NULL,PRIMARY KEY(user_id,day)) STRICT;
   CREATE INDEX ready_jobs ON jobs(status,ready_at); PRAGMA user_version=2; COMMIT;`);
  this.sweepDeletedUsers();
 }
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 user(userId){this.store.assertAvailable();const s=this.store.state;if(!Object.hasOwn(s.users,userId)||s.users[userId].disabled)fail('帳戶無法使用',404);return s;}
 settings(userId){this.user(userId);const row=this.db.prepare('SELECT * FROM settings WHERE user_id=?').get(userId);return {...structuredClone(DEFAULTS),...(row?JSON.parse(row.payload):{}),revision:row?.revision??0};}
 configure(userId,input){
  const s=this.user(userId),old=this.settings(userId),next={...old};delete next.revision;
  if(!input||typeof input!=='object'||Array.isArray(input))fail('設定格式無效',400);
  const known=new Set([...Object.keys(DEFAULTS),'consent']);if(Object.keys(input).some(k=>!known.has(k)))fail('設定欄位無效',400);
  for(const name of ['enabled','analyzeExisting','notifications'])if(Object.hasOwn(input,name)){if(typeof input[name]!=='boolean')fail('設定格式無效',400);next[name]=input[name];}
  for(const name of ['allowedAlbumIds','hiddenAlbumIds'])if(Object.hasOwn(input,name)){
   if(!Array.isArray(input[name])||input[name].length>100||new Set(input[name]).size!==input[name].length||input[name].some(id=>!resourceOwned(s,userId,'album',id)))fail('請選擇自己的有效相簿',400);next[name]=[...input[name]];
  }
  if(Object.hasOwn(input,'dailyLimit')){if(!Number.isSafeInteger(input.dailyLimit)||input.dailyLimit<1||input.dailyLimit>100)fail('每日額度須為1至100張',400);next.dailyLimit=input.dailyLimit;}
  if(Object.hasOwn(input,'pollMinutes')){if(![10,30,60].includes(input.pollMinutes))fail('檢查間隔無效',400);next.pollMinutes=input.pollMinutes;}
  if(Object.hasOwn(input,'timeZone')){try{new Intl.DateTimeFormat('en',{timeZone:input.timeZone}).format();}catch(_){fail('時區無效',400);}if(typeof input.timeZone!=='string'||input.timeZone.length>64)fail('時區無效',400);next.timeZone=input.timeZone;}
  if(next.enabled&&(!next.allowedAlbumIds.length||input.consent!==true))fail('請同意由官方使用所選相簿縮圖進行內容分析',400);
  // Quotas use fixed UTC days; changing display timezone cannot renew an allowance.
  this.tx(()=>{const now=this.now(),prior=this.db.prepare('SELECT started_at FROM settings WHERE user_id=?').get(userId),started=next.enabled&&!old.enabled?now:prior?.started_at??now;this.db.prepare('INSERT INTO settings VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,next_scan=0,started_at=excluded.started_at').run(userId,JSON.stringify(next),old.revision+1,0,started);this.db.prepare("UPDATE jobs SET status=CASE WHEN status='leased' AND phase!='waiting' THEN 'unconfirmed' ELSE 'cancelled' END,lease=NULL,lease_until=NULL WHERE user_id=? AND status IN ('pending','leased')").run(userId);});
  return this.settings(userId);
 }
 selection(userId){
  const config=this.settings(userId);
  return {includedAlbumIds:config.enabled?this.albums(userId).filter(a=>config.allowedAlbumIds.includes(a.id)&&!config.hiddenAlbumIds.includes(a.id)).map(a=>a.id):[],analyzeExisting:config.analyzeExisting,notifications:config.notifications,revision:config.revision};
 }
 configureSelection(userId,input){
  this.user(userId);
  const known=new Set(['includedAlbumIds','analyzeExisting','notifications','consent']);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!known.has(k)))fail('拾光設定欄位無效',400);
  const owned=this.albums(userId).map(a=>a.id),included=input.includedAlbumIds;
  if(!Array.isArray(included)||included.length>100||new Set(included).size!==included.length||included.some(id=>!owned.includes(id)))fail('請選擇自己的有效相簿',400);
  // One public choice controls analysis, search and recommendations. Quotas
  // and scheduling stay server-owned; no public fields can override them.
  this.configure(userId,{allowedAlbumIds:included,hiddenAlbumIds:[],enabled:included.length>0,dailyLimit:DEFAULTS.dailyLimit,pollMinutes:DEFAULTS.pollMinutes,...(Object.hasOwn(input,'analyzeExisting')?{analyzeExisting:input.analyzeExisting}:{}),...(Object.hasOwn(input,'notifications')?{notifications:input.notifications}:{}),consent:input.consent});
  return this.selection(userId);
 }
 albums(userId){return this.store.listAlbums(userId);}
 source(userId,id,{state=null}={}){
  if(!numeric(id))return null;const s=state??this.user(userId),row=s.media[id];
  if(row){if(!resourceOwned(s,userId,'photo',id))return null;const albums=(row.albumIds??[row.albumId]).filter(a=>resourceOwned(s,userId,'album',a));return albums.length?{...row,createdAt:row.createdAt??s.receipts[row.receiptId]?.createdAt,albumIds:albums}:null;}
  const cached=this.db.prepare('SELECT * FROM catalog WHERE user_id=? AND photo_id=?').get(userId,id);if(!cached||s.legacyHousehold?.ownerUserId!==userId)return null;
  const albumIds=JSON.parse(cached.album_ids).filter(a=>resourceOwned(s,userId,'album',a)&&s.albums[a].legacyProviderAlbum===true&&s.legacyHousehold.children.some(c=>c.albumId===a));
  return albumIds.length?{...JSON.parse(cached.payload),albumIds}:null;
 }
 // Hank1031: photos stored by the LINE album auto-import get AI smart tags but
 // never use the 拾光 daily quota or queue capacity. Origin is read from the
 // durable account receipt (LINE client upload ids start with 'line_').
 // The client upload id alone is not proof (ordinary uploads choose their own id), so the
 // server's own LINE import record must also exist (LQ90-F1). No lookup installed => not LINE.
 lineOrigin(userId,id){try{if(typeof this.lineImportOwns!=='function')return false;const s=this.store.state,row=s.media[String(id)];if(!row||row.userId!==userId)return false;const q=s.receipts[row.receiptId]?.queueItem;return q?.ownerUserId===userId&&typeof q.clientUploadId==='string'&&q.clientUploadId.startsWith('line_')&&this.lineImportOwns(userId,q.clientUploadId)===true;}catch(_){return false;}}
 eligible(userId,id,{analyze=false,state=null,config=null}={}){
  const row=this.source(userId,id,{state});if(!row||row.media==='video')return null;config??=this.settings(userId);
  if(!config.enabled||row.albumIds.some(a=>config.hiddenAlbumIds.includes(a))||!row.albumIds.every(a=>config.allowedAlbumIds.includes(a)))return null;
  return row;
 }
 enqueue(userId,id,{force=false,state=null,config=null}={}){
  config??=this.settings(userId);const row=this.eligible(userId,id,{analyze:true,state,config});if(!row)return false;
  // A settings revision is not a new request to repeat an unknown external
  // operation. Only the explicit reanalyze action may cross this barrier.
  if(!force&&this.db.prepare("SELECT 1 FROM jobs WHERE user_id=? AND photo_id=? AND status='unconfirmed'").get(userId,id))return false;
  if(!force&&this.db.prepare('SELECT 1 FROM analyses WHERE user_id=? AND photo_id=?').get(userId,id))return false;
  const job=this.db.prepare('SELECT * FROM jobs WHERE user_id=? AND photo_id=? AND revision=?').get(userId,id,config.revision);
  if(job){if(!force||['pending','leased'].includes(job.status))return false;this.db.prepare('DELETE FROM jobs WHERE id=?').run(job.id);}
  this.db.prepare("INSERT INTO jobs(id,user_id,photo_id,revision,status,ready_at) VALUES(?,?,?,?,'pending',?)").run(crypto.randomUUID(),userId,id,config.revision,this.now());return true;
 }
 // Hank1030: queue one new upload/import as soon as it is stored, instead of
 // waiting up to pollMinutes for discover(). Same rules as discover(): AI on,
 // every album allowed and not hidden, analyzeExisting or created after AI start,
 // not analysed, not queued, not unknown, queue capacity. Never throws.
 enqueueNew(userId,id){
  try{return this.tx(()=>{
   const config=this.settings(userId);if(!config.enabled)return false;
   const s=this.user(userId),row=s.media[String(id)];if(!row||row.userId!==userId)return false;
   const initial=this.db.prepare('SELECT started_at FROM settings WHERE user_id=?').get(userId)?.started_at??0;
   if(!config.analyzeExisting&&(row.createdAt??s.receipts[row.receiptId]?.createdAt??0)<initial)return false;
   const queued=this.db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE user_id=? AND status IN ('pending','leased')").get(userId).count;
   if(!this.lineOrigin(userId,id)&&queued>=Math.max(100,config.dailyLimit*3))return false;
   return this.enqueue(userId,String(id),{state:s,config});
  });}catch(_){return false;}
 }
 async discover(){
  if(this.scanning)return;this.scanning=true;
  try{this.sweepDeletedUsers();for(const record of this.db.prepare("SELECT * FROM settings WHERE next_scan<=? AND json_extract(payload,'$.enabled')=1 ORDER BY next_scan LIMIT 20").all(this.now())){try{
   const userId=record.user_id,config=this.settings(userId);if(!config.enabled)continue;
   this.db.prepare('UPDATE settings SET next_scan=? WHERE user_id=? AND revision=?').run(this.now()+config.pollMinutes*60000,userId,record.revision);
   const initial=this.db.prepare('SELECT started_at FROM settings WHERE user_id=?').get(userId).started_at,s=this.user(userId),queued=this.db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE user_id=? AND status IN ('pending','leased')").get(userId).count,capacity=Math.max(100,config.dailyLimit*3);let added=0;
   if(queued>=capacity)continue;
   // One current snapshot is authority only for this synchronous loop. Avoid
   // parsing the full account database once per photo in a large library.
   for(const row of Object.values(s.media))if(row.userId===userId&&(config.analyzeExisting||(row.createdAt??s.receipts[row.receiptId]?.createdAt??0)>=initial)){if(this.enqueue(userId,row.id,{state:s,config}))added++;if(queued+added>=capacity)break;}
   if(queued+added>=capacity)continue;
   if(!this.listLegacyAlbum)continue;
   for(const album of config.allowedAlbumIds){
    if(!resourceOwned(this.user(userId),userId,'album',album)||this.user(userId).albums[album].legacyProviderAlbum!==true)continue;
    const page=this.db.prepare('SELECT page FROM cursors WHERE user_id=? AND album_id=?').get(userId,album)?.page??1;
    let batch;try{batch=await this.listLegacyAlbum(userId,album,page);}catch(error){if(page>1)this.db.prepare('UPDATE cursors SET page=1 WHERE user_id=? AND album_id=?').run(userId,album);throw error;}
    if(this.settings(userId).revision!==config.revision)break;
    if(!batch||!Array.isArray(batch.rows)||batch.rows.length>100||!Number.isSafeInteger(batch.pages)||batch.pages<1)throw Error('Incomplete AI album page');
    if(page>batch.pages){this.db.prepare('UPDATE cursors SET page=1 WHERE user_id=? AND album_id=?').run(userId,album);continue;}
    this.tx(()=>{const insert=this.db.prepare('INSERT INTO catalog VALUES(?,?,?,?) ON CONFLICT(user_id,photo_id) DO UPDATE SET album_ids=excluded.album_ids,payload=excluded.payload');for(const row of batch.rows){if(!numeric(row.id))throw Error('Invalid AI photo identity');const prior=this.db.prepare('SELECT album_ids FROM catalog WHERE user_id=? AND photo_id=?').get(userId,row.id),ids=[...new Set([...(prior?JSON.parse(prior.album_ids):[]),album])];insert.run(userId,row.id,JSON.stringify(ids),JSON.stringify(row));}this.db.prepare('INSERT INTO cursors VALUES(?,?,?) ON CONFLICT(user_id,album_id) DO UPDATE SET page=excluded.page').run(userId,album,page<batch.pages?page+1:1);});
    const current=this.user(userId);for(const row of batch.rows){if((config.analyzeExisting||row.createdAt>=initial)&&this.enqueue(userId,row.id,{state:current,config}))added++;if(queued+added>=capacity)break;}
    if(queued+added>=capacity)break;
   }
  }catch(_){/* A failed provider scan must not block other accounts or queued work. */}
  }}finally{this.scanning=false;}
 }
 claim(){return this.tx(()=>{
  const now=this.now(),day=new Date(now).toISOString().slice(0,10);
  const global=this.db.prepare('SELECT count FROM global_usage WHERE day=?').get(day)?.count??0,globalOpen=global<this.globalDailyLimit;
  this.db.prepare("UPDATE jobs SET status=CASE WHEN phase!='waiting' THEN 'unconfirmed' WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,lease=NULL,lease_until=NULL WHERE status='leased' AND lease_until<=?").run(now);
  const ready=this.db.prepare("SELECT j.* FROM jobs j JOIN settings s ON s.user_id=j.user_id LEFT JOIN usage u ON u.user_id=j.user_id AND u.day=? WHERE j.status='pending' AND j.ready_at<=? AND j.revision=s.revision AND json_extract(s.payload,'$.enabled')=1 ORDER BY j.ready_at,j.id LIMIT 2000").all(day,now);
  for(const job of ready){
   let config,row;try{config=this.settings(job.user_id);row=this.eligible(job.user_id,job.photo_id,{analyze:true});}catch(_){row=null;}
   if(!row||config.revision!==job.revision){this.db.prepare("UPDATE jobs SET status='cancelled' WHERE id=?").run(job.id);continue;}
   const line=this.lineOrigin(job.user_id,job.photo_id);
   if(!line){if(!globalOpen)continue;const used=this.db.prepare('SELECT count FROM usage WHERE user_id=? AND day=?').get(job.user_id,day)?.count??0;if(used>=config.dailyLimit)continue;}
   const lease=crypto.randomBytes(32).toString('base64url');this.db.prepare("UPDATE jobs SET status='leased',attempts=attempts+1,lease=?,lease_until=? WHERE id=?").run(lease,now+LEASE_MS,job.id);
   if(!line){this.db.prepare('INSERT INTO usage VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1').run(job.user_id,day);this.db.prepare('INSERT INTO global_usage VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1').run(day);}
   return {jobId:job.id,lease,expiresAt:now+LEASE_MS,thumbnailPath:`/api/internal/ai-memories/jobs/${job.id}/thumbnail`};
  }return null;
 });}
 leased(id,lease,{completed=false}={}){
  const job=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
  if(!job||typeof lease!=='string'||job.lease!==lease||!(job.status==='leased'&&job.lease_until>this.now()||completed&&job.status==='completed'))fail('分析租約已失效');
  if(this.settings(job.user_id).revision!==job.revision||!this.eligible(job.user_id,job.photo_id,{analyze:true}))fail('照片分析已停止');return job;
 }
 authorize(id,lease,phase=null){return this.tx(()=>{const job=this.leased(id,lease);if(phase===null)return;if(!['upload','analysis'].includes(phase))fail('外送階段無效',400);if(phase==='upload'&&job.phase!=='waiting'||phase==='analysis'&&job.phase!=='upload')fail('外送階段已授權或順序不符');this.db.prepare('UPDATE jobs SET phase=? WHERE id=?').run(phase,id);});}
 finish(id,lease,body){return this.tx(()=>{
  const job=this.leased(id,lease,{completed:true});
  if(body?.status==='COMPLETED'){
   const result=cleanResult(body.result),digest=crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
   if(job.status==='completed'){if(job.result_digest!==digest)fail('分析回寫內容不一致');return {status:'completed'};}
   this.db.prepare('INSERT INTO analyses VALUES(?,?,?,?,?) ON CONFLICT(user_id,photo_id) DO UPDATE SET payload=excluded.payload,model=excluded.model,completed_at=excluded.completed_at').run(job.user_id,job.photo_id,JSON.stringify(result),'minimax-code-memory-v1',this.now());
   this.db.prepare("UPDATE jobs SET status='completed',result_digest=? WHERE id=?").run(digest,id);return {status:'completed'};
  }
  if(!['FAILED','UNKNOWN'].includes(body?.status)||job.status==='completed')fail('回寫狀態無效',400);
  if(body.status==='UNKNOWN'||job.phase!=='waiting'){this.db.prepare("UPDATE jobs SET status='unconfirmed',lease=NULL,lease_until=NULL WHERE id=?").run(id);return {status:'unconfirmed'};}
  this.db.prepare("UPDATE jobs SET status=?,ready_at=?,lease=NULL,lease_until=NULL WHERE id=?").run(job.attempts>=3?'failed':'pending',this.now()+30000*2**job.attempts,id);return {status:job.attempts>=3?'failed':'pending'};
 });}
 analysis(userId,id){if(!this.eligible(userId,id))fail('照片不存在或無權限',404);const row=this.db.prepare('SELECT * FROM analyses WHERE user_id=? AND photo_id=?').get(userId,id);return row?{...JSON.parse(row.payload),modelVersion:row.model,completedAt:row.completed_at}:null;}
 edit(userId,id,input){if(!this.analysis(userId,id))fail('照片尚未分析',404);const result=cleanResult({...this.analysis(userId,id),...input});if(Object.keys(input).some(k=>!['tags','description'].includes(k)))fail('僅能修改描述與標籤',400);this.db.prepare('UPDATE analyses SET payload=? WHERE user_id=? AND photo_id=?').run(JSON.stringify(result),userId,id);return result;}
 search(userId,{query='',album=null,page=1}={}){
  const s=this.user(userId),config=this.settings(userId);if(album&&!resourceOwned(s,userId,'album',album))fail('相簿不存在或無權限',404);
  if(!Number.isSafeInteger(page)||page<1||page>100000)fail('頁碼無效',400);const parsed=parseQuery(query,this.now(),config.timeZone),rows=new Map();
  for(const row of Object.values(s.media))if(row.userId===userId)rows.set(row.id,row);
  for(const row of this.db.prepare('SELECT photo_id FROM catalog WHERE user_id=?').all(userId))if(!rows.has(row.photo_id))rows.set(row.photo_id,null);
  const results=new Map(this.db.prepare('SELECT photo_id,payload FROM analyses WHERE user_id=?').all(userId).map(r=>[r.photo_id,JSON.parse(r.payload)])),found=[];
  for(const id of rows.keys()){const row=this.eligible(userId,id,{state:s,config});if(!row||album&&!row.albumIds.includes(album))continue;const result=results.get(id),score=matchPhoto(parsed,row,result,config.timeZone);if(score!==null)found.push({row,result:result??null,score});}
  found.sort((a,b)=>b.score-a.score||String(photoDay(b.row,config.timeZone)||'').localeCompare(String(photoDay(a.row,config.timeZone)||''))||a.row.id.localeCompare(b.row.id));
  return {items:found.slice((page-1)*30,page*30),total:found.length,page,pages:Math.max(1,Math.ceil(found.length/30)),mode:'全文與同義詞搜尋'};
 }
 daily(userId){
  const config=this.settings(userId),state=this.user(userId),day=localDay(this.now(),config.timeZone),selected=this.db.prepare('SELECT photo_id FROM memories WHERE user_id=? AND day=?').get(userId,day);
  const allowed=id=>{const row=this.eligible(userId,id,{state,config}),pref=this.db.prepare('SELECT * FROM preferences WHERE user_id=? AND photo_id=?').get(userId,id);return row&&!pref?.dismissed?{row,pref}:null;};
  if(selected){const prior=allowed(selected.photo_id);if(prior&&this.analysis(userId,selected.photo_id))return {...prior,result:this.analysis(userId,selected.photo_id),day};}
  const recent=new Set(this.db.prepare('SELECT photo_id FROM memories WHERE user_id=? AND day>=?').all(userId,localDay(this.now()-14*86400000,config.timeZone)).map(r=>r.photo_id)),candidates=[];
  for(const record of this.db.prepare('SELECT photo_id,payload FROM analyses WHERE user_id=?').all(userId)){
   const data=allowed(record.photo_id);if(!data||recent.has(record.photo_id))continue;const taken=photoDay(data.row,config.timeZone);if(!taken||taken>=localDay(this.now()-30*86400000,config.timeZone))continue;
   const result=JSON.parse(record.payload),same=taken.slice(5)===day.slice(5),last=this.db.prepare('SELECT MAX(day) AS day FROM memories WHERE user_id=? AND photo_id=?').get(userId,record.photo_id)?.day;
   const unseen=data.pref?.viewed_at?Math.min(1,(this.now()-data.pref.viewed_at)/(365*86400000)):1,meaningful=/生日|旅行|旅遊|畢業|慶祝|出遊/.test([...result.tags,...result.activities].join(' '));
   candidates.push({...data,result,day,score:(same?30:0)+unseen*25+(meaningful?20:0)+({good:15,fair:8,poor:0}[result.quality])+(last?5:10),tie:crypto.createHash('sha256').update(day+record.photo_id).digest('hex')});
  }
  candidates.sort((a,b)=>b.score-a.score||a.tie.localeCompare(b.tie));const chosen=candidates[0];if(!chosen)return null;
  this.db.prepare('INSERT INTO memories VALUES(?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET photo_id=excluded.photo_id').run(userId,day,chosen.row.id);return chosen;
 }
 feedback(userId,id,action){
  if(!this.eligible(userId,id)||!['viewed','favorite','unfavorite','dismiss'].includes(action))fail('回憶操作無效',400);
  this.db.prepare('INSERT OR IGNORE INTO preferences(user_id,photo_id) VALUES(?,?)').run(userId,id);
  const field=action==='viewed'?'viewed_at':action==='dismiss'?'dismissed':'favorite',value=action==='viewed'?this.now():action==='unfavorite'?0:1;
  this.db.prepare(`UPDATE preferences SET ${field}=? WHERE user_id=? AND photo_id=?`).run(value,userId,id);return {ok:true};
 }
 status(userId){const config=this.settings(userId),counts={pending:0,leased:0,completed:0,failed:0,unconfirmed:0};for(const row of this.db.prepare('SELECT status,COUNT(*) AS count FROM jobs WHERE user_id=? GROUP BY status').all(userId))if(Object.hasOwn(counts,row.status))counts[row.status]=row.count;const day=new Date(this.now()).toISOString().slice(0,10);return {settings:config,counts,analyzed:this.db.prepare('SELECT COUNT(*) AS count FROM analyses WHERE user_id=?').get(userId).count,usedToday:this.db.prepare('SELECT count FROM usage WHERE user_id=? AND day=?').get(userId,day)?.count??0,quotaResetsAt:Date.parse(day+'T00:00:00Z')+86400000};}
 erase(userId,{removeSettings=false}={}){this.tx(()=>{for(const table of ['catalog','cursors','analyses','jobs','preferences','memories'])this.db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(userId);if(removeSettings){this.db.prepare('DELETE FROM settings WHERE user_id=?').run(userId);this.db.prepare('DELETE FROM usage WHERE user_id=?').run(userId);}else{const previous=this.db.prepare('SELECT revision FROM settings WHERE user_id=?').get(userId);if(previous)this.db.prepare('UPDATE settings SET payload=?,revision=? WHERE user_id=?').run(JSON.stringify(DEFAULTS),previous.revision+1,userId);}});this.scrub();return {erased:true,enabled:false};}
 scrub(){const disk=fs.statfsSync(this.directory),size=fs.statSync(path.join(this.directory,'ai-memories.sqlite')).size;if(disk.bavail*disk.bsize<2*size+32*1024*1024)throw Error('AI erasure requires free space');this.db.exec('VACUUM');const checkpoint=this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();if(checkpoint.busy!==0||checkpoint.log!==0||checkpoint.checkpointed!==0)throw Error('AI erasure awaits idle readers');}
 sweepDeletedUsers(){const state=this.store.state;for(const row of this.db.prepare('SELECT user_id FROM settings').all())if(!Object.hasOwn(state.users,row.user_id)||state.users[row.user_id].disabled)this.erase(row.user_id,{removeSettings:true});}
 close(){this.db.close();}
}
module.exports={AIMemories,DEFAULTS};
