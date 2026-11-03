'use strict';
// Hank1031: standing owner authorisation for the bounded reference-person runs.
//
// The owner grants once; a supervisor may then arm bounded runs on their
// behalf. The grant is bound to the exact setup digest that existed when the
// owner granted it, so any later change to the owner's reference photos,
// reference revision, consent version or album binding invalidates the grant
// and the supervisor must stop until the owner confirms again.
//
// Every run stays bounded (at most MAX_JOBS items and MAX_DURATION_MS of work)
// and auditable. A grant is revocable at any time and expires on its own.
const crypto=require('node:crypto');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const uid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const MAX_JOBS=4;
const MAX_DURATION_MS=1800000;
const MAX_LIFETIME_MS=30*24*3600*1000;

class StandingGrants{
 constructor(inbox,{authority=null,now=()=>inbox.now()}={}){
  this.inbox=inbox;this.db=inbox.db;this.now=now;this.authority=authority;
 }
 /** Create or replace the owner's standing grant for one source. Replacing
  * supersedes the previous grant so a revoked scope can never linger. */
 grant(user,input){
  if(!exact(input,['sourceType','sourceId','albumIds','setupDigest','maxJobs','durationMs','consent','lifetimeMs'])||input.consent!==true)fail('EXPLICIT_STANDING_GRANT_CONSENT_REQUIRED',400);
  if(!digest(input.setupDigest)||!Number.isSafeInteger(input.maxJobs)||input.maxJobs<1||input.maxJobs>MAX_JOBS)fail('STANDING_GRANT_BOUND_INVALID',400);
  if(!Number.isSafeInteger(input.durationMs)||input.durationMs<1000||input.durationMs>MAX_DURATION_MS)fail('STANDING_GRANT_BOUND_INVALID',400);
  if(!Number.isSafeInteger(input.lifetimeMs)||input.lifetimeMs<60000||input.lifetimeMs>MAX_LIFETIME_MS)fail('STANDING_GRANT_BOUND_INVALID',400);
  if(!Array.isArray(input.albumIds)||!input.albumIds.length)fail('STANDING_GRANT_BOUND_INVALID',400);
  const scope=this.scope(user,input);
  if(scope.setupDigest!==input.setupDigest)fail('SETUP_CHANGED');
  if(scope.ready!==true)fail('REFERENCE_OR_CLASSIFIER_NOT_READY');
  const now=this.now(),id=crypto.randomUUID(),expiresAt=now+input.lifetimeMs;
  return this.inbox.tx(()=>{
   this.db.prepare('DELETE FROM line_standing_grants WHERE user_id=? AND source_type=? AND source_id=?').run(user,scope.sourceType,scope.sourceId);
   this.db.prepare('INSERT INTO line_standing_grants VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,user,scope.sourceType,scope.sourceId,scope.source,input.setupDigest,input.maxJobs,input.durationMs,now,expiresAt,'active');
   return {grantId:id,ownerId:user,source:scope.source,setupDigest:input.setupDigest,maxJobs:input.maxJobs,durationMs:input.durationMs,expiresAt,state:'active'};
  });
 }
 scope(user,{sourceType,sourceId,albumIds}){
  if(!this.authority)fail('STANDING_GRANT_AUTHORITY_REQUIRED',503);
  return this.authority.sourceScope(user,{sourceType,sourceId,albumIds});
 }
 /** The grant table only exists while the authority is enabled. */
 ready(){return !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='line_standing_grants'").get();}
 list(user){
  const rows=this.db.prepare('SELECT * FROM line_standing_grants WHERE user_id=? ORDER BY created_at DESC').all(user);
  return rows.map(r=>({grantId:r.id,source:r.source,setupDigest:r.setup_digest,maxJobs:r.max_jobs,durationMs:r.duration_ms,createdAt:r.created_at,expiresAt:r.expires_at,state:r.state,current:this.resolve(user,r.id)!==null}));
 }
 revoke(user,grantId){
  if(!uid(grantId))fail('INVALID_GRANT',400);
  return this.inbox.tx(()=>{
   const row=this.db.prepare('SELECT * FROM line_standing_grants WHERE id=? AND user_id=?').get(grantId,user);
   if(!row)fail('GRANT_NOT_FOUND',404);
   this.db.prepare("UPDATE line_standing_grants SET state='revoked' WHERE id=?").run(grantId);
   return {grantId,revoked:true};
  });
 }
 /** Resolve a grant row. Returns null when the grant is revoked, expired or
  * missing. Scope binding is checked separately by matches(). */
 resolve(user,grantId){
  if(!uid(grantId))return null;
  const row=this.db.prepare('SELECT * FROM line_standing_grants WHERE id=? AND user_id=?').get(grantId,user);
  if(!row||row.state!=='active'||row.expires_at<=this.now())return null;
  return row;
 }
 /** True when the grant still matches the live setup. The supervisor must stop
  * and ask the owner to confirm again whenever this is false. */
 matches(user,grantId,current){
  const row=this.resolve(user,grantId);
  if(!row||!current)return false;
  return row.setup_digest===current.setupDigest&&row.source===current.source;
 }
 eraseUser(user){
  this.db.prepare('DELETE FROM line_standing_grants WHERE user_id=?').run(user);
 }
}
module.exports={StandingGrants,MAX_JOBS,MAX_DURATION_MS,MAX_LIFETIME_MS};
