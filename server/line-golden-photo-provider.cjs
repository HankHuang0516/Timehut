'use strict';
const {photoInAlbum}=require('./account-store');
const fail=(message,status=404)=>{throw Object.assign(Error(message),{status});};
function goldenPhotoProvider(selections,{providerRequest,credentials,storageUserId}={}){
 const store=selections.store;
 function album(user,id,current){current();return selections.album(user,id);}
 function local(user,a,id,current){album(user,a,current);const s=store.state,p=s.media[id];if(!p||!store.owns(user,'photo',id)||!photoInAlbum(p,a)||p.media==='video')fail('照片不在此相簿，或已無法使用');return {...p,media:'photo'};}
 async function connection(user,a,current){
  const row=album(user,a,current);if(!row.legacyProviderAlbum)return null;
  if(store.state.legacyHousehold?.ownerUserId!==user)fail('相簿無法使用');
  const creds={...credentials()},call=async(method,params)=>{album(user,a,current);const v=await providerRequest(method,params,creds,'GET');album(user,a,current);if(v?.stat!=='ok')throw Error('Provider unavailable');return v;};
  const login=await call('flickr.test.login',{});if(login.user?.id!==storageUserId)throw Error('Provider principal changed');return call;
 }
 async function references(user,a,ids,current){
  const call=await connection(user,a,current),rows=[];
  for(const id of ids){
   if(typeof id!=='string'||!/^\d{1,32}$/.test(id))fail('參考照片格式無效',400);
   if(!call){rows.push(local(user,a,id,current));continue;}
   const existing=store.state.media[id];if(existing&&(existing.userId!==user||existing.deletedAt!==undefined||existing.deletionRequestedAt!==undefined))fail('照片已無法使用');
   const info=await call('flickr.photos.getInfo',{photo_id:id}),p=info.photo;
   if(p?.id!==id||p.owner?.nsid!==storageUserId||p.media==='video')fail('照片已無法使用');
   const contexts=await call('flickr.photos.getAllContexts',{photo_id:id});if(!Array.isArray(contexts.set)||!contexts.set.some(v=>v.id===a))fail('照片已不在此相簿');
   album(user,a,current);rows.push({id,media:'photo',title:String(p.title?._content||''),createdAt:Number(p.dates?.posted||0)*1000});
  }
  return rows;
 }
 async function photos(user,a,page,current){
  const call=await connection(user,a,current),per=30;
  if(call){
   const data=await call('flickr.photosets.getPhotos',{photoset_id:a,user_id:storageUserId,extras:'date_taken,date_upload,media',page:String(page),per_page:String(per)}),s=data.photoset;
   if(!s||s.id!==a||s.owner&&s.owner!==storageUserId||Number(s.page)!==page||!Array.isArray(s.photo)||s.photo.length>per||!Number.isSafeInteger(Number(s.pages))||Number(s.pages)<0)throw Error('Provider page unavailable');
   const snapshot=store.state;const rows=s.photo.filter(p=>p.media!=='video').map(p=>{if(!/^\d{1,32}$/.test(p.id)||p.owner&&p.owner!==storageUserId)throw Error('Provider photo unavailable');const local=snapshot.media[p.id];if(local&&(local.userId!==user||local.deletedAt!==undefined||local.deletionRequestedAt!==undefined))return null;return {id:p.id,title:String(p.title||''),media:'photo',createdAt:Number(p.dateupload||0)*1000};}).filter(Boolean);
   return {rows,page,pages:Math.max(1,Number(s.pages)),total:Number(s.total)};
  }
  const rows=Object.values(store.state.media).filter(p=>/^\d{1,32}$/.test(p.id)&&store.owns(user,'photo',p.id)&&photoInAlbum(p,a)&&p.media!=='video').sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)||a.id.localeCompare(b.id));
  return {rows:rows.slice((page-1)*per,page*per),page,pages:Math.max(1,Math.ceil(rows.length/per)),total:rows.length};
 }
 return {references,photos};
}
module.exports={goldenPhotoProvider};
