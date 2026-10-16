'use strict';
// New app albums are virtual memberships, never provider photoset IDs.
function accountAlbumMembership(store){
 return(req,res,next)=>{
  const scope=req.accountMembership;if(!scope)return next();
  if(req.method!=='POST'||req.params.albumId!==scope.albumId||req.params.operation!==scope.action+'_photos'||req.actor?.id!==scope.userId)return res.status(404).json({error:'Resource unavailable'});
  try{const results=store.changePhotoMembership(scope.userId,scope.albumId,req.body?.photoIds,scope.action);return res.json({results,successCount:results.length,message:scope.action==='add'?'已加入相簿':'已從相簿移出'});}
  catch(_){return res.status(409).json({error:'相簿變更尚未確認，請稍後重新查看；原照片與收據會保留'});}
 };
}
module.exports={accountAlbumMembership};
