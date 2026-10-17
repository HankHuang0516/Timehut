/* Current first-party browser -> ordinary HTTP -> SQLite contracts.
 * Only this tool and 20261017-account-six-page-contract evidence are owned.
 * No live mode, scores, GUI control, private config, or existing database reads.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), http = require('node:http');
const {createRequire} = require('node:module');
const {spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const QA = '.codex-local/qa/20261017-account-six-page-contract';
const SDK = '/Users/hank/.cache/codex-runtimes/codex-primary-runtime/dependencies/node';
const BUILDS = '/Users/hank/.local/share/project-storage/internal/builds';
const STORAGE = '/Users/hank/.local/bin/project-storage';
const ORIGIN = 'https://just-healing-production.up.railway.app';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const currentVersion = () => /version:'([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'js/version.js'), 'utf8'))?.[1];
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n', {flag: 'wx'});
function selected() {
  const files = new Set(['tools/test_current_account_six_page.cjs', 'settings.html', 'timeline.html', 'album.html', 'search.html', 'account.html']);
  if (process.argv.includes('--viewer-ui-only') || process.argv.includes('--pick-drop-only')) files.add('.codex-local/qa/20261016-public-provider-e2e-proposal/media/public-r93-two-second.mp4');
  for (const dir of ['js', 'css', 'assets']) {
    const walk = d => { for (const ent of fs.readdirSync(d, {withFileTypes: true})) {
      const p = path.join(d, ent.name); if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name !== 'config.js' && (/\.(js|css)$/.test(ent.name) || dir === 'assets' && /^storybook-.*\.png$/.test(ent.name))) files.add(path.relative(ROOT, p));
    }}; walk(path.join(ROOT, dir));
  }
  const include = relative => {
    if (files.has(relative)) return; files.add(relative);
    const p = path.join(ROOT, relative);
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
      let dep = path.resolve(path.dirname(p), m[1]); if (!path.extname(dep)) dep += '.js'; include(path.relative(ROOT, dep));
    }
  };
  for (const name of ['account-routes', 'account-gateway', 'account-sqlite-store', 'account-upload-journal', 'account-album-membership', 'account-media', 'media-tickets', 'account-photo-mutations', 'account-photo-deletion', 'flickr-photo-mutations', 'flickr-erasure', 'video-media']) include('server/' + name + '.js');
  return [...files].sort();
}
function fingerprint(root, files) { return files.map(p => { const b = fs.readFileSync(path.join(root, p)); return {path: p, bytes: b.length, sha256: sha(b)}; }); }
function parent() {
  assert.equal(fs.realpathSync(ROOT), '/Volumes/AiHankAppsData/Timehut');
  const evidence = path.join(ROOT, QA); fs.mkdirSync(evidence, {recursive: true});
  const run = path.join(evidence, 'run-' + new Date().toISOString().replace(/[:.]/g, '-')); fs.mkdirSync(run);
  const admission = spawnSync(STORAGE, ['check', '--required-gib', '1'], {encoding: 'utf8'});
  fs.writeFileSync(path.join(run, 'storage.txt'), admission.stdout + admission.stderr); assert.equal(admission.status, 0);
  const files = selected(), before = fingerprint(ROOT, files);
  const version = currentVersion(); assert(/^2026\.10\.17-ui\.95\.[0-9]+$/.test(version), 'EXACT_CURRENT_VERSION');
  const workspace = fs.mkdtempSync(path.join(BUILDS, 'timehut-current-account-six-'));
  for (const p of files) { const dest = path.join(workspace, p); fs.mkdirSync(path.dirname(dest), {recursive: true}); fs.copyFileSync(path.join(ROOT, p), dest); }
  const core = '.codex-local/qa/20261017-core-account-contracts/summary.json';
  const review = '.codex-local/qa/20261017-six-page-continued/independent-coverage-review.md';
  write(path.join(run, 'source-before.json'), {source: ROOT, workspace, version, files: before,
    head: spawnSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).stdout.trim(),
    dirtySource: true, runtime: path.join(SDK, 'bin/node'), extraBudgetGiB: 1, systemReserveGiB: 20,
    copiedConfig: false, copiedDatabase: false, coreSummary: {path: core, sha256: sha(fs.readFileSync(path.join(ROOT, core)))},
    minimumTable: {path: review, sha256: sha(fs.readFileSync(path.join(ROOT, review)))}});
  const r = spawnSync(STORAGE, ['run', '--project', ROOT, '--required-gib', '1', '--', path.join(SDK, 'bin/node'),
    path.join(workspace, 'tools/test_current_account_six_page.cjs'), '--ssd-run', ...process.argv.slice(2)], {cwd: workspace, encoding: 'utf8', timeout: 160000});
  fs.writeFileSync(path.join(run, 'stdout.txt'), r.stdout || ''); fs.writeFileSync(path.join(run, 'stderr.txt'), r.stderr || '');
  for (const name of ['report.json', 'http-ledger.json', 'browser-ledger.json', 'synthetic-provider-ledger.json']) {
    const from = path.join(workspace, 'results', name); if (fs.existsSync(from)) fs.copyFileSync(from, path.join(run, name));
  }
  const after = fingerprint(ROOT, files), frozenAfter = fingerprint(workspace, files);
  write(path.join(run, 'source-after.json'), {source: after, snapshot: frozenAfter});
  const unchanged = JSON.stringify(before) === JSON.stringify(after) && JSON.stringify(before) === JSON.stringify(frozenAfter);
  write(path.join(run, 'execution.json'), {exitCode: r.status, error: r.error?.message, sourceUnchanged: unchanged, workspace,
    scope: process.argv.includes('--metadata-ui-only') ? 'Metadata UI integration only: ' + process.argv.slice(2).join(' ') : process.argv.includes('--empty-entry-only') ? 'ONE empty CTA delta only; prior matrix and core28 not rerun' : 'Current browser handlers + local HTTP/SQLite only; core28 not rerun', liveReady: false, remoteRequests: 0});
  console.log(JSON.stringify({evidence: run, exitCode: r.status, sourceUnchanged: unchanged, output: (r.stdout || '').slice(-2000)}));
  if (r.status !== 0 || !unchanged) process.exitCode = 1;
}
async function child() {
  assert(fs.realpathSync(ROOT).startsWith(BUILDS + '/'));
  const out = path.join(ROOT, 'results'); fs.mkdirSync(out, {mode: 0o700});
  const report = {status: 'FAIL', sourceVersion: currentVersion(), checks: [], failures: [], limitations: [],
    realProviderRequests: 0, remoteRequests: 0, guiCalls: 0, formalAcceptance: false, functionalScoreAuthored: false,
    wireUploadProgressClaimed: false, core28Rerun: false, independentReview: 'PENDING'};
  const ledger = [], browserLedger = [], providerLedger = [], errors = []; let activeCase = 'fixture', store, server, browser;
  const record = async (id, fn) => {
    activeCase = id; const row = {id, status: 'RUNNING', httpStart: ledger.length, browserStart: browserLedger.length}; report.checks.push(row);
    try { row.readback = await fn(); row.status = 'PASS'; }
    catch (e) { row.status = 'FAIL'; row.error = e.stack; report.failures.push({id, error: e.stack}); throw e; }
    finally { row.httpEnd = ledger.length; row.browserEnd = browserLedger.length; }
  };
  try {
    const deps = createRequire('/Users/hank/.local/share/project-storage/internal/builds/timehut-public-server-deps-nzhqt5a3/package.json');
    const express = deps('express');
    const {SQLiteAccountStore} = require('../server/account-sqlite-store');
    const {accountRouter} = require('../server/account-routes');
    const {accountGateway} = require('../server/account-gateway');
    const {AccountUploadJournal} = require('../server/account-upload-journal');
    const {accountAlbumMembership} = require('../server/account-album-membership');
    const {accountMedia} = require('../server/account-media');
    const {mediaTickets} = require('../server/media-tickets');
    const {AccountPhotoMutations} = require('../server/account-photo-mutations');
    const {AccountPhotoDeletion} = require('../server/account-photo-deletion');
    const {flickrPhotoMutations} = require('../server/flickr-photo-mutations');
    const {flickrErasure} = require('../server/flickr-erasure');
    const uploads = path.join(out, 'synthetic-uploads'); fs.mkdirSync(uploads, {mode: 0o700});
    store = new SQLiteAccountStore(path.join(out, 'synthetic-store'));
    const password = 'synthetic-current-browser-password';
    const owner = await store.register('fixture-current-owner', password, 'Synthetic owner');
    const A = await store.register('fixture-current-alpha', password, 'Synthetic A');
    const B = await store.register('fixture-current-bravo', password, 'Synthetic B');
    const source = store.album(A.id, 'Current Alpha', '2020-01-01'), target = store.album(A.id, 'Current Beta', '2021-01-01');
    const archived = store.album(A.id, 'Archived Synthetic', '2022-01-01'), foreign = store.album(B.id, 'Foreign synthetic', '2023-01-01');
    const journal = new AccountUploadJournal(store, uploads), bodies = new Map(), originalBodies = new Map(), syntheticRemote = new Map();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=', 'base64');
    function seed(user, album, id, date, media = 'photo', bytes = png, tags = 'current park') {
      const cid = 'synthetic_current_' + crypto.randomUUID().replaceAll('-', ''), content = sha(bytes), metadata = 'a'.repeat(64);
      const reservation = journal.reserve(user, album, cid, Math.max(256, bytes.length), content, metadata), filename = 'receiver-' + crypto.randomUUID() + '.part';
      journal.markScratch(user, cid, reservation.admission.leaseId, filename); fs.writeFileSync(path.join(uploads, filename), bytes, {mode: 0o600});
      const row = {localId: 'local_' + crypto.randomUUID(), clientUploadId: cid, contentSha256: content, metadataSha256: metadata,
        localFilename: filename, localPath: path.join(uploads, filename), originalFilename: 'synthetic-' + id + (media === 'video' && bytes !== png ? '.mp4' : '.png'), mimetype: media === 'video' && bytes !== png ? 'video/mp4' : 'image/png',
        size: bytes.length, albumId: null, ownerUserId: user, accountAlbumId: album, title: 'Synthetic ' + id, description: '', tags, date,
        status: 'pending', createdAt: new Date().toISOString(), flickrPhotoId: null, retryBlocked: false};
      journal.accept(user, cid, reservation.admission.leaseId, row);
      store.attachPhoto(user, row.localId, id, {bytes: bytes.length, title: row.title, tags: row.tags, date, media});
      journal.update(row.localId, {status: 'completed', flickrPhotoId: id}); bodies.set(id, png); originalBodies.set(id, bytes);
      syntheticRemote.set(id, {id, media, video: {ready: 1}, secret: 'synthetic-photo-secret', owner: {nsid: '123456789@N00'}, tags: {tag: row.tags.split(' ').map(raw => ({raw, _content: raw}))}, dates: {taken: date + ' 12:00:00', takengranularity: '0'}});
      return {...row, flickrPhotoId: id};
    }
    seed(A.id, source.id, '800000000101', '2024-01-02'); seed(A.id, source.id, '800000000102', '2024-01-02', 'video');
    seed(A.id, source.id, '800000000103', '2023-02-03'); seed(A.id, target.id, '800000000104', '2024-03-04');
    seed(A.id, archived.id, '800000000105', '2022-05-06'); seed(B.id, foreign.id, '800000000106', '2024-01-02');
    store.archiveAlbum(A.id, archived.id); const archivedMediaBefore = JSON.stringify(store.state.media['800000000105']);
    const foreignBefore = JSON.stringify({album: store.state.albums[foreign.id], media: store.state.media['800000000106']});
    const app = express(); app.use(express.json({limit: '16kb'}));
    let failDateCommit = false, failArchivedRead = false, failAlbumRead = false, holdAlbumRead = false, heldRelease, heldReached, failMembershipAction = null;
    const originalCommit = store.commit.bind(store); let inDates = false;
    store.commit = fn => { if (inDates && failDateCommit) { failDateCommit = false; throw new Error('Synthetic SQL commit unavailable'); } return originalCommit(fn); };
    const archivedList = store.listArchivedAlbums.bind(store);
    store.listArchivedAlbums = (...args) => { if (failArchivedRead) { failArchivedRead = false; throw new Error('Synthetic archive read unavailable'); } return archivedList(...args); };
    const membership = store.changePhotoMembership.bind(store);
    store.changePhotoMembership = (user, album, ids, action) => {
      if (failMembershipAction === action) { failMembershipAction = null; throw new Error('Synthetic membership commit unavailable'); }
      return membership(user, album, ids, action);
    };
    app.use((req, res, next) => {
      const row = {case: activeCase, method: req.method, route: req.path,
        query: Object.fromEntries(Object.entries(req.query).filter(([k]) => k !== 'ticket')),
        body: /session|login|register/.test(req.path) ? '[synthetic login redacted]' : req.body}; ledger.push(row);
      const json = res.json.bind(res); res.json = data => {
        row.response = /session|login|register/.test(req.path) ? '[synthetic login redacted]' : JSON.parse(JSON.stringify(data, (_k, value) => {
          if (typeof value !== 'string' || !value.startsWith(ORIGIN + '/')) return value;
          const u = new URL(value); if (u.searchParams.has('ticket')) u.searchParams.set('ticket', 'SYNTHETIC-CAPABILITY-REDACTED'); return u.href;
        })); return json(data);
      };
      res.on('finish', () => { row.status = res.statusCode; row.actor = res.get('X-Timehut-Account') || null;
        row.contentType = res.get('Content-Type') || null; row.contentDisposition = res.get('Content-Disposition') || null; });
      if (req.method === 'PUT' && req.path === '/api/accounts/albums/dates') { inDates = true; res.on('finish', () => { inDates = false; }); }
      if (/^\/api\/album\/[^/]+\/photos$/.test(req.path)) {
        if (holdAlbumRead) { holdAlbumRead = false; heldReached?.(); heldRelease = () => next(); return; }
        if (failAlbumRead) { failAlbumRead = false; row.injectedFault = 'synthetic HTTP503'; return res.status(503).json({error: 'Synthetic read failure'}); }
      }
      next();
    });
    const tickets = mediaTickets(store); let media;
    const accounts = accountRouter(express, store, {enabled: true, legacyOwnerId: owner.id, allowedOrigins: [ORIGIN], photoView: (row, req) => media.photoView(row, req)});
    let fakeImageReads = 0;
    media = accountMedia(store, tickets, {readQueue: () => journal.list(), uploadsDirectory: uploads,
      providerRequest: async (method, params) => { assert.equal(method, 'flickr.photos.getSizes'); assert(bodies.has(params.photo_id)); fakeImageReads++;
        return {sizes: {size: [{label: 'Original', source: 'https://live.staticflickr.com/synthetic/' + params.photo_id + '.png', media: 'photo'}]}}; },
      credentials: () => ({}), request: async value => { const id = /([0-9]+)\.png$/.exec(String(value))?.[1]; assert(bodies.has(id));
        if (providerControl.failedDownloads.has(id)) throw new Error('Synthetic media bytes unavailable');
        return new Response(bodies.get(id), {headers: {'Content-Type': 'image/png'}}); }});
    const gateway = accountGateway(store, accounts.authenticate, {legacyOwnerId: owner.id, readQueue: () => journal.list(), tickets,
      photoView: media.photoView, sizesView: media.sizesView, delivery: media.delivery});
    const providerControl = {failed: new Set(), failedDownloads: new Set(), failNextVideoInfo: false, holdNext: false, reached: null, release: null};
    const syntheticProvider = async (method, params, _syntheticCredentials, verb) => {
      const event = {case: activeCase, method, verb, params: {...params, ...(params.secret ? {secret: 'SYNTHETIC-REDACTED'} : {})}, synthetic: true}; providerLedger.push(event);
      if (method === 'flickr.test.login') { event.outcome = 'synthetic-identity'; return {stat: 'ok', user: {id: '123456789@N00'}}; }
      const id = params.photo_id, row = syntheticRemote.get(id);
      if (!row) { event.outcome = 'synthetic-not-found'; throw Object.assign(new Error('Synthetic not found'), {code: 1}); }
      if (method === 'flickr.photos.getInfo') {
        if (row.media === 'video' && providerControl.failNextVideoInfo) { providerControl.failNextVideoInfo = false; event.outcome = 'synthetic-video-info-error'; throw new Error('Synthetic video information unavailable'); }
        event.outcome = 'synthetic-signed-readback'; return {stat: 'ok', photo: structuredClone(row)};
      }
      if (method === 'flickr.video.getStreamInfo') { event.outcome = 'synthetic-stream-manifest'; return {streams: {stream: [
        {type: 'orig', _content: 'https://live.staticflickr.com/synthetic/' + id + '.mp4'},
        {type: '720p', _content: 'https://live.staticflickr.com/synthetic/' + id + '.mp4'}]}}; }
      assert(['flickr.photos.setTags', 'flickr.photos.setDates', 'flickr.photos.delete'].includes(method), 'NO_PROVIDER_CREATION_OR_OTHER_METHOD');
      if (providerControl.holdNext) {
        providerControl.holdNext = false;
        await new Promise(resolve => { providerControl.release = resolve; providerControl.reached?.(); });
      }
      if (providerControl.failed.has(id)) { event.outcome = 'authoritative-not-applied-code2'; throw Object.assign(new Error('Synthetic authoritative no-change'), {code: 2}); }
      if (method === 'flickr.photos.setTags') row.tags.tag = (params.tags.match(/"[^"]*"|\S+/g) || []).map(t => t.replace(/^"|"$/g, '')).map(raw => ({raw, _content: raw.replace(/\s/g, '').toLowerCase()}));
      else if (method === 'flickr.photos.setDates') { row.dates.taken = params.date_taken; row.dates.takengranularity = params.date_taken_granularity; }
      else syntheticRemote.delete(id);
      event.outcome = 'synthetic-applied'; return {stat: 'ok'};
    };
    const edits = new AccountPhotoMutations(store, flickrPhotoMutations(syntheticProvider, () => ({syntheticOnly: true}), '123456789@N00'));
    const deletion = new AccountPhotoDeletion(store, journal, {uploadsDirectory: uploads, readQueue: () => journal.list(),
      deletePhoto: flickrErasure(syntheticProvider, () => ({syntheticOnly: true}), '123456789@N00').deletePhoto});
    app.use('/api/accounts', accounts.router); app.use(['/api', '/uploads'], gateway.guard);
    app.post('/api/album/:albumId/:operation', accountAlbumMembership(store));
    app.put('/api/photo/:photoId/tags', edits.handler()); app.post(['/api/photos/tags/add', '/api/photos/update-date'], edits.handler());
    app.delete('/api/photo/:photoId', deletion.handler()); app.post('/api/photos/delete', deletion.handler());
    const {createVideoHandler} = require('../server/video-media');
    app.get('/api/photo/:id/video', createVideoHandler(() => ({token: 'synthetic-memory-only'}), syntheticProvider, async (value, options) => {
      const id = /([0-9]+)\.mp4$/.exec(String(value))?.[1], body = originalBodies.get(id); assert(body, 'EXACT_SYNTHETIC_MP4');
      if (providerControl.failedDownloads.has(id)) throw new Error('Synthetic MP4 bytes unavailable');
      const range = options.headers?.Range, match = range && /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = match ? Number(match[1]) : 0, end = match && match[2] ? Math.min(Number(match[2]), body.length - 1) : body.length - 1;
      assert(start >= 0 && end >= start && end < body.length, 'SYNTHETIC_RANGE'); const bytes = body.subarray(start, end + 1);
      return new Response(bytes, {status: match ? 206 : 200, headers: {'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length),
        'Accept-Ranges': 'bytes', ...(match ? {'Content-Range': `bytes ${start}-${end}/${body.length}`} : {})}});
    }));
    app.get('/health', (_req, res) => res.json({version: 'LOCAL-CONTRACT-FIXTURE-NOT-PRODUCTION'}));
    app.use('/app', express.static(ROOT, {dotfiles: 'deny', index: false}));
    app.use((_req, res) => res.status(404).json({error: 'No fixture fallback'}));
    server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const local = 'http://127.0.0.1:' + server.address().port;
    const {chromium} = require(path.join(SDK, 'node_modules/playwright'));
    browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
    async function newContext(state) {
      const tzIndex = process.argv.indexOf('--timezone'), timezoneId = tzIndex < 0 ? 'Asia/Taipei' : process.argv[tzIndex + 1];
      assert(['UTC', 'Asia/Taipei', 'America/Los_Angeles'].includes(timezoneId));
      const context = await browser.newContext({viewport: {width: 390, height: 844}, timezoneId, serviceWorkers: 'block', ...(state ? {storageState: state} : {})});
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
        if (url.origin !== ORIGIN) { browserLedger.push({case: activeCase, blockedOrigin: url.origin, navigation: req.isNavigationRequest(), resourceType: req.resourceType()}); return route.abort(); }
        const headers = {...req.headers()}; delete headers.host;
        const row = {case: activeCase, method: req.method(), path: url.pathname, query: [...url.searchParams.keys()].filter(k => k !== 'ticket')}; browserLedger.push(row);
        try {
          const r = await fetch(local + url.pathname + url.search, {method: req.method(), headers, body: req.postDataBuffer() || undefined, redirect: 'manual', signal: AbortSignal.timeout(8000)});
          const h = Object.fromEntries(r.headers); const cookies = r.headers.getSetCookie(); if (cookies.length) h['set-cookie'] = cookies.join('\n');
          const body = Buffer.from(await r.arrayBuffer()); row.status = r.status; row.responseBytes = body.length;
          await route.fulfill({status: r.status, headers: h, body});
        } catch (e) { row.fixtureError = e.message; await route.abort().catch(() => {}); }
      });
      return context;
    }
    let context = await newContext(), page = await context.newPage();
    function observe(p) {
      p.setDefaultTimeout(6500);
      p.on('framenavigated', frame => { if (frame === p.mainFrame()) browserLedger.push({case: activeCase,
        event: 'main-frame-navigation-committed', url: frame.url(), observedAt: new Date().toISOString(), observedEpochMs: Date.now()}); });
      p.on('pageerror', e => {
        const row = {case: activeCase, error: e.message, stack: e.stack || null, url: p.url(),
          observedAt: new Date().toISOString(), observedEpochMs: Date.now(), source: 'Actual Playwright pageerror event; stack preserved without filtering'};
        errors.push(row); browserLedger.push({...row, event: 'pageerror'});
      });
      p.on('dialog', async d => { browserLedger.push({case: activeCase, dialog: d.type(), message: d.message()}); await d.dismiss(); });
    }
    observe(page);
    await page.goto(ORIGIN + '/app/account.html'); await page.evaluate(async password => { await TimehutAccounts.ready; await TimehutAccounts.signIn({username: 'fixture-current-alpha', password}); }, password);
    const goto = async name => { await page.goto(ORIGIN + '/app/' + name); assert(await page.evaluate(() => TimehutPage.ready)); };
    const births = () => page.locator('.birthdate-input').evaluateAll(nodes => nodes.map(n => n.value));
    const httpRows = (from, method, route) => ledger.slice(from).filter(r => r.method === method && r.route === route);
    if (process.argv.includes('--metadata-ui-only')) {
      const ci = process.argv.indexOf('--ui-cases');
      const names = ci < 0 ? ['photo-tags', 'moment-tags', 'photo-date', 'moment-date', 'photo-delete', 'moment-delete'] : process.argv[ci + 1].split(',');
      assert(names.length > 0 && names.every(n => /^(photo|moment)-(tags|date|delete)$/.test(n)), 'BOUNDED_UI_CASES');
      let seq = 0; const destinationObservations = [];
      const selection = mode => page.evaluate(mode => ({
        ids: (mode === 'photo' ? [...SelectionState.selectedPhotos] : getSelectedMomentPhotoIds()).map(String).sort(),
        count: Number(document.querySelector(mode === 'photo' ? '#selectedCount' : '#selectedMomentCount').textContent),
        active: mode === 'photo' ? SelectionState.isSelectMode : MomentSelectionState.isSelectMode,
        visibleIDs: TimelineState.photos.map(p => p.id).sort()
      }), mode);
      async function fresh(mode, action) {
        const album = store.album(A.id, 'UI ' + mode + ' ' + action, '2020-01-01');
        const start = 810000000100 + (++seq) * 10;
        const ids = [String(start + 1), String(start + 2)], other = String(start + 3);
        const originals = [seed(A.id, album.id, ids[0], '2024-01-02'), seed(A.id, album.id, ids[1], '2024-01-02')];
        seed(A.id, album.id, other, '2023-02-03');
        await goto('timeline.html'); await page.locator('#hamburgerBtn').click();
        await page.locator('.sidebar-album-card').filter({hasText: album.title}).click();
        await page.waitForFunction(ids => !TimelineState.isLoading && ids.every(id => TimelineState.photos.some(p => p.id === id)), ids);
        if (mode === 'photo') {
          await page.locator('#selectModeBtn').click();
          for (const id of ids) await page.locator('.moment-photo-container[data-photo-id="' + id + '"] .timeline-photo-select').click();
        } else {
          await page.locator('#batchMomentBtn').click();
          await page.locator('.moment-item').filter({has: page.locator('.moment-album-link')}).first().locator('.moment-header').click();
        }
        assert.deepEqual((await selection(mode)).ids, ids);
        return {album, ids, other, originals};
      }
      async function submit(mode, action, value, cancel = false) {
        if (action === 'tags') {
          await page.locator(mode === 'photo' ? '#batchTagBtn' : '#momentBatchTagBtn').click();
          if (cancel) { await page.locator('.timehut-dialog').getByRole('button', {name: '取消', exact: true}).click(); return; }
          await page.locator('.timehut-dialog input[name="tags"]').fill(value);
          await page.locator('.timehut-dialog button[type="submit"]').click();
        } else if (action === 'date') {
          if (!(await page.locator('#moveCollectionModal').isVisible())) {
            await page.locator(mode === 'photo' ? '#batchMoveCollectionBtn' : '#momentMoveCollectionBtn').click();
          }
          if (cancel) { await page.locator('#moveCollectionModal').getByRole('button', {name: '取消', exact: true}).click(); return; }
          const dates = page.locator('.collection-item[data-date="2023-02-03"]');
          destinationObservations.push({case: activeCase, date: '2023-02-03', matchingRows: await dates.count(), selectedRow: 0});
          // Date mutation targets a calendar day, not a destination photo ID.
          // Retain duplicate visible day rows as an observation, never infer uniqueness.
          await dates.first().click();
          await page.locator('#moveCollectionConfirmBtn').click(); await page.locator('.timehut-dialog button[type="submit"]').click();
        } else {
          await page.locator(mode === 'photo' ? '#deleteSelectedBtn' : '#momentDeleteBtn').click();
          if (mode === 'photo') await page.locator(cancel ? '#confirmCancelBtn' : '#confirmOkBtn').click();
          else if (cancel) await page.locator('.timehut-dialog').getByRole('button', {name: '取消', exact: true}).click();
          else await page.locator('.timehut-dialog button[type="submit"]').click();
        }
      }
      const ownRead = album => page.evaluate(album => TimehutAccounts.request('/api/album/' + album + '/photos').then(r => r.photoset.photo), album);
      for (const name of names) await record('UI-HTTP-SQL-' + name + '-cancel-total-partial-retry', async () => {
        const [mode, action] = name.split('-'), f = await fresh(mode, action);
        const route = action === 'tags' ? '/api/photos/tags/add' : action === 'date' ? '/api/photos/update-date' : '/api/photos/delete';
        const value = 'ui_' + mode + '_tags'; const requestStart = ledger.length;
        const untouchedReceipt = JSON.stringify(f.originals.map(r => store.state.receipts[r.localId]));
        await submit(mode, action, value, true); assert.equal(httpRows(requestStart, 'POST', route).length, 0);
        assert.deepEqual((await selection(mode)).ids, f.ids);
        const outcomes = [];
        for (const stage of ['total-failure', 'partial', 'retry-success']) {
          providerControl.failed = new Set(stage === 'total-failure' ? f.ids : stage === 'partial' ? [f.ids[1]] : []);
          const before = ledger.length, actualExpected = stage === 'retry-success' ? [f.ids[1]] : f.ids;
          let processing = null;
          if (stage === 'total-failure') {
            providerControl.holdNext = true;
            const reached = new Promise(resolve => { providerControl.reached = resolve; });
            await submit(mode, action, value); await reached;
            try {
              processing = await page.evaluate(({mode, action}) => {
                const selector = action === 'date' ? '#moveCollectionConfirmBtn' : action === 'tags' ? (mode === 'photo' ? '#batchTagBtn' : '#momentBatchTagBtn') : (mode === 'photo' ? '#deleteSelectedBtn' : '#momentDeleteBtn');
                const button = document.querySelector(selector);
                return {buttonText: button.textContent, buttonDisabled: button.disabled, backgroundBusy: typeof BackgroundWorker !== 'undefined' && BackgroundWorker.isBusy, wireProgressClaimed: false};
              }, {mode, action});
              assert(action === 'delete' ? processing.backgroundBusy : processing.buttonDisabled);
            } finally { providerControl.release(); }
          } else await submit(mode, action, value);
          const want = stage === 'total-failure' ? f.ids : stage === 'partial' ? [f.ids[1]] : [];
          await page.waitForFunction(({mode, want, action}) => {
            const ids = (mode === 'photo' ? [...SelectionState.selectedPhotos] : getSelectedMomentPhotoIds()).map(String).sort();
            const idle = action !== 'delete' || !BackgroundWorker.isBusy;
            return idle && JSON.stringify(ids) === JSON.stringify(want);
          }, {mode, want, action});
          const requests = httpRows(before, 'POST', route);
          assert.equal(requests.length, 1); const req = requests[0]; assert.equal(req.status, 200);
          assert.deepEqual(req.body.photoIds, actualExpected);
          const succeeded = req.response.results.filter(r => r.success).map(r => r.photoId), failed = req.response.results.filter(r => !r.success).map(r => r.photoId);
          assert.deepEqual(succeeded, stage === 'total-failure' ? [] : stage === 'partial' ? [f.ids[0]] : [f.ids[1]]);
          assert.deepEqual(failed, want);
          const ui = await selection(mode);
          assert.equal(ui.count, want.length ? mode === 'photo' ? want.length : 1 : 0);
          const sql = f.ids.map(id => ({id, tags: store.state.media[id].tags, date: store.state.media[id].date,
            bytes: store.state.media[id].bytes, deleted: store.state.media[id].deletedAt !== undefined,
            deletePending: store.state.photoDeletes?.[id]?.status === 'pending', providerStillExists: syntheticRemote.has(id)}));
          for (let i = 0; i < f.ids.length; i++) {
            const applied = stage === 'retry-success' || stage === 'partial' && i === 0;
            if (action === 'tags') assert.equal(sql[i].tags.includes(value), applied);
            else if (action === 'date') assert.equal(sql[i].date, applied ? '2023-02-03' : '2024-01-02');
            else { assert.equal(sql[i].deleted, applied); assert.equal(sql[i].providerStillExists, !applied); assert.equal(fs.existsSync(f.originals[i].localPath), !applied); }
          }
          const ordinaryReadback = (await ownRead(f.album.id)).map(p => ({id: p.id, tags: p.tags, date: p.datetaken}));
          outcomes.push({stage, requested: req.body.photoIds, succeeded, failed, ui, sql, ordinaryReadback, processing,
            response: req.response, providerProtocol: 'injected synthetic identity/getInfo/setTags/setDates/delete only; zero network'});
        }
        if (action !== 'delete') {
          assert.equal(JSON.stringify(f.originals.map(r => store.state.receipts[r.localId])), untouchedReceipt);
          for (const row of f.originals) assert.equal(sha(fs.readFileSync(row.localPath)), row.contentSha256);
        } else for (const id of f.ids) assert.equal(store.state.photoDeletes[id].status, 'complete');
        await page.reload(); await page.waitForFunction(() => !TimelineState.isLoading);
        const reloaded = await ownRead(f.album.id);
        assert.deepEqual(reloaded.map(p => p.id).sort(), action === 'delete' ? [f.other] : [...f.ids, f.other]);
        assert.equal((await selection(mode)).active, false);
        return {mode, action, album: f.album.id, selected: f.ids, cancelledRequests: 0, outcomes,
          reloadedIDs: reloaded.map(p => p.id), noSuccessfulIDReplayed: true, wireProgressClaimed: false,
          deleteFailureBoundary: action === 'delete' ? 'Authoritative synthetic delete rejection leaves durable pending job/original. Ordinary photo list closes pending access; list absence is NOT deletion proof. SQL tombstones and exact-file removal prove final local completion.' : undefined};
      });
      report.scope = 'Current timeline UI→unmodified ordinary HTTP/SQLite mutation/deletion integration, synthetic provider protocol only';
      report.phaseCases = names; report.destinationObservations = destinationObservations; report.runtimeErrors = errors; assert.deepEqual(errors, []);
      report.limitations = ['No core28 rerun, score, wire-progress, real provider, native or physical claim.', 'All mutation authority/readback provider replies are explicitly synthetic; only current App/SQL and UI integration is proved.'];
      report.status = 'PASS_CURRENT_METADATA_UI_HTTP_SQLITE_SYNTHETIC_PROVIDER'; return;
    }
    if (process.argv.includes('--pick-drop-only')) {
      await record('06-1-current-file-input-browser-keyboard-and-simulated-DOM-drop-no-upload', async () => {
        const mp4 = fs.readFileSync(path.join(ROOT, '.codex-local/qa/20261016-public-provider-e2e-proposal/media/public-r93-two-second.mp4'));
        assert.equal(sha(mp4), 'f615183359be88970ec4f7fd4a4cb015ee8c1a6d5cb06a9d13cdd0923a660542');
        await goto('timeline.html'); await page.locator('#uploadBtn').click(); await page.locator('#uploadModal').waitFor();
        const start = ledger.length, providerStart = providerLedger.length;
        const chooserEvent = page.waitForEvent('filechooser'); await page.locator('#uploadDropzone').press('Enter');
        const chooser = await chooserEvent;
        await chooser.setFiles([{name: 'pick-photo.png', mimeType: 'image/png', buffer: png}, {name: 'pick-video.mp4', mimeType: 'video/mp4', buffer: mp4}]);
        await page.waitForFunction(() => document.querySelectorAll('.queue-item').length === 2);
        const inspect = () => page.evaluate(() => ({files: UploadUI.fileList.map(f => ({name: f.name, type: f.type, bytes: f.size})),
          rows: document.querySelectorAll('.queue-item').length, destination: document.querySelector('#albumSelect').value}));
        const picked = await inspect(); assert.deepEqual(picked.files, [{name: 'pick-photo.png', type: 'image/png', bytes: png.length}, {name: 'pick-video.mp4', type: 'video/mp4', bytes: mp4.length}]);
        assert.equal(picked.destination, source.id);
        await page.locator('.queue-item').filter({hasText: 'pick-photo.png'}).locator('.queue-remove').click();
        await page.waitForFunction(() => document.querySelectorAll('.queue-item').length === 1);
        const afterPhotoRemove = await inspect(); assert.deepEqual(afterPhotoRemove.files.map(f => f.name), ['pick-video.mp4']);
        await page.locator('.queue-remove').click(); await page.waitForFunction(() => UploadUI.fileList.length === 0);
        const drop = await page.evaluate(({png, mp4}) => {
          const transfer = new DataTransfer();
          transfer.items.add(new File([new Uint8Array(png)], 'drop-photo.png', {type: 'image/png'}));
          transfer.items.add(new File([new Uint8Array(mp4)], 'drop-video.mp4', {type: 'video/mp4'}));
          const target = document.querySelector('#uploadDropzone');
          const over = new DragEvent('dragover', {bubbles: true, cancelable: true, dataTransfer: transfer}); target.dispatchEvent(over);
          const event = new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: transfer}); target.dispatchEvent(event);
          return {filesInDataTransfer: transfer.files.length, eventIsTrusted: event.isTrusted, defaultPrevented: event.defaultPrevented,
            description: 'Simulated browser DOM DataTransfer/DragEvent delivered to existing drop listener; not true OS drag or trusted-event evidence'};
        }, {png: [...png], mp4: [...mp4]});
        assert.equal(drop.eventIsTrusted, false); assert.equal(drop.defaultPrevented, true);
        await page.waitForFunction(() => document.querySelectorAll('.queue-item').length === 2);
        const dropped = await inspect(); assert.deepEqual(dropped.files, [{name: 'drop-photo.png', type: 'image/png', bytes: png.length}, {name: 'drop-video.mp4', type: 'video/mp4', bytes: mp4.length}]);
        assert.equal(dropped.destination, source.id);
        await page.locator('.queue-item').filter({hasText: 'drop-video.mp4'}).locator('.queue-remove').click();
        await page.waitForFunction(() => document.querySelectorAll('.queue-item').length === 1);
        const afterVideoRemove = await inspect(); assert.deepEqual(afterVideoRemove.files.map(f => f.name), ['drop-photo.png']);
        await page.locator('.queue-remove').click(); await page.waitForFunction(() => UploadUI.fileList.length === 0);
        const final = await inspect(); assert.equal(final.rows, 0);
        const mutations = ledger.slice(start).filter(r => r.method !== 'GET'); assert.deepEqual(mutations, []); assert.equal(providerLedger.length, providerStart);
        return {picked, keyboard: 'Actual browser Enter on product dropzone opened actual input filechooser; files supplied headlessly',
          afterPhotoRemove, drop, dropped, afterVideoRemove, final, uploadPOSTs: 0, HTTPMutations: 0, providerRequests: 0,
          nativeOSPicker: 'NOTVERIFIED', realOSDrag: 'NOTVERIFIED', trustedDropClaim: false, directProductHandlerCalls: 0, productSelectionStateInjected: false};
      });
      report.scope = 'ONE current06/1 file-input/DOM-drop/removal contract, actual ordinary account bootstrap, zero upload dispatch';
      report.runtimeErrors = errors; assert.deepEqual(errors, []); report.limitations = ['Simulated browser DataTransfer/drop event only; native OS picker/drag NOTVERIFIED.', 'No upload/progress/provider completion or isTrusted claim.'];
      report.status = 'PASS_CURRENT_BROWSER_PICK_DROP_QUEUE_NO_UPLOAD'; return;
    }
    if (process.argv.includes('--viewer-ui-only')) {
      const ci = process.argv.indexOf('--ui-cases'), names = ci < 0 ? ['album-tags', 'viewer-tags', 'viewer-keys-downloads'] : process.argv[ci + 1].split(',');
      assert(names.every(n => ['album-iso-date-remaining', 'album-tags', 'album-add', 'album-date', 'album-delete', 'album-zip', 'timeline-zip', 'viewer-tags', 'viewer-keys-downloads', 'viewer-video-play', 'location-date-empty', 'location-date-remaining', 'location-delete-empty', 'location-delete-remaining', 'crossbook-date-95.6', 'album-video-95.6', 'app-login-uploader-95.6', 'app-login-uploader-95.7'].includes(n)), 'BOUNDED_VIEWER_CASES');
      let seq = 0;
      async function freshViewer(name, video = false) {
        const album = store.album(A.id, 'UI ' + name, '2020-01-01'), n = 820000000100 + (++seq) * 10;
        const ids = [String(n + 1), String(n + 2), String(n + 3)];
        let mp4 = null;
        if (video) {
          mp4 = fs.readFileSync(path.join(ROOT, '.codex-local/qa/20261016-public-provider-e2e-proposal/media/public-r93-two-second.mp4'));
          assert.equal(mp4.length, 24731); assert.equal(sha(mp4), 'f615183359be88970ec4f7fd4a4cb015ee8c1a6d5cb06a9d13cdd0923a660542');
        }
        const iso = name === 'album-iso-date-remaining';
        const originals = [seed(A.id, album.id, ids[0], iso ? '2024-01-02T12:01:00Z' : '2024-01-02', 'photo', png, 'uploader:人工 current park'),
          seed(A.id, album.id, ids[1], iso ? '2024-01-02T12:02:00Z' : '2024-01-02', video ? 'video' : 'photo', mp4 || png), seed(A.id, album.id, ids[2], '2023-02-03')];
        if (name.startsWith('location-') && name.endsWith('-remaining') || iso) {
          ids.push(String(n + 4)); originals.push(seed(A.id, album.id, ids[3], iso ? '2024-01-02T12:03:00Z' : '2024-01-02'));
        }
        await goto('timeline.html'); await page.locator('#hamburgerBtn').click(); await page.locator('.sidebar-album-card').filter({hasText: album.title}).click();
        await page.waitForFunction(ids => !TimelineState.isLoading && ids.every(id => TimelineState.photos.some(p => p.id === id)), ids);
        return {album, ids, originals, mp4};
      }
      const read = album => page.evaluate(album => TimehutAccounts.request('/api/album/' + album + '/photos').then(r => r.photoset.photo), album);
      for (const name of names) await record('UI-HTTP-SQL-' + name, async () => {
        if (name === 'app-login-uploader-95.6' || name === 'app-login-uploader-95.7') {
          assert.equal(currentVersion(), '2026.10.17-ui.' + name.slice('app-login-uploader-'.length));
          const freshContext = await newContext(), p = await freshContext.newPage(); observe(p); const start = ledger.length;
          try {
            await p.goto(ORIGIN + '/app/timeline.html'); await p.waitForURL('**/account.html?next=*'); await p.locator('#account-form').waitFor();
            await p.evaluate(() => TimehutAccounts.ready);
            const loggedOut = await p.evaluate(async () => ({authenticated: TimehutAccounts.status().authenticated,
              authStatus: await fetch('/api/auth/status', {credentials: 'same-origin'}).then(r => r.status), next: new URL(location.href).searchParams.get('next')}));
            assert.equal(loggedOut.authenticated, false); assert.equal(loggedOut.authStatus, 401); assert.equal(loggedOut.next, 'timeline.html');
            await p.locator('#account-form input[name="username"]').fill('fixture-current-alpha');
            await p.locator('#account-form input[name="password"]').fill(password); await p.locator('#account-submit').click();
            await p.waitForURL('**/timeline.html'); assert(await p.evaluate(() => TimehutPage.ready)); await p.waitForFunction(() => !TimelineState.isLoading);
            const login = httpRows(start, 'POST', '/api/accounts/session'); assert.equal(login.length, 1); assert.equal(login[0].status, 200); assert.equal(login[0].actor, A.id);
            await p.locator('#hamburgerBtn').click(); await p.locator('.sidebar-album-card').filter({hasText: target.title}).click();
            await p.waitForFunction(id => !TimelineState.isLoading && CONFIG.CHILDREN[TimelineState.currentChildIndex].albumId === id, target.id);
            const preparationStart = ledger.length; await p.locator('#uploadBtn').click(); await p.locator('#uploadModal.active').waitFor();
            await p.waitForFunction(() => document.querySelector('#albumLoadStatus').hidden && document.querySelector('#albumSelect').options.length > 0);
            const ui = await p.evaluate(() => ({actor: TimehutAccounts.status().user.id, displayName: TimehutAccounts.status().user.displayName,
              authenticated: TimehutAccounts.status().authenticated, ACCOUNT_MODE: CONFIG.ACCOUNT_MODE,
              destination: document.querySelector('#albumSelect').value, fixedUploaderValue: document.querySelector('#uploaderValue').value,
              fixedUploaderLabel: document.querySelector('#uploaderDisplay .uploader-name').textContent,
              queueCount: UploadUI.fileList.length, authButtonVisible: !!document.querySelector('#authFlickrBtn') && getComputedStyle(document.querySelector('#authFlickrBtn')).display !== 'none',
              selectedBook: CONFIG.CHILDREN[TimelineState.currentChildIndex].albumId}));
            assert.equal(ui.actor, A.id); assert.equal(ui.displayName, A.displayName); assert.equal(ui.fixedUploaderValue, A.displayName);
            assert.equal(ui.fixedUploaderLabel, A.displayName); assert.equal(ui.destination, target.id); assert.equal(ui.selectedBook, target.id);
            assert.equal(ui.authenticated, true); assert.equal(ui.ACCOUNT_MODE, true); assert.equal(ui.authButtonVisible, false); assert.equal(ui.queueCount, 0);
            const status = httpRows(preparationStart, 'GET', '/api/auth/status'); assert.equal(status.length, 1); assert.equal(status[0].status, 200);
            assert.equal(status[0].actor, A.id); assert.deepEqual(status[0].response, {authenticated: true, appAccount: true});
            const boundary = await p.evaluate(async () => ({adminAuthStart: await fetch('/api/auth/start', {credentials: 'same-origin'}).then(r => r.status),
              me: await TimehutAccounts.request('/api/accounts/me')}));
            assert.equal(boundary.adminAuthStart, 404); assert.equal(boundary.me.user.id, A.id); assert.equal(boundary.me.legacyOwner, false);
            const mutations = ledger.slice(start).filter(r => r.method !== 'GET');
            const unauthenticatedRefreshes = mutations.filter(r => r !== login[0]);
            assert(unauthenticatedRefreshes.every(r => r.route === '/api/accounts/session/refresh' && r.status === 401 && r.actor === null && ledger.indexOf(r) < ledger.indexOf(login[0])));
            assert.equal(freshContext.pages().length, 1); assert(!browserLedger.some(r => r.case === activeCase && r.blockedOrigin && r.navigation));
            return {entryPoint: '06/2 ordinary App login and uploader auth, actual form click', loggedOut, loginHTTP: {status: login[0].status, actor: login[0].actor},
              ui, authStatusHTTP: status[0], adminAuthStart: 404, legacyOwner: false, user: {id: A.id, displayName: A.displayName},
              unauthenticatedRefreshes: unauthenticatedRefreshes.map(r => ({route: r.route, status: r.status, actor: r.actor})),
              uploadPOSTs: 0, centralOAuthConsentClaimed: false, popupOpened: false, realProviderRequests: 0,
              destinationJourney: 'Login return goes to actual timeline; actual sidebar chooses own Beta book; actual upload button prefills exact selected destination. No claim about a non-first timeline query preselection.'};
          } finally { await freshContext.close(); }
        }
        const f = await freshViewer(name, ['viewer-keys-downloads', 'viewer-video-play', 'album-zip', 'timeline-zip', 'album-video-95.6'].includes(name));
        const receiptBefore = JSON.stringify(f.originals.map(r => store.state.receipts[r.localId]));
        if (name.startsWith('location-') || name === 'crossbook-date-95.6' || name === 'album-iso-date-remaining') {
          const iso = name === 'album-iso-date-remaining';
          if (!iso) assert.equal(currentVersion(), name === 'crossbook-date-95.6' ? '2026.10.17-ui.95.6' : '2026.10.17-ui.95.5');
          const action = iso || name === 'crossbook-date-95.6' ? 'date' : name.split('-')[1], remaining = name.endsWith('-remaining'), ids = f.ids.slice(0, 2);
          const unselected = remaining ? [f.ids[3]] : [], route = '/api/photos/' + (action === 'date' ? 'update-date' : 'delete');
          const untouched = JSON.stringify(store.state.media[f.ids[2]]), unselectedBefore = remaining ? JSON.stringify(store.state.media[f.ids[3]]) : null;
          await page.locator('.moment-item').filter({has: page.locator('.moment-album-link')}).first().locator('.moment-album-link').click();
          await page.waitForURL('**/album.html?*'); await page.locator('.album-photo-card').nth(1).waitFor();
          const originalURL = page.url();
          // Establish a different stored book through its actual sidebar, then follow the source deep link.
          let differentChoice = null, savedAtDeepLink = null;
          if (name === 'location-delete-empty' || name === 'crossbook-date-95.6') {
            await page.locator('a.header-btn[href="timeline.html"]').click(); await page.locator('#hamburgerBtn').click();
            await page.locator('.sidebar-album-card').filter({hasText: target.title}).click();
            await page.waitForFunction(album => !TimelineState.isLoading && CONFIG.CHILDREN[TimelineState.currentChildIndex].albumId === album, target.id);
            differentChoice = await page.evaluate(() => ({album: CONFIG.CHILDREN[TimelineState.currentChildIndex].albumId,
              stored: localStorage.getItem('timehut:album-choice:' + TimehutPage.owner())}));
            assert.equal(differentChoice.album, target.id); assert.equal(differentChoice.stored, target.id);
            await page.goto(originalURL); await page.evaluate(() => TimehutPage.ready); await page.locator('.album-photo-card').nth(1).waitFor();
            savedAtDeepLink = await page.evaluate(() => localStorage.getItem('timehut:album-choice:' + TimehutPage.owner()));
            assert.equal(savedAtDeepLink, target.id);
          }
          async function sourceState(p = page) {
            return p.evaluate(() => ({url: location.href, info: document.querySelector('#momentInfo')?.textContent,
              cards: [...document.querySelectorAll('.album-photo-card')].map(n => n.dataset.id),
              stateIDs: typeof AlbumState === 'undefined' ? null : AlbumState.photos.map(p => String(p.id)),
              selected: typeof AlbumState === 'undefined' ? null : [...AlbumState.selectedPhotos].map(String),
              count: document.querySelector('#selectedCount')?.textContent,
              busy: typeof BackgroundWorker !== 'undefined' && BackgroundWorker.isBusy,
              uploading: typeof BackgroundUploader !== 'undefined' && BackgroundUploader.isUploading}));
          }
          function checkSource(s, wanted, selected) {
            const u = new URL(s.url), q = u.searchParams;
            assert.equal(u.pathname, '/app/album.html'); assert.equal(q.get('album'), f.album.id); assert.equal(q.get('date'), '2024-01-02');
            assert.deepEqual(q.get('photos').split(',').filter(Boolean), wanted); assert.equal(q.get('id'), 'moment_' + wanted[0]);
            assert.deepEqual(s.cards, wanted); assert.deepEqual(s.stateIDs, wanted); assert.deepEqual(s.selected, selected);
            assert.equal(s.count, String(selected.length)); assert(!/失敗|尚未讀取|無效/.test(s.info));
          }
          await page.locator('#headerSelectBtn').click();
          for (const id of ids) await page.locator('.album-photo-card[data-id="' + id + '"] .select-checkbox').click();
          const chooserObservations = [];
          async function act(cancel = false) {
            if (action === 'date') {
              const chooserStart = ledger.length;
              if (!(await page.locator('#moveCollectionModal').isVisible())) await page.locator('#batchMoveCollectionBtn').click();
              if (cancel) return page.locator('#moveCollectionModal').getByRole('button', {name: '取消', exact: true}).click();
              await page.locator('.collection-item[data-date="2023-02-03"]').first().click();
              if (name === 'crossbook-date-95.6') {
                const dates = await page.locator('.collection-item').evaluateAll(ns => ns.map(n => n.dataset.date));
                assert(dates.includes('2023-02-03')); assert(!dates.includes('2024-03-04'));
                const reads = ledger.slice(chooserStart).filter(r => r.method === 'GET' && /^\/api\/album\/[^/]+\/photos$/.test(r.route));
                if (reads.length) assert(reads.every(r => r.route === '/api/album/' + f.album.id + '/photos' && r.actor === A.id && r.status === 200));
                chooserObservations.push({dates, reads: reads.map(r => ({route: r.route, actor: r.actor, status: r.status}))});
              }
              await page.locator('#moveCollectionConfirmBtn').click(); await page.locator('.timehut-dialog button[type="submit"]').click();
            } else { await page.locator('#deleteSelectedBtn').click(); await page.locator('#confirmOkBtn').click(); }
          }
          let isoTotalFailure = null;
          if (iso) {
            const beforeCancel = ledger.length; await act(true);
            assert.equal(httpRows(beforeCancel, 'POST', route).length, 0);
            checkSource(await sourceState(), [...ids, ...unselected], ids);
            providerControl.failed = new Set(ids);
            const beforeTotal = ledger.length, response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === route);
            await act(); await (await response).finished();
            await page.waitForFunction(() => !document.querySelector('#moveCollectionConfirmBtn').disabled && document.querySelector('#moveCollectionConfirmBtn').textContent === '確認移動');
            isoTotalFailure = {http: httpRows(beforeTotal, 'POST', route), state: await sourceState()};
            assert.equal(isoTotalFailure.http.length, 1);
            assert.deepEqual(isoTotalFailure.http[0].body.photoIds, ids);
            assert(isoTotalFailure.http[0].response.results.every(r => r.success === false));
            checkSource(isoTotalFailure.state, [...ids, ...unselected], ids);
          }
          providerControl.failed = new Set([ids[1]]); const partialStart = ledger.length;
          await act();
          await page.waitForFunction(id => !BackgroundWorker.isBusy && AlbumState.selectedPhotos.size === 1 && AlbumState.selectedPhotos.has(id), ids[1]);
          const partial = httpRows(partialStart, 'POST', route); assert.equal(partial.length, 1);
          assert.equal(partial[0].actor, A.id); assert.equal(partial[0].status, 200); assert.deepEqual(partial[0].body.photoIds, ids);
          assert.deepEqual(partial[0].response.results.filter(r => r.success).map(r => r.photoId), [ids[0]]);
          assert.deepEqual(partial[0].response.results.filter(r => !r.success).map(r => r.photoId), [ids[1]]);
          const afterPartial = await sourceState(); checkSource(afterPartial, [ids[1], ...unselected], [ids[1]]);
          let partialReload = null;
          if (remaining) {
            // Read-only second tab preserves the original failed-only retry UI while observing a true reload.
            const probe = await context.newPage(); observe(probe);
            try {
              await probe.goto(afterPartial.url); await probe.evaluate(() => TimehutPage.ready);
              await probe.waitForFunction(() => !document.querySelector('#loadingIndicator') || document.querySelector('#loadingIndicator').style.display === 'none');
              await probe.reload(); await probe.evaluate(() => TimehutPage.ready);
              await probe.waitForFunction(() => !document.querySelector('#loadingIndicator') || document.querySelector('#loadingIndicator').style.display === 'none');
              partialReload = {actualReload: true, independentReadOnlyTab: true, ...await sourceState(probe)};
              if (action === 'date') checkSource(partialReload, [ids[1], ...unselected], []);
              else if (/失敗|尚未讀取/.test(partialReload.info) || JSON.stringify(partialReload.cards) !== JSON.stringify([ids[1], ...unselected])) {
                (report.findings ||= []).push({id: '95.5-DELETE-PARTIAL-PENDING-RELOAD', state: partialReload,
                  boundary: 'Confirmed deleted ID is removed from URL. Failed deletion remains durable pending and ordinary account list closes its access; reload cannot recover the failed card. Original tab retains failed-only retry and is tested separately. Main/reviewer must disposition this remaining read/recovery boundary.'});
              } else checkSource(partialReload, [ids[1], ...unselected], []);
            } finally { await probe.close(); }
          }
          providerControl.failed.clear(); const retryStart = ledger.length;
          const navigation = remaining && action === 'delete' ? page.waitForEvent('domcontentloaded') : null;
          await act();
          if (!remaining) {
            await page.waitForURL(url => url.pathname === '/app/timeline.html' && url.searchParams.get('album') === f.album.id);
            await page.evaluate(() => TimehutPage.ready); await page.waitForFunction(() => !TimelineState.isLoading);
          } else {
            await page.waitForFunction(id => !BackgroundWorker.isBusy && AlbumState.selectedPhotos.size === 0 && AlbumState.photos.length === 1 && AlbumState.photos[0].id === id, unselected[0]);
            if (navigation) { await navigation; await page.evaluate(() => TimehutPage.ready); await page.waitForFunction(() => !document.querySelector('#loadingIndicator') || document.querySelector('#loadingIndicator').style.display === 'none'); }
          }
          const retry = httpRows(retryStart, 'POST', route); assert.equal(retry.length, 1); assert.equal(retry[0].actor, A.id);
          assert.equal(retry[0].status, 200); assert.deepEqual(retry[0].body.photoIds, [ids[1]]);
          assert.deepEqual(retry[0].response.results.filter(r => r.success).map(r => r.photoId), [ids[1]]);
          const afterRetry = remaining ? await sourceState() : null;
          let manualReload = null, finalTimeline = null;
          if (remaining) {
            checkSource(afterRetry, unselected, []); const before = ledger.length;
            await page.reload(); await page.evaluate(() => TimehutPage.ready);
            await page.waitForFunction(() => !document.querySelector('#loadingIndicator') || document.querySelector('#loadingIndicator').style.display === 'none');
            manualReload = {...await sourceState(), actualManualRefresh: true}; checkSource(manualReload, unselected, []);
            assert(httpRows(before, 'GET', '/api/album/' + f.album.id + '/photos').length > 0);
            assert.equal(JSON.stringify(store.state.media[unselected[0]]), unselectedBefore);
          } else {
            finalTimeline = await page.evaluate(() => ({url: location.href, album: CONFIG.CHILDREN[TimelineState.currentChildIndex].albumId,
              stored: localStorage.getItem('timehut:album-choice:' + TimehutPage.owner()), ids: TimelineState.photos.map(p => p.id),
              selected: [...SelectionState.selectedPhotos], busy: BackgroundWorker.isBusy, uploading: BackgroundUploader.isUploading}));
            assert.equal(finalTimeline.album, f.album.id); assert.equal(finalTimeline.stored, f.album.id);
            assert.deepEqual(finalTimeline.ids.sort(), action === 'delete' ? [f.ids[2]] : [...ids, f.ids[2]].sort());
            assert.deepEqual(finalTimeline.selected, []); assert.equal(finalTimeline.busy, false); assert.equal(finalTimeline.uploading, false);
            const before = ledger.length; await page.reload(); await page.evaluate(() => TimehutPage.ready); await page.waitForFunction(() => !TimelineState.isLoading);
            assert.equal(await page.evaluate(() => CONFIG.CHILDREN[TimelineState.currentChildIndex].albumId), f.album.id);
            assert(httpRows(before, 'GET', '/api/album/' + f.album.id + '/photos').length > 0);
            manualReload = {actualManualRefresh: true, timelineAlbum: f.album.id, url: page.url()};
          }
          const readback = await read(f.album.id);
          if (action === 'date') {
            assert(ids.every(id => readback.find(p => p.id === id)?.datetaken.startsWith('2023-02-03')));
            assert.equal(JSON.stringify(f.originals.map(r => store.state.receipts[r.localId])), receiptBefore);
            for (const row of f.originals) assert.equal(sha(fs.readFileSync(row.localPath)), row.contentSha256);
          } else {
            assert.deepEqual(readback.map(p => p.id).sort(), [f.ids[2], ...unselected].sort());
            for (const row of f.originals.slice(0, 2)) { assert(!fs.existsSync(row.localPath)); assert.equal(store.state.photoDeletes[row.flickrPhotoId].status, 'complete'); }
          }
          assert.equal(JSON.stringify(store.state.media[f.ids[2]]), untouched);
          return {action, remaining, isoDateFixtures: iso, isoTotalFailure, sourceAlbum: f.album.id, ids, unselected, differentChoice, savedAtDeepLink,
            originalURL, chooserObservations, partialHTTP: partial[0], afterPartial, partialReload, retryHTTP: retry[0], afterRetry,
            manualReload, finalTimeline, ordinaryReadback: readback.map(p => ({id: p.id, date: p.datetaken})),
            failedOnlyRetry: true, noSuccessfulIDReplayed: true, actualWorker: action === 'delete', fallbackDeletion: 'NOTVERIFIED',
            busyOrStorageFailureLeaveGuard: 'NOTVERIFIED; no synthetic state mutation or actual upload added', realProviderRequests: 0};
        }
        if (['album-add', 'album-date', 'album-delete', 'album-zip', 'timeline-zip'].includes(name)) {
          const action = name.split('-')[1], albumEntry = name.startsWith('album-');
          if (albumEntry) {
            await page.locator('.moment-item').filter({has: page.locator('.moment-album-link')}).first().locator('.moment-album-link').click();
            await page.waitForURL('**/album.html?*'); await page.locator('.album-photo-card').nth(1).waitFor(); await page.locator('#headerSelectBtn').click();
            for (const id of f.ids.slice(0, 2)) await page.locator('.album-photo-card[data-id="' + id + '"] .select-checkbox').click();
          } else {
            await page.locator('#selectModeBtn').click(); for (const id of f.ids.slice(0, 2)) await page.locator('.moment-photo-container[data-photo-id="' + id + '"] .timeline-photo-select').click();
          }
          const chosen = () => page.evaluate(albumEntry => (albumEntry ? [...AlbumState.selectedPhotos] : [...SelectionState.selectedPhotos]).map(String).sort(), albumEntry);
          const start = ledger.length;
          async function act(cancel = false) {
            if (action === 'add') {
              await page.locator('#batchAlbumBtn').click();
              if (cancel) return page.locator('.timehut-dialog').getByRole('button', {name: '取消', exact: true}).click();
              await page.locator('.timehut-dialog input[name="albumChoice"][value="2"]').check(); return page.locator('.timehut-dialog button[type="submit"]').click();
            }
            if (action === 'date') {
              if (!(await page.locator('#moveCollectionModal').isVisible())) await page.locator('#batchMoveCollectionBtn').click();
              if (cancel) return page.locator('#moveCollectionModal').getByRole('button', {name: '取消', exact: true}).click();
              await page.locator('.collection-item[data-date="2023-02-03"]').first().click();
              await page.locator('#moveCollectionConfirmBtn').click(); return page.locator('.timehut-dialog button[type="submit"]').click();
            }
            if (action === 'delete') {
              await page.locator('#deleteSelectedBtn').click(); return page.locator(cancel ? '#confirmCancelBtn' : '#confirmOkBtn').click();
            }
            await page.locator(albumEntry ? '#downloadSelectedBtn' : '#batchDownloadBtn').click();
            if (cancel) return page.locator('.timehut-dialog').getByRole('button', {name: '取消', exact: true}).click();
            return page.locator('.timehut-dialog button[type="submit"]').click();
          }
          await act(true); assert.deepEqual(await chosen(), f.ids.slice(0, 2));
          if (action === 'zip') {
            const zipEvents = [], outcomes = []; const listener = d => zipEvents.push(d); page.on('download', listener);
            try {
              for (const stage of ['total-failure', 'partial', 'retry-success']) {
                providerControl.failedDownloads = new Set(stage === 'total-failure' ? f.ids.slice(0, 2) : stage === 'partial' ? [f.ids[1]] : []);
                const before = ledger.length, downloadedBefore = zipEvents.length;
                const downloadReady = stage === 'total-failure' ? null : page.waitForEvent('download');
                await act(); const wanted = stage === 'total-failure' ? f.ids.slice(0, 2) : stage === 'partial' ? [f.ids[1]] : [];
                await page.waitForFunction(({albumEntry, wanted}) => {
                  const ids = (albumEntry ? [...AlbumState.selectedPhotos] : [...SelectionState.selectedPhotos]).map(String).sort();
                  const idle = albumEntry ? !AlbumState.downloadBusy : !SelectionState.downloadBusy;
                  return idle && JSON.stringify(ids) === JSON.stringify(wanted);
                }, {albumEntry, wanted});
                const originalRequests = ledger.slice(before).filter(r => r.method === 'GET' && (r.query.size === 'o' || r.query.purpose === 'original'));
                const requested = originalRequests.map(r => r.route.split('/')[3]);
                assert.deepEqual(requested, stage === 'retry-success' ? [f.ids[1]] : f.ids.slice(0, 2));
                const files = [];
                if (stage === 'total-failure') assert.equal(zipEvents.length, downloadedBefore);
                else {
                  await downloadReady;
                  assert.equal(zipEvents.length, downloadedBefore + 1); const download = zipEvents.at(-1), bytes = fs.readFileSync(await download.path());
                  const JSZip = require('../js/vendor/jszip-3.10.1.min.js'), zip = await JSZip.loadAsync(bytes);
                  for (const entry of Object.values(zip.files).filter(x => !x.dir)) {
                    const id = f.ids.find(id => entry.name.startsWith(id)); assert(id); const b = await entry.async('nodebuffer');
                    assert.equal(sha(b), sha(originalBodies.get(id))); files.push({id, entry: entry.name, bytes: b.length, sha256: sha(b)});
                  }
                  assert.deepEqual(files.map(x => x.id), stage === 'partial' ? [f.ids[0]] : [f.ids[1]]);
                }
                outcomes.push({stage, requested, files, failedSelection: wanted, originalHTTPStatuses: originalRequests.map(r => r.status)});
              }
            } finally { page.removeListener('download', listener); providerControl.failedDownloads.clear(); }
            assert.equal(JSON.stringify(f.originals.map(r => store.state.receipts[r.localId])), receiptBefore);
            assert.equal(ledger.slice(start).filter(r => r.method !== 'GET').length, 0);
            return {entryPoint: albumEntry ? '03 own downloadSelected' : '08-photo own batchDownload', action, album: f.album.id,
              cancelledReadDispatch: 0, outcomes, noSuccessfulOriginalReDownloadedOnRetry: true, selectionCount: await page.locator('#selectedCount').innerText(),
              realMP4: true, HTTPMutations: 0, videoPlaybackClaimed: false};
          }
          const route = action === 'add' ? '/api/album/' + target.id + '/add_photos' : action === 'date' ? '/api/photos/update-date' : '/api/photos/delete';
          assert.equal(httpRows(start, 'POST', route).length, 0); const outcomes = [];
          const stages = action === 'add' ? ['atomic-failure', 'retry-success'] : ['total-failure', 'partial', 'retry-success'];
          let postReload = null;
          for (const stage of stages) {
            const before = ledger.length;
            if (action === 'add') failMembershipAction = stage === 'atomic-failure' ? 'add' : null;
            else providerControl.failed = new Set(stage === 'total-failure' ? f.ids.slice(0, 2) : stage === 'partial' ? [f.ids[1]] : []);
            const navigation = stage === 'retry-success' && action === 'date' ? page.waitForEvent('domcontentloaded') : null;
            await act(); const wanted = stage.endsWith('failure') ? f.ids.slice(0, 2) : stage === 'partial' ? [f.ids[1]] : [];
            if (navigation) {
              await navigation; await page.evaluate(() => TimehutPage.ready); await page.waitForFunction(() => document.querySelector('#loadingIndicator').style.display === 'none');
              postReload = {url: page.url(), text: await page.locator('#momentInfo').innerText(), visibleCards: await page.locator('.album-photo-card').count(), selected: await chosen()};
            } else await page.waitForFunction(wanted => JSON.stringify([...AlbumState.selectedPhotos].sort()) === JSON.stringify(wanted) && !BackgroundWorker.isBusy, wanted);
            const calls = httpRows(before, 'POST', route); assert.equal(calls.length, 1); const r = calls[0];
            assert.deepEqual(r.body.photoIds, stage === 'retry-success' && action !== 'add' ? [f.ids[1]] : f.ids.slice(0, 2));
            assert.equal(r.status, stage === 'atomic-failure' ? 409 : 200);
            const results = r.response.results || []; const sql = f.ids.slice(0, 2).map(id => ({id, date: store.state.media[id].date,
              deleted: store.state.media[id].deletedAt !== undefined, bytes: store.state.media[id].bytes, pendingDelete: store.state.photoDeletes?.[id]?.status === 'pending'}));
            if (action !== 'add') assert.deepEqual(results.filter(r => !r.success).map(r => r.photoId), wanted);
            assert.deepEqual(await chosen(), wanted); assert.equal(await page.locator('#selectedCount').innerText(), String(wanted.length));
            outcomes.push({stage, requested: r.body.photoIds, status: r.status, results, selection: wanted, sql});
          }
          const readback = await read(f.album.id);
          if (action === 'add') {
            const targetRows = await read(target.id); assert(f.ids.slice(0, 2).every(id => targetRows.some(p => p.id === id)));
            assert.equal(JSON.stringify(f.originals.map(r => store.state.receipts[r.localId])), receiptBefore);
          } else if (action === 'date') {
            assert(f.ids.slice(0, 2).every(id => readback.find(p => p.id === id)?.datetaken.startsWith('2023-02-03')));
            assert.equal(JSON.stringify(f.originals.map(r => store.state.receipts[r.localId])), receiptBefore);
          } else {
            assert.deepEqual(readback.map(p => p.id), [f.ids[2]]);
            for (const row of f.originals.slice(0, 2)) { assert(!fs.existsSync(row.localPath)); assert.equal(store.state.photoDeletes[row.flickrPhotoId].status, 'complete'); }
          }
          if (postReload && /失敗|尚未讀取/.test(postReload.text)) {
            (report.findings ||= []).push({id: 'ALBUM-STALE-EXACT-IDS-AFTER-' + action, action, postReload,
              boundary: 'Mutation and SQL/file readback succeeded; automatic same-URL reload still requests moved/deleted old exact IDs. Do not certify a clean03 completion/reload state.'});
          }
          await page.locator('a.header-btn[href="timeline.html"]').click(); await page.locator('.moment-item').first().waitFor();
          return {entryPoint: '03 own inline ' + action, album: f.album.id, outcomes, postReload,
            reloadedOrdinaryReadback: readback.map(p => ({id: p.id, date: p.datetaken})), timelineReturn: true,
            partialBranch: action === 'add' ? 'N/A one atomic SQLite membership transaction; injected precommit failure409, exact-ID retry200.' : undefined};
        }
        if (name === 'viewer-video-play' || name === 'album-video-95.6') {
          if (name === 'album-video-95.6') {
            assert.equal(currentVersion(), '2026.10.17-ui.95.6');
            await page.locator('.moment-item').filter({has: page.locator('.moment-album-link')}).first().locator('.moment-album-link').click();
            await page.waitForURL('**/album.html?*'); await page.locator('.album-photo-card').nth(1).waitFor();
          }
          providerControl.failNextVideoInfo = true;
          await page.locator(name === 'album-video-95.6' ? '.album-photo-card[data-id="' + f.ids[1] + '"] img' : '.moment-photo-container[data-photo-id="' + f.ids[1] + '"] img').click(); await page.locator('#photoModal.active').waitFor();
          await page.locator('#modalMediaRetry').waitFor(); const failed = await page.locator('#modalMediaStatus').innerText();
          assert(failed.includes('影片暫時無法播放')); assert.equal(await page.locator('#modalTitle').innerText(), 'Synthetic ' + f.ids[1]);
          await page.locator('#modalMediaRetry').click(); await page.waitForFunction(() => document.querySelector('#modalVideo').readyState >= 1);
          await page.locator('#modalVideo').press('Space'); await page.waitForFunction(() => document.querySelector('#modalVideo').currentTime > 0.1);
          const playback = await page.locator('#modalVideo').evaluate(v => ({currentTime: v.currentTime, duration: v.duration, readyState: v.readyState, paused: v.paused, error: v.error?.code || null}));
          assert.equal(playback.paused, false);
          assert.equal(playback.error, null); const requests = ledger.filter(r => r.case === activeCase && r.route === '/api/photo/' + f.ids[1] + '/video');
          assert(requests.some(r => r.status === 502)); assert(requests.some(r => [200, 206].includes(r.status)));
          const entryURL = page.url(); assert.equal(await page.locator('#modalTitle').innerText(), 'Synthetic ' + f.ids[1]);
          if (name === 'album-video-95.6') assert(entryURL.includes('/album.html?'));
          await page.keyboard.press('Escape'); return {entryPoint: name === 'album-video-95.6' ? '03 own album inline openModal/actual video' : '07 timeline viewer', entryURL,
            id: f.ids[1], failedText: failed, retryActualButton: true, playback, HTTPStatuses: requests.map(r => r.status),
            MP4SHA256: sha(f.mp4), browserSpacePlayback: true, realProviderRequests: 0};
        }
        if (name === 'album-tags') {
          await page.locator('.moment-item').filter({has: page.locator('.moment-album-link')}).first().locator('.moment-album-link').click();
          await page.waitForURL('**/album.html?*'); await page.locator('.album-photo-card').nth(1).waitFor();
          await page.locator('#headerSelectBtn').click(); for (const id of f.ids.slice(0, 2)) await page.locator('.album-photo-card[data-id="' + id + '"] .select-checkbox').click();
          const start = ledger.length; await page.locator('#tagSelectedBtn').click();
          await page.locator('#tagModal').getByRole('button', {name: '取消', exact: true}).click();
          assert.equal(httpRows(start, 'POST', '/api/photos/tags/add').length, 0);
          await page.locator('#tagSelectedBtn').click(); await page.locator('#tagInput').fill('ui_album_tags');
          const outcomes = [];
          for (const stage of ['total-failure', 'partial', 'retry-success']) {
            providerControl.failed = new Set(stage === 'total-failure' ? f.ids.slice(0, 2) : stage === 'partial' ? [f.ids[1]] : []);
            const before = ledger.length; await page.locator('#tagConfirmBtn').click();
            const wanted = stage === 'total-failure' ? f.ids.slice(0, 2) : stage === 'partial' ? [f.ids[1]] : [];
            await page.waitForFunction(wanted => !document.querySelector('#tagConfirmBtn').disabled && JSON.stringify([...AlbumState.selectedPhotos].sort()) === JSON.stringify(wanted), wanted);
            const rows = httpRows(before, 'POST', '/api/photos/tags/add'); assert.equal(rows.length, 1); const r = rows[0];
            assert.deepEqual(r.body.photoIds, stage === 'retry-success' ? [f.ids[1]] : f.ids.slice(0, 2));
            assert.deepEqual(r.response.results.filter(r => !r.success).map(r => r.photoId), wanted);
            assert.equal(await page.locator('#selectedCount').innerText(), String(wanted.length));
            if (wanted.length) assert.equal(await page.locator('#tagInput').inputValue(), 'ui_album_tags');
            outcomes.push({stage, requested: r.body.photoIds, results: r.response.results, selection: wanted, draftRetained: wanted.length ? await page.locator('#tagInput').inputValue() : null});
          }
          assert.equal(await page.locator('#tagModal').isVisible(), false); assert.equal(await page.evaluate(() => AlbumState.isSelectMode), false);
          await page.reload(); await page.locator('.album-photo-card').nth(1).waitFor(); const rows = await read(f.album.id);
          for (const id of f.ids.slice(0, 2)) assert(rows.find(p => p.id === id).tags.includes('ui_album_tags'));
          assert.equal(JSON.stringify(f.originals.map(r => store.state.receipts[r.localId])), receiptBefore);
          return {entryPoint: '03 album.html own inline tag handlers', album: f.album.id, selected: f.ids.slice(0, 2), outcomes,
            reloadedTags: rows.map(p => ({id: p.id, tags: p.tags})), noSuccessfulIDReplayed: true, selectionReset: true};
        }
        const launcher = page.locator('.moment-photo-container[data-photo-id="' + f.ids[0] + '"] img');
        await launcher.press('Enter'); await page.locator('#photoModal.active').waitFor();
        if (name === 'viewer-tags') {
          await page.locator('#editTagsInput').fill('ui_viewer_saved'); const route = '/api/photo/' + f.ids[0] + '/tags', start = ledger.length;
          providerControl.failed = new Set([f.ids[0]]); await page.locator('.save-tags-btn').click(); await page.locator('.toast.error').waitFor();
          assert.equal(await page.locator('#editTagsInput').inputValue(), 'ui_viewer_saved');
          assert.equal(store.state.media[f.ids[0]].tags, 'uploader:人工 current park');
          providerControl.failed = new Set(); await page.locator('.save-tags-btn').click(); await page.getByText('✅ 標籤已儲存！', {exact: true}).waitFor();
          const requests = httpRows(start, 'PUT', route); assert.equal(requests.length, 2);
          assert.equal(requests[0].response.success, false); assert.equal(requests[1].response.success, true);
          assert.equal(store.state.media[f.ids[0]].tags, 'uploader:人工 ui_viewer_saved');
          await page.keyboard.press('Escape'); await page.reload(); await page.waitForFunction(() => !TimelineState.isLoading);
          const result = (await read(f.album.id)).find(p => p.id === f.ids[0]); assert.equal(result.tags, 'uploader:人工 ui_viewer_saved');
          assert.equal(JSON.stringify(f.originals.map(r => store.state.receipts[r.localId])), receiptBefore);
          return {entryPoint: '07 timeline viewer own savePhotoTags', id: f.ids[0], failedResult: requests[0].response,
            succeededResult: requests[1].response, persistedTags: result.tags, originalReceiptUnchanged: true, singletonPartial: 'N/A one exact ID'};
        }
        const steps = [];
        async function cursor(index, action) {
          await page.waitForFunction(index => TimelineState.currentModalIndex === index && document.querySelector('#modalPageIndicator').textContent === `${index + 1} / 3`, index);
          const s = await page.evaluate(() => ({id: TimelineState.allPhotosFlat[TimelineState.currentModalIndex].id,
            index: TimelineState.currentModalIndex, page: document.querySelector('#modalPageIndicator').textContent,
            title: document.querySelector('#modalTitle').textContent, date: document.querySelector('#modalDate').textContent,
            age: document.querySelector('#modalAge').textContent}));
          assert.equal(s.id, f.ids[index]); assert.equal(s.title, 'Synthetic ' + f.ids[index]);
          assert.equal(s.date, index === 2 ? '2023年2月3日' : '2024年1月2日'); steps.push({action, ...s});
        }
        await cursor(0, 'Enter'); assert(steps[0].age.includes('4歲1天'));
        await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(220); await cursor(0, 'ArrowLeft at first boundary');
        const downloads = [];
        async function download(index, expected, mime) {
          const pending = page.waitForEvent('download'); await page.locator('#modalDownloadBtn').click(); const d = await pending;
          const file = await d.path(), actual = fs.readFileSync(file); assert.equal(actual.length, expected.length); assert.equal(sha(actual), sha(expected));
          assert(d.suggestedFilename().includes(f.ids[index])); if (index === 1) assert(d.suggestedFilename().endsWith('.mp4'));
          const calls = ledger.filter(r => r.case === activeCase && r.route === '/api/photo/' + f.ids[index] + (index === 1 ? '/video' : '/image'));
          const original = calls.filter(r => index === 1 ? r.query.purpose === 'original' : r.query.size === 'o').at(-1);
          assert(original); assert.equal(original.status, 200); assert(original.contentType.startsWith(mime));
          downloads.push({id: f.ids[index], suggestedName: d.suggestedFilename(), bytes: actual.length, sha256: sha(actual), contentType: original.contentType, originalRoute: original.route, originalQuery: original.query});
        }
        await download(0, png, 'image/png');
        await page.keyboard.press('ArrowRight'); await cursor(1, 'ArrowRight'); await download(1, f.mp4, 'video/mp4');
        await page.keyboard.press('ArrowRight'); await cursor(2, 'ArrowRight');
        await page.keyboard.press('ArrowRight'); await page.waitForTimeout(220); await cursor(2, 'ArrowRight at last boundary');
        await page.keyboard.press('ArrowLeft'); await cursor(1, 'ArrowLeft'); await page.keyboard.press('ArrowLeft'); await cursor(0, 'ArrowLeft');
        await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#photoModal').classList.contains('active'));
        await page.waitForFunction(id => document.activeElement === document.querySelector('.moment-photo-container[data-photo-id="' + id + '"] img'), f.ids[0]);
        assert.equal(context.pages().length, 1); assert(!browserLedger.some(r => r.case === activeCase && r.blockedOrigin && r.navigation));
        return {entryPoint: '07 actual timeline viewer keyboard and original downloads', album: f.album.id, steps, downloads,
          focusReturnedToLaunchingPhoto: true, EscapeClosed: true, noExternalNavigation: true, videoPlaybackClaimed: false,
          MP4Source: 'existing artificial proposal public-r93-two-second.mp4, exact SHA pinned; no PNG substitution'};
      });
      report.scope = 'Selective03/07/08 current browser→ordinary HTTP/SQLite integration; only phaseCases executed';
      report.phaseCases = names; report.runtimeErrors = errors; assert.deepEqual(errors, []);
      report.limitations = ['Browser keyboard/focus only, no native keyboard/IME or physical proof.',
        'Synthetic provider/manifests/media only; no live network.',
        names.some(n => ['viewer-video-play', 'album-video-95.6'].includes(n)) ? 'Playback bounded to local artificial two-second MP4 and actual Space input; no physical/real-provider proof.' : 'No video playback claim in this phase.',
        'Only phaseCases are covered. Album date reload findings, if recorded, remain HOLD despite successful SQL mutation assertions.'];
      report.status = report.findings?.length ? 'HOLD_ALBUM_COMPLETION_RELOAD_FINDING_BOUNDED_SQL_PASS' : 'PASS_CURRENT_VIEWER_ALBUM_UI_HTTP_SQLITE_BOUNDED';
      if (report.findings?.length) process.exitCode = 1;
      return;
    }
    if (process.argv.includes('--empty-entry-only')) {
      await record('S02-A-95.3-empty-owned-album-CTA-opens-real-upload-correct-destination', async () => {
        const empty = store.album(A.id, 'Empty CTA Synthetic', '2020-01-01');
        await goto('timeline.html'); await page.locator('#hamburgerBtn').click();
        await page.locator('.sidebar-album-card').filter({hasText: 'Empty CTA Synthetic'}).click();
        await page.waitForFunction(() => !TimelineState.isLoading && TimelineState.photos.length === 0);
        await page.locator('#emptyState').waitFor();
        assert.equal(await page.locator('#emptyState a').count(), 0);
        const start = ledger.length, beforeURL = page.url();
        await page.locator('#emptyState button').click(); await page.locator('#uploadModal').waitFor();
        await page.waitForFunction(id => document.querySelector('#albumSelect')?.value === id, empty.id);
        const destination = await page.locator('#albumSelect').inputValue(); assert.equal(destination, empty.id);
        assert.equal(page.url(), beforeURL); assert.equal(context.pages().length, 1);
        const actor = await page.evaluate(() => TimehutAccounts.status().user.id); assert.equal(actor, A.id);
        const listed = ledger.filter(r => r.route === '/api/album/' + empty.id + '/photos').at(-1);
        assert.equal(listed.status, 200); assert.equal(listed.actor, A.id); assert.equal(listed.response.photoset.total, 0);
        assert.equal(ledger.slice(start).filter(r => r.method !== 'GET').length, 0);
        assert.equal(browserLedger.filter(r => r.blockedOrigin && r.navigation).length, 0);
        assert.equal(browserLedger.filter(r => r.blockedOrigin && /flickr/.test(r.blockedOrigin)).length, 0);
        return {albumId: empty.id, actor: A.id, listHTTP: 200, total: 0, actualCTAClick: true, realUploaderVisible: true,
          destinationId: destination, URLUnchanged: true, newTabs: 0, externalNavigations: 0, uploadPOSTs: 0, providerRequests: 0,
          blockedResourceDependencies: browserLedger.filter(r => r.blockedOrigin).map(r => ({origin: r.blockedOrigin, type: r.resourceType, navigation: r.navigation}))};
      });
      report.scope = 'ONE actual HTTP/UI empty-state CTA delta; previous13 contract matrix NOT rerun';
      report.limitations = ['Opening upload UI is not upload/progress/provider completion.', 'Prior95.2 proofs require exact95.3 source delta adoption; no latest-subset-as-all-states claim.'];
      report.runtimeErrors = errors; assert.deepEqual(errors, []); report.status = 'PASS_95_3_EMPTY_CTA_ONE_LOCAL_CONTRACT';
      return;
    }
    await record('S05-A-archive-restore-readback-reload', async () => {
      await goto('settings.html#deleted-albums');
      await page.locator('.album-restore-row button').waitFor(); assert.equal(await page.locator('.album-restore-row span').innerText(), archived.title);
      const start = ledger.length; await Promise.all([page.waitForURL('**/settings.html?album-action=restored'), page.locator('.album-restore-row button').click()]);
      await page.locator('.birthdate-input').nth(2).waitFor();
      const requests = httpRows(start, 'POST', '/api/accounts/albums/' + archived.id + '/restore'); assert.equal(requests.length, 1);
      assert.equal(requests[0].response.photosDeleted, false); assert.equal(requests[0].response.album.id, archived.id);
      assert.equal(JSON.stringify(store.state.media['800000000105']), archivedMediaBefore); assert.equal(store.state.albums[archived.id].archivedAt, undefined);
      await page.reload(); await page.getByText('目前沒有已刪除相簿。').waitFor({state: 'attached'});
      await page.locator('#deleted-albums summary').click(); await page.getByText('目前沒有已刪除相簿。').waitFor();
      assert((await page.locator('.child-name').allTextContents()).includes(archived.title));
      return {id: archived.id, photosDeleted: false, exactMediaUnchanged: true, activeAfterReload: true, archivedEmpty: true};
    });
    await record('S05-A-archive-real-list-error-reload-recovery', async () => {
      failArchivedRead = true; await goto('settings.html#deleted-albums');
      await page.getByText('相簿管理暫時無法讀取，請稍後更新頁面再試。').waitFor({state: 'attached'});
      await page.locator('#deleted-albums summary').click();
      await page.getByText('相簿管理暫時無法讀取，請稍後更新頁面再試。').waitFor();
      assert(ledger.some(r => r.case === activeCase && r.route.endsWith('/archived') && r.status === 503));
      await page.reload(); await page.getByText('目前沒有已刪除相簿。').waitFor();
      return {injectedStoreReadError: true, error503: true, recoveryViaPageReload: true};
    });
    await record('S05-B-dates-missing-future-leap-month-boundaries', async () => {
      await goto('settings.html'); await page.locator('#birthdate-0').waitFor(); const start = ledger.length;
      for (const value of ['', '2100-01-01']) {
        await page.locator('#birthdate-0').fill(value); await page.locator('.save-btn').click();
        await page.locator('#settingsStatus.error').waitFor(); assert.equal(await page.locator('#birthdate-0').getAttribute('aria-invalid'), 'true');
        assert((await page.locator('.child-age').first().innerText()).includes(value ? '尚未出生' : '日期無效'));
      }
      assert.equal(httpRows(start, 'PUT', '/api/accounts/albums/dates').length, 0);
      const helper = await page.evaluate(() => Object.fromEntries(['2020-02-29', '2021-02-29', '2024-04-31', '2024-04-30', '2000-02-29', '1900-02-29'].map(d => [d, !!parseBirthDate(d)])));
      assert.deepEqual(helper, {'2020-02-29': true, '2021-02-29': false, '2024-04-31': false, '2024-04-30': true, '2000-02-29': true, '1900-02-29': false});
      await page.locator('#birthdate-0').fill('2020-02-29'); assert.equal(await page.locator('#birthdate-0').getAttribute('aria-invalid'), 'false');
      return {UIRejected: ['missing', 'future'], noPUT: true, pureCurrentParserBoundaries: helper, nativePickerOrIME: false};
    });
    await record('S05-B-invalid-calendar-ordinary-API-atomic-rejection', async () => {
      const before = [source.id, target.id, archived.id].map(id => store.state.albums[id].birthDate);
      const status = await page.evaluate(async id => {
        try { await TimehutAccounts.request('/api/accounts/albums/dates', {method: 'PUT', body: {updates: [{id, birthDate: '2021-02-29'}]}}); return 200; }
        catch (error) { return error.status; }
      }, source.id);
      assert.equal(status, 400); assert.deepEqual([source.id, target.id, archived.id].map(id => store.state.albums[id].birthDate), before);
      return {date: '2021-02-29', status, changes: 0, entryPoint: 'ordinary account API calendar validation; separate from UI/native picker'};
    });
    const saved = ['2020-02-29', '2021-03-01', '2022-01-31'];
    await record('S05-B-valid-save-SQLite-newcontext-reload', async () => {
      for (let i = 0; i < saved.length; i++) await page.locator('#birthdate-' + i).fill(saved[i]);
      const start = ledger.length; await page.locator('.save-btn').click(); await page.locator('#settingsStatus.success').waitFor();
      const put = httpRows(start, 'PUT', '/api/accounts/albums/dates'); assert.equal(put.length, 1); assert.equal(put[0].status, 200);
      assert.deepEqual(put[0].body.updates.map(r => r.id), [source.id, target.id, archived.id]);
      assert.deepEqual([source.id, target.id, archived.id].map(id => store.state.albums[id].birthDate), saved);
      const state = await context.storageState(); const old = context; context = await newContext(state); page = await context.newPage(); observe(page); await old.close();
      await goto('settings.html'); await page.locator('#birthdate-2').waitFor(); assert.deepEqual(await births(), saved);
      const ctx = ledger.filter(r => r.route === '/api/accounts/context' && r.case === activeCase).at(-1);
      assert.equal(ctx.actor, A.id); assert.deepEqual(ctx.response.children.map(r => r.birthDate), saved);
      assert((await page.locator('#fe-version').innerText()).includes(report.sourceVersion));
      await page.waitForFunction(() => document.querySelector('#be-version').textContent === 'LOCAL-CONTRACT-FIXTURE-NOT-PRODUCTION');
      return {ids: [source.id, target.id, archived.id], dates: saved, newBrowserContext: true, sqliteReadback: true,
        backendVersion: 'LOCAL-CONTRACT-FIXTURE-NOT-PRODUCTION', frontendVersion: report.sourceVersion};
    });
    await record('S05-B-save-SQL-error-retains-draft-retry-readback', async () => {
      await page.locator('#birthdate-0').fill('2020-03-01'); failDateCommit = true; const start = ledger.length;
      await page.locator('.save-btn').click(); await page.locator('#settingsStatus.error').waitFor();
      assert.equal(await page.locator('#birthdate-0').inputValue(), '2020-03-01'); assert.equal(store.state.albums[source.id].birthDate, saved[0]);
      assert.equal(httpRows(start, 'PUT', '/api/accounts/albums/dates')[0].status, 400);
      await page.locator('.save-btn').click(); await page.locator('#settingsStatus.success').waitFor();
      await page.reload(); await page.locator('#birthdate-0').waitFor(); assert.equal(await page.locator('#birthdate-0').inputValue(), '2020-03-01');
      return {failedRequest400: true, draftRetained: '2020-03-01', persistedAfterRetry: store.state.albums[source.id].birthDate};
    });
    async function chooseAlbum(index) {
      await page.locator('#hamburgerBtn').click(); await page.locator('.sidebar-album-card').nth(index).click();
    }
    async function timelineSource() { await goto('timeline.html'); await page.locator('#hamburgerBtn').waitFor(); await chooseAlbum(0); await page.waitForFunction(() => TimelineState.photos.length === 3 && !TimelineState.isLoading); }
    await record('S02-A-settings-return-album-switch-group-count-drawer', async () => {
      const link = page.locator('a[href="timeline.html"]:visible').first(); await link.click(); await page.locator('#hamburgerBtn').waitFor();
      await chooseAlbum(0); await page.waitForFunction(() => TimelineState.photos.length === 3 && !TimelineState.isLoading);
      assert.equal(await page.locator('#currentChildName').innerText(), source.title);
      const groups = await page.evaluate(() => TimelineState.groupedPhotos.map(g => ({label: g.label, ids: g.photos.map(p => p.id)})));
      assert.deepEqual(groups.flatMap(g => g.ids).sort(), ['800000000101', '800000000102', '800000000103']);
      assert.deepEqual(groups.map(g => g.label), ['3歲', '2歲']);
      await page.locator('#timeTravelBtn').click(); const drawer = await page.locator('.time-travel-item').allTextContents(); assert.equal(drawer.length, groups.length);
      assert(drawer[0].includes('3歲') && drawer[0].includes('1 張照片 · 1 部影片')); assert(drawer[1].includes('2歲') && drawer[1].includes('1 張照片'));
      await page.locator('.time-travel-item').last().click(); await page.waitForTimeout(450);
      assert.equal(await page.locator('#timeTravelBtn').getAttribute('aria-expanded'), 'false');
      const anchored = await page.locator('.age-group-header').last().evaluate(n => ({label: n.dataset.ageLabel, top: n.getBoundingClientRect().top}));
      assert.equal(anchored.label, '2歲'); assert(anchored.top >= 0 && anchored.top < 844, 'CHOSEN_AGE_ANCHOR_IN_VIEWPORT');
      await chooseAlbum(1); await page.waitForFunction(() => TimelineState.photos.length === 1 && !TimelineState.isLoading);
      assert.equal(await page.locator('#currentChildName').innerText(), target.title); assert.equal(await page.evaluate(() => TimelineState.photos[0].id), '800000000104');
      await page.reload(); await page.waitForFunction(() => TimelineState.photos.length === 1 && !TimelineState.isLoading); assert.equal(await page.locator('#currentChildName').innerText(), target.title);
      return {actor: A.id, sourceAlbum: source.id, groups, drawer, chosenAnchor: anchored, targetAlbum: target.id, targetCount: 1, persistedAlbumChoice: true};
    });
    await record('S02-A-loading-error-retry-current-HTTP', async () => {
      holdAlbumRead = true; const held = new Promise(resolve => { heldReached = resolve; });
      const nav = goto('timeline.html'); await held; assert(await page.locator('#loadingIndicator').isVisible()); heldRelease(); await nav;
      await page.waitForFunction(() => !TimelineState.isLoading);
      failAlbumRead = true; await page.reload(); await page.getByRole('heading', {name: '載入失敗'}).waitFor();
      await page.getByRole('button', {name: '重試', exact: true}).click(); await page.waitForFunction(() => TimelineState.photos.length === 1 && !TimelineState.isLoading);
      return {heldGETLoadingObserved: true, uploadWireProgressClaimed: false, injected503: true, actualRetryGET: true, targetId: '800000000104'};
    });
    await record('S02-A-search-query-URL-owner-readback', async () => {
      await page.locator('#searchInput').fill('current park'); await page.locator('#searchInput').press('Enter'); await page.waitForURL('**/search.html?q=*');
      assert.equal(new URL(page.url()).searchParams.get('q'), 'current park'); await page.waitForFunction(() => document.querySelector('#searchInput').value === 'current park');
      await page.waitForFunction(() => document.body.textContent.includes('Synthetic'));
      const search = ledger.filter(r => r.case === activeCase && r.route === '/api/accounts/photos').at(-1); assert(search); assert.equal(search.actor, A.id);
      assert.equal(search.query.album, target.id); assert.equal(search.query.query, 'current park');
      return {query: 'current park', albumId: target.id, exactIDs: search.response.photos.photo.map(p => p.id), owner: search.actor};
    });
    await record('S03-A-actual-timeline-to-album-HTTP-counters-selection-viewer-return', async () => {
      await timelineSource(); const moment = page.locator('.moment-item').filter({has: page.locator('.moment-album-link')}).first();
      await moment.locator('.moment-album-link').click(); await page.waitForURL('**/album.html?*'); await page.locator('.album-photo-card').nth(1).waitFor();
      const u = new URL(page.url()); assert.equal(u.searchParams.get('album'), source.id); assert.equal(u.searchParams.get('date'), '2024-01-02');
      const ids = await page.locator('.album-photo-card').evaluateAll(ns => ns.map(n => n.dataset.id)); assert.deepEqual(ids.sort(), ['800000000101', '800000000102']);
      assert((await page.locator('#momentInfo').innerText()).includes('1 張照片 · 1 部影片')); assert((await page.locator('#momentAge').innerText()).includes('3歲10個月1天'));
      await page.locator('#headerSelectBtn').click(); await page.locator('.select-checkbox').nth(0).click(); await page.locator('.select-checkbox').nth(1).click();
      assert.equal(await page.locator('#selectedCount').innerText(), '2'); await page.locator('.select-checkbox').nth(0).click(); assert.equal(await page.locator('#selectedCount').innerText(), '1');
      await page.locator('#headerSelectBtn').click(); assert.equal(await page.locator('#selectedCount').innerText(), '0');
      await page.locator('.album-photo-card[data-id="800000000101"] img').click(); await page.locator('#photoModal.active').waitFor();
      await page.waitForFunction(() => document.querySelector('#modalImage')?.naturalWidth > 0); await page.locator('.modal-close').click();
      assert(!(await page.locator('#photoModal').isVisible())); await page.goBack(); await page.locator('.moment-item').first().waitFor();
      return {album: source.id, date: u.searchParams.get('date'), requestedPhotoIDs: u.searchParams.get('photos'), loadedIDs: ids,
        photoCount: 1, videoMetadataCount: 1, selectionCounts: [2, 1, 0], photoDecoded: true, videoPlaybackClaimed: false, timelineReturned: true};
    });
    const selectedIDs = async mode => page.evaluate(mode => mode === 'photo' ? [...SelectionState.selectedPhotos] : getSelectedMomentPhotoIds(), mode);
    async function selectMode(mode) {
      await timelineSource();
      if (mode === 'photo') {
        await page.locator('#selectModeBtn').click(); await page.locator('.timeline-photo-select').nth(0).click(); await page.locator('.timeline-photo-select').nth(1).click();
      } else { await page.locator('#batchMomentBtn').click(); await page.locator('.moment-item').filter({has: page.locator('.moment-album-link')}).first().locator('.moment-header').click(); }
      const ids = await selectedIDs(mode); assert.deepEqual(ids.slice().sort(), ['800000000101', '800000000102']); return ids;
    }
    async function albumDialog(mode, cancel = false) {
      await page.locator(mode === 'photo' ? '#batchAlbumBtn' : '#momentMoveAlbumBtn').click();
      if (cancel) { await page.locator('.timehut-dialog button[type="button"]').filter({hasText: '取消'}).click(); return; }
      await page.locator('.timehut-dialog input[name="albumChoice"][value="2"]').check();
      await page.locator('.timehut-dialog button[type="submit"]').click();
      if (mode === 'moment') await page.locator('.timehut-dialog button[type="submit"]').click();
    }
    async function readAlbum(id) { const r = await page.evaluate(id => TimehutAccounts.request('/api/album/' + id + '/photos'), id); return r.photoset.photo.map(p => p.id).sort(); }
    await record('S08-photo-add-membership-cancel-atomic-failure-retry-exact-IDs', async () => {
      const ids = await selectMode('photo'), start = ledger.length;
      await albumDialog('photo', true); assert.deepEqual(await selectedIDs('photo'), ids);
      assert.equal(httpRows(start, 'POST', '/api/album/' + target.id + '/add_photos').length, 0);
      const originals = JSON.stringify(store.state.receipts), before = JSON.stringify(store.state.media);
      failMembershipAction = 'add'; await albumDialog('photo');
      await page.waitForFunction(() => !document.querySelector('#batchAlbumBtn').disabled);
      assert.equal(JSON.stringify(store.state.media), before); assert.deepEqual(await selectedIDs('photo'), ids);
      assert.equal(httpRows(start, 'POST', '/api/album/' + target.id + '/add_photos')[0].status, 409);
      await albumDialog('photo'); await page.waitForFunction(() => !SelectionState.isSelectMode);
      assert.deepEqual(await selectedIDs('photo'), []); assert.equal(await page.locator('#selectedCount').innerText(), '0');
      const requests = httpRows(start, 'POST', '/api/album/' + target.id + '/add_photos'); assert.equal(requests.length, 2);
      requests.forEach(r => assert.deepEqual(r.body.photoIds, ids)); assert.deepEqual(requests[1].response.results.map(r => r.photoId), ids);
      assert.equal(JSON.stringify(store.state.receipts), originals);
      const targetIDs = await readAlbum(target.id); assert.deepEqual(targetIDs, ['800000000101', '800000000102', '800000000104']);
      return {mode: 'photo', action: 'add-to-album', requested: ids, cancelledRequestCount: 0,
        failed: ids, retryRequest: requests[1].body.photoIds, succeeded: requests[1].response.results.map(r => r.photoId),
        targetReadback: targetIDs, sourceReadback: await readAlbum(source.id), selectionAfter: 0, originalsUnchanged: true,
        partialBranch: 'N/A for this local membership endpoint: one SQLite transaction, injected failure before commit; no partial batch acknowledgment.'};
    });
    await record('S08-moment-move-membership-add-before-remove-failure-retry-readback', async () => {
      const ids = await selectMode('moment'), start = ledger.length, originals = JSON.stringify(store.state.receipts);
      failMembershipAction = 'remove'; await albumDialog('moment');
      await page.waitForFunction(() => !document.querySelector('#momentMoveAlbumBtn').disabled);
      assert.deepEqual((await selectedIDs('moment')).sort(), ids.slice().sort());
      assert.deepEqual(await readAlbum(source.id), ['800000000101', '800000000102', '800000000103']);
      assert.deepEqual(await readAlbum(target.id), ['800000000101', '800000000102', '800000000104']);
      await albumDialog('moment'); await page.waitForFunction(() => !MomentSelectionState.isSelectMode && TimelineState.photos.length === 1);
      const mutations = ledger.slice(start).filter(r => r.method === 'POST' && /\/(add|remove)_photos$/.test(r.route));
      assert.deepEqual(mutations.map(r => r.status), [200, 409, 200, 200]);
      assert.deepEqual(mutations.map(r => r.route), ['/api/album/' + target.id + '/add_photos', '/api/album/' + source.id + '/remove_photos',
        '/api/album/' + target.id + '/add_photos', '/api/album/' + source.id + '/remove_photos']);
      mutations.forEach(r => assert.deepEqual(r.body.photoIds, ids));
      assert.equal(JSON.stringify(store.state.receipts), originals); await page.reload(); await page.waitForFunction(() => !TimelineState.isLoading && TimelineState.photos.length === 1);
      return {mode: 'moment', action: 'move-to-album', requested: ids, removeFailed: ids, retryRequest: ids,
        statuses: mutations.map(r => r.status), succeeded: mutations.at(-1).response.results.map(r => r.photoId),
        sourceReadbackAfterReload: await readAlbum(source.id), targetReadback: await readAlbum(target.id), selectedMomentCount: await page.locator('#selectedMomentCount').innerText(),
        originalsUnchanged: true, partialBranch: 'Each add/remove batch is atomic; two-phase failure preserves source membership until exact successful removal.'};
    });
    await record('S02-A-genuinely-empty-owned-album-current-handler', async () => {
      const empty = store.album(A.id, 'Empty Synthetic', '2020-01-01'); await goto('timeline.html');
      await page.locator('#hamburgerBtn').click(); await page.locator('.sidebar-album-card').filter({hasText: 'Empty Synthetic'}).click();
      await page.waitForFunction(() => !TimelineState.isLoading && TimelineState.photos.length === 0); await page.locator('#emptyState').waitFor();
      assert.deepEqual(await readAlbum(empty.id), []); assert.equal(await page.locator('.moment-item').count(), 0);
      return {album: empty.id, ids: [], visibleEmptyState: await page.locator('#emptyState').innerText(), exactHTTPListTotal: 0};
    });
    report.actor = A.id; report.albums = {source: source.id, target: target.id, restored: archived.id};
    assert.equal(JSON.stringify({album: store.state.albums[foreign.id], media: store.state.media['800000000106']}), foreignBefore);
    report.foreignSyntheticRowsUnchanged = true; report.syntheticImageSizeReads = fakeImageReads;
    report.limitations.push('No provider metadata/date/delete UI mutation here; main core28 is referenced only, never rerun or promoted to UI credit.',
      'Video is metadata-labelled only, with synthetic PNG body; no video playback/download claim.',
      'No screenshots/visual score; Euclid owns separate capture. No native picker/IME/device/background/wire-progress/provider/live claims.',
      'Backend birthday validation is calendar-only; future-date rejection here is the frontend contract, not asserted as a backend rule.',
      'Both-mode tags/date/delete/download matrices and empty-account settings page remain unverified. Membership credit is bounded to each separate recorded entry/action.',
      'Fixture synthetic completed receipts originate from setup, not a browser upload or provider completion. No held ACK is used.');
    report.runtimeErrors = errors; assert.deepEqual(errors, []);
    report.status = 'PASS_CURRENT_ACCOUNT_BROWSER_HTTP_SQLITE_BOUNDED';
  } catch (e) { if (!report.failures.length) report.failures.push({id: activeCase, error: e.stack}); process.exitCode = 1; }
  finally {
    if (browser) await browser.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    store?.close(); write(path.join(out, 'http-ledger.json'), ledger); write(path.join(out, 'browser-ledger.json'), browserLedger);
    write(path.join(out, 'synthetic-provider-ledger.json'), providerLedger);
    write(path.join(out, 'report.json'), report); console.log(JSON.stringify({status: report.status, checks: report.checks.length, failures: report.failures,
      realProviderRequests: 0, sourceVersion: report.sourceVersion, output: out}));
  }
}
if (process.argv.includes('--ssd-run')) child().catch(e => { console.error(e.stack); process.exitCode = 1; }); else parent();
