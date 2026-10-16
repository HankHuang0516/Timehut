'use strict';
// Durable edits target existing owned provider IDs; never create a new photo.
const crypto=require('node:crypto');
const key=(user,id)=>crypto.createHash('sha256').update(user+'\n'+id).digest('hex');
const calendar=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const tags=value=>typeof value==='string'&&Buffer.byteLength(value)<=16384&&(value.match(/"/g)||[]).length%2===0;
function validateMutation(row,name,state){return !!(row&&name===key(row.userId,row.photoId)&&/^[a-f0-9-]{36}$/.test(row.id||'')&&Object.hasOwn(state.users,row.userId)&&Object.hasOwn(state.media,row.photoId)&&state.media[row.photoId].userId===row.userId&&state.media[row.photoId].receiptId===row.receiptId&&state.media[row.photoId].deletedAt===undefined&&['set_tags','add_tags','date'].includes(row.kind)&&(row.kind==='date'?calendar(row.target):tags(row.target))&&['pending','applying','failed'].includes(row.status)&&typeof row.sent==='boolean'&&(row.status!=='failed'||row.sent===false)&&Number.isSafeInteger(row.createdAt)&&row.createdAt>=0);}
class AccountPhotoMutations{
 constructor(store,{apply}={}){this.store=store;this.apply=apply;this.active=new Map();store.commit(s=>{s.photoMutations||={};});}
 owned(state,user,id){const row=state.media[id],receipt=row&&state.receipts[row.receiptId];return !!(Object.hasOwn(state.users,user)&&!state.users[user].disabled&&Object.hasOwn(state.media,id)&&row.userId===user&&row.deletedAt===undefined&&row.deletionRequestedAt===undefined&&receipt?.userId===user&&(!receipt.queueItem||receipt.queueItem.status==='completed'));}
 enqueue(user,ids,kind,target){if(!['set_tags','add_tags','date'].includes(kind)||!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'||!/^\d+$/.test(id))||new Set(ids).size!==ids.length||(kind==='date'?!calendar(target):!tags(target)))throw new Error('Invalid photo edit');
  return this.store.commit(s=>{if(ids.some(id=>!this.owned(s,user,id)))throw new Error('Owned completed photo unavailable');const pending=Object.values(s.photoMutations||{}).filter(j=>j.status!=='failed');if(pending.length+ids.filter(id=>!s.photoMutations[key(user,id)]).length>1000||pending.filter(j=>j.userId===user).length+ids.filter(id=>!s.photoMutations[key(user,id)]).length>100)throw new Error('Photo edit capacity unavailable');
   for(const id of ids){const old=s.photoMutations[key(user,id)];if(old&&old.status!=='failed'&&(old.kind!==kind||old.target!==target))throw new Error('Previous edit must be confirmed first');}
   return ids.map(id=>{const name=key(user,id),old=s.photoMutations[name];if(old&&old.status!=='failed')return structuredClone(old);const row={id:crypto.randomUUID(),userId:user,photoId:id,receiptId:s.media[id].receiptId,kind,target,status:'pending',sent:false,createdAt:this.store.now()};s.photoMutations[name]=row;return structuredClone(row);});
  });
 }
 current(job){const s=this.store.state,row=s.photoMutations?.[key(job.userId,job.photoId)];return row?.id===job.id&&this.owned(s,job.userId,job.photoId)?row:null;}
 dispatch(job){this.store.commit(s=>{const row=s.photoMutations?.[key(job.userId,job.photoId)];if(row?.id!==job.id||!this.owned(s,job.userId,job.photoId))throw new Error('Photo edit authority changed');row.sent=true;});}
 async runJob(job){if(this.active.has(job.id))return this.active.get(job.id);const promise=this.perform(job);this.active.set(job.id,promise);try{return await promise;}finally{this.active.delete(job.id);}}
 async perform(job){let previouslySent=true;try{
  if(!this.current(job)||typeof this.apply!=='function')throw new Error('Photo edit unavailable');previouslySent=this.current(job).sent;
  this.store.commit(s=>{const row=s.photoMutations[key(job.userId,job.photoId)];if(row.id!==job.id||!this.owned(s,job.userId,job.photoId))throw new Error('Photo edit changed');row.status='applying';});
  const result=await this.apply(job,()=>this.dispatch(job));
  if(job.kind==='date'?(result?.date!==job.target):typeof result?.tags!=='string')throw new Error('Provider result unconfirmed');
  const confirmed=this.store.commit(s=>{const name=key(job.userId,job.photoId),row=s.photoMutations[name];if(row?.id!==job.id||!this.owned(s,job.userId,job.photoId))return false;const media=s.media[job.photoId];if(job.kind==='date')media.date=result.date;else media.tags=result.tags;delete s.photoMutations[name];return true;});
  if(!confirmed)throw new Error('Photo edit authority changed');return {photoId:job.photoId,success:true,...(job.kind==='date'?{date:result.date}:{tags:result.tags})};
 }catch(error){try{this.store.commit(s=>{const row=s.photoMutations?.[key(job.userId,job.photoId)];if(row?.id!==job.id)return;if(error.notApplied===true&&!previouslySent&&row.sent===true){row.sent=false;row.status='failed';}else row.status='pending';});}catch(_){}return {photoId:job.photoId,success:false,error:'變更尚未確認，請重新整理或以原設定重試'};}}
 async run(){for(const job of Object.values(this.store.state.photoMutations||{}))if(job.status!=='failed'&&this.current(job))await this.runJob(job);}
 handler(){return async(req,res,next)=>{
  const pathname=new URL(req.originalUrl,'http://localhost').pathname;let ids,kind,target;
  if(req.method==='PUT'&&/^\/api\/photo\/[0-9]+\/tags$/.test(pathname)){ids=[req.params.photoId];kind='set_tags';target=req.body?.tags;}
  else if(req.method==='POST'&&pathname==='/api/photos/tags/add'){ids=req.body?.photoIds;kind='add_tags';target=req.body?.tags;}
  else if(req.method==='POST'&&pathname==='/api/photos/update-date'){ids=req.body?.photoIds;kind='date';target=req.body?.targetDate;if(typeof target==='string'&&/^\d{4}-\d{2}-\d{2} 12:00:00$/.test(target))target=target.slice(0,10);}
  else return next();
  if(!Array.isArray(ids)||!ids.length)return res.status(400).json({error:'請確認照片與變更內容'});
  // The explicit family operator may still edit its legacy, unscoped photos.
  if(!ids.some(id=>Object.hasOwn(this.store.state.media,id)))return next();
  let jobs;try{jobs=this.enqueue(req.actor.id,ids,kind,target);}catch(_){return res.status(409).json({error:'原照片或先前變更尚未確認，尚未送出新的變更'});}
  const results=[];for(const job of jobs)results.push(await this.runJob(job));
  if(kind==='set_tags'){const first=results[0];return res.json({...first,results});}return res.json({results,successCount:results.filter(r=>r.success).length});
 };}
}
module.exports={AccountPhotoMutations,validateMutation};
