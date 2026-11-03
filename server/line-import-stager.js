'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {metadataDigest}=require('./account-upload-journal');
// Feed the existing durable upload journal; never create a second Flickr uploader.
function lineImportStager({journal,uploadsDirectory,content,onAccepted=()=>{}}){
 const directory=path.resolve(uploadsDirectory);
 return async function stage(plan,assertCurrent){
  assertCurrent();const existing=journal.admissions.find(plan.userId,plan.clientId);
  if(existing){if(existing.receiptId)return journal.get(existing.receiptId);throw Error('LINE original admission requires reconciliation');}
  const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4'}[plan.mime];if(!extension)throw Error('Unsupported LINE original');
  const filename='LINE-'+plan.messageId+'.'+extension,title=plan.media==='video'?'LINE 影片':'LINE 照片',description=plan.people.length?'使用者確認的人物：'+plan.people.join('、'):'',tags='',date=null;
  const metadataSha256=metadataDigest([plan.albumIds[0],filename,plan.mime,tags,title,description,date]);
  const reserved=journal.reserve(plan.userId,plan.albumIds[0],plan.clientId,plan.bytes,plan.sha256,metadataSha256);if(!reserved.created)throw Error('LINE admission already reserved');
  const lease=reserved.admission.leaseId,scratch='receiver-'+crypto.randomUUID()+'.part',file=path.join(directory,scratch);let fd,created=false,commitAttempted=false;
  try{
   assertCurrent();journal.markScratch(plan.userId,plan.clientId,lease,scratch);fd=fs.openSync(file,'wx',0o600);created=true;
   const response=await content(plan.messageId);assertCurrent();const mime=(response.headers.get('content-type')||'').split(';')[0];
   if(!response.ok||!response.body||mime!==plan.mime||Number(response.headers.get('content-length')||0)>plan.bytes)throw Error('LINE original unavailable');
   const hash=crypto.createHash('sha256');let bytes=0;
   for await(const chunk of response.body){assertCurrent();bytes+=chunk.length;if(bytes>plan.bytes)throw Error('LINE original size changed');hash.update(chunk);let offset=0;while(offset<chunk.length){const n=fs.writeSync(fd,chunk,offset,chunk.length-offset);if(!n)throw Error('Original write unavailable');offset+=n;}}
   if(bytes!==plan.bytes||hash.digest('hex')!==plan.sha256)throw Error('LINE original digest changed');
   fs.fsyncSync(fd);fs.closeSync(fd);fd=null;const dirfd=fs.openSync(directory,'r');try{fs.fsyncSync(dirfd);}finally{fs.closeSync(dirfd);}assertCurrent();
   const item={localId:'local_'+crypto.randomUUID(),clientUploadId:plan.clientId,contentSha256:plan.sha256,metadataSha256,localFilename:scratch,localPath:file,originalFilename:filename,mimetype:plan.mime,size:bytes,albumId:null,ownerUserId:plan.userId,accountAlbumId:plan.albumIds[0],title,description,tags,date,status:'pending',createdAt:new Date().toISOString(),flickrPhotoId:null,retryBlocked:false};
   commitAttempted=true;journal.accept(plan.userId,plan.clientId,lease,item);try{onAccepted(item);}catch(_){}return item;
  }catch(error){
   if(fd!==null&&fd!==undefined)fs.closeSync(fd);
   if(!commitAttempted){try{const row=journal.admissions.find(plan.userId,plan.clientId);if(row?.status!=='receiving'||row.leaseId!==lease||row.receiptId||row.scratchFilename!==scratch)throw Error('Admission changed');if(created){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink())throw Error('Scratch changed');fs.unlinkSync(file);}journal.confirmNotAccepted(plan.userId,plan.clientId,lease);error.lineNotAccepted=true;}catch(_){/* Preserve ambiguous originals/admissions. */}}
   throw error;
  }
 };
}
module.exports={lineImportStager};
