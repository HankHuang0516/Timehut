'use strict';
// Display only persisted server progress. Never classify or submit an import here.
((root) => {
 const stages=new Set(['download_queued','downloading','downloaded','recognition_queued','recognizing','recognized','uploading','uploaded','excluded','blocked','failed','unknown','stopped']);
 const reasons={engine_not_ready:'背景辨識服務尚未就緒',automation_not_ready:'背景辨識服務尚未就緒',grant_required:'等待自動處理授權',standing_grant_required:'等待自動處理授權',grant_missing:'等待自動處理授權',consent_required:'請先完成參考人物設定與用途同意',reference_or_classifier_not_ready:'請先完成參考人物設定',references_unavailable:'參考人物設定尚未就緒',scope_changed:'相簿或參考設定已變更',grant_expired:'自動處理授權已到期',grant_revoked:'自動處理授權已撤銷',run_expired:'這次背景處理已逾時',uncertain:'辨識結果不確定，暫未上傳',hold:'辨識結果不確定，暫未上傳',worker_unavailable:'等待背景服務恢復',unsupported_media:'此類媒體尚未支援自動辨識'};
 Object.assign(reasons,{automation_disabled:'自動處理尚未啟用',relevance_source_not_ready:'辨識參考設定尚未就緒',transport_not_ready:'背景辨識服務尚未就緒',provider_not_connected:'相簿儲存服務尚未連線',upload_admission_closed:'相簿上傳暫停中',no_standing_grant:'等待自動處理授權',standing_grant_revoked:'自動處理授權已撤銷',standing_grant_expired:'自動處理授權已到期',standing_grant_not_current:'自動處理設定已變更，等待更新授權',standing_grant_unavailable:'自動處理授權尚未就緒',no_active_run:'等待背景工作器啟動',item_not_engaged:'此照片尚未排入自動處理',processing_status_unavailable:'處理狀態暫時無法確認'});
 Object.assign(reasons,{collection_not_configured:'請先保存此來源的收件相簿',references_not_ready:'等待相簿參考人物設定與比對服務就緒'});
 reasons.recognition_uncertain='辨識完成，結果不確定，已保留等待';
 const reason=code=>reasons[String(code||'').toLowerCase()]||'背景處理暫停';
 function describe(item,{importRow=null,albums=new Map()}={}){
  const p=item?.processing;
  let stage=p&&stages.has(p.stage)?p.stage:null,recognition=p?.recognitionCompleted===true;
  let ids=Array.isArray(p?.albumIds)?[...new Set(p.albumIds.filter(id=>typeof id==='string'&&albums.has(id)))]:[];
  if(!stage){
   recognition=false;ids=[];
   const imports={pending:'uploading',receiving:'uploading',staged:'uploading',completed:'uploaded',failed:'failed',cancelled:'stopped',unknown:'unknown'};
   stage=imports[importRow?.status]||({pending:'download_queued',leased:'downloading',downloaded:'downloaded',failed:'failed',cancelled:'stopped'}[item?.status])||'unknown';
  }
  const labels={download_queued:'等待下載',downloading:'正在下載',downloaded:'已下載',recognition_queued:'辨識排隊中',recognizing:'正在辨識',recognized:'辨識完成，正在整理結果',uploading:recognition?'辨識完成，正在上傳相簿':'正在上傳相簿',failed:'處理未完成',unknown:'處理結果待確認',stopped:'已停止'};
  const targetNames=ids.map(id=>'「'+albums.get(id).title+'」').join('、');
  let text=labels[stage],detail='';
  if(stage==='uploading'){
   const code=String(p?.reasonCode||'').toUpperCase();
   const waiting=code==='IMPORT_PLAN_PENDING'||!p&&importRow?.status==='pending';
   const preparing=code==='IMPORT_RECEIVING'||!p&&importRow?.status==='receiving';
   const handedOff=code==='IMPORT_UPLOAD_STAGED'||!p&&importRow?.status==='staged';
   text=(recognition?'辨識完成，':'')+(waiting?'等待上傳相簿':preparing?'正在準備上傳相簿':handedOff?'已交由相簿服務處理':'正在上傳相簿');
  }
  if(stage==='uploaded')text=(recognition?'辨識完成，':'')+(targetNames?'已上傳到'+targetNames+'相簿':'已上傳相簿');
  if(stage==='excluded'){
   if(recognition)text='辨識完成，此照片與相簿內容無關，已排除';
   else {stage='unknown';text=labels.unknown;}
  }
  if(stage==='blocked'){text=reason(p?.reasonCode);detail=item?.status==='downloaded'?'已下載，等待背景處理':'尚未完成處理';}
  if(stage==='failed'||stage==='unknown')detail='可重新讀取狀態，系統不會另建重複上傳。';
  return {stage,text,detail,albumIds:ids};
 }
 function automationText(automation){
  if(automation?.ready===true)return '自動上傳設定已就緒。照片辨識後會自動上傳至符合的相簿，不需逐批確認。';
  if(automation&&typeof automation.reasonCode==='string')return reason(automation.reasonCode)+'；每張照片的實際進度會顯示在下方。';
  return '照片由背景服務接續辨識與上傳，實際進度以每張收件狀態為準。';
 }
 const api=Object.freeze({describe,automationText});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.TimehutLineItemStatus=api;
})(typeof window==='undefined'?globalThis:window);
