/* Only public UI assets. No account config, API receipts or family media is cached. */
const cacheName='timehut-public-shell-20261014-install-entry-v1';
const shell=['offline.html','css/style.css','css/storybook.css','assets/storybook-upload-v1.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(shell)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('timehut-public-shell-')&&name!==cacheName).map(name=>caches.delete(name)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url),base=new URL('./',self.location.href);
 if(url.origin!==base.origin)return;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('offline.html',base).href)));return;
 }
 if(shell.some(path=>url.href===new URL(path,base).href))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
