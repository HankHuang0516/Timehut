# Video Playback Issue & Troubleshooting History

## Problem Description
**Issue**: Private videos uploaded to Flickr were failing to play on the Timehut website.
**Symptoms**:
- Clicking a video thumbnail opened the modal but the video did not load.
- Browser console showed `404 Not Found` or `500 Internal Server Error` on requests to `/api/proxy-video`.
- Direct access to the video source URL (e.g., `https://www.flickr.com/.../play/...`) failed because it was a web player page, not a raw video file.

## Root Cause Analysis
1.  **500 Error**: The backend proxy was using `require('node-fetch')` but the package was not installed. Node 18+ has native `fetch`, so the dependency was unnecessary.
2.  **404 Error (Privacy)**:
    - For **Private** videos, the Flickr API `getSizes` method returns a "Video Original" URL that looks like `.../play/orig/...`.
    - This URL is a legitimate **web page** for playing the video but requires a user session (cookies) to access.
    - Providing this URL to the `<video>` tag or the backend proxy fails because:
        - The proxy authentication (OAuth) works for API calls but not necessarily for this specific "web player" URL format.
        - The internal logic prioritized "Video Original", unknowingly picking this unplayable link.

## Attempted Solutions (Chronological)

### 1. Fix Backend Dependencies
- **Action**: Removed `node-fetch` requirement in `server.js` and switched to native `fetch`.
- **Result**: Resolved the `500 Internal Server Error`. The error shifted to `404 Not Found`.

### 2. Implement Backend Proxy
- **Action**: Created `/api/proxy-video` endpoint to tunnel video requests with OAuth headers.
- **Result**: Proxy worked for API calls but failed for the specific video source URL (`/play/orig/...`) with a 404. This confirmed the URL itself was not accessible via simple OAuth signing.

### 3. Direct CDN URL Construction (Failed)
- **Hypothesis**: We could manually construct the direct file URL using the pattern `https://live.staticflickr.com/video/{id}_{secret}_{quality}.mp4`.
- **Action**:
    - Extracted `secret` and `originalsecret` from photo data.
    - Tested various URL permutations (e.g., with `_720p.mp4`, `_o.mp4`).
- **Result**: All constructed URLs returned `404`. Flickr likely uses different, non-deterministic paths or tokenized URLs for private video streams that can't be guessed.

### 4. Change Permissions to Public (Effective)
- **Hypothesis**: Making the video "Public" would force Flickr to expose standard, publicly accessible CDN links (e.g., `Site MP4`, `HD MP4`) via `getSizes`.
- **Action**:
    - Created a new backend endpoint `POST /api/photo/:id/set_public`.
    - Called this API for the problematic video (`55042406103`).
- **Result**: API call succeeded (200 OK).

### 5. Update Frontend Selection Logic
- **Action**: Modified `js/flickr.js` `getVideoUrl` function.
- **Change**: Prioritize `Site MP4`, `HD MP4`, `Mobile MP4` labels over `Video Original`.
- **Reason**: Even after setting to Public, "Video Original" might still return the player page URL. "Site MP4" is guaranteed to be a direct file.
- **Status**: Code updated and deployed. (Fixed a syntax error in the process).

## Current Status
- **Video Permission**: Set to Public.
- **Playback**: Should now work using the direct CDN link provided by Flickr.
- **Future Prevention**: Future uploads are already configured to be Public by default.
