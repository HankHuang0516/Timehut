'use strict';
// Read original family photos through the same session-bound media routes.
// Provider reads never invent app receipts or adopt another tenant's photo.
const {familyContext,requireOwner}=require('./account-owner-bootstrap');
const {accountMedia}=require('./account-media');
const {createVideoHandler}=require('./video-media');
function familyMedia(store,tickets,{providerRequest,credentials,storageUserId,request=fetch,backendOrigin='https://just-healing-production.up.railway.app',photoView}={}){
 if(typeof storageUserId!=='string'||!/^\d+@N\d+$/.test(storageUserId))throw new Error('Explicit family storage principal required');
 const numeric=value=>typeof value==='string'&&/^\d{1,32}$/.test(value);
 const number=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid provider pagination');return n;};
 function eligible(userId,id){
  if(!numeric(id)||userId!==requireOwner(store))return false;
  const row=store.state.media[id];
  return !row||(row.userId===userId&&row.deletedAt===undefined&&row.deletionRequestedAt===undefined);
 }
 function albums(userId){return familyContext(store,userId).map(child=>child.albumId);}
 function authority(req){
  const owner=requireOwner(store);if(req.actor?.id!==owner)throw new Error('Family unavailable');
  let principal;
  if(req.accountToken)principal=store.principal(req.accountToken);
  else {
   const parts=new URL(req.originalUrl,'http://localhost').pathname.split('/').filter(Boolean);
   if(parts[1]==='photo'&&['image','video'].includes(parts[3]))principal=tickets.verify(req.query.ticket,'photo',parts[2],parts[3]==='image'?(req.query.size||'m'):(req.query.purpose||'playback'));
  }
  if(principal?.id!==owner||req.aborted||req.res?.destroyed)throw new Error('Family session unavailable');
  return owner;
 }
 async function connection(req){
  const owner=authority(req),creds={...credentials()};
  const call=async(method,params)=>{authority(req);const value=await providerRequest(method,params,creds,'GET');authority(req);if(value?.stat!=='ok')throw new Error('Family provider unavailable');return value;};
  const identity=await call('flickr.test.login',{});if(identity.user?.id!==storageUserId)throw new Error('Family storage principal changed');
  return {owner,creds,call};
 }
 function providerPhoto(row,req){
  if(!row||!numeric(row.id)||!eligible(req.actor.id,row.id)||row.owner&&row.owner!==storageUserId)throw new Error('Family photo ownership conflict');
  const created=number(row.dateupload||0)*1000;if(!Number.isSafeInteger(created))throw new Error('Invalid family photo date');
  const view={id:row.id,title:typeof row.title==='string'?row.title:'',description:typeof row.description?._content==='string'?row.description._content:'',tags:typeof row.tags==='string'?row.tags:'',date:typeof row.datetaken==='string'?row.datetaken:'',media:row.media==='video'?'video':'photo',createdAt:created};
  return photoView(view,req);
 }
 async function pageOf(req,link,album,page,per){
  if(!albums(link.owner).includes(album))throw new Error('Family album unavailable');
  const data=await link.call('flickr.photosets.getPhotos',{photoset_id:album,user_id:storageUserId,extras:'date_taken,date_upload,description,tags,media',page:String(page),per_page:String(per)}),set=data.photoset;
  if(!set||set.id!==album||!Array.isArray(set.photo)||set.photo.length>per||number(set.page)!==page||set.owner&&set.owner!==storageUserId)throw new Error('Family album response unavailable');
  const total=number(set.total),pages=number(set.pages);if(total>0&&pages===0||pages>0&&page>pages&&set.photo.length||pages>0&&pages<Math.ceil(total/per))throw new Error('Incomplete family pagination');
  // Validate every row before emitting any names, counts or signed URLs.
  for(const row of set.photo)if(!row||!numeric(row.id)||!eligible(link.owner,row.id)||row.owner&&row.owner!==storageUserId)throw new Error('Family photo ownership conflict');
  return {rows:set.photo,total,pages:Math.max(1,pages)};
 }
 function paging(req){return {page:Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1)),per:Math.max(1,Math.min(30,parseInt(req.query.per_page,10)||30))};}
 async function albumView(req,res){
  const link=await connection(req),album=new URL(req.originalUrl,'http://localhost').pathname.split('/')[3],{page,per}=paging(req),result=await pageOf(req,link,album,page,per);
  authority(req);res.json({stat:'ok',photoset:{id:album,photo:result.rows.map(row=>providerPhoto(row,req)),total:result.total,pages:result.pages,page}});
 }
 async function photos(req,res){
  try{
   const link=await connection(req),selected=req.query.album,{page,per}=paging(req),query=typeof req.query.query==='string'?req.query.query.slice(0,200).toLocaleLowerCase():'',ids=albums(link.owner);
   if(selected&&!ids.includes(selected))return res.status(404).json({error:'Resource unavailable'});
   const seen=new Set(),chosen=[];let count=0;
   const include=(id,fields,make)=>{if(seen.has(id))return;seen.add(id);if(query&&!fields.some(v=>typeof v==='string'&&v.toLocaleLowerCase().includes(query)))return;count++;if(count>(page-1)*per&&count<=page*per)chosen.push(make());};
   for(const album of selected?[selected]:ids){
    let current=1,pages=1,expectedTotal=null,received=0;const albumSeen=new Set();
    do {
     const result=await pageOf(req,link,album,current,500);
     if(expectedTotal===null)expectedTotal=result.total;else if(expectedTotal!==result.total)throw new Error('Family album changed during search');
     pages=result.pages;received+=result.rows.length;
     for(const row of result.rows){if(albumSeen.has(row.id))throw new Error('Family album changed during search');albumSeen.add(row.id);include(row.id,[row.title,row.tags,row.description?._content],()=>providerPhoto(row,req));}
     if(current<pages&&result.rows.length===0)throw new Error('Incomplete family album page');
     current++;
    }while(current<=pages);
    if(received!==expectedTotal)throw new Error('Incomplete family album search');
   }
   // Global family search also includes the owner's new virtual app albums.
   if(!selected)for(const row of Object.values(store.state.media))if(store.owns(link.owner,'photo',row.id))include(row.id,[row.title,row.tags,row.description,row.originalFilename],()=>photoView(row,req));
   authority(req);res.json({stat:'ok',photos:{photo:chosen,total:count,pages:Math.max(1,Math.ceil(count/per)),page}});
  }catch(_){if(!res.headersSent)res.status(503).json({error:'家庭照片尚未讀取完整，請稍後重試'});}
 }
 async function prove(req,id){
  const owner=authority(req);if(!eligible(owner,id))throw new Error('Family photo unavailable');
  const link=await connection(req),info=await link.call('flickr.photos.getInfo',{photo_id:id});
  if(info.photo?.id!==id||info.photo.owner?.nsid!==storageUserId)throw new Error('Family photo principal unavailable');
  const contexts=await link.call('flickr.photos.getAllContexts',{photo_id:id}),allowed=albums(owner);
  if(!Array.isArray(contexts.set)||!contexts.set.some(set=>allowed.includes(set.id)))throw new Error('Photo outside original family albums');
  if(!eligible(owner,id))throw new Error('Family photo ownership changed');
  return {...link,info};
 }
 function handles(req){
  if(!['GET','HEAD'].includes(req.method)||req.actor?.id!==requireOwner(store))return false;
  const parts=new URL(req.originalUrl,'http://localhost').pathname.split('/').filter(Boolean);
  if(parts[1]==='album'&&parts.length===4&&parts[3]==='photos')return numeric(parts[2]);
  return parts[1]==='photo'&&parts.length===4&&['image','video','sizes'].includes(parts[3])&&!store.owns(req.actor.id,'photo',parts[2]);
 }
 async function handle(req,res){
  res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  try{
   const parts=new URL(req.originalUrl,'http://localhost').pathname.split('/').filter(Boolean);
   if(parts[1]==='album'){if(!albums(req.actor.id).includes(parts[2]))return res.status(404).end();return await albumView(req,res);}
   if(!numeric(parts[2])||!eligible(req.actor.id,parts[2]))return res.status(404).end();
   const proof=await prove(req,parts[2]);
   const api=async(method,values)=>{authority(req);if(method==='flickr.photos.getInfo'&&values.photo_id===parts[2])return proof.info;return proof.call(method,values);};
   const guardedRequest=async(...args)=>{
    authority(req);const response=await request(...args);authority(req);
    if(!response.body)return response;
    const reader=response.body.getReader();let done=false;
    const body=new ReadableStream({async pull(stream){try{authority(req);const next=await reader.read();authority(req);if(next.done){done=true;stream.close();}else stream.enqueue(next.value);}catch(error){stream.error(error);await reader.cancel().catch(()=>{});}},async cancel(reason){if(!done)await reader.cancel(reason);}},{highWaterMark:0});
    return new Response(body,{status:response.status,headers:response.headers});
   };
   if(parts[3]==='video'){
    req.params={...req.params,id:parts[2]};
    return await createVideoHandler(()=>proof.creds,api,guardedRequest)(req,res);
   }
   const media=accountMedia(store,tickets,{providerRequest:api,credentials:()=>proof.creds,request:guardedRequest,backendOrigin,photoAllowed:(request,id)=>id===parts[2]&&eligible(authority(request),id)});
   return await (parts[3]==='sizes'?media.sizesView(req,res):media.delivery(req,res));
  }catch(_){if(!res.headersSent)res.status(503).json({error:'家庭媒體尚未確認，請稍後重試'});else res.destroy();}
 }
 return {eligible,handles,handle,photos};
}
module.exports={familyMedia};
