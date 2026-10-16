'use strict';
// Authenticated, single-file receiver: reserve before Multer, then journal before ACK.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {metadataDigest}=require('./account-upload-journal');
function publicUploadReceiver(multer,{store,journal,uploadsDirectory,providerConnected=()=>false,onAccepted=()=>{},legacyLookup=()=>null}){
 const directory=path.resolve(uploadsDirectory),types=['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/x-msvideo','video/mpeg'];
 const storage=multer.diskStorage({destination:directory,flush:true,filename(req,_file,cb){try{const filename='receiver-'+crypto.randomUUID()+'.part';journal.markScratch(req.memberAdmission.userId,req.memberAdmission.clientId,req.memberAdmission.leaseId,filename);req.privateScratchFilename=filename;const fd=fs.openSync(path.join(directory,filename),'wx',0o600);fs.closeSync(fd);req.createdPrivateScratch=true;cb(null,filename);}catch(error){cb(error);}}});
 const parse=multer({storage,defParamCharset:'utf8',limits:{files:1,fields:6,parts:7,fieldSize:16384,fileSize:500*1024*1024},fileFilter(_req,file,cb){cb(types.includes(file.mimetype)?null:new Error('Unsupported original format'),types.includes(file.mimetype));}}).array('files',1);
 function failBeforeAcceptance(req){const context=req.memberAdmission,row=store.state.admissions[journal.admissions.key(context.userId,context.clientId)];if(!row||row.status!=='receiving'||row.leaseId!==context.leaseId||row.receiptId)throw new Error('Receiver result requires reconciliation');if(row.scratchFilename){const file=path.join(directory,row.scratchFilename);if(path.dirname(file)!==directory||path.basename(file)!==req.privateScratchFilename||!req.createdPrivateScratch)throw new Error('Private original cleanup unavailable');if(fs.existsSync(file))fs.unlinkSync(file);if(fs.existsSync(file))throw new Error('Private original cleanup unconfirmed');}journal.confirmNotAccepted(context.userId,context.clientId,context.leaseId);}
 function handle(req,res){
  if(!req.memberAdmission)return res.status(404).json({error:'Resource unavailable'});
  if(!providerConnected())return res.status(503).json({error:'儲存服務尚未連接，請稍後再試'});
  const prior=req.memberAdmission,clientId=req.get('X-Timehut-Upload'),content=req.get('X-Timehut-Content-SHA256'),meta=req.get('X-Timehut-Metadata-SHA256'),rawLength=req.get('Content-Length');
  if(!/^[A-Za-z0-9_-]{16,80}$/.test(clientId||'')||!/^\d{1,10}$/.test(rawLength||'')||req.get('Transfer-Encoding'))return res.status(400).json({error:'完整原檔與收件識別尚未確認'});
  let reserved;try{reserved=journal.reserve(prior.userId,prior.albumId,clientId,Number(rawLength),content,meta);}catch(error){return res.status(409).json({error:'原檔識別或可用容量尚未確認，請先查看收件狀態',retryBlocked:true});}
  if(!reserved.created){const row=reserved.admission;if(row.receiptId){const receipt=journal.get(row.receiptId);if(!receipt)return res.status(503).json({error:'既有收據尚未確認',retryBlocked:true});if(receipt.photoDeletedAt!==undefined||receipt.status==='cancelled')return res.status(409).json({error:receipt.photoDeletedAt!==undefined?'原照片已刪除，這張收據不會重新上傳':'此收據已取消，不能另建上傳',localId:receipt.localId,retryBlocked:true});return res.json({_staged:receipt.status!=='completed',results:[{success:true,localId:receipt.localId,photoId:receipt.flickrPhotoId,_staged:receipt.status!=='completed'}]});}return res.status(409).json({error:'先前收件仍待確認，原檔保留；請先查看收件狀態',retryBlocked:true,admissionStatus:row.status});}
  req.memberAdmission=Object.freeze({...prior,clientId,leaseId:reserved.admission.leaseId});
  parse(req,res,async error=>{
   let commitAttempted=false;
   try{
    if(error)throw error;const context=req.memberAdmission,body=req.body||{},file=req.files?.[0];
    if(!file||req.files.length!==1||file.size<=0||Object.keys(body).some(k=>!['albumId','clientUploadId','title','description','tags','date'].includes(k))||Object.values(body).some(v=>typeof v!=='string')||body.albumId!==context.albumId||body.clientUploadId!==context.clientId)throw new Error('Request original identity mismatch');
    const actual=path.resolve(file.path);if(path.dirname(actual)!==directory||path.basename(actual)!==req.privateScratchFilename)throw new Error('Private original path mismatch');
    const hash=crypto.createHash('sha256');for await(const bytes of fs.createReadStream(actual))hash.update(bytes);const contentSha256=hash.digest('hex'),title=body.title||file.originalname,description=body.description||'',tags=body.tags||'',date=body.date||null;
    const metadataSha256=metadataDigest([body.albumId,file.originalname,file.mimetype,tags,title,description,date]);if(contentSha256!==content||metadataSha256!==meta)throw new Error('Original bytes or metadata mismatch');
    const actor=store.principal(req.accountToken);if(!actor||actor.id!==context.userId)throw new Error('Account authority changed while receiving');
    const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    const item={localId:'local_'+crypto.randomUUID(),clientUploadId:clientId,contentSha256,metadataSha256,localFilename:path.basename(actual),localPath:actual,originalFilename:file.originalname,mimetype:file.mimetype,size:file.size,albumId:null,ownerUserId:context.userId,accountAlbumId:context.albumId,title,description,tags,date,status:'pending',createdAt:new Date().toISOString(),flickrPhotoId:null,retryBlocked:false};
    commitAttempted=true;journal.accept(context.userId,clientId,context.leaseId,item);
    res.json({_staged:true,message:'伺服器已收到原檔，等待 Flickr 完成',results:[{success:true,localId:item.localId,_staged:true}]});
    try{onAccepted(item);}catch(_){/* Accepted receipt remains pending for the scheduler. */}
   }catch(failure){let blocked=true;if(!commitAttempted)try{failBeforeAcceptance(req);blocked=false;}catch(_){}if(!res.headersSent&&!res.destroyed&&!req.aborted)res.status(commitAttempted?503:400).json({error:blocked?'收件結果尚未確認，原檔與識別保留；請先查看收據':'尚未收件，請確認檔案後以同一工作重試',retryBlocked:blocked});}
  });
 }
 function lookup(req,res){try{const clientId=req.params.clientId;if(!/^[A-Za-z0-9_-]{16,80}$/.test(clientId||''))return res.status(404).json({error:'Resource unavailable'});const state=store.state,row=state.admissions[journal.admissions.key(req.actor.id,clientId)];if(!row){const old=legacyLookup(req.actor.id,clientId);return res.json(old?{admissionStatus:'accepted',localId:old.localId,status:old.status,flickrPhotoId:old.flickrPhotoId,retryBlocked:old.retryBlocked===true}:{admissionStatus:'not_found'});}if(!store.owns(req.actor.id,'album',row.albumId))return res.status(404).json({error:'Resource unavailable'});const receipt=row.receiptId?journal.get(row.receiptId):null;if(row.receiptId&&!receipt)return res.status(503).json({error:'收據尚未確認',retryBlocked:true});res.json({admissionStatus:row.status,localId:row.receiptId||null,status:receipt?.photoDeletedAt!==undefined?'deleted':receipt?.status||null,flickrPhotoId:receipt?.flickrPhotoId||null,retryBlocked:row.status==='receiving'||receipt?.retryBlocked===true||receipt?.photoDeletedAt!==undefined});}catch(_){res.status(503).json({error:'收件状态尚未確認，請稍後查詢',retryBlocked:true});}}
 return{handle,lookup};
}
module.exports={publicUploadReceiver};
