import crypto from 'node:crypto';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(x,k));
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const ints=x=>Number.isSafeInteger(x)&&x>=0;
function stopped(reason){return Object.freeze({action:'hold',reason,albumIds:[],automaticUploadAllowed:false});}
/** Pure authorization/relevance gate. It performs no image identification.
 * Context/policies come from authenticated current server state, not the VLM.
 * verifyReceipt must independently authenticate a classifier's persisted result;
 * boolean confidence/verified fields supplied by the model cannot authorize it.
 */
export async function decideAutomaticImport({job,policies,analysis,receipt,verifyReceipt=async()=>false,now=Date.now}={}){
 if(!job||!uuid(job.itemId)||!id(job.ownerId)||!['user','group'].includes(job.sourceType)||!(job.sourceType==='user'?/^U[a-f0-9]{32}$/:/^C[a-f0-9]{32}$/).test(job.sourceId)||!digest(job.sha256)||!Number.isSafeInteger(job.bytes)||job.bytes<=0||!ints(job.bindingRevision)||!ints(job.createdAt)||!Array.isArray(job.allowedAlbumIds)||!job.allowedAlbumIds.length||job.allowedAlbumIds.some(x=>!id(x))||new Set(job.allowedAlbumIds).size!==job.allowedAlbumIds.length)return stopped('source_unconfirmed');
 if(job.revoked!==false||job.status!=='downloaded')return stopped('source_not_current');
 if(!analysis||analysis.status!=='completed'||analysis.itemId!==job.itemId||analysis.sha256!==job.sha256||!digest(analysis.resultDigest)||analysis.identityInference===true)return stopped('content_analysis_unconfirmed');
 if(!Array.isArray(policies)||policies.some(p=>!p||p.ownerId!==job.ownerId||!id(p.albumId))||new Set(policies.map(p=>p.albumId)).size!==policies.length)return stopped('policy_unconfirmed');
 const current=new Map(policies.map(p=>[p.albumId,p]));
 const active=job.allowedAlbumIds.filter(album=>{const p=current.get(album);return p&&p.enabled===true&&p.consent===true&&ints(p.consentAt)&&p.consentAt<=job.createdAt&&ints(p.policyRevision)&&ints(p.referenceRevision)&&digest(p.referenceDigest)&&p.referencesConfirmed===true&&p.validationStatus==='validated'&&typeof p.validatorId==='string'&&p.validatorId.length>0;});
 if(!active.length)return stopped('no_validated_opt_in_policy');
 if(!exact(receipt,['schema','kind','itemId','ownerId','sourceId','sha256','analysisDigest','bindingRevision','createdAt','expiresAt','receiptId','validatorId','verdicts'])||receipt.schema!==1||receipt.kind!=='album-relevance-v1'||receipt.itemId!==job.itemId||receipt.ownerId!==job.ownerId||receipt.sourceId!==job.sourceId||receipt.sha256!==job.sha256||receipt.analysisDigest!==analysis.resultDigest||receipt.bindingRevision!==job.bindingRevision||!ints(receipt.createdAt)||receipt.createdAt<job.createdAt||!ints(receipt.expiresAt)||receipt.expiresAt<=now()||receipt.expiresAt<=receipt.createdAt||!uuid(receipt.receiptId)||typeof receipt.validatorId!=='string'||!Array.isArray(receipt.verdicts)||!receipt.verdicts.length||receipt.verdicts.length>100)return stopped('relevance_receipt_unconfirmed');
 const seen=new Set();
 for(const v of receipt.verdicts){if(!exact(v,['albumId','policyRevision','referenceRevision','referenceDigest','verdict'])||!job.allowedAlbumIds.includes(v.albumId)||seen.has(v.albumId)||!['related','unrelated','uncertain'].includes(v.verdict))return stopped('invalid_or_foreign_destination');seen.add(v.albumId);const p=current.get(v.albumId);if(!p||v.policyRevision!==p.policyRevision||v.referenceRevision!==p.referenceRevision||v.referenceDigest!==p.referenceDigest||receipt.validatorId!==p.validatorId)return stopped('stale_reference_or_policy');}
 // Missing album decisions are uncertainty, never implicit matches.
 let verified=false;try{verified=await verifyReceipt({receipt,job,analysis,policies});}catch{}if(verified!==true)return stopped('classifier_proof_not_verified');
 const allPolicySnapshots=job.allowedAlbumIds.map(album=>{const p=current.get(album);return {albumId:album,enabled:p?.enabled===true,consent:p?.consent===true,consentAt:p?.consentAt??null,policyRevision:p?.policyRevision??null,referenceRevision:p?.referenceRevision??null,referenceDigest:p?.referenceDigest??null,referencesConfirmed:p?.referencesConfirmed===true,validationStatus:p?.validationStatus??null,validatorId:p?.validatorId??null};}).sort((a,b)=>a.albumId.localeCompare(b.albumId));
 const baseSeal={itemId:job.itemId,ownerId:job.ownerId,sourceId:job.sourceId,sha256:job.sha256,bytes:job.bytes,bindingRevision:job.bindingRevision,analysisDigest:analysis.resultDigest,receiptId:receipt.receiptId,allowedAlbumIds:[...job.allowedAlbumIds].sort(),allPolicySnapshots};
 const targets=receipt.verdicts.filter(v=>v.verdict==='related'&&active.includes(v.albumId)).map(v=>v.albumId).sort();
 if(!targets.length){const allUnrelated=active.length===job.allowedAlbumIds.length&&active.every(album=>receipt.verdicts.some(v=>v.albumId===album&&v.verdict==='unrelated'));return Object.freeze({action:allUnrelated?'skip':'hold',reason:allUnrelated?'verified_unrelated':'uncertain',albumIds:[],automaticUploadAllowed:false,decisionDigest:hash(baseSeal),seal:baseSeal});}
 const snapshots=targets.map(album=>{const p=current.get(album);return {albumId:album,policyRevision:p.policyRevision,referenceRevision:p.referenceRevision,referenceDigest:p.referenceDigest};});
 const seal={...baseSeal,snapshots};
 const decisionDigest=hash(seal),hex=crypto.createHash('sha256').update('line-autonomous:'+decisionDigest).digest('hex');
 const requestId=hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
 return Object.freeze({action:'import',reason:'verified_relevant_and_authorized',albumIds:targets,automaticUploadAllowed:true,decisionDigest,seal,apiRequest:{requestId,itemIds:[job.itemId],albumIds:targets,people:[],confirmed:true}});
}
// Call again against fresh authority immediately before the import API. Reusing
// a previously allowed destination after reference/consent changes is forbidden.
export async function revalidateAutomaticDecision(previous,current){const next=await decideAutomaticImport(current);if(!['import','skip'].includes(previous?.action)||next.action!==previous.action||next.decisionDigest!==previous.decisionDigest)throw Error('AUTOMATIC_DECISION_AUTHORITY_CHANGED');return next;}
export async function revalidateAutomaticImport(previous,current){if(previous?.action!=='import')throw Error('AUTOMATIC_IMPORT_AUTHORITY_CHANGED');try{return await revalidateAutomaticDecision(previous,current);}catch{throw Error('AUTOMATIC_IMPORT_AUTHORITY_CHANGED');}}
