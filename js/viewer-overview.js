/* Original board07: browse the current viewer's photos without new API writes. */
(() => {
    'use strict';
    const pageSize = 60;
    let state = null, elements = null, start = 0;
    const owner = () => window.TimehutAccounts?.status?.().user?.id || (CONFIG.ACCOUNT_MODE ? null : 'legacy');
    const valid = () => state && state.owner !== null && state.owner === owner() && elements?.modal.classList.contains('active');
    function hide(resume = false) {
        if (!elements) return;
        const wasOpen = !elements.panel.hidden;
        elements.panel.hidden = true;
        elements.content.classList.remove('viewer-overview-open');
        elements.toggle.setAttribute('aria-expanded', 'false');
        elements.grid.replaceChildren();
        if (resume && wasOpen && valid()) {
            window.TimehutViewerMedia?.show(state.photos[state.index]);
            elements.toggle.focus();
        }
    }
    function clear() {
        hide(); state = null;
        if (elements) { elements.toggle.hidden = true; elements.range.textContent = ''; }
    }
    function render() {
        if (!valid()) { clear(); return; }
        const current = state, end = Math.min(start + pageSize, current.photos.length);
        elements.range.textContent = `第 ${start + 1}–${end} 張，共 ${current.photos.length} 張`;
        elements.previous.disabled = start === 0;
        elements.next.disabled = end === current.photos.length;
        elements.previous.hidden = elements.next.hidden = current.photos.length <= pageSize;
        elements.grid.replaceChildren();
        for (let index = start; index < end; index++) {
            const photo = current.photos[index], button = document.createElement('button');
            button.type = 'button'; button.className = 'viewer-overview-photo';
            button.dataset.photoId = String(photo.id);
            button.setAttribute('aria-label', `第 ${index + 1} 張，${photo.media === 'video' ? '影片' : '照片'}，${photo.title || '未命名'}`);
            if (index === current.index) button.setAttribute('aria-current', 'true');
            const picture = document.createElement('img'); picture.alt = ''; picture.loading = 'lazy';
            const url = FlickrAPI.getPhotoUrl(photo, 's') || FlickrAPI.getPhotoUrl(photo, 'm');
            if (url) picture.src = url; else picture.hidden = true;
            picture.addEventListener('error', () => { picture.hidden = true; });
            const label = document.createElement('span'); label.className = 'viewer-overview-caption';
            label.textContent = `${photo.media === 'video' ? '▶ ' : ''}${index + 1}. ${photo.title || '未命名'}`;
            button.append(picture, label);
            button.addEventListener('click', () => {
                if (!valid() || state !== current) { clear(); return; }
                hide(); current.select(String(photo.id));
                if (valid()) elements.toggle.focus();
            });
            elements.grid.append(button);
        }
    }
    function mount() {
        if (elements) return true;
        const modal = document.getElementById('photoModal'), content = modal?.querySelector('.modal-content'), info = modal?.querySelector('.modal-info');
        if (!content || !info) return false;
        const toggle = document.createElement('button'); toggle.type = 'button'; toggle.id = 'viewerOverviewToggle';
        toggle.className = 'btn-secondary viewer-overview-toggle'; toggle.textContent = '照片總覽';
        toggle.setAttribute('aria-controls', 'viewerOverview'); toggle.setAttribute('aria-expanded', 'false');
        const download = info.querySelector('#modalDownloadBtn');
        if (download) {
            let actions = download.closest('.modal-actions');
            if (!actions) {
                actions = document.createElement('div'); actions.className = 'modal-actions';
                download.before(actions); actions.append(download);
            }
            actions.classList.add('viewer-actions'); actions.append(toggle);
        } else info.insertBefore(toggle, info.querySelector('.viewer-decoration'));
        const panel = document.createElement('section'); panel.id = 'viewerOverview'; panel.className = 'viewer-overview'; panel.hidden = true;
        panel.setAttribute('aria-labelledby', 'viewerOverviewTitle');
        const header = document.createElement('div'); header.className = 'viewer-overview-header';
        const title = document.createElement('h3'); title.id = 'viewerOverviewTitle'; title.textContent = '照片總覽';
        const back = document.createElement('button'); back.type = 'button'; back.className = 'btn-secondary'; back.textContent = '返回檢視';
        header.append(title, back);
        const grid = document.createElement('div'); grid.className = 'viewer-filmstrip'; grid.setAttribute('aria-label', '目前檢視範圍的照片');
        const pages = document.createElement('div'); pages.className = 'viewer-overview-pages';
        const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '上一頁照片';
        const next = document.createElement('button'); next.type = 'button'; next.textContent = '下一頁照片';
        const range = document.createElement('p'); range.setAttribute('aria-live', 'polite');
        pages.append(previous, range, next); panel.append(header, grid, pages); content.append(panel);
        elements = {modal, content, toggle, panel, grid, range, previous, next};
        toggle.addEventListener('click', () => {
            if (!valid()) { clear(); return; }
            start = Math.floor(state.index / pageSize) * pageSize;
            window.TimehutViewerMedia?.stop();
            panel.hidden = false; content.classList.add('viewer-overview-open'); toggle.setAttribute('aria-expanded', 'true');
            render(); panel.scrollTop = 0; (grid.querySelector('[aria-current="true"]') || back).focus();
        });
        back.addEventListener('click', () => hide(true));
        for (const [button, delta] of [[previous, -pageSize], [next, pageSize]]) button.addEventListener('click', () => {
            if (!valid()) { clear(); return; }
            start = Math.max(0, Math.min(start + delta, Math.floor((state.photos.length - 1) / pageSize) * pageSize)); render(); panel.scrollTop = 0; back.focus();
        });
        document.addEventListener('keydown', event => {
            if (panel.hidden) return;
            if (!valid()) { clear(); return; }
            if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); hide(true); return; }
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); event.stopImmediatePropagation();
            const buttons = [...grid.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
            if (index < 0) return;
            const columns = getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length;
            const delta = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-columns, ArrowDown:columns}[event.key];
            const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(index + delta, buttons.length - 1));
            buttons[target]?.focus();
        }, true);
        return true;
    }
    window.TimehutViewerOverview = {
        set({photos, index, select}) {
            if (!mount()) return;
            clear();
            if (!Array.isArray(photos) || !photos[index] || typeof select !== 'function') return;
            state = {photos:photos.slice(), index, select, owner:owner()};
            elements.toggle.hidden = state.owner === null;
        }, clear
    };
    for (const event of ['pagehide', 'timehut-account-changed']) window.addEventListener(event, () => {
        window.TimehutViewerMedia?.stop(); clear();
        if (document.getElementById('photoModal')?.classList.contains('active')) window.closeModal?.();
    });
})();
