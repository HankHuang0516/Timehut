'use strict';
// Only the existing Flickr principal can supply thumbnails. Never accept a URL
// from a worker, model response, filename or browser request.
const {resourceOwned}=require('./account-store');
function memoryProvider(store,{providerRequest,credentials,storageUserId,request=fetch,resize=null}={}){
 const checkUser=user=>{store.assertAvailable();const s=store.state;if(!s.users[user]||s.users[user].disabled)throw Error('Account unavailable');return s;};
 const legacyAlbum=(user,album)=>{const s=checkUser(user);if(s.legacyHousehold?.ownerUserId!==user||!resourceOwned(s,user,'album',album)||s.albums[album].legacyProviderAlbum!==true||!s.legacyHousehold.children.some(c=>c.albumId===album))throw Error('Album unavailable');};
 async function connection(user){checkUser(user);const creds={...credentials()};const call=async(method,params)=>{checkUser(user);const value=await providerRequest(method,params,creds,'GET');checkUser(user);if(value?.stat!=='ok')throw Error('Provider unavailable');return value;};const identity=await call('flickr.test.login',{});if(identity.user?.id!==storageUserId)throw Error('Storage identity changed');return call;}
 async function listLegacyAlbum(user,album,page){
  legacyAlbum(user,album);const call=await connection(user),data=await call('flickr.photosets.getPhotos',{photoset_id:album,user_id:storageUserId,extras:'date_taken,date_upload,tags,media',page:String(page),per_page:'100'}),set=data.photoset;legacyAlbum(user,album);
  if(!set||set.id!==album||set.owner&&set.owner!==storageUserId||Number(set.page)!==page||!Number.isSafeInteger(Number(set.pages))||Number(set.pages)<0||!Array.isArray(set.photo)||set.photo.length>100)throw Error('Album page unavailable');
  return {pages:Math.max(1,Number(set.pages)),rows:set.photo.map(row=>{if(!row||typeof row.id!=='string'||!/^\d{1,32}$/.test(row.id)||row.owner&&row.owner!==storageUserId)throw Error('Photo identity unavailable');const timestamp=Number(row.dateupload)*1000;if(!Number.isSafeInteger(timestamp)||timestamp<0)throw Error('Photo date unavailable');return {id:row.id,title:typeof row.title==='string'?row.title.slice(0,1000):'',date:typeof row.datetaken==='string'?row.datetaken:'',createdAt:timestamp,tags:typeof row.tags==='string'?row.tags.slice(0,2000):'',media:row.media==='video'?'video':'photo'};})};
 }
 async function thumbnail(engine,id,lease){
  const job=engine.leased(id,lease),user=job.user_id,photo=job.photo_id;const fresh=()=>{engine.leased(id,lease);return checkUser(user);};
  const call=await connection(user),info=await call('flickr.photos.getInfo',{photo_id:photo});fresh();
  if(info.photo?.id!==photo||info.photo.owner?.nsid!==storageUserId||info.photo.media==='video')throw Error('Photo principal unavailable');
  if(!resourceOwned(fresh(),user,'photo',photo)){
   const contexts=await call('flickr.photos.getAllContexts',{photo_id:photo}),s=fresh(),config=engine.settings(user);
   if(!Array.isArray(contexts.set))throw Error('Photo membership unavailable');
   const current=contexts.set.filter(set=>s.legacyHousehold?.children.some(c=>c.albumId===set.id));
   if(!current.length||current.some(set=>!resourceOwned(s,user,'album',set.id)||!config.allowedAlbumIds.includes(set.id)||config.hiddenAlbumIds.includes(set.id)))throw Error('Photo outside approved albums');
  }
  const data=await call('flickr.photos.getSizes',{photo_id:photo});fresh();
  const sizes=(data.sizes?.size||[]).filter(row=>row.media!=='video'&&row.label!=='Original'&&Number(row.width)>0&&Number(row.height)>0&&Math.max(Number(row.width),Number(row.height))<=1024&&typeof row.source==='string').sort((a,b)=>Math.abs(Math.max(Number(a.width),Number(a.height))-640)-Math.abs(Math.max(Number(b.width),Number(b.height))-640));
  if(!sizes.length)throw Error('Thumbnail unavailable');const url=new URL(sizes[0].source);
  if(url.protocol!=='https:'||url.port||url.username||url.password||!(/^(live|farm[0-9]+)\.staticflickr\.com$/.test(url.hostname)))throw Error('Thumbnail host rejected');
  const response=await request(url,{redirect:'error',signal:AbortSignal.timeout(30000)});fresh();
  const mime=(response.headers.get('content-type')||'').split(';')[0];if(!response.ok||!response.body||!['image/jpeg','image/png','image/webp'].includes(mime)||Number(response.headers.get('content-length')||0)>8*1024*1024)throw Error('Thumbnail format unavailable');
  const chunks=[];let length=0;for await(const chunk of response.body){fresh();length+=chunk.length;if(length>8*1024*1024)throw Error('Thumbnail too large');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks,length),transform=resize||((bytes)=>require('sharp')(bytes,{limitInputPixels:20*1024*1024}).rotate().resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toBuffer());
  const result=await transform(bytes);fresh();if(!Buffer.isBuffer(result)||result.length>1024*1024)throw Error('Thumbnail too large');return result;
 }
 return {listLegacyAlbum,thumbnail};
}
module.exports={memoryProvider};
