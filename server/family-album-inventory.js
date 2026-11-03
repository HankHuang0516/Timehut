'use strict';
const crypto=require('node:crypto');
// getPhotos/getInfo can share an obsolete total. getContext has an independent
// ordered-set count. A reconciled list needs that count AND contiguous pages,
// matching endpoint neighbours, a terminal empty page and an unchanged revision.
// Cache only bounded metadata. Callers still prove the live session/owner and
// provider identity, recheck album/media authority, and issue NEW media tickets.
function familyAlbumInventory({now=Date.now,ttl=30000,maxRows=50000,maxBytes=16*1024*1024,maxEntries=2}={}){
 const cache=new Map(),pending=new Map(),per=500;
 const integer=v=>{if(!((typeof v==='string'&&/^\d{1,16}$/.test(v))||typeof v==='number')||!Number.isSafeInteger(Number(v))||Number(v)<0)throw new Error('Invalid family inventory number');return Number(v);};
 const id=v=>typeof v==='string'&&/^\d{1,32}$/.test(v);
 const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
 async function read({key,album,storageUserId,call,guard,validate}){
  const started=now(),check=()=>{guard();if(now()-started>25000)throw new Error('Family inventory time budget exceeded');};
  const get=async(method,args)=>{check();const v=await call(method,args);check();return v;};
  const info=async()=>{
   const d=await get('flickr.photosets.getInfo',{photoset_id:album,user_id:storageUserId}),s=d.photoset;
   if(!s||s.id!==album||s.owner!==storageUserId)throw new Error('Family inventory owner changed');
   if(typeof s.date_update!=='string'||!/^\d{1,16}$/.test(s.date_update))throw new Error('Family inventory revision unavailable');
   const count=integer(s.photos),photos=integer(s.count_photos),videos=integer(s.count_videos);
   if(count!==photos+videos)throw new Error('Family inventory advisory count inconsistent');
   return {revision:s.date_update,advisory:count};
  };
  const context=async(photo)=>{
   const d=await get('flickr.photosets.getContext',{photoset_id:album,photo_id:photo});
   const count=integer(d.count?._content??d.count),prev=d.prevphoto?.id===0?'0':d.prevphoto?.id,next=d.nextphoto?.id===0?'0':d.nextphoto?.id;
   if(count<1||count>maxRows||!id(prev)||!id(next))throw new Error('Family inventory context unavailable');
   return {count,prev,next};
  };
  const page=async(n)=>{
   const d=await get('flickr.photosets.getPhotos',{photoset_id:album,user_id:storageUserId,extras:'date_taken,date_upload,description,tags,media',page:String(n),per_page:String(per)}),s=d.photoset;
   if(!s||s.id!==album||s.owner&&s.owner!==storageUserId||integer(s.page)!==n||!Array.isArray(s.photo)||s.photo.length>per)throw new Error('Family inventory page unavailable');
   integer(s.total);integer(s.pages);if(s.perpage!==undefined&&integer(s.perpage)!==per)throw new Error('Family inventory page size changed');
   // Deliberately omit secrets, provider URLs and optional unbounded fields.
   return s.photo.map(r=>{
    validate(r);if(r.media!==undefined&&!['photo','video'].includes(r.media))throw new Error('Family inventory media unavailable');
    const text=(v,limit)=>{if(typeof v!=='string'||v.length>limit)throw new Error('Family inventory metadata unavailable');return v;};
    return {id:r.id,owner:storageUserId,title:text(r.title??'',4096),description:{_content:text(r.description?._content??'',65536)},tags:text(r.tags??'',32768),datetaken:text(r.datetaken??'',128),dateupload:String(integer(r.dateupload??0)),media:r.media||'photo'};
   });
  };
  const ends=async(snapshot)=>{
   if(!snapshot.rows.length)return false;
   const first=snapshot.rows[0],last=snapshot.rows.at(-1);
   // Both endpoints are independent reads of this exact snapshot. Retire all
   // started reads even on failure; each get still checks live authority around
   // its own await. No failed or partial endpoint observation can be reused.
   const outcomes=await Promise.allSettled(last.id===first.id?[context(first.id)]:[context(first.id),context(last.id)]);
   const failed=outcomes.find(result=>result.status==='rejected');if(failed)throw failed.reason;
   check();const a=outcomes[0].value,b=outcomes[1]?.value||a;
   return a.count===snapshot.total&&b.count===snapshot.total&&a.prev==='0'&&b.next==='0'&&a.next===(snapshot.rows[1]?.id||'0')&&b.prev===(snapshot.rows.at(-2)?.id||'0');
  };
  for(const [k,v]of cache)if(now()-v.at>ttl)cache.delete(k);
  const hit=cache.get(key);
  // A cache hit requires the same three fresh provider observations as before,
  // but they need not spend three sequential network round trips. Preserve
  // fail-closed behavior and wait for every launched reader before continuing.
  const observations=await Promise.allSettled(hit?[info(),ends(hit)]:[info()]);
  const failed=observations.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  check();const before=observations[0].value;
  if(hit&&now()-hit.at<=ttl&&hit.revision===before.revision&&observations[1].value){
   check();for(const row of hit.rows)validate(row);return hit;
  }
  cache.delete(key);
  // Sharing metadata work never shares authority: each waiting request executes
  // fresh endpoint checks and validates every row under its OWN live principal.
  if(pending.has(key)){
   await pending.get(key);check();return read({key,album,storageUserId,call,guard,validate});
  }
  const build=(async()=>{
   const first=await page(1);
   if(!first.length){
    const sentinel=await page(2),after=await info();
    if(before.advisory!==0||sentinel.length||after.advisory!==0||before.revision!==after.revision)throw new Error('Family inventory empty state unconfirmed');
    // Empty albums are cheap to recheck; never cache an absence proof.
    return {rows:[],total:0,revision:before.revision,version:hash([album,before.revision,'empty']),at:now()};
   }
   const head=await context(first[0].id),total=head.count,pages=Math.ceil(total/per),sets=new Map([[1,first]]);
   if(head.prev!=='0'||head.next!==(first[1]?.id||'0'))throw new Error('Family inventory head changed');
   let next=2,bytes=Buffer.byteLength(JSON.stringify(first)),failure=null;
   if(bytes>maxBytes)throw new Error('Family inventory memory budget exceeded');
   // Retire sibling readers on the first failure and wait for already-started
   // reads before releasing pending ownership. No new pages after failure.
   await Promise.allSettled(Array.from({length:Math.min(2,pages-1)},async()=>{
    try{while(!failure&&next<=pages){const n=next++,rows=await page(n);if(failure)return;bytes+=Buffer.byteLength(JSON.stringify(rows));if(bytes>maxBytes)throw new Error('Family inventory memory budget exceeded');sets.set(n,rows);}}
    catch(error){failure=failure||error;}
   }));
   if(failure)throw failure;
   const rows=[],seen=new Set();
   for(let n=1;n<=pages;n++){
    const part=sets.get(n);if(!part||part.length!==Math.min(per,total-(n-1)*per))throw new Error('Family inventory missing page');
    for(const row of part){if(seen.has(row.id))throw new Error('Family inventory duplicate row');seen.add(row.id);rows.push(row);}
   }
   if(bytes>maxBytes||rows.length!==total)throw new Error('Family inventory incomplete');
   const snapshot={rows,total,revision:before.revision,version:hash([album,before.revision,rows]),at:now()};
   // These fresh probes depend on the completed snapshot, not on each other.
   // Drain every launched probe before rejecting; the final info() below remains
   // AFTER all probes so its revision still brackets the complete read.
   const probes=await Promise.allSettled([ends(snapshot),page(pages+1),page(1)]);
   const probeFailure=probes.find(result=>result.status==='rejected');
   if(probeFailure)throw probeFailure.reason;
   check();
   if(!probes[0].value||probes[1].value.length)throw new Error('Family inventory endpoint changed');
   // Re-reading the first page also catches same-count resorting while paging.
   if(hash(probes[2].value)!==hash(first))throw new Error('Family inventory changed during read');
   const after=await info();if(after.revision!==before.revision)throw new Error('Family inventory revision changed');
   check();for(const row of rows)validate(row);
   if(cache.size>=maxEntries)cache.delete(cache.keys().next().value);
   cache.set(key,snapshot);return snapshot;
  })();
  pending.set(key,build);
  try{return await build;}finally{if(pending.get(key)===build)pending.delete(key);}
 }
 return {read};
}
module.exports={familyAlbumInventory};
