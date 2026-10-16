'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Narrow media capabilities are bound to the current server session and owner.
// They cannot authenticate account/admin/mutation routes and expire in10 minutes.
function mediaTickets(store,{legacyPhotoOwner=null}={}){
 const file=path.join(store.directory,'media-signing.key');let key;
 if(fs.existsSync(file)){key=fs.readFileSync(file);if(key.length!==32)throw new Error('Media key unavailable; original preserved');}
 else {const fd=fs.openSync(file,'wx',0o600);try{key=crypto.randomBytes(32);fs.writeFileSync(fd,key);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 const hash=token=>crypto.createHash('sha256').update(token).digest('hex'),mac=body=>crypto.createHmac('sha256',key).update(body).digest('base64url');
 const owns=(userId,kind,id)=>store.owns(userId,kind,id)||(kind==='photo'&&legacyPhotoOwner?.(userId,id)===true);
 const permitted=(kind,variant)=>kind==='photo'?['sq','t','s','m','l','o','original','playback'].includes(variant):kind==='receipt'&&variant==='original';
 function mint(token,kind,id,variant){const actor=store.principal(token);if(!actor||!permitted(kind,variant)||!owns(actor.id,kind,id))throw new Error('Media unavailable');const session=store.state.sessions[hash(token)],body=Buffer.from(JSON.stringify({session:hash(token),kind,id,variant,until:Math.min(store.now()+600000,session.expiresAt)})).toString('base64url');return body+'.'+mac(body);}
 function verify(ticket,kind,id,variant){try{if(store.error||typeof ticket!=='string'||ticket.length>1500||!permitted(kind,variant))return null;const [body,signature,...extra]=ticket.split('.');if(extra.length||!body||!signature)return null;const expected=Buffer.from(mac(body)),actual=Buffer.from(signature);if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;const row=JSON.parse(Buffer.from(body,'base64url').toString()),session=store.state.sessions[row.session],user=session&&store.state.users[session.userId];if(row.kind!==kind||row.id!==id||row.variant!==variant||!Number.isSafeInteger(row.until)||row.until<=store.now()||row.until>store.now()+600000||!session||!Number.isSafeInteger(session.expiresAt)||session.expiresAt<=store.now()||!user||user.disabled||!owns(user.id,kind,id))return null;return {id:user.id,username:user.username,displayName:user.displayName};}catch(_){return null;}}
 return {mint,verify};
}
module.exports={mediaTickets};
