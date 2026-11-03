/* Loading belongs inside the destination page, with the same header and layout. */
(() => {
 function show(){
  const header=document.querySelector('[data-public-page-shell] .settings-header');if(!header)return;
  const status=document.createElement('p');status.className='page-loading-status';status.setAttribute('role','status');status.textContent='正在讀取，請稍候…';header.append(status);
  const update=()=>{const loading=document.documentElement.hasAttribute('data-timehut-loading');status.hidden=!loading;header.setAttribute('aria-busy',String(loading));};
  new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['data-timehut-loading']});update();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show,{once:true});else show();
})();
