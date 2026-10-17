/* Exact human-approved four-asset operator QA. No provider writes, SSH, DB or GUI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),https=require('node:https');
const {execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const D=require('./test_public_provider_e2e.cjs');
const {bounded}=require('./verify_public_provider_playback.cjs');
const ROOT=path.resolve(__dirname,'..');
const Q=path.join(ROOT,'.codex-local/qa/20261017-public-provider-live4');
const APPROVAL=path.join(ROOT,'.codex-local/qa/20261017-internal-release94-proposal/direct-human-authorization.json');
const DRIVER=__filename;
const UUID=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hash=D.hash, now=()=>new Date().toISOString(), sleep=ms=>new Promise(r=>setTimeout(r,ms));
function regular(file,max=8*1024*1024){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const s=fs.fstatSync(fd);assert(s.isFile()&&s.nlink===1&&s.size<=max,'REGULAR_FILE');return fs.readFileSync(fd);}finally{fs.closeSync(fd);}}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function writeAll(fd,bytes){assert(Buffer.isBuffer(bytes),'WRITE_BUFFER');let offset=0;while(offset<bytes.length){const written=fs.writeSync(fd,bytes,offset,bytes.length-offset);assert(Number.isInteger(written)&&written>0&&written<=bytes.length-offset,'INCOMPLETE_DURABLE_WRITE');offset+=written;}}
function writeSecrets(file,secrets){const temp=file+'.new';const fd=fs.openSync(temp,'wx',0o600);try{writeAll(fd,Buffer.from(JSON.stringify(secrets)));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);syncDir(path.dirname(file));}
function exclusive(file,value){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}syncDir(path.dirname(file));}
// One fixed ledger per authorization; no arbitrary --output or alternate run IDs.
class Journal{
 constructor(dir,binding){this.file=path.join(dir,'events.jsonl');this.lock=path.join(dir,'operator.lock');this.lockFD=fs.openSync(this.lock,'wx',0o600);this.state={binding,accounts:{},albums:[],uploads:[],operations:[],checks:[],terminal:false};this.seq=0;this.previous='0'.repeat(64);
  try{if(fs.existsSync(this.file)){for(const line of regular(this.file).toString().trim().split('\n')){const r=JSON.parse(line),{digest,...v}=r;assert(v.seq===this.seq&&v.previous===this.previous&&hash(JSON.stringify(v))===digest,'JOURNAL_CHAIN');this.state=v.state;this.seq++;this.previous=digest;}assert.deepEqual(this.state.binding,binding,'JOURNAL_BINDING');}else this.change(()=>{});}
  catch(e){this.close();throw e;}}
 change(fn){assert(!this.failed,'JOURNAL_FAILED_PRESERVE_PARTIAL_TAIL');const state=structuredClone(this.state);fn(state);const v={seq:this.seq,previous:this.previous,at:now(),state},digest=hash(JSON.stringify(v));const fd=fs.openSync(this.file,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,0o600);try{writeAll(fd,Buffer.from(JSON.stringify({...v,digest})+'\n'));fs.fsyncSync(fd);syncDir(path.dirname(this.file));}catch(e){this.failed=true;throw e;}finally{fs.closeSync(fd);}this.state=state;this.seq++;this.previous=digest;}
 check(name,data={}){this.change(s=>s.checks.push({name,at:now(),...data}));}
 intent(key,kind,data){assert(!this.state.terminal,'TERMINAL_RUN');assert(!this.state.operations.some(o=>o.key===key),'UNKNOWN_OR_PREVIOUS_NO_REPLAY');this.change(s=>s.operations.push({key,kind,data,outcome:'reserved_before_network',at:now()}));}
 ack(key,result){this.change(s=>{const o=s.operations.find(o=>o.key===key);assert(o,'INTENT_REQUIRED');o.outcome='acknowledged';o.result=result;});}
 close(){if(this.lockFD!==undefined){fs.closeSync(this.lockFD);this.lockFD=undefined;fs.unlinkSync(this.lock);syncDir(path.dirname(this.lock));}}
}
function routeAllowed(route,method,state,role){
 assert(typeof route==='string'&&route.startsWith('/api/')&&!route.includes('%')&&!route.includes('..')&&!route.includes('//'),'ROUTE');
 const u=new URL(route,D.ORIGIN);assert(u.origin===D.ORIGIN&&!u.hash&&!u.username,'ORIGIN');
 if(['/api/accounts/register','/api/accounts/login'].includes(u.pathname))return method==='POST'&&!role;
 if(u.pathname==='/api/accounts/me')return method==='GET'||method==='DELETE';
 if(/^\/api\/accounts\/deletion\/[A-Za-z0-9_-]{43}$/.test(u.pathname))return method==='GET'&&!role;
 if(['/api/accounts/albums','/api/accounts/photos'].includes(u.pathname))return method==='GET'||u.pathname==='/api/accounts/albums'&&method==='POST';
 if(u.pathname==='/api/uploads/status')return method==='GET';
 if(u.pathname==='/api/upload')return method==='POST'&&role==='A';
 if(u.pathname==='/api/photos/update-date'||u.pathname==='/api/photos/tags/add')return method==='POST'&&role==='A';
 let m=/^\/api\/photo\/(\d+)(?:\/(sizes|image|video|tags))?$/.exec(u.pathname);
 if(m){assert(state.uploads.some(r=>r.providerId===m[1]),'EXACT_RECORDED_MEDIA');return method==='GET'&&!!m[2]||role==='A'&&(method==='DELETE'&&!m[2]||method==='PUT'&&m[2]==='tags');}
 m=/^\/api\/uploads\/(status|file|admission)\/([A-Za-z0-9_-]+)$/.exec(u.pathname);
 if(m){assert(state.uploads.some(r=>(m[1]==='admission'?r.clientId:r.localId)===m[2]),'EXACT_RECORDED_RECEIPT');return method==='GET';}
 m=/^\/api\/album\/([a-f0-9-]{36})\/(photos|add_photos|remove_photos)$/.exec(u.pathname);
 if(m){assert(state.albums.some(a=>a.id===m[1]),'EXACT_RECORDED_ALBUM');return method==='GET'&&m[2]==='photos'||method==='POST'&&role==='A'&&m[2]!=='photos'&&state.albums.some(a=>a.id===m[1]&&a.role==='A');}
 return false;
}
function bodyAllowed(role,route,method,body,headers,j,secrets){
 const s=j.state;
 if(method==='GET'){assert(body===undefined,'GET_BODY');return;}
 if(route==='/api/accounts/register'||route==='/api/accounts/login'){
  assert(!role&&['A','B'].some(k=>body.username===s.binding.accounts[k]&&body.password===secrets[k].password),'TWO_EXACT_QA_CREDENTIALS');
  if(route.endsWith('/register'))assert(s.operations.some(o=>o.kind==='register'&&o.data.username===body.username&&o.outcome==='reserved_before_network'),'REGISTRATION_INTENT');return;
 }
 assert(role==='A'||route==='/api/accounts/albums'||route==='/api/accounts/me','B_READ_ONLY_EXCEPT_OWN_LIFECYCLE');
 if(route==='/api/accounts/albums'){assert(s.operations.some(o=>o.kind==='album'&&o.data.role===role&&o.data.title===body.title&&o.data.creationRequestId===body.creationRequestId&&o.outcome==='reserved_before_network')&&body.birthDate==='2024-01-01','EXACT_ALBUM_INTENT');return;}
 if(route==='/api/accounts/me'){assert(method==='DELETE'&&body.password===secrets[role].password&&s.operations.some(o=>o.key==='erase-'+role&&o.outcome==='reserved_before_network'),'EXACT_ERASURE_INTENT');return;}
 const ids=body?.photoIds;
 if(method==='POST'&&route!=='/api/upload')assert(Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>s.uploads.some(r=>r.providerId===id&&!r.deleted)),'EXACT_NEW_MEDIA_ONLY');
 if(route==='/api/upload'){
  assert(Buffer.isBuffer(body)&&body.length<65536,'EXACT_SMALL_MULTIPART');const m=/^multipart\/form-data; boundary=(qa[a-f0-9]{32})$/.exec(headers['Content-Type']||'');assert(m,'MULTIPART_BOUNDARY');
  const fields={},files=[];
  for(const p of body.toString('latin1').split('--'+m[1])){const n=/name="([^"]+)"/.exec(p)?.[1];if(!n)continue;const pos=p.indexOf('\r\n\r\n');assert(pos>=0);const bytes=Buffer.from(p.slice(pos+4).replace(/\r\n$/,''),'latin1'),filename=/filename="([^"]+)"/.exec(p)?.[1];if(filename)files.push({name:filename,bytes});else{assert(!Object.hasOwn(fields,n),'DUPLICATE_MULTIPART_FIELD');fields[n]=bytes.toString('utf8');}}
  assert.equal(files.length,1);const row=s.uploads.find(r=>r.clientId===headers['X-Timehut-Upload']);assert(row&&!row.localId&&row.album===headers['X-Timehut-Album']&&row.sha256===headers['X-Timehut-Content-SHA256']&&row.metadata===headers['X-Timehut-Metadata-SHA256'],'EXACT_RESERVED_UPLOAD');assert.equal(files[0].name,row.name);assert.equal(files[0].bytes.length,row.bytes);assert.equal(hash(files[0].bytes),row.sha256);assert.deepEqual(fields,{albumId:row.album,clientUploadId:row.clientId,title:row.name,description:'',tags:row.tags,date:row.date});return;
 }
 const key=s.operations.findLast(o=>o.outcome==='reserved_before_network'&&((o.kind==='mutation'&&o.data.route===route&&o.data.method===method&&JSON.stringify(o.data.body)===JSON.stringify(body))||(o.kind==='delete-exact-new-media'&&route==='/api/photo/'+o.data.providerId&&method==='DELETE')));assert(key,'EXACT_MUTATION_INTENT');
}
function validateMutationResult(route,body,result){
 const single=/^\/api\/photo\/(\d+)\/tags$/.exec(route);
 if(single){assert(result?.success===true&&result.photoId===single[1],'SINGLE_MUTATION_NOT_CONFIRMED');if(result.results!==undefined)assert(Array.isArray(result.results)&&result.results.length===1&&result.results[0].success===true&&result.results[0].photoId===single[1],'SINGLE_RESULT_ID');return;}
 const ids=body.photoIds;assert(Array.isArray(ids)&&result?.successCount===ids.length&&Array.isArray(result.results)&&result.results.length===ids.length&&result.results.every(r=>r.success===true&&typeof r.photoId==='string')&&new Set(result.results.map(r=>r.photoId)).size===ids.length,'BATCH_MUTATION_NOT_CONFIRMED');assert.deepEqual(result.results.map(r=>r.photoId).sort(),[...ids].sort(),'BATCH_EXACT_IDS');
}
class Transport{
 constructor(journal,secrets){this.j=journal;this.secrets=secrets;this.lastLimitedAt=0;}
 async call(role,route,{method='GET',body,headers={},allowError=false,binary=false}={}){
  assert(routeAllowed(route,method,this.j.state,role),'ROUTE_NOT_AUTHORIZED');
  assert(!Object.keys(headers).some(k=>/authorization|cookie|origin|host|expected-user/i.test(k)),'HEADER_OVERRIDE');
  const user=role&&this.j.state.accounts[role],secret=role&&this.secrets[role];assert(!role||user?.id&&secret?.token,'BOUND_ACTOR');
  bodyAllowed(role,route,method,body,headers,this.j,this.secrets);
  if(['/api/accounts/register','/api/accounts/login'].includes(route)||method==='DELETE'&&route==='/api/accounts/me'||route.startsWith('/api/accounts/deletion/')){await sleep(Math.max(0,this.lastLimitedAt+7000-Date.now()));this.lastLimitedAt=Date.now();}
  const bytes=body===undefined?null:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
  let activeRequest;const response=await bounded(()=>new Promise((resolve,reject)=>{
   const req=activeRequest=https.request(D.ORIGIN+route,{method,headers:{Origin:D.ORIGIN,...headers,...(user?{Authorization:'Bearer '+secret.token,'X-Timehut-Expected-User':user.id}:{}),...(bytes?{'Content-Length':bytes.length,...(!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{})}:{})}},res=>{
    let n=0;const parts=[];res.on('data',b=>{n+=b.length;if(n>8*1024*1024)res.destroy(new Error('RESPONSE_BOUND'));else parts.push(b);});res.on('error',()=>reject(new Error('RESPONSE_UNKNOWN')));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(parts)}));
   });req.setTimeout(45000,()=>req.destroy(new Error('TIMEOUT_UNKNOWN')));req.on('error',()=>reject(new Error('TRANSPORT_UNKNOWN')));req.end(bytes||undefined);
  }),45000,()=>activeRequest?.destroy(new Error('TOTAL_REQUEST_DEADLINE')));
  assert(response.status<300||response.status>=400,'REDIRECT_FORBIDDEN');
  if(user&&response.status!==401)assert.equal(response.headers['x-timehut-account'],user.id,'RESPONSE_ACTOR');
  try{response.json=JSON.parse(response.bytes);}catch(_){assert(binary||allowError,'JSON_RESPONSE');}
  if(!allowError)assert(response.status>=200&&response.status<300,'HTTP_NOT_SUCCESS');
  return response;
 }
 async me(role){const r=await this.call(role,'/api/accounts/me');assert.equal(r.json.user.id,this.j.state.accounts[role].id);assert.equal(r.json.user.username,this.j.state.accounts[role].username);assert.equal(r.json.legacyOwner,false,'FAMILY_ACCOUNT_FORBIDDEN');return r.json;}
}
function validateAuthority(){D.validateProposal(ROOT);const raw=regular(APPROVAL,16384),a=JSON.parse(raw);assert.equal(a.questionToolCall,'call_0e258415d67643f78d4d9f9de884c17f');assert.equal(a.answers[1].answer,'允許這 4 份人工資料測試並清理');assert.equal(a.newProviderManifestSHA256,D.MANIFEST_SHA);return hash(raw);}
function loadProvider(){
 // Existing connected service read only. No creation/rotation of credentials.
 let v;try{v=JSON.parse(execFileSync('/Users/hank/.cache/hank-internal/timehut-railway-cli/v5.68.0/railway',['variables','--json','--service','a30a8cea-b153-4ef9-b438-0a80387dc5a4','--environment','4eb7d16f-17c1-40df-a338-8554d1778fd3'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:1024*1024}));}catch(_){throw new Error('EXISTING_PROVIDER_CREDENTIALS_UNAVAILABLE');}
 const credentials={key:v.FLICKR_API_KEY,secret:v.FLICKR_API_SECRET,token:v.FLICKR_OAUTH_TOKEN,tokenSecret:v.FLICKR_OAUTH_TOKEN_SECRET},expected=v.FLICKR_USER_ID;assert(Object.values(credentials).every(s=>typeof s==='string'&&s.length>0)&&/^\d+@N\d{2}$/.test(expected),'PROVIDER_REFERENCE');
 const {flickrRequest}=require('../server/flickr-api');
 return async(method,params={})=>{assert(['flickr.test.login','flickr.photos.getInfo','flickr.photos.getPerms','flickr.photos.getAllContexts'].includes(method),'PROVIDER_READ_ONLY');if(method!=='flickr.test.login')assert(/^\d+$/.test(params.photo_id),'EXACT_ID');const r=await flickrRequest(method,params,credentials,'GET',async(u,options)=>{assert(new URL(u).origin==='https://api.flickr.com'&&options.method==='GET','SIGNED_READ_ONLY');return fetch(u,{...options,redirect:'error'});});if(method==='flickr.test.login')assert.equal(r.user.id,expected,'CENTRAL_OWNER_CHANGED');return {data:r,expected};};
}
class Runner{
 constructor(j,t,provider,secrets,saveSecrets){Object.assign(this,{j,t,provider,secrets,saveSecrets});}
 async signed(row){assert(this.j.state.uploads.some(r=>r.index===row.index&&r.providerId===row.providerId),'RECORDED_PROVIDER_ID');await this.provider('flickr.test.login');const {data,expected}=await this.provider('flickr.photos.getInfo',{photo_id:row.providerId});const p=data.photo;assert.equal(p.id,row.providerId);assert.equal(p.owner.nsid,expected);assert.equal(p.title._content,D.ASSETS[row.index][0]);for(const k of ['ispublic','isfriend','isfamily'])assert(Object.hasOwn(p.visibility,k)&&(p.visibility[k]===0||p.visibility[k]==='0'),'PRIVATE_MEDIA_REQUIRED');assert(p.tags.tag.some(t=>(t.raw||t._content)===this.j.state.binding.runTag),'RUN_PROVENANCE');return p;}
 async setup(){
  for(const role of ['A','B']){
   let a=this.j.state.accounts[role];const username=this.j.state.binding.accounts[role];
   if(!a){this.j.intent('register-'+role,'register',{role,username});const r=await this.t.call(null,'/api/accounts/register',{method:'POST',body:{username,password:this.secrets[role].password,displayName:'人工測試 '+role}});assert.equal(r.status,201);assert(UUID.test(r.json.user.id)&&r.json.user.username===username);this.j.change(s=>s.accounts[role]={id:r.json.user.id,username});this.j.ack('register-'+role,{id:r.json.user.id});}
   const r=await this.t.call(null,'/api/accounts/login',{method:'POST',body:{username,password:this.secrets[role].password}});assert.equal(r.json.user.id,this.j.state.accounts[role].id);this.secrets[role].token=r.json.token;this.saveSecrets();await this.t.me(role);
   let list=await this.t.call(role,'/api/accounts/albums');assert.equal(list.json.total,this.j.state.albums.filter(a=>a.role===role).length,'UNEXPECTED_ALBUM');
   for(let i=0;i<(role==='A'?2:1);i++){
    const key='album-'+role+'-'+i;if(this.j.state.albums.some(a=>a.key===key))continue;
    const title=this.j.state.binding.runTag+' '+role+i,creationRequestId=crypto.randomUUID();this.j.intent(key,'album',{role,title,creationRequestId});
    const r=await this.t.call(role,'/api/accounts/albums',{method:'POST',body:{title,birthDate:'2024-01-01',creationRequestId}});const a=r.json.album;assert.equal(r.status,201);assert(UUID.test(a.id)&&a.userId===this.j.state.accounts[role].id&&a.creationRequestId===creationRequestId&&a.title===title);this.j.change(s=>s.albums.push({id:a.id,role,key,title,creationRequestId}));this.j.ack(key,{id:a.id});
   }
  }this.j.check('two-new-ordinary-accounts-three-virtual-albums');
 }
 async upload(index){
  assert(Number.isInteger(index)&&index>=0&&index<4,'EXACT_FOUR_INDICES');const [name,bytes,sha,mime]=D.ASSETS[index],album=this.j.state.albums.find(a=>a.role==='A').id;
  assert(!this.j.state.uploads.some(r=>r.index===index),'UPLOAD_NO_REPLAY');assert(this.j.state.uploads.length<4,'FOUR_MAX');await this.t.me('A');
  const content=regular(path.join(ROOT,'.codex-local/qa/20261016-public-provider-e2e-proposal/media',name),32768);assert.equal(hash(content),sha);assert.equal(content.length,bytes);
  const clientId='qa_'+crypto.randomBytes(24).toString('hex'),tags=this.j.state.binding.runTag+' '+(index<2?'batch':'single'+index),date='2024-01-02';const metadata=D.metadataDigest([album,name,mime,tags,name,'',date]);
  this.j.intent('upload-'+index,'upload',{index,clientId,sha256:sha,album});this.j.change(s=>s.uploads.push({index,clientId,name,sha256:sha,bytes,mime,album,tags,date,metadata,localId:null,providerId:null}));
  const boundary='qa'+crypto.randomBytes(16).toString('hex'),fields={albumId:album,clientUploadId:clientId,title:name,description:'',tags,date};const chunks=Object.entries(fields).map(([k,v])=>Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`),content,Buffer.from(`\r\n--${boundary}--\r\n`));
  const r=await this.t.call('A','/api/upload',{method:'POST',body:Buffer.concat(chunks),headers:{'Content-Type':'multipart/form-data; boundary='+boundary,'X-Timehut-Album':album,'X-Timehut-Upload':clientId,'X-Timehut-Content-SHA256':sha,'X-Timehut-Metadata-SHA256':metadata}});
  assert.equal(r.json.results?.length,1);const ack=r.json.results[0];assert(ack.success===true&&/^local_[A-Za-z0-9_-]+$/.test(ack.localId),'UPLOAD_UNKNOWN_CHECK_ADMISSION_ONLY');this.observe(index,ack.localId,ack.photoId);this.j.ack('upload-'+index,{localId:ack.localId});
 }
 observe(index,localId,providerId){this.j.change(s=>{const row=s.uploads.find(r=>r.index===index);assert(row,'UPLOAD_INTENT');if(localId){assert(/^local_[A-Za-z0-9_-]+$/.test(localId)&&(!row.localId||row.localId===localId));assert(!s.uploads.some(r=>r.index!==index&&r.localId===localId));row.localId=localId;}if(providerId){assert(typeof providerId==='string'&&/^\d+$/.test(providerId)&&(!row.providerId||row.providerId===providerId));assert(!s.uploads.some(r=>r.index!==index&&r.providerId===providerId));row.providerId=providerId;}});}
 async completed(index){
  const end=Date.now()+240000;while(Date.now()<end){const row=this.j.state.uploads.find(r=>r.index===index);const a=await this.t.call('A','/api/uploads/admission/'+row.clientId);if(a.json.localId)this.observe(index,a.json.localId,a.json.flickrPhotoId);const latest=this.j.state.uploads.find(r=>r.index===index);assert(latest.localId,'UNKNOWN_ADMISSION_NO_POST_RETRY');const r=await this.t.call('A','/api/uploads/status/'+latest.localId);if(r.json.flickrPhotoId)this.observe(index,latest.localId,r.json.flickrPhotoId);if(r.json.status==='completed'){assert(this.j.state.uploads.find(r=>r.index===index).providerId);this.j.check('completed-upload-'+index,{index});return;}assert(!['error','cancelled'].includes(r.json.status),'UPLOAD_STOP_NO_RETRY');await sleep(2500);}throw new Error('UPLOAD_PENDING_READ_ONLY_RESUME');
 }
 prepared(row){const [name,bytes,sha256,mime]=D.ASSETS[row.index];const body=regular(path.join(ROOT,'.codex-local/qa/20261016-public-provider-e2e-proposal/media',name),32768);assert.equal(hash(body),sha256);assert.equal(body.length,bytes);assert(row.name===name&&row.bytes===bytes&&row.sha256===sha256&&row.mime===mime&&row.localId&&row.providerId);assert.equal(row.metadata,D.metadataDigest([row.album,name,mime,row.tags,name,'',row.date]));assert(this.j.state.operations.some(o=>o.key==='upload-'+row.index&&o.outcome==='acknowledged'&&o.result.localId===row.localId),'DURABLE_OUTBOUND_BINDING');this.j.change(s=>s.uploads.find(r=>r.index===row.index).sourceVerified=true);this.j.check('prepared-input-and-outbound-binding-'+row.index,{sha256,bytes,localTemporaryFileRead:false});}
 async photoList(album){const r=await this.t.call('A','/api/accounts/photos?album='+album);const rows=r.json.photos.photo;assert.equal(Number(r.json.photos.total),rows.length,'SMALL_TEST_LIST_COMPLETE');assert(rows.every(p=>this.j.state.uploads.some(r=>r.providerId===p.id)),'UNEXPECTED_OWN_MEDIA');return rows;}
 async verifyMedia(){
  for(const row of this.j.state.uploads){this.j.change(s=>s.uploads.find(r=>r.index===row.index).providerOriginalVerified=false);await this.signed(row);this.prepared(row);const route='/api/photo/'+row.providerId+(row.index===3?'/video?purpose=original':'/image?size=o');const deadline=Date.now()+240000;let response;
   do{response=await this.t.call('A',route,{binary:true,allowError:true});if(response.status===200)break;assert([409,503].includes(response.status),'MEDIA_ORIGINAL_UNAVAILABLE');await sleep(4000);}while(Date.now()<deadline);
   assert.equal(response.status,200);assert.equal(hash(response.bytes),row.sha256,'PROVIDER_ORIGINAL_SHA');this.j.change(s=>s.uploads.find(r=>r.index===row.index).providerOriginalVerified=true);this.j.check('private-provider-original-'+row.index,{bytes:response.bytes.length,sha256:hash(response.bytes)});
   const {data}=await this.provider('flickr.photos.getAllContexts',{photo_id:row.providerId});assert.equal((data.set||[]).length,0,'NO_FLICKR_PHOTOSET');
  }
 }
 async isolation(){
  for(const row of this.j.state.uploads){for(const route of ['/api/photo/'+row.providerId+'/sizes','/api/photo/'+row.providerId+'/image?size=o','/api/uploads/status/'+row.localId,'/api/uploads/file/'+row.localId,...(row.index===3?['/api/photo/'+row.providerId+'/video?purpose=original']:[])]){const r=await this.t.call('B',route,{allowError:true,binary:true});assert.equal(r.status,404,'B_FOREIGN_MEDIA_DENIED');}}
  for(const a of this.j.state.albums.filter(a=>a.role==='A')){const r=await this.t.call('B','/api/album/'+a.id+'/photos',{allowError:true});assert.equal(r.status,404);}
  const r=await this.t.call('B','/api/accounts/photos');assert.equal(Number(r.json.photos.total),0);this.j.check('B-denied-known-A-media-receipts-albums');
 }
 async mutation(key,route,body,method='POST'){await this.t.me('A');this.j.intent(key,'mutation',{route,body,method});const r=await this.t.call('A',route,{method,body});validateMutationResult(route,body,r.json);this.j.ack(key,{success:true});}
 async mutations(){
  const ids=this.j.state.uploads.map(r=>r.providerId),a=this.j.state.albums.filter(a=>a.role==='A');
  for(const row of this.j.state.uploads){const tags=this.j.state.binding.runTag+' edited'+row.index;await this.mutation('tags-'+row.index,'/api/photo/'+row.providerId+'/tags',{tags},'PUT');const p=await this.signed(row);assert.deepEqual(p.tags.tag.map(t=>t.raw||t._content).sort(),tags.split(' ').sort());}
  await this.mutation('date-all','/api/photos/update-date',{photoIds:ids,targetDate:'2024-02-03'});for(const row of this.j.state.uploads){const p=await this.signed(row);assert(p.dates.taken.startsWith('2024-02-03'));}
  await this.mutation('add-all','/api/album/'+a[1].id+'/add_photos',{photoIds:ids});assert.deepEqual((await this.photoList(a[1].id)).map(r=>r.id).sort(),[...ids].sort());
  await this.mutation('remove-all','/api/album/'+a[0].id+'/remove_photos',{photoIds:ids});assert.equal((await this.photoList(a[0].id)).length,0);assert.equal((await this.photoList(a[1].id)).length,4);this.j.check('tags-dates-virtual-membership-signed-readbacks');
 }
 async cleanup(){
  assert(this.j.state.uploads.every(r=>r.providerId&&r.sourceVerified&&r.providerOriginalVerified),'UNKNOWN_MEDIA_PRESERVE_ACCOUNT');
  for(const row of this.j.state.uploads){if(row.deleted)continue;await this.t.me('A');await this.signed(row);this.j.intent('delete-'+row.index,'delete-exact-new-media',{providerId:row.providerId,sourceSHA256:row.sha256});const r=await this.t.call('A','/api/photo/'+row.providerId,{method:'DELETE'});assert(r.json.success===true&&r.json.photoId===row.providerId,'DELETE_UNCONFIRMED');await this.provider('flickr.test.login');let gone=false;try{await this.provider('flickr.photos.getInfo',{photo_id:row.providerId});}catch(e){assert.equal(e.code,1,'SIGNED_NOT_FOUND_REQUIRED');gone=true;}assert(gone);this.j.change(s=>s.uploads.find(r=>r.index===row.index).deleted=true);this.j.ack('delete-'+row.index,{providerNotFound:true});}
  for(const role of ['A','B']){if(this.j.state.accounts[role].deleted)continue;const profile=await this.t.me(role);assert.deepEqual(profile.albums.map(a=>a.id).sort(),this.j.state.albums.filter(a=>a.role===role).map(a=>a.id).sort(),'EXACT_QA_ALBUMS_ONLY');const receipts=await this.t.call(role,'/api/uploads/status');assert.equal(receipts.json.total,role==='A'?this.j.state.uploads.length:0);assert(receipts.json.items.every(r=>this.j.state.uploads.some(o=>o.localId===r.localId&&o.providerId===r.flickrPhotoId&&o.deleted)),'UNKNOWN_RECEIPT_PRESERVE_ACCOUNT');
   this.j.intent('erase-'+role,'erase-own-ordinary-account',{userId:this.j.state.accounts[role].id});const r=await this.t.call(role,'/api/accounts/me',{method:'DELETE',body:{password:this.secrets[role].password}});assert.equal(r.status,202);assert(/^[A-Za-z0-9_-]{43}$/.test(r.json.deletionReceipt));this.secrets[role].deletionReceipt=r.json.deletionReceipt;this.saveSecrets();this.j.ack('erase-'+role,{accepted:true});
   const end=Date.now()+180000;let complete=false;while(Date.now()<end){const d=await this.t.call(null,'/api/accounts/deletion/'+this.secrets[role].deletionReceipt);if(d.json.dataErasureComplete===true&&d.json.remoteErasureComplete===true&&d.json.status==='complete'){complete=true;break;}await sleep(5000);}assert(complete,'ACCOUNT_ERASURE_PENDING');const old=await this.t.call(role,'/api/accounts/me',{allowError:true});assert.equal(old.status,401);this.j.change(s=>s.accounts[role].deleted=true);
  }this.j.check('all-four-signed-not-found-and-both-account-erasure-complete');this.j.change(s=>{s.terminal=true;s.terminalAt=now();});
 }
}
async function main(){
 assert.deepEqual(process.argv.slice(2),['--execute-approved-four'],'EXPLICIT_EXACT_SCOPE_FLAG_REQUIRED');const approvalSHA=validateAuthority();const gate=JSON.parse(regular(path.join(Q,'independent-live-final.json'),262144));assert.equal(gate.status,'PASS_EXACT4_LIVE_DRIVER_READY');assert.equal(gate.driverSHA256,hash(regular(DRIVER)),'REVIEWED_DRIVER_CHANGED');
 for(const name of ['tools/verify_public_provider_playback.cjs','tools/test_public_provider_e2e.cjs','server/flickr-api.js'])assert.equal(gate.dependencyHashes?.[name],hash(regular(path.join(ROOT,name))),'REVIEWED_DEPENDENCY_CHANGED');
 const binding=JSON.parse(regular(path.join(Q,'run-binding.json'),16384));assert.equal(binding.approvalSHA256,approvalSHA);assert.equal(binding.manifestSHA256,D.MANIFEST_SHA);assert.equal(binding.driverSHA256,hash(regular(DRIVER)));assert(UUID.test(binding.runId));assert(/^qa4[a-f0-9]{32}$/.test(binding.runTag));assert(new Set(Object.values(binding.accounts)).size===2&&Object.values(binding.accounts).every(n=>/^qa-e2e-[a-f0-9]{16}-[ab]$/.test(n)));
 const secretFile=path.join(binding.secretWorkspace,'temporary-accounts.json');assert(fs.realpathSync(binding.secretWorkspace)===binding.secretWorkspace&&binding.secretWorkspace.startsWith('/Users/hank/.local/share/project-storage/internal/builds/timehut-public-live4-'),'SECRET_SSD_LOCATION');const st=fs.lstatSync(secretFile);assert((st.mode&0o777)===0o600&&st.uid===process.getuid(),'SECRET_MODE');const secrets=JSON.parse(regular(secretFile,16384));assert(secrets.runId===binding.runId&&['A','B'].every(k=>secrets[k].username===binding.accounts[k]));
 const j=new Journal(Q,binding);let runner;
 const saveSecrets=()=>writeSecrets(secretFile,secrets);
 try{
  assert(!j.state.terminal,'TERMINAL_NO_REPEAT');assert.equal(j.seq,1,'INTERRUPTED_RUN_REQUIRES_READONLY_RECONCILIATION_NOT_AUTOMATIC_RERUN');
  const health=await fetch(D.ORIGIN+'/api/version',{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(health.status,200);const version=await health.json();assert.equal(version.version,'1.0.70');j.check('production-version',{version:version.version});
  const provider=loadProvider();await provider('flickr.test.login');j.check('existing-central-provider-identity-verified');const t=new Transport(j,secrets);runner=new Runner(j,t,provider,secrets,saveSecrets);
  await runner.setup();for(let i=0;i<4;i++){await runner.upload(i);await runner.completed(i);}await runner.verifyMedia();await runner.isolation();await runner.mutations();
  // A real browser decoding/playing these four exact owned URLs is a separate
  // read-only stage after API/source verification and before cleanup.
  const {verifyPlayback}=require('./verify_public_provider_playback.cjs');await verifyPlayback({runner,root:ROOT,out:Q});
  await runner.cleanup();j.check('bounded-live-api-media-checks-complete');console.log(JSON.stringify({status:'PASS_EXACT4_LIVE_SCOPE_AND_CLEANUP',checks:j.state.checks.length,media:j.state.uploads.map(r=>({id:r.providerId,deleted:r.deleted})),accountsDeleted:['A','B'].every(k=>j.state.accounts[k].deleted),fullFormalAcceptance:false}));
 }catch(_){try{j.change(s=>{s.interruptedAt=now();s.lastFailure='LIVE_SCOPE_STOPPED_NO_REPLAY_READONLY_RECONCILIATION_REQUIRED';});}catch(_){/* Preserve a failed/partial journal without appending to its tail. */}console.log(JSON.stringify({status:'STOPPED_PRESERVE_RECEIPTS_NO_REPLAY',createdAccounts:Object.keys(j.state.accounts).length,observedMedia:j.state.uploads.filter(r=>r.providerId).length,pendingCleanup:!j.state.terminal,journalPersistenceFailed:j.failed===true}));process.exitCode=1;}finally{j.close();}
}
module.exports={Journal,writeAll,writeSecrets,routeAllowed,bodyAllowed,validateMutationResult,Transport,Runner,validateAuthority,regular,exclusive,ROOT,Q,APPROVAL};
if(require.main===module)main().catch(()=>{console.error('PRESTART_GUARD_REJECTED_NO_LIVE_RUN');process.exitCode=1;});
