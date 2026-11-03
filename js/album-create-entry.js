/* Visible shortcuts to the existing account-owned album creation form. */
(() => {
    'use strict';
    function init() {
        const entries = [...document.querySelectorAll('[data-album-create-entry]')];
        const signedIn = () => window.TimehutAccounts?.status?.().authenticated === true;
        const refreshEntries = () => {
            const available = typeof CONFIG !== 'undefined' && CONFIG.ACCOUNT_MODE && signedIn();
            entries.forEach(entry => { entry.hidden = !available; });
        };
        if (window.TimehutPage?.onReady) window.TimehutPage.onReady(refreshEntries);
        else refreshEntries();
        window.addEventListener('timehut-account-changed', refreshEntries);

        const home = document.getElementById('account-home');
        const panel = document.getElementById('create-album');
        const heading = document.getElementById('create-album-title');
        if (!home || !panel || !heading) return;
        let positioned = false;
        function revealCreation() {
            const requested = location.hash === '#create-album';
            if (!requested || home.hidden || !signedIn()) { positioned = false; return; }
            if (positioned || !home.isConnected) return;
            positioned = true;
            if (panel.tagName === 'DETAILS') panel.open = true;
            requestAnimationFrame(() => {
                if (location.hash !== '#create-album' || home.hidden || !signedIn()) {
                    positioned = false;
                    return;
                }
                heading.focus({preventScroll: true});
                panel.scrollIntoView({block: 'start', behavior: 'instant'});
            });
        }
        new MutationObserver(revealCreation).observe(home, {attributes: true, attributeFilter: ['hidden']});
        window.addEventListener('hashchange', revealCreation);
        revealCreation();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
    else init();
})();
