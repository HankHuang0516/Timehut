'use strict';
// Read original family photos through the same session-bound media routes.
// Provider reads never invent app receipts or adopt another tenant's photo.
const crypto=require('node:crypto');
const {familyAlbumInventory}=require('./family-album-inventory');
const {initialPage}=require('./family-initial-page');
const {familyAgeSelection}=require('./family-age-selection');
const {zone:calendarZone}=require('./timeline-dates');
const {familyContext,requireOwner,validateLegacyHousehold}=require('./account-owner-bootstrap');
const {accountMedia}=require('./account-media');
const {AccountStore}=require('./account-store');
const {createVideoHandler}=require('./video-media');
function familyMedia(store,tickets,{providerRequest,credentials,storageUserId,request=fetch,backendOrigin='https://just-healing-production.up.railway.app',photoView,photoViews}={}){
 if(typeof storageUserId!=='string'||!/^\d+@N\d+$/.test(storageUserId))throw new Error('Explicit family storage principal required');
 const inventory=familyAlbumInventory();
 const scope=creds=>crypto.createHash('sha256').update(JSON.stringify(creds)).digest('hex');
 const numeric=value=>typeof value==='string'&&/^\d{1,32}$/.test(value);
 const number=value=>{if(!(typeof value==='number'||typeof value==='string'&&/^\d{1,16}$/.test(value)))throw new Error('Invalid provider pagination');const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid provider pagination');return n;};
 function eligible(userId,id,state=store.state){
  store.assertAvailable();validateLegacyHousehold(state);
  if(!numeric(id)||state.legacyHousehold?.status!=='ready'||userId!==state.legacyHousehold.ownerUserId)return false;
  const row=state.media[id];
  return !row||(row.userId===userId&&row.deletedAt===undefined&&row.deletionRequestedAt===undefined);
 }
 function currentSnapshot(){store.assertAvailable();return {state:store.state,error:store.error,now:()=>store.now(),assertAvailable:()=>store.assertAvailable()};}
 function albums(userId){return familyContext(currentSnapshot(),userId).map(child=>child.albumId);}
 function authority(req){
  const snapshot=currentSnapshot(),owner=requireOwner(snapshot);if(req.actor?.id!==owner)throw new Error('Family unavailable');
  let principal;
  if(req.accountToken)principal=AccountStore.prototype.principal.call(snapshot,req.accountToken);
  else {
   const parts=new URL(req.originalUrl,'http://localhost').pathname.split('/').filter(Boolean);
   if(parts[1]==='photo'&&['image','video'].includes(parts[3]))principal=tickets.verify(req.query.ticket,'photo',parts[2],parts[3]==='image'?(req.query.size||'m'):(req.query.purpose||'playback'));
  }
  if(principal?.id!==owner||req.aborted||req.res?.destroyed)throw new Error('Family session unavailable');
  return owner;
 }
 function connectionBase(req){
  const owner=authority(req),creds={...credentials()},credentialScope=scope(creds);
  const current=()=>{authority(req);if(scope({...credentials()})!==credentialScope)throw new Error('Family connection changed');};
  const call=async(method,params)=>{current();const value=await providerRequest(method,params,creds,'GET');current();if(value?.stat!=='ok')throw new Error('Family provider unavailable');return value;};
  return {owner,creds,call,current,credentialScope};
 }
 async function connection(req){const link=connectionBase(req),identity=await link.call('flickr.test.login',{});if(identity.user?.id!==storageUserId)throw new Error('Family storage principal changed');return link;}
 function providerPhoto(row,req,state,raw=false){
  if(!row||!numeric(row.id)||!eligible(req.actor.id,row.id,state)||row.owner&&row.owner!==storageUserId)throw new Error('Family photo ownership conflict');
  const created=number(row.dateupload||0)*1000;if(!Number.isSafeInteger(created))throw new Error('Invalid family photo date');
  const view={id:row.id,title:typeof row.title==='string'?row.title:'',description:typeof row.description?._content==='string'?row.description._content:'',tags:typeof row.tags==='string'?row.tags:'',date:typeof row.datetaken==='string'?row.datetaken:'',media:row.media==='video'?'video':'photo',createdAt:created};
  return raw?view:photoView(view,req);
 }
 async function snapshotOf(req,link,album){
  // SQLite state is a freshly parsed/validated full snapshot on EVERY access.
  // Refresh it around each provider await, then reuse it only within the
  // synchronous row-validation batch. Never cache session/media authority.
  let checkedState=null;
  const guard=()=>{
   link.current();checkedState=store.state;
   const snapshot={state:checkedState,error:store.error,now:()=>store.now(),assertAvailable:()=>store.assertAvailable()};
   if(!familyContext(snapshot,link.owner).some(child=>child.albumId===album))throw new Error('Family album unavailable');
  };
  const validate=row=>{if(!checkedState||!row||!numeric(row.id)||!eligible(link.owner,row.id,checkedState)||row.owner&&row.owner!==storageUserId)throw new Error('Family photo ownership conflict');};
  return inventory.read({key:JSON.stringify([link.owner,album,storageUserId,link.credentialScope]),album,storageUserId,call:link.call,guard,validate});
 }
 async function pageOf(req,link,album,page,per){
  const snapshot=await snapshotOf(req,link,album),total=snapshot.total,pages=Math.max(1,Math.ceil(total/per));
  return {rows:snapshot.rows.slice((page-1)*per,page*per),total,pages,revision:snapshot.version};
 }
 function paging(req,cap=30){return {page:Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1)),per:Math.max(1,Math.min(cap,parseInt(req.query.per_page,10)||30))};}
 function calendarDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number),leap=year%4===0&&(year%100!==0||year%400===0);
  return year>=1&&month>=1&&month<=12&&day>=1&&day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
 }
 function takenCalendarDate(value){
  // Offset-bearing timestamps and upload-date fallbacks depend on the client's
  // timezone. Decline this shortcut rather than guessing a server-local day.
  if(typeof value!=='string')return null;
  const match=/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?)?$/.exec(value);
  if(!match||!calendarDate(match[1])||match[2]!==undefined&&(Number(match[2])>23||Number(match[3])>59||Number(match[4]||0)>59))return null;
  return match[1];
 }
 async function albumView(req,res){
  const url=new URL(req.originalUrl,'http://localhost'),album=url.pathname.split('/')[3],query=url.searchParams;
  const selected=query.has('photos')||query.has('date'),preview=query.has('representation');
  if(query.has('initial_page')){
   if(query.get('initial_page')!=='timeline-v1'||query.getAll('initial_page').length!==1||query.getAll('page').length!==1||query.get('page')!=='1'||query.getAll('per_page').length!==1||query.get('per_page')!=='30'||[...query.keys()].some(k=>!['page','per_page','initial_page'].includes(k)))return res.status(400).json({error:'Invalid initial page request'});
   const link=connectionBase(req);let checkedState=null;
   const refresh=()=>{link.current();checkedState=store.state;if(!familyContext({state:checkedState,error:store.error,now:()=>store.now(),assertAvailable:()=>store.assertAvailable()},link.owner).some(c=>c.albumId===album))throw Error('Initial album unavailable');};
   const guarded={...link,current:refresh,call:async(method,args)=>{refresh();const d=await link.call(method,args);refresh();return d;}};
   const validate=row=>{if(!row||!numeric(row.id)||!eligible(link.owner,row.id,checkedState)||row.owner&&row.owner!==storageUserId)throw Error('Initial ownership conflict');};
   refresh();const initial=await initialPage({album,storageUserId,link:guarded,validate});
   if(initial){refresh();const rows=initial.rows.map(row=>providerPhoto(row,req,checkedState,true)),photo=photoViews?photoViews(rows,req):rows.map(row=>photoView(row,req));refresh();const payload={stat:'ok',photoset:{id:album,photo,total:initial.total,pages:initial.pages,page:1,initial_page:{protocol:'timeline-v1',partial:true,full_inventory_required:true}}};if(Buffer.byteLength(JSON.stringify(payload))>900000)throw Error('Initial page too large');return res.json(payload);}
   // Declined shortcut: exact existing complete-inventory semantics, never partial failure success.
   const full=await pageOf(req,await connection(req),album,1,30);authority(req);const state=store.state,rows=full.rows.map(row=>providerPhoto(row,req,state,true)),photo=photoViews?photoViews(rows,req):rows.map(row=>photoView(row,req));return res.json({stat:'ok',photoset:{id:album,photo,total:full.total,pages:full.pages,page:1,age_batch_size:240,inventory_revision:full.revision}});
  }

  const ageSelected=['age_selection','age','birth_date','time_zone'].some(key=>query.has(key));
  if(ageSelected){
   const allowed=new Set(['age_selection','age','birth_date','time_zone','page','per_page']);
   if([...query.keys()].some(key=>!allowed.has(key))||[...allowed].some(key=>query.getAll(key).length!==1)||query.get('age_selection')!=='complete-age-v1'||!/^(?:0|[1-9]\d{0,2})$/.test(query.get('age'))||Number(query.get('age'))>150||!calendarDate(query.get('birth_date'))||!/^[1-9]\d{0,4}$/.test(query.get('page'))||query.get('per_page')!=='480')return res.status(400).json({error:'Invalid age selection request'});
   const years=Number(query.get('age')),birthDate=query.get('birth_date'),timeZone=query.get('time_zone'),page=Number(query.get('page')),per=480;
   try{calendarZone(timeZone);}catch(_){return res.status(400).json({error:'Invalid age selection time zone'});}
   const link=await connection(req);
   const currentBirth=()=>{link.current();return familyContext(currentSnapshot(),link.owner).find(child=>child.albumId===album)?.birthDate;};
   const scopeChanged=()=>res.status(409).json({error:'Album birth date changed; reload before time travel',code:'AGE_SCOPE_CHANGED'});
   if(currentBirth()!==birthDate)return scopeChanged();
   const snapshot=await snapshotOf(req,link,album);
   if(currentBirth()!==birthDate)return scopeChanged();
   const selection=familyAgeSelection(snapshot,{owner:link.owner,album,birthDate,age:years,timeZone});
   const unsupported=reason=>res.json({stat:'ok',age_selection:{protocol:'complete-age-v1',supported:false,fallback:'full-inventory',reason}});
   if(!selection.supported)return unsupported(selection.reason);
   const total=selection.rows.length,pages=Math.max(1,Math.ceil(total/per));
   if(page>pages)return res.status(400).json({error:'Invalid age selection page'});
   const state=store.state,rows=selection.rows.slice((page-1)*per,page*per).map(row=>providerPhoto(row,req,state,true));
   if(typeof photoViews!=='function')throw Error('Age selection renderer unavailable');
   let photo;
   try{photo=photoViews(rows,req,'preview');}catch(error){if(error.code==='PHOTO_BATCH_CAPACITY')return unsupported('preview_capacity');throw error;}
   const payload={stat:'ok',photoset:{id:album,photo,total,pages,page,age_batch_size:480,representation:'preview',inventory_revision:snapshot.version,age_selection:selection.proof}};
   if(Buffer.byteLength(JSON.stringify(payload))>900000)return unsupported('response_capacity');
   if(currentBirth()!==birthDate)return scopeChanged();
   return res.json(payload);
  }
  if(selected){
   const ids=(query.get('photos')||'').split(','),date=query.get('date');
   if(query.getAll('photos').length!==1||query.getAll('date').length!==1||preview||query.has('page')||query.has('per_page')||!calendarDate(date)||ids.length>200||ids.some(id=>!(/^[1-9]\d{0,31}$/.test(id)))||new Set(ids).size!==ids.length)return res.status(400).json({error:'Invalid selected photo request'});
   const link=await connection(req),snapshot=await snapshotOf(req,link,album);
   authority(req);const state=store.state,byId=new Map(snapshot.rows.map(row=>[row.id,row])),rows=[];
   for(const id of ids){
    const row=byId.get(id),taken=row&&takenCalendarDate(row.datetaken);
    const reason=!row?'missing_photo':!taken?'date_unverifiable':taken!==date?'date_mismatch':null;
    if(reason)return res.json({stat:'ok',selection:{complete:false,unsupported:true,reason}});
    rows.push(providerPhoto(row,req,state,true));
   }
   const photo=photoViews?photoViews(rows,req):rows.map(row=>photoView(row,req));
   const payload={stat:'ok',photoset:{id:album,photo,total:ids.length,pages:1,page:1,age_batch_size:240,inventory_revision:snapshot.version,selection:{complete:true,requested_ids:ids,calendar_date:date,count:ids.length,source_total:snapshot.total,inventory_revision:snapshot.version}}};
   if(Buffer.byteLength(JSON.stringify(payload))>900000)throw new Error('Selected photo page exceeds native response budget');
   return res.json(payload);
  }
  if(preview&&(query.getAll('representation').length!==1||query.get('representation')!=='preview'||query.getAll('per_page').length!==1||query.get('per_page')!=='480'))return res.status(400).json({error:'Invalid photo representation request'});
  const link=await connection(req),{page,per}=paging(req,preview?480:240),result=await pageOf(req,link,album,page,per);
  authority(req);const state=store.state,rows=result.rows.map(row=>providerPhoto(row,req,state,true));
  const unsupported=()=>res.json({stat:'ok',age_read:{representation:'preview',batch_size:480,supported:false,fallback_batch_size:240}});
  if(preview&&typeof photoViews!=='function')throw new Error('Compact photo renderer unavailable');
  let photo;
  try{photo=photoViews?photoViews(rows,req,preview?'preview':'full'):rows.map(row=>photoView(row,req));}
  catch(error){if(preview&&error.code==='PHOTO_BATCH_CAPACITY')return unsupported();throw error;}
  const payload={stat:'ok',photoset:{id:album,photo,total:result.total,pages:result.pages,page,age_batch_size:preview?480:240,inventory_revision:result.revision,...(preview?{representation:'preview'}:{})}};
  if(Buffer.byteLength(JSON.stringify(payload))>900000){if(preview)return unsupported();throw new Error('Photo page exceeds native response budget');}
  res.json(payload);
 }
 async function photos(req,res){
  try{
   const link=await connection(req),selected=req.query.album,{page,per}=paging(req),query=typeof req.query.query==='string'?req.query.query.slice(0,200).toLocaleLowerCase():'',ids=albums(link.owner);
   if(selected&&!ids.includes(selected))return res.status(404).json({error:'Resource unavailable'});
   const seen=new Set(),chosen=[];let count=0;
   const include=(id,fields,make)=>{if(seen.has(id))return;seen.add(id);if(query&&!fields.some(v=>typeof v==='string'&&v.toLocaleLowerCase().includes(query)))return;count++;if(count>(page-1)*per&&count<=page*per)chosen.push(make());};
   for(const album of selected?[selected]:ids){
    const snapshot=await snapshotOf(req,link,album);
    for(const row of snapshot.rows)include(row.id,[row.title,row.tags,row.description?._content],()=>providerPhoto(row,req));
   }
   // Global family search also includes the owner's new virtual app albums.
   if(!selected)for(const row of Object.values(store.state.media))if(store.owns(link.owner,'photo',row.id))include(row.id,[row.title,row.tags,row.description,row.originalFilename],()=>photoView(row,req));
   authority(req);res.json({stat:'ok',photos:{photo:chosen,total:count,pages:Math.max(1,Math.ceil(count/per)),page}});
  }catch(_){if(!res.headersSent)res.status(503).json({error:'家庭照片尚未讀取完整，請稍後重試'});}
 }
 async function prove(req,id,{includeSizes=false}={}){
  const owner=authority(req);if(!eligible(owner,id))throw new Error('Family photo unavailable');
  const link=connectionBase(req);
  // Both observations are required under this request's fresh principal and
  // captured provider credentials. Retire every admitted reader even if one
  // fails; no media delivery or reusable proof exists before both complete.
  const observations=await Promise.allSettled([
   link.call('flickr.test.login',{}),
   link.call('flickr.photos.getInfo',{photo_id:id}),
   link.call('flickr.photos.getAllContexts',{photo_id:id}),
   ...(includeSizes?[link.call('flickr.photos.getSizes',{photo_id:id})]:[])
  ]);
  const failed=observations.find(value=>value.status==='rejected');if(failed)throw failed.reason;
  link.current();if(observations[0].value.user?.id!==storageUserId)throw Error('Family storage principal changed');const info=observations[1].value,contexts=observations[2].value;
  if(info.photo?.id!==id||info.photo.owner?.nsid!==storageUserId)throw new Error('Family photo principal unavailable');
  const allowed=albums(owner);
  if(!Array.isArray(contexts.set)||!contexts.set.some(set=>allowed.includes(set.id)))throw new Error('Photo outside original family albums');
  if(!eligible(owner,id))throw new Error('Family photo ownership changed');
  return {...link,info,sizes:includeSizes?observations[3].value:null};
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
   const proof=await prove(req,parts[2],{includeSizes:parts[3]!=='video'});
   const api=async(method,values)=>{proof.current();if(method==='flickr.photos.getInfo'&&values.photo_id===parts[2])return proof.info;if(method==='flickr.photos.getSizes'&&values.photo_id===parts[2]&&proof.sizes)return proof.sizes;return proof.call(method,values);};
   const guardedRequest=async(...args)=>{
    proof.current();const response=await request(...args);proof.current();
    if(!response.body)return response;
    const reader=response.body.getReader();let done=false;
    const body=new ReadableStream({async pull(stream){try{proof.current();const next=await reader.read();proof.current();if(next.done){done=true;stream.close();}else stream.enqueue(next.value);}catch(error){stream.error(error);await reader.cancel().catch(()=>{});}},async cancel(reason){if(!done)await reader.cancel(reason);}},{highWaterMark:0});
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
