/* Full settings/accounts/module integration; synthetic HTTP only, no real users. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('/Users/hank/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');assert(root.startsWith('/Users/hank/.local/share/project-storage/internal/builds/timehut-update-integration-'));
const origin='https://just-healing-production.up.railway.app',out=path.join(root,'results');fs.mkdirSync(out);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={status:'FAIL',checks:[],requests:[],runtimeErrors:[],forwardedRequests:0,formalAcceptance:false,scope:'Actual product settings HTML, Accounts and update module; synthetic cookie HTTP and explicit old-Web build metadata. No provider, native bridge, real catalog or update installation.'};
let actor='A',fail=false,hold=false,held=[],browser;
let release={channel:'web',platform:'web',available:true,version:'2026.10.16-web.4',versionCode:4,notes:'人工可用版本資料，用於整合測試。',verifiedAt:'2026-10-17T00:00:00Z',url:origin+'/app/index.html'};
const users={A:{id:'11111111-1111-4111-8111-111111111111',username:'synthetic-a',displayName:'人工A'},B:{id:'22222222-2222-4222-8222-222222222222',username:'synthetic-b',displayName:'人工B'}};
const profile=()=>({user:users[actor],legacyOwner:false,expiresAt:Date.now()+86400000});
async function run(){try{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),row={method:req.method(),path:u.pathname,actor,forwarded:false};report.requests.push(row);
  const json=(data,status=200)=>route.fulfill({status,json:data,headers:{'Cache-Control':'no-store','X-Timehut-Account':users[actor].id}});
  if(u.origin!==origin)return route.fulfill({status:200,body:'',contentType:'text/css'});
  if(u.pathname==='/app/releases.json'){
   const body={schema:1,releases:[{...release}]},bad=fail;row.catalogFixture=true;
   if(hold)await new Promise(resolve=>held.push(resolve));
   return json(bad?{error:'Synthetic unavailable'}:body,bad?503:200).catch(()=>{});
  }
  if(u.pathname==='/app/js/version.js'){row.explicitMetadataFixture=true;return route.fulfill({contentType:'application/javascript',body:"window.TimehutBuild=Object.freeze({version:'2026.10.15-web.1',versionCode:1,channel:'web'});"});}
  if(u.pathname.startsWith('/app/')){
   const rel=decodeURIComponent(u.pathname.slice(5));assert(!rel.includes('..')&&rel!=='js/config.js');const f=path.join(root,'site',rel);
   if(!fs.existsSync(f))return route.fulfill({status:404,body:''});const b=fs.readFileSync(f);row.sha256=sha(b);
   const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};
   return route.fulfill({body:b,contentType:mime[path.extname(f)]||'application/octet-stream'});
  }
  if(u.pathname==='/api/accounts/session'&&req.method()==='POST'){actor=req.postDataJSON().username==='synthetic-b'?'B':'A';return json(profile());}
  if(u.pathname==='/api/accounts/me')return json(profile());
  if(u.pathname==='/api/accounts/context')return json({...profile(),children:[{albumId:'synthetic-'+actor,name:'人工相簿'+actor,birthDate:'2026-01-01'}],albumPagination:{page:1,pages:1,total:1}});
  if(['/api/accounts/albums','/api/accounts/albums/archived'].includes(u.pathname))return json({albums:[],total:0,page:1,pages:1});
  if(u.pathname==='/api/accounts/notification-settings')return json({enabled:true,channel:'in-app'});
  if(u.pathname==='/api/accounts/notifications')return json({notifications:[]});
  if(['/api/accounts/feedback','/api/accounts/feedback/inbox'].includes(u.pathname))return json({reports:[],total:0,page:1,pages:1});
  if(u.pathname==='/api/uploads/status')return json({items:[],total:0,pending:0,uploading:0,isProcessing:false});
  if(u.pathname==='/api/auth/status')return json({authenticated:false});
  if(u.pathname==='/health')return json({version:'synthetic-backend'});
  row.unexpected=true;return json({error:'Unexpected synthetic request'},404);
 });
 const page=await context.newPage();page.on('pageerror',e=>report.runtimeErrors.push(e.message));
 const status=()=>page.locator('#app-updates [role=status]'),read=()=>page.getByRole('button',{name:'已知道，稍後更新'});
 async function settings(){await page.goto(origin+'/app/settings.html');await page.locator('#app-updates').waitFor();await page.waitForFunction(()=>!document.querySelector('#app-updates button:last-child').disabled);}
 async function switchTo(name){await Promise.all([page.waitForURL('**/app/account.html'),page.evaluate(username=>TimehutAccounts.signIn({username,password:'synthetic-local-only'}),name==='B'?'synthetic-b':'synthetic-a').catch(e=>{if(!/context.*destroyed|navigation/i.test(e.message))throw e;})]);await settings();assert.equal(await page.evaluate(()=>TimehutAccounts.status().user.id),users[name].id);}
 await settings();assert.match(await status().innerText(),/尚未讀取/);await read().click();await settings();assert.equal(await read().count(),0);assert.equal(await page.locator('#app-updates a').getAttribute('href'),release.url);report.checks.push('Actual full settings read click and reload preserves available link without repeating unread prompt');
 await switchTo('B');assert.match(await status().innerText(),/尚未讀取/);await read().click();await switchTo('A');assert.equal(await read().count(),0);report.checks.push('Actual Accounts.signIn and account-change navigation, A/B/A per-user seen isolation');
 release={...release,version:'2026.10.17-web.1',versionCode:5};await settings();assert.match(await status().innerText(),/尚未讀取/);assert.match(await status().innerText(),/2026.10.17-web.1/);report.checks.push('Different synthetic released version receives a new unread key');
 fail=true;await settings();assert.match(await status().innerText(),/暫時無法檢查/);assert.equal(await page.locator('#app-updates a').count(),0);fail=false;await page.getByRole('button',{name:'檢查更新',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#app-updates button:last-child').disabled);assert.match(await status().innerText(),/尚未讀取/);report.checks.push('Full settings catalog failure has no false current or download link; actual retry recovers');
 hold=true;await page.getByRole('button',{name:'檢查更新',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#app-updates button:last-child').disabled);assert(held.length);hold=false;await switchTo('B');for(const resolve of held)resolve();held=[];await page.waitForTimeout(100);assert.match(await status().innerText(),/尚未讀取/);assert.equal(await page.evaluate(()=>TimehutAccounts.status().user.id),users.B.id);report.checks.push('In-flight A catalog query across actual B sign-in/navigation cannot overwrite new B settings');
 await page.locator('#app-updates').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'settings-update-b.png'),fullPage:true});
 assert.equal(report.requests.filter(r=>r.unexpected).length,0);assert.deepEqual(report.runtimeErrors,[]);report.status='PASS_BOUNDED_FULL_SETTINGS_UPDATE_INTEGRATION';
 }catch(e){report.error=e.stack;process.exitCode=1;}finally{for(const resolve of held)resolve();await browser?.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,groups:report.checks.length,error:report.error}));}}
run();
