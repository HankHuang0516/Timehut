/* Exact flat server startup and new read route; local SQLite, outbound denied. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const artifact=path.resolve(process.argv[2]);assert(artifact.startsWith('/Users/hank/.local/share/project-storage/internal/builds/timehut-backend-candidate71-')&&path.basename(artifact)==='backend');
assert.equal(process.version,'v24.22.0');
const out=path.join(path.dirname(artifact),'smoke-'+Date.now());fs.mkdirSync(out);const runtime=path.join(out,'backend');fs.cpSync(artifact,runtime,{recursive:true});
const report={status:'FAIL',checks:[],node:process.version,providerRequests:0,productionChanged:false,scope:'Exact packaged server.js startup/health/new read-route wiring; only artificial local accounts/SQLite. No production/native/background/fullformal credit.'};let child;
async function main(){try{
 const {SQLiteAccountStore}=require(path.join(runtime,'account-sqlite-store')),
  owner=require(path.join(runtime,'account-owner-bootstrap')),s=new SQLiteAccountStore(path.join(runtime,'uploads/.accounts'));
 const reservation=owner.reserve(s,'synthetic-owner',[{name:'Synthetic',birthDate:'2026-01-01',albumId:'90000009001'}]);
 const household=await owner.provision(s,{username:'synthetic-owner',bindingId:reservation.bindingId,password:'synthetic-local-only-password',displayName:'Synthetic owner'});
 const a=await s.register('synthetic-alpha','synthetic-local-only-password','Synthetic A'),b=await s.register('synthetic-bravo','synthetic-local-only-password','Synthetic B');const album=s.album(b.id,'Synthetic B','2026-01-01');
 const token=(await s.login('synthetic-alpha','synthetic-local-only-password')).token;s.close();
 const guard=path.join(out,'deny-outbound.cjs');fs.writeFileSync(guard,"for(const n of ['http','https']){const m=require(n);m.get=m.request=()=>{console.error('OUTBOUND_DENIED');throw Error('Outbound denied');};}global.fetch=async()=>{console.error('OUTBOUND_DENIED');throw Error('Outbound denied');};");
 const socket=http.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 let log='';child=spawn(process.execPath,['--require',guard,'server.js'],{cwd:runtime,env:{PATH:process.env.PATH,NODE_PATH:'/Users/hank/.local/share/project-storage/internal/builds/timehut-public-server-deps-nzhqt5a3/node_modules',PORT:String(port),TIMEHUT_BIND_HOST:'127.0.0.1',TIMEHUT_PUBLIC_REGISTRATION:'true',TIMEHUT_ACCEPT_SIGNUPS:'true',TIMEHUT_LEGACY_OWNER_ID:household.ownerUserId,FLICKR_API_KEY:'synthetic',FLICKR_API_SECRET:'synthetic',FLICKR_USER_ID:'0@N00',FLICKR_OAUTH_TOKEN:'',FLICKR_OAUTH_TOKEN_SECRET:''}});
 child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);const base='http://127.0.0.1:'+port;
 async function get(route,auth=true){return fetch(base+route,{headers:auth?{Authorization:'Bearer '+token,Origin:'https://localhost'}:{},signal:AbortSignal.timeout(5000)});}
 try{
  let health;for(let i=0;i<100;i++){if(child.exitCode!==null)break;try{health=await get('/health',false);break;}catch{await new Promise(r=>setTimeout(r,50));}}
  assert(health,'Local candidate did not start: '+log);const h=await health.json(),v=await (await get('/api/version',false)).json();
  assert.equal(h.version,'1.0.71');assert.equal(v.version,h.version);assert.equal(h.build,'2026.10.17.1');assert.equal(v.build,h.build);report.checks.push('Actual packaged startup, /health and /api/version agree with package/lock71 and build');
  let response=await get('/api/accounts/photo-deletions');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);const data=await response.json();assert.deepEqual(data.items,[]);assert.equal(data.total,0);report.checks.push('Production server wiring serves authenticated own deletion status, private/no-store');
  assert.equal((await get('/api/accounts/photo-deletions',false)).status,401);assert.equal((await get('/api/accounts/photo-deletions?page=0')).status,400);assert.equal((await get('/api/accounts/photo-deletions?album='+album.id)).status,404);report.checks.push('Unauthenticated, invalid-query and foreign-album controls reject at actual server boundary');
  for(const rel of ['settings.html','js/update-notice.js','js/deletion-status.js','releases.json']){const r=await get('/app/'+rel,false);assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.deepEqual(bytes,fs.readFileSync(path.join(artifact,'public-app',rel)));}
  const catalog=await (await get('/app/releases.json',false)).json();assert.equal(catalog.releases.find(r=>r.channel==='android-private-test').versionCode,94);report.checks.push('Exact new public dependencies served; catalog retains published94 and excludes candidate95');
  assert(!log.includes('OUTBOUND_DENIED'));report.status='PASS_BOUNDED_EXACT_BACKEND71_STARTUP_AND_NEW_READ_ROUTE';
 }finally{if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}fs.writeFileSync(path.join(out,'startup.txt'),log);}
 }catch(e){report.error=e.stack;process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(path.dirname(artifact),'smoke-latest.json'),JSON.stringify({out,status:report.status})+'\n');console.log(JSON.stringify(report));}}
main();
