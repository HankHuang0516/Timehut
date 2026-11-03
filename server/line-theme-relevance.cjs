'use strict';
const fs=require('node:fs');
const policy=require('./line-theme-policy.cjs');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const check=(v,code)=>{if(!v)throw Error(code);};
const copy=x=>JSON.parse(JSON.stringify(x));
function privateJSON(file){
 check(typeof file==='string'&&file.startsWith('/')&&fs.realpathSync(file)===file,'THEME_PRIVATE_FILE_REQUIRED');
 const s=fs.lstatSync(file);check(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o077)===0&&s.size>0&&s.size<=65536,'THEME_PRIVATE_FILE_REQUIRED');
 const bytes=fs.readFileSync(file);return {file,digest:policy.hash(bytes.toString('utf8')),value:JSON.parse(bytes)};
}
function calibrationValid(c){
 try{
  check(exact(c,['schema','kind','receiptId','policyDigest','promptDigest','modelTransport','cases'])&&c.schema===1&&c.kind==='visual-theme-calibration-v1'&&uuid(c.receiptId)&&c.policyDigest===policy.POLICY_DIGEST&&c.promptDigest===policy.PROMPT_DIGEST&&c.modelTransport==='mcode-tools','THEME_CALIBRATION_REQUIRED');
  check(Array.isArray(c.cases)&&c.cases.length>=2&&c.cases.length<=10,'THEME_CALIBRATION_REQUIRED');
  const seen=new Set(),coverage=new Map(policy.THEMES.map(t=>[t.id,new Set()]));
  for(const item of c.cases){
   check(exact(item,['inputSHA256','expected','output'])&&/^[a-f0-9]{64}$/.test(item.inputSHA256)&&!seen.has(item.inputSHA256),'THEME_CALIBRATION_INPUT_REQUIRED');seen.add(item.inputSHA256);
   const out=policy.normalizeModelResult(item.output);check(exact(item.expected,policy.THEMES.map(t=>t.id)),'THEME_CALIBRATION_EXPECTATION_REQUIRED');
   for(const t of out.themes){const expected=item.expected[t.id];check(['related','unrelated'].includes(expected)&&policy.verdict(t.score)===expected,'THEME_CALIBRATION_FAILED');coverage.get(t.id).add(expected);}
  }
  return [...coverage.values()].every(v=>v.has('related')&&v.has('unrelated'));
 }catch{return false;}
}
function createThemeRelevance(inbox,{config,calibration,verifyFiles=()=>false}={}){
 config=copy(config);calibration=copy(calibration);
 check(exact(config,['schema','enabled','ownerId','revision','policyDigest','calibrationDigest','bindings'])&&config.schema===1&&config.enabled===true&&typeof config.ownerId==='string'&&Number.isSafeInteger(config.revision)&&config.revision>0&&config.policyDigest===policy.POLICY_DIGEST&&config.calibrationDigest===policy.hash(calibration)&&calibrationValid(calibration),'THEME_CONFIGURATION_NOT_VALIDATED');
 check(Array.isArray(config.bindings)&&config.bindings.length===policy.THEMES.length,'THEME_BINDINGS_REQUIRED');
 const albums=new Set(),themes=new Set();
 for(const b of config.bindings){check(exact(b,['themeId','albumId'])&&policy.THEMES.some(t=>t.id===b.themeId)&&typeof b.albumId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(b.albumId)&&!albums.has(b.albumId)&&!themes.has(b.themeId),'THEME_BINDINGS_INVALID');albums.add(b.albumId);themes.add(b.themeId);}
 const db=inbox.db,configDigest=policy.hash(config),validatorId=policy.POLICY_ID;
 const profile=albumId=>{const binding=config.bindings.find(b=>b.albumId===albumId);check(binding,'THEME_ALBUM_NOT_CONFIGURED');return {referenceRevision:config.revision,referenceDigest:policy.hash({configDigest,binding}),validatorId,calibrationReceiptId:calibration.receiptId,referencesConfirmed:true};};
 const ready=()=>{try{check(verifyFiles()===true,'THEME_CONFIGURATION_CHANGED');inbox.user(config.ownerId);for(const a of albums)inbox.album(config.ownerId,a);return true;}catch{return false;}};
 const tableExists=()=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='line_theme_receipts'").get();
 const verifyPolicies=(job,policies)=>{
  check(ready()&&job.ownerId===config.ownerId&&job.allowedAlbumIds.length===policies.length,'THEME_OWNER_OR_SCOPE_CHANGED');
  for(const p of policies){const expected=profile(p.albumId);check(job.allowedAlbumIds.includes(p.albumId)&&p.ownerId===config.ownerId&&p.enabled===true&&p.consent===true&&p.referencesConfirmed===true&&p.validationStatus==='validated'&&p.referenceRevision===expected.referenceRevision&&p.referenceDigest===expected.referenceDigest&&p.validatorId===validatorId,'THEME_POLICY_CHANGED');}
 };
 const readReceipt=({ownerId,receiptId})=>{
  if(!ready()||ownerId!==config.ownerId||!uuid(receiptId)||!tableExists())return null;
  const row=db.prepare('SELECT payload FROM line_theme_receipts WHERE receipt_id=? AND user_id=? AND config_digest=?').get(receiptId,ownerId,configDigest);return row?JSON.parse(row.payload):null;
 };
 function expectedVerdicts(body,policies){return policies.map(p=>{const b=config.bindings.find(b=>b.albumId===p.albumId),t=body.classification.themes.find(t=>t.id===b.themeId);return {albumId:p.albumId,policyRevision:p.policyRevision,referenceRevision:p.referenceRevision,referenceDigest:p.referenceDigest,verdict:policy.verdict(t.score)};});}
 return Object.freeze({
  ready,profile,readReceipt,
  installProfiles(authority){
   check(authority.db===db&&authority.enabled&&ready(),'THEME_PROFILE_STARTUP_NOT_READY');
   for(const albumId of albums){
    const expected=profile(albumId),old=db.prepare('SELECT revision,payload FROM line_auto_profiles WHERE user_id=? AND album_id=?').get(config.ownerId,albumId);
    if(old){const p=JSON.parse(old.payload);if(p.enabled===true&&p.validated===true&&Object.entries(expected).every(([k,v])=>p[k]===v))continue;
     check(!db.prepare("SELECT 1 FROM line_auto_runs WHERE user_id=? AND state='armed'").get(config.ownerId),'THEME_POLICY_CHANGE_REQUIRES_CLOSED_RUNS');}
    authority.publishProfile(config.ownerId,albumId,{expectedRevision:old?.revision??0,...expected});
   }
  },
  validateAnalysis:policy.validateAnalysis,
  verifyCalibration:input=>{try{check(ready()&&input.user===config.ownerId,'THEME_OWNER_CHANGED');const p=profile(input.album);return Object.entries(p).every(([k,v])=>input[k]===v);}catch{return false;}},
  onAnalysis({context:c,body,resultDigest}){
   check(db.isTransaction===true,'THEME_ANALYSIS_TRANSACTION_REQUIRED');
   if(!policy.validateAnalysis(body))return null;
   verifyPolicies(c.job,c.policies);check(body.itemId===c.job.itemId&&body.sha256===c.job.sha256&&policy.hash(body)===resultDigest,'THEME_ANALYSIS_BINDING_CHANGED');
   db.exec('CREATE TABLE IF NOT EXISTS line_theme_receipts(receipt_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,item_id TEXT NOT NULL UNIQUE,run_id TEXT NOT NULL,config_digest TEXT NOT NULL,analysis_digest TEXT NOT NULL,payload TEXT NOT NULL) STRICT;');
   const h=policy.hash({configDigest,runId:c.run.id,itemId:c.job.itemId,resultDigest});
   const receiptId=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);
   const old=db.prepare('SELECT * FROM line_theme_receipts WHERE item_id=?').get(c.job.itemId);
   if(old){check(old.receipt_id===receiptId&&old.user_id===config.ownerId&&old.run_id===c.run.id&&old.config_digest===configDigest&&old.analysis_digest===resultDigest,'THEME_RECEIPT_ALREADY_SEALED');return receiptId;}
   const now=inbox.now();check(now>=c.job.createdAt&&c.run.expires_at>now,'THEME_RUN_EXPIRED');
   const receipt={schema:1,kind:'album-relevance-v1',itemId:c.job.itemId,ownerId:config.ownerId,sourceId:c.job.sourceId,sha256:c.job.sha256,analysisDigest:resultDigest,bindingRevision:c.job.bindingRevision,createdAt:now,expiresAt:Math.min(c.run.expires_at,now+600000),receiptId,validatorId,verdicts:expectedVerdicts(body,c.policies)};
   db.prepare('INSERT INTO line_theme_receipts VALUES(?,?,?,?,?,?,?)').run(receiptId,config.ownerId,c.job.itemId,c.run.id,configDigest,resultDigest,JSON.stringify(receipt));return receiptId;
  },
  verifyReceipt({receipt,job,analysis,policies}){
   try{
    verifyPolicies(job,policies);check(receipt.itemId===job.itemId&&receipt.ownerId===config.ownerId&&receipt.sourceId===job.sourceId&&receipt.sha256===job.sha256&&receipt.bindingRevision===job.bindingRevision&&receipt.analysisDigest===analysis.resultDigest&&receipt.validatorId===validatorId&&receipt.expiresAt>inbox.now(),'THEME_RECEIPT_BINDING_CHANGED');
    check(same(readReceipt({ownerId:config.ownerId,receiptId:receipt.receiptId}),receipt),'THEME_RECEIPT_NOT_DURABLE');
    const stored=db.prepare('SELECT a.payload,a.result_digest,a.run_id FROM line_auto_analysis a JOIN line_theme_receipts t ON a.item_id=t.item_id AND a.run_id=t.run_id WHERE t.receipt_id=? AND a.user_id=? AND t.config_digest=?').get(receipt.receiptId,config.ownerId,configDigest);
    check(stored&&stored.result_digest===analysis.resultDigest,'THEME_ANALYSIS_NOT_DURABLE');const body=JSON.parse(stored.payload);
    return policy.validateAnalysis(body)&&policy.hash(body)===analysis.resultDigest&&same(receipt.verdicts,expectedVerdicts(body,policies));
   }catch{return false;}
  }
 });
}
function loadThemeRelevance(inbox,configFile,calibrationFile){
 const c=privateJSON(configFile),v=privateJSON(calibrationFile);
 return createThemeRelevance(inbox,{config:c.value,calibration:v.value,verifyFiles:()=>{try{return privateJSON(c.file).digest===c.digest&&privateJSON(v.file).digest===v.digest;}catch{return false;}}});
}
module.exports={createThemeRelevance,loadThemeRelevance,calibrationValid};
