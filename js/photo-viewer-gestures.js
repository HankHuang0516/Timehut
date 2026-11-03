/* Photo-only gestures. Reuses each page's authenticated viewer/navigation. */
(() => {
    'use strict';
    function init() {
        const modal = document.getElementById('photoModal'), image = document.getElementById('modalImage');
        if (!modal || !image || modal.dataset.gesturesReady) return;
        modal.dataset.gesturesReady = 'true';
        const content = modal.querySelector('.modal-content'), points = new Map();
        let scale = 1, x = 0, y = 0, pinch = null, multi = false, lastTap = null;
        let historyKey = null, ignorePop = false, suppressClickUntil = 0, leavingPage = false, suspendedHistoryKey = null;
        const active = () => modal.classList.contains('active');
        const immersive = () => modal.classList.contains('viewer-immersive');
        const toolbar = document.createElement('div'); toolbar.className = 'photo-viewer-tools';
        toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', '照片預覽');
        function button(label, text, action) {
            const el = document.createElement('button'); el.type = 'button'; el.setAttribute('aria-label', label);
            el.textContent = text; el.addEventListener('click', event => { event.stopPropagation(); action(); }); toolbar.append(el); return el;
        }
        const full = button('全螢幕預覽照片', '⛶ 全螢幕', () => immersive() ? exitImmersive() : enterImmersive());
        const smaller = button('縮小照片', '−', () => zoom(scale - .5));
        const larger = button('放大照片', '＋', () => { enterImmersive(); zoom(scale + .5); });
        content.prepend(toolbar);
        const status = document.createElement('div'); status.className = 'photo-viewer-load-status'; status.hidden = true;
        const message = document.createElement('p'); message.setAttribute('role', 'status');
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重試照片';
        let refreshVersion=0,refreshAttempted=false,ownRefreshSource=null;
        function loadFailed(){message.textContent='照片暫時無法載入，可重試或關閉預覽。';status.hidden=false;}
        async function refreshImage(manual=false){
            if(window.TimehutViewerImages){if(manual)window.TimehutViewerImages.retry();return;}
            const source=image.getAttribute('src');
            if(!active()||image.hidden||image.dataset.viewerMedia==='video'||!source)return;
            if(!manual&&refreshAttempted){loadFailed();return;}
            if(manual)refreshVersion++;
            const version=refreshVersion;refreshAttempted=true;
            const current=()=>version===refreshVersion&&active()&&image.isConnected&&!image.hidden&&image.dataset.viewerMedia!=='video'&&image.getAttribute('src')===source;
            message.textContent='正在重新載入照片…';status.hidden=false;
            let fresh=null;
            try{fresh=await window.FlickrAPI?.refreshPhotoPreviewSource?.(source,{isCurrent:current});}catch(_){/* Show a retry without exposing request details. */}
            if(!current())return;
            if(fresh){ownRefreshSource=fresh;image.src=fresh;}
            else if(manual&&!CONFIG.ACCOUNT_MODE){image.src=source;}
            else loadFailed();
        }
        retry.addEventListener('click', event => { event.stopPropagation(); refreshImage(true); });
        status.append(message, retry); content.append(status);
        function paint() {
            const width = content.clientWidth, height = content.clientHeight;
            const boxWidth=image.clientWidth,boxHeight=image.clientHeight,fit=image.naturalWidth&&image.naturalHeight?Math.min(boxWidth/image.naturalWidth,boxHeight/image.naturalHeight):1;
            const paintedWidth=(image.naturalWidth||boxWidth)*fit*scale,paintedHeight=(image.naturalHeight||boxHeight)*fit*scale;
            let centerX=boxWidth/2,centerY=boxHeight/2,node=image;
            while(node&&node!==content){centerX+=node.offsetLeft;centerY+=node.offsetTop;node=node.offsetParent;}
            if(node!==content){centerX=width/2;centerY=height/2;}
            x=paintedWidth<=width?width/2-centerX:Math.max(width-paintedWidth/2-centerX,Math.min(paintedWidth/2-centerX,x));
            y=paintedHeight<=height?height/2-centerY:Math.max(height-paintedHeight/2-centerY,Math.min(paintedHeight/2-centerY,y));
            if (scale === 1) image.style.removeProperty('transform');
            else image.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
            const video=image.dataset.viewerMedia==='video',ready=image.complete&&image.naturalWidth>0;
            image.dataset.zoom = String(scale);full.disabled=video;smaller.disabled=scale<=1||video;larger.disabled=scale>=4||image.hidden||video||!ready;
        }
        function reset() { scale = 1; x = y = 0; pinch = null; multi = false; points.clear(); paint(); }
        function zoom(value) { if(!image.naturalWidth||image.dataset.viewerMedia==='video')return;scale = Math.max(1, Math.min(4, value)); if (scale === 1) x = y = 0; paint(); }
        function enterImmersive() {
            if (!active() || image.hidden || image.style.display === 'none' || image.dataset.viewerMedia==='video') return;
            if (!immersive()) {
                modal.classList.add('viewer-immersive'); full.textContent = '返回資訊'; full.setAttribute('aria-label', '返回照片資訊');
                rememberHistory();
            }
            paint();
        }
        function rememberHistory() {
            if (ignorePop || historyKey) return;
            historyKey = crypto.randomUUID(); history.pushState({...history.state, timehutPhotoPreview: historyKey}, '', location.href);
        }
        function retireHistory() {
            if (!leavingPage && historyKey && history.state?.timehutPhotoPreview === historyKey) { ignorePop = true; history.back(); }
            historyKey = null;
        }
        function exitImmersive() {
            if (immersive()) modal.classList.remove('viewer-immersive');
            full.textContent = '⛶ 全螢幕'; full.setAttribute('aria-label', '全螢幕預覽照片');
            reset(); retireHistory();
        }
        function tap(event) {
            const now = performance.now();
            if (lastTap && now - lastTap.at < 350 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 40) {
                lastTap = null; suppressClickUntil = now + 400;
                if (immersive()) zoom(scale > 1 ? 1 : 2); else enterImmersive();
            } else lastTap = {at: now, x: event.clientX, y: event.clientY};
        }
        // The first tap may open the normal viewer; the second can then land on its image.
        document.addEventListener('pointerup', event => {
            if (!active() && event.target.matches?.('.moment-photo,.album-photo-card img,.photo-card img')) lastTap = {at: performance.now(), x: event.clientX, y: event.clientY};
        }, true);
        image.draggable = false;
        image.addEventListener('pointerdown', event => {
            if (!active() || image.hidden || !image.complete || !image.naturalWidth || image.dataset.viewerMedia==='video' || (event.pointerType === 'mouse' && event.button !== 0)) return;
            points.set(event.pointerId, {startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, at: performance.now()});
            try { image.setPointerCapture?.(event.pointerId); } catch (_) { /* Pointer may already have been cancelled by the browser. */ }
            if (points.size === 2) { multi = true; lastTap = null; enterImmersive(); const [a,b] = [...points.values()]; pinch = {distance: Math.hypot(a.x-b.x,a.y-b.y), scale}; }
        });
        image.addEventListener('pointermove', event => {
            const point = points.get(event.pointerId); if (!point) return;
            const dx = event.clientX - point.x, dy = event.clientY - point.y; point.x = event.clientX; point.y = event.clientY;
            if (points.size === 2 && pinch?.distance > 0) { const [a,b] = [...points.values()]; zoom(pinch.scale * Math.hypot(a.x-b.x,a.y-b.y) / pinch.distance); }
            else if (scale > 1) { x += dx; y += dy; paint(); }
        });
        function release(event, cancelled) {
            const point = points.get(event.pointerId); if (!point) return;
            if (cancelled) lastTap = null;
            points.delete(event.pointerId);
            const dx = event.clientX - point.startX, dy = event.clientY - point.startY;
            if (!cancelled && !multi && active()) {
                if (scale === 1 && Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - point.at < 1200) {
                    lastTap = null; suppressClickUntil = performance.now() + 400; window.navigatePhoto?.(dx < 0 ? 1 : -1);
                } else if (Math.hypot(dx,dy) < 10 && performance.now() - point.at < 500) tap(event);
            }
            if (!points.size) { multi = false; pinch = null; }
        }
        image.addEventListener('pointerup', event => release(event, false));
        image.addEventListener('pointercancel', event => release(event, true));
        image.addEventListener('lostpointercapture', event => { if (points.has(event.pointerId)) release(event, true); });
        image.addEventListener('click', event => { if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); return; } if (active() && !immersive() && image.complete && image.naturalWidth > 0) enterImmersive(); });
        image.addEventListener('load', () => { status.hidden = true; paint(); });
        image.addEventListener('error', () => { refreshImage(); });
        new MutationObserver(records => {
            if(image.dataset.viewerMedia==='video'&&immersive())exitImmersive();
            if(records.some(r=>r.attributeName==='src')){
                if(image.getAttribute('src')!==ownRefreshSource){refreshVersion++;refreshAttempted=false;}
                ownRefreshSource=null;reset();status.hidden=true;
            }else paint();
        }).observe(image, {attributes:true, attributeFilter:['src','data-viewer-media']});
        new MutationObserver(() => { if (!active()) { refreshVersion++;refreshAttempted=false;ownRefreshSource=null;lastTap = null; status.hidden = true; exitImmersive(); } }).observe(modal, {attributes:true, attributeFilter:['class']});
        window.addEventListener('popstate', () => {
            if (ignorePop) { ignorePop = false; if (active() && immersive()) rememberHistory(); return; }
            if (historyKey && history.state?.timehutPhotoPreview !== historyKey) { historyKey = null; window.closeModal?.(); }
        });
        // Capture before other viewer pagehide handlers close the modal. Never
        // traverse history while another document is being entered.
        window.addEventListener('pagehide', () => {
            leavingPage=true;suspendedHistoryKey=historyKey;historyKey=null;ignorePop=false;
            refreshVersion++;lastTap=null;reset();
        }, {capture:true});
        window.addEventListener('pageshow',event=>{
            leavingPage=false;const previous=suspendedHistoryKey;suspendedHistoryKey=null;
            // Only retire this document's own saved preview entry after BFCache
            // restoration. A changed/foreign state never grants a traversal.
            if(event.persisted&&previous&&history.state?.timehutPhotoPreview===previous){ignorePop=true;history.back();}
        });
        window.addEventListener('resize', () => { if (active()) paint(); });
        window.addEventListener('timehut-account-changed', () => { window.closeModal?.(); exitImmersive(); });
        window.TimehutPhotoPreview = {enter: enterImmersive, exit: exitImmersive};
        paint();
    }
    (window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded', fn)))(init);
})();
