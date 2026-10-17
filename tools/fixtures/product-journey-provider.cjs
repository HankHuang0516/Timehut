/* Loopback-only provider for an actual product-page journey. No live adapter. */
'use strict';
const http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const Busboy=createRequire('/Users/hank/.local/share/project-storage/internal/builds/timehut-public-server-deps-nzhqt5a3/package.json')('busboy');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const tags=s=>(s.match(/"[^"]*"|\S+/g)||[]).map(t=>t.replace(/^"|"$/g,''));
function createProvider(assets,runTag){
 assert.equal(assets.length,4);assert(/^[a-z0-9-]+$/.test(runTag));
 const remote=new Map(),ledger=[],creations=[];let serial=0;
 const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1'),event={method:req.method,path:u.pathname};ledger.push(event);
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  try{
   assert(['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress));
   if(u.pathname.startsWith('/media/')){
    const [, ,id,kind]=u.pathname.split('/');const row=remote.get(id);assert(row);
    const asset=kind==='poster'?assets[0]:row.asset,body=asset.buffer;
    const m=req.headers.range&&/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    const start=m?Number(m[1]):0,end=m&&m[2]?Math.min(Number(m[2]),body.length-1):body.length-1;
    assert(start>=0&&end>=start&&end<body.length);
    res.writeHead(m?206:200,{'Content-Type':asset.mimeType,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(m?{'Content-Range':`bytes ${start}-${end}/${body.length}`}:{})});return res.end(body.subarray(start,end+1));
   }
   if(u.pathname==='/services/upload/'){
    assert.equal(req.method,'POST');const fields={},files=[];
    const parser=Busboy({headers:req.headers,limits:{files:1,fileSize:1024*1024}});
    parser.on('field',(k,v)=>{assert(!Object.hasOwn(fields,k));fields[k]=v;});
    parser.on('file',(_n,stream,info)=>{const chunks=[];stream.on('data',b=>chunks.push(b));stream.on('end',()=>files.push({...info,body:Buffer.concat(chunks)}));});
    await new Promise((resolve,reject)=>{parser.on('close',resolve);parser.on('error',reject);req.pipe(parser);});
    assert.equal(files.length,1);const f=files[0],asset=assets.find(a=>a.name===f.filename);assert(asset);
    assert.equal(hash(f.body),hash(asset.buffer));assert.equal(f.mimeType,asset.mimeType);
    for(const k of ['is_public','is_friend','is_family'])assert.equal(fields[k],'0');
    assert(fields.tags.includes(runTag));assert.equal(fields.title,asset.name);
    assert(!creations.some(x=>x.filename===asset.name),'NO_DUPLICATE_CREATION');assert(++serial<=4);
    const id='900199'+String(serial).padStart(6,'0');const row={id,asset,tags:tags(fields.tags),date:new Date().toISOString().slice(0,10),private:true};remote.set(id,row);
    creations.push({id,filename:asset.name,bytes:f.body.length,sha256:hash(f.body),private:true});Object.assign(event,{id,filename:asset.name});
    res.writeHead(200,{'Content-Type':'application/xml'});return res.end('<rsp stat="ok"><photoid>'+id+'</photoid></rsp>');
   }
   assert.equal(u.pathname,'/services/rest/');let params=u.searchParams;
   if(req.method==='POST'){const chunks=[];for await(const b of req)chunks.push(b);params=new URLSearchParams(Buffer.concat(chunks).toString());}
   const method=params.get('method');event.api=method;
   if(method==='flickr.test.echo')return json({stat:'ok'});
   if(method==='flickr.test.login')return json({stat:'ok',user:{id:'0@N00'}});
   const id=params.get('photo_id');assert(/^900199\d{6}$/.test(id),'NEW_FAKE_IDS_ONLY');event.id=id;
   const row=remote.get(id);if(!row)return json({stat:'fail',code:1,message:'Photo not found'});
   if(method==='flickr.photos.getInfo')return json({stat:'ok',photo:{id,owner:{nsid:'0@N00'},media:row.asset.mimeType.startsWith('video/')?'video':'photo',secret:'synthetic-secret',title:{_content:row.asset.name},visibility:{ispublic:0,isfriend:0,isfamily:0},video:{ready:1},tags:{tag:row.tags.map(raw=>({raw,_content:raw.replace(/\s/g,'').toLowerCase()}))},dates:{taken:(row.date||'2024-01-02')+' 12:00:00',takengranularity:'0'}}});
   if(method==='flickr.photos.getSizes')return json({stat:'ok',sizes:{size:[{label:'Medium',source:'https://live.staticflickr.com/synthetic-journey/'+id+'/poster',media:'photo',width:128,height:128},{label:'Original',source:'https://live.staticflickr.com/synthetic-journey/'+id+'/original'+(row.asset.mimeType.startsWith('video/')?'.mp4':''),media:row.asset.mimeType.startsWith('video/')?'video':'photo',width:128,height:128}]}});
   if(method==='flickr.video.getStreamInfo')return json({stat:'ok',streams:{stream:['orig','720p'].map(type=>({type,_content:'https://live.staticflickr.com/synthetic-journey/'+id+'/original.mp4'}))}});
   if(method==='flickr.photos.getAllContexts')return json({stat:'ok',set:[]});
   assert.equal(req.method,'POST');
   if(method==='flickr.photos.setDates'){assert(/^\d{4}-\d{2}-\d{2} 12:00:00$/.test(params.get('date_taken')));row.date=params.get('date_taken').slice(0,10);}
   else if(method==='flickr.photos.setTags')row.tags=tags(params.get('tags'));
   else if(method==='flickr.photos.delete')remote.delete(id);
   else throw Error('UNEXPECTED_SYNTHETIC_METHOD');
   return json({stat:'ok'});
  }catch(error){event.error=error.message;return json({stat:'fail',code:2,message:'Local fixture rejected request'},500);}
 });
 return {server,remote,ledger,creations};
}
module.exports={createProvider};
