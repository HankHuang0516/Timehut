(() => {
    'use strict';
    const notice = 'This product uses the Flickr API but is not endorsed or certified by SmugMug, Inc.';
    const render = () => document.querySelectorAll('[data-flickr-attribution]').forEach(node => { node.textContent = notice; });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, {once:true});
    else render();
})();
