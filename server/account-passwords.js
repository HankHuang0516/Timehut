'use strict';
const crypto = require('node:crypto');
class PasswordChangeRejected extends Error {}
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const derive = (password, salt) => new Promise((resolve, reject) => {
 crypto.scrypt(password, salt, 32, {N:32768,r:8,p:1,maxmem:64*1024*1024}, (error, value) => error ? reject(error) : resolve(value));
});
function replacePassword(state, userId, salt, hash, now) {
 state.users[userId].salt=salt;state.users[userId].passwordHash=hash;
 for(const row of Object.values(state.rememberDevices||{}))if(row.userId===userId)require('./account-remember').revoke(state,row,now);
 for(const [id,row]of Object.entries(state.sessions))if(row.userId===userId)delete state.sessions[id];
 require('./account-email').revoke(state,userId);
}
async function changePassword(store, userId, token, currentPassword, newPassword) {
 store.assertAvailable();
 if(typeof currentPassword!=='string'||currentPassword.length>128||typeof newPassword!=='string'||newPassword.length<12||newPassword.length>128)throw new PasswordChangeRejected('Password change rejected');
 const original=store.state.users[userId];
 if(!original||original.disabled)throw new PasswordChangeRejected('Password change rejected');
 const previousSalt=original.salt,previousHash=original.passwordHash;
 const verified=await derive(currentPassword,previousSalt);
 if(!crypto.timingSafeEqual(verified,Buffer.from(previousHash,'hex')))throw new PasswordChangeRejected('Password change rejected');
 const salt=crypto.randomBytes(16).toString('hex'),hash=(await derive(newPassword,salt)).toString('hex');
 return store.commit(state=>{
  const user=state.users[userId],session=state.sessions[digest(token)];
  if(!user||user.disabled||user.salt!==previousSalt||user.passwordHash!==previousHash||!session||session.userId!==userId||session.expiresAt<=store.now())throw new PasswordChangeRejected('Password change rejected');
  replacePassword(state,userId,salt,hash,store.now());
  // Keep native admission proofs: their original cancellation remains idempotent.
  return {passwordChanged:true,signInRequired:true};
 });
}
module.exports={changePassword,PasswordChangeRejected,derive,replacePassword};
