/* Current public account UI capture. All business data/results are synthetic.
 * Writes: this harness and its selected QA evidence directory only
 * (execution/temp/new public site stay on SSD). No credentials/config.js read.
 * Usage: node tools/test_current_six_page_states.cjs --phase final --source-version VERSION
 * Optional: --boards 02,03,05,06,07,08 --viewports D,M --smoke
 * Every invocation builds a new allowlisted site. Failures are retained, not waived.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('/Users/hank/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fs.realpathSync(path.resolve(__dirname,'..'));
assert.equal(root,'/Volumes/AiHankAppsData/Timehut','Canonical source required');
const args=process.argv.slice(2),option=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
const phase=option('phase','dryrun'),notifiedVersion=option('source-version',null),smoke=args.includes('--smoke');
const updateNoticeDelta=args.includes('--update-notice-05-delta');
const baselinePath=option('baseline-report',null),caseFilter=option('case-filter',null),compactDelta=args.includes('--compact-delta');
let baseline;
assert(['dryrun','final'].includes(phase));if(phase==='final')assert(notifiedVersion,'Main-notified source version is required for final');
const boards=updateNoticeDelta?[]:option('boards','02,03,05,06,07,08').split(','),viewportNames=option('viewports','D,M').split(',');
assert(boards.every(x=>['02','03','05','06','07','08'].includes(x)));assert(viewportNames.every(x=>['D','M'].includes(x)),'Compact only for a separately documented new defect');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),readJSON=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const qa=path.join(root,updateNoticeDelta?'.codex-local/qa/20261017-update-notice-05-capture':'.codex-local/qa/20261017-six-page-state-capture');fs.mkdirSync(qa,{recursive:true});
const builds='/Users/hank/.local/share/project-storage/internal/builds';
const report={status:'RUNNING',phase,notifiedVersion,startedAt:new Date().toISOString(),canonicalRoot:root,boards,viewportNames,smoke,
 scope:'Actual current HTML/CSS/handlers; mocked account API and per-ID receipts only',scored:false,formalAcceptance:false,formalAdded:0,
 headless:true,osGUI:false,osKeyboardMouseFocusCalls:0,devicesVerified:false,nativePopupVerified:false,keyboardVerified:false,actualFlickrVerified:false,
 remoteForwarded:0,apiForwarded:0,privateConfigRead:false,credentialsRead:false,privateDatabaseRead:false,productDOMOrCSSPatched:false,productStateInjected:false,
 fontPolicy:'All remote font requests intercepted. Google font CSS fulfilled empty; fallback fonts are NOT equivalent to original-font rendering.',
 limitations:['No device/native/background/OS keyboard or real Flickr verification.','Native date popup is NOTCOVERED; HTML date input fill only.','Mock receipts do not establish functional formal pass or live E2E.','No visual/functional scores assigned.'],
 cases:[],captures:[],requests:[],apiCalls:[],externalIntercepted:[],unexpectedRoutes:[],routeErrors:[],runtimeErrors:[],dialogs:[],findings:[],notCovered:[]};
let workspace,out,site,artifact,browser,server,origin,siteManifest,staticBytes,rootBefore;
const save=()=>{if(out)fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');};
const digestFiles=(base,names)=>Object.fromEntries(names.map(rel=>{assert(rel!=='js/config.js'&&!rel.includes('..')&&!path.isAbsolute(rel));const b=fs.readFileSync(path.join(base,rel));return [rel,{bytes:b.length,sha256:sha(b)}];}));
const flatten=(base,dir='')=>fs.readdirSync(path.join(base,dir),{withFileTypes:true}).flatMap(e=>{assert(!e.isSymbolicLink(),'No symlink in public snapshot');const rel=path.posix.join(dir,e.name);return e.isDirectory()?flatten(base,rel):[rel];}).sort();
function finding(row,kind,detail){report.findings.push({case:row.id,viewport:row.viewport,kind,...detail});save();}
function gate(){let release;const promise=new Promise(r=>release=r);return {promise,release};}
const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const albumIDs=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
const selectedIDs=['900000000201','900000000202','900000000203'],videoID='900000000203';
const actor={id:'synthetic-six-owner',username:'synthetic-six',displayName:'人工示例使用者'};
function seed(){
 const children=[{name:'人工相簿甲',birthDate:'2019-11-11',albumId:albumIDs[0]},{name:'人工相簿乙',birthDate:'2021-01-01',albumId:albumIDs[1]}];
 const dates=['2026-10-10','2026-10-10','2026-10-10',...Array.from({length:16},(_,i)=>`${2026-Math.floor(i/4)}-${String(9-i%4).padStart(2,'0')}-01`)];
 const photos=dates.map((date,i)=>{const id=String(900000000201+i);return {id,title:i<3?'人工生日相集':'人工成長記錄 '+i,description:{_content:'Synthetic only; no family media'},tags:'人工 回憶 家庭 uploader:'+actor.displayName,datetaken:date+' 12:00:00',dateupload:String(1791590400-i*300),media:id===videoID?'video':'photo',videoPlayback:origin+'/api/photo/'+id+'/video?purpose=playback',videoOriginal:origin+'/api/photo/'+id+'/video?purpose=original',...Object.fromEntries(['sq','s','m','l','o'].map(k=>['url_'+k,origin+'/api/photo/'+id+'/image?size='+k]))};});
 return {children,photos,members:new Map([[albumIDs[0],new Set(photos.map(p=>p.id))],[albumIDs[1],new Set(photos.slice(3,5).map(p=>p.id))]]),archived:[{id:albumIDs[2],title:'人工已封存相簿',birthDate:'2020-01-01',archivedAt:1792000000000}],mediaMode:'normal',settingsFailure:false,auth:true,videoFailure:false,receiptScenario:'success',attempts:new Map(),holds:[],mutationHold:null,uploadHold:null,uploadMode:'completed',admissions:new Map(),uploadCount:0};
}
async function preflight(){
 report.storageCheck=execFileSync('python3',[path.join(root,'tools/check_storage.py')],{encoding:'utf8'}).trim();
 // Public site <=20 MB, warm browser/temp <=350 MB, <=250 PNG <=200 MB plus margin, independent 20 GiB system reserve.
 report.spaceBudget={additionalGiB:1,reason:'Fresh public site, headless browser temp, bounded captures and margin',systemReserveGiB:20};
 report.spaceCheck=JSON.parse(execFileSync('/Users/hank/.local/bin/project-storage',['check','--required-gib','1'],{encoding:'utf8'}));
 workspace=fs.mkdtempSync(path.join(builds,'timehut-six-page-20261017-'));out=path.join(workspace,'evidence');site=path.join(workspace,'site');fs.mkdirSync(out);
 fs.copyFileSync(path.join(root,'AGENTS.md'),path.join(workspace,'AGENTS.md'));
 process.env.TMPDIR=path.join(workspace,'browser-temp');fs.mkdirSync(process.env.TMPDIR);
 report.workspace=workspace;report.publicSite=site;report.agentsWorkspaceRoot={path:path.join(workspace,'AGENTS.md'),sha256:sha(fs.readFileSync(path.join(root,'AGENTS.md'))),inPublicSite:false};
 report.buildCommand={program:'python3',arguments:['tools/build_public_app.py',site]};
 report.buildOutput=execFileSync('python3',[path.join(root,'tools/build_public_app.py'),site],{cwd:workspace,encoding:'utf8'}).trim();
 siteManifest=readJSON(path.join(workspace,'site-source.json'));assert.equal(siteManifest.sourceRoot,root);assert.equal(siteManifest.privateConfigCopied,false);assert(!fs.existsSync(path.join(site,'js/config.js')));
 const files=flatten(site);assert.deepEqual(files,Object.keys(siteManifest.files).sort());
 rootBefore=digestFiles(root,files);const snapshot=digestFiles(site,files);
 for(const rel of files){assert.equal(snapshot[rel].sha256,siteManifest.files[rel].sha256);if(!siteManifest.files[rel].generatedPublicOnly)assert.deepEqual(snapshot[rel],rootBefore[rel],rel+' root mismatch before run');}
 staticBytes=new Map(files.map(rel=>[rel,fs.readFileSync(path.join(site,rel))]));
 const versionBytes=staticBytes.get('js/version.js').toString();report.version={bytes:versionBytes,sha256:sha(versionBytes),hardcodedAPK94:false};
 if(baselinePath){baseline=readJSON(baselinePath);assert(baseline.binding.rootStable&&baseline.binding.snapshotStable&&baseline.binding.inputsStable);assert.deepEqual(rootBefore,baseline.binding.rootPre,'Baseline product bytes must exactly match this fresh site');report.baseline={path:baselinePath,sha256:sha(fs.readFileSync(baselinePath)),policy:'Reuse only completed synthetic UI cases on byte-identical product sources; failed cases are retried and old failures retained.'};report.reusedCases=[];}
 if(notifiedVersion)assert(versionBytes.includes("version:'"+notifiedVersion+"'"),'Notified version does not match current bytes');
 const names=['tools/build_public_app.py','tools/public_media_guard.py','tools/installer_release.py','docs/uiux-acceptance.json','AGENTS.md','tools/test_current_six_page_states.cjs'];
 report.binding={rootPre:rootBefore,snapshotPre:snapshot,inputsPre:digestFiles(root,names),gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),gitStatus:execFileSync('git',['status','--porcelain=v1'],{cwd:root,encoding:'utf8'}),buildManifestSha256:sha(fs.readFileSync(path.join(workspace,'site-source.json')))};
 fs.writeFileSync(path.join(out,'source-pre.json'),JSON.stringify(report.binding,null,2));fs.copyFileSync(__filename,path.join(out,'executed-harness.cjs'));fs.copyFileSync(path.join(workspace,'site-source.json'),path.join(out,'site-source.json'));
 const rubric=readJSON(path.join(root,'docs/uiux-acceptance.json'));report.rubric={path:'docs/uiux-acceptance.json',sha256:report.binding.inputsPre['docs/uiux-acceptance.json'].sha256,unchanged:true,originalBoards:(rubric.boards||rubric.pages||[]).map(x=>x.board),authorScored:false};
 // Loopback-only static server proves the safe payload served bytes. Application uses an intercepted virtual HTTPS origin because its actual account adapter binds origin to backend.
 server=http.createServer((req,res)=>{let rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).slice(1);if(!rel)rel='timeline.html';const b=staticBytes.get(rel);if(!b){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':mime[path.extname(rel)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));report.loopbackOrigin='http://127.0.0.1:'+server.address().port;
 report.servedManifest={};for(const [rel,b]of staticBytes){const response=await fetch(report.loopbackOrigin+'/'+rel);const received=Buffer.from(await response.arrayBuffer());assert.equal(response.status,200);assert(received.equals(b));report.servedManifest[rel]={bytes:received.length,sha256:sha(received)};}
 fs.writeFileSync(path.join(out,'served-manifest.json'),JSON.stringify(report.servedManifest,null,2));
 origin='https://just-healing-production.up.railway.app';report.virtualOrigin={origin,policy:'Every browser request is fulfilled/aborted locally. The production hostname is a synthetic URL namespace; zero connections forwarded.'};
 report.fixture={account:actor,albums:albumIDs,selectedIDs,videoID,sourceDates:'Three same-day IDs, sixteen other dates across four age groups',media:'Public storybook PNG bytes + existing original synthetic 2-second MP4; no family assets',businessReceipts:'Explicit mocks'};
 save();
}
async function fixtureRoute(route,state,row){
 const req=route.request(),u=new URL(req.url()),method=req.method(),tag={case:row.id,viewport:row.viewport};
 const log={...tag,method,path:u.pathname,query:u.search,host:u.hostname,forwarded:false};report.requests.push(log);
 const json=(data,status=200)=>{log.responseStatus=status;log.responseMock=true;return route.fulfill({status,json:data,headers:{'X-Timehut-Account':actor.id,'Cache-Control':'no-store'}});};
 try{
  if(u.origin!==origin){report.externalIntercepted.push(log);if(u.hostname==='fonts.googleapis.com'&&method==='GET')return route.fulfill({contentType:'text/css',body:'/* Offline fallback fonts. Not original-font equivalence. */'});return route.abort();}
  if(updateNoticeDelta&&method==='GET'&&u.pathname==='/app/releases.json'){
   const catalog={schema:1,releases:[{channel:'web',platform:'web',available:true,version:'2026.10.15-web.1',versionCode:1,notes:'人工版本資料：僅供本機排版驗證，沒有正式發布或更新作業。',verifiedAt:'2026-10-17T00:00:00Z',url:origin+'/app/index.html'}]};
   log.catalogFixture=true;log.fixturePayload=state.catalogFailure?{error:'Synthetic catalog unavailable'}:catalog;
   row.catalogRequestIndices??=[];row.catalogRequestIndices.push(report.requests.length-1);
   return json(log.fixturePayload,state.catalogFailure?503:200);
  }
  if(u.pathname.startsWith('/app/')){assert.equal(method,'GET');const rel=decodeURIComponent(u.pathname.slice(5));assert(rel!=='js/config.js');const b=staticBytes.get(rel);if(b){log.staticSha256=sha(b);return route.fulfill({body:b,contentType:mime[path.extname(rel)]||'application/octet-stream'});}}
  if(u.pathname.startsWith('/api/')||u.pathname==='/health'){report.apiCalls.push(log);row.apiCallIndices.push(report.apiCalls.length-1);}
  if(method==='GET'){
   const children=state.children,albums=children.map(c=>({id:c.albumId,title:c.name,birthDate:c.birthDate}));
   if(u.pathname==='/api/accounts/me')return json({user:actor,legacyOwner:false,albums,expiresAt:Date.now()+86400000});
   if(u.pathname==='/api/accounts/context')return json({user:actor,legacyOwner:false,children,albumPagination:{page:1,pages:1,total:children.length}});
   if(u.pathname==='/api/accounts/albums/archived'){if(state.archivedFailure)return json({error:'Synthetic archive list unavailable'},503);return json({albums:state.archived,total:state.archived.length,page:1,pages:1});}
   if(['/api/accounts/albums','/api/albums'].includes(u.pathname))return json({albums,total:albums.length,page:1,pages:1});
   if(/^\/api\/album\/[^/]+\/photos$/.test(u.pathname)||u.pathname==='/api/accounts/photos'){
    if(state.mediaMode==='loading'){const g=gate();state.holds.push(g);await g.promise;}
    if(state.mediaMode==='error')return json({error:'人工載入失敗，請重試'},503);
    const id=u.pathname.split('/')[3],items=state.mediaMode==='empty'?[]:state.photos.filter(p=>u.pathname==='/api/accounts/photos'||state.members.get(id)?.has(p.id));
    if(u.pathname==='/api/accounts/photos')return json({stat:'ok',photos:{photo:items,total:items.length,page:1,pages:1}});
    return json({stat:'ok',photoset:{photo:items,total:items.length,page:1,pages:1}});
   }
   if(u.pathname==='/api/auth/status')return json({authenticated:state.auth});
   if(u.pathname==='/api/accounts/notification-settings')return json({enabled:true,channel:'in-app'});
   if(u.pathname==='/api/accounts/notifications')return json({notifications:[]});
   if(['/api/accounts/feedback','/api/accounts/feedback/inbox'].includes(u.pathname))return json({reports:[],total:0,page:1,pages:1});
   if(u.pathname==='/api/uploads/status'){log.receiptItems=state.queueItems||[];return json({items:state.queueItems||[],total:state.queueItems?.length||0,pending:0,uploading:0,isProcessing:false});}
   if(u.pathname.startsWith('/api/uploads/status/'))return json({status:state.uploadMode==='accepted'?'processing':'completed',flickrPhotoId:'900000009999',retryBlocked:false});
   if(u.pathname.startsWith('/api/uploads/admission/'))return json(state.admissions.get(u.pathname.split('/').at(-1))||{admissionStatus:'not_found'});
   if(['/api/version','/health'].includes(u.pathname))return json({status:'ok',version:'synthetic-backend-only',build:'fixture-not-live',authenticated:true});
   if(/^\/api\/photo\/\d+\/image$/.test(u.pathname)){if(u.searchParams.get('size')==='o'&&state.downloadFailures?.has(u.pathname.split('/')[3]))return json({error:'Synthetic original image unavailable'},503);const n=Number(u.pathname.split('/')[3])%3;return route.fulfill({contentType:'image/png',body:staticBytes.get(['assets/storybook-boy.png','assets/storybook-girl.png','assets/storybook-family.png'][n])});}
   if(/^\/api\/photo\/\d+\/video$/.test(u.pathname)){if(u.searchParams.get('purpose')==='original'&&state.downloadFailures?.has(u.pathname.split('/')[3]))return json({error:'Synthetic original video unavailable'},503);if(state.videoFailure)return route.fulfill({status:503,contentType:'video/mp4',body:''});const bytes=fs.readFileSync('/Users/hank/.local/share/project-storage/internal/builds/timehut-download-fixtures-20261011/artificial-video.mp4');return route.fulfill({contentType:'video/mp4',body:bytes,headers:{'Accept-Ranges':'bytes'}});}
  }
  if(method==='PUT'&&u.pathname==='/api/accounts/albums/dates'){
   const input=req.postDataJSON();log.input=input;if(state.settingsFailure)return json({error:'人工：設定儲存失敗'},503);
   for(const update of input.updates){const child=state.children.find(c=>c.albumId===update.id);assert(child);child.birthDate=update.birthDate;}return json({albums:state.children.map(c=>({id:c.albumId,title:c.name,birthDate:c.birthDate}))});
  }
  if(method==='POST'&&/^\/api\/accounts\/albums\/[^/]+\/restore$/.test(u.pathname)){
   const id=u.pathname.split('/')[4],a=state.archived.find(x=>x.id===id);assert(a);state.archived=state.archived.filter(x=>x.id!==id);state.children.push({albumId:a.id,name:a.title,birthDate:a.birthDate});log.input={};return json({status:'restored',photosDeleted:false,album:{id}});
  }
  if(method==='PUT'&&/^\/api\/photo\/\d+\/tags$/.test(u.pathname)){
   log.input=req.postDataJSON();if(state.settingsFailure)return json({error:'人工：標籤儲存失敗'},503);const p=state.photos.find(p=>p.id===u.pathname.split('/')[3]);assert(p);p.tags=log.input.tags;return json({success:true,tags:p.tags});
  }
  if(method==='POST'&&u.pathname==='/api/upload'){
   // Synthetic multipart only. Keep field names/IDs; never serialize file bodies.
   const text=req.postDataBuffer().toString('utf8'),field=name=>text.match(new RegExp('name="'+name+'"\\r\\n\\r\\n([^\\r]*)'))?.[1];
   const uploadId=field('clientUploadId'),album=field('albumId');assert(/^web_[a-f0-9]{64}$/.test(uploadId));assert.equal(album,albumIDs[0]);
   state.uploadCount++;log.input={clientUploadId:uploadId,albumId:album,filename:text.match(/filename="([^"]*)"/)?.[1],tags:field('tags'),bodyBytes:req.postDataBuffer().length};
   if(state.uploadHold)await state.uploadHold.promise;
   if(state.uploadMode==='failure'||state.uploadMode==='partial'&&state.uploadCount===2){state.admissions.set(uploadId,{admissionStatus:'not_accepted'});return json({error:'人工第二檔失敗'},503);}
   const localId='local_six_'+state.uploadCount,staged=state.uploadMode==='accepted';state.admissions.set(uploadId,{admissionStatus:staged?'accepted':'completed',localId,status:staged?'processing':'completed',flickrPhotoId:staged?undefined:'900000009999'});
   return json({_staged:staged,results:[{success:true,localId,photoId:staged?undefined:'900000009999',_staged:staged}]});
  }
  const mutation=method==='POST'&&(/^\/api\/photos\/(tags\/add|update-date|delete)$/.test(u.pathname)||/^\/api\/album\/[^/]+\/(add_photos|remove_photos)$/.test(u.pathname));
  if(mutation){
   const input=req.postDataJSON();assert(Array.isArray(input.photoIds)&&input.photoIds.length);assert(input.photoIds.every(x=>selectedIDs.includes(x)),'Exact synthetic selection ID boundary');log.input=input;
   const attempt=(state.attempts.get(u.pathname)||0)+1;state.attempts.set(u.pathname,attempt);
   const partial=state.receiptScenario==='partial'&&attempt===1,fail=state.receiptScenario==='failure';
   const results=input.photoIds.map(photoId=>{const success=!fail&&(!partial||photoId===selectedIDs[0]);return {photoId,success,...(!success?{error:'Synthetic per-ID failure'}:{})};});
   // Move-album partial is applied to source removal, after destination membership succeeds.
   if(u.pathname.endsWith('/add_photos')&&row.operation==='move')results.forEach(r=>r.success=state.destinationFailure?state.destinationFailure==='partial'&&r.photoId===selectedIDs[0]:true);
   log.receipt={results,mock:true};if(state.mutationHold){log.waitingAtCapture=true;await state.mutationHold.promise;}
   for(const r of results.filter(r=>r.success)){
    const p=state.photos.find(p=>p.id===r.photoId);if(u.pathname.endsWith('/update-date'))p.datetaken=input.targetDate;
    if(u.pathname.endsWith('/tags/add'))p.tags+=' '+input.tags;
    if(u.pathname.endsWith('/delete')){state.photos=state.photos.filter(p=>p.id!==r.photoId);for(const m of state.members.values())m.delete(r.photoId);}
    const id=u.pathname.split('/')[3];if(u.pathname.endsWith('/add_photos'))state.members.get(id).add(r.photoId);if(u.pathname.endsWith('/remove_photos'))state.members.get(id).delete(r.photoId);
   }
   return json({success:results.every(r=>r.success),results,message:'人工逐 ID 收據（非 Flickr）'});
  }
  report.unexpectedRoutes.push(log);return json({error:'Synthetic route not implemented'},404);
 }catch(error){report.routeErrors.push({...tag,path:u.pathname,message:error.stack});await route.abort().catch(()=>{});}
}
async function runCase(viewportName,id,fn,meta={}){
 if(caseFilter&&!new RegExp(caseFilter).test(id))return;
 const prior=baseline?.cases.find(c=>c.id===id&&c.viewport===viewportName&&c.status==='PASS_SYNTHETIC_UI');if(prior){report.reusedCases.push({id,viewport:viewportName,sourceReport:baselinePath,observations:prior.observations.length,status:prior.status});save();return;}
 const viewport=viewportName==='D'?{width:1440,height:1000}:viewportName==='C'?{width:320,height:740}:{width:390,height:844};
 const row={id,viewport:viewportName,...meta,status:'RUNNING',actions:[],apiCallIndices:[],observations:[]};report.cases.push(row);save();
 const state=seed(),context=await browser.newContext({viewport,timezoneId:'Asia/Taipei',serviceWorkers:'block',reducedMotion:'reduce'});let page;
 await context.route('**/*',route=>fixtureRoute(route,state,row));
 try{
  page=await context.newPage();page.setDefaultTimeout(6500);page.on('pageerror',e=>report.runtimeErrors.push({case:id,viewport:viewportName,message:e.stack}));
  page.on('dialog',async d=>{report.dialogs.push({case:id,viewport:viewportName,type:d.type(),message:d.message(),nativeVisualVerified:false});await d.dismiss();});
  const act=async(selector,method='click',value)=>{row.actions.push({selector,method,...(value===undefined?{}:{value:method==='setInputFiles'?value.map(v=>({name:v.name,mimeType:v.mimeType,bytes:v.buffer.length})):value})});return page.locator(selector)[method](value);};
  const snap=async(name,opts={})=>{
   await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(opts.transient?10:100);
   const data=await page.evaluate(()=>{
    const visible=e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return b.width>0&&b.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
    const rect=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,inViewport:b.left>=-1&&b.top>=-1&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1};};
    const dialogs=[...document.querySelectorAll('.timehut-dialog,#moveCollectionModal:not(.hidden),#confirmModal:not(.hidden),#tagModal:not(.hidden),#uploadModal.active,#photoModal.active')].filter(visible);
    const state={width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,scrollY,route:location.pathname+location.search,
     photoSelectedIDs:[...document.querySelectorAll('.timeline-photo-select[aria-pressed="true"]')].map(e=>e.closest('[data-photo-id]').dataset.photoId),
     albumSelectedIDs:[...document.querySelectorAll('.album-photo-card.selected')].map(e=>e.dataset.id),
     momentSelectedIDs:[...document.querySelectorAll('.moment-item.selected')].map(e=>e.dataset.momentId),
     selectedCount:document.getElementById('selectedCount')?.textContent,selectedMomentCount:document.getElementById('selectedMomentCount')?.textContent,
     dialogActions:dialogs.flatMap(d=>[...d.querySelectorAll('.modal-actions button,.confirm-actions button,.queue-actions button,.modal-close,.save-tags-btn,#modalDownloadBtn')].filter(visible).map(e=>({text:e.textContent.trim(),id:e.id,disabled:e.disabled,...rect(e)}))),
     visibleButtons:[...document.querySelectorAll('button')].filter(visible).map(e=>({id:e.id,text:e.textContent.trim().slice(0,160),disabled:e.disabled,...rect(e)})),
     status:[...document.querySelectorAll('[role="status"],.toast,#globalStatusText,#globalPercentText,#momentInfo')].filter(visible).map(e=>({id:e.id,text:e.textContent.trim()})),
     collectionRows:[...document.querySelectorAll('.collection-item')].map(e=>({date:e.dataset.date,text:e.textContent.trim(),...rect(e)})),
     filmstrip:{count:document.querySelectorAll('.filmstrip,[class*="filmstrip"]').length},
     video:(()=>{const v=document.getElementById('modalVideo');return v?{paused:v.paused,currentTime:v.currentTime,readyState:v.readyState,error:v.error?.code,controls:v.controls,visible:visible(v)}:null;})()};return state;
   });
   if(row.traceOnly){row.observations.push({name,...data,traceOnly:true});save();return data;}
   const filename=viewportName+'-'+id+'-'+name+'.png',file=path.join(out,filename),bytes=await page.screenshot({path:file,fullPage:!!opts.fullPage});
   const capture={case:id,viewport:viewportName,name,path:filename,bytes:bytes.length,sha256:sha(bytes),data};report.captures.push(capture);row.observations.push({name,...data});
   if(data.scrollWidth>data.width+1||data.bodyWidth>data.width+1)finding(row,'HORIZONTAL_OVERFLOW',{capture:filename,width:data.width,scrollWidth:data.scrollWidth,bodyWidth:data.bodyWidth});
   for(const action of data.dialogActions)if(!action.inViewport)finding(row,'DIALOG_ACTION_OUTSIDE_VIEWPORT',{capture:filename,action});
   save();return data;
  };
  const timeline=async()=>{await page.goto(origin+'/app/timeline.html');await page.locator('.moment-item').first().waitFor();};
  const selected=()=>page.evaluate(()=>({photo:typeof SelectionState!=='undefined'?[...SelectionState.selectedPhotos]:[],moment:typeof MomentSelectionState!=='undefined'?[...MomentSelectionState.selectedMoments.values()].flatMap(m=>m.photos.map(p=>String(p.id))):[],album:typeof AlbumState!=='undefined'?[...AlbumState.selectedPhotos]:[]}));
  await fn({page,state,row,act,snap,timeline,selected});row.status='PASS_SYNTHETIC_UI';
 }catch(error){row.status='FAILED';row.error=error.stack;const file=viewportName+'-'+id+'-FAILED.png';if(page){row.failureDOM=await page.evaluate(()=>({route:location.pathname+location.search,text:document.body.innerText.slice(-18000),dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>e.innerText)})).catch(()=>null);}
  if(page)await page.screenshot({path:path.join(out,file)}).then(b=>{report.captures.push({case:id,viewport:viewportName,name:'FAILED',path:file,sha256:sha(b),bytes:b.length});}).catch(()=>{});}
 finally{state.mutationHold?.release();state.uploadHold?.release();state.holds.forEach(g=>g.release());await context.close();save();console.log(JSON.stringify({viewport:viewportName,id,status:row.status,error:row.error?.split('\n')[0]}));}
}
async function selectUI(t,mode){
 if(mode==='album'){await t.page.goto(origin+'/app/album.html?id=moment_'+selectedIDs[0]+'&album='+albumIDs[0]+'&date=2026-10-10&child=0');await t.page.locator('.album-photo-card').first().waitFor();await t.act('#headerSelectBtn');for(const id of selectedIDs)await t.act('.album-photo-card[data-id="'+id+'"] img');}
 else{await t.timeline();if(mode==='photo'){await t.act('#selectModeBtn');for(const id of selectedIDs)await t.act('.moment-photo-container[data-photo-id="'+id+'"] .timeline-photo-select');}else{await t.act('#batchMomentBtn');await t.act('.moment-item[data-moment-id="moment_'+selectedIDs[0]+'"] .moment-header');}}
 const s=await t.selected();assert.deepEqual([...s[mode]].sort(),selectedIDs,'UI selection must be source-bound exact fixture IDs');
}
function actionButton(mode,operation){return ({album:{tags:'#tagSelectedBtn',add:'#batchAlbumBtn',date:'#batchMoveCollectionBtn',delete:'#deleteSelectedBtn'},photo:{tags:'#batchTagBtn',add:'#batchAlbumBtn',date:'#batchMoveCollectionBtn',delete:'#deleteSelectedBtn'},moment:{tags:'#momentBatchTagBtn',move:'#momentMoveAlbumBtn',date:'#momentMoveCollectionBtn',delete:'#momentDeleteBtn'}})[mode][operation];}
async function openAction(t,mode,operation,capture){
 const {page,act,snap}=t;
 if(operation==='date'&&await page.locator('#moveCollectionModal').isVisible()){await act('#moveCollectionConfirmBtn');}
 else{
  await act(actionButton(mode,operation));
  if(operation==='tags'&&mode==='album'){await page.locator('#tagModal:not(.hidden)').waitFor();await act('#tagInput','fill','人工新增標籤');if(capture)await snap('tag-dialog');return '#tagConfirmBtn';}
  if(operation==='tags'){await act('.timehut-dialog input[name="tags"]','fill','人工新增標籤');if(capture)await snap('tag-dialog');return '.timehut-dialog button[type="submit"]';}
  if(['add','move'].includes(operation)){await page.locator('.timehut-dialog').waitFor();await act('.timehut-dialog input[type="radio"][value="2"]','check');if(capture)await snap('album-dialog');if(operation==='move'){await act('.timehut-dialog button[type="submit"]');await page.locator('.timehut-dialog').waitFor();if(capture)await snap('move-confirm');}return '.timehut-dialog button[type="submit"]';}
  if(operation==='date'){
   await page.locator('.collection-item').first().waitFor();const target=page.locator('.collection-item').last();await target.scrollIntoViewIfNeeded();await target.click();if(capture)await snap('last-date-scroll-footer');await act('#moveCollectionConfirmBtn');
  }
  if(operation==='delete'&&mode!=='moment'){await page.locator('#confirmModal:not(.hidden)').waitFor();if(capture)await snap('delete-dialog');return '#confirmOkBtn';}
 }
 await page.locator('.timehut-dialog').waitFor();if(capture)await snap(operation+'-confirmation');return '.timehut-dialog button[type="submit"]';
}
async function mutationCase(v,mode,operation,scenario){
 await runCase(v,(mode==='album'?'03':'08')+'-'+mode+'-'+operation+'-'+scenario,async t=>{
  const {state,page,row,act,snap,selected}=t;state.receiptScenario=scenario;await selectUI(t,mode);
  if(scenario==='partial'){const beforeCancel=report.apiCalls.length;await openAction(t,mode,operation,false);
   if(operation==='tags'&&mode==='album')await act('#tagModal .confirm-actions button[type=button],#tagModal .confirm-actions .btn-secondary');
   else if(operation==='delete'&&mode!=='moment')await act('#confirmCancelBtn');
   else {await act('.timehut-dialog .modal-actions button[type=button]');if(operation==='date')await page.locator('#moveCollectionModal .confirm-actions button').first().click();}
   assert.equal(report.apiCalls.slice(beforeCancel).filter(c=>c.input?.photoIds).length,0,'Cancel cannot send business mutation');assert.deepEqual((await selected())[mode],selectedIDs,'Cancel retains exact selection');row.cancelVerified=true;
  }
  if(operation==='tags'&&scenario==='partial')await snap('source-selection');
  state.mutationHold=gate();const submit=await openAction(t,mode,operation,scenario==='partial');
  const start=report.apiCalls.length;await act(submit);await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>/處理中|正在刪除/.test(e.textContent))||document.getElementById('globalUploadBar')?.classList.contains('visible'));
  // Route has recorded request before releasing receipt. UI cannot claim result before mock reply.
  for(let i=0;i<80&&!report.apiCalls.slice(start).some(c=>c.input?.photoIds);i++)await page.waitForTimeout(25);
  const first=report.apiCalls.slice(start).find(c=>c.input?.photoIds);assert(first,'Actual handler must issue API request');assert.deepEqual([...first.input.photoIds].sort(),selectedIDs);
  if(scenario==='partial'&&['tags','date','move'].includes(operation))await snap('processing',{transient:true});
  state.mutationHold.release();state.mutationHold=null;
  await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='處理中...'));await page.waitForTimeout(50);
  let selection=await selected();row.selectionAfterFirst=selection;
  // Read product state only, never invoke handlers or assign its values.
  const expected=scenario==='success'?[]:scenario==='failure'?selectedIDs:selectedIDs.slice(1);
  assert.deepEqual([...selection[mode]].sort(),expected,'Only failed IDs may remain selected');
  await snap(scenario==='partial'?'partial-per-id':scenario==='failure'?'total-failure':'per-id-success',{transient:operation==='delete'});
  if(scenario==='partial'){
   const before=report.apiCalls.length;
   let retrySubmit;if(operation==='tags'&&mode==='album')retrySubmit='#tagConfirmBtn';else retrySubmit=await openAction(t,mode,operation,false);
   await act(retrySubmit);await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='處理中...'));await page.waitForTimeout(60);
   const retryCalls=report.apiCalls.slice(before).filter(c=>c.input?.photoIds);assert(retryCalls.length,'Actual retry request required');for(const call of retryCalls)assert.deepEqual([...call.input.photoIds].sort(),selectedIDs.slice(1),'Retry excludes confirmed successes');
   selection=await selected();row.selectionAfterRetry=selection;assert.deepEqual(selection[mode],[]);await snap('retry-success-cleared',{transient:operation==='delete'});
  }
 },{mode,operation,scenario,traceOnly:scenario!=='partial'&&operation!=='tags'});
}
async function board02(v){
 await runCase(v,'02-current-states',async t=>{
  await t.timeline();await t.snap('loaded-multiage');await t.act('#timeTravelBtn');assert((await t.page.locator('.time-travel-item').count())>=3);await t.snap('time-travel');await t.page.locator('.time-travel-item').last().click();await t.page.waitForTimeout(350);await t.snap('age-destination');
  t.state.mediaMode='empty';await t.page.reload();await t.page.locator('#emptyState').waitFor({state:'visible'});await t.snap('loaded-empty');
  t.state.mediaMode='error';await t.page.reload();await t.page.getByRole('button',{name:'重試',exact:true}).waitFor({state:'visible'});await t.snap('error');t.state.mediaMode='normal';await t.page.getByRole('button',{name:'重試',exact:true}).click();await t.page.locator('.moment-item').first().waitFor();await t.snap('retry-loaded');
  t.state.mediaMode='loading';await t.page.reload({waitUntil:'domcontentloaded'});await t.page.locator('#loadingIndicator').waitFor({state:'visible'});await t.snap('loading');t.state.mediaMode='normal';t.state.holds.forEach(g=>g.release());await t.page.locator('.moment-item').first().waitFor();
 });
}
async function resets(v,mode){
 await runCase(v,(mode==='album'?'03':'08')+'-'+mode+'-reset-cancel-empty',async t=>{
  await selectUI(t,mode);const cancel=mode==='album'?'#cancelBtn':mode==='photo'?'#cancelSelectBtn':'#cancelMomentSelectBtn';
  await t.act(cancel);assert.deepEqual((await t.selected())[mode],[]);await t.snap('cancel-cleared');
  if(mode!=='album'){
   await selectUI(t,mode);if(v==='M'){await t.act('#hamburgerBtn');await t.page.locator('.sidebar-album-card').nth(1).click();}else await t.page.locator('.profile-btn').nth(1).click();
   await t.page.waitForFunction(()=>document.getElementById('currentChildName').textContent==='人工相簿乙');assert.deepEqual((await t.selected())[mode],[]);await t.snap('source-switch-reset');
  }else{t.state.mediaMode='empty';await t.page.reload();await t.page.locator('#loadingIndicator').waitFor({state:'hidden'});assert.equal(await t.page.locator('.album-photo-card').count(),0);await t.snap('empty');}
 });
}
async function albumDialogs(v){
 await runCase(v,'03-own-dialogs-cancel',async t=>{
  await selectUI(t,'album');for(const operation of ['add','date','delete']){
   await openAction(t,'album',operation,true);
   if(operation==='date'){await t.act('.timehut-dialog .modal-actions button[type="button"]');await t.page.locator('#moveCollectionModal .confirm-actions button').first().click();}
   else if(operation==='delete')await t.act('#confirmCancelBtn');else await t.act('.timehut-dialog .modal-actions button[type="button"]');
   assert.deepEqual((await t.selected()).album,selectedIDs,'Dialog cancel retains selection');
  }assert.equal(t.row.apiCallIndices.map(i=>report.apiCalls[i]).filter(c=>c.input?.photoIds).length,0,'Cancel must send zero business writes');
 });
}
async function board05(v){
 await runCase(v,'05-settings-save-error-restore',async t=>{
  const {page,act,snap,state}=t;await page.goto(origin+'/app/settings.html');await page.locator('#birthdate-0').waitFor();await snap('current-settings', {fullPage:true});
  await act('#birthdate-0','fill','2019-12-12');await snap('html-date-edited');report.notCovered.push({case:t.row.id,viewport:v,state:'native date picker popup',status:'NOTCOVERED',reason:'Headless HTML input edit only; no native popup or OS keyboard capture'});
  await act('.save-btn');await page.waitForFunction(()=>[...document.querySelectorAll('.toast')].some(x=>x.textContent.includes('已儲存')));await snap('save-success');await page.reload();assert.equal(await page.locator('#birthdate-0').inputValue(),'2019-12-12');
  state.settingsFailure=true;await act('#birthdate-0','fill','2020-01-02');await act('.save-btn');await page.waitForFunction(()=>[...document.querySelectorAll('.toast.error')].some(x=>!x.hidden&&x.textContent.includes('未完成')));await snap('save-error');state.settingsFailure=false;
  await act('#deleted-albums summary');await page.locator('.album-restore-row').first().scrollIntoViewIfNeeded();await snap('archived-route-loaded');await act('.album-restore-row button');await page.waitForURL(/album-action=restored/);await page.locator('#birthdate-2').waitFor();await page.locator('#deleted-albums summary').scrollIntoViewIfNeeded();await snap('restore-success');
 });
 await runCase(v,'05-no-albums-empty',async t=>{t.state.children=[];t.state.archived=[];await t.page.goto(origin+'/app/settings.html');await t.page.locator('#deleted-albums').waitFor();assert.equal(await t.page.locator('.child-card').count(),0);await t.page.locator('#deleted-albums summary').click();await t.page.getByText('目前沒有已刪除相簿。',{exact:true}).waitFor();await t.snap('empty-account-and-archive');});
}
async function uploadOpen(t){await t.timeline();await t.act('#uploadBtn');await t.page.locator('#uploadModal.active').waitFor();await t.page.waitForFunction(()=>document.getElementById('albumLoadStatus').hidden||!document.getElementById('retryAlbumLoadBtn').hidden);}
const fileFixtures=()=>[{name:'人工公園很長的原始檔名要完整顯示不得省略_20261017.png',mimeType:'image/png',buffer:staticBytes.get('assets/storybook-boy.png')},{name:'人工生日.png',mimeType:'image/png',buffer:staticBytes.get('assets/storybook-girl.png')}];
async function board06(v){
 await runCase(v,'06-queue-modes-photo-mp4-mov',async t=>{
  await uploadOpen(t);await t.act('#fileInput','setInputFiles',fileFixtures());await t.act('#tagsInput','fill','共同標籤');await t.snap('batch');await t.act('#individualModeBtn');await t.page.locator('.queue-item-tags').first().fill('公園 個別');await t.page.locator('.queue-item-tags').nth(1).fill('生日 個別');await t.snap('individual');
  await t.page.locator('.queue-remove').first().click();assert.equal(await t.page.locator('.queue-item-tags').inputValue(),'生日 個別');
  await t.act('#fileInput','setInputFiles',[{name:'人工影片.mp4',mimeType:'video/mp4',buffer:fs.readFileSync('/Users/hank/.local/share/project-storage/internal/builds/timehut-download-fixtures-20261011/artificial-video.mp4')},{name:'人工警告.mov',mimeType:'video/quicktime',buffer:Buffer.from('Synthetic deliberately invalid MOV; warning branch only')}]);await t.page.locator('.video-warning').first().waitFor();await t.page.locator('.video-warning').last().scrollIntoViewIfNeeded();await t.snap('photo-mp4-mov-warning');
 });
 await runCase(v,'06-auth-required',async t=>{t.state.auth=false;await uploadOpen(t);await t.page.locator('#authFlickrBtn').waitFor({state:'visible'});await t.page.locator('#authFlickrBtn').scrollIntoViewIfNeeded();await t.snap('auth-required');});
 for(const scenario of (smoke?['partial']:['accepted','completed','partial','cancel']))await runCase(v,'06-upload-'+scenario,async t=>{
  const {state,page,act,snap,row}=t;state.uploadMode=scenario;await uploadOpen(t);await act('#fileInput','setInputFiles',fileFixtures());await act('#tagsInput','fill','人工傳送標籤');state.uploadHold=gate();await act('#startUploadBtn');
  for(let i=0;i<100&&!state.uploadCount;i++)await page.waitForTimeout(20);assert.equal(state.uploadCount,1,'Actual web upload handler sends first synthetic file');await page.locator('#globalUploadBar.visible').waitFor();await snap('ongoing-globalbar',{transient:true});
  if(scenario==='cancel'){await act('#stopUploadBtn');state.uploadHold.release();state.uploadHold=null;await page.waitForFunction(()=>document.getElementById('globalStatusText').textContent.includes('已停止'));await act('#uploadBtn');await page.locator('#uploadStopNotice').waitFor();await snap('started-cancel-unknown-unsent');row.postCount=state.uploadCount;assert.equal(state.uploadCount,1,'Stop prevents next file dispatch');return;}
  state.uploadHold.release();state.uploadHold=null;await page.waitForFunction(()=>document.getElementById('globalStatusText').textContent.includes('作業結束')||document.getElementById('globalStatusText').textContent.includes('Flickr 處理中'));
  if(scenario==='partial'){
   await act('#uploadBtn');await page.locator('.queue-item').first().waitFor();await snap('partial-failed-only-queue');assert.equal(await page.locator('.queue-item').count(),1);const before=state.uploadCount;state.uploadMode='completed';await act('#startUploadBtn');
   await page.waitForFunction(()=>document.getElementById('globalStatusText').textContent.includes('作業結束'));assert.equal(state.uploadCount,before+1);await snap('retry-same-file-completed',{transient:true});
   const posts=row.apiCallIndices.map(i=>report.apiCalls[i]).filter(x=>x.path==='/api/upload');assert.equal(posts[1].input.clientUploadId,posts[2].input.clientUploadId,'Retry preserves deterministic original ID');assert.notEqual(posts[0].input.clientUploadId,posts[2].input.clientUploadId,'Already accepted first file not resent');
  }else await snap(scenario==='accepted'?'accepted-processing-not-flickr-complete':'completed-mock-server-receipt',{transient:true});
 });
}

async function downloaded(page,trigger,label,row,expected){
 const waiting=page.waitForEvent('download',{timeout:6500});await trigger();const download=await waiting;const file=path.join(out,label+'-'+download.suggestedFilename());await download.saveAs(file);assert.equal(await download.failure(),null);const bytes=fs.readFileSync(file);if(expected)assert(bytes.equals(expected),'Actual downloaded original bytes must equal synthetic fixture');
 const receipt={label,filename:download.suggestedFilename(),file:path.basename(file),bytes:bytes.length,sha256:sha(bytes),mockMedia:true,persistedServerProof:false};(row.downloads||=[]).push(receipt);return {receipt,bytes};
}

async function board07(v){
 await runCase(v,'07-viewer-media-tags-controls',async t=>{
  const {page,act,snap,state,row}=t;await t.timeline();await act('.moment-photo-container[data-photo-id="'+selectedIDs[0]+'"] img');await page.locator('#photoModal.active').waitFor();await snap('photo-full-controls');
  await act('#editTagsInput','fill','人工新標籤 儲存示例');await page.locator('.save-tags-btn').scrollIntoViewIfNeeded();await act('.save-tags-btn');await page.waitForFunction(()=>document.querySelector('.save-tags-btn').textContent==='✅');await snap('tag-save-success');
  state.settingsFailure=true;await act('#editTagsInput','fill','人工失敗標籤');await act('.save-tags-btn');await page.waitForFunction(()=>[...document.querySelectorAll('.toast')].some(x=>x.textContent.includes('儲存標籤失敗')));await snap('tag-save-failure');
  await act('#photoModal .modal-close');state.videoFailure=true;await act('.moment-photo-container[data-photo-id="'+videoID+'"] img');await page.locator('#modalMediaRetry').waitFor({state:'visible'});await page.locator('#modalMediaRetry').scrollIntoViewIfNeeded();await snap('video-error');state.videoFailure=false;await act('#modalMediaRetry');await page.waitForFunction(()=>document.getElementById('modalVideo').readyState>=2);await snap('video-retry-ready');
  // Real browser input to native HTML media controls; no evaluate(play), event injection, or fake progress.
  await page.locator('#modalVideo').scrollIntoViewIfNeeded();await page.locator('#modalVideo').click();
  try{await page.waitForFunction(()=>{const v=document.getElementById('modalVideo');return !v.paused&&v.currentTime>0;},{},{timeout:1800});row.actualHTMLMediaPlaying=true;await snap('video-playing');}catch(error){report.notCovered.push({case:row.id,viewport:v,state:'video playing',status:'NOTCOVERED',reason:'Actual click did not start HTML media playback',error:error.message});await snap('video-click-no-playing');}
  const strip=await page.locator('.filmstrip,[class*="filmstrip"]').count();if(!strip)finding(row,'FILMSTRIP_FEATURE_ABSENT',{detail:'No actual filmstrip DOM feature; not manufactured for capture.'});
 });
 await runCase(v,'07-long-tags-reachability',async t=>{
  await t.timeline();await t.act('.moment-photo-container[data-photo-id="'+selectedIDs[0]+'"] img');await t.act('#editTagsInput','fill',Array.from({length:35},(_,i)=>'人工長標籤'+i).join(' '));await t.page.locator('.save-tags-btn').scrollIntoViewIfNeeded();await t.snap('long-tags-controls-scroll');await t.act('.save-tags-btn');await t.page.waitForFunction(()=>document.querySelector('.save-tags-btn').textContent==='✅');
  await t.page.locator('#modalDownloadBtn').scrollIntoViewIfNeeded();const n=Number(selectedIDs[0])%3;await downloaded(t.page,()=>t.act('#modalDownloadBtn'),v+'-longtags-photo',t.row,staticBytes.get(['assets/storybook-boy.png','assets/storybook-girl.png','assets/storybook-family.png'][n]));await t.snap('long-tags-save-and-download-success');
  t.row.closeGeometry=await t.page.locator('#photoModal .modal-close').boundingBox();const c=t.row.closeGeometry;if(v!=='D')assert(c.y>=0&&c.y+c.height<=(v==='C'?740:844),'Sticky mobile close remains in viewport while scrolled');await t.act('#photoModal .modal-close');assert(!(await t.page.locator('#photoModal').isVisible()));t.row.closedWhileScrolled=true;
 });
}
async function cancelAndReset(v,mode,operation){
 await runCase(v,(mode==='album'?'03':'08')+'-'+mode+'-'+operation+'-cancel-reset',async t=>{
  t.row.traceOnly=true;await selectUI(t,mode);const before=report.apiCalls.length;await openAction(t,mode,operation,false);
  if(operation==='tags'&&mode==='album')await t.act('#tagModal .confirm-actions .btn-secondary');
  else if(operation==='delete'&&mode!=='moment')await t.act('#confirmCancelBtn');
  else{await t.act('.timehut-dialog .modal-actions button[type=button]');if(operation==='date')await t.page.locator('#moveCollectionModal .confirm-actions button').first().click();}
  assert.deepEqual((await t.selected())[mode],selectedIDs,'Operation dialog cancel retains exact source-bound selection');assert.equal(report.apiCalls.slice(before).filter(c=>c.input?.photoIds).length,0,'Cancel must not dispatch business writes');
  await t.act(mode==='album'?'#cancelBtn':mode==='photo'?'#cancelSelectBtn':'#cancelMomentSelectBtn');assert.deepEqual((await t.selected())[mode],[]);await t.snap('cancel-and-reset');t.row.cancelVerified=true;t.row.resetVerified=true;
 },{mode,operation});
}
async function downloads(v,mode,scenario){
 await runCase(v,(mode==='album'?'03':'08')+'-'+mode+'-download-'+scenario,async t=>{
  const {page,row,state,act,snap,selected}=t;row.traceOnly=v==='D'||scenario!=='partial';await selectUI(t,mode);state.downloadFailures=new Set(scenario==='failure'?selectedIDs:scenario==='partial'?selectedIDs.slice(1):[]);
  const btn=mode==='album'?'#downloadSelectedBtn':'#batchDownloadBtn',before=report.apiCalls.length;
  await act(btn);await page.locator('.timehut-dialog').waitFor();await act('.timehut-dialog .modal-actions button[type=button]');assert.deepEqual((await selected())[mode],selectedIDs);assert.equal(report.apiCalls.slice(before).filter(c=>c.path.includes('/photo/')&&(/size=o|purpose=original/.test(c.query))).length,0,'Cancel download sends no original reads');row.cancelVerified=true;
  const submit=async()=>{await act(btn);await page.locator('.timehut-dialog').waitFor();return '.timehut-dialog button[type=submit]';};
  async function checkZip(result,ids){
   const JSZip=require(path.join(site,'js/vendor/jszip-3.10.1.min.js'));const zip=await JSZip.loadAsync(result.bytes),files=Object.values(zip.files).filter(f=>!f.dir);assert.equal(files.length,ids.length);const entries=[];
   for(const id of ids){const f=files.find(f=>f.name.startsWith(id));assert(f,'ZIP contains exact ID '+id);const bytes=await f.async('nodebuffer');const expected=id===videoID?fs.readFileSync('/Users/hank/.local/share/project-storage/internal/builds/timehut-download-fixtures-20261011/artificial-video.mp4'):staticBytes.get(['assets/storybook-boy.png','assets/storybook-girl.png','assets/storybook-family.png'][Number(id)%3]);assert(bytes.equals(expected));entries.push({id,name:f.name,bytes:bytes.length,sha256:sha(bytes)});} (row.zipResults||=[]).push(entries);
  }
  const button=await submit();if(scenario==='partial')await snap('download-confirm');
  if(scenario==='failure'){await act(button);await page.waitForFunction(selector=>!document.querySelector(selector).disabled,btn);assert.deepEqual((await selected())[mode],selectedIDs);await snap('download-total-failure');state.downloadFailures.clear();const retry=await submit();await checkZip(await downloaded(page,()=>act(retry),v+'-'+mode+'-failed-retry',row),selectedIDs);}
  else{const expected=scenario==='partial'?[selectedIDs[0]]:selectedIDs;await checkZip(await downloaded(page,()=>act(button),v+'-'+mode+'-'+scenario,row),expected);await page.waitForFunction(selector=>!document.querySelector(selector).textContent.includes('打包')&&!document.querySelector(selector).textContent.includes('產生'),btn);assert.deepEqual((await selected())[mode],scenario==='partial'?selectedIDs.slice(1):[]);await snap('download-'+scenario);
   if(scenario==='partial'){state.downloadFailures.clear();const retry=await submit();await checkZip(await downloaded(page,()=>act(retry),v+'-'+mode+'-partial-retry',row),selectedIDs.slice(1));}}
  await page.waitForTimeout(50);assert.deepEqual((await selected())[mode],[]);row.resetVerified=true;row.mediaReads=row.apiCallIndices.map(i=>report.apiCalls[i]).filter(c=>c.path.includes('/photo/')&&(/size=o|purpose=original/.test(c.query)));
 },{mode,operation:'download',scenario});
}
async function moveDestinationFailure(v,scenario){
 await runCase(v,'08-moment-move-destination-'+scenario,async t=>{
  await selectUI(t,'moment');t.row.traceOnly=true;t.state.destinationFailure=scenario;t.state.receiptScenario='success';
  let button=await openAction(t,'moment','move',false);await t.act(button);await t.page.waitForFunction(()=>!document.getElementById('momentMoveAlbumBtn').disabled);await t.page.waitForTimeout(30);
  assert.deepEqual((await t.selected()).moment,selectedIDs);let calls=t.row.apiCallIndices.map(i=>report.apiCalls[i]).filter(c=>c.input?.photoIds);assert.equal(calls.filter(c=>c.path.endsWith('/remove_photos')).length,0,'No source removal before every destination membership is confirmed');
  t.state.destinationFailure=null;button=await openAction(t,'moment','move',false);await t.act(button);await t.page.waitForTimeout(80);assert.deepEqual((await t.selected()).moment,[]);calls=t.row.apiCallIndices.map(i=>report.apiCalls[i]).filter(c=>c.input?.photoIds);assert(calls.at(-1).path.endsWith('/remove_photos'));assert.deepEqual(calls.at(-1).input.photoIds,selectedIDs);t.row.destinationRetryPreservesSourceSelection=true;
 },{mode:'moment',operation:'move',scenario:'destination-'+scenario});
}
async function uploadBothModes(v,tagging,scenario){
 await runCase(v,'06-'+tagging+'-allbranches-'+scenario,async t=>{
  const {state,page,act,snap,row}=t;row.traceOnly=tagging==='individual'||scenario!=='failure';state.uploadMode=scenario;await uploadOpen(t);await act('#fileInput','setInputFiles',fileFixtures());
  if(tagging==='individual'){await act('#individualModeBtn');await page.locator('.queue-item-tags').nth(0).fill('人工單檔甲');await page.locator('.queue-item-tags').nth(1).fill('人工單檔乙');}else await act('#tagsInput','fill','人工傳送標籤');
  state.uploadHold=gate();await act('#startUploadBtn');for(let i=0;i<100&&!state.uploadCount;i++)await page.waitForTimeout(20);assert.equal(state.uploadCount,1);await page.locator('#globalUploadBar.visible').waitFor();await snap('ongoing-zero-percent-not-wire-proof',{transient:true});
  if(scenario==='cancel'){await act('#stopUploadBtn');state.uploadHold.release();state.uploadHold=null;await page.waitForFunction(()=>document.getElementById('globalStatusText').textContent.includes('已停止'));await act('#uploadBtn');await page.locator('#uploadStopNotice').waitFor();await snap('started-cancel-unknown-unsent');assert.equal(state.uploadCount,1);return;}
  state.uploadHold.release();state.uploadHold=null;await page.waitForFunction(()=>document.getElementById('globalStatusText').textContent.includes('作業結束'));await page.waitForTimeout(550);
  row.actualResultTranscript=report.dialogs.filter(d=>d.case===row.id&&d.viewport===v);assert(row.actualResultTranscript.some(d=>d.message.includes('未完成的檔案')),'Actual alert result transcript required');
  await act('#uploadBtn');await page.locator('.queue-item').first().waitFor();await snap(scenario==='partial'?'partial-failed-only-queue':'total-failure-retained-queue');assert.equal(await page.locator('.queue-item').count(),scenario==='partial'?1:2);
  const before=state.uploadCount;state.uploadMode='completed';await act('#startUploadBtn');await page.waitForFunction(()=>document.getElementById('globalStatusText').textContent.includes('作業結束'));assert.equal(state.uploadCount,before+(scenario==='partial'?1:2));await snap('retry-same-original-completed',{transient:true});
  const posts=row.apiCallIndices.map(i=>report.apiCalls[i]).filter(x=>x.path==='/api/upload');const expected=scenario==='partial'?[posts[1].input.clientUploadId]:posts.slice(0,2).map(x=>x.input.clientUploadId);assert.deepEqual(posts.slice(2).map(x=>x.input.clientUploadId),expected,'Retry preserves exact IDs and omits accepted successes');
  if(tagging==='individual'){assert.notEqual(posts[0].input.tags,posts[1].input.tags);assert.equal(posts[2].input.tags,posts[scenario==='partial'?1:0].input.tags,'Retry preserves per-file tags');}
 },{tagging,scenario,operation:'upload'});
}
async function viewerVideoDownload(v){
 await runCase(v,'07-video-original-download',async t=>{await t.timeline();await t.act('.moment-photo-container[data-photo-id="'+videoID+'"] img');await t.page.waitForFunction(()=>document.getElementById('modalVideo').readyState>=2);await t.page.locator('#modalDownloadBtn').scrollIntoViewIfNeeded();await downloaded(t.page,()=>t.act('#modalDownloadBtn'),v+'-viewer-video',t.row,fs.readFileSync('/Users/hank/.local/share/project-storage/internal/builds/timehut-download-fixtures-20261011/artificial-video.mp4'));await t.snap('video-download-controls-reachable');await t.act('#photoModal .modal-close');});
}
async function remainder(v){
 await runCase(v,'02-transfer-receipt-return',async t=>{
  const {state,page,row,act,snap}=t;state.uploadMode='accepted';await uploadOpen(t);await act('#fileInput','setInputFiles',[fileFixtures()[0]]);state.uploadHold=gate();await act('#startUploadBtn');for(let i=0;i<100&&!state.uploadCount;i++)await page.waitForTimeout(20);assert.equal(state.uploadCount,1);await snap('actual-handler-active-globalbar',{transient:true});state.uploadHold.release();state.uploadHold=null;
  await page.waitForFunction(()=>document.getElementById('globalStatusText').textContent.includes('Flickr 處理中'));
  const entry=[...state.admissions.values()][0];assert(entry.localId);const item={localId:entry.localId,filename:fileFixtures()[0].name,status:'processing',albumId:albumIDs[0],byteSize:fileFixtures()[0].buffer.length,createdAt:'2026-10-17T04:00:00Z',retryBlocked:false};state.queueItems=[item];row.receiptId=item.localId;
  await page.waitForTimeout(550);await page.locator('#transferQueueEntry').click();await page.waitForURL(/transfer.html/);await page.locator('.transfer-task').first().waitFor();await snap('same-receipt-processing-center');
  state.queueItems=[{...item,status:'error',retryBlocked:true,error:'人工收據需要核對'}];await page.reload();await page.locator('.transfer-task').first().waitFor();await snap('same-receipt-attention-center');await page.locator('a[href="timeline.html"]').first().click();await page.locator('#transferQueueCount').filter({hasText:'待完成 1'}).waitFor();await snap('returned-timeline-attention-summary');
  const replies=row.apiCallIndices.map(i=>report.apiCalls[i]).filter(x=>x.path==='/api/uploads/status'&&x.receiptItems.length);assert(replies.some(x=>x.receiptItems[0].status==='processing'));assert(replies.some(x=>x.receiptItems[0].status==='error'));assert(replies.every(x=>x.receiptItems[0].localId===item.localId));row.widgetDistinction='Active BackgroundUploader global bar shown during actual UI upload. TimehutTransfers summary is separate; receipt stages are API mocks, not persisted proof.';
 });
 await runCase(v,'05-invalid-input-archive-error-recovery',async t=>{
  const {page,state,row,act,snap}=t;state.archivedFailure=true;await page.goto(origin+'/app/settings.html');await page.locator('#birthdate-0').waitFor();await act('#deleted-albums summary');await page.getByText('相簿管理暫時無法讀取，請稍後更新頁面再試。',{exact:true}).waitFor();await snap('archive-error');state.archivedFailure=false;await page.reload();await act('#deleted-albums summary');await page.locator('.album-restore-row button').waitFor();await snap('archive-error-recovery');
  const before=report.apiCalls.length;await act('#birthdate-0','fill','');await act('.save-btn');assert.equal(await page.locator('#birthdate-0').getAttribute('aria-invalid'),'true');await act('#birthdate-0','fill','2100-01-01');await act('.save-btn');assert.equal(await page.locator('#birthdate-0').getAttribute('aria-invalid'),'true');assert.equal(report.apiCalls.slice(before).filter(x=>x.method==='PUT').length,0);await snap('invalid-future-draft');await act('#birthdate-0','fill','2024-02-29');assert.equal(await page.locator('#birthdate-0').getAttribute('aria-invalid'),'false');row.htmlInputValidationOnly=true;
  await page.locator('.album-restore-row button').scrollIntoViewIfNeeded();await act('.album-restore-row button');await page.waitForURL(/album-action=restored/);await page.locator('#birthdate-2').waitFor();await act('#deleted-albums summary');await page.getByText('相簿已復原。',{exact:true}).waitFor();await page.getByText('目前沒有已刪除相簿。',{exact:true}).waitFor();await snap('restored-and-archived-empty-visible');
 });
 for(const tagging of ['batch','individual'])await runCase(v,'06-'+tagging+'-utf8-request-metadata',async t=>{
  t.row.traceOnly=true;await uploadOpen(t);await t.act('#fileInput','setInputFiles',fileFixtures());if(tagging==='individual'){await t.act('#individualModeBtn');await t.page.locator('.queue-item-tags').nth(0).fill('人工單檔甲');await t.page.locator('.queue-item-tags').nth(1).fill('人工單檔乙');}else await t.act('#tagsInput','fill','人工共同標籤');await t.act('#startUploadBtn');await t.page.waitForFunction(()=>document.getElementById('globalStatusText').textContent.includes('作業結束'));const calls=t.row.apiCallIndices.map(i=>report.apiCalls[i]).filter(x=>x.path==='/api/upload');assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>c.input.filename),fileFixtures().map(f=>f.name));assert.deepEqual(calls.map(c=>c.input.tags),tagging==='batch'?[0,1].map(()=>`uploader:${actor.displayName} 人工共同標籤`):['甲','乙'].map(x=>`uploader:${actor.displayName} 人工單檔${x}`));t.row.tagMetadataDecodedAs='UTF-8 multipart';
 });
}
async function filenameScroll(v='C'){
 await runCase(v,'06-full-filename-scroll-end',async t=>{
  await uploadOpen(t);await t.act('#fileInput','setInputFiles',fileFixtures());
  const endData=()=>t.page.evaluate(()=>{const e=document.querySelector('.queue-filename'),text=e.firstChild,r=document.createRange();r.setStart(text,Math.max(0,text.length-1));r.setEnd(text,text.length);const b=r.getBoundingClientRect();const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);const tailNotOccluded=!!hit&&(hit===e||e.contains(hit));let top=0,bottom=innerHeight;const clips=[];for(let a=e.parentElement;a;a=a.parentElement){const s=getComputedStyle(a),q=a.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowY)){top=Math.max(top,q.top);bottom=Math.min(bottom,q.bottom);clips.push({class:a.className,top:q.top,bottom:q.bottom,overflowY:s.overflowY,scrollTop:a.scrollTop});}}return {text:e.textContent,lastChars:text.textContent.slice(-8),lastRect:{top:b.top,bottom:b.bottom},clipTop:top,clipBottom:bottom,lastVisible:b.top>=top&&b.bottom<=bottom&&tailNotOccluded,tailNotOccluded,filenameRect:(()=>{const x=e.getBoundingClientRect();return {x:x.x,y:x.y,width:x.width,height:x.height};})(),rowRect:(()=>{const x=e.closest('.queue-item').getBoundingClientRect();return {x:x.x,y:x.y,width:x.width,height:x.height};})(),firstChildRect:(()=>{const x=e.parentElement.getBoundingClientRect();return {x:x.x,y:x.y,width:x.width,height:x.height,minWidth:getComputedStyle(e.parentElement).minWidth,gridTemplateColumns:getComputedStyle(e.parentElement).gridTemplateColumns};})(),rowCSS:{flexShrink:getComputedStyle(e.closest('.queue-item')).flexShrink,minWidth:getComputedStyle(e.closest('.queue-item')).minWidth,gridTemplateColumns:getComputedStyle(e.closest('.queue-item')).gridTemplateColumns},tailHit:hit?{tag:hit.tagName,class:hit.className,text:hit.textContent?.slice(0,100)}:null,css:{whiteSpace:getComputedStyle(e).whiteSpace,textOverflow:getComputedStyle(e).textOverflow},clips};});
  for(const tagging of ['batch','individual']){await t.act(tagging==='batch'?'#batchModeBtn':'#individualModeBtn');await t.page.locator('.queue-item').first().scrollIntoViewIfNeeded();await t.page.locator('.queue-list').hover();let data=await endData();for(let i=0;i<14&&!data.lastVisible;i++){await t.page.mouse.wheel(0,data.lastRect.bottom>data.clipBottom?90:-90);await t.page.waitForTimeout(30);data=await endData();}t.row.observations.push({tagging,filenameEnd:data});await t.snap(tagging+'-filename-end-scroll');assert.equal(data.text,fileFixtures()[0].name);assert.equal(data.css.whiteSpace,'normal');assert.equal(data.css.textOverflow,'clip');assert(data.lastVisible,'Long filename tail must be visible and unoccluded through actual queue wheel scrolling');}
  await t.page.locator('.queue-item-tags').nth(0).fill('人工長檔名甲');await t.page.locator('.queue-item-tags').nth(1).fill('人工保留乙');await t.page.locator('.queue-remove').first().click();assert.equal(await t.page.locator('.queue-filename').textContent(),fileFixtures()[1].name);assert.equal(await t.page.locator('.queue-item-tags').inputValue(),'人工保留乙');t.row.removePreservesTag=true;await t.snap('actual-remove-preserves-file-tag');
  await t.act('#fileInput','setInputFiles',[{name:'人工警告影片.mov',mimeType:'video/quicktime',buffer:Buffer.from('Synthetic deliberately invalid MOV; warning only')}]);await t.page.locator('.video-warning').last().waitFor();await t.page.locator('.video-warning').last().scrollIntoViewIfNeeded();
  const warningTail=()=>t.page.locator('.video-warning').last().evaluate(e=>{const n=e.firstChild,r=document.createRange();r.setStart(n,n.length-1);r.setEnd(n,n.length);const b=r.getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return {top:b.top,bottom:b.bottom,unoccluded:!!hit&&(hit===e||e.contains(hit)),hitClass:hit?.className};});
  await t.page.locator('.queue-list').hover();let tail=await warningTail();for(let i=0;i<10&&!tail.unoccluded;i++){await t.page.mouse.wheel(0,55);await t.page.waitForTimeout(30);tail=await warningTail();}t.row.warningTail=tail;assert(tail.unoccluded,'MOV warning final text must actually be visible, not behind sticky actions');t.row.warningCSS=await t.page.locator('.video-warning').last().evaluate(e=>({text:e.textContent,textWrap:getComputedStyle(e).textWrap,rect:(()=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};})()}));await t.snap('mov-warning-with-retained-photo-tag');assert.equal(t.row.warningCSS.textWrap,'pretty');
 });
}
async function emptyEntryDelta(){
 report.deltaScope='95.3 only: empty owned album CTA opens normal upload handler. Previous95.2 matrix is rebound separately; this subset is not scored as all states.';
 for(const v of ['D','M','C'])await runCase(v,'02-empty-entry-95.3',async t=>{
  t.state.mediaMode='empty';await t.page.goto(origin+'/app/timeline.html');await t.page.locator('#emptyState').waitFor({state:'visible'});assert.equal(await t.page.locator('#emptyState a[href*="flickr.com"]').count(),0,'Empty state must not link to family Flickr album');const button=t.page.locator('#emptyState button');await button.waitFor({state:'visible'});await t.snap('empty-owned-album-cta');await button.click();await t.page.locator('#uploadModal.active').waitFor();await t.page.waitForFunction(()=>document.getElementById('albumLoadStatus').hidden);assert.equal(await t.page.locator('#albumSelect').inputValue(),albumIDs[0]);assert.equal(await t.page.locator('#uploaderValue').inputValue(),actor.displayName);await t.snap('actual-upload-correct-destination');t.row.CTA={actualClick:true,normalHandler:'openUploadModal',destination:albumIDs[0],user:actor.id,externalFlickrAttempted:report.externalIntercepted.some(x=>x.case===t.row.id&&x.host.includes('flickr.com')),syntheticAccountAPI:true};assert(!t.row.CTA.externalFlickrAttempted);await t.act('#uploadModal .modal-close');assert(!(await t.page.locator('#uploadModal').isVisible()));
 });
}
async function compactFixDelta(){
 report.compactScope='320x740 only: Socrates95.1 corrected filename/delete wrap and95.2 viewer scroll/close defects; no full compact matrix';
 await runCase('C','06-95-css-filename-warning',async t=>{await uploadOpen(t);await t.act('#fileInput','setInputFiles',fileFixtures());for(const mode of ['batch','individual']){await t.act(mode==='batch'?'#batchModeBtn':'#individualModeBtn');await t.page.locator('.queue-item').first().scrollIntoViewIfNeeded();await t.snap(mode+'-full-filename');}await t.act('#fileInput','setInputFiles',[{name:'人工警告.mov',mimeType:'video/quicktime',buffer:Buffer.from('synthetic invalid MOV')}]);await t.page.locator('.video-warning').last().scrollIntoViewIfNeeded();await t.snap('mov-warning');});
 await runCase('C','03-95-delete-no-wrap',async t=>{await selectUI(t,'album');await openAction(t,'album','delete',true);const box=await t.page.locator('#confirmOkBtn').boundingBox();assert(box.y>=0&&box.y+box.height<=740);await t.act('#confirmCancelBtn');assert.deepEqual((await t.selected()).album,selectedIDs);});
 await runCase('C','05-95-header-closing-text',async t=>{await t.page.goto(origin+'/app/settings.html');await t.page.locator('#birthdate-0').waitFor();await t.snap('header');await t.page.locator('.save-btn').scrollIntoViewIfNeeded();await t.snap('closing-save');});
 await board07('C');
}
async function updateNotice05(){
 report.deltaScope='Only added05 update-notice dependency/section on current source: D/M normal preview and C failed catalog→actual retry recovery. Three cases/four PNGs; original97 manifest untouched.';
 assert(staticBytes.has('js/update-notice.js'),'Current public exporter must include new actual dependency');
 report.updateNoticeSource={settings:rootBefore['settings.html'],module:rootBefore['js/update-notice.js'],catalogPolicy:'Browser catalog GET is intercepted with explicit synthetic schema1 payload before static-route handling; no live catalog fetch or navigation.'};
 for(const v of ['D','M','C'])await runCase(v,v==='C'?'05-update-catalog-error-retry':'05-update-preview',async t=>{
  const {page,state,row,act,snap}=t;state.catalogFailure=v==='C';
  await page.goto(origin+'/app/settings.html');await page.locator('#birthdate-0').waitFor();
  const status=page.locator('#app-updates [role="status"]');
  await status.filter({hasText:v==='C'?'暫時無法檢查更新，請稍後再試':'目前為測試預覽版'}).waitFor();
  await act('#birthdate-0','fill','2020-02-29');await act('.save-btn');await page.locator('#settingsStatus').filter({hasText:'已儲存'}).waitFor();
  assert.equal(state.children[0].birthDate,'2020-02-29');assert.equal(await page.locator('#birthdate-0').inputValue(),'2020-02-29');
  row.birthdaySave={actualInputAndClick:true,date:'2020-02-29',albumId:albumIDs[0],mockAPI:true,persistedSQL:false};
  const inspectLayout=async()=>{
   const data=await page.evaluate(()=>{
    const rect=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,top:b.top+scrollY,bottom:b.bottom+scrollY,right:b.right};};
    const selectors=['#childrenList','.save-btn','.settings-story-closing','.device-settings','#app-updates','.service-card'];
    const sections=selectors.map(selector=>({selector,...rect(document.querySelector(selector))}));
    const controls=[...document.querySelectorAll('#app-updates button,#app-updates a')].map(e=>{const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return {text:e.textContent,...rect(e),inViewport:b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight,unoccluded:!!hit&&(e===hit||e.contains(hit))};});
    const inputs=[...document.querySelectorAll('input[type="date"]')].map(e=>({value:e.value,...rect(e)}));
    return {sections,controls,inputs,viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth,status:document.querySelector('#app-updates [role="status"]').textContent};
   });
   assert(data.scrollWidth<=data.viewport.width,'No horizontal overflow');
   for(let i=1;i<data.sections.length;i++)assert(data.sections[i-1].bottom<=data.sections[i].top+1,'Settings sibling sections must not overlap');
   for(const input of data.inputs)assert(input.x>=0&&input.right<=data.viewport.width,'Birthday input fits horizontally');
   for(const c of data.controls)assert(c.inViewport&&c.unoccluded,'Update actions must be visible and clickable after real section scrolling');
   row.observations.push({name:'update-layout',...data});return data;
  };
  await page.locator('#app-updates').scrollIntoViewIfNeeded();await inspectLayout();
  await snap(v==='C'?'catalog-failure':'normal-preview-fullpage',{fullPage:v!=='C'});
  if(v==='C'){
   state.catalogFailure=false;await act('#app-updates button');await status.filter({hasText:'目前為測試預覽版'}).waitFor();
   await page.locator('#app-updates').scrollIntoViewIfNeeded();await inspectLayout();await snap('actual-button-retry-preview-recovery');
  }
  const calls=row.catalogRequestIndices.map(i=>report.requests[i]);assert.deepEqual(calls.map(x=>x.responseStatus),v==='C'?[503,200]:[200]);
  row.catalogEvidence={requests:calls.map(x=>({path:x.path,status:x.responseStatus,mock:x.catalogFixture,payload:x.fixturePayload})),previewText:await status.innerText(),sourceModuleSHA256:sha(staticBytes.get('js/update-notice.js')),noLiveCatalog:true};
 });
}
async function main(){
 try{
  await preflight();browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-networking','--disable-component-update','--disable-domain-reliability','--disable-sync','--no-first-run','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  if(updateNoticeDelta)await updateNotice05();
  if(args.includes('--filename-layout-delta')){await filenameScroll('C');await filenameScroll('M');}
  if(args.includes('--empty-entry-delta'))await emptyEntryDelta();
  if(compactDelta)await compactFixDelta();
  if(args.includes('--remainder')){await remainder('M');await filenameScroll();}
  for(const v of viewportNames){
   if(boards.includes('02'))await board02(v);
   if(boards.includes('03')){await albumDialogs(v);for(const operation of (smoke?['tags']:['tags','add','date','delete']))for(const s of (smoke?['partial']:['partial','failure','success']))await mutationCase(v,'album',operation,s);await resets(v,'album');if(!smoke){for(const op of ['tags','add','date','delete'])await cancelAndReset(v,'album',op);for(const scenario of ['success','partial','failure'])await downloads(v,'album',scenario);}}
   if(boards.includes('05'))await board05(v);
   if(boards.includes('06')){await board06(v);if(!smoke)for(const tagging of ['batch','individual'])for(const scenario of ['partial','failure','cancel'])await uploadBothModes(v,tagging,scenario);}
   if(boards.includes('07')){await board07(v);if(!smoke)await viewerVideoDownload(v);}
   if(boards.includes('08'))for(const mode of ['photo','moment']){
    await resets(v,mode);for(const s of (smoke?['partial']:['partial','failure','success']))await mutationCase(v,mode,'tags',s);
    if(!smoke)for(const operation of (mode==='photo'?['add','date','delete']:['move','date','delete']))for(const scenario of ['partial','failure','success'])await mutationCase(v,mode,operation,scenario);
    if(!smoke)for(const op of (mode==='photo'?['tags','add','date','delete']:['tags','move','date','delete']))await cancelAndReset(v,mode,op);
   }
   if(boards.includes('08')&&!smoke){for(const scenario of ['success','partial','failure'])await downloads(v,'photo',scenario);for(const scenario of ['partial','failure'])await moveDestinationFailure(v,scenario);report.notCovered.push({viewport:v,mode:'moment',operation:'download',status:'NOT_APPLICABLE_IN_ACTUAL_MODE',reason:'Actual moment-selection toolbar exposes tags/date/move-album/delete only. No fabricated download action.'});}
  }
 }catch(error){report.error=error.stack;}
 finally{
  await browser?.close();if(server)await new Promise(r=>server.close(r));
  if(report.binding){
   const files=Object.keys(report.binding.rootPre);report.binding.rootPost=digestFiles(root,files);report.binding.snapshotPost=digestFiles(site,files);report.binding.inputsPost=digestFiles(root,Object.keys(report.binding.inputsPre));
   report.binding.rootStable=JSON.stringify(report.binding.rootPre)===JSON.stringify(report.binding.rootPost);report.binding.snapshotStable=JSON.stringify(report.binding.snapshotPre)===JSON.stringify(report.binding.snapshotPost);report.binding.inputsStable=JSON.stringify(report.binding.inputsPre)===JSON.stringify(report.binding.inputsPost);report.binding.allServedBytesMatchSnapshot=JSON.stringify(report.servedManifest)===JSON.stringify(report.binding.snapshotPre);
   if(!report.binding.rootStable||!report.binding.snapshotStable||!report.binding.inputsStable||!report.binding.allServedBytesMatchSnapshot)report.error=(report.error||'')+'\nSOURCE_BINDING_FAILED: source/snapshot/input changed or served mismatch';
   fs.writeFileSync(path.join(out,'source-post.json'),JSON.stringify(report.binding,null,2));
  }
  report.uploadProgressEvidence={actualWireProgressVerified:false,method:'Held intercepted synthetic POST response; zero/terminal UI progress only; no percentage injected',globalActivityWidget:'BackgroundUploader/BackgroundWorker.globalUploadBar',receiptSummary:'TimehutTransfers initQueueEntry (separate widget)'};
  report.finishedAt=new Date().toISOString();report.summary={cases:report.cases.length,failed:report.cases.filter(x=>x.status==='FAILED').length,captures:report.captures.length,findings:report.findings.length,unexpectedRoutes:report.unexpectedRoutes.length,runtimeErrors:report.runtimeErrors.length,routeErrors:report.routeErrors.length};
  report.status=report.error||report.summary.failed||report.summary.unexpectedRoutes||report.summary.runtimeErrors||report.summary.routeErrors?'FAILED':'CAPTURED_SYNTHETIC_UI_NOT_FORMAL_ACCEPTANCE';save();
  if(out){
   const lines=['# Current six-page state capture','',`Status: ${report.status}`,`Version bytes: ${report.version?.bytes?.trim()}`,`Cases ${report.summary.cases}; failed ${report.summary.failed}; captures ${report.summary.captures}.`,'','No scores assigned. Mock receipts establish UI branches only; no live or formal functional pass.','Remote font CSS is empty; fallback rendering is not original-font equivalence.','Real devices, native date popup, OS keyboard/focus, actual Flickr and publishing: NOT VERIFIED / NOT EXECUTED.','',...report.cases.map(c=>`- ${c.viewport} ${c.id}: ${c.status}${c.error?' — '+c.error.split('\n')[0]:''}`),'','## Findings','',...report.findings.map(f=>`- ${f.viewport} ${f.case}: ${f.kind} ${JSON.stringify(f)}`),'','## Manual image inspection','', 'PENDING. Screenshots are evidence, not an automatic visual acceptance. See manual-observations.json.'];
   fs.writeFileSync(path.join(out,'report.md'),lines.join('\n')+'\n');fs.writeFileSync(path.join(out,'manual-observations.json'),JSON.stringify({status:'PENDING_MANUAL_INSPECTION',authorScored:false,entries:[],captures:report.captures.map(x=>({file:x.path,sha256:x.sha256,case:x.case,viewport:x.viewport}))},null,2));
   artifact=path.join(qa,path.basename(workspace));fs.mkdirSync(artifact);fs.cpSync(out,path.join(artifact,'evidence'),{recursive:true});fs.cpSync(site,path.join(artifact,'public-site-snapshot'),{recursive:true});fs.copyFileSync(path.join(workspace,'AGENTS.md'),path.join(artifact,'AGENTS.md'));fs.writeFileSync(path.join(artifact,'workspace-receipt.json'),JSON.stringify({workspace,site,evidence:out,artifact,sourceRoot:root,publicOnly:true,privateConfigCopied:false,executionOnSSD:true},null,2));
   fs.writeFileSync(path.join(qa,'latest-run.json'),JSON.stringify({artifact,status:report.status,phase,version:report.version,summary:report.summary},null,2));
  }
  console.log(JSON.stringify({status:report.status,artifact,workspace,summary:report.summary,error:report.error}));if(report.status==='FAILED')process.exitCode=1;
 }
}
main();
