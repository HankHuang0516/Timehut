require('dotenv').config({ path: '../server/.env' });
const https = require('https');
const crypto = require('crypto');

// Check args
const title = process.argv[2];
const primaryPhotoId = process.argv[3];

if (!title || !primaryPhotoId) {
    console.error('Usage: node create_flickr_album.js <Title> <PrimaryPhotoID>');
    process.exit(1);
}

const oauthTokens = {
    accessToken: process.env.FLICKR_OAUTH_TOKEN,
    accessTokenSecret: process.env.FLICKR_OAUTH_TOKEN_SECRET
};

if (!oauthTokens.accessToken) {
    console.error('Error: FLICKR_OAUTH_TOKEN not found in env');
    process.exit(1);
}

function buildBaseString(method, url, params) {
    const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');

    return `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
}

async function createAlbum(title, primaryPhotoId) {
    return new Promise((resolve, reject) => {
        const url = 'https://api.flickr.com/services/rest/';
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = Math.random().toString(36).substring(2);

        const params = {
            method: 'flickr.photosets.create',
            api_key: process.env.FLICKR_API_KEY,
            title: title,
            primary_photo_id: primaryPhotoId,
            format: 'json',
            nojsoncallback: '1',
            oauth_consumer_key: process.env.FLICKR_API_KEY,
            oauth_token: oauthTokens.accessToken,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_nonce: nonce,
            oauth_version: '1.0'
        };

        // Signature
        const baseString = buildBaseString('POST', url, params); // create is POST usually? Checked docs: it says "POST recommended"
        const signingKey = `${encodeURIComponent(process.env.FLICKR_API_SECRET)}&${encodeURIComponent(oauthTokens.accessTokenSecret)}`;
        const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
        params.oauth_signature = signature;

        // Build FormData (URL encoded for photosets.create)
        const postData = Object.keys(params)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');

        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.stat === 'ok') {
                        resolve(json.photoset);
                    } else {
                        reject(new Error(json.message));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

createAlbum(title, primaryPhotoId)
    .then(photoset => {
        console.log(`Successfully created album "${photoset.title._content}"`);
        console.log(`Album ID: ${photoset.id}`);
    })
    .catch(err => {
        console.error('Failed to create album:', err.message);
        process.exit(1);
    });
