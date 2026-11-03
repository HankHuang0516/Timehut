'use strict';
const crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const uid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(x,k));
const features=['bounded_run','current_consent','job_receipt_binding','verified_relevance','idempotent_import','completion_receipt','cleanup_permit','cleanup_permit_recheck'];
/** Canonical authority uses the existing LINE SQLite connection so source/run,
 * reader leases and terminal fences share one BEGIN IMMEDIATE transaction.
 * No image recognition, upload, LINE send, or production initialization here.
 */
class RunAuthority{
 constructor(inbox,{enabled=false,now=()=>inbox.now(),verifyCalibration=()=>false,transportReady=()=>false,standingGrants=null}={}){
  this.inbox=inbox;this.db=inbox.db;this.enabled=enabled;this.now=now;this.verifyCalibration=verifyCalibration;this.transportReady=transportReady;this.standingGrants=standingGrants;
  if(!enabled)return;
  if(this.db.prepare('PRAGMA user_version').get().user_version!==5)fail('LINE_SCHEMA_UNSUPPORTED',503);const meta=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='line_auto_meta'").get();if(meta&&this.db.prepare('SELECT version FROM line_auto_meta WHERE id=1').get()?.version!==1)fail('AUTOMATION_SCHEMA_UNAVAILABLE',503);
  this.inbox.tx(()=>this.db.exec(`CREATE INDEX IF NOT EXISTS line_collection_pending ON items(user_id,source,status,created_at);
   CREATE TABLE IF NOT EXISTS line_auto_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL) STRICT;
   INSERT OR IGNORE INTO line_auto_meta VALUES(1,1);
   CREATE TABLE IF NOT EXISTS line_auto_ingress(sequence INTEGER PRIMARY KEY AUTOINCREMENT,item_id TEXT NOT NULL UNIQUE,event_id TEXT NOT NULL,event_timestamp INTEGER NOT NULL,received_at INTEGER NOT NULL,source TEXT NOT NULL,user_id TEXT NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS line_auto_profiles(user_id TEXT NOT NULL,album_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(user_id,album_id)) STRICT;
   CREATE TABLE IF NOT EXISTS line_auto_runs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,source TEXT NOT NULL,scope TEXT NOT NULL,scope_digest TEXT NOT NULL,cap_hash TEXT NOT NULL,watermark INTEGER NOT NULL,max_jobs INTEGER NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS line_auto_items(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,user_id TEXT NOT NULL,source TEXT NOT NULL,sha256 TEXT NOT NULL,bytes INTEGER NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS line_auto_readers(id TEXT PRIMARY KEY,item_id TEXT NOT NULL,run_id TEXT NOT NULL,state TEXT NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS line_auto_permits(id TEXT PRIMARY KEY,item_id TEXT NOT NULL UNIQUE,run_id TEXT NOT NULL,scope_digest TEXT NOT NULL,decision_digest TEXT NOT NULL,completion_digest TEXT NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS line_standing_grants(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL,source TEXT NOT NULL,setup_digest TEXT NOT NULL,max_jobs INTEGER NOT NULL,duration_ms INTEGER NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL) STRICT;`));
  if(this.db.prepare('SELECT version FROM line_auto_meta WHERE id=1').get()?.version!==1)fail('AUTOMATION_SCHEMA_UNAVAILABLE',503);
 }
 requireEnabled(){if(!this.enabled)fail('AUTOMATION_DISABLED',503);this.inbox.store.assertAvailable();}
 tx(fn){this.requireEnabled();return this.inbox.tx(fn);}
 capabilities(){return {protocol:1,enabled:this.enabled&&this.transportReady()===true,features:[...features]};}
 assertNoTerminalFence(user,album){this.requireEnabled();const held=this.db.prepare("SELECT r.scope FROM line_auto_permits p JOIN line_auto_runs r ON p.run_id=r.id WHERE r.user_id=? AND p.state='held'").all(user);if(held.some(r=>JSON.parse(r.scope).albumIds.includes(album)))fail('TERMINAL_CLEANUP_IN_PROGRESS');}
 // Only server-owned calibration validation can publish a usable profile.
 // User HTTP input must not directly call this with model-supplied booleans.
 publishProfile(user,album,input){return this.tx(()=>{this.inbox.album(user,album);this.assertNoTerminalFence(user,album);if(!exact(input,['expectedRevision','referenceRevision','referenceDigest','validatorId','calibrationReceiptId','referencesConfirmed'])||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||!Number.isSafeInteger(input.referenceRevision)||input.referenceRevision<1||!digest(input.referenceDigest)||typeof input.validatorId!=='string'||!input.validatorId||!uid(input.calibrationReceiptId)||input.referencesConfirmed!==true)fail('PROFILE_NOT_CONFIRMED',400);if(this.verifyCalibration({user,album,...input})!==true)fail('CLASSIFIER_CALIBRATION_NOT_VERIFIED');const prior=this.db.prepare('SELECT revision FROM line_auto_profiles WHERE user_id=? AND album_id=?').get(user,album);if((prior?.revision||0)!==input.expectedRevision)fail('PROFILE_REVISION_CHANGED');const revision=input.expectedRevision+1,payload={...input,revision,enabled:true,validated:true};this.db.prepare('INSERT INTO line_auto_profiles VALUES(?,?,?,?) ON CONFLICT(user_id,album_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload').run(user,album,revision,JSON.stringify(payload));return {revision};});}
 disableProfile(user,album,expectedRevision){return this.tx(()=>{this.inbox.album(user,album);this.assertNoTerminalFence(user,album);const prior=this.db.prepare('SELECT * FROM line_auto_profiles WHERE user_id=? AND album_id=?').get(user,album);if(!prior||prior.revision!==expectedRevision)fail('PROFILE_REVISION_CHANGED');const p={...JSON.parse(prior.payload),enabled:false,revision:prior.revision+1};this.db.prepare('UPDATE line_auto_profiles SET revision=?,payload=? WHERE user_id=? AND album_id=?').run(p.revision,JSON.stringify(p),user,album);return p;});}
 sourceScope(user,{sourceType,sourceId,albumIds,collectionSettings=false}){
  this.requireEnabled();this.inbox.user(user);if(!['user','group'].includes(sourceType)||typeof sourceId!=='string'||!(sourceType==='user'?/^U[a-f0-9]{32}$/:/^C[a-f0-9]{32}$/).test(sourceId))fail('SOURCE_INVALID',400);
  const source=sourceType+':'+sourceId,row=sourceType==='user'?this.db.prepare('SELECT * FROM links WHERE line_id=? AND user_id=? AND active=1').get(sourceId,user):this.db.prepare('SELECT * FROM groups WHERE group_id=? AND user_id=? AND active=1').get(sourceId,user);
  if(!row||!this.db.prepare('SELECT 1 FROM links WHERE line_id=? AND user_id=? AND active=1').get(sourceType==='user'?sourceId:row.line_id,user))fail('SOURCE_NOT_AUTHORIZED',404);
  const ids=this.inbox.albumSelection(user,albumIds),allowed=this.inbox.bindingAlbums(source);if(ids.some(id=>!allowed.includes(id)))fail('SOURCE_ALBUM_NOT_AUTHORIZED',404);
  const profiles=ids.map(album=>{const p=this.db.prepare('SELECT * FROM line_auto_profiles WHERE user_id=? AND album_id=?').get(user,album);if(!p)return {albumId:album,ready:false};const v=JSON.parse(p.payload);return {albumId:album,ready:v.enabled===true&&v.validated===true&&v.referencesConfirmed===true,policyRevision:p.revision,referenceRevision:v.referenceRevision,referenceDigest:v.referenceDigest,validatorId:v.validatorId,calibrationReceiptId:v.calibrationReceiptId};});
  const bindings=ids.map(album=>this.db.prepare('SELECT album_id AS albumId,since FROM binding_albums WHERE source=? AND album_id=? AND active=1').get(source,album));
  const scope={...(collectionSettings===true?{collectionSettings:true,authorizationSource:'collection_settings'}:{}),ownerId:user,sourceType,sourceId,source,sourceAlbumIds:[...allowed].sort(),bindingRevision:row.since,albumIds:ids,bindings,profiles};return {...scope,setupDigest:hash(scope),ready:profiles.every(p=>p.ready)};
 }
 preview(user,input){const {setupDigest,ready,...scope}=this.sourceScope(user,input);return {setupDigest,ready,...scope};}
 createRun(user,input){return this.tx(()=>{
  if(this.transportReady()!==true)fail('AUTOMATION_TRANSPORT_NOT_READY',503);
  const base=['sourceType','sourceId','albumIds','setupDigest','maxJobs','durationMs'];
  const byCollection=input?.collectionSettings===true;
  if(!byCollection||!exact(input,[...base,'collectionSettings']))fail('COLLECTION_SETTINGS_REQUIRED',400);
  if(!digest(input.setupDigest)||!Number.isSafeInteger(input.maxJobs)||input.maxJobs<1||input.maxJobs>4||!Number.isSafeInteger(input.durationMs)||input.durationMs<1000||input.durationMs>1800000)fail('RUN_BOUNDS_INVALID',400);
  // sourceScope validates the persisted owner/source/albums on every access;
  // the request boolean is a protocol selector, never an authorization proof.
  const current=this.sourceScope(user,input);
  if(!current.ready)fail('REFERENCE_OR_CLASSIFIER_NOT_READY');
  if(current.setupDigest!==input.setupDigest)fail('SETUP_CHANGED');
  const n=this.now(),id=crypto.randomUUID(),cap=crypto.randomBytes(32).toString('base64url');
  const watermark=byCollection?0:this.db.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM line_auto_ingress').get().n;
  this.db.prepare("INSERT INTO line_auto_runs VALUES(?,?,?,?,?,?,?,?,?,?,'armed')").run(id,user,current.source,JSON.stringify(current),hash(current),hash(cap),watermark,input.maxJobs,n,n+input.durationMs);
  return {runId:id,runToken:cap,scopeDigest:hash(current),expiresAt:n+input.durationMs,ownerId:user,consentSource:'collection_settings'};
 });}
 collectionPreviews(user){
  const {CollectionSettings}=require('./line-collection-settings.cjs');
  return new CollectionSettings(this.inbox).list(user).flatMap(source=>{
   const sets=new Map();
   // Existing inbox rows were created only by signature-verified receive();
   // retain original identities and item binding timestamps, never manufacture
   // a new webhook or re-run a claimed/uncertain/provider-imported item.
   for(const row of this.db.prepare("SELECT * FROM items WHERE user_id=? AND source=? AND status='downloaded' AND media='image' AND id NOT IN(SELECT id FROM line_auto_items) AND id NOT IN(SELECT id FROM imports) ORDER BY created_at").iterate(user,source.sourceType+':'+source.sourceId)){
    try{const ids=this.inbox.valid(row);const key=JSON.stringify(ids),prior=sets.get(key);sets.set(key,{albumIds:ids,pendingCount:(prior?.pendingCount||0)+1});}catch(e){if(![404,409].includes(e.status))throw e;}
   }
   if(!sets.has(JSON.stringify(source.albumIds)))sets.set(JSON.stringify(source.albumIds),{albumIds:source.albumIds,pendingCount:0});
   return [...sets.values()].map(({albumIds,pendingCount})=>({...this.preview(user,{...source,albumIds,collectionSettings:true}),pendingCount}));
  });
 }

 authenticateRun(runId,cap){this.requireEnabled();const r=this.db.prepare('SELECT * FROM line_auto_runs WHERE id=?').get(runId);if(!r||typeof cap!=='string'||cap.length>128||!crypto.timingSafeEqual(Buffer.from(r.cap_hash,'hex'),Buffer.from(hash(cap),'hex')))fail('RUN_NOT_AUTHORIZED',401);this.inbox.user(r.user_id);if(r.expires_at<=this.now())fail('RUN_EXPIRED');return {...r,parsedScope:JSON.parse(r.scope)};}
 run(runId,cap){const r=this.authenticateRun(runId,cap);if(r.state!=='armed')fail('RUN_NOT_CURRENT');const current=this.sourceScope(r.user_id,r.parsedScope);if(hash(current)!==r.scope_digest)fail('RUN_POLICY_OR_REFERENCE_CHANGED');return r;}

 scope(runId,cap){const r=this.run(runId,cap);return {runId:r.id,ownerId:r.user_id,state:r.state,consentVerified:true,referencePolicyVerified:true,scopeDigest:r.scope_digest,sourceId:r.parsedScope.sourceId,albumIds:r.parsedScope.albumIds,expiresAt:r.expires_at};}
 // Called only with decodeWebhook's signature-verified events, synchronously
 // after inbox.receive and before the webhook handler yields. Never accepts a
 // worker-supplied timestamp as proof that an old input is new.
 recordIngress(events){if(!this.enabled)return 0;return this.tx(()=>this.recordVerifiedIngressWithinTransaction(events));}
 recordVerifiedIngressWithinTransaction(events){if(!this.enabled)return 0;this.requireEnabled();if(this.db.isTransaction!==true)fail('INGRESS_TRANSACTION_REQUIRED');let n=0;for(const e of events){if(e.type!=='media')continue;if(!Number.isSafeInteger(e.timestamp)||typeof e.eventId!=='string')fail('VERIFIED_EVENT_REQUIRED');const source=e.source.type+':'+e.source.id,row=this.db.prepare('SELECT id,user_id FROM items WHERE source=? AND message_id=?').get(source,e.messageId);if(!row)continue;const prior=this.db.prepare('SELECT * FROM line_auto_ingress WHERE item_id=?').get(row.id);if(prior){if(prior.event_id!==e.eventId||prior.event_timestamp!==e.timestamp||prior.source!==source)fail('INGRESS_EVENT_CHANGED');continue;}this.db.prepare('INSERT INTO line_auto_ingress(item_id,event_id,event_timestamp,received_at,source,user_id) VALUES(?,?,?,?,?,?)').run(row.id,e.eventId,e.timestamp,this.now(),source,row.user_id);n++;}return n;}
 next(runId,cap){return this.tx(()=>{const r=this.run(runId,cap);if(this.db.prepare('SELECT count(*) AS n FROM line_auto_items WHERE run_id=?').get(runId).n>=r.max_jobs)return null;const collection=r.parsedScope.collectionSettings===true;
  const rows=collection
   ?this.db.prepare("SELECT i.* FROM items i WHERE i.user_id=? AND i.source=? AND i.status='downloaded' AND i.media='image' AND i.id NOT IN (SELECT id FROM line_auto_items) AND i.id NOT IN (SELECT id FROM imports) ORDER BY i.created_at,i.id").iterate(r.user_id,r.source)
   :this.db.prepare("SELECT g.sequence AS ingestionSequence,i.* FROM items i JOIN line_auto_ingress g ON g.item_id=i.id AND g.source=i.source WHERE g.sequence>? AND g.event_timestamp>? AND g.received_at>=? AND i.user_id=? AND i.source=? AND i.status='downloaded' AND i.media='image' AND i.id NOT IN (SELECT id FROM line_auto_items) AND i.id NOT IN (SELECT id FROM imports) ORDER BY g.sequence LIMIT 50").all(r.watermark,r.created_at,r.created_at,r.user_id,r.source);
  for(const row of rows){let allowed;try{allowed=this.inbox.valid(row);}catch(e){if([404,409].includes(e.status))continue;throw e;}if(collection?JSON.stringify(r.parsedScope.albumIds)!==JSON.stringify(allowed):r.parsedScope.albumIds.some(id=>!allowed.includes(id)))continue;const media=JSON.parse(row.payload||'null');if(!media||!digest(media.sha256)||!Number.isSafeInteger(media.bytes)||media.bytes<=0)continue;this.db.prepare("INSERT INTO line_auto_items VALUES(?,?,?,?,?,?,'claimed',?)").run(row.id,runId,r.user_id,r.source,media.sha256,media.bytes,this.now());return {itemId:row.id,ownerId:r.user_id,sourceType:r.parsedScope.sourceType,sourceId:r.parsedScope.sourceId,sha256:media.sha256,bytes:media.bytes,mime:media.mime,media:row.media,lineMessageId:row.message_id,bindingRevision:row.binding_since,allowedAlbumIds:r.parsedScope.albumIds,serverScopeVerified:true,newInputVerified:true,createdAt:row.created_at,status:'downloaded',revoked:false,runId};}return null;});}
 item(runId,cap,itemId){const r=this.run(runId,cap),item=this.db.prepare('SELECT * FROM line_auto_items WHERE id=? AND run_id=?').get(itemId,runId);if(!item||item.user_id!==r.user_id||item.source!==r.source)fail('ITEM_NOT_IN_RUN',404);const original=this.db.prepare('SELECT * FROM items WHERE id=?').get(itemId);if(!original)fail('SOURCE_REMOVED',404);this.inbox.valid(original);const receipt=JSON.parse(original.payload||'null');if(!receipt||receipt.sha256!==item.sha256||receipt.bytes!==item.bytes)fail('SOURCE_RECEIPT_CHANGED');return {run:r,item};}
 acquireReader(runId,cap,itemId){return this.tx(()=>{const {item}=this.item(runId,cap,itemId);if(item.status!=='claimed'||this.db.prepare("SELECT 1 FROM line_auto_permits WHERE item_id=?").get(itemId))fail('NEW_READER_NOT_ALLOWED');const id=crypto.randomUUID();this.db.prepare("INSERT INTO line_auto_readers VALUES(?,?,?,'open')").run(id,itemId,runId);return {readerId:id,itemId};});}
 // Release-only capability closure remains possible after cancellation or
 // source/profile revocation. Expiry never silently drops an unknown reader;
 // after bounded capability expiry it requires outside-attempt reconciliation.
 releaseReader(runId,cap,itemId,readerId){return this.tx(()=>{const run=this.authenticateRun(runId,cap),item=this.db.prepare('SELECT * FROM line_auto_items WHERE id=? AND run_id=? AND user_id=?').get(itemId,runId,run.user_id);if(!item)fail('ITEM_NOT_IN_RUN',404);const r=this.db.prepare('SELECT * FROM line_auto_readers WHERE id=? AND item_id=? AND run_id=?').get(readerId,itemId,runId);if(!r)fail('READER_NOT_OWNED',404);this.db.prepare("UPDATE line_auto_readers SET state='closed' WHERE id=?").run(readerId);return {closed:true,readerId};});}
 assertMutable(runId,cap,itemId){const c=this.item(runId,cap,itemId);if(c.item.status!=='claimed'||this.db.prepare('SELECT 1 FROM line_auto_permits WHERE item_id=?').get(itemId))fail('ITEM_TERMINAL_FENCED');return c;}
 // The integration must verify the decision and authoritative durable completion
 // in the SAME synchronous transaction using this connection, before issuing a
 // terminal permit. Asynchronous provider/model assertions are rejected.
 acquireTerminalPermit(runId,cap,itemId,{decisionDigest,completionDigest},verifyTerminal){return this.tx(()=>{const {run,item}=this.item(runId,cap,itemId);if(!digest(decisionDigest)||!digest(completionDigest)||typeof verifyTerminal!=='function')fail('TERMINAL_PROOF_REQUIRED');if(this.db.prepare("SELECT 1 FROM line_auto_readers WHERE item_id=? AND state='open'").get(itemId))fail('SOURCE_READERS_ACTIVE');if(this.db.prepare('SELECT 1 FROM line_auto_permits WHERE item_id=?').get(itemId))fail('TERMINAL_PERMIT_ALREADY_EXISTS');const verified=verifyTerminal({db:this.db,run,item,decisionDigest,completionDigest});if(verified!==true)fail('TERMINAL_COMPLETION_UNCONFIRMED');const id=crypto.randomUUID(),expiresAt=this.now()+120000;this.db.prepare("INSERT INTO line_auto_permits VALUES(?,?,?,?,?,?,?,'held')").run(id,itemId,runId,run.scope_digest,decisionDigest,completionDigest,expiresAt);this.db.prepare("UPDATE line_auto_items SET status='cleanup_held' WHERE id=?").run(itemId);return {permitId:id,itemId,ownerId:run.user_id,sourceId:run.parsedScope.sourceId,sha256:item.sha256,bytes:item.bytes,decisionDigest,exclusiveReaders:true,authorityRevisionFrozen:true,expiresAt};});}
 validateTerminalPermit(runId,cap,itemId,permitId,verifyTerminal){return this.tx(()=>{const {run,item}=this.item(runId,cap,itemId),p=this.db.prepare('SELECT * FROM line_auto_permits WHERE id=? AND item_id=? AND run_id=?').get(permitId,itemId,runId);if(!p||p.state!=='held'||item.status!=='cleanup_held'||p.expires_at<=this.now()||p.scope_digest!==run.scope_digest||typeof verifyTerminal!=='function')fail('CLEANUP_PERMIT_NOT_CURRENT');if(this.db.prepare("SELECT 1 FROM line_auto_readers WHERE item_id=? AND state='open'").get(itemId)||verifyTerminal({db:this.db,run,item,decisionDigest:p.decision_digest,completionDigest:p.completion_digest})!==true)fail('TERMINAL_COMPLETION_UNCONFIRMED');return {permitId:p.id,itemId,ownerId:run.user_id,sourceId:run.parsedScope.sourceId,sha256:item.sha256,bytes:item.bytes,decisionDigest:p.decision_digest,completionDigest:p.completion_digest,exclusiveReaders:true,authorityRevisionFrozen:true,expiresAt:p.expires_at,validatedAt:this.now()};});}
 closeTerminalPermit(runId,cap,itemId,permitId,{mediaAbsent,receiptRetained}){return this.tx(()=>{const run=this.authenticateRun(runId,cap),item=this.db.prepare('SELECT * FROM line_auto_items WHERE id=? AND run_id=? AND user_id=?').get(itemId,runId,run.user_id);if(!item)fail('ITEM_NOT_IN_RUN',404);const p=this.db.prepare('SELECT * FROM line_auto_permits WHERE id=? AND item_id=? AND run_id=?').get(permitId,itemId,runId);if(!p||p.expires_at<=this.now()||!['held','closed'].includes(p.state)||mediaAbsent!==true||receiptRetained!==true)fail('CLEANUP_ACK_UNCONFIRMED');this.db.prepare("UPDATE line_auto_permits SET state='closed' WHERE id=?").run(permitId);this.db.prepare("UPDATE line_auto_items SET status='cleaned' WHERE id=?").run(itemId);return {closed:true,permitId};});}
 cancelRun(user,runId){return this.tx(()=>{this.inbox.user(user);const r=this.db.prepare('SELECT * FROM line_auto_runs WHERE id=? AND user_id=?').get(runId,user);if(!r)fail('RUN_NOT_FOUND',404);this.db.prepare("UPDATE line_auto_runs SET state='cancelled' WHERE id=?").run(runId);return {cancelled:true};});}
 eraseUser(user){if(!this.enabled)return;this.tx(()=>{this.db.prepare('DELETE FROM line_auto_readers WHERE run_id IN (SELECT id FROM line_auto_runs WHERE user_id=?)').run(user);this.db.prepare('DELETE FROM line_auto_permits WHERE run_id IN (SELECT id FROM line_auto_runs WHERE user_id=?)').run(user);this.db.prepare('DELETE FROM line_auto_ingress WHERE user_id=?').run(user);for(const table of ['line_auto_items','line_auto_runs','line_auto_profiles','line_standing_grants'])this.db.prepare('DELETE FROM '+table+' WHERE user_id=?').run(user);});}
}
module.exports={RunAuthority};
