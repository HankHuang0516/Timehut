(() => {
 if (!('serviceWorker' in navigator) || window.Capacitor?.isNativePlatform?.()) return;
 if (location.protocol !== 'https:' && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') return;
 navigator.serviceWorker.register('service-worker.js',{scope:'./'}).catch(()=>{});
})();
