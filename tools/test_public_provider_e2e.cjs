/* Bounded QA sidecar. CLI has NO live transport. LocalDriver is loopback-only. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const assert = require('node:assert/strict');

const ORIGIN = 'https://just-healing-production.up.railway.app';
const PROPOSAL = '.codex-local/qa/20261016-public-provider-e2e-proposal';
const MANIFEST_SHA = '59399af64714fe259d16912db6ea460661541d9327d769123b9cf0a4ddd1be6e';
const PREPARATION_SHA = '409de300e45c016a93da8eaf91151517c8d5c45f83efea22321c1d2c07c39ee3';
const ASSETS = Object.freeze([
  ['public-r93-batch-a.png', 2315, '7cd168a5ef85adb2172aa461acfde35025b493dcdb4a60571e418fdf9ee497fd', 'image/png'],
  ['public-r93-batch-b.png', 2393, 'da0805a8c25344e5117ce2f6d32edaeb2d5b94d81f8bf33f59228a221aadc788', 'image/png'],
  ['public-r93-single-c.png', 2377, '834fbd7d75b466486291598a65c438413eddd5d85828d4a2ba3b907cd14e4a51', 'image/png'],
  ['public-r93-two-second.mp4', 24731, 'f615183359be88970ec4f7fd4a4cb015ee8c1a6d5cb06a9d13cdd0923a660542', 'video/mp4']
].map(Object.freeze));
const SCOPE = Object.freeze({ordinaryAccounts: 2, virtualAlbumsA: 2, virtualAlbumsB: 1,
  media: 4, providerCreationsMax: 4, flickrPhotosets: 0, oauthChanges: 0, permissionChanges: 0,
  B: 'read-only-denial-probes-known-A-IDs', cleanup: 'only-new4-recorded-media-and-own2-QA-accounts'});
const BLOCKERS = Object.freeze([
  'LIVE_TRANSPORT_NOT_IMPLEMENTED: even a structurally valid receipt cannot enable live execution',
  'NEW_HANK_AUTHORIZATION_REQUIRED: main agent must verify exact user text/reference and manifest SHA',
  'INDEPENDENT_REVIEW_REQUIRED: local tests do not satisfy candidate, E2E or six-page gates',
  'SIGNED_READBACK_REQUIRED: ordinary API omits central-provider owner/private flags/source SHA; no SSH/private DB fallback',
  'LIVE_ACCOUNT_ALBUM_LIFECYCLE_MISSING: durable pre-registration intent, ambiguous account/album outcome reconciliation',
  'LIVE_RECEIPT_CONSUMPTION_MISSING: trusted atomic authorization/run binding and cross-ledger creation budget',
  'LIVE_ERASURE_READBACK_MISSING: DELETE /accounts/me returns 202, not completed deletion',
  'LIVE_VIEW_AND_MUTATION_READBACK_MISSING: playback, original bytes, tags/date/membership and exact cleanup proofs'
]);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(code); };
function regular(file, limit) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.size > limit || st.nlink !== 1) fail('UNSAFE_FILE');
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}
function validateProposal(root = path.resolve(__dirname, '..')) {
  const dir = path.join(root, PROPOSAL);
  // No path from preparation.json or a manifest is executed or followed.
  const manifestBytes = regular(path.join(dir, 'manifest.json'), 16384);
  const preparation = regular(path.join(dir, 'preparation.json'), 4096);
  assert.equal(hash(manifestBytes), MANIFEST_SHA, 'MANIFEST_CHANGED');
  assert.equal(hash(preparation), PREPARATION_SHA, 'PREPARATION_CHANGED');
  const m = JSON.parse(manifestBytes);
  assert.equal(m.status, 'PREPARED_NOT_AUTHORIZED_NOT_EXECUTED');
  assert.equal(m.files.length, 4); assert.equal(m.totalBytes, 31816);
  const assets = ASSETS.map(([name, bytes, sha256, mime], i) => {
    assert.deepEqual(m.files[i], {name, bytes, sha256, kind: i === 3 ? 'video' : 'photo', artificial: true});
    const body = regular(path.join(dir, 'media', name), 32768);
    assert.equal(body.length, bytes, 'ASSET_LENGTH'); assert.equal(hash(body), sha256, 'ASSET_HASH');
    return {name, bytes, sha256, mime};
  });
  return {manifestSHA256: MANIFEST_SHA, assets, totalBytes: 31816};
}
function plan(root) {
  const p = validateProposal(root);
  return {...p, mode: 'plan', liveReady: false, remoteRequests: 0, scope: SCOPE, blockers: BLOCKERS,
    batches: [{files: p.assets.slice(0, 2).map(a => a.name), tags: 'same run-specific tags'},
      {files: p.assets.slice(2).map(a => a.name), tags: 'distinct run-specific per-file tags'}],
    checks: ['photo/video view', 'original exact bytes/SHA', 'tag set/readback', 'date movement/readback',
      'virtual membership add/remove/readback', 'current own scope', 'B read-only denial for known A IDs',
      'provider owner/private/source signed readback before exact new-media deletion', 'own2 account erasure receipt completion'],
    forbidden: ['OAuth', 'permission edits', 'Flickr photoset creation', 'family media', 'old terminal IDs',
      'upload retry endpoint', 'SSH', 'Railway', 'private user DB', 'backend restart/deploy', 'GUI']};
}
// Structural validation is NOT verification of user authority or a live capability.
// This tool never creates an authorization receipt and has no --grant option.
function validateAuthorization(r, now = Date.now()) {
  assert.equal(r?.schema, 'timehut-public-provider-authorization-v1');
  assert.equal(r.issuer, 'main-agent-after-exact-Hank-approval');
  assert.equal(r.manifestSHA256, MANIFEST_SHA, 'AUTH_MANIFEST');
  assert.equal(r.origin, ORIGIN, 'AUTH_ORIGIN');
  assert.deepEqual(r.scope, SCOPE, 'AUTH_SCOPE');
  for (const v of [r.userText, r.userReference, r.independentReviewReference, r.receiptId])
    assert(typeof v === 'string' && v.trim().length >= 8, 'AUTH_PROVENANCE');
  assert(Number.isSafeInteger(r.issuedAt) && Number.isSafeInteger(r.expiresAt) &&
    r.issuedAt <= now && r.expiresAt > now && r.expiresAt - r.issuedAt <= 24 * 3600000, 'AUTH_TIME');
  assert(Array.isArray(r.approvedNewQAAccounts) && r.approvedNewQAAccounts.length === 2, 'AUTH_ACCOUNTS');
  assert(new Set(r.approvedNewQAAccounts).size === 2 && r.approvedNewQAAccounts.every(s =>
    typeof s === 'string' && /^qa-e2e-[a-z0-9-]{8,24}$/.test(s)), 'AUTH_ACCOUNTS');
  return {structurallyValid: true, authorityVerified: false, liveReady: false};
}
function liveGate(receipt) {
  validateAuthorization(receipt);
  fail('LIVE_PIPELINE_INCOMPLETE: ' + BLOCKERS.join('; '));
}
function readAuthorizationReceipt(file) {
  // Only the future main-agent handoff directory is eligible. In particular,
  // never open an arbitrary CLI path, production credential or private DB.
  const parent = path.join(path.resolve(__dirname, '..'), '.codex-local/qa/20261017-public-provider-e2e-driver/authorizations');
  const resolved = path.resolve(file);
  assert.equal(path.dirname(resolved), parent, 'AUTH_RECEIPT_LOCATION');
  assert(/^authorization-[a-f0-9-]{36}\.json$/.test(path.basename(resolved)), 'AUTH_RECEIPT_FILENAME');
  assert.equal(fs.realpathSync(parent), parent, 'AUTH_RECEIPT_SYMLINK');
  return JSON.parse(regular(resolved, 16384));
}
function assertCredentialLocation(file, repo) {
  // Metadata-only check. Never reads credentials. Not called by default modes.
  const real = fs.realpathSync(file), st = fs.lstatSync(file);
  assert(!st.isSymbolicLink() && st.isFile() && st.nlink === 1 && st.uid === process.getuid() && (st.mode & 0o777) === 0o600, 'CREDENTIAL_MODE');
  assert(real.startsWith('/Users/hank/.local/share/project-storage/internal/builds/'), 'CREDENTIAL_SSD');
  assert(!real.startsWith(fs.realpathSync(repo) + path.sep), 'CREDENTIAL_REPO');
  return true;
}
function metadataDigest(parts) {
  const h = crypto.createHash('sha256');
  for (const p of parts) { const b = Buffer.from(p); h.update(b.length + '\n').update(b).update('\n'); }
  return h.digest('hex');
}
function syncDir(dir) { const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }

// Full immutable snapshots form an append-only hash chain. A partial write, stale
// writer, existing lock, binding mismatch or corrupted history halts all writes.
class Ledger {
  #fd; #lock; #file; #last; #binding;
  constructor(file, binding, resume = false) {
    this.#file = file; this.#binding = structuredClone(binding);
    assert.equal(binding.mode, 'LOCAL_SYNTHETIC_ONLY', 'NO_LIVE_LEDGER');
    assert.equal(binding.manifestSHA256, MANIFEST_SHA);
    assert(/^[a-f0-9-]{36}$/.test(binding.runId));
    const lock = file + '.lock'; this.#lock = fs.openSync(lock, 'wx', 0o600);
    try {
      if (resume) {
        const rows = Ledger.read(file); this.#last = rows.at(-1);
        assert.deepEqual(this.#last.state.binding, binding, 'LEDGER_BINDING');
        this.#fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW);
      } else {
        this.#fd = fs.openSync(file, 'wx', 0o600);
        this.#append({binding: this.#binding, uploads: [], operations: [], terminal: false});
      }
      syncDir(path.dirname(file));
    } catch (e) { this.close(); throw e; }
  }
  static read(file) {
    const data = regular(file, 4 * 1024 * 1024).toString('utf8');
    assert(data.endsWith('\n'), 'LEDGER_PARTIAL_WRITE');
    const rows = data.slice(0, -1).split('\n').map(s => JSON.parse(s));
    assert(rows.length > 0, 'LEDGER_EMPTY');
    rows.forEach((r, i) => {
      assert.equal(r.seq, i); assert.equal(r.previous, i ? rows[i - 1].digest : null);
      assert.equal(r.digest, hash(JSON.stringify({seq: r.seq, previous: r.previous, state: r.state})), 'LEDGER_HASH');
      if (i) { assert.deepEqual(r.state.binding, rows[0].state.binding); assert(!rows[i - 1].state.terminal, 'LEDGER_AFTER_TERMINAL'); }
    });
    return rows;
  }
  get state() { return structuredClone(this.#last.state); }
  #append(state) {
    const row = {seq: this.#last ? this.#last.seq + 1 : 0, previous: this.#last?.digest || null, state};
    row.digest = hash(JSON.stringify(row));
    fs.writeFileSync(this.#fd, JSON.stringify(row) + '\n'); fs.fsyncSync(this.#fd); this.#last = row;
  }
  change(fn) {
    assert(this.#fd !== undefined, 'LEDGER_CLOSED');
    assert.equal(Ledger.read(this.#file).at(-1).digest, this.#last.digest, 'LEDGER_CHANGED');
    const next = this.state; assert(!next.terminal, 'TERMINAL_NO_REPLAY');
    fn(next); assert.deepEqual(next.binding, this.#binding); this.#append(next);
  }
  close() {
    if (this.#fd !== undefined) { fs.closeSync(this.#fd); this.#fd = undefined; }
    if (this.#lock !== undefined) {
      const st = fs.fstatSync(this.#lock), name = this.#file + '.lock';
      fs.closeSync(this.#lock); this.#lock = undefined;
      const current = fs.lstatSync(name);
      assert(current.ino === st.ino && current.dev === st.dev && !current.isSymbolicLink(), 'LOCK_CHANGED_PRESERVE');
      fs.unlinkSync(name); syncDir(path.dirname(name));
    }
  }
}

// Numeric 127.0.0.1 only, no DNS, proxies, redirects, provider or production URL.
// Token and response bodies are memory-only; errors never echo remote content.
class LoopbackTransport {
  #origin;
  constructor(origin) {
    const u = new URL(origin);
    assert.equal(u.protocol, 'http:'); assert.equal(u.hostname, '127.0.0.1', 'LOOPBACK_ONLY');
    assert(u.port && u.pathname === '/' && !u.search && !u.hash && !u.username && !u.password, 'LOOPBACK_ONLY');
    this.#origin = u.origin;
  }
  request(route, {method = 'GET', token, actor, body, headers = {}} = {}) {
    assert(/^\/api\/[A-Za-z0-9_/?=&.%-]+$/.test(route) && !route.includes('..') && !route.includes('%'), 'ROUTE_CANONICAL');
    assert(!Object.keys(headers).some(k => /authorization|host|origin|expected-user/i.test(k)), 'HEADER_OVERRIDE');
    const bytes = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const req = http.request(this.#origin + route, {method, headers: {...headers,
        Origin: ORIGIN, ...(token ? {Authorization: 'Bearer ' + token} : {}),
        ...(actor ? {'X-Timehut-Expected-User': actor} : {}),
        ...(bytes ? {'Content-Length': bytes.length, ...(!Buffer.isBuffer(body) ? {'Content-Type': 'application/json'} : {})} : {})}}, res => {
        let count = 0; const chunks = [];
        res.on('data', c => { count += c.length; if (count > 65536) res.destroy(new Error('RESPONSE_BOUND')); else chunks.push(c); });
        res.on('error', () => reject(new Error('RESPONSE_UNKNOWN')));
        res.on('end', () => {
          if (res.statusCode >= 300 && res.statusCode < 400) return reject(new Error('REDIRECT_FORBIDDEN'));
          if (actor && res.headers['x-timehut-account'] !== actor) return reject(new Error('RESPONSE_ACTOR'));
          const data = Buffer.concat(chunks); let json;
          try { json = JSON.parse(data); } catch (_) { /* Binary delivery remains bytes. */ }
          resolve({status: res.statusCode, json, bytes: data});
        });
      });
      req.setTimeout(2500, () => req.destroy());
      req.on('error', () => reject(new Error('TRANSPORT_UNKNOWN'))); req.end(bytes || undefined);
    });
  }
}
class LocalDriver {
  #transport; #ledger; #context; #bound; #tokens;
  constructor(transport, ledger, currentContext) {
    assert(transport instanceof LoopbackTransport, 'NO_CUSTOM_OR_LIVE_TRANSPORT');
    this.#transport = transport; this.#ledger = ledger; this.#context = currentContext;
    this.#bound = ledger.state.binding;
    this.#tokens = Object.fromEntries(['A', 'B'].map(role => [role, currentContext(role)?.token]));
    assert.equal(this.#bound.mode, 'LOCAL_SYNTHETIC_ONLY');
    const b = this.#bound;
    assert(b.A?.id !== b.B?.id && b.A?.username !== b.B?.username, 'TWO_DISTINCT_ACCOUNTS');
    assert([b.A, b.B].every(a => /^[a-f0-9-]{36}$/.test(a.id) && /^qa-e2e-[a-z0-9-]{8,24}$/.test(a.username) && Number.isSafeInteger(a.generation)), 'NEW_QA_BINDING');
    assert(b.albumsA.length === 2 && b.albumsB.length === 1 &&
      new Set([...b.albumsA, ...b.albumsB]).size === 3 && [...b.albumsA, ...b.albumsB].every(id => /^[a-f0-9-]{36}$/.test(id)), 'THREE_VIRTUAL_ALBUMS');
  }
  #authority(role) {
    const expected = this.#bound[role], now = this.#context(role);
    assert(expected && now?.id === expected.id && now.generation === expected.generation &&
      typeof now.token === 'string' && now.token === this.#tokens[role], 'ACTOR_GENERATION');
    return {...now};
  }
  async #call(role, route, options) {
    const a = this.#authority(role);
    const r = await this.#transport.request(route, {...options, actor: a.id, token: a.token});
    const now = this.#authority(role); assert.equal(now.token, a.token, 'SESSION_CHANGED');
    return r;
  }
  async verifyActor(role) {
    const r = await this.#call(role, '/api/accounts/me');
    assert.equal(r.status, 200); assert.equal(r.json?.user?.id, this.#bound[role].id);
    assert.equal(r.json.user.username, this.#bound[role].username); assert.equal(r.json.legacyOwner, false, 'FAMILY_OWNER_FORBIDDEN');
  }
  #own(row, role = 'A') {
    this.#authority(role); assert.equal(role, 'A', 'B_READ_ONLY');
    assert(row && row.actor === this.#bound.A.id && row.generation === this.#bound.A.generation &&
      this.#bound.albumsA.includes(row.album), 'EXACT_OWN_ID');
    assert(!row.deleted, 'TERMINAL_MEDIA'); return row;
  }
  async upload(index, body, album = this.#bound.albumsA[0]) {
    assert(Number.isInteger(index) && index >= 0 && index < ASSETS.length, 'EXACT_FOUR_ASSETS');
    const asset = ASSETS[index];
    this.#authority('A'); assert(this.#bound.albumsA.includes(album), 'OWN_VIRTUAL_ALBUM');
    assert.equal(body.length, asset[1]); assert.equal(hash(body), asset[2], 'UPLOAD_BYTES');
    const state = this.#ledger.state; assert(!state.terminal, 'TERMINAL_NO_REPLAY');
    assert(!state.uploads.some(r => r.index === index), 'NO_REPLAY_CHECK_RECEIPT');
    assert(state.uploads.length < 4, 'FOUR_CREATIONS_MAX');
    await this.verifyActor('A');
    const clientId = 'qa_' + crypto.randomBytes(24).toString('hex');
    const tags = 'qa' + this.#bound.runId.replaceAll('-', '') + (index < 2 ? ' batch' : ' individual' + index);
    const date = '2024-01-02';
    const metadata = metadataDigest([album, asset[0], asset[3], tags, asset[0], '', date]);
    const row = {index, clientId, actor: this.#bound.A.id, generation: this.#bound.A.generation,
      album, sha256: asset[2], bytes: asset[1], tags, date, metadata, localId: null, providerId: null, attempted: true};
    // Reserve the unique client ID and uncertain outcome durably BEFORE POST.
    this.#ledger.change(s => { assert(!s.uploads.some(r => r.index === index), 'NO_REPLAY_CHECK_RECEIPT'); assert(s.uploads.length < 4, 'FOUR_CREATIONS_MAX'); s.uploads.push(row); });
    const boundary = 'qa' + crypto.randomBytes(16).toString('hex');
    const fields = {albumId: album, clientUploadId: clientId, title: asset[0], description: '', tags, date};
    const parts = Object.entries(fields).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${asset[0]}"\r\nContent-Type: ${asset[3]}\r\n\r\n`), body, Buffer.from(`\r\n--${boundary}--\r\n`));
    const r = await this.#call('A', '/api/upload', {method: 'POST', body: Buffer.concat(parts), headers: {
      'Content-Type': 'multipart/form-data; boundary=' + boundary, 'X-Timehut-Album': album,
      'X-Timehut-Upload': clientId, 'X-Timehut-Content-SHA256': asset[2], 'X-Timehut-Metadata-SHA256': metadata}});
    assert.equal(r.status, 200, 'UPLOAD_UNKNOWN_CHECK_RECEIPT');
    assert(r.json?.results?.length === 1 && r.json.results[0].success === true, 'UPLOAD_UNKNOWN_CHECK_RECEIPT');
    this.#observe(index, r.json.results[0].localId, r.json.results[0].photoId);
    return this.#ledger.state.uploads.find(r => r.index === index);
  }
  #observe(index, localId, providerId) {
    assert(/^local_[A-Za-z0-9_-]+$/.test(localId), 'RECEIPT_ID');
    if (providerId != null) assert(typeof providerId === 'string' && /^[0-9]+$/.test(providerId), 'PROVIDER_ID');
    this.#ledger.change(s => {
      const row = this.#own(s.uploads.find(r => r.index === index));
      assert(!row.localId || row.localId === localId, 'RECEIPT_ID_CHANGED');
      assert(!s.uploads.some(r => r.index !== index && r.localId === localId), 'RECEIPT_COLLISION');
      assert(!providerId || !s.uploads.some(r => r.index !== index && r.providerId === providerId), 'PROVIDER_COLLISION');
      assert(!row.providerId || !providerId || row.providerId === providerId, 'PROVIDER_ID_CHANGED');
      row.localId = localId; if (providerId) row.providerId = providerId;
    });
  }
  async reconcile(index) {
    const row = this.#own(this.#ledger.state.uploads.find(r => r.index === index));
    const r = await this.#call('A', '/api/uploads/admission/' + row.clientId);
    assert.equal(r.status, 200); const v = r.json;
    assert(['not_found', 'not_accepted', 'receiving', 'accepted', 'completed'].includes(v?.admissionStatus), 'ADMISSION_UNKNOWN');
    if (v.localId) this.#observe(index, v.localId, v.flickrPhotoId);
    // not_found/not_accepted/receiving never grants a replay in this sidecar.
    return {admissionStatus: v.admissionStatus, replayAllowed: false};
  }
  async denyProbe(role, kind, id) {
    assert.equal(role, 'B', 'B_READ_ONLY'); this.#authority('B');
    assert(typeof id === 'string' && id.length > 0, 'ONLY_KNOWN_A_IDS');
    const s = this.#ledger.state;
    const routes = {photo: s.uploads.some(r => r.providerId === id) ? '/api/photo/' + id + '/sizes' : null,
      receipt: s.uploads.some(r => r.localId === id) ? '/api/uploads/status/' + id : null,
      album: this.#bound.albumsA.includes(id) ? '/api/album/' + id + '/photos' : null};
    assert(routes[kind], 'ONLY_KNOWN_A_IDS');
    const r = await this.#call('B', routes[kind]); assert.equal(r.status, 404, 'B_ISOLATION'); return true;
  }
  async mutate(role, kind, id, value) {
    const row = this.#own(this.#ledger.state.uploads.find(r => r.providerId === id), role);
    assert(typeof id === 'string' && /^[0-9]+$/.test(id), 'EXACT_RECORDED_ID');
    let route, method = 'POST', body;
    if (kind === 'tags') { assert(typeof value === 'string' && /^[a-z0-9 ]{1,100}$/.test(value)); route = '/api/photo/' + id + '/tags'; method = 'PUT'; body = {tags: value}; }
    else if (kind === 'date') { assert(/^2024-01-(0[1-9]|[12][0-9])$/.test(value)); route = '/api/photos/update-date'; body = {photoIds: [id], targetDate: value}; }
    else if (['add', 'remove'].includes(kind)) { assert(this.#bound.albumsA.includes(value), 'OWN_VIRTUAL_ALBUM'); route = '/api/album/' + value + '/' + kind + '_photos'; body = {photoIds: [id]}; }
    else fail('MUTATION_NOT_IMPLEMENTED_OR_FORBIDDEN');
    await this.verifyActor(role);
    const key = hash(JSON.stringify([kind, id, value]));
    this.#ledger.change(s => { assert(!s.operations.some(o => o.key === key), 'MUTATION_NO_REPLAY'); s.operations.push({key, kind, id, actor: row.actor, outcome: 'unknown'}); });
    const r = await this.#call(role, route, {method, body});
    assert.equal(r.status, 200, 'MUTATION_UNKNOWN_READBACK_ONLY');
    // Deliberately not called verified: separate readback is still required.
    return {acknowledged: true, verified: false};
  }
  terminalLocal() {
    // Local ledger tombstone only. No API/provider/account deletion implemented.
    this.#ledger.change(s => { s.terminal = true; s.terminalReason = 'LOCAL_GUARD_TEST_ENDED_NOT_LIVE_CLEANUP'; });
  }
}
function main(argv) {
  const mode = argv.length ? argv[0] : '--plan';
  assert(['--plan', '--validate', '--execute-live'].includes(mode), 'UNKNOWN_MODE');
  if (mode !== '--execute-live') { assert.equal(argv.length <= 1, true, 'UNEXPECTED_FLAGS'); return {...plan(), mode: mode.slice(2)}; }
  assert(argv.length === 3 && argv[1] === '--authorization-receipt', 'AUTHORIZATION_RECEIPT_REQUIRED');
  validateProposal();
  return liveGate(readAuthorizationReceipt(argv[2]));
}
module.exports = {ORIGIN, MANIFEST_SHA, ASSETS, SCOPE, BLOCKERS, hash, plan, validateProposal,
  validateAuthorization, liveGate, readAuthorizationReceipt, assertCredentialLocation, metadataDigest, Ledger, LoopbackTransport, LocalDriver, main};
if (require.main === module) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (e) {
    // Assertion diffs may include receipt values. Keep CLI errors to one line.
    console.error(JSON.stringify({status: 'FAIL_CLOSED', liveReady: false, remoteRequests: 0, error: e.message.split('\n')[0]}));
    process.exitCode = 1;
  }
}
