'use strict';
// Staged persistent account store. SQLite serializes writers on one service volume.
// Existing JSON bytes remain as a migration source; no production activation here.
const fs=require('node:fs'),path=require('node:path');
const {AccountStore}=require('./account-store');
class SQLiteAccountStore extends AccountStore {
 constructor(directory,now=Date.now){
  super(directory,now);const initial=structuredClone(this.state),file=path.join(directory,'accounts.sqlite');this.sqliteFile=file;
  try{
   const exists=fs.existsSync(file);if(exists&&fs.statSync(file).size===0)throw new Error('Unconfirmed empty account database');
   const {DatabaseSync}=require('node:sqlite');this.database=new DatabaseSync(file);fs.chmodSync(file,0o600);
   this.database.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;');
   if(exists){const version=this.database.prepare('PRAGMA user_version').get().user_version,integrity=this.database.prepare('PRAGMA quick_check').get().quick_check;if(version!==1||integrity!=='ok')throw new Error('Account database requires recovery');}
   else {
    this.database.exec('PRAGMA journal_mode=WAL; BEGIN IMMEDIATE;');
    try{this.database.exec('CREATE TABLE account_snapshot (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>=0), payload TEXT NOT NULL) STRICT; PRAGMA user_version=1;');this.database.prepare('INSERT INTO account_snapshot(id,revision,payload) VALUES(1,0,?)').run(JSON.stringify(initial));this.database.exec('COMMIT;');}
    catch(error){try{this.database.exec('ROLLBACK;');}catch(_){}throw error;}
   }
   Object.defineProperty(this,'state',{get:()=>this.readState()});this.readState();
  }catch(error){this.error=error;try{this.database?.close();}catch(_){}throw new Error('Account database unavailable; existing files preserved');}
 }
 readState(){if(this.error)throw new Error('Account database unavailable');try{const row=this.database.prepare('SELECT payload FROM account_snapshot WHERE id=1').get();if(!row||Buffer.byteLength(row.payload)>16*1024*1024)throw new Error('Invalid account snapshot');const state=JSON.parse(row.payload);this.validate(state);return state;}catch(error){this.error=error;throw new Error('Account database read unavailable; no cached authorization');}}
 commit(change){
  if(this.error)throw new Error('Account database unavailable');let transaction=false,writing=false;
  try{this.database.exec('BEGIN IMMEDIATE;');transaction=true;const candidate=structuredClone(this.readState()),value=change(candidate);this.validate(candidate);const bytes=JSON.stringify(candidate);if(Buffer.byteLength(bytes)>16*1024*1024)throw new Error('Account capacity reached');writing=true;
   const result=this.database.prepare('UPDATE account_snapshot SET payload=?, revision=revision+1 WHERE id=1').run(bytes);if(result.changes!==1)throw new Error('Account commit unavailable');this.database.exec('COMMIT;');transaction=false;return value;
  }catch(error){if(transaction)try{this.database.exec('ROLLBACK;');}catch(rollback){this.error=rollback;}if(writing)this.error=error;throw error;}
 }
 principal(token){try{return super.principal(token);}catch(_){return null;}}
 owns(userId,kind,id){try{return super.owns(userId,kind,id);}catch(_){return false;}}
 listAlbums(userId){try{return super.listAlbums(userId);}catch(_){return [];}}
 scrubDeletedAccount(userId){
  const current=this.readState();if(current.users[userId]||current.deletions?.[userId]?.status!=='scrubbing')throw new Error('Live deletion unavailable');
  // Migration JSON is no longer authoritative, but may retain the old account.
  // Rewrite only its exact account rows; other recovery source rows remain.
  this.database.exec('BEGIN IMMEDIATE;');try{
   if(this.readState().deletions?.[userId]?.status!=='scrubbing')throw new Error('Deletion storage phase changed');
   if(fs.existsSync(this.file+'.new'))throw new Error('Migration source commit requires recovery');
   if(fs.existsSync(this.file)){const legacy=JSON.parse(fs.readFileSync(this.file,'utf8'));this.validate(legacy);for(const table of ['sessions','nativeLogins','albums','media','receipts','admissions','photoMutations','photoDeletes'])for(const [id,row]of Object.entries(legacy[table]||{}))if(row.userId===userId)delete legacy[table][id];delete legacy.users[userId];if(legacy.deletions)delete legacy.deletions[userId];this.validate(legacy);const fd=fs.openSync(this.file+'.new','wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(legacy));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(this.file+'.new',this.file);}
   this.database.exec('COMMIT;');
  }catch(error){this.database.exec('ROLLBACK;');throw error;}
  this.compactDeletedAccountDatabase();
  const checkpoint=this.database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();if(checkpoint.busy!==0||checkpoint.log!==0)throw new Error('Private journal truncation requires idle readers');
  const fd=fs.openSync(this.directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 }
 compactDeletedAccountDatabase(){const disk=fs.statfsSync(this.directory),available=disk.bavail*disk.bsize,size=fs.statSync(this.sqliteFile).size;if(!Number.isSafeInteger(available)||available<2*size+32*1024*1024)throw new Error('Private database compaction capacity unavailable');this.database.exec('VACUUM;');}
 close(){this.database?.close();}
}
module.exports={SQLiteAccountStore};
