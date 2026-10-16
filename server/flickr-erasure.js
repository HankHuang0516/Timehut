'use strict';
function flickrErasure(providerRequest,credentials,expectedUserId){
 if(typeof expectedUserId!=='string'||!/^\d+@N\d{2}$/.test(expectedUserId))throw new Error('Central Flickr identity must be explicitly configured');
 async function verified(){const current=credentials(),data=await providerRequest('flickr.test.login',{},current,'GET');if(data.stat!=='ok'||data.user?.id!==expectedUserId)throw new Error('Central Flickr identity mismatch');return current;}
 return{verifyProvider:async()=>{await verified();return true;},deletePhoto:async id=>{if(typeof id!=='string'||!/^\d+$/.test(id))throw new Error('Invalid exact photo identity');const current=await verified();try{await providerRequest('flickr.photos.delete',{photo_id:id},current,'POST');}catch(error){if(error.code!==1)throw error;}}};
}
module.exports={flickrErasure};
