'use strict';
const {RunAuthority}=require('./run-authority.cjs'),{AutonomousService}=require('./service.cjs'),{installWorkerRoutes}=require('./worker-routes.cjs');
/** Startup composition only. No trusted relevance provider is built in, so
 * enabling a flag alone cannot authorize a real automatic import. Existing
 * metadata remains guarded/erasable when the flag is subsequently turned off.
 */
function createLineAutonomy(inbox,{enabled=false,trustedRelevance=null}={}){
 const existing=!!inbox.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='line_auto_meta'").get();
 let service,engine=null,installed=false;
 const sourceReady=()=>enabled&&trustedRelevance?.ready?.()===true;
 // Saved collection bindings authorize continuing processing. Legacy grants
 // remain readable for compatibility, but are not required by this workflow.
 const {StandingGrants}=require('./line-standing-grant.cjs');
 const standingGrants=new StandingGrants(inbox);
 const authority=new RunAuthority(inbox,{enabled:enabled||existing,transportReady:()=>enabled&&installed&&service?.ready()===true,verifyCalibration:context=>sourceReady()&&trustedRelevance?.verifyCalibration?.(context)===true,standingGrants});
 standingGrants.authority=authority;
 service=new AutonomousService(authority,{enabled:enabled||existing,imports:()=>engine,receiptSourceReady:sourceReady,readRelevanceReceipt:context=>sourceReady()?trustedRelevance?.readReceipt?.(context)??null:null,verifyRelevanceReceipt:context=>sourceReady()&&trustedRelevance?.verifyReceipt?.(context)===true,analysisSource:trustedRelevance});
 if(enabled&&sourceReady()&&typeof trustedRelevance?.installProfiles==='function')trustedRelevance.installProfiles(authority);
 const guards=authority.enabled?service.importGuards():null;
 return {
  authority,service,guards,standingGrants,
  recordMedia:event=>enabled?authority.recordVerifiedIngressWithinTransaction([event]):0,
  install(app,accounts,{express,workerToken,imports}={}){
   if(installed||!imports||imports.inbox!==inbox||imports.db!==inbox.db||imports.automation!==guards)throw Error('AUTONOMY_STARTUP_ENGINE_MISMATCH');
   engine=imports;const routes=installWorkerRoutes(app,accounts,authority,{express,workerToken,integration:service.adapters(),standingGrants});installed=true;return routes;
  },
  ready:()=>authority.capabilities().enabled,
  eraseUser:user=>{service.eraseUser(user);authority.eraseUser(user);standingGrants.eraseUser(user);}
 };
}
module.exports={createLineAutonomy};
