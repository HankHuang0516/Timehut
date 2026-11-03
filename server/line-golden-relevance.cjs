'use strict';
// Hank1028: Canonical receipt bridge. A raw model score never calls import.
// Hank1030: Reference-person policy. verifyReferences must also confirm that
// each album's consent is the current same-person consent version.
const crypto=require('node:crypto'),policy=require('./line-golden-policy.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const check=(v,c)=>{if(!v)throw Error(c);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
/** Source candidate: must be explicitly installed by startup composition.
 * verifyReferences must synchronously check current owner/photo/membership/
 * consent and the reference revision; default false leaves upload unavailable.
 */
function createGoldenRelevance(inbox,{snapshot,calibration,verifyFiles=()=>false,verifyReferences=()=>false}={}){
 snapshot=policy.snapshot(snapshot);calibration=copy(calibration);const db=inbox.db,snapshotDigest=policy.hash(snapshot),validatorId=policy.POLICY_ID;
 check(calibration?.schema===1&&calibration.kind==='golden-person-calibration-v1'&&uuid(calibration.receiptId)&&calibration.policyDigest===policy.POLICY_DIGEST&&calibration.snapshotDigest===snapshotDigest&&calibration.modelTransport==='mcode-tools'&&Array.isArray(calibration.cases)&&calibration.cases.length>=2&&calibration.cases.length<=20,'GOLDEN_CALIBRATION_REQUIRED');
 const covered=new Set(),seen=new Set();
 for(const c of calibration.cases){
  check(c.analysis&&['import','skip'].includes(c.expected)&&!seen.has(c.analysis.sha256),'GOLDEN_CALIBRATION_CASE_INVALID');seen.add(c.analysis.sha256);
  const v=policy.evaluate(c.analysis,snapshot,snapshot.albums.map(a=>a.albumId));
  const action=v.some(v=>v.verdict==='related')?'import':v.every(v=>v.verdict==='unrelated')?'skip':'hold';check(action===c.expected,'GOLDEN_CALIBRATION_FAILED');covered.add(action);
 }
 check(covered.has('import')&&covered.has('skip'),'GOLDEN_POSITIVE_AND_NEGATIVE_CALIBRATION_REQUIRED');
 const configurationDigest=policy.hash({snapshot,calibration});
 const profile=albumId=>{const album=snapshot.albums.find(a=>a.albumId===albumId);check(album,'GOLDEN_ALBUM_NOT_CONFIGURED');return {referenceRevision:snapshot.revision,referenceDigest:policy.hash({configurationDigest,album}),validatorId,calibrationReceiptId:calibration.receiptId,referencesConfirmed:true};};
 const ready=()=>{try{check(verifyFiles()===true&&verifyReferences(copy(snapshot))===true,'GOLDEN_REFERENCES_NOT_CURRENT');inbox.user(snapshot.ownerId);for(const a of snapshot.albums)inbox.album(snapshot.ownerId,a.albumId);return true;}catch{return false;}};
 function validate(body){try{policy.envelope(body,snapshot);return true;}catch{return false;}}
 function context(job,policies){
  check(ready()&&job.ownerId===snapshot.ownerId&&job.allowedAlbumIds.length===policies.length,'GOLDEN_OWNER_OR_SCOPE_CHANGED');
  for(const p of policies){const v=profile(p.albumId);check(job.allowedAlbumIds.includes(p.albumId)&&p.ownerId===snapshot.ownerId&&p.enabled===true&&p.consent===true&&p.referencesConfirmed===true&&p.validationStatus==='validated'&&p.referenceRevision===v.referenceRevision&&p.referenceDigest===v.referenceDigest&&p.validatorId===validatorId,'GOLDEN_POLICY_CHANGED');}
 }
 const verdicts=(body,job,policies)=>policy.evaluate(body,snapshot,job.allowedAlbumIds).map(v=>{const p=policies.find(p=>p.albumId===v.albumId);return {albumId:v.albumId,policyRevision:p.policyRevision,referenceRevision:p.referenceRevision,referenceDigest:p.referenceDigest,verdict:v.verdict};});
 const table=()=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='line_golden_receipts'").get();
 const readReceipt=({ownerId,receiptId})=>{if(!ready()||ownerId!==snapshot.ownerId||!uuid(receiptId)||!table())return null;const row=db.prepare('SELECT payload FROM line_golden_receipts WHERE receipt_id=? AND user_id=? AND config_digest=?').get(receiptId,ownerId,configurationDigest);return row?JSON.parse(row.payload):null;};
 return Object.freeze({ready,profile,readReceipt,validateAnalysis:validate,
  installProfiles(authority){
   check(authority.db===db&&authority.enabled&&ready(),'GOLDEN_STARTUP_NOT_READY');
   for(const a of snapshot.albums){const v=profile(a.albumId),old=db.prepare('SELECT revision,payload FROM line_auto_profiles WHERE user_id=? AND album_id=?').get(snapshot.ownerId,a.albumId);
    if(old){const p=JSON.parse(old.payload);if(p.enabled===true&&p.validated===true&&Object.entries(v).every(([k,n])=>p[k]===n))continue;}
    check(!db.prepare("SELECT 1 FROM line_auto_runs WHERE user_id=? AND state='armed' AND expires_at>?").get(snapshot.ownerId,inbox.now()),'GOLDEN_CHANGE_REQUIRES_CLOSED_RUNS');authority.publishProfile(snapshot.ownerId,a.albumId,{expectedRevision:old?.revision??0,...v});
   }
  },
  verifyCalibration(input){try{return ready()&&input.user===snapshot.ownerId&&Object.entries(profile(input.album)).every(([k,v])=>input[k]===v);}catch{return false;}},
  onAnalysis({context:c,body,resultDigest}){
   check(db.isTransaction===true,'GOLDEN_ANALYSIS_TRANSACTION_REQUIRED');context(c.job,c.policies);const expected=verdicts(body,c.job,c.policies);
   check(body.itemId===c.job.itemId&&body.sha256===c.job.sha256&&policy.hash(body)===resultDigest,'GOLDEN_ANALYSIS_BINDING_CHANGED');
   db.exec('CREATE TABLE IF NOT EXISTS line_golden_receipts(receipt_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,item_id TEXT NOT NULL UNIQUE,run_id TEXT NOT NULL,config_digest TEXT NOT NULL,analysis_digest TEXT NOT NULL,payload TEXT NOT NULL) STRICT;');
   const old=db.prepare('SELECT * FROM line_golden_receipts WHERE item_id=?').get(c.job.itemId);
   if(old){check(old.run_id===c.run.id&&old.user_id===snapshot.ownerId&&old.config_digest===configurationDigest&&old.analysis_digest===resultDigest,'GOLDEN_RECEIPT_ALREADY_SEALED');return old.receipt_id;}
   const now=inbox.now();check(now>=c.job.createdAt&&c.run.expires_at>now,'GOLDEN_RUN_EXPIRED');const receiptId=crypto.randomUUID();
   const receipt={schema:1,kind:'album-relevance-v1',itemId:c.job.itemId,ownerId:snapshot.ownerId,sourceId:c.job.sourceId,sha256:c.job.sha256,analysisDigest:resultDigest,bindingRevision:c.job.bindingRevision,createdAt:now,expiresAt:Math.min(c.run.expires_at,now+600000),receiptId,validatorId,verdicts:expected};
   db.prepare('INSERT INTO line_golden_receipts VALUES(?,?,?,?,?,?,?)').run(receiptId,snapshot.ownerId,c.job.itemId,c.run.id,configurationDigest,resultDigest,JSON.stringify(receipt));return receiptId;
  },
  verifyReceipt({receipt,job,analysis,policies}){try{
   context(job,policies);check(receipt.itemId===job.itemId&&receipt.ownerId===snapshot.ownerId&&receipt.sourceId===job.sourceId&&receipt.sha256===job.sha256&&receipt.bindingRevision===job.bindingRevision&&receipt.analysisDigest===analysis.resultDigest&&receipt.validatorId===validatorId&&receipt.expiresAt>inbox.now()&&same(readReceipt({ownerId:snapshot.ownerId,receiptId:receipt.receiptId}),receipt),'GOLDEN_RECEIPT_CHANGED');
   const row=db.prepare('SELECT a.payload,a.result_digest FROM line_auto_analysis a JOIN line_golden_receipts g ON a.item_id=g.item_id AND a.run_id=g.run_id WHERE g.receipt_id=? AND a.user_id=? AND g.config_digest=?').get(receipt.receiptId,snapshot.ownerId,configurationDigest);check(row&&row.result_digest===analysis.resultDigest,'GOLDEN_ANALYSIS_NOT_DURABLE');const body=JSON.parse(row.payload);
   return policy.hash(body)===analysis.resultDigest&&body.itemId===job.itemId&&body.sha256===job.sha256&&same(receipt.verdicts,verdicts(body,job,policies));
  }catch{return false;}},
  eraseUser(ownerId){if(ownerId===snapshot.ownerId&&table())db.prepare('DELETE FROM line_golden_receipts WHERE user_id=?').run(ownerId);}
 });
}
module.exports={createGoldenRelevance};
