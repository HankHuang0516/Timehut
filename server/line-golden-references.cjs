'use strict';
// Hank1031: Reference-person golden engine loader and live reference proof.
//
// The owner's selected reference photos and the real MiniMax calibration are
// private artifacts kept outside the source tree. This module only proves that
// those artifacts are still current and that the owner's live account state
// still backs them. It never decides anything: the comparison policy owns the
// model verdicts and the relevance gate owns every import authorization.
//
// Fail-closed. A missing artifact, a changed digest, a lapsed consent version,
// a changed reference revision or a lost membership leaves the engine
// unavailable. It never falls back to a weaker check and never enables itself.
const fs=require('node:fs');
const policy=require('./line-golden-policy.cjs');
const {photoInAlbum}=require('./account-store');
const check=(v,c)=>{if(!v)throw Error(c);};

/** Private artifact reader. The file must be a plain owner-only file at an
 * absolute canonical path; anything else is rejected rather than parsed. */
function privateJSON(file){
 check(typeof file==='string'&&file.startsWith('/'),'GOLDEN_PRIVATE_FILE_REQUIRED');
 let real,stat;
 try{real=fs.realpathSync(file);stat=fs.lstatSync(file);}catch{throw Error('GOLDEN_PRIVATE_FILE_REQUIRED');}
 check(real===file&&stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.uid===process.getuid()&&(stat.mode&0o077)===0&&stat.size>0&&stat.size<=65536,'GOLDEN_PRIVATE_FILE_REQUIRED');
 const bytes=fs.readFileSync(file);
 return {file,digest:policy.hash(bytes),value:JSON.parse(bytes)};
}

/** Load the owner-selected reference snapshot and the real calibration record.
 * Both are private; a missing or malformed artifact throws so the caller can
 * leave the engine unavailable instead of starting a weaker path. */
function loadGoldenArtifacts(snapshotFile,calibrationFile){
 const s=privateJSON(snapshotFile),c=privateJSON(calibrationFile);
 const snapshot=policy.snapshot(s.value);
 check(c.value?.snapshotDigest===policy.hash(snapshot),'GOLDEN_CALIBRATION_SNAPSHOT_MISMATCH');
 check(c.value?.policyDigest===policy.POLICY_DIGEST,'GOLDEN_CALIBRATION_POLICY_MISMATCH');
 return {
  snapshot,
  calibration:c.value,
  verifyFiles:()=>{try{return privateJSON(snapshotFile).digest===s.digest&&privateJSON(calibrationFile).digest===c.digest;}catch{return false;}}
 };
}

/** Live proof that the snapshot still matches the owner's current state:
 * album ownership, photo ownership, album membership, consent version and
 * reference revision. Any drift returns false and stops automation. */
function createLiveReferenceProof({store,selections}){
 return (snapshot)=>{
  try{
   check(store&&selections,'GOLDEN_REFERENCE_PROOF_UNAVAILABLE');
   // The app selection must still carry the current same-person consent and
   // the same reference photos in the same order under the same revision.
   check(selections.matchesSnapshot(snapshot)===true,'GOLDEN_REFERENCE_REVISION_CHANGED');
   const state=store.state;
   for(const album of snapshot.albums){
    check(store.owns(snapshot.ownerId,'album',album.albumId)===true,'GOLDEN_ALBUM_NOT_OWNED');
    // Hank1102: the owner's original family albums live at the photo provider
    // (legacy household). Their reference photos were membership-checked at the
    // provider when the owner saved them (getAllContexts) and are not mirrored
    // in the account media table, so absence there is not a failure. A local
    // row, when present, must still be owned and not deleted.
    const albumRow=state?.albums?.[String(album.albumId)];
    const providerAlbum=albumRow?.legacyProviderAlbum===true&&state?.legacyHousehold?.ownerUserId===snapshot.ownerId;
    for(const photo of album.photos){
     const row=state?.media?.[String(photo.photoId)];
     if(!row){check(providerAlbum,'GOLDEN_PHOTO_NOT_OWNED');continue;}
     check(store.owns(snapshot.ownerId,'photo',photo.photoId)===true,'GOLDEN_PHOTO_NOT_OWNED');
     check(providerAlbum||photoInAlbum(row,album.albumId)===true,'GOLDEN_PHOTO_NOT_IN_ALBUM');
    }
   }
   return true;
  }catch{return false;}
 };
}

/** Compose the canonical autonomy with the golden reference-person source.
 * The source is trusted only while the private artifacts and the owner's live
 * selections both still hold; otherwise the engine reports not ready. */
function composeGoldenAutonomy({createLineAutonomy,inbox,store,selections,snapshotFile,calibrationFile}={}){
 check(typeof createLineAutonomy==='function','CANONICAL_AUTONOMY_FACTORY_REQUIRED');
 const artifacts=loadGoldenArtifacts(snapshotFile,calibrationFile);
 const verifyReferences=createLiveReferenceProof({store,selections});
 const {createGoldenAutonomy}=require('./line-golden-bootstrap.cjs');
 return createGoldenAutonomy(createLineAutonomy,inbox,{enabled:true,...artifacts,verifyReferences});
}
module.exports={loadGoldenArtifacts,createLiveReferenceProof,composeGoldenAutonomy,privateJSON};
