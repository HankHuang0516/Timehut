'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function accountMedia(store,tickets,{readQueue,uploadsDirectory,providerRequest,credentials,request=fetch,backendOrigin='https://just-healing-production.up.railway.app',photoAllowed=(req,id)=>store.owns(req.actor.id,'photo',id)}={}){
 const sourceURL=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!(/^(live|farm[0-9]+)\.staticflickr\.com$/.test(u.hostname)))throw new Error('Invalid media source');return u;};
 const signed=(req,kind,id,variant,route,issuer=tickets)=>backendOrigin+route+'?'+new URLSearchParams({... (kind==='photo'?(/original|playback/.test(variant)?{purpose:variant}:{size:variant}):{}),ticket:(issuer||tickets).mint(req.accountToken,kind,id,variant)});
 function renderPhoto(row,req,issuer=tickets,representation='full'){const urls={};for(const size of representation==='preview'?['m','l','o']:['sq','t','s','m','l','o'])urls['url_'+size]=signed(req,'photo',row.id,size,'/api/photo/'+row.id+'/image',issuer);const taken=/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')?row.date+' 12:00:00':row.date;return {id:row.id,title:row.title||row.originalFilename||'',media:row.media||'photo',tags:row.tags||'',datetaken:taken||new Date(row.createdAt??store.state.receipts[row.receiptId]?.createdAt).toISOString(),dateupload:String(Math.floor((row.createdAt??store.state.receipts[row.receiptId]?.createdAt)/1000)),...urls,videoPlayback:row.media==='video'?signed(req,'photo',row.id,'playback','/api/photo/'+row.id+'/video',issuer):undefined,videoOriginal:row.media==='video'?signed(req,'photo',row.id,'original','/api/photo/'+row.id+'/video',issuer):undefined};}
 function photoView(row,req){return renderPhoto(row,req);}
 function photoViews(rows,req,representation='full'){
  if(!['full','preview'].includes(representation)||!Array.isArray(rows)||rows.length>(representation==='preview'?480:240))throw new Error('Photo batch unavailable');
  // Keep the existing ticket transaction ceiling. A video-heavy compact page
  // must explicitly downgrade, never omit playback/original or mint partially.
  const count=rows.reduce((n,row)=>n+(representation==='preview'?3:6)+(row.media==='video'?2:0),0);
  if(count>1920){const error=new Error('Photo batch ticket capacity exceeded');error.code='PHOTO_BATCH_CAPACITY';throw error;}
  const entries=[];for(const row of rows)renderPhoto(row,req,{mint:(_token,kind,id,variant)=>{entries.push({kind,id,variant});return '';}},representation);
  const values=tickets.mintMany(req.accountToken,entries);let index=0;
  return rows.map(row=>renderPhoto(row,req,{mint:()=>values[index++]},representation));
 }
 function localURL(row,req){return signed(req,'receipt',row.localId,'original','/api/uploads/file/'+row.localId);}
 // Input limits admit ordinary 12MP/48MP phone photos while bounding work.
 // Output/parallelism limits bound response bytes and concurrent decoders.
 // These are resource limits, not a 1000ms performance claim.
 const originalBytes=8*1024*1024,originalPixels=60*1000*1000,originalEdge=16000,decodedBytes=240*1000*1000,previewBytes=256*1024;
 let activePreviews=0;
 function photoAuthority(req,id,variant){
  store.assertAvailable();
  const actor=req.accountToken?store.principal(req.accountToken):tickets.verify(req.query.ticket,'photo',id,variant);
  const media=store.state.media[id];
  if(!actor||actor.id!==req.actor?.id||photoAllowed(req,id)!==true||media&&(media.deletedAt!==undefined||media.deletionRequestedAt!==undefined)){
   const error=Error('Media authority changed');error.code='MEDIA_AUTHORITY_CHANGED';throw error;
  }
  return actor;
 }
 function providerScope(req,id,variant){
  photoAuthority(req,id,variant);
  const current=credentials(),keys=['key','secret','token','tokenSecret'],scope={};
  for(const key of keys){if(typeof current?.[key]!=='string'||!current[key])throw Error('Provider unavailable');scope[key]=current[key];}
  const check=()=>{photoAuthority(req,id,variant);const latest=credentials();if(keys.some(key=>latest?.[key]!==scope[key]))throw Error('Provider authority changed');};
  check();return {scope:Object.freeze(scope),check};
 }
 async function verified(promise,check,discard){
  let value,error;try{value=await promise;}catch(e){error=e;}
  try{check();}catch(e){if(discard)discard(value);throw e;}
  if(error)throw error;return value;
 }
 const cancel=response=>{try{response?.body?.cancel().catch(()=>{});}catch(_){}};
 function previewSource(req,id){
  const actor=photoAuthority(req,id,req.query.size||'m');
  if(!store.owns(actor.id,'photo',id))return null;
  const state=store.state,media=state.media[id],receipt=media&&state.receipts[media.receiptId];
  if(!media||media.id!==id||media.userId!==actor.id||media.media!=='photo'||media.deletedAt!==undefined||media.deletionRequestedAt!==undefined||!receipt||receipt.id!==media.receiptId||receipt.userId!==actor.id||receipt.albumId!==media.albumId||!store.owns(actor.id,'receipt',receipt.id))return null;
  const allRows=readQueue(),rows=allRows.filter(row=>row.localId===receipt.id);
  if(rows.length!==1)return null;
  const row=rows[0];
  if(allRows.some(other=>other.localId!==receipt.id&&(other.flickrPhotoId===id||other.localPath===row.localPath||other.localFilename===row.localFilename)))return null;
  if(!receipt.queueItem||['localId','ownerUserId','flickrPhotoId','accountAlbumId','status','photoDeletedAt','size','mimetype','localPath','localFilename','contentSha256'].some(key=>receipt.queueItem[key]!==row[key])||!/^[a-f0-9]{64}$/.test(row.contentSha256||''))return null;
  if(row.status!=='completed'||row.ownerUserId!==actor.id||row.flickrPhotoId!==id||row.accountAlbumId!==receipt.albumId||row.photoDeletedAt!==undefined||!Number.isSafeInteger(row.size)||row.size<=0||row.size>originalBytes||media.bytes!==row.size||!['image/jpeg','image/png','image/webp'].includes(row.mimetype)||typeof row.localPath!=='string'||typeof row.localFilename!=='string')return null;
  const actual=path.resolve(row.localPath),base=path.resolve(uploadsDirectory);
  if(path.dirname(actual)!==base||path.basename(actual)!==row.localFilename||fs.realpathSync(base)!==base||fs.realpathSync(actual)!==actual)return null;
  return {actual,mime:row.mimetype,size:row.size,sha256:row.contentSha256,receiptId:receipt.id,owner:actor.id};
 }
 async function localPreview(req,res,id,size){
  // Square/thumb variants retain their provider crop; originals/export do too.
  if(!['m','l'].includes(size))return false;
  let source;
  try{source=previewSource(req,id);}catch(error){if(error.code==='MEDIA_AUTHORITY_CHANGED')throw error;return false;}
  if(!source)return false;
  // No queue or retained authorization: overload uses the original provider path.
  if(activePreviews>=2)return false;
  activePreviews++;
  let fd;
  try{
   fd=fs.openSync(source.actual,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
   const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size!==source.size||stat.nlink!==1)return false;
   const bytes=Buffer.alloc(stat.size+1),read=fs.readSync(fd,bytes,0,bytes.length,0);
   if(read!==stat.size)return false;
   const body=bytes.subarray(0,read);
   if(crypto.createHash('sha256').update(body).digest('hex')!==source.sha256)return false;
   const unchanged=()=>{try{
    const current=previewSource(req,id),after=fs.fstatSync(fd),linked=fs.lstatSync(source.actual);
    if(!current||JSON.stringify(current)!==JSON.stringify(source)||after.nlink!==1||['dev','ino','size','mtimeMs','ctimeMs'].some(key=>stat[key]!==after[key])||!linked.isFile()||linked.dev!==stat.dev||linked.ino!==stat.ino)throw Error('Changed');
   }catch(_){const error=Error('Local preview authority changed');error.code='OWNED_PREVIEW_CHANGED';throw error;}};
   // Every asynchronous decode/encode, including failures, rechecks authority.
   const fresh=async promise=>{let value,error;try{value=await promise;}catch(e){error=e;}unchanged();if(error)throw error;return value;};
   let output=body,mime=source.mime;
   try{
    const sharp=require('sharp'),options={limitInputPixels:originalPixels,failOn:'warning',animated:false,sequentialRead:true};
    const metadata=await fresh(sharp(body,options).metadata()),edge=size==='m'?500:1024;
    if(metadata.format!==({'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'}[source.mime])||!metadata.width||!metadata.height||metadata.width>originalEdge||metadata.height>originalEdge||metadata.width*metadata.height>originalPixels||(metadata.pages||1)!==1)return false;
    const rasterBytes=metadata.width*metadata.height*metadata.channels*({uchar:1,ushort:2}[metadata.depth]||Infinity);
    if(!Number.isSafeInteger(rasterBytes)||metadata.channels<1||metadata.channels>4||rasterBytes>decodedBytes)return false;
    if(body.length<=previewBytes&&metadata.width<=edge&&metadata.height<=edge&&(!metadata.orientation||metadata.orientation===1)){
     await fresh(sharp(body,options).stats()); // Preserve eligible small originals byte-exact.
    }else{
     output=await fresh(sharp(body,options).rotate().resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).webp({quality:80,effort:2}).toBuffer());
     if(!output.length||output.length>previewBytes)return false;
     const decoded=sharp(output,{limitInputPixels:edge*edge,failOn:'warning',animated:false});
     const rendered=await fresh(decoded.metadata());
     if(rendered.format!=='webp'||!rendered.width||!rendered.height||rendered.width>edge||rendered.height>edge||(rendered.pages||1)!==1||rendered.orientation&&rendered.orientation!==1)return false;
     await fresh(decoded.stats()); // Do not return an unverified encoded output.
     mime='image/webp';
    }
   }catch(error){if(error.code==='OWNED_PREVIEW_CHANGED')throw error;return false;}
   unchanged();res.type(mime);res.set('Content-Length',String(output.length));
   if(req.method==='HEAD')res.end();else res.end(output);
   return true;
  }finally{try{if(fd!==undefined)fs.closeSync(fd);}finally{activePreviews--;}}
 }
 async function sizesView(req,res){try{
  const id=new URL(req.originalUrl,'http://localhost').pathname.split('/')[3],authority=providerScope(req,id,'m');
  authority.check();const info=await verified(providerRequest('flickr.photos.getSizes',{photo_id:id},authority.scope,'GET'),authority.check);
  const variants={Square:'sq','Large Square':'sq',Thumbnail:'t',Small:'s','Small 320':'s',Medium:'m','Medium 640':'m','Medium 800':'m',Large:'l','Large 1600':'l','Large 2048':'l',Original:'o'};
  const size=(info.sizes?.size||[]).filter(r=>r.source).map(r=>{const video=r.media==='video',variant=video?(/original/i.test(r.label)?'original':'playback'):(variants[r.label]||'m');return {label:String(r.label||''),width:Number(r.width)||0,height:Number(r.height)||0,media:video?'video':'photo',source:signed(req,'photo',id,variant,'/api/photo/'+id+(video?'/video':'/image'))};});
  authority.check();res.set('Cache-Control','private, no-store');res.json({stat:'ok',sizes:{size}});
 }catch(_){res.status(503).json({error:'Media temporarily unavailable'});}}
 async function delivery(req,res){let upstream;try{
  res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});const parts=new URL(req.originalUrl,'http://localhost').pathname.split('/').filter(Boolean);
  if(parts[1]==='uploads'){
   const row=readQueue().find(r=>r.localId===parts[3]&&r.ownerUserId===req.actor.id);if(!row||!store.owns(req.actor.id,'receipt',row.localId))return res.status(404).end();const media=row.flickrPhotoId&&store.state?.media?.[row.flickrPhotoId];if(row.photoDeletedAt!==undefined||media&&(media.deletionRequestedAt!==undefined||media.deletedAt!==undefined))return res.status(404).end();const actual=path.resolve(row.localPath),base=path.resolve(uploadsDirectory);if(path.dirname(actual)!==base||path.basename(actual)!==row.localFilename||!fs.existsSync(actual))return res.status(404).end();res.type(row.mimetype);return res.sendFile(actual);
  }
  const id=parts[2];if(photoAllowed(req,id)!==true)return res.status(404).end();const size=req.query.size||'m';if(!['sq','t','s','m','l','o'].includes(size))return res.status(404).end();
  photoAuthority(req,id,size);
  if(await localPreview(req,res,id,size))return;
  // localPreview can decline synchronously but its await still yields: revalidate.
  const authority=providerScope(req,id,size);authority.check();
  const info=await verified(providerRequest('flickr.photos.getSizes',{photo_id:id},authority.scope,'GET'),authority.check),sizes=(info.sizes?.size||[]).filter(r=>r.media!=='video'&&r.source);if(!sizes.length)return res.status(404).end();
  const labels={sq:'Square',t:'Thumbnail',s:'Small',m:'Medium',l:'Large',o:'Original'},exact=sizes.find(r=>r.label===labels[size]);
  if(size==='o'&&!exact)return res.status(404).json({error:'Original unavailable'});
  const variants={sq:['Square','Large Square','Thumbnail','Small','Small 320','Medium','Medium 640','Medium 800','Large','Large 1600','Large 2048'],t:['Thumbnail','Small','Small 320','Medium','Medium 640','Medium 800','Large','Large Square','Square'],s:['Small','Small 320','Medium','Medium 640','Medium 800','Large','Large Square','Thumbnail','Square'],m:['Medium','Medium 640','Medium 800','Large','Large 1600','Large 2048','Small 320','Small','Thumbnail','Large Square','Square'],l:['Large','Large 1600','Large 2048','Medium 800','Medium 640','Medium','Small 320','Small','Thumbnail','Large Square','Square']};
  const selected=exact||(variants[size]||[]).map(label=>sizes.find(row=>row.label===label)).find(Boolean);
  if(!selected)return res.status(404).json({error:'Preview unavailable'});
  let url=sourceURL(selected.source),response;
  for(let hop=0;hop<6;hop++){
   authority.check();response=await verified(request(url,{method:req.method,redirect:'manual',signal:AbortSignal.timeout(30000)}),authority.check,cancel);
   upstream=response;
   if(![301,302,303,307,308].includes(response.status))break;
   const location=response.headers.get('location');cancel(response);if(!location)throw new Error('Invalid redirect');url=sourceURL(new URL(location,url).href);if(hop===5)throw new Error('Too many redirects');
  }
  authority.check();
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();if(response.status!==200||!['image/jpeg','image/png','image/gif','image/webp','image/avif','image/heic','image/heif'].includes(type))throw new Error('Image unavailable');res.type(type);const length=response.headers.get('content-length');if(length&&/^\d+$/.test(length))res.set('Content-Length',length);
  if(size==='o'){const ext={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/avif':'avif','image/heic':'heic','image/heif':'heif'}[type];res.set('Content-Disposition','attachment; filename="'+id+'.'+ext+'"');}
  if(req.method==='HEAD'){cancel(response);authority.check();return res.end();}
  const reader=response.body.getReader(),closed=()=>{try{reader.cancel().catch(()=>{});}catch(_){}};res.on('close',closed);
  try{
   for(;;){
    authority.check();const chunk=await verified(reader.read(),authority.check);
    if(chunk.done)break;authority.check();
    if(!res.write(chunk.value)){
     await verified(new Promise((resolve,reject)=>{
      const cleanup=()=>{res.off('drain',drain);res.off('close',close);res.off('error',fail);};
      const drain=()=>{cleanup();resolve();},close=()=>{cleanup();reject(Error('Delivery closed'));},fail=error=>{cleanup();reject(error);};
      res.once('drain',drain);res.once('close',close);res.once('error',fail);
     }),authority.check);
    }
   }
   authority.check();res.end();
  }finally{res.off('close',closed);closed();}
 }catch(_){cancel(upstream);if(!res.headersSent)res.status(503).json({error:'Media temporarily unavailable'});else res.destroy();}}
 return {photoView,photoViews,localURL,sizesView,delivery};
}
module.exports={accountMedia};
