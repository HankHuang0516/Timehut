/* Private, bounded decoded previews. Originals and videos are never prefetched. */
(() => {
    'use strict';
    const cache = new Map(), maxBytes = 18 * 1024 * 1024, maxFileBytes = 6 * 1024 * 1024;
    let epoch = 0, active = null, panel = null, label = null, retry = null, currentScope = null;
    const scope = () => { const s = window.TimehutAccounts?.status?.(); return JSON.stringify([s?.user?.id || (CONFIG.ACCOUNT_MODE ? null : 'legacy'), s?.generation]); };
    function positionStatus() {
        const image = document.getElementById('modalImage'), content = document.querySelector('#photoModal .modal-content');
        if (!panel || panel.hidden || !image || !content) return;
        const box = image.getBoundingClientRect(), parent = content.getBoundingClientRect();
        if (!box.height || !box.width) return;
        panel.style.left = (box.left - parent.left + box.width / 2) + 'px';
        panel.style.top = (box.top - parent.top + box.height / 2) + 'px';
    }
    function mount() {
        if (panel?.isConnected) return;
        panel = document.createElement('div'); panel.className = 'viewer-image-status'; panel.hidden = true;
        label = document.createElement('p'); label.setAttribute('role', 'status'); label.setAttribute('aria-live', 'polite');
        retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新載入照片'; retry.hidden = true;
        retry.addEventListener('click', () => { if (active) { const saved = active; remove(saved.key); void show(saved.photo, saved.photos, saved.index); } });
        panel.append(label, retry); document.querySelector('#photoModal .modal-content')?.append(panel);
        if (window.ResizeObserver) new ResizeObserver(positionStatus).observe(document.getElementById('modalImage'));
    }
    function remove(key) {
        const row = cache.get(key); if (!row) return;
        cache.delete(key); row.controller.abort(); if (row.url) URL.revokeObjectURL(row.url);
    }
    function clear() {
        epoch++; active = null; for (const key of [...cache.keys()]) remove(key); currentScope = null;
        if (panel) panel.hidden = true;
        const image = document.getElementById('modalImage');
        if (image) { image.style.visibility = 'hidden'; image.removeAttribute('src'); image.removeAttribute('data-loaded-photo-id'); }
    }
    const sourceFor = photo => window.FlickrAPI.getPhotoUrl(photo, photo.media === 'video' ? 'm' : 'l') || window.FlickrAPI.getPhotoUrl(photo, 'm');
    const keyFor = photo => String(photo.id) + ':' + sourceFor(photo);
    function trim(wanted) {
        for (const key of [...cache.keys()]) if (!wanted.has(key)) remove(key);
        let bytes = [...cache.values()].reduce((sum,row) => sum + (row.bytes || 0), 0);
        for (const [key,row] of cache) {
            if (bytes <= maxBytes) break;
            if (key === active?.key) continue;
            bytes -= row.bytes || 0; remove(key);
        }
    }
    function load(photo) {
        const key = keyFor(photo); if (cache.has(key)) return cache.get(key).promise;
        const authority = currentScope, controller = new AbortController(), row = {controller, bytes:0, url:null};
        cache.set(key, row);
        const valid = () => cache.get(key) === row && currentScope === authority && scope() === authority && !controller.signal.aborted;
        const timeout = setTimeout(() => controller.abort(), 15000);
        row.promise = (async () => {
            let source = sourceFor(photo), response;
            if (!source) throw new Error('照片暫時無法顯示。');
            const read = url => (window.TimehutAPI?.fetch.bind(window.TimehutAPI) || fetch)(url, {signal:controller.signal, cache:'default'});
            response = await read(source);
            if (!response.ok && [401,403,404].includes(response.status) && valid()) {
                await response.body?.cancel();
                const fresh = await window.FlickrAPI.refreshPhotoPreviewSource(source, {isCurrent:valid});
                if (fresh && valid()) { source = fresh; response = await read(fresh); }
            }
            if (!response.ok || !valid()) { await response.body?.cancel(); throw new Error('照片暫時無法顯示。'); }
            const length = Number(response.headers.get('Content-Length'));
            if (length > maxFileBytes) { controller.abort(); throw new Error('照片較大，請下載原圖查看。'); }
            const type = response.headers.get('Content-Type') || '';
            if (!/^image\//i.test(type) || /svg/i.test(type)) { await response.body?.cancel(); throw new Error('照片格式暫時無法顯示。'); }
            // Enforce the cap while reading, including responses without Content-Length.
            const reader = response.body?.getReader(), parts = []; let received = 0;
            if (!reader) throw new Error('照片暫時無法顯示。');
            try {
                while (true) {
                    const part = await reader.read(); if (part.done) break;
                    received += part.value.byteLength;
                    if (!valid() || received > maxFileBytes) { controller.abort(); throw new Error('照片讀取已停止。'); }
                    parts.push(part.value);
                }
            } catch (error) { await reader.cancel().catch(() => {}); throw error; }
            const blob = new Blob(parts, {type});
            if (!valid()) throw new Error('照片已切換。');
            if (!blob.size || blob.size > maxFileBytes || !/^image\//i.test(blob.type) || /svg/i.test(blob.type)) throw new Error('照片暫時無法顯示，請重試。');
            row.bytes = blob.size; row.url = URL.createObjectURL(blob);
            const decoded = new Image(); decoded.src = row.url; await decoded.decode();
            if (!valid()) throw new Error('照片已切換。');
            row.decoded = decoded; return row;
        })().catch(error => { if (cache.get(key) === row) remove(key); throw error; }).finally(() => clearTimeout(timeout));
        // An obsolete prefetch may be aborted before a viewer awaits it.
        row.promise.catch(() => {});
        return row.promise;
    }
    async function show(photo, photos = [photo], index = 0) {
        const authority = scope(); if (currentScope !== authority) clear(); currentScope = authority;
        mount(); const image = document.getElementById('modalImage'); if (!image) return;
        const version = ++epoch, key = keyFor(photo); active = {photo, photos, index, key};
        // Remove the old pixels in the same task as the new title and counter.
        image.style.visibility = 'hidden'; image.removeAttribute('src'); image.removeAttribute('data-loaded-photo-id');
        image.dataset.requestedPhotoId = String(photo.id); image.alt = photo.title || '相簿照片';
        panel.hidden = false; retry.hidden = true; label.textContent = '正在翻開這張照片…';
        positionStatus(); requestAnimationFrame(positionStatus);
        const radius = navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '') ? 0 : 2;
        const nearby = [photo, ...Array.from({length:radius}, (_,n) => [photos[index+n+1],photos[index-n-1]]).flat().filter(row => row && row.media !== 'video')];
        const wanted = new Set(nearby.map(keyFor)); trim(wanted);
        const valid = () => epoch === version && currentScope === authority && scope() === authority && document.getElementById('photoModal')?.classList.contains('active');
        try {
            const row = await load(photo); if (!valid()) return;
            image.src = row.url; await image.decode(); if (!valid()) return;
            image.dataset.loadedPhotoId = String(photo.id); image.style.visibility = 'visible'; panel.hidden = true;
            // Current image first, then two bounded sequential lanes of neighbours.
            const prefetch = nearby.slice(1); let next = 0;
            for (let lane = 0; lane < Math.min(2, prefetch.length); lane++) void (async () => {
                while (valid() && next < prefetch.length) { const neighbour = prefetch[next++]; try { await load(neighbour); } catch (_) {} if (valid()) trim(wanted); }
            })();
        } catch (_) {
            if (valid()) { label.textContent = '這張照片暫時無法載入。請重試，或繼續翻下一張。'; retry.hidden = false; panel.hidden = false; }
        }
    }
    window.TimehutViewerImages = {show, clear, retry:() => retry?.click()};
    window.addEventListener('timehut-account-changed',clear);
    window.addEventListener('pagehide',()=>{clear();if(document.getElementById('photoModal')?.classList.contains('active'))window.closeModal?.();});
})();
