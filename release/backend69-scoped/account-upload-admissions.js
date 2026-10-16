'use strict';
// Staged pre-body reservations. Unknown receiving states never authorize a new POST.
// Production requires the receiver/queue journal and reconciliation integration.
const {confirmedAdmissionCompletion}=require('./account-store');
class AccountUploadAdmissions {
 constructor(store,limits={}){this.store=store;this.limits={maxSingleBytes:500*1024*1024+65536,maxPendingUserBytes:1024**3,maxPendingGlobalBytes:2*1024**3,maxUserStoredBytes:2*1024**3,maxUserItems:1000,maxPendingUserItems:5,...limits};for(const value of Object.values(this.limits))if(!Number.isSafeInteger(value)||value<=0)throw new Error('Invalid upload limits');store.commit(s=>{s.admissions||={};});}
 key(userId,clientId){if(typeof userId!=='string'||typeof clientId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(clientId))throw new Error('Invalid client identity');return userId+':'+clientId;}
 find(userId,clientId){try{const state=this.store.state,row=state.admissions?.[this.key(userId,clientId)];return row&&this.store.owns(userId,'album',row.albumId)?structuredClone(row):null;}catch(_){return null;}}
 reserve(userId,albumId,clientId,bytes){return this.store.commit(s=>this.reserveInState(s,userId,albumId,clientId,bytes));}
 reserveInState(s,userId,albumId,clientId,bytes){const key=this.key(userId,clientId);if(!Number.isSafeInteger(bytes)||bytes<=0||bytes>this.limits.maxSingleBytes)throw new Error('Upload size unavailable or exceeds limit');
  if(Object.values(s.admissions).some(r=>r.status==='completed'&&!confirmedAdmissionCompletion(s,r)))throw new Error('Completed original capacity requires reconciliation');
  if(!this.store.owns(userId,'album',albumId))throw new Error('Album unavailable');const existing=s.admissions[key];if(existing){if(existing.albumId!==albumId||existing.bytes!==bytes)throw new Error('Upload identity cannot change');if(existing.status==='not_accepted'&&Object.hasOwn(existing,'receiptId'))throw new Error('Existing receipt must be reconciled');if(existing.status!=='not_accepted')return {created:false,admission:structuredClone(existing),retryBlocked:existing.status==='receiving'};}
  const pending=Object.values(s.admissions).filter(r=>['receiving','accepted'].includes(r.status)),own=pending.filter(r=>r.userId===userId),media=Object.values(s.media).filter(r=>r.userId===userId&&r.deletedAt===undefined),sum=rows=>rows.reduce((n,r)=>n+r.bytes,0);
  if(media.some(r=>!Number.isSafeInteger(r.bytes)||r.bytes<0))throw new Error('Stored media capacity must be confirmed before admission');const stored=media.reduce((n,r)=>n+r.bytes,0);
  if(own.length>=this.limits.maxPendingUserItems||sum(own)+bytes>this.limits.maxPendingUserBytes||sum(pending)+bytes>this.limits.maxPendingGlobalBytes||media.length+own.length>=this.limits.maxUserItems||stored+sum(own)+bytes>this.limits.maxUserStoredBytes)throw new Error('Upload capacity unavailable');
  const admission={userId,albumId,clientId,bytes,status:'receiving',createdAt:existing?.createdAt||this.store.now()};s.admissions[key]=admission;return {created:true,admission:structuredClone(admission),retryBlocked:false};
 }
 accept(userId,clientId,receiptId){const key=this.key(userId,clientId);return this.store.commit(s=>{const row=s.admissions[key],receipt=s.receipts[receiptId];if(!row||!this.store.owns(userId,'album',row.albumId)||!receipt||receipt.userId!==userId||receipt.albumId!==row.albumId)throw new Error('Admission or receipt unavailable');if(row.status==='accepted'||row.status==='completed'){if(row.receiptId!==receiptId)throw new Error('Receipt identity cannot change');return structuredClone(row);}if(row.status!=='receiving')throw new Error('Admission is not receiving');row.status='accepted';row.receiptId=receiptId;return structuredClone(row);});}
 complete(userId,clientId,receiptId){const key=this.key(userId,clientId);return this.store.commit(s=>{const row=s.admissions[key],media=Object.values(s.media).find(r=>r.userId===userId&&r.receiptId===receiptId);if(!row||row.receiptId!==receiptId||!['accepted','completed'].includes(row.status)||!media||media.albumId!==row.albumId||!Number.isSafeInteger(media.bytes)||media.bytes<=0||media.bytes>row.bytes)throw new Error('Stored original size must be confirmed before completion');row.status='completed';return structuredClone(row);});}
 // Internal receiver only: caller must have completed/cancelled its Multer handler,
 // observed no accepted queue/receipt and preserved/deleted only its own new scratch.
 // Never call this from a user retry or from an age/timeout alone.
 confirmNotAccepted(userId,clientId){const key=this.key(userId,clientId);return this.store.commit(s=>{const row=s.admissions[key];if(!row||row.status!=='receiving'||row.receiptId)throw new Error('Accepted or unknown receipt cannot be reset');row.status='not_accepted';return structuredClone(row);});}
}
module.exports={AccountUploadAdmissions};
