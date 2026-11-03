'use strict';
// Hank1028: User-selected album references; the app never auto-picks photos.
// Saved collection settings authorize current processing. Historical consent
// fields remain unchanged; selecting references is configuration only.
const SCOPE='same-person-reference',CONSENT_VERSION='golden-person-Hank1030-v1';
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
class GoldenSelections{
 constructor(store,{directory,collectionConfigured=()=>false}={}){
  this.store=store;this.collectionConfigured=collectionConfigured;fs.mkdirSync(directory,{recursive:true,mode:0o700});
  if(fs.realpathSync(directory)!==directory||fs.lstatSync(directory).isSymbolicLink())throw Error('Canonical golden storage required');
  const file=path.join(directory,'selections.sqlite'),exists=fs.existsSync(file);
  if(exists&&(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).nlink!==1||fs.statSync(file).size===0))throw Error('Golden storage requires recovery');
  this.db=new DatabaseSync(file);fs.chmodSync(file,0o600);this.db.exec('PRAGMA busy_timeout=3000;PRAGMA synchronous=FULL;PRAGMA secure_delete=ON;');
  if(exists){if(this.db.prepare('PRAGMA user_version').get().user_version!==1||this.db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Golden storage requires recovery');}
  else this.db.exec('PRAGMA journal_mode=WAL;BEGIN IMMEDIATE;CREATE TABLE selections(user_id TEXT NOT NULL,album_id TEXT NOT NULL,revision INTEGER NOT NULL,enabled INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(user_id,album_id)) STRICT;CREATE TABLE owners(user_id TEXT PRIMARY KEY,epoch INTEGER NOT NULL) STRICT;PRAGMA user_version=1;COMMIT;');
  this.db.exec('CREATE TABLE IF NOT EXISTS consent_history(user_id TEXT NOT NULL,album_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,recorded_at INTEGER NOT NULL,PRIMARY KEY(user_id,album_id,revision)) STRICT;');
 }
 album(user,album){this.store.assertAvailable();if(!/^[A-Za-z0-9_-]{1,128}$/.test(album)||!this.store.owns(user,'album',album))fail('相簿不存在或已無法使用',404);return this.store.state.albums[album];}
 preserveConsent(user,album){const r=this.db.prepare('SELECT revision,payload FROM selections WHERE user_id=? AND album_id=?').get(user,album);if(!r)return;const p=JSON.parse(r.payload);if(!Object.hasOwn(p,'consentAt')&&!Object.hasOwn(p,'consentVersion'))return;const old=this.db.prepare('SELECT payload FROM consent_history WHERE user_id=? AND album_id=? AND revision=?').get(user,album,r.revision);if(old&&old.payload!==r.payload)fail('參考設定歷史紀錄不一致');this.db.prepare('INSERT OR IGNORE INTO consent_history VALUES(?,?,?,?,?)').run(user,album,r.revision,r.payload,this.store.now());}
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const v=fn();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 get(user,album){this.album(user,album);const r=this.db.prepare('SELECT * FROM selections WHERE user_id=? AND album_id=?').get(user,album);const p=r?JSON.parse(r.payload):null;
  return {schema:1,albumId:album,revision:r?.revision??0,enabled:r?.enabled===1,photoIds:r?.enabled? p.photoIds:[],consentAt:r?.enabled?p.consentAt:null,consentVersion:r?.enabled?p.consentVersion:null,consentCurrent:r?.enabled===1&&this.collectionConfigured(user,album)===true,authorizationSource:this.collectionConfigured(user,album)===true?'collection_settings':null,minimum:1,maximum:5,automaticUploadEnabled:false};
 }
 list(user){return this.store.listAlbums(user).map(a=>this.get(user,a.id));}
 configure(user,album,input,verifiedPhotos){
  if(!input||!(['expectedRevision,photoIds','consent,expectedRevision,photoIds'].includes(Object.keys(input).sort().join(',')))||Object.hasOwn(input,'consent')&&input.consent!==true||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||!Array.isArray(input.photoIds)||input.photoIds.length<1||input.photoIds.length>5||new Set(input.photoIds).size!==input.photoIds.length||input.photoIds.some(id=>typeof id!=='string'||!/^\d{1,32}$/.test(id)))fail('請選擇至少3張、最多5張參考照片',400);
  if(!Array.isArray(verifiedPhotos)||verifiedPhotos.length!==input.photoIds.length||verifiedPhotos.some((p,i)=>p.id!==input.photoIds[i]||p.media==='video'))fail('所選照片尚未確認屬於此相簿',404);
  return this.tx(()=>{const old=this.get(user,album);if(old.revision!==input.expectedRevision)fail('參考照片已在其他頁面更新，請重新讀取');
   this.preserveConsent(user,album);const payload={photoIds:[...input.photoIds],configuredAt:this.store.now(),...(input.consent===true?{consentAt:this.store.now(),scope:SCOPE,consentVersion:CONSENT_VERSION}:{})};
   this.db.prepare('INSERT INTO selections VALUES(?,?,?,?,?) ON CONFLICT(user_id,album_id) DO UPDATE SET revision=excluded.revision,enabled=1,payload=excluded.payload').run(user,album,old.revision+1,1,JSON.stringify(payload));this.bump(user);return this.get(user,album);
  });
 }
 bump(user){this.db.prepare('INSERT INTO owners VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET epoch=epoch+1').run(user);}
 revoke(user,album,revision){return this.tx(()=>{const old=this.get(user,album);if(!Number.isSafeInteger(revision)||revision!==old.revision)fail('參考照片已更新，請重新讀取');this.preserveConsent(user,album);this.db.prepare('INSERT INTO selections VALUES(?,?,?,?,?) ON CONFLICT(user_id,album_id) DO UPDATE SET revision=excluded.revision,enabled=0,payload=excluded.payload').run(user,album,old.revision+1,0,'{}');this.bump(user);return this.get(user,album);});}
 exportPlan(user,albumIds){
  if(!Array.isArray(albumIds)||!albumIds.length||albumIds.length>100||new Set(albumIds).size!==albumIds.length)fail('參考相簿範圍無效',400);
  const selections=albumIds.map(albumId=>{const v=this.get(user,albumId);if(!v.enabled||v.photoIds.length<1)fail('相簿尚未選擇參考照片');if(!v.consentCurrent)fail('請先保存此相簿的收件來源設定');return {albumId,photoIds:v.photoIds,confirmed:true};});
  return {schema:2,consentVersion:CONSENT_VERSION,ownerId:user,revision:this.db.prepare('SELECT epoch FROM owners WHERE user_id=?').get(user).epoch,externalAnalysisConsent:true,selections};
 }
 matchesSnapshot(snapshot){try{return this.db.prepare('SELECT epoch FROM owners WHERE user_id=?').get(snapshot.ownerId)?.epoch===snapshot.revision&&snapshot.consentVersion===CONSENT_VERSION&&snapshot.albums.every(a=>{const v=this.get(snapshot.ownerId,a.albumId);return v.enabled&&v.photoIds.length>=3&&JSON.stringify(v.photoIds)===JSON.stringify(a.photos.map(p=>p.photoId));});}catch{return false;}}
 eraseUser(user){this.tx(()=>{this.db.prepare('DELETE FROM consent_history WHERE user_id=?').run(user);this.db.prepare('DELETE FROM selections WHERE user_id=?').run(user);this.db.prepare('DELETE FROM owners WHERE user_id=?').run(user);});}
 close(){this.db.close();}
}
module.exports={GoldenSelections,SCOPE,CONSENT_VERSION};
