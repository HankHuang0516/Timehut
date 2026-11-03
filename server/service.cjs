'use strict';
const crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const fail=(code,status=409)=>{throw Object.assign(Error(code),{status});};
const copy=x=>JSON.parse(JSON.stringify(x));
/** Canonical persistence and existing-import integration.
 *
 * No identity inference: this service never decides who a person is, never
 * outputs a name, age, gender, race or health attribute, and never stores
 * such a value. Two analysis kinds may be persisted, and both answer a
 * bounded comparison question under an explicit, versioned owner consent:
 *   - 'scene-analysis-v1'          archived non-person whole-photo theme.
 *   - 'golden-person-analysis-v1'   the owner's own 3–5 selected reference
 *                                   photos per album define one target person;
 *                                   the model only answers whether a candidate
 *                                   shows that same person. It is a comparison
 *                                   against the owner's own selection, not an
 *                                   identification of who the person is.
 * A separately trusted existing-label receipt source is required. Defaults
 * keep automation unavailable; worker-supplied decisions are rejected.
 */
class AutonomousService{
 constructor(authority,{enabled=false,imports=()=>null,receiptSourceReady=()=>false,readRelevanceReceipt=()=>null,verifyRelevanceReceipt=()=>false,analysisSource=null}={}){
  this.authority=authority;this.db=authority.db;this.inbox=authority.inbox;this.enabled=enabled&&authority.enabled;
  this.imports=imports;this.receiptSourceReady=receiptSourceReady;this.readReceipt=readRelevanceReceipt;this.verifyReceipt=verifyRelevanceReceipt;this.analysisSource=analysisSource;
  if(!this.enabled)return;
  authority.tx(()=>this.db.exec(`CREATE TABLE IF NOT EXISTS line_auto_analysis(item_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,user_id TEXT NOT NULL,result_digest TEXT NOT NULL,payload TEXT NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS line_auto_decisions(item_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,user_id TEXT NOT NULL,decision_digest TEXT NOT NULL,analysis_digest TEXT NOT NULL,scope_digest TEXT NOT NULL,payload TEXT NOT NULL,receipt TEXT NOT NULL) STRICT;`));
 }
 requireEnabled(){if(!this.enabled)fail('AUTONOMY_SERVICE_DISABLED',503);this.inbox.store.assertAvailable();}
 ready(){try{return this.enabled&&this.receiptSourceReady()===true&&!!this.engine();}catch{return false;}}
 engine(){const e=this.imports();if(!e||e.db!==this.db||e.inbox!==this.inbox||typeof e.requestAutomated!=='function'||e.automation!==this.importGuards())fail('CANONICAL_IMPORT_ENGINE_REQUIRED',503);return e;}
 current(runId,itemId){
  this.requireEnabled();if(this.receiptSourceReady()!==true)fail('RELEVANCE_SOURCE_NOT_READY',503);const run=this.db.prepare('SELECT * FROM line_auto_runs WHERE id=?').get(runId),item=this.db.prepare('SELECT * FROM line_auto_items WHERE id=? AND run_id=?').get(itemId,runId);
  if(!run||!item||run.state!=='armed'||run.expires_at<=this.authority.now()||item.user_id!==run.user_id||item.source!==run.source)fail('AUTONOMY_RUN_NOT_CURRENT');
  const scope=JSON.parse(run.scope),current=this.authority.sourceScope(run.user_id,scope);if(hash(current)!==run.scope_digest)fail('AUTONOMY_SCOPE_CHANGED');
  const row=this.db.prepare('SELECT * FROM items WHERE id=? AND user_id=?').get(itemId,run.user_id);if(!row||row.source!==run.source||row.status!=='downloaded')fail('AUTONOMY_SOURCE_CHANGED');
  const allowed=this.inbox.valid(row),media=JSON.parse(row.payload||'null');if(!media||media.sha256!==item.sha256||media.bytes!==item.bytes||scope.albumIds.some(id=>!allowed.includes(id)))fail('AUTONOMY_SOURCE_CHANGED');
  const job={itemId,ownerId:run.user_id,sourceType:scope.sourceType,sourceId:scope.sourceId,sha256:item.sha256,bytes:item.bytes,bindingRevision:row.binding_since,createdAt:row.created_at,allowedAlbumIds:scope.albumIds,status:'downloaded',revoked:false};
  const policies=scope.profiles.map(p=>({ownerId:run.user_id,albumId:p.albumId,enabled:p.ready,consent:true,consentAt:run.created_at,policyRevision:p.policyRevision,referenceRevision:p.referenceRevision,referenceDigest:p.referenceDigest,referencesConfirmed:p.ready,validationStatus:p.ready?'validated':'unavailable',validatorId:p.validatorId}));
  return {run,item,job,policies};
 }
 writable(itemId){const item=this.db.prepare('SELECT status FROM line_auto_items WHERE id=?').get(itemId);if(item?.status!=='claimed'||this.db.prepare('SELECT 1 FROM line_auto_permits WHERE item_id=?').get(itemId))fail('AUTONOMY_TERMINAL_FENCED');}
 access({runId,cap,itemId}){this.authority.item(runId,cap,itemId);return this.current(runId,itemId);}
 saveAnalysis({runId,cap,itemId,body}){return this.authority.tx(()=>{
  const c=this.access({runId,cap,itemId});this.writable(itemId);
  const ordinary=exact(body,['schema','kind','itemId','sha256','identityInference','caption','tags'])&&body.schema===1&&body.kind==='scene-analysis-v1'&&body.identityInference===false&&typeof body.caption==='string'&&body.caption.length<=2000&&Array.isArray(body.tags)&&body.tags.length<=50&&body.tags.every(t=>typeof t==='string'&&t.length<=80&&!/[\u0000-\u001f]/.test(t));
  const extended=typeof this.analysisSource?.validateAnalysis==='function'&&this.analysisSource.validateAnalysis(body)===true;
  if((!ordinary&&!extended)||body.itemId!==itemId||body.sha256!==c.job.sha256)fail('SCENE_ANALYSIS_SCHEMA_REQUIRED',400);
  const payload=copy(body),resultDigest=hash(payload),old=this.db.prepare('SELECT * FROM line_auto_analysis WHERE item_id=?').get(itemId);
  if(old&&(old.run_id!==runId||old.result_digest!==resultDigest||old.payload!==JSON.stringify(payload)))fail('ANALYSIS_ALREADY_SEALED');
  if(!old)this.db.prepare('INSERT INTO line_auto_analysis VALUES(?,?,?,?,?)').run(itemId,runId,c.run.user_id,resultDigest,JSON.stringify(payload));
  const receiptId=typeof this.analysisSource?.onAnalysis==='function'?this.analysisSource.onAnalysis({context:c,body:payload,resultDigest}):null;
  if(receiptId!==null&&!uuid(receiptId))fail('ANALYSIS_SOURCE_RECEIPT_INVALID',503);
  return {status:'completed',persisted:true,itemId,sha256:c.job.sha256,resultDigest,identityInference:false,analysisKind:body.kind,...(receiptId?{relevanceReceiptId:receiptId}:{})};
 });}
 analysis(c){const a=this.db.prepare('SELECT * FROM line_auto_analysis WHERE item_id=? AND run_id=?').get(c.item.id,c.run.id);if(!a||a.user_id!==c.run.user_id||hash(JSON.parse(a.payload))!==a.result_digest)fail('DURABLE_ANALYSIS_REQUIRED');const payload=JSON.parse(a.payload);return {status:'completed',persisted:true,itemId:c.item.id,sha256:c.item.sha256,resultDigest:a.result_digest,identityInference:false,analysisKind:payload.kind};}
 verifiedReceipt(c,analysis,id){if(id===null)return null;const r=this.readReceipt({ownerId:c.run.user_id,receiptId:id});if(!r||typeof r.then==='function')return null;const receipt=copy(r);if(receipt.receiptId!==id||this.verifyReceipt({receipt,job:c.job,analysis,policies:c.policies})!==true)return null;return receipt;}
 async decide({runId,cap,itemId,body}){
  const c=this.access({runId,cap,itemId});this.writable(itemId);
  if(!exact(body,['analysisDigest','receiptId'])||!sha(body.analysisDigest)||body.receiptId!==null&&!uuid(body.receiptId))fail('DURABLE_RECEIPT_REFERENCE_REQUIRED',400);
  const analysis=this.analysis(c);if(body.analysisDigest!==analysis.resultDigest)fail('ANALYSIS_BINDING_CHANGED');
  const receipt=this.verifiedReceipt(c,analysis,body.receiptId),{decideAutomaticImport}=await import('./relevance-gate.mjs');
  const decision=await decideAutomaticImport({job:c.job,policies:c.policies,analysis,receipt,verifyReceipt:()=>receipt!==null,now:()=>this.authority.now()});
  return this.authority.tx(()=>{const fresh=this.access({runId,cap,itemId});this.writable(itemId);if(hash(fresh.job)!==hash(c.job)||fresh.run.scope_digest!==c.run.scope_digest||!same(this.analysis(fresh),analysis)||!same(this.verifiedReceipt(fresh,analysis,body.receiptId),receipt))fail('DECISION_INPUT_CHANGED');
   const value=copy(decision),decisionDigest=value.decisionDigest??hash({decision:value,analysisDigest:analysis.resultDigest,scopeDigest:c.run.scope_digest}),old=this.db.prepare('SELECT * FROM line_auto_decisions WHERE item_id=?').get(itemId);
   if(old&&(old.run_id!==runId||old.decision_digest!==decisionDigest||old.payload!==JSON.stringify(value)||old.receipt!==JSON.stringify(receipt)))fail('DECISION_ALREADY_SEALED');
   if(!old)this.db.prepare('INSERT INTO line_auto_decisions VALUES(?,?,?,?,?,?,?,?)').run(itemId,runId,c.run.user_id,decisionDigest,analysis.resultDigest,c.run.scope_digest,JSON.stringify(value),JSON.stringify(receipt));
   return {...value,decisionDigest,persisted:true,itemId};
  });
 }
 freshDecision(runId,itemId){
  const c=this.current(runId,itemId),a=this.analysis(c),row=this.db.prepare('SELECT * FROM line_auto_decisions WHERE item_id=? AND run_id=?').get(itemId,runId);
  if(!row||row.user_id!==c.run.user_id||row.scope_digest!==c.run.scope_digest||row.analysis_digest!==a.resultDigest)fail('CURRENT_DURABLE_DECISION_REQUIRED');
  const decision=JSON.parse(row.payload),receipt=JSON.parse(row.receipt);
  if(!['import','skip'].includes(decision.action)||!decision.seal||hash(decision.seal)!==row.decision_digest||decision.decisionDigest!==row.decision_digest||!receipt||receipt.expiresAt<=this.authority.now()||!same(this.verifiedReceipt(c,a,receipt.receiptId),receipt))fail('VERIFIED_RELEVANCE_REQUIRED');
  return {...c,analysis:a,decision,decisionDigest:row.decision_digest};
 }
 importGuards(){return this.guards??=( {
  prepare:(user,input,proof)=>{if(!exact(proof,['runId','decisionDigest'])||!uuid(proof.runId)||!sha(proof.decisionDigest)||!Array.isArray(input?.itemIds)||input.itemIds.length!==1)fail('AUTOMATIC_IMPORT_PROOF_REQUIRED');const c=this.freshDecision(proof.runId,input.itemIds[0]);this.writable(c.item.id);if(user!==c.run.user_id||c.decision.action!=='import'||c.decisionDigest!==proof.decisionDigest||!same(input,c.decision.apiRequest))fail('AUTOMATIC_IMPORT_NOT_AUTHORIZED');return {runId:c.run.id,decisionDigest:c.decisionDigest,scopeDigest:c.run.scope_digest};},
  assertCurrent:plan=>{if(!plan?.automation)return false;const c=this.freshDecision(plan.automation.runId,plan.itemId);const terminal=this.db.prepare('SELECT 1 FROM line_auto_permits WHERE item_id=?').get(plan.itemId);if((terminal||c.item.status!=='claimed')&&this.db.prepare('SELECT status FROM imports WHERE id=?').get(plan.itemId)?.status!=='completed')return false;return c.decision.action==='import'&&c.run.user_id===plan.userId&&c.run.source===plan.source&&c.run.scope_digest===plan.automation.scopeDigest&&c.decisionDigest===plan.automation.decisionDigest&&c.item.sha256===plan.sha256&&c.item.bytes===plan.bytes&&c.decision.apiRequest.requestId===plan.batchId&&same(c.decision.albumIds,plan.albumIds)&&same(plan.people,[]);},
  assertManualAllowed:(user,id)=>{this.inbox.user(user);return !this.db.prepare('SELECT 1 FROM line_auto_items WHERE id=?').get(id);}
 });}
 importSource({runId,cap,itemId,body}){
  this.access({runId,cap,itemId});if(!exact(body,['decisionDigest'])||!sha(body.decisionDigest))fail('IMPORT_DECISION_REFERENCE_REQUIRED',400);
  const c=this.freshDecision(runId,itemId);this.writable(itemId);if(c.decision.action!=='import'||c.decisionDigest!==body.decisionDigest)fail('AUTOMATIC_IMPORT_NOT_AUTHORIZED');
  this.engine().requestAutomated(c.run.user_id,c.decision.apiRequest,{runId,decisionDigest:c.decisionDigest});
  return {accepted:true,requestId:c.decision.apiRequest.requestId,itemIds:[itemId]};
 }
 completion(runId,itemId){
  const c=this.freshDecision(runId,itemId),base={itemId,ownerId:c.run.user_id,sourceId:c.job.sourceId,sha256:c.item.sha256,bytes:c.item.bytes,decisionDigest:c.decisionDigest};
  if(c.decision.action==='skip'){
   if(this.db.prepare('SELECT 1 FROM imports WHERE id=?').get(itemId))fail('UNRELATED_ITEM_HAS_IMPORT');
   return {...base,status:'skipped',persisted:true,noImportPlanned:true};
  }
  const row=this.db.prepare('SELECT * FROM imports WHERE id=? AND user_id=?').get(itemId,c.run.user_id);
  if(!row||row.status!=='completed')return {...base,status:'pending'};
  const engine=this.engine(),v=engine.confirmed(row);if(!v||v.plan.batchId!==c.decision.apiRequest.requestId||!same(v.plan.albumIds,c.decision.albumIds)||!same(v.plan.automation,{runId,decisionDigest:c.decisionDigest,scopeDigest:c.run.scope_digest})||v.plan.albumIds.some(id=>!(v.photo.albumIds??[v.photo.albumId]).includes(id)))return {...base,status:'pending'};
  const actions=this.db.prepare("SELECT * FROM outbox WHERE json_extract(payload,'$.type')='import_complete' AND json_extract(payload,'$.userId')=? AND json_extract(payload,'$.batchId')=? AND json_extract(payload,'$.source')=?").all(c.run.user_id,v.plan.batchId,c.run.source);
  const notice=actions.length===1&&actions[0],action=notice&&JSON.parse(notice.payload),message=action&&engine.notification(action);
  return {...base,status:'completed',importStatus:'completed',journalStatus:v.q.status,providerVerified:true,providerPhotoId:v.photo.id,receiptId:row.receipt_id,albumIds:v.plan.albumIds,notice:notice&&notice.line_id===c.job.sourceId&&message?.to===c.job.sourceId?{id:notice.id,status:notice.status,sourceId:c.job.sourceId,count:1,requestId:v.plan.batchId}:null};
 }
 getCompletion({runId,cap,itemId}){this.access({runId,cap,itemId});const value=this.completion(runId,itemId);return {...value,completionDigest:hash(value)};}
 verifyTerminal({db,run,item,decisionDigest,completionDigest}){
  if(db!==this.db||this.db.isTransaction!==true)return false;
  const value=this.completion(run.id,item.id);return value.decisionDigest===decisionDigest&&hash(value)===completionDigest&&(value.status==='skipped'||value.status==='completed'&&value.notice?.status==='sent');
 }
 adapters(){return Object.fromEntries(['saveAnalysis','decide','importSource','getCompletion','verifyTerminal'].map(name=>[name,this[name].bind(this)]));}
 eraseUser(user){if(!this.enabled)return;this.authority.tx(()=>{for(const t of ['line_auto_decisions','line_auto_analysis','line_theme_receipts'])if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t))this.db.prepare('DELETE FROM '+t+' WHERE user_id=?').run(user);});}
}
module.exports={AutonomousService};
