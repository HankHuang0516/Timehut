/**
 * Flickr Album Setup Script
 * Use this script to authenticate with Flickr and create albums.
 */

require('dotenv').config({ path: '../server/.env' });
const { OAuth } = require('oauth');
const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const CONFIG_PATH = path.join(__dirname, '../js/config.js');

// Check keys
const API_KEY = process.env.FLICKR_API_KEY || '6c25e4db1b6b0b73a4404008ed63929c';
const API_SECRET = process.env.FLICKR_API_SECRET || '3be3bebab599c612';

if (!API_KEY || !API_SECRET) {
    console.error('Missing FLICKR_API_KEY or FLICKR_API_SECRET');
    process.exit(1);
}

const oauth = new OAuth(
    'https://www.flickr.com/services/oauth/request_token',
    'https://www.flickr.com/services/oauth/access_token',
    API_KEY,
    API_SECRET,
    '1.0A',
    null,
    'HMAC-SHA1'
);

// State
let oauthToken = '';
let oauthTokenSecret = '';
let accessToken = '';
let accessTokenSecret = '';

async function main() {
    console.log('=== Flickr Album Setup ===');

    try {
        // 1. Authenticate (if needed)
        await authenticate();

        // 2. Create Albums
        console.log('\nCreating albums...');
        const hamburgerId = await createAlbum('漢堡的相簿', '漢堡的照片', 'test_photo_1.png');
        const hanhanId = await createAlbum('涵涵的相簿', '涵涵的照片', 'test_photo_2.png');

        console.log('\nAlbum Creation Results:');
        console.log(`漢堡 Album ID: ${hamburgerId}`);
        console.log(`涵涵 Album ID: ${hanhanId}`);

        // 3. Update config
        updateConfig(hamburgerId, hanhanId);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        rl.close();
    }
}

function authenticate() {
    return new Promise((resolve, reject) => {
        oauth.getOAuthRequestToken({ oauth_callback: 'oob' }, (error, token, tokenSecret) => {
            if (error) return reject(error);

            oauthToken = token;
            oauthTokenSecret = tokenSecret;

            const authUrl = `https://www.flickr.com/services/oauth/authorize?oauth_token=${token}&perms=write`;

            console.log('\n--- AUTH URL ---');
            console.log(authUrl);
            console.log('--- AUTH URL ---');

            // Write to file for agent to read easily
            fs.writeFileSync('auth_url.txt', authUrl);

            rl.question('\nEnter the verification code: ', (verifier) => {
                oauth.getOAuthAccessToken(token, tokenSecret, verifier, (error, aToken, aSecret) => {
                    if (error) return reject(error);

                    accessToken = aToken;
                    accessTokenSecret = aSecret;
                    resolve();
                });
            });
        });
    });
}

function createAlbum(title, description, localPhotoPath) {
    console.log(`\nPreparing to create album "${title}"...`);

    // Check if local file exists
    const fullPath = path.join(__dirname, '..', localPhotoPath);

    return new Promise(async (resolve, reject) => {
        try {
            const photoId = await uploadPhoto(fullPath, title);
            console.log(`Primary photo uploaded. ID: ${photoId}`);

            const timestamp = Math.floor(Date.now() / 1000);
            const nonce = Math.random().toString(36).substring(2);

            const params = {
                method: 'flickr.photosets.create',
                api_key: API_KEY,
                title: title,
                description: description,
                primary_photo_id: photoId,
                format: 'json',
                nojsoncallback: 1,
                oauth_consumer_key: API_KEY,
                oauth_token: accessToken,
                oauth_signature_method: 'HMAC-SHA1',
                oauth_timestamp: timestamp,
                oauth_nonce: nonce,
                oauth_version: '1.0'
            };

            // Sign
            const crypto = require('crypto');
            const sortedParams = Object.keys(params).sort().map(k =>
                `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`
            ).join('&');
            const baseString = `POST&${encodeURIComponent('https://api.flickr.com/services/rest/')}&${encodeURIComponent(sortedParams)}`;
            const signingKey = `${encodeURIComponent(API_SECRET)}&${encodeURIComponent(accessTokenSecret)}`;
            const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

            params.oauth_signature = signature;

            // POST request
            const postData = new URLSearchParams(params).toString();
            const req = https.request('https://api.flickr.com/services/rest/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const json = JSON.parse(data);
                    if (json.stat === 'ok') {
                        resolve(json.photoset.id);
                    } else {
                        reject(new Error(json.message));
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();

        } catch (e) {
            reject(e);
        }
    });
}

function uploadPhoto(filePath, title) {
    return new Promise((resolve, reject) => {
        const FormData = require('form-data');
        const form = new FormData();

        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = Math.random().toString(36).substring(2);

        const oauthParams = {
            oauth_consumer_key: API_KEY,
            oauth_token: accessToken,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_nonce: nonce,
            oauth_version: '1.0'
        };

        const uploadParams = {
            title: title,
            is_public: 0,
            is_friend: 0,
            is_family: 1
        };

        const allParams = { ...oauthParams, ...uploadParams };

        const crypto = require('crypto');
        const sortedParams = Object.keys(allParams).sort().map(k =>
            `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`
        ).join('&');
        const baseString = `POST&${encodeURIComponent('https://up.flickr.com/services/upload/')}&${encodeURIComponent(sortedParams)}`;
        const signingKey = `${encodeURIComponent(API_SECRET)}&${encodeURIComponent(accessTokenSecret)}`;
        const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

        oauthParams.oauth_signature = signature;

        const authHeader = 'OAuth ' + Object.keys(oauthParams).map(k =>
            `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`
        ).join(', ');

        Object.entries(uploadParams).forEach(([k, v]) => form.append(k, v));
        if (fs.existsSync(filePath)) {
            form.append('photo', fs.createReadStream(filePath));
        } else {
            // Check test_photo_1.png or test_photo_2.png
            reject(new Error(`Photo file missing: ${filePath}. Please make sure test_photo_1.png and test_photo_2.png exist.`));
            return;
        }

        const req = https.request({
            hostname: 'up.flickr.com',
            path: '/services/upload/',
            method: 'POST',
            headers: { ...form.getHeaders(), 'Authorization': authHeader }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const photoIdMatch = data.match(/<photoid>(\d+)<\/photoid>/);
                if (photoIdMatch) resolve(photoIdMatch[1]);
                else reject(new Error('Upload failed: ' + data));
            });
        });

        req.on('error', reject);
        form.pipe(req);
    });
}

function updateConfig(id1, id2) {
    let content = fs.readFileSync(CONFIG_PATH, 'utf8');
    // Regex replace for robust matching
    // Replace first empty albumId (漢堡)
    content = content.replace(/(name:\s*'漢堡'[^}]*albumId:\s*)''/, `$1'${id1}'`);
    // Replace second empty albumId (涵涵)
    content = content.replace(/(name:\s*'涵涵'[^}]*albumId:\s*)''/, `$1'${id2}'`);

    fs.writeFileSync(CONFIG_PATH, content);
    console.log('Updated config.js with new Album IDs.');
}

if (require.main === module) {
    main();
}
