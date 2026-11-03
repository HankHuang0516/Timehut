/* Enter reading with an album returned by the current account's own context. */
(() => {
    'use strict';
    const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
    let pending = null;
    function actor() {
        const state = window.TimehutAccounts.status();
        if (!state.authenticated || state.unconfirmed || !state.user?.id) throw new Error('登入狀態尚未確認，請重新連線。');
        return {id: state.user.id, generation: state.generation};
    }
    function unchanged(expected) {
        const current = actor();
        if (current.id !== expected.id || current.generation !== expected.generation) throw new Error('帳戶已變更，請重新開啟相簿。');
    }
    function preferred(owner) {
        try { const id = localStorage.getItem('timehut:album-choice:' + owner); return validId(id) ? id : null; }
        catch (_) { return null; }
    }
    function destination(context, preferredId, expectedOwner, required) {
        if (context?.user?.id !== expectedOwner || !Array.isArray(context.children) ||
            context.children.some(child => !validId(child?.albumId))) throw new Error('相簿資料尚未確認，請重新讀取。');
        const total = context.albumPagination?.total;
        if (total !== undefined && (!Number.isSafeInteger(total) || total < context.children.length)) throw new Error('相簿清單尚未完整，請重新讀取。');
        if(required&&!context.children.some(child=>child.albumId===preferredId))throw new Error('指定的相簿尚未確認，請重新開啟相簿。');
        if (!context.children.length) {
            if (total > 0) throw new Error('相簿清單尚未完整，請重新讀取。');
            return {target: 'account.html?entry=create#create-album', albumId: null};
        }
        const album = context.children.find(child => child.albumId === preferredId) || context.children[0];
        return {target: 'timeline.html?' + new URLSearchParams({album: album.albumId}), albumId: album.albumId};
    }
    function openReading({preferredAlbumId, requiredAlbumId, context} = {}) {
        if (pending) return pending;
        pending = (async () => {
            const owner=actor(),required=requiredAlbumId!==undefined;
            if(required&&!validId(requiredAlbumId))throw new Error('指定的相簿尚未確認，請重新開啟相簿。');
            const wanted=required?requiredAlbumId:validId(preferredAlbumId)?preferredAlbumId:preferred(owner.id);
            const result = context ?? await window.TimehutAccounts.request('/api/accounts/context' +
                (wanted ? '?' + new URLSearchParams({album: wanted}) : ''));
            unchanged(owner);
            const next = destination(result, wanted, owner.id, required);
            unchanged(owner);
            if (next.albumId) {
                try { localStorage.setItem('timehut:album-choice:' + owner.id, next.albumId); } catch (_) { /* Reading still works without saving this preference. */ }
            }
            unchanged(owner);
            location.replace(next.target);
            return next;
        })().finally(() => { pending = null; });
        return pending;
    }

    // Carry only a bounded reading bookmark through ordinary account/settings/transfer links.
    // The timeline still revalidates its full scope and fresh server identity before any restoration.
    const returnKey = 'timehut:timeline-return:v1';
    const readingBase = new URL('index.html', location.href).pathname.replace(/index\.html$/, '');
    const carrierPages = new Set(['account.html','settings.html','transfer.html','search.html']);
    const sameReadingSite = url => {const here=new URL(location.href);return url.protocol===here.protocol && url.host===here.host && !url.username && !url.password;};
    function incomingReturn() {
        const p = new URLSearchParams(location.search);
        if (p.getAll('returnTo').length !== 1 || p.getAll('returnAlbum').length !== 1) return null;
        return {token:p.get('returnTo'), album:p.get('returnAlbum')};
    }
    function navigationRecord(context) {
        try {
            if (!context || !/^[a-f0-9-]{36}$/.test(context.token || '') || !validId(context.album)) return null;
            const value = JSON.parse(sessionStorage.getItem(returnKey) || 'null');
            const current = window.TimehutAccounts?.status();
            if (!value || value.version !== 1 || value.token !== context.token || value.album !== context.album ||
                !current?.authenticated || current.unconfirmed || current.user?.id !== value.owner ||
                !Number.isFinite(value.at) || Date.now() < value.at || Date.now() - value.at > 30 * 60 * 1000 ||
                !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || !Number.isInteger(value.age) || value.age < 0 || value.age > 150 ||
                !Number.isFinite(value.top) || Math.abs(value.top) > 10000) return null;
            return value;
        } catch (_) { return null; }
    }
    function navigationDestination(target, context = incomingReturn()) {
        try {
            const value = navigationRecord(context);
            if (!value) return target;
            const url = new URL(target, location.href);
            if (!sameReadingSite(url) || !url.pathname.startsWith(readingBase)) return target;
            const page = url.pathname.slice(readingBase.length);
            if ((page === 'index.html' || page === 'timeline.html') && !url.search && !url.hash) {
                const back = new URL('timeline.html', location.href);
                back.searchParams.set('album', value.album);back.searchParams.set('returnTo', value.token);
                return back.href;
            }
            // Explicit album destinations and account recovery/deletion intents keep their own meaning.
            if (!carrierPages.has(page) || url.searchParams.has('album') || url.searchParams.has('next') ||
                url.searchParams.has('intent') || page === 'account.html' && url.hash && url.hash !== '#create-album') return target;
            url.searchParams.set('returnAlbum', value.album);url.searchParams.set('returnTo', value.token);
            return url.href;
        } catch (_) { return target; }
    }
    document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const link = event.target?.closest?.('a[href]');
        if (!link || link.hasAttribute('download') || link.target && link.target !== '_self') return;
        let context = incomingReturn();
        try {
            const url = new URL(link.href), page = url.pathname.slice(readingBase.length);
            if (!sameReadingSite(url) || !url.pathname.startsWith(readingBase)) return;
            if (carrierPages.has(page) && document.getElementById('timelineContainer') &&
                typeof window.rememberCurrentTimelineNavigation === 'function') context = window.rememberCurrentTimelineNavigation();
        } catch (_) { return; }
        const destination = navigationDestination(link.href, context);
        if (destination !== link.href) {event.preventDefault();location.assign(destination);}
    }, true);
    let accountReady = false;
    Promise.resolve(window.TimehutAccounts?.ready).then(() => {accountReady = true;}).catch(() => {});
    window.addEventListener('timehut-account-changed', () => {
        if (!accountReady) return;
        try {
            const context = incomingReturn(), value = JSON.parse(sessionStorage.getItem(returnKey) || 'null');
            const current = window.TimehutAccounts?.status();
            if (context && value?.token === context.token && value.album === context.album &&
                (!current?.authenticated || current.unconfirmed || current.user?.id !== value.owner)) sessionStorage.removeItem(returnKey);
        } catch (_) { /* Optional navigation metadata; never an authentication proof. */ }
    });

    window.TimehutEntry = {openReading,navigationDestination};
})();
