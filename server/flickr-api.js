const crypto = require('node:crypto');
const endpoint = 'https://api.flickr.com/services/rest/';
const encode = value => encodeURIComponent(String(value)).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());

async function flickrRequest(method, values, credentials, verb = 'POST', request = fetch) {
    const params = { method, ...values, api_key: credentials.key, format: 'json', nojsoncallback: '1',
        oauth_consumer_key: credentials.key, oauth_token: credentials.token,
        oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(Math.floor(Date.now() / 1000)),
        oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_version: '1.0' };
    const normalized = Object.keys(params).sort().map(key => `${encode(key)}=${encode(params[key])}`).join('&');
    const base = [verb, endpoint, normalized].map(encode).join('&');
    params.oauth_signature = crypto.createHmac('sha1', `${encode(credentials.secret)}&${encode(credentials.tokenSecret)}`).update(base).digest('base64');
    const body = new URLSearchParams(params);
    const response = await request(verb === 'GET' ? `${endpoint}?${body}` : endpoint, {
        method: verb, ...(verb === 'POST' ? { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body } : {}),
        signal: AbortSignal.timeout(30000)
    });
    const data = await response.json();
    if (!response.ok || data.stat !== 'ok') {
        const error = new Error(data.message || `Flickr request failed (${response.status})`);
        error.code = Number(data.code); throw error;
    }
    return data;
}
module.exports = { flickrRequest };
