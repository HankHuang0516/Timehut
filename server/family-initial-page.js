'use strict';
const crypto=require('node:crypto');
// An explicitly partial first page; NEVER an inventory proof or age/export source.
// Empty, shortened, stale or ambiguous observations decline into the existing full reader.
async function initialPage({album,storageUserId,per=30,link,validate}){
 const number=v=>{if(!(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0||typeof v==='string'&&/^\d{1,16}$/.test(v)&&Number.isSafeInteger(Number(v))))throw Error('Invalid initial page number');return Number(v);};
 const numeric=v=>typeof v==='string'&&/^\d{1,32}$/.test(v);
 const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
 const info=d=>{const s=d?.photoset;if(d?.stat!=='ok'||s?.id!==album||s.owner!==storageUserId||typeof s.date_update!=='string'||!/^\d{1,16}$/.test(s.date_update)||number(s.photos)!==number(s.count_photos)+number(s.count_videos))throw Error('Initial album identity unconfirmed');return s.date_update;};
 const rows=d=>{const s=d?.photoset;if(d?.stat!=='ok'||s?.id!==album||s.owner!==storageUserId||number(s.page)!==1||s.perpage!==undefined&&number(s.perpage)!==per||!Array.isArray(s.photo)||s.photo.length>per)throw Error('Initial photo page unconfirmed');number(s.total);number(s.pages);const seen=new Set();return s.photo.map(row=>{validate(row);if(!numeric(row.id)||row.owner&&row.owner!==storageUserId||seen.has(row.id)||row.media!==undefined&&!['photo','video'].includes(row.media))throw Error('Initial photo ownership unconfirmed');seen.add(row.id);const text=(v,limit)=>{if(typeof v!=='string'||v.length>limit)throw Error('Initial metadata unavailable');return v;};return {id:row.id,owner:storageUserId,title:text(row.title??'',4096),description:{_content:text(row.description?._content??'',65536)},tags:text(row.tags??'',32768),datetaken:text(row.datetaken??'',128),dateupload:String(number(row.dateupload??0)),media:row.media||'photo'};});};
 const photoArgs={photoset_id:album,user_id:storageUserId,extras:'date_taken,date_upload,description,tags,media',page:'1',per_page:String(per)};
 const readAll=async jobs=>{const outcomes=await Promise.allSettled(jobs);const failed=outcomes.find(o=>o.status==='rejected');if(failed)throw failed.reason;link.current();return outcomes.map(o=>o.value);};
 const [identity,before,first]=await readAll([link.call('flickr.test.login',{}),link.call('flickr.photosets.getInfo',{photoset_id:album,user_id:storageUserId}),link.call('flickr.photosets.getPhotos',photoArgs)]);
 if(identity?.user?.id!==storageUserId)throw Error('Initial storage principal changed');
 const revision=info(before),photos=rows(first);if(!photos.length)return null;
 const context=async row=>{const d=await link.call('flickr.photosets.getContext',{photoset_id:album,photo_id:row.id});const count=number(d.count?._content??d.count),prev=d.prevphoto?.id===0?'0':d.prevphoto?.id,next=d.nextphoto?.id===0?'0':d.nextphoto?.id;if(!numeric(prev)||!numeric(next)||count<1||count>50000)throw Error('Initial boundary unconfirmed');return {count,prev,next};};
 const [head,tail,again]=await readAll([context(photos[0]),context(photos.at(-1)),link.call('flickr.photosets.getPhotos',photoArgs)]);
 if(hash(rows(again))!==hash(photos))return null;
 const after=info(await link.call('flickr.photosets.getInfo',{photoset_id:album,user_id:storageUserId}));link.current();
 const total=head.count,ids=new Set(photos.map(p=>p.id));
 if(after!==revision||tail.count!==total||head.prev!=='0'||head.next!==(photos[1]?.id||'0')||tail.prev!==(photos.at(-2)?.id||'0')||photos.length!==Math.min(per,total)||total===photos.length&&tail.next!=='0'||total>photos.length&&(tail.next==='0'||ids.has(tail.next)))return null;
 for(const p of photos)validate(p);link.current();
 return {rows:photos,total,pages:Math.max(1,Math.ceil(total/per)),page:1,initialPageOnly:true};
}
module.exports={initialPage};
