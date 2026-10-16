'use strict';
// First-party, optional remembered device. Only credential digests are persisted.
const crypto=require('node:crypto');
const DAY=86400000,ACCESS=DAY,IDLE=90*DAY,ABSOLUTE=365*DAY,RETRY=IDLE,MAX_ROTATIONS=367,MAX_USER_DEVICES=5,MAX_GLOBAL_DEVICES=128;
const SHA=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,TOKEN=/^[A-Za-z0-9_-]{43}$/;
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const derive=(token,purpose,id)=>crypto.createHmac('sha256',token).update('timehut-remember-v1:'+purpose+':'+id).digest('base64url');
const validTime=n=>Number.isSafeInteger(n)&&n>=0;
function validate(s){
 if(s.rememberDevices===undefined)return true;
 if(!s.rememberDevices||typeof s.rememberDevices!=='object'||Array.isArray(s.rememberDevices))return false;
 for(const [id,r]of Object.entries(s.rememberDevices)){
  if(!UUID.test(id)||!r||r.id!==id||!s.users[r.userId]||!SHA.test(r.currentHash)||![r.createdAt,r.lastUsedAt,r.idleExpiresAt,r.absoluteExpiresAt].every(validTime)||r.absoluteExpiresAt!==r.createdAt+ABSOLUTE||r.idleExpiresAt>r.absoluteExpiresAt||r.lastUsedAt<r.createdAt||r.idleExpiresAt<r.lastUsedAt||!r.used||typeof r.used!=='object'||Array.isArray(r.used)||(r.revokedAt!==undefined&&!validTime(r.revokedAt)))return false;
  if(r.lastRotation!==undefined&&(!UUID.test(r.lastRotation.id)||![r.lastRotation.at,r.lastRotation.accessExpiresAt].every(validTime)||r.lastRotation.accessExpiresAt>r.lastRotation.at+ACCESS))return false;
  if(Object.keys(r.used).length>MAX_ROTATIONS)return false;
  for(const [hash,old]of Object.entries(r.used))if(!SHA.test(hash)||old!==null&&(!old||!UUID.test(old.rotationId)||!SHA.test(old.nextHash)||!validTime(old.at)))return false;
 }
 for(const r of Object.values(s.sessions))if(r.rememberDeviceId!==undefined&&(!s.rememberDevices[r.rememberDeviceId]||s.rememberDevices[r.rememberDeviceId].userId!==r.userId))return false;
 if(Object.keys(s.rememberDevices).length>MAX_GLOBAL_DEVICES||reservedBytes(s)>4*1024*1024)return false;const counts={};for(const r of Object.values(s.rememberDevices))if((counts[r.userId]=(counts[r.userId]||0)+1)>MAX_USER_DEVICES)return false;
 return true;
}
function reservedBytes(s){let bytes=2;for(const r of Object.values(s.rememberDevices||{}))bytes+=Buffer.byteLength(JSON.stringify(r))+(MAX_ROTATIONS-Object.keys(r.used).length)*73+1024;return bytes;}
function projectedBytes(s){return Buffer.byteLength(JSON.stringify(s))-Buffer.byteLength(JSON.stringify(s.rememberDevices||{}))+reservedBytes(s)-Buffer.byteLength(JSON.stringify(s.feedback||{}))+require('./account-feedback').reservedFeedbackBytes(s.feedback);}
function capacityError(){const error=Error('Remembered device capacity temporarily unavailable');error.capacity=true;return error;}
function assertBudget(s,userId){const rows=Object.values(s.rememberDevices||{}),own=rows.filter(r=>r.userId===userId);if(rows.length>MAX_GLOBAL_DEVICES||own.length>MAX_USER_DEVICES||reservedBytes({rememberDevices:Object.fromEntries(own.map(r=>[r.id,r]))})>192*1024||reservedBytes(s)>4*1024*1024||projectedBytes(s)>12*1024*1024)throw capacityError();}
function cleanup(s,now){for(const [id,r]of Object.entries(s.rememberDevices||{}))if(r.revokedAt!==undefined||now>=r.idleExpiresAt||now>=r.absoluteExpiresAt){for(const [hash,row]of Object.entries(s.sessions))if(row.rememberDeviceId===id)delete s.sessions[hash];delete s.rememberDevices[id];}}
function family(s,token){if(typeof token!=='string'||!TOKEN.test(token))return null;const h=digest(token);return Object.values(s.rememberDevices||{}).find(r=>r.currentHash===h||Object.hasOwn(r.used,h))||null;}
function revoke(s,r,now){if(!r)return; r.revokedAt??=now;for(const [hash,row]of Object.entries(s.sessions))if(row.rememberDeviceId===r.id)delete s.sessions[hash];}
function revokeToken(s,token,now,owner=null){const r=family(s,token);if(r&&(!owner||r.userId===owner))revoke(s,r,now);return r;}
function issue(s,userId,oldAccessToken,now){
 cleanup(s,now);s.rememberDevices??={};const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url'),nonce=crypto.randomUUID(),accessExpiresAt=now+ACCESS,accessToken=derive(token,'access',nonce);
 const row={id,userId,currentHash:digest(token),createdAt:now,lastUsedAt:now,idleExpiresAt:now+IDLE,absoluteExpiresAt:now+ABSOLUTE,used:{},lastRotation:{id:nonce,at:now,accessExpiresAt}};
 delete s.sessions[digest(oldAccessToken)];s.rememberDevices[id]=row;s.sessions[digest(accessToken)]={userId,expiresAt:accessExpiresAt,rememberDeviceId:id};assertBudget(s,userId);
 return {token,accessToken,expiresAt:row.idleExpiresAt,absoluteExpiresAt:row.absoluteExpiresAt};
}
function refresh(store,token,rotationId,expectedOwner=null){
 if(!TOKEN.test(token||'')||!UUID.test(rotationId||''))return null;
 const result=store.commit(s=>{
  const now=store.now();cleanup(s,now);const r=family(s,token);if(!r||r.revokedAt!==undefined)return null;
  if(expectedOwner&&expectedOwner!==r.userId)return {accountChanged:true};
  const user=s.users[r.userId];if(!user||user.disabled||now>=r.idleExpiresAt||now>=r.absoluteExpiresAt){revoke(s,r,now);return null;}
  const presented=digest(token),spent=Object.hasOwn(r.used,presented),old=r.used[presented];let next=token,accessNonce=rotationId;
  if(spent){
   next=derive(token,'rotate',rotationId);
   if(!old||old.rotationId!==rotationId||old.at+RETRY<=now||old.nextHash!==r.currentHash||digest(next)!==r.currentHash||r.lastRotation?.id!==rotationId){revoke(s,r,now);return null;}
  }else if(r.currentHash!==presented)return null;
  else if(r.lastRotation?.id===rotationId){if(r.lastRotation.at+RETRY<=now){revoke(s,r,now);return null;}}
  else if(r.lastRotation&&(r.lastRotation.accessExpiresAt===r.absoluteExpiresAt||r.lastRotation.accessExpiresAt>now+60000)){accessNonce=r.lastRotation.id;}
  else{
   if(Object.keys(r.used).length>=MAX_ROTATIONS)throw capacityError();for(const hash of Object.keys(r.used))r.used[hash]=null;
   next=derive(token,'rotate',rotationId);r.used[presented]={rotationId,nextHash:digest(next),at:now};r.currentHash=digest(next);r.lastUsedAt=now;r.idleExpiresAt=Math.min(now+IDLE,r.absoluteExpiresAt);r.lastRotation={id:rotationId,at:now,accessExpiresAt:Math.min(now+ACCESS,r.absoluteExpiresAt,r.idleExpiresAt)};
  }
  const accessToken=derive(next,'access',accessNonce),expiresAt=r.lastRotation.accessExpiresAt;
  // A lost acknowledgement may be retried after its access token expired.
  // Return the same device token/old expiry; client performs one new rotation.

  // Retry reissues identical credentials and expiry. Unknown response never rotates twice.
  for(const [hash,row]of Object.entries(s.sessions))if(row.rememberDeviceId===r.id&&row.expiresAt<=now)delete s.sessions[hash];
  s.sessions[digest(accessToken)]={userId:r.userId,expiresAt,rememberDeviceId:r.id};assertBudget(s,r.userId);
  return {token:accessToken,expiresAt,remember:{token:next,expiresAt:r.idleExpiresAt,absoluteExpiresAt:r.absoluteExpiresAt},user:{id:user.id,username:user.username,displayName:user.displayName}};
 });return result;
}
function logout(store,accessToken,rememberToken,expectedOwner){
 return store.commit(s=>{const r=family(s,rememberToken),session=accessToken&&s.sessions[digest(accessToken)];
  const owners=new Set([r?.userId,session?.userId].filter(Boolean));if(owners.size>1||owners.size===1&&!owners.has(expectedOwner))return {accountChanged:true};
  if(r)revoke(s,r,store.now());if(session){if(session.rememberDeviceId)revoke(s,s.rememberDevices?.[session.rememberDeviceId],store.now());delete s.sessions[digest(accessToken)];}
  return {ok:true};
 });
}
module.exports={validate,issue,refresh,logout,revokeToken,revoke,family,ACCESS,IDLE,ABSOLUTE,RETRY,reservedBytes,projectedBytes,MAX_USER_DEVICES,MAX_GLOBAL_DEVICES};
