/* Full server/SQLite/worker + actual Chrome TLS/product UI. Flickr is local only. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),https=require('node:https'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib'),{spawn,execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const {chromium}=require('/Users/hank/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fs.realpathSync(path.resolve(__dirname,'..'));assert(root.startsWith('/Users/hank/.local/share/project-storage/internal/builds/timehut-normal-worker-ui-'));
assert.equal(process.version,'v24.22.0');const backend=path.join(root,'backend'),out=path.join(root,'results');fs.mkdirSync(out);
const deps=createRequire('/Users/hank/.local/share/project-storage/internal/builds/timehut-public-server-deps-nzhqt5a3/package.json'),Busboy=deps('busboy');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),wait=ms=>new Promise(r=>setTimeout(r,ms));
const hostname='just-healing-production.up.railway.app',origin='https://'+hostname,password='synthetic-normal-worker-only';
const report={status:'FAIL',checks:[],http:[],provider:[],wire:[],ui:[],errors:[],forwardedProductionRequests:0,formalCredit:0,physicalPhone:false,scope:'Exact full server/normal worker plus real TLS cookie/product UI; synthetic Flickr HTTP only. No direct receipt/completion/worker mutation or product source/DOM handler replacement.'};
let provider,tls,browser,child,page,log='',token,album,failSecondIdentity=true,identityCalls=0,phase='initial',uploadCount=0;
const remote=new Map(),sockets=new Set();
function noisePNG(){
 const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 const chunk=(s,b)=>{const n=Buffer.alloc(4),c=Buffer.alloc(4),t=Buffer.from(s);n.writeUInt32BE(b.length);c.writeUInt32BE(crc(Buffer.concat([t,b])));return Buffer.concat([n,t,b,c]);};
 const size=768,h=Buffer.alloc(13),rows=Buffer.alloc((size*3+1)*size);h.writeUInt32BE(size);h.writeUInt32BE(size,4);h[8]=8;h[9]=2;
 for(let y=0;y<size;y++)crypto.randomFillSync(rows,y*(size*3+1)+1,size*3);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
const tiny=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=','base64'),large=noisePNG(),video=fs.readFileSync(path.join(root,'artificial-video.mp4'));
const fixtures=[['worker-a.png',large,'image/png'],['worker-b.mp4',video,'video/mp4'],['cancel-first.png',tiny,'image/png'],['cancel-wire.png',large,'image/png'],['cancel-unsent.png',tiny,'image/png']].map(([name,buffer,mimeType])=>({name,buffer,mimeType}));
async function listen(s){await new Promise(r=>s.listen(0,'127.0.0.1',r));s.on('connection',c=>{sockets.add(c);c.on('close',()=>sockets.delete(c));});return s.address().port;}
async function until(fn,message,ms=20000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await wait(100);}throw Error(message);}
async function main(){try{
 const {SQLiteAccountStore}=require(path.join(backend,'account-sqlite-store')),owner=require(path.join(backend,'account-owner-bootstrap'));
 const store=new SQLiteAccountStore(path.join(backend,'uploads/.accounts')),reservation=owner.reserve(store,'synthetic-owner',[{name:'Synthetic',birthDate:'2026-01-01',albumId:'90000009901'}]);
 const family=await owner.provision(store,{username:'synthetic-owner',bindingId:reservation.bindingId,password,displayName:'Synthetic family'}),a=await store.register('normal-alpha',password,'Worker QA');
 album=store.album(a.id,'人工工作佇列','2026-01-01');token=(await store.login('normal-alpha',password)).token;store.close();
 provider=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost'),entry={method:req.method,path:u.pathname,phase,at:Date.now()};report.provider.push(entry);
  const json=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  try{
   if(u.pathname.startsWith('/media/')){const row=remote.get(u.pathname.split('/')[2]);assert(row);const poster=u.pathname.endsWith('/poster');res.writeHead(200,{'Content-Type':poster?'image/png':row.mimeType});return res.end(poster?tiny:row.body);}
   if(u.pathname==='/services/upload/'){
    assert.equal(req.method,'POST');const fields={},files=[];const bb=Busboy({headers:req.headers,limits:{files:1,fileSize:4*1024*1024}});
    bb.on('field',(k,v)=>fields[k]=v);bb.on('file',(_n,s,info)=>{const chunks=[];s.on('data',b=>chunks.push(b));s.on('end',()=>files.push({...info,body:Buffer.concat(chunks)}));});
    await new Promise((resolve,reject)=>{bb.on('close',resolve);bb.on('error',reject);req.pipe(bb);});assert.equal(files.length,1);
    const f=files[0],expected=fixtures.find(x=>x.name===f.filename);assert(expected);assert.equal(sha(f.body),sha(expected.buffer));assert.equal(f.mimeType,expected.mimeType);
    for(const k of ['is_public','is_friend','is_family'])assert.equal(fields[k],'0');assert.equal(fields.title,f.filename);assert.equal(fields.tags,'uploader:Worker QA 人工 worker');
    assert(![...remote.values()].some(x=>x.filename===f.filename),'DUPLICATE_CREATION');assert(++uploadCount<=5,'LOCAL_CREATION_BUDGET');
    const id='900099'+String(uploadCount).padStart(6,'0');remote.set(id,{...f,fields});Object.assign(entry,{id,filename:f.filename,bytes:f.body.length,sha256:sha(f.body),private:true});
    res.writeHead(200,{'Content-Type':'application/xml'});return res.end('<rsp stat="ok"><photoid>'+id+'</photoid></rsp>');
   }
   assert.equal(u.pathname,'/services/rest/');let params=u.searchParams;
   if(req.method==='POST'){const chunks=[];for await(const b of req)chunks.push(b);params=new URLSearchParams(Buffer.concat(chunks).toString());}
   entry.api=params.get('method');
   if(entry.api==='flickr.test.echo')return json({stat:'ok'});
   if(entry.api==='flickr.test.login'){identityCalls++;entry.identityDenied=failSecondIdentity&&identityCalls===2;return json({stat:'ok',user:{id:entry.identityDenied?'0@N99':'0@N00'}});}
   const id=params.get('photo_id');assert(remote.has(id),'ONLY_NEW_FAKE_IDS');entry.id=id;
   if(entry.api==='flickr.photos.getSizes')return json({stat:'ok',sizes:{size:[{label:'Medium',source:'https://live.staticflickr.com/synthetic-worker/'+id+'/poster',width:1,height:1,media:'photo'},{label:'Original',source:'https://live.staticflickr.com/synthetic-worker/'+id+'/original',width:768,height:768,media:remote.get(id).mimeType.startsWith('video/')?'video':'photo'}]}});
   throw Error('Unexpected fixture API '+entry.api);
  }catch(e){report.errors.push('Provider fixture: '+e.message);json({stat:'fail',message:e.message},500);}
 });
 const providerPort=await listen(provider),portServer=http.createServer(),backendPort=await listen(portServer);await new Promise(r=>portServer.close(r));
 child=spawn(process.execPath,['--require',path.join(root,'tools/fixtures/normal-worker-wire-transport.cjs'),'server.js'],{cwd:backend,env:{PATH:process.env.PATH,NODE_PATH:'/Users/hank/.local/share/project-storage/internal/builds/timehut-public-server-deps-nzhqt5a3/node_modules',PORT:String(backendPort),TIMEHUT_BIND_HOST:'127.0.0.1',TIMEHUT_PUBLIC_REGISTRATION:'true',TIMEHUT_ACCEPT_SIGNUPS:'true',TIMEHUT_LEGACY_OWNER_ID:family.ownerUserId,TIMEHUT_SYNTHETIC_PROVIDER_ORIGIN:'http://127.0.0.1:'+providerPort+'/',FLICKR_API_KEY:'synthetic',FLICKR_API_SECRET:'synthetic',FLICKR_USER_ID:'0@N00',FLICKR_OAUTH_TOKEN:'synthetic',FLICKR_OAUTH_TOKEN_SECRET:'synthetic'}});
 child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);const local='http://127.0.0.1:'+backendPort;
 await until(async()=>{assert(child.exitCode===null,'Child exited: '+log);try{return(await fetch(local+'/health')).ok;}catch{return false;}},'Backend startup');
 async function api(route,options={}){const r=await fetch(local+route,{...options,headers:{Authorization:'Bearer '+token,...options.headers}});return{status:r.status,json:await r.json()};}
 const mapping=crypto.randomUUID();
 tls=https.createServer({key:fs.readFileSync(path.join(root,'tls/key.pem')),cert:fs.readFileSync(path.join(root,'tls/cert.pem'))},(req,res)=>{
  assert(['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress));
  if(req.url==='/fixture-health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({localSyntheticFixture:mapping}));}
  const row={method:req.method,path:new URL(req.url,origin).pathname,phase,at:Date.now(),hasCookie:/__Secure-timehut_session=/.test(req.headers.cookie||'')};report.http.push(row);res.on('finish',()=>row.status=res.statusCode);
  const upstream=http.request(local+req.url,{method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
  req.on('aborted',()=>{row.aborted=true;upstream.destroy();});upstream.on('error',()=>{if(!res.destroyed)res.destroy();});
  if(req.method==='POST'&&row.path==='/api/upload'){Object.assign(row,{clientUploadId:req.headers['x-timehut-upload'],contentSHA256:req.headers['x-timehut-content-sha256'],metadataSHA256:req.headers['x-timehut-metadata-sha256']});let bytes=0;req.on('data',b=>{bytes+=b.length;row.received=bytes;report.wire.push({at:Date.now(),phase,request:report.http.indexOf(row),bytes,total:Number(req.headers['content-length'])});});}
  req.pipe(upstream);
 });const tlsPort=await listen(tls);
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-proxy-server','--host-resolver-rules=MAP '+hostname+' 127.0.0.1:'+tlsPort+', MAP * ~NOTFOUND']});
 const context=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true,serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.dismiss());
 assert.equal(await(await page.goto(origin+'/fixture-health')).json().then(x=>x.localSyntheticFixture),mapping);report.mappingProvedBeforeLogin=true;
 await page.goto(origin+'/app/account.html');await page.locator('#account-form [name=username]').fill('normal-alpha');await page.locator('#account-form [name=password]').fill(password);await page.locator('#account-submit').click();await page.locator('#account-home').waitFor({state:'visible'});
 assert((await context.cookies(origin+'/api/')).some(c=>c.name==='__Secure-timehut_session'&&c.httpOnly&&c.secure));report.checks.push('Actual product login/session cookie through same-origin loopback TLS; no bearer injection or auth/bootstrap replacement');
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
 const throttle=uploadThroughput=>cdp.send('Network.emulateNetworkConditions',{offline:false,latency:5,downloadThroughput:10*1024*1024,uploadThroughput});
 async function sheet(files){await page.locator('#uploadBtn').click();await page.locator('#fileInput').setInputFiles(files);await page.locator('#tagsInput').fill('人工 worker');await page.locator('#startUploadBtn').click();}
 async function intermediate(label){return until(async()=>{const ui=await page.locator('#globalUploadBar').evaluate(e=>({at:Date.now(),visible:e.classList.contains('visible'),width:document.getElementById('globalProgressBar').style.width,status:document.getElementById('globalStatusText').textContent}));report.ui.push(ui);const body=report.wire.filter(x=>x.phase===phase).at(-1),percent=parseFloat(ui.width);if(ui.visible&&percent>0&&percent<99&&body?.bytes>0&&body.bytes<body.total)return{ui,body};return false;},label,18000);}
 await page.goto(origin+'/app/timeline.html');phase='partial';await throttle(256*1024);await sheet(fixtures.slice(0,2));report.initialProgress=await intermediate('Initial real wire progress');await page.screenshot({path:path.join(out,'01-real-wire-progress.png')});
 const partial=await until(async()=>{const q=(await api('/api/uploads/status')).json.items;return q.length===2&&q.some(x=>x.status==='completed')&&q.some(x=>x.status==='error')?q:false;},'Normal worker partial completion',30000);
 assert.equal(uploadCount,1);const failed=partial.find(x=>x.status==='error');assert.equal(failed.retryBlocked,false);await throttle(-1);
 await page.goto(origin+'/app/transfer.html');const failedCard=page.locator('[data-task-id="'+failed.localId+'"]');await failedCard.getByRole('button',{name:'重試 Flickr 處理'}).waitFor();await page.screenshot({path:path.join(out,'02-normal-worker-partial.png')});
 failSecondIdentity=false;await failedCard.getByRole('button',{name:'重試 Flickr 處理'}).click();await until(async()=>{const q=(await api('/api/uploads/status')).json.items;return q.length===2&&q.every(x=>x.status==='completed')?q:false;},'Failed-only actual worker retry');assert.equal(uploadCount,2);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.transfer-task[data-stage=completed]').length===2);await page.screenshot({path:path.join(out,'03-normal-worker-completed.png')});report.checks.push('Full normal worker photo/video partial outcome, real failed-only retry and reload; exactly two provider creations, completed first file not reuploaded');
 phase='cancel';await page.goto(origin+'/app/timeline.html');await throttle(128*1024);await sheet(fixtures.slice(2));await until(async()=>/cancel-wire/.test(await page.locator('#globalStatusText').innerText()),'Second current file begins');report.cancelProgress=await intermediate('Partial body at actual stop');await page.locator('#stopUploadBtn').click();await page.waitForFunction(()=>!BackgroundUploader.isUploading&&UploadUI.fileList.length===2);await page.locator('#uploadBtn').click();await page.locator('#uploadStopNotice').waitFor();
 const stopped=await page.evaluate(()=>({files:UploadUI.fileList.map(f=>f.name),failed:BackgroundUploader.failedFiles.map(f=>({name:f.name,state:f.state})),busy:BackgroundUploader.isUploading,notice:document.getElementById('uploadStopNotice').textContent,tags:[...document.querySelectorAll('.queue-item-tags')].map(e=>({value:e.value,readOnly:e.readOnly}))}));report.stopped=stopped;assert.deepEqual(stopped.files,['cancel-wire.png','cancel-unsent.png']);assert(stopped.failed.some(f=>f.state==='unknown')&&stopped.failed.some(f=>f.state==='not_sent'));assert.equal(stopped.busy,false);assert.match(stopped.notice,/不代表 Flickr/);assert.deepEqual(stopped.tags,[{value:'人工 worker',readOnly:true},{value:'人工 worker',readOnly:true}]);
 assert.equal([...remote.values()].filter(x=>x.filename==='cancel-wire.png').length,0);assert.equal([...remote.values()].filter(x=>x.filename==='cancel-unsent.png').length,0);await page.screenshot({path:path.join(out,'04-actual-stop-retained-files.png')});report.checks.push('Actual XHR abort during partial TLS body, unknown/unsent split and retained original Files; no fake cancellation of acknowledged server work');
 await throttle(-1);phase='resume';await page.locator('#startUploadBtn').click();
 await until(async()=>{const q=(await api('/api/uploads/status')).json.items;return q.length===5&&q.every(x=>x.status==='completed')?q:false;},'Explicit retained-file resume through normal worker',30000);assert.equal(uploadCount,5);
 await page.goto(origin+'/app/transfer.html');await page.waitForFunction(()=>document.querySelectorAll('.transfer-task[data-stage=completed]').length===5);await page.screenshot({path:path.join(out,'05-resumed-completed-receipts.png')});
 const final=(await api('/api/uploads/status')).json.items;assert.equal(new Set(final.map(x=>x.localId)).size,5);assert.equal(new Set(final.map(x=>x.flickrPhotoId)).size,5);for(const f of fixtures)assert.equal([...remote.values()].filter(x=>x.filename===f.name).length,1);
 const posts=report.http.filter(x=>x.method==='POST'&&x.path==='/api/upload'),aborted=posts.find(x=>x.phase==='cancel'&&x.aborted),resumed=posts.find(x=>x.phase==='resume'&&x.contentSHA256===sha(large));assert(aborted&&resumed);assert.equal(posts.length,6);for(const k of ['clientUploadId','contentSHA256','metadataSHA256'])assert.equal(aborted[k],resumed[k]);assert.match(resumed.clientUploadId,/^web_[a-f0-9]{64}$/);report.sameIdentityResume={abortedClientUploadId:aborted.clientUploadId,resumedClientUploadId:resumed.clientUploadId,contentSHA256:resumed.contentSHA256,metadataSHA256:resumed.metadataSHA256,actualReceivingPOSTs:posts.length,uniqueAcceptedReceipts:final.length};
 report.checks.push('Explicit retry of retained same Files completes five unique receipts through real worker, one local synthetic creation per original, no re-upload of acknowledged files');
 assert.deepEqual(report.errors,[]);report.finalReceipts=final.map(x=>({localId:x.localId,status:x.status,flickrPhotoId:x.flickrPhotoId}));report.syntheticProviderCreations=uploadCount;report.status='PASS_LOCAL_FULL_NORMAL_WORKER_PRODUCT_UI_PARTIAL_STOP';
 }catch(e){report.error=e.stack;process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}finally{
 await browser?.close();if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
 for(const s of sockets)s.destroy();for(const s of [tls,provider])if(s?.listening)await new Promise(r=>s.close(r));fs.writeFileSync(path.join(out,'server.log'),log);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,groups:report.checks.length,error:report.error,output:out}));}}
main();
