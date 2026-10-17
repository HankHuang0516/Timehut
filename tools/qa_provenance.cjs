/* Test evidence only: read owned synthetic SSD snapshot, never production config. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function capture(origin,harness){
 assert.equal(new URL(origin).hostname,'127.0.0.1');
 const res=await fetch(origin+'/snapshot-manifest.json',{redirect:'error',signal:AbortSignal.timeout(8000)});assert.equal(res.status,200);const manifest=await res.json();
 assert.equal(new URL(manifest.url).origin,origin);assert.equal(manifest.production_credentials_copied,false);assert.equal(manifest.source_config_copied,false);
 assert(manifest.snapshot.startsWith('/Users/hank/.local/share/project-storage/internal/builds/timehut-ui-preview-'));
 const base=fs.realpathSync(manifest.snapshot);assert(base.startsWith('/Users/hank/.local/share/project-storage/internal/builds/timehut-ui-preview-'));
 const rows=manifest.files.map(row=>{assert(row.path!=='js/config.js');const f=path.resolve(base,row.path);assert(f.startsWith(base+'/'));const b=fs.readFileSync(f);return {path:row.path,bytes:b.length,sha256:hash(b)};});
 const safe=fs.readFileSync(path.join(base,'js/config.js'),'utf8');const config=JSON.parse(safe.trim().replace(/^const CONFIG = /,'').replace(/;$/,''));assert.equal(config.FLICKR_API_KEY,'local-preview');assert.equal(config.FLICKR_USER_ID,'local-preview');assert.equal(config.UPLOAD_API_URL,origin);
 return {origin,snapshot:base,sourceHead:manifest.source_head,syntheticConfig:true,snapshotFiles:rows,harness:{path:harness,sha256:hash(fs.readFileSync(harness))},capturedAt:new Date().toISOString()};
}
function verify(provenance){
 for(const row of provenance.snapshotFiles)assert.equal(hash(fs.readFileSync(path.join(provenance.snapshot,row.path))),row.sha256,row.path+' changed during test');
 assert.equal(hash(fs.readFileSync(provenance.harness.path)),provenance.harness.sha256,'Harness changed during test');
 return true;
}
module.exports={capture,verify,hash};
