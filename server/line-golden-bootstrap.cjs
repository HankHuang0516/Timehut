'use strict';
const {createGoldenRelevance}=require('./line-golden-relevance.cjs');
// Hank1028: Compose with the already reviewed createLineAutonomy function.
// The publisher supplies that existing function; default is disabled.
function createGoldenAutonomy(createLineAutonomy,inbox,{enabled=false,...references}={}){
 if(typeof createLineAutonomy!=='function')throw Error('CANONICAL_AUTONOMY_FACTORY_REQUIRED');
 const source=enabled?createGoldenRelevance(inbox,references):null;
 const base=createLineAutonomy(inbox,{enabled,trustedRelevance:source});
 return {...base,eraseUser(ownerId){
  // Each existing eraser owns its transaction; never nest BEGIN IMMEDIATE.
  // This table is also erased after the feature has been disabled.
  inbox.tx(()=>{if(inbox.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='line_golden_receipts'").get())inbox.db.prepare('DELETE FROM line_golden_receipts WHERE user_id=?').run(ownerId);});
  base.eraseUser(ownerId);
 }};
}
module.exports={createGoldenAutonomy};
