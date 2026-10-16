'use strict';
// Exact-account erasure. Unknown uploads retain their evidence until reconciled.
const fs=require('node:fs'),path=require('node:path');
class AccountErasure {
 constructor(store,journal,{uploadsDirectory,legacyOwnerId,readQueue,verifyProvider,deletePhoto,isActive=()=>false}={}){this.store=store;this.journal=journal;this.directory=path.resolve(uploadsDirectory);this.legacyOwnerId=legacyOwnerId;this.readQueue=readQueue;this.verifyProvider=verifyProvider;this.deletePhoto=deletePhoto;this.isActive=isActive;this.running=false;}
 plan(userId){const s=this.store.state,job=s.deletions?.[userId];if(!job||job.status==='complete')return null;if(userId===this.legacyOwnerId||!s.users[userId]?.disabled)throw new Error('Family or account erasure requires explicit migration');
  const receipts=Object.values(s.receipts).filter(r=>r.userId===userId),rows=receipts.filter(r=>r.queueItem).map(r=>{this.journal.validate(r.queueItem,r);return r.queueItem;}),media=Object.values(s.media).filter(r=>r.userId===userId),admissions=Object.values(s.admissions||{}).filter(r=>r.userId===userId);
  const ids=[...new Set([...media.map(r=>r.id),...rows.map(r=>r.flickrPhotoId).filter(Boolean)])];
  const all=this.readQueue();for(const id of ids){if(!/^\d+$/.test(id)||Object.values(s.media).some(r=>r.id===id&&r.userId!==userId)||all.some(r=>r.flickrPhotoId===id&&r.ownerUserId!==userId))throw new Error('Provider identity ownership conflict');}
  const files=[...new Set([...rows.map(r=>r.localFilename),...admissions.map(r=>r.scratchFilename).filter(Boolean)])];
  for(const name of files){if(!/^receiver-[a-f0-9-]{36}\.part$/.test(name)||path.basename(name)!==name||Object.values(s.admissions||{}).some(r=>r.userId!==userId&&r.scratchFilename===name)||all.some(r=>r.ownerUserId!==userId&&r.localFilename===name))throw new Error('Original identity ownership conflict');const file=path.join(this.directory,name);try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Original is not a private regular file');}catch(error){if(error.code!=='ENOENT')throw error;}}
  const uncertain=admissions.some(r=>r.status==='receiving')||rows.some(r=>this.isActive(r.localId)||['uploading','processing'].includes(r.status)||(r.retryBlocked&&!r.flickrPhotoId&&r.status!=='cancelled'));
  return{ids,files,uncertain,confirmed:job.confirmedPhotos};
 }
 status(userId,status){this.store.commit(s=>{const job=s.deletions?.[userId];if(!job)throw new Error('Deletion receipt unavailable');if(job.status!=='complete')job.status=status;});}
 finishStorage(userId){this.store.scrubDeletedAccount(userId);this.store.commit(s=>{const job=s.deletions[userId];if(job.status==='complete')return;if(job.status!=='scrubbing')throw new Error('Deletion storage phase changed');job.status='complete';job.completedAt=this.store.now();});}
 async runUser(userId){if(this.store.state.deletions?.[userId]?.status==='scrubbing'){this.finishStorage(userId);return;}let plan=this.plan(userId);if(!plan)return;if(plan.uncertain){this.status(userId,'waiting_upload');return;}
  // Confirm the configured central Flickr principal before treating not-found
  // as an idempotent delete; another provider account cannot acknowledge it.
  if(plan.ids.some(id=>!plan.confirmed.includes(id))){if(await this.verifyProvider()!==true)throw new Error('Central storage identity unconfirmed');}
  this.status(userId,'erasing');
  for(const id of plan.ids){plan=this.plan(userId);if(!plan)return;if(plan.uncertain){this.status(userId,'waiting_upload');return;}if(!plan.ids.includes(id)||plan.confirmed.includes(id))continue;await this.deletePhoto(id);this.store.commit(s=>{const job=s.deletions[userId];if(job.status!=='complete'&&!job.confirmedPhotos.includes(id))job.confirmedPhotos.push(id);});}
  plan=this.plan(userId);if(!plan)return;if(plan.uncertain||plan.ids.some(id=>!plan.confirmed.includes(id))){this.status(userId,'waiting_upload');return;}
  for(const name of plan.files){const file=path.join(this.directory,name);try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}}
  const fd=fs.openSync(this.directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  plan=this.plan(userId);if(!plan)return;if(plan.uncertain||plan.files.some(name=>fs.existsSync(path.join(this.directory,name)))||plan.ids.some(id=>!plan.confirmed.includes(id)))throw new Error('Deletion completion unconfirmed');
  this.store.commit(s=>{const job=s.deletions[userId];if(['scrubbing','complete'].includes(job.status))return;if(!s.users[userId]?.disabled)throw new Error('Deletion account changed');for(const table of ['sessions','nativeLogins','albums','media','receipts','admissions','photoMutations','photoDeletes'])for(const [id,row]of Object.entries(s[table]||{}))if(row.userId===userId)delete s[table][id];delete s.users[userId];s.deletions[userId]={userId,accessHash:job.accessHash,requestedAt:job.requestedAt,status:'scrubbing',confirmedPhotos:[]};});
  if(this.store.state.deletions[userId].status==='scrubbing')this.finishStorage(userId);
 }
 async run(){if(this.running)return;this.running=true;try{for(const row of Object.values(this.store.state.deletions||{})){if(row.status==='complete')continue;try{await this.runUser(row.userId);}catch(_){if(this.store.state.deletions[row.userId]?.status!=='scrubbing')this.status(row.userId,'waiting_provider');}}}finally{this.running=false;}}
}
module.exports={AccountErasure};
