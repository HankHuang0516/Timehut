'use strict';
// A pre-persisted native cancellation proof can revoke an issued login even
// when its bearer response never reached the phone. Never store the raw proof.
const crypto=require('node:crypto');
const MAXIMUM=4096,RETENTION=32*86400000;
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
class NativeLoginError extends Error {
 constructor(status){super('Native login request unavailable');this.status=status;}
}
function identity(id,secret){
 if(typeof id!=='string'||!/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.test(id)||typeof secret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(secret)||Buffer.from(secret,'base64url').toString('base64url')!==secret)throw new NativeLoginError(400);
 return {id,secretHash:digest(secret)};
}
function same(row,key){return row&&crypto.timingSafeEqual(Buffer.from(row.secretHash,'hex'),Buffer.from(key.secretHash,'hex'));}
function prepare(state,now){
 state.nativeLogins??={};
 for(const [id,row]of Object.entries(state.nativeLogins))if(row.expiresAt<=now){
  const session=row.tokenHash&&state.sessions[row.tokenHash];
  if(session){if(session.userId!==row.userId||session.expiresAt>now)throw new NativeLoginError(503);delete state.sessions[row.tokenHash];}
  delete state.nativeLogins[id];
 }
}
function fresh(key,now){return {secretHash:key.secretHash,status:'pending',createdAt:now,expiresAt:now+RETENTION};}
function begin(store,id,secret){
 const key=identity(id,secret);store.assertAvailable();
 store.commit(state=>{
  prepare(state,store.now());
  // All repeats require cancellation/reconciliation; never issue a second token.
  if(Object.hasOwn(state.nativeLogins,id))throw new NativeLoginError(409);
  if(Object.keys(state.nativeLogins).length>=MAXIMUM)throw new NativeLoginError(503);
  state.nativeLogins[id]=fresh(key,store.now());
 });return key;
}
function issued(state,key,userId,tokenHash,expiresAt,now){
 const row=state.nativeLogins?.[key.id];
 if(!same(row,key)||row.status!=='pending'||row.expiresAt<=now)throw new NativeLoginError(409);
 row.status='issued';row.userId=userId;row.tokenHash=tokenHash;
 // A delayed password check cannot outlive the session's cancellation proof.
 row.expiresAt=Math.max(row.expiresAt,expiresAt+2*86400000);
}
function cancel(store,id,secret){
 const key=identity(id,secret);store.assertAvailable();
 return store.commit(state=>{
  prepare(state,store.now());let row=state.nativeLogins[id];
  if(row&&!same(row,key))throw new NativeLoginError(409);
  if(!row){
   // Cancellation may arrive before the original POST. Persist a tombstone so
   // that a late POST cannot create a session after a successful acknowledgment.
   if(Object.keys(state.nativeLogins).length>=MAXIMUM)throw new NativeLoginError(503);
   row=state.nativeLogins[id]=fresh(key,store.now());
  }
  if(row.tokenHash){
   const session=state.sessions[row.tokenHash];
   if(session&&session.userId!==row.userId)throw new NativeLoginError(503);
   delete state.sessions[row.tokenHash];
  }
  row.status='cancelled';
  return {ok:true,protocol:1,attemptId:id,cancelled:true};
 });
}
function validate(rows,state){
 if(!rows||typeof rows!=='object'||Array.isArray(rows)||Object.keys(rows).length>MAXIMUM)return false;
 const tokenHashes=new Set();
 for(const [id,row]of Object.entries(rows)){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)||!row||typeof row!=='object'||Array.isArray(row)||!['pending','issued','cancelled'].includes(row.status)||!/^[a-f0-9]{64}$/.test(row.secretHash)||!Number.isSafeInteger(row.createdAt)||row.createdAt<0||!Number.isSafeInteger(row.expiresAt)||row.expiresAt<=row.createdAt)return false;
  if(Object.keys(row).some(key=>!['secretHash','status','createdAt','expiresAt','userId','tokenHash'].includes(key)))return false;
  if(row.userId!==undefined||row.tokenHash!==undefined){
   if(row.status==='pending'||typeof row.userId!=='string'||!Object.hasOwn(state.users,row.userId)||!/^[a-f0-9]{64}$/.test(row.tokenHash))return false;
   if(tokenHashes.has(row.tokenHash))return false;tokenHashes.add(row.tokenHash);
   const session=state.sessions[row.tokenHash];
   if(session&&(session.userId!==row.userId||row.status!=='issued'||row.expiresAt<session.expiresAt+2*86400000))return false;
  }else if(row.status==='issued')return false;
 }
 return true;
}
module.exports={begin,issued,cancel,validate,NativeLoginError,MAXIMUM,RETENTION};
