/* One real product journey through the full server/worker; Flickr stays local. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),https=require('node:https'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium}=require('/Users/hank/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createProvider}=require('./fixtures/product-journey-provider.cjs');
const work=fs.realpathSync(path.resolve(__dirname,'..'));
assert(work.startsWith('/Users/hank/.local/share/project-storage/internal/builds/timehut-product-journey-'));
assert.equal(process.version,'v24.22.0');assert.equal(process.argv.length,2,'NO_LIVE_MODE_OR_EXTRA_ARGUMENTS');
const origin='https://just-healing-production.up.railway.app',hostname=new URL(origin).hostname;
const runTag='ui95-journey',password='synthetic-journey-password-only',out=path.join(work,'results');fs.mkdirSync(out);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),wait=ms=>new Promise(r=>setTimeout(r,ms));
const assets=JSON.parse(fs.readFileSync(path.join(work,'media-manifest.json'))).files.map(a=>({...a,buffer:fs.readFileSync(path.join(work,'media',a.name))}));
for(const a of assets)assert.equal(sha(a.buffer),a.sha256);
const provider=createProvider(assets,runTag),sockets=new Set();
const report={status:'FAIL',scope:'Current safe public product + full server/SQLite/normal worker, loopback Flickr only; no production transport or live mode',checks:[],http:[],errors:[],downloads:[],providerCreations:[],formalCredit:0,physical:false,liveReady:false};
let tls,browser,child,page,log='',stage='setup';
async function until(fn,label,ms=25000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await wait(120);}throw Error(label);}
async function listen(s){await new Promise(r=>s.listen(0,'127.0.0.1',r));s.on('connection',c=>{sockets.add(c);c.on('close',()=>sockets.delete(c));});return s.address().port;}
async function group(name,fn){stage=name;const result=await fn();report.checks.push({name,result});await page.screenshot({path:path.join(out,String(report.checks.length).padStart(2,'0')+'.png'),fullPage:true,mask:[page.locator('#deletion-status-form [name=receipt]')]});}
async function read(route,p=page){assert(route.startsWith('/api/'));return p.evaluate(async route=>{const r=await fetch(route,{credentials:'include'});return{status:r.status,json:await r.json()};},route);}
async function goto(name,p=page){await p.goto(origin+'/app/'+name);if(name==='account.html')await p.evaluate(()=>TimehutAccounts.ready);else assert(await p.evaluate(()=>window.TimehutPage.ready));if(name==='settings.html')assert.equal(await p.evaluate(()=>TimehutBuild.version),'2026.10.17-ui.95.11');}
async function register(p,username,displayName){
 await p.goto(origin+'/app/account.html');await p.locator('#account-toggle').click();
 await p.locator('[name=username]').fill(username);await p.locator('[name=displayName]').fill(displayName);await p.locator('#account-form [name=password]').fill(password);
 await p.locator('#account-submit').click();await p.locator('#account-home').waitFor({state:'visible'});
 const me=(await read('/api/accounts/me',p)).json;assert.equal(me.legacyOwner,false);assert.equal(me.user.username,username);return me.user;
}
async function album(p,title){
 const response=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/accounts/albums');
 await p.locator('#album-form [name=title]').fill(title);await p.locator('#album-form [name=birthDate]').fill('2020-01-01');await p.locator('#album-form button').click();
 const r=await response;assert.equal(r.status(),201);const a=(await r.json()).album;await p.locator('#account-albums [data-album="'+a.id+'"]').waitFor();return a;
}
async function select(ids){
 await goto('timeline.html');await page.locator('.moment-photo-container').first().waitFor();await page.locator('#selectModeBtn').click();
 for(const id of ids)await page.locator('.moment-photo-container[data-photo-id="'+id+'"] .timeline-photo-select').click();
 assert.deepEqual((await page.evaluate(()=>[...SelectionState.selectedPhotos])).sort(),[...ids].sort());
}
async function main(){try{
 const backend=path.join(work,'backend'),{SQLiteAccountStore}=require(path.join(backend,'account-sqlite-store')),owner=require(path.join(backend,'account-owner-bootstrap'));
 const store=new SQLiteAccountStore(path.join(backend,'uploads/.accounts')),reserved=owner.reserve(store,'synthetic-owner',[{name:'Synthetic',birthDate:'2020-01-01',albumId:'90000019901'}]);
 const family=await owner.provision(store,{username:'synthetic-owner',bindingId:reserved.bindingId,password,displayName:'Synthetic family'});store.close();
 const providerPort=await listen(provider.server),reserve=http.createServer(),backendPort=await listen(reserve);await new Promise(r=>reserve.close(r));
 child=spawn(process.execPath,['--require',path.join(work,'tools/fixtures/product-journey-wire-transport.cjs'),'server.js'],{cwd:backend,env:{PATH:process.env.PATH,NODE_PATH:'/Users/hank/.local/share/project-storage/internal/builds/timehut-public-server-deps-nzhqt5a3/node_modules',PORT:String(backendPort),TIMEHUT_BIND_HOST:'127.0.0.1',TIMEHUT_PUBLIC_REGISTRATION:'true',TIMEHUT_ACCEPT_SIGNUPS:'true',TIMEHUT_LEGACY_OWNER_ID:family.ownerUserId,TIMEHUT_SYNTHETIC_PROVIDER_ORIGIN:'http://127.0.0.1:'+providerPort+'/',FLICKR_API_KEY:'synthetic',FLICKR_API_SECRET:'synthetic',FLICKR_USER_ID:'0@N00',FLICKR_OAUTH_TOKEN:'synthetic',FLICKR_OAUTH_TOKEN_SECRET:'synthetic'}});
 child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);const local='http://127.0.0.1:'+backendPort;
 await until(async()=>{assert(child.exitCode===null);try{return(await fetch(local+'/health')).ok;}catch{return false;}},'Backend startup');
 const nonce=crypto.randomUUID();
 tls=https.createServer({key:fs.readFileSync(path.join(work,'tls/key.pem')),cert:fs.readFileSync(path.join(work,'tls/cert.pem'))},(req,res)=>{
  if(req.url==='/fixture-health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({nonce}));}
  const row={stage,method:req.method,path:new URL(req.url,origin).pathname.replace(/(\/api\/accounts\/deletion\/)[A-Za-z0-9_-]{43}$/,'$1[receipt-redacted]')};report.http.push(row);res.on('finish',()=>row.status=res.statusCode);
  const upstream=http.request(local+req.url,{method:req.method,headers:req.headers},reply=>{row.actor=reply.headers['x-timehut-account']||null;res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
  req.on('aborted',()=>upstream.destroy());upstream.on('error',()=>res.destroy());req.pipe(upstream);
 });const tlsPort=await listen(tls);
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-proxy-server','--host-resolver-rules=MAP '+hostname+' 127.0.0.1:'+tlsPort+', MAP * ~NOTFOUND']});
 async function context(){const c=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true,serviceWorkers:'block',acceptDownloads:true});await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());return c;}
 const ca=await context(),cb=await context();page=await ca.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
 assert.equal((await(await page.goto(origin+'/fixture-health')).json()).nonce,nonce);
 let A,B,alpha,beta,foreign,rows,albumURL;
 await group('account-registration-and-three-albums',async()=>{
  A=await register(page,'qa-journey-alpha','Journey QA');alpha=await album(page,runTag+' Alpha');beta=await album(page,runTag+' Beta');
  const b=await cb.newPage();b.on('dialog',d=>d.accept());assert.equal((await(await b.goto(origin+'/fixture-health')).json()).nonce,nonce);B=await register(b,'qa-journey-bravo','Journey B');foreign=await album(b,runTag+' Foreign');
  assert((await ca.cookies(origin+'/api/')).some(x=>x.name==='__Secure-timehut_session'&&x.httpOnly&&x.secure));return{A:A.id,B:B.id,albums:[alpha.id,beta.id,foreign.id],productRegistration:true};
 });
 await group('05-settings-save-and-reload',async()=>{
  await goto('settings.html');await page.locator('#birthdate-0').fill('2021-02-03');await page.locator('.save-btn').click();
  await until(async()=>/2021-02-03/.test(JSON.stringify((await read('/api/accounts/albums')).json)),'Birthday persisted');await page.reload();assert.equal(await page.locator('#birthdate-0').inputValue(),'2021-02-03');return{birthday:'2021-02-03',reloaded:true};
 });
 await group('06-batch-and-individual-normal-worker-upload',async()=>{
  await goto('timeline.html');
  await page.locator('#hamburgerBtn').click();await page.locator('.sidebar-album-card').filter({hasText:runTag+' Alpha'}).click();
  await page.waitForFunction(id=>!TimelineState.isLoading&&CONFIG.CHILDREN[TimelineState.currentChildIndex].albumId===id,alpha.id);
  async function upload(which,individual){await page.locator('#uploadBtn').click();await page.locator('#albumSelect').selectOption(alpha.id);await page.locator('#fileInput').setInputFiles(which.map(a=>({name:a.name,mimeType:a.mimeType,buffer:a.buffer})));
   if(individual){await page.locator('#individualModeBtn').click();for(let i=0;i<which.length;i++)await page.locator('input[data-file-index="'+i+'"]').fill(runTag+' single'+i);}else await page.locator('#tagsInput').fill(runTag+' batch');
   await page.locator('#startUploadBtn').click();await page.waitForFunction(()=>!BackgroundUploader.isUploading);}
  await upload(assets.slice(0,2),false);await upload(assets.slice(2),true);
  await until(async()=>{const r=(await read('/api/uploads/status')).json.items;return r.length===4&&r.every(x=>x.status==='completed');},'Four normal-worker completions',50000);
  rows=(await read('/api/accounts/photos?album='+alpha.id)).json.photos.photo;assert.equal(rows.length,4);assert.equal(provider.creations.length,4);assert.equal(new Set(provider.creations.map(x=>x.id)).size,4);
  await goto('transfer.html');await page.waitForFunction(()=>document.querySelectorAll('.transfer-task[data-stage=completed]').length===4);return{receipts:4,creations:4,clientModes:['batch','individual'],APIPhotoDates:rows.map(({id,datetaken})=>({id,datetaken}))};
 });
 await group('02-to-03-album-and-07-viewer-originals',async()=>{
  await goto('timeline.html');await page.locator('.moment-album-link').first().waitFor();assert.equal(await page.locator('.moment-item').count(),1);await page.locator('.moment-album-link').first().click();await page.waitForURL('**/album.html?*');await page.locator('.album-photo-card').nth(3).waitFor();albumURL=page.url();
  assert.match(await page.locator('#momentInfo').innerText(),/3 張照片 · 1 部影片/);
  for(const a of assets){const row=rows.find(p=>p.title===a.name);assert(row);await page.locator('.album-photo-card[data-id="'+row.id+'"] img').click();await page.locator('#photoModal.active').waitFor();
   if(a.mimeType.startsWith('video/')){await page.waitForFunction(()=>document.querySelector('#modalVideo').readyState>=1);if(await page.locator('#modalVideo').evaluate(v=>v.paused))await page.locator('#modalVideo').press('Space');await page.waitForFunction(()=>document.querySelector('#modalVideo').currentTime>.1);report.playback=await page.locator('#modalVideo').evaluate(v=>({duration:v.duration,currentTime:v.currentTime,error:v.error?.code||null}));assert.equal(report.playback.error,null);}
   else await page.waitForFunction(()=>document.querySelector('#modalImage').naturalWidth>0);
   const pending=page.waitForEvent('download');await page.locator('#modalDownloadBtn').click();const d=await pending,bytes=fs.readFileSync(await d.path());assert.equal(sha(bytes),a.sha256);report.downloads.push({id:row.id,bytes:bytes.length,sha256:sha(bytes)});await page.keyboard.press('Escape');}
  return{albumOpen:true,photoDecodes:3,video:report.playback,originalDownloads:report.downloads};
 });
 await group('08-date-merger-with-explicit-ordinary-API-precondition',async()=>{
  // The product merges into an existing moment. Create that test precondition
  // through the ordinary authenticated API, never by changing SQL/journal state.
  const destination=rows.find(x=>x.title===assets[2].name),targetDate='2024-02-03';
  const setup=await page.evaluate(async({id,targetDate})=>TimehutAccounts.request('/api/photos/update-date',{method:'POST',body:{photoIds:[id],targetDate}}),{id:destination.id,targetDate});assert.equal(setup.successCount,1);
  const ids=assets.slice(0,2).map(a=>rows.find(x=>x.title===a.name).id);await select(ids);await page.locator('#batchMoveCollectionBtn').click();
  await page.locator('.collection-item[data-date="'+targetDate+'"]').first().click();await page.locator('#moveCollectionConfirmBtn').click();await page.locator('.timehut-dialog button[type=submit]').click();
  await until(async()=>{const photos=(await read('/api/accounts/photos?album='+alpha.id)).json.photos.photo;return ids.every(id=>photos.find(x=>x.id===id).datetaken.startsWith(targetDate));},'Date merge readback');
  for(const id of [...ids,destination.id])assert.equal(provider.remote.get(id).date,targetDate);
  return{APISetupOnly:{id:destination.id,targetDate},UIChangedIDs:ids,originalBytesUnchanged:true};
 });
 await group('08-batch-tags-and-virtual-album-membership',async()=>{
  const ids=rows.slice(0,2).map(x=>x.id);await select(ids);await page.locator('#batchTagBtn').click();await page.locator('.timehut-dialog input[name=tags]').fill(runTag+' edited');await page.locator('.timehut-dialog button[type=submit]').click();
  await until(async()=>ids.every(id=>provider.remote.get(id).tags.includes('edited'))&&await page.evaluate(()=>SelectionState.selectedPhotos.size===0),'Provider tag readback and cleared selection');
  await select(ids);await page.locator('#batchAlbumBtn').click();await page.locator('.timehut-dialog input[name=albumChoice][value="2"]').check();await page.locator('.timehut-dialog button[type=submit]').click();
  await until(async()=>Number((await read('/api/album/'+beta.id+'/photos')).json.photoset?.total)===2,'Target membership');return{ids,target:beta.id,providerCreatedAgain:false};
 });
 await group('02-03-B-owner-isolation',async()=>{
  await page.waitForLoadState('networkidle');const b=cb.pages()[0],start=provider.ledger.length;
  for(const row of rows){const response=await b.evaluate(async id=>{const r=await fetch('/api/photo/'+id+'/sizes',{credentials:'include'});return r.status;},row.id);assert.equal(response,404);}
  assert.equal((await read('/api/album/'+alpha.id+'/photos',b)).status,404);assert.equal(Number((await read('/api/accounts/photos',b)).json.photos.total),0);assert.equal(provider.ledger.length,start);
  return{deniedAIDs:rows.map(x=>x.id),BMediaTotal:0,providerReadForForeign:0};
 });
 await group('08-delete-four-and-old-album-reload',async()=>{
  for(const row of rows){const source=assets.find(a=>a.name===row.title),remote=provider.remote.get(row.id);assert(remote&&remote.private&&sha(remote.asset.buffer)===source.sha256);}
  await select(rows.map(x=>x.id));await page.locator('#deleteSelectedBtn').click();await page.locator('#confirmOkBtn').click();await until(async()=>provider.remote.size===0&&Number((await read('/api/accounts/photos')).json.photos.total)===0,'Four deletions');
  await page.goto(albumURL);await page.waitForFunction(()=>!document.querySelector('#loadingIndicator')||document.querySelector('#loadingIndicator').style.display==='none');await page.locator('#momentInfo').filter({hasText:'0 張照片 · 0 部影片'}).waitFor();assert.equal(await page.locator('.album-photo-card').count(),0);assert.equal(new URL(page.url()).searchParams.get('photos'),'');return{deleted:4,oldAlbumStaleCards:0,completedIDsPrunedFromURL:true};
 });
 await group('own-two-account-erasure-through-product-forms',async()=>{
  report.erasedAccounts=[];
  for(const p of [page,cb.pages()[0]]){
   await goto('account.html',p);await wait(7000);await p.locator('#account-deletion summary').click();await p.locator('#delete-account-form [name=password]').fill(password);await p.locator('#delete-account-form button').click();
   await until(async()=>/^[A-Za-z0-9_-]{43}$/.test(await p.locator('#deletion-status-form [name=receipt]').inputValue()),'Own erasure receipt');
   let terminal=false;
   for(let attempt=0;attempt<3&&!terminal;attempt++){
    await wait(7000);const pending=p.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname.startsWith('/api/accounts/deletion/'));await p.locator('#deletion-status-form button').click();const response=await pending;assert.equal(response.status(),200,'Respect actual shared auth rate limit');
    const result=await response.json();terminal=result.status==='complete'&&result.remoteErasureComplete===true&&result.dataErasureComplete===true;
   }
   assert(terminal,'Own terminal erasure is not verified');await p.locator('#deletion-status-message').filter({hasText:'照片移除與帳戶清除已完成'}).waitFor();report.erasedAccounts.push({role:p===page?'A':'B',status:'complete',dataErasureComplete:true,remoteErasureComplete:true});
  }
  return{accounts:2,completedInActualStatusForm:true,receiptCapabilitiesNotRecorded:true};
 });
 assert.equal(provider.creations.length,4);assert.equal(provider.remote.size,0);assert.deepEqual(report.errors,[]);assert(!provider.ledger.some(x=>x.error));
 report.status='PASS_LOCAL_PRODUCT_JOURNEY_FULL_NORMAL_WORKER';report.providerCreations=provider.creations;
 }catch(e){report.error=e.stack;process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png'),fullPage:true,mask:[page.locator('#deletion-status-form [name=receipt]')]}).catch(()=>{});}finally{
 await browser?.close();if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
 for(const s of sockets)s.destroy();for(const s of [tls,provider.server])if(s?.listening)await new Promise(r=>s.close(r));
 report.provider=provider.ledger;report.remainingSyntheticMedia=provider.remote.size;report.providerCreations=provider.creations;
 fs.writeFileSync(path.join(out,'server.log'),log);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,groups:report.checks.length,error:report.error,output:out}));
 }}main();
