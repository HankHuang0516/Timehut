/* A voluntary consumable tip. Only the installed store plugin can open payment. */
(() => {
    'use strict';
    const start = async () => {
        const card = document.getElementById('coffeeTip');
        if (!card) return;
        const buy = card.querySelector('[data-coffee-buy]');
        const status = card.querySelector('[data-coffee-status]');
        const retry = card.querySelector('[data-coffee-retry]');
        const cap = window.Capacitor;
        let plugin, busy = false, reading = false, refreshAfterRead = false, retryAfterRead = false, latest = 0, price = '';
        function show(row) {
            const state = row?.state || 'unavailable';
            card.dataset.coffeeState = state;
            // Price comes only from the current storefront, never from a fallback USD label.
            price = typeof row?.price === 'string' ? row.price : '';
            buy.textContent = price ? `請一杯咖啡 · ${price}` : '請一杯咖啡';
            buy.disabled = busy || !price || !['ready', 'completed', 'cancelled'].includes(state);
            const messages = {
                ready:'由商店確認付款，每次只請一杯。',
                completed:'收到咖啡了，謝謝你溫暖小屋 ☕',
                cancelled:'已取消，謝謝你來小屋坐坐。',
                pending:'這杯咖啡正在等候商店確認，請稍後回來看看。',
                processing:'正在向商店確認這杯咖啡…',
                unavailable:'商店暫時無法確認，請稍後重新確認。'
            };
            status.textContent = messages[state] || messages.unavailable;
            retry.hidden = !plugin || busy || !['unavailable', 'pending'].includes(state);
        }
        async function refresh(manualRetry = false) {
            if (!plugin || busy) return;
            // Browser events are not permission to retry a failed consumption.
            const retryPurchase = manualRetry === true;
            if (reading) { refreshAfterRead = true; retryAfterRead ||= retryPurchase; return; }
            reading = true;
            const request = ++latest;
            buy.disabled = true; retry.hidden = true;
            try { const row = await plugin.status({retry:retryPurchase}); if (request === latest && !busy) show(row); }
            catch (_) { if (request === latest && !busy) show({state:'unavailable'}); }
            finally {
                reading = false;
                if (refreshAfterRead) {
                    const retryQueued = retryAfterRead;
                    refreshAfterRead = false; retryAfterRead = false;
                    if (!busy) refresh(retryQueued);
                }
            }
        }
        if (!cap?.isNativePlatform?.()) {
            card.dataset.coffeeState = 'web'; buy.hidden = true; retry.hidden = true;
            status.textContent = '請在 App Store 或 Google Play 安裝版中，請作者喝杯咖啡。';
            return;
        }
        if (!cap.isPluginAvailable?.('CoffeeTip')) {
            show({state:'unavailable'});
            status.textContent = '這個版本還沒有咖啡小舖，請更新 App 後再來坐坐。';
            return;
        }
        plugin = cap.registerPlugin('CoffeeTip');
        buy.addEventListener('click', async () => {
            if (busy || buy.disabled) return;
            busy = true; ++latest; buy.disabled = true; retry.hidden = true;
            card.dataset.coffeeState = 'processing'; status.textContent = '正在開啟商店的付款確認…';
            try { const row = await plugin.purchase(); busy = false; show(row); }
            catch (_) { busy = false; show({state:'unavailable'}); }
        });
        retry.addEventListener('click', () => refresh(true));
        document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
        window.addEventListener('pageshow', refresh);
        try { await plugin.addListener('coffeeChanged', () => { if (!busy) refresh(); }); } catch (_) { /* Explicit refresh remains available. */ }
        await refresh();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
    else start();
})();
