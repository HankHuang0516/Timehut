'use strict';
const path=require('node:path');
const {photoInAlbum}=require('./account-store');
// This gateway must precede every legacy API and the raw /uploads mount.
// It is enabled only together with account clients and an explicit legacy owner.
function accountGateway(store,authenticate,{legacyOwnerId,readQueue,callbackAllowed=()=>false,tickets=null,photoView=null,sizesView=null,delivery=null,familyMedia=null}={}) {
 if(typeof legacyOwnerId!=='string'||!Object.hasOwn(store.state.users,legacyOwnerId)||store.state.users[legacyOwnerId].disabled)throw new Error('Legacy owner must be explicitly configured before registration activation');
 const deny=res=>res.status(404).json({error:'Resource unavailable'});
 const receiptOwned=(userId,id)=>store.owns(userId,'receipt',id)&&readQueue().some(row=>row.localId===id&&row.ownerUserId===userId);
 const originalOwned=(userId,id)=>receiptOwned(userId,id)&&readQueue().some(row=>{const media=row.flickrPhotoId&&store.state.media[row.flickrPhotoId];return row.localId===id&&row.ownerUserId===userId&&row.photoDeletedAt===undefined&&(!media||media.deletionRequestedAt===undefined&&media.deletedAt===undefined);});
 const photoOwned=(userId,id)=>store.owns(userId,'photo',id);
 const deletionOwned=(userId,id)=>Object.hasOwn(store.state.media,id)&&store.state.media[id].userId===userId;
 const all=(kind,userId,ids)=>Array.isArray(ids)&&ids.length>0&&ids.length<=100&&ids.every(id=>typeof id==='string'&&(kind==='receipt'?receiptOwned(userId,id):photoOwned(userId,id)));
 const guard=(req,res,next)=>{
  const pathname=new URL(req.originalUrl,'http://localhost').pathname;
  // Express accepts case and trailing-slash aliases by default. They must not
  // reach the legacy-owner fallback with different authorization semantics.
  const canonical=pathname.split('/').filter(Boolean);
  if(pathname.endsWith('/')||pathname.includes('//')||!['api','uploads'].includes(canonical[0]))return deny(res);
  if(canonical[0]==='api'){
   if(canonical[1]!==canonical[1]?.toLowerCase())return deny(res);
   const verbs=canonical[1]==='album'||canonical[1]==='photo'?canonical.slice(3):['photos','auth'].includes(canonical[1])?canonical.slice(2):canonical[1]==='uploads'&&['status','retry','file','admission'].includes(canonical[2]?.toLowerCase())?[canonical[2]]:[];
   if(verbs.some(value=>value!==value.toLowerCase()))return deny(res);
  }
   try{const decoded=path.posix.normalize(decodeURIComponent(pathname).replace(/\\/g,'/'));if(decoded==='/uploads/.feedback'||decoded.startsWith('/uploads/.feedback/')||decoded.startsWith('/uploads/')&&path.posix.basename(decoded).startsWith('receiver-'))return deny(res);}catch(_){return deny(res);}
  if(pathname==='/api/version'&&req.method==='GET')return next();
  if(pathname==='/api/auth/callback'&&req.method==='GET'&&callbackAllowed(req.query.oauth_token))return next();
  const admitted=()=>{try{
   res.set('Cache-Control','private, no-store');
   res.set('X-Timehut-Account',req.actor.id);
   const userId=req.actor.id,parts=pathname.split('/').filter(Boolean),body=req.body||{};
   if(parts[1]==='photo'&&!/^[0-9]+$/.test(parts[2]||''))return deny(res);
   if(parts[1]==='uploads'){
    const receipt=parts[2]==='status'||parts[2]==='file'?parts[3]:parts[2];
    if(receipt&&!['status','retry'].includes(receipt)&&!/^[A-Za-z0-9_-]{1,128}$/.test(receipt))return deny(res);
   }
   if(['/api/photos/delete','/api/photos/tags/add','/api/photos/update-date'].includes(pathname)&&(!Array.isArray(body.photoIds)||!body.photoIds.length||body.photoIds.some(id=>typeof id!=='string'||!/^[0-9]+$/.test(id))))return deny(res);
   const requestedAlbum=parts[1]==='album'?parts[2]:pathname==='/api/upload'?req.get('X-Timehut-Album'):null;
   // App UUIDs and legacy numeric IDs are already canonical ASCII. Reject URI
   // aliases before Express decodes params into a different authorization key.
   if(requestedAlbum&&!/^[A-Za-z0-9_-]{1,128}$/.test(requestedAlbum))return deny(res);
   // Known app album IDs cannot fall through to legacy Flickr photoset routes.
   if(requestedAlbum&&Object.hasOwn(store.state.albums,requestedAlbum)&&store.state.albums[requestedAlbum].userId!==userId)return deny(res);
   if(userId===legacyOwnerId){
    req.legacyOwner=true;
    const ownedAppAlbum=(parts[1]==='album'&&store.owns(userId,'album',parts[2])&&store.state.albums[parts[2]].legacyProviderAlbum!==true)||(pathname==='/api/upload'&&store.owns(userId,'album',req.get('X-Timehut-Album')));
    if(requestedAlbum&&!ownedAppAlbum&&!/^[0-9]+$/.test(requestedAlbum))return deny(res);
    const rows=readQueue(),photoOwner=id=>store.state.media[id]?.userId||rows.find(r=>r.flickrPhotoId===id)?.ownerUserId,otherPhoto=id=>photoOwner(id)&&photoOwner(id)!==userId,otherReceipt=id=>rows.some(r=>r.localId===id&&r.ownerUserId&&r.ownerUserId!==userId);
    const receiptId=parts[2]==='status'||parts[2]==='file'?parts[3]:parts[2];
    const foreignPhoto=parts[1]==='photo'&&otherPhoto(parts[2]);
    const foreignReceipt=parts[1]==='uploads'&&otherReceipt(receiptId);
    const foreignBatch=(Array.isArray(body.photoIds)&&body.photoIds.some(otherPhoto))||(Array.isArray(body.localIds)&&body.localIds.some(otherReceipt));
    const foreignOriginal=parts[0]==='uploads'&&rows.some(r=>r.ownerUserId&&r.ownerUserId!==userId&&r.localFilename===decodeURIComponent(parts[1]||''));
    if(foreignPhoto||foreignReceipt||foreignBatch||foreignOriginal)return deny(res);
    if(familyMedia?.handles(req))return familyMedia.handle(req,res);
    const ownScopedPhoto=parts[1]==='photo'&&photoOwner(parts[2])===userId;
    const ownScopedReceipt=parts[1]==='uploads'&&rows.some(r=>r.localId===receiptId&&r.ownerUserId===userId);
    if(!ownedAppAlbum&&!ownScopedPhoto&&!ownScopedReceipt&&pathname!=='/api/uploads/status')return next();
   }
   if(parts[0]!=='api')return deny(res);
   if(pathname==='/api/auth/status'&&req.method==='GET')return res.json({authenticated:true,appAccount:true});
   if(pathname==='/api/albums'&&req.method==='GET')return res.json({albums:store.listAlbums(userId).map(a=>({id:a.id,title:{_content:a.title}}))});
   if(parts[1]==='album'&&parts[3]==='photos'&&parts.length===4&&req.method==='GET'&&store.owns(userId,'album',parts[2])&&photoView){
    const page=Math.max(1,Math.min(100000,Number.parseInt(req.query.page,10)||1)),per=Math.max(1,Math.min(30,Number.parseInt(req.query.per_page,10)||30));
    const rows=Object.values(store.state.media).filter(r=>store.owns(userId,'photo',r.id)&&photoInAlbum(r,parts[2]));
    return res.json({stat:'ok',photoset:{photo:rows.slice((page-1)*per,page*per).map(r=>photoView(r,req)),total:rows.length,pages:Math.max(1,Math.ceil(rows.length/per)),page}});
   }
   if(delivery&&parts.length===4&&['GET','HEAD'].includes(req.method)&&
       ((parts[1]==='photo'&&parts[3]==='image'&&photoOwned(userId,parts[2]))||(parts[1]==='uploads'&&parts[2]==='file'&&originalOwned(userId,parts[3]))))return delivery(req,res);
   if(parts[1]==='photo'&&parts.length===4&&parts[3]==='sizes'&&req.method==='GET')return photoOwned(userId,parts[2])&&sizesView?sizesView(req,res):deny(res);
   if(pathname==='/api/uploads/status'&&req.method==='GET'){
    const rows=readQueue().filter(row=>(row.ownerUserId===userId&&store.owns(userId,'receipt',row.localId))||(userId===legacyOwnerId&&!row.ownerUserId));
    return res.json({total:rows.length,pending:rows.filter(r=>r.status==='pending').length,uploading:rows.filter(r=>r.status==='uploading').length,completed:rows.filter(r=>r.status==='completed'&&r.photoDeletedAt===undefined).length,deleted:rows.filter(r=>r.photoDeletedAt!==undefined).length,error:rows.filter(r=>r.status==='error').length,isProcessing:rows.some(r=>r.status==='uploading'),items:rows.map(r=>({localId:r.localId,filename:r.originalFilename,albumId:r.accountAlbumId||r.albumId||null,byteSize:r.size,status:r.photoDeletedAt!==undefined?'deleted':r.status,flickrPhotoId:r.flickrPhotoId,error:r.error,retryBlocked:r.retryBlocked===true,createdAt:r.createdAt}))});
   }
   if(pathname==='/api/upload'&&req.method==='POST'){
    // Validate the immutable album header BEFORE Multer accepts any file bytes.
    const albumId=req.get('X-Timehut-Album');if(!store.owns(userId,'album',albumId))return deny(res);
    req.memberAdmission=Object.freeze({userId,albumId});return next();
   }
   if(parts[1]==='album'&&parts.length===4&&['add_photos','remove_photos'].includes(parts[3])&&req.method==='POST'&&store.owns(userId,'album',parts[2])&&all('photo',userId,body.photoIds)){
    req.accountMembership=Object.freeze({userId,albumId:parts[2],action:parts[3]==='add_photos'?'add':'remove'});return next();
   }
   if(parts[1]==='uploads'){
    const valid=(parts[2]==='status'&&req.method==='GET'&&parts.length===4)?receiptOwned(userId,parts[3]):(parts[2]==='retry'&&req.method==='POST'&&parts.length===3)?all('receipt',userId,body.localIds):(req.method==='DELETE'&&parts.length===3)?receiptOwned(userId,parts[2]):false;
    return valid?next():deny(res);
   }
   if(parts[1]==='photo'&&parts.length===4&&['GET','HEAD'].includes(req.method)&&parts[3]==='video')return photoOwned(userId,parts[2])?next():deny(res);
   if(parts[1]==='photo'&&parts.length===3&&req.method==='DELETE')return deletionOwned(userId,parts[2])?next():deny(res);
   if(parts[1]==='photo'&&parts.length===4&&parts[3]==='tags'&&req.method==='PUT')return photoOwned(userId,parts[2])?next():deny(res);
   if(pathname==='/api/photos/delete'&&req.method==='POST')return Array.isArray(body.photoIds)&&body.photoIds.length>0&&body.photoIds.length<=100&&body.photoIds.every(id=>deletionOwned(userId,id))?next():deny(res);
   if(parts[1]==='photos'&&req.method==='POST'&&['/api/photos/tags/add','/api/photos/update-date'].includes(pathname))return all('photo',userId,body.photoIds)?next():deny(res);
   // Album listing/media delivery/membership need dedicated scoped handlers;
   // arbitrary provider IDs, raw originals, OAuth admin and legacy proxies deny.
   return deny(res);
  }catch(_){return res.status(503).json({error:'Account resources unavailable'});}};
  const parts=pathname.split('/').filter(Boolean);
  if(tickets&&req.query.ticket&&!req.get('Authorization')&&['GET','HEAD'].includes(req.method)&&parts.length===4){
   let kind,id,variant;
   if(parts[1]==='photo'&&['image','video'].includes(parts[3])){kind='photo';id=parts[2];variant=parts[3]==='image'?(req.query.size||'m'):(req.query.purpose||'playback');}
   if(parts[1]==='uploads'&&parts[2]==='file'){kind='receipt';id=parts[3];variant='original';}
   if(kind){req.actor=tickets.verify(req.query.ticket,kind,id,variant);return req.actor?admitted():deny(res);}
  }
  authenticate(req,res,admitted);
 };
 return {guard,legacyOwnerId};
}
module.exports={accountGateway};
