'use strict';
// Existing server operator only. No HTTP route registers QA/release proofs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {SQLiteAccountStore}=require('./account-sqlite-store'),{AccountFeedback,validReleaseURL}=require('./account-feedback');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function readReceipt(file){assert(path.isAbsolute(file)&&fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink()&&fs.statSync(file).size<1024*1024);return JSON.parse(fs.readFileSync(file));}
function verifyReportQA(qa,fact,report){
 const matches=qa.verifications.filter(v=>v.feedbackId===report.id);
 assert(matches.length===1&&matches[0].passed===true&&matches[0].artifactSHA256===fact.sha256&&typeof matches[0].evidenceRef==='string'&&matches[0].evidenceRef&&matches[0].platform===report.platform&&matches[0].channel===report.channel);return true;
}
async function verifyPublication(fact,receipt){
 assert(receipt.publiclyDownloadedAndVerified===true&&receipt.url===fact.url&&receipt.sha256===fact.sha256&&receipt.version===fact.version&&receipt.versionCode===fact.versionCode&&receipt.platform===fact.platform&&receipt.channel===fact.channel);
 const u=new URL(fact.url);
 if(fact.channel==='android-private-test'){
  assert.equal(fact.kind,'app-update');const match=/\/android-test-([0-9.]+)-(\d+)\/HuangJiaXiaoWu-([0-9.]+)-test(\d+)\.apk$/.exec(u.pathname);assert(match&&match[1]===match[3]&&Number(match[2])===fact.versionCode&&match[2]===match[4]&&fact.version===match[1]+'-test.'+match[2]);
  assert(receipt.apkInspection?.applicationId==='tw.aihankapps.timehut.testing'&&receipt.apkInspection.versionCode===fact.versionCode&&receipt.apkInspection.versionName===fact.version&&receipt.apkInspection.debuggable===false&&/^[a-f0-9]{64}$/.test(receipt.apkInspection.signerSHA256));
  const response=await fetch('https://api.github.com/repos/HankHuang0516/Timehut/releases/tags/android-test-'+match[1]+'-'+match[2],{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});assert(response.ok);const release=await response.json();assert(release.draft===false);const asset=release.assets.find(a=>a.browser_download_url===fact.url);assert(asset&&asset.state==='uploaded'&&asset.size===receipt.bytes&&asset.digest==='sha256:'+fact.sha256);
 }else if(fact.channel==='web'){
  assert(['web-refresh','service-fix'].includes(fact.kind));assert(receipt.backendVersion===fact.version);const response=await fetch(u.origin+'/api/version',{signal:AbortSignal.timeout(20000)});assert(response.ok);const value=await response.json();assert(value.version===fact.version&&value.build===receipt.backendBuild);
 }else throw Error('Store-channel availability adapter requires actual approved store release receipt');
 const response=await fetch(fact.url,{redirect:'follow',signal:AbortSignal.timeout(60000)});assert(response.ok&&new URL(response.url).protocol==='https:');const hasher=crypto.createHash('sha256');let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;assert(bytes<=100*1024*1024);hasher.update(chunk);}assert.equal(bytes,receipt.bytes);assert.equal(hasher.digest('hex'),fact.sha256);
}
if(require.main===module)(async()=>{
 const [directory,proofPath]=process.argv.slice(2);assert(directory&&path.isAbsolute(directory)&&proofPath&&path.isAbsolute(proofPath));
 const proof=readReceipt(proofPath),fact=proof.fact;assert(validReleaseURL(fact)&&Array.isArray(fact.fixes)&&fact.fixes.length>0);
 const qa=readReceipt(proof.qaReceiptPath),publication=readReceipt(proof.publicationReceiptPath);assert(qa.status==='PASS_EXACT_REPORT_FIXES'&&qa.artifactSHA256===fact.sha256&&qa.version===fact.version&&qa.versionCode===fact.versionCode&&qa.platform===fact.platform&&qa.channel===fact.channel&&Array.isArray(qa.verifications));
 assert(fact.fixes.every(id=>qa.verifications.some(row=>row.feedbackId===id&&row.passed===true&&row.artifactSHA256===fact.sha256&&typeof row.evidenceRef==='string'&&row.evidenceRef)));
 await verifyPublication(fact,publication);
 const store=new SQLiteAccountStore(path.join(directory,'.accounts'));
 try{const service=new AccountFeedback(store,directory);for(const id of fact.fixes){const r=store.state.feedback?.[id];assert(r?.stage==='open');if(fact.kind==='app-update')assert(r.platform===fact.platform&&r.channel===fact.channel&&r.versionCode<fact.versionCode);verifyReportQA(qa,fact,r);}
 const key=service.registerRelease({...fact,evidenceRef:proof.qaReceiptPath});let created=0;for(const id of fact.fixes)if(service.resolve(id,key).notificationCreated)created++;console.log(JSON.stringify({status:'RECORDED_VERIFIED_AVAILABLE_FIX',releaseKey:key,reports:fact.fixes.length,notificationsCreated:created,channel:'in-app',externalMessagesSent:0}));}finally{store.close();}
})().catch(()=>{console.error('Fix notification not confirmed; preserve proof and inspect privately.');process.exitCode=1;});

module.exports={verifyReportQA,verifyPublication};
