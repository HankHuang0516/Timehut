'use strict';
const fs=require('node:fs'),path=require('node:path');
const {GoldenSelections}=require('./line-golden-selections.cjs');
const {goldenPhotoProvider}=require('./line-golden-photo-provider.cjs');
const {installGoldenSelectionRoutes}=require('./line-golden-selection-routes.cjs');
// Only the app setup routes are enabled here; no run, model or upload starts.
function createGoldenAppSettings(store,accounts,{enabled=false,directory,photoViews,collectionConfigured,...providerOptions}={}){
 if(!enabled&&!fs.existsSync(path.join(directory,'selections.sqlite')))return null;
 const selections=new GoldenSelections(store,{directory,collectionConfigured});
 if(enabled)installGoldenSelectionRoutes(accounts,selections,{provider:goldenPhotoProvider(selections,providerOptions),photoViews});
 return {selections,referencePlan:(user,albumIds)=>selections.exportPlan(user,albumIds),matchesSnapshot:snapshot=>selections.matchesSnapshot(snapshot),eraseUser:user=>selections.eraseUser(user),close:()=>selections.close()};
}
module.exports={createGoldenAppSettings};
