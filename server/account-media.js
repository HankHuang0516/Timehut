'use strict';
const fs=require('node:fs'),path=require('node:path'),{Readable}=require('node:stream');
function accountMedia(store,tickets,{readQueue,uploadsDirectory,providerRequest,credentials,request=fetch,backendOrigin='https://just-healing-production.up.railway.app',photoAllowed=(req,id)=>store.owns(req.actor.id,'photo',id)}={}){
 const sourceURL=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!(/^(live|farm[0-9]+)\.staticflickr\.com$/.test(u.hostname)))throw new Error('Invalid media source');return u;};
 const signed=(req,kind,id,variant,route)=>backendOrigin+route+'?'+new URLSearchParams({... (kind==='photo'?(/original|playback/.test(variant)?{purpose:variant}:{size:variant}):{}),ticket:tickets.mint(req.accountToken,kind,id,variant)});
 function photoView(row,req){const urls={};for(const size of ['sq','t','s','m','l','o'])urls['url_'+size]=signed(req,'photo',row.id,size,'/api/photo/'+row.id+'/image');const taken=/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')?row.date+' 12:00:00':row.date;return {id:row.id,title:row.title||row.originalFilename||'',media:row.media||'photo',tags:row.tags||'',datetaken:taken||new Date(row.createdAt??store.state.receipts[row.receiptId]?.createdAt).toISOString(),dateupload:String(Math.floor((row.createdAt??store.state.receipts[row.receiptId]?.createdAt)/1000)),...urls,videoPlayback:row.media==='video'?signed(req,'photo',row.id,'playback','/api/photo/'+row.id+'/video'):undefined,videoOriginal:row.media==='video'?signed(req,'photo',row.id,'original','/api/photo/'+row.id+'/video'):undefined};}
 function localURL(row,req){return signed(req,'receipt',row.localId,'original','/api/uploads/file/'+row.localId);}
 async function sizesView(req,res){try{
  const id=new URL(req.originalUrl,'http://localhost').pathname.split('/')[3];if(photoAllowed(req,id)!==true)return res.status(404).end();
  const info=await providerRequest('flickr.photos.getSizes',{photo_id:id},credentials(),'GET');
  const variants={Square:'sq','Large Square':'sq',Thumbnail:'t',Small:'s','Small 320':'s',Medium:'m','Medium 640':'m','Medium 800':'m',Large:'l','Large 1600':'l','Large 2048':'l',Original:'o'};
  const size=(info.sizes?.size||[]).filter(r=>r.source).map(r=>{const video=r.media==='video',variant=video?(/original/i.test(r.label)?'original':'playback'):(variants[r.label]||'m');return {label:String(r.label||''),width:Number(r.width)||0,height:Number(r.height)||0,media:video?'video':'photo',source:signed(req,'photo',id,variant,'/api/photo/'+id+(video?'/video':'/image'))};});
  res.set('Cache-Control','private, no-store');res.json({stat:'ok',sizes:{size}});
 }catch(_){res.status(503).json({error:'Media temporarily unavailable'});}}
 async function delivery(req,res){try{
  res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});const parts=new URL(req.originalUrl,'http://localhost').pathname.split('/').filter(Boolean);
  if(parts[1]==='uploads'){
   const row=readQueue().find(r=>r.localId===parts[3]&&r.ownerUserId===req.actor.id);if(!row||!store.owns(req.actor.id,'receipt',row.localId))return res.status(404).end();const media=row.flickrPhotoId&&store.state?.media?.[row.flickrPhotoId];if(row.photoDeletedAt!==undefined||media&&(media.deletionRequestedAt!==undefined||media.deletedAt!==undefined))return res.status(404).end();const actual=path.resolve(row.localPath),base=path.resolve(uploadsDirectory);if(path.dirname(actual)!==base||path.basename(actual)!==row.localFilename||!fs.existsSync(actual))return res.status(404).end();res.type(row.mimetype);return res.sendFile(actual);
  }
  const id=parts[2];if(photoAllowed(req,id)!==true)return res.status(404).end();const size=req.query.size||'m';if(!['sq','t','s','m','l','o'].includes(size))return res.status(404).end();
  const info=await providerRequest('flickr.photos.getSizes',{photo_id:id},credentials(),'GET'),sizes=(info.sizes?.size||[]).filter(r=>r.media!=='video'&&r.source);if(!sizes.length)return res.status(404).end();
  const labels={sq:'Square',t:'Thumbnail',s:'Small',m:'Medium',l:'Large',o:'Original'},exact=sizes.find(r=>r.label===labels[size]);
  if(size==='o'&&!exact)return res.status(404).json({error:'Original unavailable'});
  const selected=exact||sizes[sizes.length-1];let url=sourceURL(selected.source),response;
  for(let hop=0;hop<6;hop++){response=await request(url,{method:req.method,redirect:'manual',signal:AbortSignal.timeout(30000)});if(![301,302,303,307,308].includes(response.status))break;const location=response.headers.get('location');if(!location)throw new Error('Invalid redirect');url=sourceURL(new URL(location,url).href);if(hop===5)throw new Error('Too many redirects');}
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();if(response.status!==200||!['image/jpeg','image/png','image/gif','image/webp','image/avif','image/heic','image/heif'].includes(type))throw new Error('Image unavailable');res.type(type);const length=response.headers.get('content-length');if(length&&/^\d+$/.test(length))res.set('Content-Length',length);
  if(size==='o'){const ext={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/avif':'avif','image/heic':'heic','image/heif':'heif'}[type];res.set('Content-Disposition','attachment; filename="'+id+'.'+ext+'"');}
  if(req.method==='HEAD')return res.end();const input=Readable.fromWeb(response.body);res.on('close',()=>input.destroy());input.on('error',()=>res.destroy());input.pipe(res);
 }catch(_){if(!res.headersSent)res.status(503).json({error:'Media temporarily unavailable'});else res.destroy();}}
 return {photoView,localURL,sizesView,delivery};
}
module.exports={accountMedia};
