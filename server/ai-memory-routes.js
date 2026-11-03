'use strict';
const crypto=require('node:crypto');
function installMemoryRoutes(app,accounts,engine,{express,workerToken='',provider,photoViews,claimsAdmitted=()=>true}={}){
 const ready=typeof workerToken==='string'&&workerToken.length>=32;
 const authorized=(req,res,next)=>{res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});if(!ready)return res.status(503).json({error:'AI 工作器尚未設定'});const raw=req.get('Authorization')||'',expected=Buffer.from('Bearer '+workerToken),supplied=Buffer.from(raw);if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))return res.status(401).json({error:'Unauthorized'});next();};
 const current=req=>{engine.store.assertAvailable();if(engine.store.principal(req.accountToken)?.id!==req.actor?.id)throw Object.assign(Error('登入已失效'),{status:401});return req.actor.id;};
 const reply=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){if(res.headersSent)return res.destroy();res.status([400,401,404,409].includes(error.status)?error.status:503).json({error:error.status?error.message:'拾光暫時無法使用，請稍後重試。'});}};
 const pack=(req,items)=>{current(req);const photos=photoViews(items.map(i=>i.row),req);current(req);return items.map((item,i)=>({...photos[i],analysis:item.result}));};
 const router=accounts.router,auth=accounts.authenticate;
 router.get('/ai-memories',auth,reply((req,res)=>{const user=current(req),status=engine.status(user);res.json({counts:status.counts,analyzed:status.analyzed,settings:engine.selection(user),workerConfigured:ready});}));
 router.put('/ai-memories/settings',auth,reply((req,res)=>res.json({settings:engine.configureSelection(current(req),req.body)})));
 router.get('/ai-memories/search',auth,reply((req,res)=>{const found=engine.search(current(req),{query:req.query.q??'',album:req.query.album??null,page:Number(req.query.page??1)});res.json({...found,items:pack(req,found.items)});}));
 router.get('/ai-memories/daily',auth,reply((req,res)=>{const memory=engine.daily(current(req));res.json({memory:memory?{...pack(req,[memory])[0],day:memory.day,favorite:!!memory.pref?.favorite}:null});}));
 router.get('/ai-memories/photos/:id',auth,reply((req,res)=>res.json({analysis:engine.analysis(current(req),req.params.id)})));
 router.put('/ai-memories/photos/:id',auth,reply((req,res)=>res.json({analysis:engine.edit(current(req),req.params.id,req.body)})));
 router.post('/ai-memories/photos/:id/reanalyze',auth,reply((req,res)=>res.json({queued:engine.enqueue(current(req),req.params.id,{force:true})})));
 router.post('/ai-memories/photos/:id/feedback',auth,reply((req,res)=>res.json(engine.feedback(current(req),req.params.id,req.body?.action))));
 router.delete('/ai-memories',auth,reply((req,res)=>res.json(engine.erase(current(req)))));
 const worker=express.Router();worker.use(authorized);worker.use(express.json({limit:'16kb'}));
 worker.post('/next',reply(async(req,res)=>{if(!claimsAdmitted())return res.status(503).json({error:'拾光工作器正在等待更新檢查完成'});await engine.discover();if(!claimsAdmitted())return res.status(503).json({error:'拾光工作器正在等待更新檢查完成'});const job=engine.claim();if(!job)return res.status(204).end();res.json(job);}));
 worker.get('/jobs/:id/thumbnail',reply(async(req,res)=>{const bytes=await provider.thumbnail(engine,req.params.id,req.get('X-Timehut-AI-Lease'));res.type('image/jpeg').send(bytes);}));
 worker.post('/jobs/:id/check',reply((req,res)=>{engine.authorize(req.params.id,req.get('X-Timehut-AI-Lease'),req.body?.phase??null);res.status(204).end();}));
 worker.post('/jobs/:id/result',reply((req,res)=>{engine.finish(req.params.id,req.get('X-Timehut-AI-Lease'),req.body);res.status(204).end();}));
 // Mount before the ordinary account gateway; the service token authorizes
 // only this queue and short-lived leases, never an ordinary account API.
 app.use('/api/internal/ai-memories',worker);
}
module.exports={installMemoryRoutes};
