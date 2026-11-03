/* Hank1028: bounded, current-account-only previews; no upload or settings writes. */
(() => {
 'use strict';
 function create({isCurrent,validate,refresh,now=()=>Date.now(),timeoutMs=25000}) {
  const jobs=new Set(),active=new Set(),fresh=new Map();let retired=false,scheduled=false;
  const current=job=>!retired&&jobs.has(job)&&job.host.isConnected&&isCurrent();
  function expired(source){try{const body=new URL(source).searchParams.get('ticket').split('.')[0];const row=JSON.parse(atob(body.replace(/-/g,'+').replace(/_/g,'/')));return Number.isSafeInteger(row.until)&&row.until<=now()+15000;}catch(_){return false;}}
  function near(job){const r=job.host.getBoundingClientRect();return r.bottom>=-160&&r.top<=innerHeight+160&&r.right>0&&r.left<innerWidth;}
  function state(job,value){if(!current(job))return;job.state=value;job.host.dataset.previewState=value;job.status.hidden=value==='loaded';job.status.textContent=value==='failed'?'照片暫時無法載入':value==='queued'?'等待載入…':'照片載入中…';job.retry.hidden=value!=='failed';job.onState?.(value);}
  function cancel(job){job.cancel?.();job.cancel=null;job.image?.removeAttribute('src');job.image?.remove();job.image=null;/* run finally owns the slot until pending refresh/image work settles. */}
  function remove(job){jobs.delete(job);observer?.unobserve(job.host);cancel(job);job.retry.onclick=null;}
  function schedule(){if(scheduled||retired)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;drain();});}
  async function sources(job){
   let promise=fresh.get(job.photo.id);
   if(!promise){promise=Promise.resolve().then(()=>{if(!current(job))throw Error('Retired');return refresh(job.photo);});fresh.set(job.photo.id,promise);}
   try{const rows=await promise;if(!current(job))throw Error('Retired');return [...new Set(rows.map(url=>validate(job.photo,url)))].slice(0,2);}finally{if(fresh.get(job.photo.id)===promise)fresh.delete(job.photo.id);}
  }
  function load(job,source){return new Promise((resolve,reject)=>{
   if(!current(job))return reject(Error('Retired'));
   const img=document.createElement('img');img.alt=job.photo.title||'相簿照片';img.decoding='async';img.loading='eager';job.image=img;
   let done=false;const finish=error=>{if(done)return;done=true;clearTimeout(timer);img.onload=img.onerror=null;job.cancel=null;if(error||!current(job)){img.removeAttribute('src');img.remove();if(job.image===img)job.image=null;reject(error||Error('Retired'));}else resolve();};
   const timer=setTimeout(()=>finish(Error('Preview timeout')),timeoutMs);job.cancel=()=>finish(Error('Retired'));
   img.onload=()=>finish(img.naturalWidth>0&&img.naturalHeight>0?null:Error('Preview unavailable'));img.onerror=()=>finish(Error('Preview unavailable'));
   job.host.prepend(img);try{img.src=validate(job.photo,source);}catch(error){finish(error);}
  });}
  async function run(job){
   active.add(job);state(job,'loading');let loaded=false;
   try{
    const original=validate(job.photo,job.photo.url_m);
    if(!expired(original))try{await load(job,original);loaded=true;}catch(_){}
    if(!loaded&&current(job))for(const source of await sources(job)){if(!current(job))break;try{await load(job,source);loaded=true;break;}catch(_){}}
   }catch(_){/* A failed read never permits an unsigned or foreign fallback. */}
   finally{active.delete(job);job.cancel=null;if(current(job))state(job,loaded?'loaded':'failed');schedule();}
  }
  function drain(){
   if(retired)return;
   for(const job of [...jobs])if(!current(job))remove(job);
   const waiting=[...jobs].filter(j=>j.state==='queued'&&near(j)).sort((a,b)=>Number(b.priority)-Number(a.priority)||Math.abs(a.host.getBoundingClientRect().top)-Math.abs(b.host.getBoundingClientRect().top));
   for(const job of waiting){if(active.size>=2)break;void run(job);}
  }
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(schedule,{rootMargin:'160px 0px'}):null;
  window.addEventListener('scroll',schedule,{passive:true,capture:true});window.addEventListener('resize',schedule);
  return {
   add(host,photo,{group,status,retry,onState,priority=false}){
    const job={host,photo,group,status,retry,onState,priority,state:'queued',image:null,cancel:null};jobs.add(job);state(job,'queued');
    retry.onclick=e=>{e.preventDefault();e.stopPropagation();if(!current(job)||job.state!=='failed')return;cancel(job);state(job,'queued');schedule();};observer?.observe(host);schedule();return job;
   },
   removeGroup(group){for(const job of [...jobs])if(job.group===group)remove(job);schedule();},
   clear(){for(const job of [...jobs])remove(job);fresh.clear();},
   retire(){retired=true;for(const job of [...jobs])remove(job);fresh.clear();observer?.disconnect();window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);}
  };
 }
 window.TimehutGoldenPhotoPreviews=Object.freeze({create});
})();
