'use strict';
// Mounted on accounts.router so native/Bearer and browser/CSRF remain shared.
function installGoldenSelectionRoutes(accounts,selections,{provider,photoViews}={}){
 const root='/line-albums/golden',auth=accounts.authenticate;
 const current=req=>{selections.store.assertAvailable();const p=selections.store.principal(req.accountToken);if(!p||p.id!==req.actor?.id||req.aborted)throw Object.assign(Error('登入已變更，請重新開啟'),{status:401});return p.id;};
 const reply=fn=>async(req,res)=>{res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});try{const p=new URL(req.originalUrl,'http://localhost').pathname;if(p.includes('%')||p.includes('//')||p.endsWith('/')||!p.startsWith('/api/accounts'+root))return res.sendStatus(404);res.json(await fn(req));}catch(e){res.status([400,401,404,409].includes(e.status)?e.status:503).json({error:e.status?e.message:'參考照片暫時無法讀取，請稍後重試'});}};
 const photos=(rows,req)=>{current(req);return photoViews(rows,req);};
 accounts.router.get(root,auth,reply(req=>({schema:1,albums:selections.list(current(req))})));
 accounts.router.get(root+'/:albumId',auth,reply(async req=>{
  const u=current(req),a=req.params.albumId,state=selections.get(u,a);let rows=[],referencesAvailable=true;
  try{if(state.enabled)rows=await provider.references(u,a,state.photoIds,()=>current(req));}catch(e){if(e.status!==404)throw e;referencesAvailable=false;}
  current(req);if(selections.get(u,a).revision!==state.revision)throw Object.assign(Error('參考照片已更新，請重新讀取'),{status:409});return {...state,referencesAvailable,referencePhotos:photos(rows,req)};
 }));
 accounts.router.get(root+'/:albumId/photos',auth,reply(async req=>{
  if(Object.keys(req.query).some(k=>k!=='page')||!/^\d{1,6}$/.test(String(req.query.page||'1'))||Number(req.query.page||1)<1)throw Object.assign(Error('照片頁碼無效'),{status:400});
  const u=current(req),a=req.params.albumId,v=await provider.photos(u,a,Number(req.query.page||1),()=>current(req));current(req);return {photoset:{id:a,photo:photos(v.rows,req),page:v.page,pages:v.pages,total:v.total}};
 }));
 accounts.router.put(root+'/:albumId',auth,reply(async req=>{
  const u=current(req),a=req.params.albumId,b=req.body;selections.album(u,a);
  if(!b||!['expectedRevision,photoIds','consent,expectedRevision,photoIds'].includes(Object.keys(b).sort().join(','))||!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0||!Array.isArray(b.photoIds)||b.photoIds.length<1||b.photoIds.length>5||new Set(b.photoIds).size!==b.photoIds.length||b.photoIds.some(id=>typeof id!=='string'||!/^\d{1,32}$/.test(id))||Object.hasOwn(b,'consent')&&b.consent!==true)throw Object.assign(Error('請選擇1至5張參考照片'),{status:400});
  const rows=await provider.references(u,a,b.photoIds,()=>current(req));current(req);return selections.configure(u,a,b,rows);
 }));
 accounts.router.delete(root+'/:albumId',auth,reply(req=>{if(!req.body||Object.keys(req.body).join(',')!=='expectedRevision')throw Object.assign(Error('停用版本無效'),{status:400});return selections.revoke(current(req),req.params.albumId,req.body.expectedRevision);}));
}
module.exports={installGoldenSelectionRoutes};
