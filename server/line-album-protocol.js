'use strict';
// Verify exact bytes BEFORE JSON parsing. No Express/global JSON middleware here.
const crypto = require('node:crypto');
const deny = (message, status = 400) => { throw Object.assign(Error(message), {status}); };
function decodeWebhook(bytes, signature, {channelSecret, destination, allowedGroupIds = []} = {}) {
 if (typeof channelSecret !== 'string' || channelSecret.length < 16 || typeof destination !== 'string' || !/^U[a-f0-9]{32}$/.test(destination)) deny('LINE channel unavailable', 503);
 if (!Buffer.isBuffer(bytes) || bytes.length > 1024 * 1024 || typeof signature !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) deny('Invalid LINE signature', 401);
 const expected = crypto.createHmac('sha256', channelSecret).update(bytes).digest();
 const supplied = Buffer.from(signature, 'base64');
 if (supplied.length !== expected.length || !crypto.timingSafeEqual(expected, supplied)) deny('Invalid LINE signature', 401);
 let body;
 try { body = JSON.parse(bytes.toString('utf8')); } catch (_) { deny('Invalid LINE payload'); }
 if (!body || body.destination !== destination || !Array.isArray(body.events) || body.events.length > 100) deny('Invalid LINE payload');
 if (!Array.isArray(allowedGroupIds) || allowedGroupIds.length > 1000 || allowedGroupIds.some(id => typeof id !== 'string' || !/^C[a-f0-9]{32}$/.test(id))) deny('LINE group settings unavailable', 503);
 return body.events.map(event => normalizeEvent(event, new Set(allowedGroupIds))).filter(Boolean);
}
function normalizeEvent(event, allowedGroups) {
 if (!event || typeof event !== 'object' || Array.isArray(event)) deny('Invalid LINE event');
 // Group membership alone is not collection consent. Explicitly enabled groups
 // retain their origin, which downstream routing must bind to an album/account.
 const sourceType = event.source?.type;
 if (!['user', 'group'].includes(sourceType)) return null;
 if(sourceType==='group'&&(typeof event.source.groupId!=='string'||!/^C[a-f0-9]{32}$/.test(event.source.groupId)))deny('Invalid LINE group');
 // Leave is control metadata: it must invalidate pending binding proofs even
 // before a group has opted in. Media from these groups remains excluded.
 if (sourceType === 'group' && !allowedGroups.has(event.source.groupId) && !['leave','join'].includes(event.type) && !(event.type==='message'&&event.message?.type==='text'&&event.message.text?.trim()==='綁定時光相簿')) return null;
 const userId = event.source.userId ?? null;
 const senderOptional = sourceType === 'group' && ['leave', 'join', 'unsend'].includes(event.type);
 if (!(senderOptional && userId === null) && (typeof userId !== 'string' || !/^U[a-f0-9]{32}$/.test(userId))) deny('Invalid LINE user');
 if (typeof event.webhookEventId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(event.webhookEventId) || !Number.isSafeInteger(event.timestamp) || event.timestamp < 0) deny('Invalid LINE event');
 const base = {eventId: event.webhookEventId, lineUserId: userId, timestamp: event.timestamp,
  source: sourceType === 'user' ? {type: 'user', id: userId} : {type: 'group', id: event.source.groupId}};
 if (event.type === 'leave' && sourceType === 'group') return {...base, type: 'group_left'};
 if (event.type === 'join' && sourceType === 'group') return {...base, type: 'group_joined'};
 if (event.type === 'follow' && sourceType === 'user') return {...base,type:'link_request'};
 if (event.type === 'message' && event.message?.type === 'text') {
  if(sourceType==='user'&&['登入','綁定','連結帳號','收件設定','我的相簿'].includes(event.message.text?.trim()))return {...base,type:'link_request'};
  if(sourceType==='group'&&event.message.text?.trim()==='綁定時光相簿')return {...base,type:'group_bind_request'};
  return null;
 }
 if (event.type === 'unfollow') return {...base, type: 'unlink'};
 if (event.type === 'unsend') {
  if (typeof event.unsend?.messageId !== 'string' || !/^\d{1,64}$/.test(event.unsend.messageId)) deny('Invalid LINE message');
  return {...base, type: 'unsend', messageId: event.unsend.messageId};
 }
 if (event.type === 'accountLink') {
  if (sourceType !== 'user') deny('Account linking requires direct chat');
  if (event.link?.result !== 'ok') return {...base, type: 'link_failed'};
  if (typeof event.link.nonce !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(event.link.nonce)) deny('Invalid LINE nonce');
  return {...base, type: 'account_link', nonce: event.link.nonce};
 }
 if (event.type === 'message' && ['image', 'video'].includes(event.message?.type)) {
  if (event.message.contentProvider?.type !== 'line') return null;
  if (typeof event.message.id !== 'string' || !/^\d{1,64}$/.test(event.message.id)) deny('Invalid LINE message');
  return {...base, type: 'media', media: event.message.type, messageId: event.message.id};
 }
 return null;
}
// No URL from users, event payloads or the model can become a download target.
function contentURL(messageId) {
 if (typeof messageId !== 'string' || !/^\d{1,64}$/.test(messageId)) deny('Invalid LINE message');
 return `https://api-data.line.me/v2/bot/message/${messageId}/content`;
}
module.exports = {decodeWebhook, contentURL};
