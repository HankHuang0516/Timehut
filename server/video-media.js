const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { flickrRequest } = require('./flickr-api');

// Resolve a fresh authenticated stream for each request. Do not publish a video to make it playable.
function createVideoHandler(credentials, api = flickrRequest, request = fetch) {
    return async (req, res) => {
        let reader;
        const controller = new AbortController();
        let deadline;
        const disconnected = () => { if (!res.writableFinished) controller.abort(); };
        res.once('close', disconnected);
        try {
            const creds = credentials();
            if (!creds.token) return res.status(401).json({ error: '尚未授權 Flickr' });
            if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: '無效的影片 ID' });
            const purpose = req.query.purpose || 'playback';
            if (!['playback', 'original'].includes(purpose)) return res.status(400).json({ error: '無效的影片用途' });
            const info = await api('flickr.photos.getInfo', { photo_id: req.params.id }, creds, 'GET');
            if (info.photo?.media !== 'video') return res.status(400).json({ error: '這個媒體不是影片' });
            if (Number(info.photo.video?.ready) !== 1) return res.status(409).json({ error: 'Flickr 仍在處理影片，請稍後重試' });
            const data = await api('flickr.video.getStreamInfo', { photo_id: req.params.id, secret: info.photo.secret }, creds, 'GET');
            const streams = data.streams?.stream || [];
            const extension = stream => {
                try {
                    const url = new URL(stream._content);
                    if (url.protocol !== 'https:' || url.hostname !== 'live.staticflickr.com') return null;
                    return /\.(mp4|mov)$/i.exec(url.pathname)?.[1].toLowerCase() || null;
                } catch { return null; }
            };
            const original = streams.find(stream => stream.type === 'orig' && extension(stream));
            const playable = streams.filter(stream => /^\d+p$/.test(stream.type) && extension(stream) === 'mp4')
                .sort((a, b) => parseInt(b.type) - parseInt(a.type));
            // Original download must never silently substitute a transcoded rendition.
            const selected = purpose === 'original' ? original : playable[0] || (extension(original) === 'mp4' ? original : null);
            if (!selected) return res.status(502).json({ error: purpose === 'original' ? 'Flickr 未提供影片原檔' : 'Flickr 未提供可播放的 MP4' });
            const format = extension(selected);
            const expectedMime = format === 'mov' ? 'video/quicktime' : 'video/mp4';
            const range = req.headers.range;
            if (range && !/^bytes=\d+-\d*$/.test(range)) return res.status(416).end();
            deadline = setTimeout(() => controller.abort(), 30000);
            const upstream = await request(selected._content, { headers: range ? { Range: range } : {}, redirect: 'error', signal: controller.signal });
            clearTimeout(deadline); // Bound connection setup, not the duration of a large background download.
            if (![200, 206].includes(upstream.status)) {
                await upstream.body?.cancel();
                return res.status(502).json({ error: 'Flickr 影片串流暫時無法讀取' });
            }
            const lengthHeader = upstream.headers.get('content-length');
            const declaredLength = lengthHeader === null ? null : Number(lengthHeader);
            if (declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength <= 0)) throw new Error('影片長度無效');
            let expectedLength = declaredLength;
            let wholeLength = declaredLength;
            if (upstream.status === 206) {
                const received = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(upstream.headers.get('content-range') || '');
                const requested = range && /^bytes=(\d+)-(\d*)$/.exec(range);
                if (!requested || !received) throw new Error('未取得完整影片或有效範圍');
                const start = Number(received[1]), end = Number(received[2]), total = Number(received[3]);
                const requestStart = Number(requested[1]), requestEnd = requested[2] ? Number(requested[2]) : null;
                if (![start, end, total, requestStart].every(Number.isSafeInteger) || start !== requestStart || end < start || end >= total ||
                    (requestEnd !== null && (!Number.isSafeInteger(requestEnd) || requestEnd < requestStart || end > requestEnd))) {
                    throw new Error('Flickr 影片範圍不符合請求');
                }
                expectedLength = end - start + 1;
                wholeLength = total;
                if (declaredLength !== null && declaredLength !== expectedLength) throw new Error('影片範圍與長度不一致');
            }
            const mime = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
            const opaqueOriginal = purpose === 'original' && ['application/octet-stream', 'binary/octet-stream'].includes(mime);
            if ((mime !== expectedMime && !opaqueOriginal) || !upstream.body) {
                await upstream.body?.cancel();
                return res.status(502).json({ error: 'Flickr 回傳的影片格式不符合原檔，未開始傳送' });
            }
            reader = upstream.body.getReader();
            let first = Buffer.alloc(0);
            const prefixLength = upstream.status === 206 ? Math.min(12, expectedLength) : 12;
            while (first.length < prefixLength) {
                const part = await reader.read();
                if (part.done) throw new Error('Flickr 影片檔不完整');
                first = Buffer.concat([first, Buffer.from(part.value)]);
            }
            if (expectedLength !== null && first.length > expectedLength) throw new Error('影片內容超過宣告長度');
            const startsAtZero = upstream.status === 200 || !range || /^bytes=0-/.test(range);
            let firstAtomSize = 0;
            if (startsAtZero && first.length >= 8) {
                const box = first.subarray(4, 8).toString();
                const allowed = format === 'mov' ? ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'] : ['ftyp'];
                if (!allowed.includes(box)) throw new Error('Flickr 影片容器不正確');
                if (format === 'mov') {
                    const size32 = first.readUInt32BE(0);
                    let headerSize = 8;
                    firstAtomSize = size32;
                    if (size32 === 1) {
                        headerSize = 16;
                        if (expectedLength !== null && expectedLength < headerSize) throw new Error('影片範圍未包含完整容器標頭');
                        while (first.length < headerSize) {
                            const part = await reader.read();
                            if (part.done) throw new Error('影片延伸標頭不完整');
                            first = Buffer.concat([first, Buffer.from(part.value)]);
                        }
                        const extended = first.readBigUInt64BE(8);
                        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('影片容器長度無效');
                        firstAtomSize = Number(extended);
                    } else if (size32 === 0) firstAtomSize = wholeLength === null ? headerSize : wholeLength;
                    if (firstAtomSize < headerSize || (wholeLength !== null && firstAtomSize > wholeLength)) throw new Error('影片容器長度超出原檔');
                    if (expectedLength !== null && first.length > expectedLength) throw new Error('影片內容超過宣告長度');
                }
            } else if (startsAtZero && format === 'mov') {
                throw new Error('影片範圍未包含完整容器標頭');
            }
            res.status(upstream.status);
            for (const name of ['content-length', 'content-range', 'accept-ranges']) {
                const value = upstream.headers.get(name); if (value) res.setHeader(name, value);
            }
            res.setHeader('Content-Type', expectedMime);
            res.setHeader('Cache-Control', 'private, no-store');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            if (purpose === 'original') res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.${format}"`);
            if (req.method === 'HEAD') { await reader.cancel(); return res.end(); }
            const body = async function* () {
                let bytes = first.length; yield first;
                while (true) {
                    const part = await reader.read(); if (part.done) break;
                    bytes += part.value.byteLength;
                    if (expectedLength !== null && bytes > expectedLength) throw new Error('影片內容超過宣告長度');
                    yield Buffer.from(part.value);
                }
                if (Number.isFinite(expectedLength) && expectedLength > 0 && bytes !== expectedLength) throw new Error('Flickr 影片長度與傳輸內容不一致');
                if (upstream.status === 200 && firstAtomSize > bytes) throw new Error('影片容器超出實際傳輸內容');
            };
            await pipeline(Readable.from(body()), res);
        } catch (error) {
            if (!res.headersSent) res.status(502).json({ error: '影片暫時無法讀取，請稍後重試' });
            else res.destroy();
        } finally {
            clearTimeout(deadline);
            if (reader) { try { await reader.cancel(); } catch {} }
            controller.abort();
            res.removeListener('close', disconnected);
        }
    };
}

module.exports = { createVideoHandler };
