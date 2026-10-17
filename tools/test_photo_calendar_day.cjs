/* Calendar behavior and actual album-page reader; no network or product writes. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),before=process.argv[2];
if(before)assert.equal(path.resolve(before),path.join(root,'.codex-local/qa/20261017-product-journey-preparation/before-calendar-day-fix'));
const sourceRoot=before||root,read=n=>fs.readFileSync(path.join(sourceRoot,n),'utf8');
const timeline=read('js/timeline.js');
function actualFunction(name){const start=timeline.indexOf('function '+name+'(');assert(start>=0);const end=timeline.indexOf('\n\n/**',start);assert(end>start);return timeline.slice(start,end);}
const ctx=vm.createContext({window:{},CONFIG:{FAMILY_MEMBERS:[]},console,URL,URLSearchParams,setTimeout,clearTimeout});
vm.runInContext(read('js/utils.js')+'\n'+actualFunction('findUploaderTag')+'\n'+actualFunction('groupPhotosToMoments')+'\n'+read('js/flickr.js'),ctx);
const same=[0,1,2,3].map(i=>({id:String(i),datetaken:'2026-10-17T07:44:0'+i+'.123Z',tags:'uploader:人工'}));
ctx.rows=same;assert.equal(vm.runInContext('groupPhotosToMoments(rows).length',ctx),1,'Same displayed calendar day must produce one moment');
assert(!before,'The old source should fail the grouping assertion');
const zone=process.env.TZ;assert(['UTC','Asia/Taipei','America/Los_Angeles'].includes(zone));
const day=p=>{ctx.photo=p;return vm.runInContext('photoCalendarDay(photo)',ctx);};
let checks=1;
const cases=[
 [{datetaken:'2024-02-29'},'2024-02-29'],[{datetaken:'2024-02-29 23:59:59'},'2024-02-29'],
 [{datetaken:'2024-02-29T23:59:59'},'2024-02-29'],
 [{datetaken:'2024-02-29T23:30:00.123Z'},zone==='Asia/Taipei'?'2024-03-01':'2024-02-29'],
 [{datetaken:'2024-03-01T07:30:00+08:00'},zone==='Asia/Taipei'?'2024-03-01':'2024-02-29'],
 [{dateupload:'1709249400'},zone==='Asia/Taipei'?'2024-03-01':'2024-02-29'],
 [{datetaken:'2023-02-29'},'unknown'],[{datetaken:'2024-02-30'},'unknown'],
 [{datetaken:'2024-13-01'},'unknown'],[{datetaken:'2024-02-29T24:01:00'},'unknown'],
 [{datetaken:'invalid',dateupload:0},zone==='America/Los_Angeles'?'1969-12-31':'1970-01-01'],
 [{dateupload:''},'unknown'],[{dateupload:-1},'unknown'],[{},'unknown']
];
for(const [photo,expected] of cases){assert.equal(day(photo),expected,JSON.stringify(photo));checks++;}
const original=JSON.stringify(same);ctx.rows=same;const grouped=vm.runInContext('groupPhotosToMoments(rows)',ctx);assert.equal(grouped[0].dateKey,'2026-10-17');assert.equal(grouped[0].photos.length,4);assert.equal(JSON.stringify(same),original);checks+=3;
const album=read('album.html');
for(const name of ['formatDateLabel','formatDate']){
 const start=album.indexOf('        function '+name+'(');assert(start>=0);
 const end=album.indexOf('\n        function ',start+1);assert(end>start);
 vm.runInContext(album.slice(start,end),ctx);
}
ctx.date='2024-03-01';assert.equal(vm.runInContext('formatDateLabel(date)',ctx),'3月 1日');assert.equal(vm.runInContext('formatDate(date)',ctx),'2024年3月1日');checks+=2;
async function main(){
 const api=ctx.window.FlickrAPI,photos=[{id:'naive',datetaken:'2024-03-01 08:00:00'},{id:'zoned',datetaken:'2024-02-29T23:30:00Z'},{id:'date',datetaken:'2024-03-01'},{id:'other',datetaken:'2024-02-28 09:00:00'}];
 const want=zone==='Asia/Taipei'?['naive','zoned','date']:['naive','date'],progress=[];
 api.getAlbumPhotos=async(_album,page)=>({page,pages:2,photos:page===1?photos.slice(0,2):photos.slice(2)});
 let actual=await api.getAlbumDayPhotos('synthetic-album','2024-03-01',(rows,meta)=>progress.push({ids:rows.map(x=>x.id),...meta}));
 assert.deepEqual(Array.from(actual,x=>x.id),want);assert.equal(progress.at(-1).completed,2);checks+=2;
 actual=await api.getAlbumDayPhotos('synthetic-album','2024-03-01',()=>{},want);assert.deepEqual(Array.from(actual,x=>x.id),want);checks++;
 console.log(JSON.stringify({status:'PASS_PHOTO_CALENDAR_DAY_AND_ACTUAL_ALBUM_READER',timezone:zone,checks,networkRequests:0,formalCredit:0}));
}main().catch(e=>{console.error(e.stack);process.exitCode=1;});
