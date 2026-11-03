/* Reveal existing detail sections in place; no intermediate page or automatic navigation. */
(() => {
 const reveal=()=>{const id=location.hash.slice(1);if(!id)return;const target=document.getElementById(id);if(!target)return;if(target.tagName==='DETAILS')target.open=true;for(let p=target.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;};
 const bind=()=>{for(const b of document.querySelectorAll('#timeline-actions button'))b.addEventListener('click',()=>{document.getElementById('timeline-actions').open=false;});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reveal,{once:true});else reveal();window.addEventListener('hashchange',reveal);
})();
/* Legacy photo/action overlays share Escape, focus return and an inert background. */
(() => {
 function init(){
  const specs=[['moveCollectionModal','合併到指定日期','.confirm-actions button:first-child',e=>!e.classList.contains('hidden')],['tagModal','增加標籤','.confirm-actions button:first-child',e=>!e.classList.contains('hidden')],['uploadModal','加入照片與影片','.modal-close',e=>e.classList.contains('active')||e.style.display==='flex'],['photoModal','照片檢視','.modal-close',e=>e.classList.contains('active')],['albumSidebar','選擇相簿','.sidebar-close',e=>e.classList.contains('open')]];
  const states=specs.map(([id,label,cancel,isOpen])=>{const element=document.getElementById(id);if(!element)return null;element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');if(!element.hasAttribute('aria-labelledby'))element.setAttribute('aria-label',label);return {element,cancel,isOpen,open:false,previous:null,inactive:[]};}).filter(Boolean);
  let sequence=0;
  function sync(){for(const state of states){const open=state.element.isConnected&&state.isOpen(state.element)&&getComputedStyle(state.element).display!=='none';if(open===state.open)continue;state.open=open;
   if(open){state.order=++sequence;state.previous=document.activeElement;state.inactive=[...document.body.children].filter(e=>e!==state.element&&!(state.element.id==='albumSidebar'&&e.id==='sidebarOverlay')&&!['SCRIPT','STYLE','LINK'].includes(e.tagName)).map(e=>[e,e.inert]);for(const [e] of state.inactive)e.inert=true;state.element.querySelector('input:not([type=hidden]),select,button,[tabindex="0"]')?.focus();}
   else{for(const [e,value] of state.inactive)e.inert=value;state.inactive=[];if(state.previous?.isConnected)state.previous.focus();}
  }}
  for(const state of states)new MutationObserver(sync).observe(state.element,{attributes:true,attributeFilter:['class','style','hidden']});
  document.addEventListener('keydown',event=>{if(document.querySelector('.timehut-dialog')||document.querySelector('dialog[open]'))return;const state=states.filter(s=>s.open).sort((a,b)=>b.order-a.order)[0];if(!state)return;
   if(event.key==='Escape'){const button=state.element.querySelector(state.cancel);if(button&&!button.disabled){event.preventDefault();event.stopImmediatePropagation();button.click();}return;}
   if(event.key==='Tab'){const list=[...state.element.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(e=>!e.disabled&&!e.hidden&&e.getClientRects().length&&!e.closest('[inert]'));if(!list.length)return;const first=list[0],last=list.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  },true);
  window.addEventListener('timehut-account-changed',()=>{for(const s of states)if(s.open&&s.element.isConnected)s.element.querySelector(s.cancel)?.click();});sync();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

/* Keyboard and pinch-zoom visibility are owned by the real visual viewport. */
(() => {let frame=null;const update=()=>{frame=null;const v=window.visualViewport,r=document.documentElement;for(const [key,value] of Object.entries({left:v?.offsetLeft||0,top:v?.offsetTop||0,width:v?.width||innerWidth,height:v?.height||innerHeight})){const px=Math.max(0,value)+'px';if(r.style.getPropertyValue('--app-visual-'+key)!==px)r.style.setProperty('--app-visual-'+key,px);}};const schedule=()=>{if(frame===null)frame=requestAnimationFrame(update);};update();window.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('scroll',schedule,{passive:true});})();
