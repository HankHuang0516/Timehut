/* Public UI only. Private pages, credentials, media, API replies and APKs stay out. */
const CACHE='timehut-public-assets-v20261016-1';
const base=new URL('./',self.location.href);
const shell=['offline.html','css/style.css?v=20261014.2','css/storybook.css?v=20261014.2','assets/storybook-upload-v1.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(shell)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name!==CACHE&&(name.startsWith('timehut-public-shell-')||name.startsWith('timehut-public-assets-'))).map(name=>caches.delete(name)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match(new URL('offline.html',base).href))));return;
 }
 const relative=url.pathname.slice(base.pathname.length);
 if(!/^(assets|css|js)\/.*\.(png|jpg|ico|css|js)$/.test(relative)||/(^|\/)config\.js$/.test(relative)||url.searchParams.has('ticket')||event.request.headers.has('Authorization'))return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  try{const response=await fetch(event.request);if(response.ok&&response.type==='basic')await cache.put(event.request,response.clone());return response;}
  catch(error){const saved=await cache.match(event.request);if(saved)return saved;throw error;}
 }));
});
