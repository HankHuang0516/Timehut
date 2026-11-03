'use strict';
const crypto=require('node:crypto');
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const fail=(code,status=400)=>{throw Object.assign(Error(code),{status});};
// Adding this router alone never enables automation. All canonical adapters
// (including the actual terminal completion verifier) must be installed first.
function installWorkerRoutes(app,accounts,authority,{express,workerToken,integration={},standingGrants=null}={}){
 const names=['saveAnalysis','decide','importSource','getCompletion','verifyTerminal'];
 const ready=()=>authority.capabilities().enabled===true&&names.every(n=>typeof integration[n]==='function');
 const reply=fn=>async(req,res)=>{res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});try{await fn(req,res);}catch(e){if(res.headersSent)return res.destroy();const status=[400,401,403,404,409,413,429].includes(e.status)?e.status:503;res.status(status).json({error:status===503?'AUTOMATION_UNAVAILABLE':e.message});}};
 const ensureReady=()=>{if(!ready())fail('AUTOMATION_NOT_READY',503);};
 const canonical=(prefix)=>(req,res,next)=>{const p=new URL(req.originalUrl,'http://localhost').pathname;if(!p.startsWith(prefix)||p.includes('%')||p.includes('//')||p.endsWith('/'))return res.sendStatus(404);next();};
 const current=req=>{authority.inbox.store.assertAvailable();const p=authority.inbox.store.principal(req.accountToken);if(!p||p.id!==req.actor?.id)fail('ACCOUNT_NOT_CURRENT',401);return p.id;};
 const accountRoot='/api/accounts/line-autonomy';const account=express.Router({caseSensitive:true,strict:true});account.use(canonical(accountRoot));account.use(accounts.authenticate);
 account.get('/setup',reply((req,res)=>{if(!exact(req.query,['sourceType','sourceId','albumIds'])||typeof req.query.albumIds!=='string')fail('INVALID_SETUP_QUERY');res.json(authority.preview(current(req),{sourceType:req.query.sourceType,sourceId:req.query.sourceId,albumIds:req.query.albumIds.split(',')}));}));
 account.get('/collections',reply((req,res)=>{if(Object.keys(req.query).length)fail('INVALID_COLLECTION_QUERY');res.json({collections:authority.collectionPreviews(current(req))});}));
 account.post('/runs',reply((req,res)=>{ensureReady();res.json(authority.createRun(current(req),req.body));}));
 // Existing historical grants remain readable/revocable. New processing is
 // authorized solely by saved collection bindings; no grant may be created.
 account.get('/grants',reply((req,res)=>{ensureReady();if(!standingGrants)fail('STANDING_GRANT_UNAVAILABLE',503);res.json({grants:standingGrants.list(current(req))});}));
 account.post('/grants',reply((req,res)=>{current(req);res.status(409).json({error:'COLLECTION_SETTINGS_REQUIRED'});}));
 account.delete('/grants/:grantId',reply((req,res)=>{ensureReady();if(!standingGrants)fail('STANDING_GRANT_UNAVAILABLE',503);res.json(standingGrants.revoke(current(req),req.params.grantId));}));
 account.delete('/runs/:runId',reply((req,res)=>{if(!uuid(req.params.runId))fail('INVALID_RUN');res.json(authority.cancelRun(current(req),req.params.runId));}));
 accounts.router.use('/line-autonomy',account);accounts.router.use('/line-autonomy',(err,req,res,next)=>res.status(err.type==='entity.too.large'?413:400).json({error:'INVALID_AUTOMATION_BODY'}));
 const root='/api/internal/line-autonomy/v1',worker=express.Router({caseSensitive:true,strict:true});worker.use(canonical(root));
 worker.use((req,res,next)=>{res.set('Cache-Control','private, no-store');if(typeof workerToken!=='string'||workerToken.length<32)return res.sendStatus(503);const a=Buffer.from(req.get('Authorization')||''),b=Buffer.from('Bearer '+workerToken);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.sendStatus(401);next();});
 worker.use(express.json({limit:'32kb',strict:true}));
 const scope=req=>{if(!uuid(req.params.runId)||typeof req.get('X-Timehut-Automation-Run')!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(req.get('X-Timehut-Automation-Run')))fail('RUN_CAP_REQUIRED',401);return {runId:req.params.runId,cap:req.get('X-Timehut-Automation-Run')};};
 const item=req=>{const s=scope(req);if(!uuid(req.params.itemId))fail('INVALID_ITEM');authority.item(s.runId,s.cap,req.params.itemId);return {...s,itemId:req.params.itemId};};
 worker.get('/capabilities',reply((req,res)=>res.json({...authority.capabilities(),enabled:ready()})));
 worker.get('/runs/:runId/scope',reply((req,res)=>{ensureReady();const s=scope(req);res.json(authority.scope(s.runId,s.cap));}));
 worker.post('/runs/:runId/next',reply((req,res)=>{ensureReady();const s=scope(req),j=authority.next(s.runId,s.cap);if(j)res.json(j);else res.sendStatus(204);}));
 worker.get('/runs/:runId/jobs/:itemId/status',reply((req,res)=>{ensureReady();const s=item(req),c=authority.assertMutable(s.runId,s.cap,s.itemId);res.json({runId:s.runId,itemId:s.itemId,ownerId:c.run.user_id,sourceId:c.run.parsedScope.sourceId,sha256:c.item.sha256,bytes:c.item.bytes,scopeDigest:c.run.scope_digest,current:true});}));
 worker.post('/runs/:runId/jobs/:itemId/readers',reply((req,res)=>{ensureReady();const s=item(req);res.json(authority.acquireReader(s.runId,s.cap,s.itemId));}));
 worker.delete('/runs/:runId/jobs/:itemId/readers/:readerId',reply((req,res)=>{const s=scope(req);if(!uuid(req.params.itemId)||!uuid(req.params.readerId))fail('INVALID_READER');res.json(authority.releaseReader(s.runId,s.cap,req.params.itemId,req.params.readerId));}));
 for(const [path,method]of [['analysis','saveAnalysis'],['decision','decide'],['import','importSource']])worker.post('/runs/:runId/jobs/:itemId/'+path,reply(async(req,res)=>{ensureReady();const s=item(req);authority.assertMutable(s.runId,s.cap,s.itemId);const result=await integration[method]({authority,...s,body:req.body});authority.assertMutable(s.runId,s.cap,s.itemId);res.json(result);}));
 worker.get('/runs/:runId/jobs/:itemId/completion',reply(async(req,res)=>{ensureReady();const s=item(req);const result=await integration.getCompletion({authority,...s});authority.item(s.runId,s.cap,s.itemId);res.json(result);}));
 worker.post('/runs/:runId/jobs/:itemId/cleanup-permit',reply((req,res)=>{ensureReady();const s=item(req),b=req.body;if(!exact(b,['sha256','bytes','decisionDigest','completionDigest'])||!sha(b.sha256)||!sha(b.decisionDigest)||!sha(b.completionDigest))fail('INVALID_COMPLETION_BINDING');const j=authority.item(s.runId,s.cap,s.itemId).item;if(b.sha256!==j.sha256||b.bytes!==j.bytes)fail('COMPLETION_SOURCE_CHANGED',409);res.json(authority.acquireTerminalPermit(s.runId,s.cap,s.itemId,b,context=>integration.verifyTerminal({...context,authority})));}));
 worker.get('/runs/:runId/jobs/:itemId/cleanup-permits/:permitId',reply((req,res)=>{ensureReady();const s=item(req);if(!uuid(req.params.permitId))fail('INVALID_PERMIT');res.json(authority.validateTerminalPermit(s.runId,s.cap,s.itemId,req.params.permitId,context=>integration.verifyTerminal({...context,authority})));}));
 // Closing an already issued permit only releases its metadata fence. This may
 // still be acknowledged after source/run cancellation, but grants no new read
 // or upload rights; core authority authenticates the original bounded cap.
 worker.post('/runs/:runId/jobs/:itemId/cleanup-ack',reply((req,res)=>{const s=scope(req),b=req.body;if(!uuid(req.params.itemId)||!exact(b,['permitId','mediaAbsent','receiptRetained'])||!uuid(b.permitId))fail('INVALID_CLEANUP_ACK');res.json(authority.closeTerminalPermit(s.runId,s.cap,req.params.itemId,b.permitId,b));}));
 worker.use((err,req,res,next)=>res.status(err.type==='entity.too.large'?413:400).json({error:'INVALID_AUTOMATION_BODY'}));
 app.use(root,worker);return {ready};
}
module.exports={installWorkerRoutes};
