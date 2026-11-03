'use strict';
// The saved source binding is the owner's continuing processing instruction.
// This reader never creates consent/grant records or rewrites their history.
class CollectionSettings {
 constructor(inbox){this.inbox=inbox;this.db=inbox.db;}
 get(user,{sourceType,sourceId}){
  this.inbox.user(user);
  if(!['user','group'].includes(sourceType)||typeof sourceId!=='string'||!(sourceType==='user'?/^U[a-f0-9]{32}$/:/^C[a-f0-9]{32}$/).test(sourceId))throw Object.assign(Error('SOURCE_INVALID'),{status:400});
  const row=sourceType==='user'
   ?this.db.prepare('SELECT * FROM links WHERE line_id=? AND user_id=? AND active=1').get(sourceId,user)
   :this.db.prepare('SELECT * FROM groups WHERE group_id=? AND user_id=? AND active=1').get(sourceId,user);
  if(!row||!this.db.prepare('SELECT 1 FROM links WHERE line_id=? AND user_id=? AND active=1').get(sourceType==='user'?sourceId:row.line_id,user))return null;
  const source=sourceType+':'+sourceId,albumIds=this.inbox.bindingAlbums(source);
  if(!albumIds.length)return null;
  // Deleted or foreign destinations must fail closed, never silently narrow
  // the processing instruction to an unrelated subset.
  for(const id of albumIds)this.inbox.album(user,id);
  return {sourceType,sourceId,albumIds,bindingRevision:row.since,authorizationSource:'collection_settings'};
 }
 list(user){
  this.inbox.user(user);
  const rows=[...this.db.prepare("SELECT 'user' AS sourceType,line_id AS sourceId FROM links WHERE user_id=? AND active=1").all(user),...this.db.prepare("SELECT 'group' AS sourceType,group_id AS sourceId FROM groups WHERE user_id=? AND active=1").all(user)];
  return rows.map(row=>this.get(user,row)).filter(Boolean);
 }
 hasAlbum(user,album){return this.list(user).some(s=>s.albumIds.includes(album));}
}
module.exports={CollectionSettings};
