'use strict';
// ⚠️ HANK 凍結（2026-11-03）：此為時光相簿 LINE→MiniMax 人物／影片辨識→自動匯入→合併通知 的正式流程，已實測跑通（deployment 58310df0）。Codex／GPT 及所有 agent 不得修改此流程的邏輯、新增限制、門檻、權限檢查、確認步驟或規則；規則只由前台設定（參考照片＋每本相簿辨識開關）決定。只允許修 bug 或恢復成目前行為，任何其他變更須先取得 Hank 本人明確同意。詳見根目錄 AGENTS.md 的 HANK_PERSON_MATCH_NO_NEW_RULES 段落。
// Hank1102: minimal MiniMax Code API. One shared key (X-Mcode-Key) bound to one
// account (TIMEHUT_MCODE_USER_ID). MiniMax Code reads pending LINE photos and
// album reference photos, decides itself, and posts the target albums. The
// server imports through the existing LINE import engine (same staging,
// upload and membership code as the app), so no extra receipt chain exists here.
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),{Readable}=require('node:stream');
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const albumId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
function installMcodeApi(app,{accounts=null,express,inbox,imports,client,pump=()=>{},selections=null,store,providerRequest,credentials,key,userId,directory,request=fetch}={}){
 const enabled=typeof key==='string'&&key.length>=32&&uuid(userId)&&!!inbox&&!!imports;
 let db=null;
 if(enabled){fs.mkdirSync(directory,{recursive:true,mode:0o700});const {DatabaseSync}=require('node:sqlite');db=new DatabaseSync(path.join(directory,'mcode.sqlite'));db.exec('PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS done(item_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,album_ids TEXT NOT NULL,import_request TEXT,at INTEGER NOT NULL) STRICT;CREATE TABLE IF NOT EXISTS switches(user_id TEXT NOT NULL,album_id TEXT NOT NULL,enabled INTEGER NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(user_id,album_id)) STRICT;');}
 const switchOn=(u,a)=>db?.prepare('SELECT enabled FROM switches WHERE user_id=? AND album_id=?').get(u,a)?.enabled===1;
 const router=express.Router();
 router.use((req,res,next)=>{res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});if(!enabled)return res.status(503).json({error:'mcode API not configured'});const a=Buffer.from(String(req.get('X-Mcode-Key')||'')),b=Buffer.from(key);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({error:'invalid X-Mcode-Key'});next();});
 router.use(express.json({limit:'16kb'}));
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){if(res.headersSent)return res.destroy();res.status([400,404,409].includes(e.status)?e.status:503).json({error:e.status?e.message:'temporarily unavailable'});}};
 const fail=(m,s)=>{throw Object.assign(Error(m),{status:s});};
 const origin=req=>'https://'+req.get('host');
 const row=id=>{if(!uuid(id))fail('invalid itemId',400);const r=inbox.db.prepare('SELECT * FROM items WHERE id=? AND user_id=?').get(id,userId);if(!r)fail('item not found',404);return r;};
 const bound=r=>{try{return inbox.valid(r);}catch(e){if([404,409].includes(e.status))return [];throw e;}};
 const autoClaimed=id=>{try{return !!inbox.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='line_auto_items'").get()&&!!inbox.db.prepare('SELECT 1 FROM line_auto_items WHERE id=?').get(id);}catch{return false;}};
 const imported=id=>inbox.db.prepare('SELECT status,error_code FROM imports WHERE id=?').get(id)||null;
 const done=id=>db.prepare('SELECT * FROM done WHERE item_id=?').get(id)||null;
 const refsOf=a=>{try{const v=selections?.get(userId,a);return v?.enabled?v.photoIds:[];}catch{return [];}};
 // Front-end settings are the only rule: switch on + at least one reference photo.
 const active=req=>store.listAlbums(userId).filter(a=>switchOn(userId,a.id)&&refsOf(a.id).length>0).map(a=>({albumId:a.id,name:a.title||'',referenceImageUrls:refsOf(a.id).map(p=>origin(req)+'/api/mcode/references/'+encodeURIComponent(a.id)+'/'+p+'/image')}));
 // 1. pending LINE photos
 router.get('/pending',wrap((req,res)=>{
  // Hank1103: LINE videos use the same flow; each item says media "image" or "video".
  const rows=inbox.db.prepare("SELECT * FROM items WHERE user_id=? AND status='downloaded' AND media IN ('image','video') ORDER BY created_at ASC LIMIT 200").all(userId);
  const items=[];for(const r of rows){if(done(r.id)||imported(r.id)||autoClaimed(r.id))continue;const albums=active(req).filter(a=>bound(r).includes(a.albumId));if(!albums.length)continue;const media=r.media==='video'?'video':'image';items.push({itemId:r.id,media,...(media==='image'?{imageUrl:origin(req)+'/api/mcode/items/'+r.id+'/image'}:{}),mediaUrl:origin(req)+'/api/mcode/items/'+r.id+'/media',receivedAt:new Date(r.created_at).toISOString(),source:r.source.startsWith('group:')?'group':'user',albums});if(items.length>=50)break;}
  res.json({items});
 }));
 // 2. albums with reference photo links
 router.get('/albums',wrap((req,res)=>{
  res.json({albums:active(req)});
 }));
 // image bytes for one pending LINE photo (from LINE content API)
 router.get('/items/:itemId/image',wrap(async(req,res)=>{
  const r=row(req.params.itemId);if(r.media!=='image')fail('not an image',404);const response=await client.content(r.message_id);
  const type=(response.headers.get('content-type')||'').split(';')[0];if(!response.ok||!response.body||!['image/jpeg','image/png','image/webp'].includes(type))fail('LINE image unavailable',404);
  res.type(type);const input=Readable.fromWeb(response.body);res.on('close',()=>input.destroy());input.on('error',()=>res.destroy());input.pipe(res);
 }));
 // original bytes for one pending LINE photo or video (video: video/mp4)
 router.get('/items/:itemId/media',wrap(async(req,res)=>{
  const r=row(req.params.itemId),allowed=r.media==='video'?['video/mp4']:['image/jpeg','image/png','image/webp'];const response=await client.content(r.message_id);
  const type=(response.headers.get('content-type')||'').split(';')[0];if(!response.ok||!response.body||!allowed.includes(type))fail('LINE media unavailable',404);
  res.type(type);const length=response.headers.get('content-length');if(length)res.set('Content-Length',length);const input=Readable.fromWeb(response.body);res.on('close',()=>input.destroy());input.on('error',()=>res.destroy());input.pipe(res);
 }));
 // reference photo bytes (only photos the owner selected as references)
 router.get('/references/:albumId/:photoId/image',wrap(async(req,res)=>{
  const a=req.params.albumId,p=req.params.photoId;if(!albumId(a)||!/^\d{1,32}$/.test(p)||!refsOf(a).includes(p))fail('reference not found',404);
  const info=await providerRequest('flickr.photos.getSizes',{photo_id:p},credentials(),'GET'),sizes=(info?.sizes?.size||[]).filter(s=>s.media!=='video'&&s.source);
  const pick=['Medium 800','Medium 640','Medium','Large','Small 320','Small'].map(l=>sizes.find(s=>s.label===l)).find(Boolean);if(!pick)fail('reference unavailable',404);
  const u=new URL(pick.source);if(u.protocol!=='https:'||!/(^|\.)staticflickr\.com$/.test(u.hostname))fail('reference unavailable',404);
  const response=await request(u,{redirect:'follow',signal:AbortSignal.timeout(30000)});const type=(response.headers.get('content-type')||'').split(';')[0];
  if(!response.ok||!response.body||!type.startsWith('image/'))fail('reference unavailable',404);res.type(type);const input=Readable.fromWeb(response.body);res.on('close',()=>input.destroy());input.on('error',()=>res.destroy());input.pipe(res);
 }));
 // 3. result: albumIds [] = skip; otherwise import into those albums
 router.post('/result',wrap((req,res)=>{
  const b=req.body||{};if(!Array.isArray(b.albumIds)||b.albumIds.length>20||b.albumIds.some(x=>!albumId(x))||new Set(b.albumIds).size!==b.albumIds.length)fail('albumIds must be an array of album ids',400);
  const r=row(b.itemId),prior=done(r.id);
  if(prior){const same=JSON.stringify(JSON.parse(prior.album_ids))===JSON.stringify([...b.albumIds].sort());if(!same)fail('item already has a different result',409);return res.json({ok:true,itemId:r.id,imported:JSON.parse(prior.album_ids),skipped:!JSON.parse(prior.album_ids).length,importStatus:imported(r.id)?.status??null,duplicate:true});}
  if(r.status!=='downloaded')fail('item is not ready (status '+r.status+')',409);if(autoClaimed(r.id))fail('item is held by the old automatic engine',409);
  if(!b.albumIds.length){db.prepare('INSERT INTO done VALUES(?,?,?,?,?)').run(r.id,userId,'[]',null,Date.now());return res.json({ok:true,itemId:r.id,imported:[],skipped:true});}
  const allowed=active(req).map(a=>a.albumId).filter(a=>bound(r).includes(a)),targets=[...b.albumIds].sort();if(targets.some(a=>!allowed.includes(a)))fail('album not enabled; allowed: '+allowed.join(','),400);
  const requestId=crypto.randomUUID();imports.request(userId,{requestId,itemIds:[r.id],albumIds:targets,confirmed:true});
  db.prepare('INSERT INTO done VALUES(?,?,?,?,?)').run(r.id,userId,JSON.stringify(targets),requestId,Date.now());setImmediate(()=>{try{pump();}catch(_){}});
  res.json({ok:true,itemId:r.id,imported:targets,skipped:false,importStatus:imported(r.id)?.status??null});
 }));
 // status of one item after result
 router.get('/items/:itemId',wrap((req,res)=>{const r=row(req.params.itemId),d=done(r.id),i=imported(r.id);res.json({itemId:r.id,lineStatus:r.status,result:d?{albumIds:JSON.parse(d.album_ids),at:new Date(d.at).toISOString()}:null,importStatus:i?.status??null,importError:i?.error_code??null});}));
 if(accounts&&db){
  const auth=accounts.authenticate,me=req=>{store.assertAvailable();const p=store.principal(req.accountToken);if(!p||p.id!==req.actor?.id)fail('登入已失效',401);return p.id;};
  const view=u=>store.listAlbums(u).map(a=>({albumId:a.id,enabled:switchOn(u,a.id)}));
  const reply=fn=>(req,res)=>{res.set('Cache-Control','private, no-store');try{res.json(fn(req));}catch(e){res.status([400,401,404].includes(e.status)?e.status:503).json({error:e.status?e.message:'暫時無法讀取辨識設定'});}};
  accounts.router.get('/mcode/switches',auth,reply(req=>({switches:view(me(req))})));
  accounts.router.put('/mcode/switches/:albumId',auth,reply(req=>{const u=me(req),a=req.params.albumId;if(!albumId(a)||!store.owns(u,'album',a))fail('相簿不存在',404);if(typeof req.body?.enabled!=='boolean')fail('enabled 必須是 true/false',400);db.prepare('INSERT INTO switches VALUES(?,?,?,?) ON CONFLICT(user_id,album_id) DO UPDATE SET enabled=excluded.enabled,at=excluded.at').run(u,a,req.body.enabled?1:0,Date.now());return {switches:view(u)};}));
 }
 app.use('/api/mcode',router);
 // Hank1103: keep the import/notice cycle moving so combined LINE notices go out 60s after the last import.
 if(enabled){const t=setInterval(()=>{try{pump();}catch(_){}},20000);t.unref?.();}
 return {enabled};
}
module.exports={installMcodeApi};
