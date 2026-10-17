/* Test preload: every provider request maps to this run's loopback fixture. */
'use strict';
const http=require('node:http'),https=require('node:https');
const fixture=new URL(process.env.TIMEHUT_SYNTHETIC_PROVIDER_ORIGIN);
if(fixture.protocol!=='http:'||fixture.hostname!=='127.0.0.1'||!fixture.port||fixture.pathname!=='/')throw Error('Explicit loopback fixture required');
const request=http.request.bind(http),fetch=global.fetch;
function target(raw){
 const u=new URL(raw);if(u.protocol!=='https:')throw Error('OUTBOUND_DENIED');
 if(['api.flickr.com','up.flickr.com'].includes(u.hostname)&&/^\/services\/(rest|upload)\/$/.test(u.pathname))return new URL(u.pathname+u.search,fixture);
 if(u.hostname==='live.staticflickr.com'&&/^\/synthetic-journey\/900199\d{6}\/(original(?:\.mp4)?|poster)$/.test(u.pathname))return new URL('/media/'+u.pathname.split('/').slice(2).join('/'),fixture);
 throw Error('OUTBOUND_DENIED');
}
https.request=function(input,options,callback){
 if(typeof options==='function'){callback=options;options={};}
 const opts=typeof input==='string'||input instanceof URL?{...options}:{...input};
 const u=typeof input==='string'||input instanceof URL?new URL(input):new URL('https://'+(opts.hostname||opts.host)+(opts.path||'/'));
 const headers={...opts.headers};delete headers.host;return request(target(u),{method:opts.method||'GET',headers,timeout:opts.timeout},callback);
};
https.get=function(...args){const r=https.request(...args);r.end();return r;};
http.request=function(input,...args){const host=typeof input==='string'||input instanceof URL?new URL(input).hostname:input.hostname||input.host;if(!['127.0.0.1','localhost'].includes(host))throw Error('OUTBOUND_DENIED');return request(input,...args);};
global.fetch=function(input,options){return fetch(target(typeof input==='string'||input instanceof URL?input:input.url),options);};
