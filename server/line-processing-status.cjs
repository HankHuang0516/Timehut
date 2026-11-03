'use strict';
// Hank1102: owner-scoped, durable processing status for LINE inbox items.
//
// This module only reads. It never claims work, never starts the uploader,
// never writes a queue row, and never guesses a stage from the frontend. Every
// stage is derived from durable server state: the inbox items/imports tables,
// the upload journal, the account store's media membership and the automation
// authority's own tables (runs/items/readers/analysis/decisions and the
// standing grants). A read therefore cannot advance the pipeline.
//
// The completion checks reuse the canonical v91 definitions wherever they
// exist: an import counts as uploaded only when LineAlbumImports.confirmed()
// accepts it (receipt completed, owner/client/content/mime/album binding,
// account receipt and media row all consistent) AND every target album of the
// plan is a confirmed membership. A skip counts as excluded only when the
// canonical trusted decision still holds (same run, same owner, same scope
// digest, same analysis digest, unexpired verified relevance receipt) and no
// import exists.
//
// Stage vocabulary (fixed; the frontend may only render these):
//   download_queued     the receiver has not taken the item yet
//   downloading         the receiver holds the item lease
//   downloaded          the original is durable on the server
//   recognition_queued  durably queued for recognition inside an armed run
//   recognizing         a reader of the current run holds the item right now
//   recognized          the recognition result is durable, the decision pending
//   uploading           an import plan exists and the upload is not finished
//   uploaded            receipt completed and every target membership confirmed
//   excluded            a durable skip decision exists and no import happened
//   blocked             nothing can advance the item (grant/engine/worker)
//   failed              the item or its import failed
//   unknown             the outcome is not established
//   stopped             the item, its run or its import was revoked/cancelled
//
// Privacy: this module never returns provider tokens, leases, run caps,
// relevance receipts, family metadata or original photo bytes. It returns only
// the stage, the confirmed album ids, a boolean, a reason code and a timestamp.
const crypto=require('node:crypto');

const STAGES=Object.freeze([
 'download_queued','downloading','downloaded','recognition_queued','recognizing',
 'recognized','uploading','uploaded','excluded','blocked','failed','unknown','stopped',
]);

// Reason codes are stable identifiers for the UI, never free text.
const REASON={
 ITEM_AWAITING_DOWNLOAD:'ITEM_AWAITING_DOWNLOAD',
 RECEIVER_LEASED:'RECEIVER_LEASED',
 ITEM_DOWNLOAD_FAILED:'ITEM_DOWNLOAD_FAILED',
 ITEM_STOPPED:'ITEM_STOPPED',
 IMPORT_PLAN_PENDING:'IMPORT_PLAN_PENDING',
 IMPORT_RECEIVING:'IMPORT_RECEIVING',
 IMPORT_UPLOAD_STAGED:'IMPORT_UPLOAD_STAGED',
 IMPORT_FAILED:'IMPORT_FAILED',
 IMPORT_CANCELLED:'IMPORT_CANCELLED',
 IMPORT_OUTCOME_UNKNOWN:'IMPORT_OUTCOME_UNKNOWN',
 UPLOAD_COMPLETED:'UPLOAD_COMPLETED',
 RECEIPT_NOT_COMPLETED:'RECEIPT_NOT_COMPLETED',
 RECEIPT_MISSING:'RECEIPT_MISSING',
 MEMBERSHIP_UNCONFIRMED:'MEMBERSHIP_UNCONFIRMED',
 PLAN_MISMATCH:'PLAN_MISMATCH',
 RECOGNITION_QUEUED:'RECOGNITION_QUEUED',
 RECOGNITION_IN_PROGRESS:'RECOGNITION_IN_PROGRESS',
 RECOGNITION_COMPLETE:'RECOGNITION_COMPLETE',
 RECOGNITION_UNCERTAIN:'RECOGNITION_UNCERTAIN',
 IMPORT_DECISION_PENDING:'IMPORT_DECISION_PENDING',
 SKIP_DECISION_PERSISTED:'SKIP_DECISION_PERSISTED',
 DECISION_EXPIRED:'DECISION_EXPIRED',
 DECISION_UNUSABLE:'DECISION_UNUSABLE',
 DECISION_RUN_MISMATCH:'DECISION_RUN_MISMATCH',
 RUN_NOT_ACTIVE:'RUN_NOT_ACTIVE',
 RUN_EXPIRED:'RUN_EXPIRED',
 RUN_RECORD_MISSING:'RUN_RECORD_MISSING',
 ITEM_NOT_ENGAGED:'ITEM_NOT_ENGAGED',
 AUTOMATION_NOT_READY:'AUTOMATION_NOT_READY',
 AUTOMATION_READY:'AUTOMATION_READY',
 AUTOMATION_DISABLED:'AUTOMATION_DISABLED',
 RELEVANCE_SOURCE_NOT_READY:'RELEVANCE_SOURCE_NOT_READY',
 TRANSPORT_NOT_READY:'TRANSPORT_NOT_READY',
 PROVIDER_NOT_CONNECTED:'PROVIDER_NOT_CONNECTED',
 UPLOAD_ADMISSION_CLOSED:'UPLOAD_ADMISSION_CLOSED',
 NO_STANDING_GRANT:'NO_STANDING_GRANT',
 STANDING_GRANT_REVOKED:'STANDING_GRANT_REVOKED',
 STANDING_GRANT_EXPIRED:'STANDING_GRANT_EXPIRED',
 STANDING_GRANT_NOT_CURRENT:'STANDING_GRANT_NOT_CURRENT',
 STANDING_GRANT_UNAVAILABLE:'STANDING_GRANT_UNAVAILABLE',
 NO_ACTIVE_RUN:'NO_ACTIVE_RUN',
 PROCESSING_STATUS_UNAVAILABLE:'PROCESSING_STATUS_UNAVAILABLE',
};

const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const isPlain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

class LineProcessingStatus{
 constructor(inbox,{journal=null,store=null,automation=null,imports=null}={}){
  this.inbox=inbox;this.db=inbox.db;this.journal=journal;this.store=store;this.automation=automation;this.imports=imports;
 }
 now(){return this.inbox.now();}
 hasTable(name){try{return !!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);}catch(_){return false;}}
 // ------------------------------------------------------------ engine level
 /** Engine level checks. A grant never replaces an engine level requirement. */
 engineState(){
  const a=this.automation;
  if(!a)return {ready:false,reasonCode:REASON.PROCESSING_STATUS_UNAVAILABLE};
  if(typeof a.autonomyEnabled==='function'&&a.autonomyEnabled()!==true)return {ready:false,reasonCode:REASON.AUTOMATION_DISABLED};
  if(typeof a.sourceReady==='function'&&a.sourceReady()!==true)return {ready:false,reasonCode:REASON.RELEVANCE_SOURCE_NOT_READY};
  if(typeof a.engineReady==='function'&&a.engineReady()!==true)return {ready:false,reasonCode:REASON.TRANSPORT_NOT_READY};
  if(typeof a.providerConnected==='function'&&a.providerConnected()!==true)return {ready:false,reasonCode:REASON.PROVIDER_NOT_CONNECTED};
  if(typeof a.uploadAdmission==='function'&&a.uploadAdmission()!==true)return {ready:false,reasonCode:REASON.UPLOAD_ADMISSION_CLOSED};
  return {ready:true,reasonCode:REASON.AUTOMATION_READY};
 }
 /** The owner's bound sources. A grant for another source never authorises a
  *  photo of this source. */
 ownerSources(user){
  const sources=[];
  for(const row of this.db.prepare('SELECT line_id FROM links WHERE user_id=? AND active=1').all(user))sources.push('user:'+row.line_id);
  for(const row of this.db.prepare('SELECT group_id FROM groups WHERE user_id=? AND active=1').all(user))sources.push('group:'+row.group_id);
  return sources;
 }
 /** Source scoped readiness. The grant must belong to this exact source. */
 automationForSource(user,source){
  const engine=this.engineState();
  if(!engine.ready)return engine;
  const [sourceType,sourceId]=String(source||'').split(':');
  try{
   const settings=new (require('./line-collection-settings.cjs').CollectionSettings)(this.inbox).get(user,{sourceType,sourceId});
   if(!settings)return {ready:false,reasonCode:'COLLECTION_NOT_CONFIGURED'};
   const current=this.automation?.authority?.sourceScope(user,settings);
   return current?.ready===true?{ready:true,reasonCode:REASON.AUTOMATION_READY,source}:{ready:false,reasonCode:'REFERENCES_NOT_READY'};
  }catch(e){return {ready:false,reasonCode:[400,404,409].includes(e.status)?'COLLECTION_NOT_CONFIGURED':REASON.AUTOMATION_NOT_READY};}

 }
 /** Owner level readiness for the UI banner. Ready means at least one of the
  *  owner's own sources is armed; it never borrows another source's grant. */
 automationState(user){
  const engine=this.engineState();
  if(!engine.ready)return engine;
  const sources=this.ownerSources(user);
  if(!sources.length)return {ready:false,reasonCode:'COLLECTION_NOT_CONFIGURED'};
  const reasons=[];
  for(const source of sources){
   const state=this.automationForSource(user,source);
   if(state.ready)return {ready:true,reasonCode:REASON.AUTOMATION_READY};
   reasons.push(state.reasonCode);
  }
  for(const code of ['COLLECTION_NOT_CONFIGURED',REASON.STANDING_GRANT_EXPIRED,REASON.STANDING_GRANT_REVOKED,REASON.STANDING_GRANT_NOT_CURRENT]){
   if(reasons.includes(code))return {ready:false,reasonCode:code};
  }
  return {ready:false,reasonCode:reasons[0]??REASON.AUTOMATION_NOT_READY};
 }
 // ------------------------------------------------------------- item rows
 /** One durable row set per item. Every read is scoped to the owner. */
 itemRows(user,itemId){
  const db=this.db;
  const item=db.prepare('SELECT * FROM items WHERE id=? AND user_id=?').get(itemId,user);
  if(!item)return null;
  const imports=db.prepare('SELECT * FROM imports WHERE id=? AND user_id=?').get(itemId,user);
  const auto=this.hasTable('line_auto_items')?db.prepare('SELECT * FROM line_auto_items WHERE id=? AND user_id=?').get(itemId,user):null;
  // The run must belong to the same owner and to the same source as the item.
  const run=auto&&this.hasTable('line_auto_runs')?db.prepare('SELECT * FROM line_auto_runs WHERE id=? AND user_id=?').get(auto.run_id,user):null;
  // Analysis, decision and readers only count when they belong to the run
  // that owns the item, so a finished run can never leak into a new one.
  const sameRun=!!run&&run.source===item.source;
  const analysis=sameRun&&this.hasTable('line_auto_analysis')?db.prepare('SELECT * FROM line_auto_analysis WHERE item_id=? AND run_id=? AND user_id=?').get(itemId,auto.run_id,user):null;
  const decision=sameRun&&this.hasTable('line_auto_decisions')?db.prepare('SELECT * FROM line_auto_decisions WHERE item_id=? AND run_id=? AND user_id=?').get(itemId,auto.run_id,user):null;
  const readers=sameRun&&this.hasTable('line_auto_readers')
   ?db.prepare('SELECT state FROM line_auto_readers WHERE item_id=? AND run_id=?').all(itemId,auto.run_id):[];
  const permit=sameRun&&this.hasTable('line_auto_permits')
   ?db.prepare('SELECT * FROM line_auto_permits WHERE item_id=? AND run_id=?').get(itemId,auto.run_id):null;
  const ingress=this.hasTable('line_auto_ingress')
   ?db.prepare('SELECT * FROM line_auto_ingress WHERE item_id=? AND user_id=? AND source=?').get(itemId,user,item.source):null;
  return {item,imports,auto,run,sameRun,analysis,decision,readers,permit,ingress};
 }
 /** A recognition result counts only when its stored digest still matches. */
 recognitionCompleted(rows){
  const {analysis,decision}=rows;
  if(!analysis||!decision)return false;
  if(analysis.run_id!==decision.run_id)return false;
  if(decision.analysis_digest!==analysis.result_digest)return false;
  let payload=null;
  try{payload=JSON.parse(analysis.payload);}catch(_){return false;}
  if(!isPlain(payload)||digest(payload)!==analysis.result_digest)return false;
  return true;
 }
 // ------------------------------------------------------------- completion
 /** Equivalent of LineAlbumImports.confirmed() for engines that are not
  *  injected. The canonical engine is preferred; this is the same field set. */
 equivalentConfirmed(user,imports){
  const plan=JSON.parse(imports.plan);
  let queue=null;
  try{queue=this.journal?this.journal.get(imports.receipt_id):null;}catch(_){queue=null;}
  const state=this.store?.state;
  const receipt=state?.receipts?.[imports.receipt_id];
  const photo=queue?.flickrPhotoId&&state?.media?.[queue.flickrPhotoId];
  if(!queue||queue.status!=='completed'||queue.photoDeletedAt!==undefined||queue.ownerUserId!==plan.userId||queue.clientUploadId!==plan.clientId||queue.contentSha256!==plan.sha256||queue.size!==plan.bytes||queue.mimetype!==plan.mime||queue.accountAlbumId!==plan.albumIds[0]||receipt?.userId!==plan.userId||receipt.albumId!==plan.albumIds[0]||!photo||photo.userId!==plan.userId||photo.receiptId!==imports.receipt_id||photo.bytes!==plan.bytes||photo.deletedAt!==undefined||photo.deletionRequestedAt!==undefined)return null;
  return {plan,photo,q:queue};
 }
 /** The canonical v91 completion, plus the item scoped checks.
  *  The canonical LineAlbumImports.confirmed() is tried first. When it refuses
  *  only because the plan's authorisation is no longer current (a finished run
  *  or an expired relevance receipt), the durable completion status is still
  *  the pipeline's own proof that it once passed the canonical check and every
  *  target membership. In that case the identical field set is verified again
  *  before the import is called uploaded, so a historical automatic import is
  *  not mislabelled as unknown. */
 confirmedUpload(user,item,imports){
  let verified=null,canonical=false;
  try{
   if(this.imports&&typeof this.imports.confirmed==='function'){verified=this.imports.confirmed(imports);canonical=!!verified;}
   else verified=this.equivalentConfirmed(user,imports);
  }catch(_){verified=null;}
  if(!verified&&canonical===false&&imports.status==='completed')verified=this.equivalentConfirmed(user,imports);
  if(!verified)return {ok:false,reasonCode:REASON.RECEIPT_NOT_COMPLETED,albumIds:[]};
  const plan=verified.plan,photo=verified.photo;
  if(plan.itemId!==item.id||plan.userId!==user||plan.source!==item.source)return {ok:false,reasonCode:REASON.PLAN_MISMATCH,albumIds:[]};
  const memberships=Array.isArray(photo.albumIds)?photo.albumIds:(photo.albumId?[photo.albumId]:[]);
  // Every target album of the plan must be a confirmed membership. A single
  // confirmed album is not enough to call the import uploaded.
  if(!plan.albumIds.length||plan.albumIds.some(id=>!memberships.includes(id)))return {ok:false,reasonCode:REASON.MEMBERSHIP_UNCONFIRMED,albumIds:[]};
  return {ok:true,reasonCode:REASON.UPLOAD_COMPLETED,albumIds:[...plan.albumIds]};
 }
 /** A skip that was really completed is a historical result. It stays
  *  "excluded" even when the run or the relevance receipt expired later. The
  *  proof is the terminal permit that was closed by the cleanup ack, bound to
  *  the decision and the scope, with the claimed item cleaned up and no
  *  import ever created for it. */
 terminalSkipCompleted(rows){
  const {decision,run,analysis,auto,permit}=rows;
  if(!decision||!run||!analysis||!auto||!permit)return false;
  if(decision.user_id!==run.user_id||decision.run_id!==auto.run_id)return false;
  if(decision.scope_digest!==run.scope_digest)return false;
  if(decision.analysis_digest!==analysis.result_digest)return false;
  let payload=null;
  try{payload=JSON.parse(decision.payload);}catch(_){return false;}
  if(!isPlain(payload)||payload.action!=='skip')return false;
  if(!payload.seal||digest(payload.seal)!==decision.decision_digest||payload.decisionDigest!==decision.decision_digest)return false;
  // The closed permit with its cleanup ack is the durable completion proof.
  if(permit.state!=='closed')return false;
  if(permit.decision_digest!==decision.decision_digest||permit.scope_digest!==run.scope_digest)return false;
  if(!this.recognitionCompleted(rows))return false;
  let scope,media;
  try{scope=JSON.parse(run.scope);media=JSON.parse(rows.item.payload);}catch(_){return false;}
  if(digest(scope)!==run.scope_digest||media?.sha256!==auto.sha256||media?.bytes!==auto.bytes)return false;
  const completion={itemId:auto.id,ownerId:run.user_id,sourceId:scope.sourceId,sha256:auto.sha256,bytes:auto.bytes,decisionDigest:decision.decision_digest,status:'skipped',persisted:true,noImportPlanned:true};
  if(permit.completion_digest!==digest(completion))return false;
  if(auto.status!=='cleaned')return false;
  return true;
 }
 heldDecision(rows){
  if(!this.recognitionCompleted(rows))return false;
  let payload;try{payload=JSON.parse(rows.decision.payload);}catch(_){return false;}
  return payload?.action==='hold'&&rows.decision.scope_digest===rows.run.scope_digest&&rows.decision.decision_digest===digest({decision:payload,analysisDigest:rows.analysis.result_digest,scopeDigest:rows.run.scope_digest});
 }
 /** A durable decision is trusted only while it still belongs to the current
  *  run, owner, scope and analysis, and while its verified relevance receipt
  *  is unexpired. The canonical trusted decision is preferred; the durable
  *  checks below are the same conditions the canonical path enforces. */
 decisionTrust(rows){
  const {decision,run,analysis,auto}=rows;
  const a=this.automation;
  if(a&&typeof a.trustedDecision==='function'){
   let value=null;
   try{value=a.trustedDecision(auto.run_id,rows.item.id);}catch(_){value=null;}
   if(!value||!isPlain(value.decision))return {trusted:false,action:null,reasonCode:REASON.DECISION_EXPIRED};
   return {trusted:true,action:value.decision.action??null,reasonCode:REASON.DECISION_UNUSABLE};
  }
  if(!decision||!run||!analysis||!auto)return {trusted:false,action:null,reasonCode:REASON.DECISION_UNUSABLE};
  if(run.state!=='armed'||Number.isSafeInteger(run.expires_at)&&run.expires_at<=this.now())return {trusted:false,action:null,reasonCode:REASON.RUN_NOT_ACTIVE};
  if(decision.user_id!==run.user_id||decision.run_id!==auto.run_id)return {trusted:false,action:null,reasonCode:REASON.DECISION_RUN_MISMATCH};
  if(decision.scope_digest!==run.scope_digest)return {trusted:false,action:null,reasonCode:REASON.DECISION_RUN_MISMATCH};
  if(decision.analysis_digest!==analysis.result_digest)return {trusted:false,action:null,reasonCode:REASON.DECISION_UNUSABLE};
  let payload=null,receipt=null;
  try{payload=JSON.parse(decision.payload);}catch(_){return {trusted:false,action:null,reasonCode:REASON.DECISION_UNUSABLE};}
  try{receipt=JSON.parse(decision.receipt);}catch(_){receipt=null;}
  if(!isPlain(payload)||!['import','skip'].includes(payload.action))return {trusted:false,action:null,reasonCode:REASON.DECISION_UNUSABLE};
  if(!payload.seal||digest(payload.seal)!==decision.decision_digest||payload.decisionDigest!==decision.decision_digest)return {trusted:false,action:payload.action,reasonCode:REASON.DECISION_UNUSABLE};
  // A decision is only final while its verified relevance receipt is still valid.
  if(!isPlain(receipt)||!Number.isSafeInteger(receipt.expiresAt)||receipt.expiresAt<=this.now())return {trusted:false,action:payload.action,reasonCode:REASON.DECISION_EXPIRED};
  // The live scope must still be the scope the decision was made under.
  try{
   const current=this.automation?.authority?.sourceScope(run.user_id,JSON.parse(run.scope));
   if(!current||digest(current)!==run.scope_digest)return {trusted:false,action:payload.action,reasonCode:REASON.DECISION_EXPIRED};
  }catch(_){return {trusted:false,action:payload.action,reasonCode:REASON.DECISION_EXPIRED};}
  return {trusted:true,action:payload.action,reasonCode:REASON.DECISION_UNUSABLE};
 }
 // --------------------------------------------------------------- queueing
 /** The armed run that would actually pick this item up. The run must match
  *  the item's source and the run's own watermark and time boundary, so an
  *  old photo can never pose as "queued for recognition". */
 queueableRun(user,item,rows){
  if(!this.engineState().ready)return null;
  if(!this.hasTable('line_auto_runs')||!this.hasTable('line_auto_ingress'))return null;
  const ingress=rows.ingress;
  if(!ingress)return null;
  const runs=this.db.prepare("SELECT * FROM line_auto_runs WHERE user_id=? AND source=? AND state='armed' AND expires_at>?").all(user,item.source,this.now());
  for(const run of runs){
   if(!Number.isSafeInteger(run.watermark)||ingress.sequence<=run.watermark)continue;
   if(!Number.isSafeInteger(run.created_at)||ingress.event_timestamp<=run.created_at)continue;
   if(!Number.isSafeInteger(ingress.received_at)||ingress.received_at<run.created_at)continue;
   const claimed=this.db.prepare('SELECT count(*) AS n FROM line_auto_items WHERE run_id=?').get(run.id).n;
   if(Number.isSafeInteger(run.max_jobs)&&claimed>=run.max_jobs)continue;
   let scope=null;
   try{scope=JSON.parse(run.scope);}catch(_){scope=null;}
   if(!scope||!Array.isArray(scope.albumIds)||!scope.albumIds.length)continue;
   try{const current=this.automation?.authority?.sourceScope(user,scope);if(!current?.ready||digest(current)!==run.scope_digest)continue;}catch(_){continue;}
   let allowed=[];
   try{allowed=this.inbox.valid(item);}catch(_){allowed=[];}
   if(!allowed.length||scope.albumIds.some(id=>!allowed.includes(id)))continue;
   let media=null;
   try{media=JSON.parse(item.payload||'null');}catch(_){media=null;}
   if(!media||typeof media.sha256!=='string'||!/^[a-f0-9]{64}$/.test(media.sha256)||!Number.isSafeInteger(media.bytes)||media.bytes<=0)continue;
   return run;
  }
  return null;
 }
 // ------------------------------------------------------------------ stage
 /** Derive one item's processing state. Pure function of durable state. */
 statusFor(user,itemId,automation){
  const rows=this.itemRows(user,itemId);
  if(!rows)return null;
  const {item,imports,auto,run,analysis,decision,readers}=rows;
  const recognitionCompleted=this.recognitionCompleted(rows);
  const result=(stage,reasonCode,albumIds=[],updatedAt=item.created_at)=>({
   stage,albumIds,recognitionCompleted,reasonCode,updatedAt,
  });
  if(item.status==='pending')return result('download_queued',REASON.ITEM_AWAITING_DOWNLOAD);
  if(item.status==='leased')return result('downloading',REASON.RECEIVER_LEASED);
  if(item.status==='failed')return result('failed',REASON.ITEM_DOWNLOAD_FAILED);
  if(item.status==='cancelled')return result('stopped',REASON.ITEM_STOPPED);
  if(item.status!=='downloaded')return result('unknown',REASON.IMPORT_OUTCOME_UNKNOWN);
  const updated=imports?.updated_at??auto?.created_at??item.created_at;
  // A planned import always wins: the photo is already past recognition.
  if(imports){
   if(imports.status==='completed'){
    const confirmed=this.confirmedUpload(user,item,imports);
    if(confirmed.ok)return result('uploaded',REASON.UPLOAD_COMPLETED,confirmed.albumIds,updated);
    return result('unknown',confirmed.reasonCode,[],updated);
   }
   if(imports.status==='pending')return result('uploading',REASON.IMPORT_PLAN_PENDING,[],updated);
   if(imports.status==='receiving')return result('uploading',REASON.IMPORT_RECEIVING,[],updated);
   if(imports.status==='staged')return result('uploading',REASON.IMPORT_UPLOAD_STAGED,[],updated);
   if(imports.status==='failed')return result('failed',REASON.IMPORT_FAILED,[],updated);
   if(imports.status==='cancelled')return result('stopped',REASON.IMPORT_CANCELLED,[],updated);
   return result('unknown',REASON.IMPORT_OUTCOME_UNKNOWN,[],updated);
  }
  // Claimed by a bounded run: the recognition stages are visible.
  if(auto){
   if(!run)return result('unknown',REASON.RUN_RECORD_MISSING,[],updated);
   if(run.source!==item.source)return result('unknown',REASON.DECISION_RUN_MISMATCH,[],updated);
   // A skip that was really completed stays excluded, whatever happened to the
   // run or to the relevance receipt afterwards.
   if(decision&&this.terminalSkipCompleted(rows))return result('excluded',REASON.SKIP_DECISION_PERSISTED,[],updated);
   if(decision&&this.heldDecision(rows))return result('blocked',REASON.RECOGNITION_UNCERTAIN,[],updated);
   if(decision){
    const trust=this.decisionTrust(rows);
    if(trust.trusted&&trust.action==='skip')return result('excluded',REASON.SKIP_DECISION_PERSISTED,[],updated);
    if(trust.trusted&&trust.action==='import')return result('recognized',REASON.IMPORT_DECISION_PENDING,[],updated);
    // An unfinished or no longer current decision is never an exclusion.
    if(run.state==='cancelled')return result('stopped',REASON.RUN_NOT_ACTIVE,[],updated);
    return result('unknown',trust.reasonCode,[],updated);
   }
   if(run.state!=='armed')return result('stopped',REASON.RUN_NOT_ACTIVE,[],updated);
   if(Number.isSafeInteger(run.expires_at)&&run.expires_at<=this.now())return result('stopped',REASON.RUN_EXPIRED,[],updated);
   try{const current=this.automation?.authority?.sourceScope(user,JSON.parse(run.scope));if(!current||digest(current)!==run.scope_digest)return result('stopped',REASON.DECISION_EXPIRED,[],updated);}catch(_){return result('stopped',REASON.RUN_NOT_ACTIVE,[],updated);}
   if(analysis)return result('recognized',REASON.RECOGNITION_COMPLETE,[],updated);
   if(readers.some(r=>r.state==='open'))return result('recognizing',REASON.RECOGNITION_IN_PROGRESS,[],updated);
   return result('recognition_queued',REASON.RECOGNITION_QUEUED,[],updated);
  }
  if(item.media!=='image')return result('blocked','UNSUPPORTED_MEDIA',[],updated);
  const sourceReady=this.automationForSource(user,item.source);
  if(sourceReady.ready!==true)return result('blocked',sourceReady.reasonCode,[],updated);
  try{
   const allowed=this.inbox.valid(item),media=JSON.parse(item.payload||'null');
   if(!allowed.length||!media||!(/^[a-f0-9]{64}$/).test(media.sha256)||!Number.isSafeInteger(media.bytes)||media.bytes<=0)return result('blocked',REASON.ITEM_NOT_ENGAGED,[],updated);
  }catch(_){return result('stopped',REASON.ITEM_STOPPED,[],updated);}
  return result('recognition_queued',REASON.RECOGNITION_QUEUED,[],updated);

 }
 /** Everything the GET route needs for one owner. */
 forUser(user){
  const automation=this.automationState(user);
  const items={};
  const rows=this.db.prepare('SELECT id FROM items WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(user);
  for(const row of rows){
   const value=this.statusFor(user,row.id,automation);
   if(value)items[row.id]=value;
  }
  return {automation,items};
 }
}

function lineProcessingStatus(inbox,options={}){return new LineProcessingStatus(inbox,options);}
module.exports={lineProcessingStatus,LineProcessingStatus,STAGES,REASON};
