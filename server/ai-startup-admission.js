'use strict';
// The old process fence cannot protect a newly started server. Keep AI claims
// closed until the deployment operator verifies durable data and writes this
// deployment/source-bound, private receipt. There is no HTTP activation route.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function aiStartupAdmission({accountsDirectory,fenceId,deploymentId,sourceFile}={}){
 const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
 if(!path.isAbsolute(accountsDirectory||'')||!path.isAbsolute(sourceFile||'')||!uuid(fenceId)||!uuid(deploymentId))throw Error('AI startup admission unavailable');
 const privateDirectory=p=>{const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw Error('AI admission directory unavailable');};
 privateDirectory(accountsDirectory);const directory=path.join(accountsDirectory,'release-admission');
 try{fs.mkdirSync(directory,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}privateDirectory(directory);
 const source=fs.lstatSync(sourceFile);if(!source.isFile()||source.isSymbolicLink())throw Error('AI admission source unavailable');
 const expected=Object.freeze({schema:1,fenceId,deploymentId,sourceSHA256:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex')}),receiptPath=path.join(directory,'ai-claims.'+deploymentId+'.json');
 function allowed(){let fd;try{
  privateDirectory(accountsDirectory);privateDirectory(directory);
  fd=fs.openSync(receiptPath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const s=fs.fstatSync(fd);
  if(!s.isFile()||(s.mode&0o077)||s.size<1||s.size>1024||s.nlink!==1)return false;
  const bytes=Buffer.alloc(1025),length=fs.readSync(fd,bytes,0,bytes.length,0);if(length!==s.size||length>1024)return false;
  const value=JSON.parse(bytes.subarray(0,length).toString('utf8'));
  if(!value||Array.isArray(value)||JSON.stringify(Object.keys(value).sort())!==JSON.stringify(Object.keys(expected).sort()))return false;
  return Object.entries(expected).every(([key,v])=>value[key]===v);
 }catch(_){return false;}finally{if(fd!==undefined)fs.closeSync(fd);}}
 return {allowed,receiptPath,expected};
}
function startupRequestGate(getAdmission){
 if(typeof getAdmission!=='function')throw Error('Startup admission getter required');
 return (req,res,next)=>{
  if(req.method==='GET'&&req.originalUrl.split('?')[0]==='/api/version')return next();
  let admitted=false;try{admitted=getAdmission()?.allowed()===true;}catch(_){}
  if(!admitted)return res.status(503).set({'Cache-Control':'no-store','Retry-After':'60','Connection':'close'}).json({maintenance:true,error:'小屋正在完成更新檢查，請稍後再試'});
  return next();
 };
}
module.exports={aiStartupAdmission,startupRequestGate};
