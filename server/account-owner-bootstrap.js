'use strict';
// Operator-only initialization. No HTTP route calls reserve/provision.
const crypto=require('node:crypto');
const canonicalName=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(value.trim().toLowerCase())?value.trim().toLowerCase():null;
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const calendar=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function childrenInput(value){
 if(!Array.isArray(value)||value.length<1||value.length>1000)throw new Error('Private household input unavailable');
 const ids=new Set();
 return value.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['name','birthDate','albumId'].includes(key))||typeof row.name!=='string'||!row.name.trim()||row.name.length>80||!calendar(row.birthDate)||typeof row.albumId!=='string'||!/^\d{1,32}$/.test(row.albumId)||ids.has(row.albumId))throw new Error('Private household input unavailable');
  ids.add(row.albumId);return {name:row.name,birthDate:row.birthDate,albumId:row.albumId};
 });
}
function validateLegacyHousehold(state){
 const row=state.legacyHousehold;
 const imported=Object.values(state.albums).filter(album=>Object.hasOwn(album,'legacyProviderAlbum'));
 if(row===undefined){if(imported.length)throw new Error('Unbound provider album');return;}
 if(!row||typeof row!=='object'||Array.isArray(row)||row.version!==1||!uuid(row.bindingId)||canonicalName(row.username)!==row.username||!Number.isSafeInteger(row.reservedAt)||row.reservedAt<0||!['reserved','ready'].includes(row.status))throw new Error('Invalid household binding');
 const normalized=childrenInput(row.children);if(JSON.stringify(normalized)!==JSON.stringify(row.children))throw new Error('Invalid household context');
 const users=Object.values(state.users).filter(user=>user.username===row.username);
 if(row.status==='reserved'){
  if(row.ownerUserId!==null||users.length||imported.length)throw new Error('Reserved owner identity already occupied');
 }else{
  const owner=state.users[row.ownerUserId];
  if(!uuid(row.ownerUserId)||!owner||owner.disabled||owner.username!==row.username||users.length!==1||users[0].id!==owner.id)throw new Error('Household owner unavailable');
  if(imported.length!==row.children.length||row.children.some(child=>{const album=state.albums[child.albumId];return !album||album.legacyProviderAlbum!==true||album.userId!==row.ownerUserId||album.title!==child.name||album.birthDate!==child.birthDate;}))throw new Error('Household albums unavailable');
 }
}
function status(store){
 store.assertAvailable();const row=store.state.legacyHousehold;if(!row)return {status:'not_initialized'};
 return {status:row.status,bindingId:row.bindingId,username:row.username,ownerUserId:row.ownerUserId,childrenCount:row.children.length};
}
function reserve(store,name,children){
 const normalized=canonicalName(name),privateChildren=childrenInput(children);if(!normalized)throw new Error('Invalid designated owner name');
 return store.commit(state=>{
  const old=state.legacyHousehold;
  if(old){if(old.username!==normalized||JSON.stringify(old.children)!==JSON.stringify(privateChildren))throw new Error('Existing household reservation preserved');return {status:old.status,bindingId:old.bindingId,username:old.username,ownerUserId:old.ownerUserId,childrenCount:old.children.length};}
  if(Object.values(state.users).some(user=>user.username===normalized))throw new Error('Designated name already exists; no existing registrant was adopted');
  const row={version:1,bindingId:crypto.randomUUID(),username:normalized,status:'reserved',reservedAt:store.now(),ownerUserId:null,children:privateChildren};state.legacyHousehold=row;
  return {status:row.status,bindingId:row.bindingId,username:row.username,ownerUserId:null,childrenCount:row.children.length};
 });
}
async function provision(store,{username,bindingId,password,displayName}){
 const normalized=canonicalName(username);
 if(!normalized||!uuid(bindingId)||typeof password!=='string'||password.length<12||password.length>128||typeof displayName!=='string'||!displayName.trim()||displayName.length>80)throw new Error('Invalid owner provisioning input');
 const before=store.state.legacyHousehold;
 if(!before||before.status!=='reserved'||before.username!==normalized||before.bindingId!==bindingId)throw new Error('Owner reservation must be confirmed; existing owner/password preserved');
 const salt=crypto.randomBytes(16).toString('hex');
 const hash=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,bytes)=>error?reject(error):resolve(bytes.toString('hex'))));
 return store.commit(state=>{
  const row=state.legacyHousehold;
  if(!row||row.status!=='reserved'||row.username!==normalized||row.bindingId!==bindingId||Object.values(state.users).some(user=>user.username===normalized))throw new Error('Owner reservation changed; no existing identity was adopted');
  if(row.children.some(child=>Object.hasOwn(state.albums,child.albumId)))throw new Error('Existing album identity preserved');
  const id=crypto.randomUUID();
  for(const child of row.children)state.albums[child.albumId]={id:child.albumId,userId:id,title:child.name,birthDate:child.birthDate,createdAt:store.now(),legacyProviderAlbum:true};
  state.users[id]={id,username:normalized,displayName:displayName.trim(),salt,passwordHash:hash,createdAt:store.now(),disabled:false};row.status='ready';row.ownerUserId=id;
  return {status:'ready',bindingId:row.bindingId,username:row.username,ownerUserId:id,childrenCount:row.children.length};
 });
}
function requireOwner(store,expectedId){
 store.assertAvailable();const state=store.state;validateLegacyHousehold(state);const row=state.legacyHousehold;
 if(!row||row.status!=='ready'||expectedId&&expectedId!==row.ownerUserId)throw new Error('Trusted household owner initialization required');
 return row.ownerUserId;
}
function familyContext(store,userId){
 const owner=requireOwner(store);if(userId!==owner)throw new Error('Private household unavailable');return structuredClone(store.state.legacyHousehold.children);
}
function legacyAlbumTarget(store,userId,albumId){
 store.assertAvailable();validateLegacyHousehold(store.state);const row=store.state.legacyHousehold;
 return row?.status==='ready'&&row.ownerUserId===userId&&row.children.some(child=>child.albumId===albumId)?albumId:null;
}
module.exports={legacyAlbumTarget,reserve,provision,status,requireOwner,familyContext,validateLegacyHousehold};
