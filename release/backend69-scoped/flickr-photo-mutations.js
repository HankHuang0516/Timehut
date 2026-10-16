'use strict';
function flickrPhotoMutations(request,credentials,expectedUserId){
 if(typeof expectedUserId!=='string'||!/^\d+@N\d{2}$/.test(expectedUserId))throw new Error('Central Flickr identity must be configured');
 async function verified(){const current={...credentials()},data=await request('flickr.test.login',{},current,'GET');if(data.stat!=='ok'||data.user?.id!==expectedUserId)throw new Error('Central Flickr identity mismatch');return current;}
 const tokens=text=>(text.match(/"[^"]*"|\S+/g)||[]).map(token=>token.replace(/^"|"$/g,''));
 const quote=value=>/\s/.test(value)?JSON.stringify(value):value;
 const serialize=values=>values.map(quote).join(' ');
 const equal=(left,right)=>{const a=[...new Set(left)].sort(),b=[...new Set(right)].sort();return a.length===b.length&&a.every((value,index)=>value===b[index]);};
 async function read(id,needTags=true){const current=await verified(),data=await request('flickr.photos.getInfo',{photo_id:id},current,'GET'),photo=data.photo;if(data.stat!=='ok'||String(photo?.id)!==id||photo?.owner?.nsid!==expectedUserId||(needTags&&(!Array.isArray(photo.tags?.tag)||photo.tags.tag.some(t=>typeof t.raw!=='string'||/["\\]/.test(t.raw)))))throw new Error('Owned central photo metadata unconfirmed');return photo;}
 const exactDate=(photo,target)=>/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(photo.dates?.taken||'')&&photo.dates.taken.slice(0,10)===target&&String(photo.dates.takengranularity)==='0';
 return{apply:async(job,onDispatch)=>{
  const before=await read(job.photoId,job.kind!=='date');
  if(job.kind==='date'){
   if(!exactDate(before,job.target)){const current=await verified();onDispatch();try{await request('flickr.photos.setDates',{photo_id:job.photoId,date_taken:job.target+' 12:00:00',date_taken_granularity:'0'},current,'POST');}catch(error){if([2,3,4,5,6].includes(error.code))error.notApplied=true;throw error;}}
   const after=await read(job.photoId,false);if(!exactDate(after,job.target))throw new Error('Date readback unavailable');return{date:job.target};
  }
  const raw=before.tags.tag.map(t=>t.raw),uploaders=raw.filter(t=>t.startsWith('uploader:')),protectedValues=new Set(before.tags.tag.filter(t=>t.raw.startsWith('uploader:')).flatMap(t=>[t.raw,t._content]).filter(Boolean)),current=raw.filter(t=>!t.startsWith('uploader:')),requested=tokens(job.target).filter(t=>!t.startsWith('uploader:')&&!protectedValues.has(t)),desired=[...new Set(job.kind==='add_tags'?[...current,...requested]:requested)];
  if(!equal(current,desired)){const confirmedCredentials=await verified();onDispatch();try{await request('flickr.photos.setTags',{photo_id:job.photoId,tags:serialize([...uploaders,...desired])},confirmedCredentials,'POST');}catch(error){if(error.code===2)error.notApplied=true;throw error;}}
  const after=await read(job.photoId),saved=after.tags.tag.map(t=>t.raw);if(!equal(saved.filter(t=>!t.startsWith('uploader:')),desired)||!equal(saved.filter(t=>t.startsWith('uploader:')),uploaders))throw new Error('Tag readback unavailable');return{tags:serialize(saved)};
 }};
}
module.exports={flickrPhotoMutations};
