# Video Playback Issue Investigation and Fix Plan

## 1. Issue Description & Cause Analysis
**User Report**: "Videos are redirected to Flickr website, triggering a strange behavior where the user must click once, return, and click again to see the play button."

**Investigation Findings**:
1.  **Current Implementation**: The frontend code in `album.html` (`openModal` function) explicitly handles video items by opening the Flickr photo page in a new window/tab (`window.open`). It bypasses the built-in modal player entirely.
    ```javascript
    // Current Code in album.html
    if (isVideo) {
        // ...
        window.open(flickrUrl, '_blank');
        return; // Don't show modal for videos
    }
    ```
2.  **Flickr Website Behavior**: The "double-click" or "visit-then-return" requirement is an external behavior of the Flickr mobile website, likely related to guest access, interstitial overlays, or session initialization when acting as a referrer.
3.  **Backend Capability**: The backend (`server.js`) implementation of `/api/photo/:id/sizes` already includes sophisticated logic to support direct video playback. It temporarily sets private videos to public (if needed) to fetch a playable `.mp4` URL ("Site MP4").
4.  **Frontend Capability**: The `album.html` modal already contains a `<video>` element ensuring a native playback experience is possible without redirection.

**Conclusion**: The issue is caused by the application delegating playback to the external Flickr website instead of using its own video player capabilities. The external Flickr site has poor UX for this flow.

## 2. Verification
- **Code Inspection**: Confirmed `album.html` contains the redirect logic.
- **Backend Inspection**: Confirmed `server.js` supports video URL proxying.
- **Frontend Library**: Confirmed `js/flickr.js` has `getVideoUrl()` ready to consume the backend proxy.

## 3. Implementation Plan

### Goal
Replace the external Flickr redirect with the built-in modal video player to keep the user in the app and provide a consistent, working playback experience.

### Changes

#### [MODIFY] [album.html](file:///c:/Hank/Other/project/Timehut/album.html)
-   **Function**: `openModal(index)`
-   **Changes**:
    -   Remove the `window.open` redirect block for videos.
    -   Implement logic to handle `isVideo` case within the modal:
        -   Show loading state.
        -   Call `FlickrAPI.getVideoUrl(photo)` to get the MP4 link.
        -   Set `videoEl.src` to the returned URL.
        -   Show `videoEl` and hide `imgEl`.
        -   Handle errors (fallback to opening Flickr if fetching fails).

### Verification Steps
1.  Open an album containing videos.
2.  Click on a video thumbnail.
3.  **Expected**: The modal should open *immediately* within the page (no new tab).
4.  **Expected**: The video should start playing (or show controls) without needing to return or reload.
5.  **Expected**: The "load" experience should be smooth (loading indicator while fetching the URL).
