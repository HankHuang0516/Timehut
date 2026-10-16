'use strict';
// Actual standalone DELETE-mode import and erasure; no provider or production access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {SQLiteAccountStore}=require('../server/account-sqlite-store');
const {AccountUploadJournal}=require('../server/account-upload-journal');
const {AccountErasure}=require('../server/account-erasure');
const output=fs.mkdtempSync('/Users/hank/.local/share/project-storage/internal/builds/timehut-closed-delete-erasure-');
const report={status:'FAIL',checks:[],providerRequests:0};
(async()=>{let store,reader;try{
 const uploads=path.join(output,'uploads');fs.mkdirSync(uploads);const directory=path.join(uploads,'.accounts'),password='synthetic-closed-delete-password';
 store=new SQLiteAccountStore(directory);const owner=await store.register('synthetic-owner',password,'Protected family'),a=await store.register('synthetic-empty',password,'Empty verification'),ownerSession=await store.login('synthetic-owner',password);
 const marker='SYNTHETIC_DELETED_PRIVATE_FRAGMENT_'+crypto.randomUUID();
 store.database.exec('PRAGMA secure_delete=OFF;');let state=structuredClone(store.state);state.users[a.id].displayName=marker.repeat(5000);store.database.prepare('UPDATE account_snapshot SET payload=? WHERE id=1').run(JSON.stringify(state));store.database.exec('PRAGMA wal_checkpoint(TRUNCATE);');state.users[a.id].displayName='Current empty verification';store.database.prepare('UPDATE account_snapshot SET payload=? WHERE id=1').run(JSON.stringify(state));store.database.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');store.close();
 assert.equal(fs.readFileSync(path.join(directory,'accounts.sqlite'))[18],1);assert(fs.readFileSync(path.join(directory,'accounts.sqlite')).includes(Buffer.from(marker)));
 store=new SQLiteAccountStore(directory);assert.equal(store.database.prepare('PRAGMA journal_mode').get().journal_mode,'delete');assert.deepEqual({...store.database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()},{busy:0,log:-1,checkpointed:-1});
 const provider=async()=>{report.providerRequests++;throw Error('No provider call allowed');};
 const make=()=>new AccountErasure(store,new AccountUploadJournal(store,uploads),{uploadsDirectory:uploads,legacyOwnerId:owner.id,readQueue:()=>[],verifyProvider:provider,deletePhoto:provider});let worker=make();
 const request=store.deleteAccount(a.id);await worker.runUser(a.id);assert.equal(store.deletionStatus(request.deletionReceipt).status,'complete');assert.equal(store.principal(ownerSession.token).id,owner.id);
 for(const name of ['accounts.sqlite','accounts.sqlite-journal','accounts.sqlite-wal','accounts.sqlite-shm']){const file=path.join(directory,name);if(fs.existsSync(file))assert(!fs.readFileSync(file).includes(Buffer.from(marker)),name);}
 assert.equal(report.providerRequests,0);report.checks.push('Closed standalone DELETE-mode database reopens, removes historical private fragments, completes empty-user erasure and preserves owner/session without provider calls');
 const b=await store.register('synthetic-reader',password,'Reader test'),br=store.deleteAccount(b.id);reader=new DatabaseSync(store.sqliteFile);reader.exec('BEGIN');reader.prepare('SELECT payload FROM account_snapshot').get();
 await assert.rejects(()=>worker.runUser(b.id));assert.throws(()=>store.assertAvailable());reader.exec('ROLLBACK');reader.close();reader=null;store.close();store=new SQLiteAccountStore(directory);worker=make();assert.notEqual(store.deletionStatus(br.deletionReceipt).status,'complete');await worker.runUser(b.id);assert.equal(store.deletionStatus(br.deletionReceipt).status,'complete');report.checks.push('Held real DELETE-mode reader blocks a writer commit and fails authorization closed; no completion is acknowledged, and the same exact job resumes after reader release and store reopen');
 const c=await store.register('synthetic-reopen',password,'Reopen test'),cr=store.deleteAccount(c.id);store.compactDeletedAccountDatabase=()=>{throw Error('Synthetic compaction interruption');};await assert.rejects(()=>worker.runUser(c.id));assert.equal(store.deletionStatus(cr.deletionReceipt).status,'scrubbing');store.close();store=new SQLiteAccountStore(directory);worker=make();await worker.runUser(c.id);assert.equal(store.deletionStatus(cr.deletionReceipt).status,'complete');assert.equal(store.principal(ownerSession.token).id,owner.id);assert.equal(report.providerRequests,0);report.checks.push('Already-scrubbing DELETE-mode job survives real process-store close/reopen and completes without recreating user or touching owner');
 report.status='PASS_CLOSED_DELETE_MODE_ERASURE_AND_RECOVERY';
 }catch(error){report.error=error.stack;process.exitCode=1;}finally{reader?.close();store?.close();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,...report}));}})();
