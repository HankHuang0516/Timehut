# Timehut Mobile UI Fix & Background Deletion Implementation Plan

## 1. Mobile UI Fix for Selection Bar ("相簿多選功能")

### Problem
The selection bar (Move/Delete/etc.) is covered by the header on mobile devices, or otherwise hidden.

### Solution
We will adjust the CSS for `.selection-bar` to be mobile-responsive. Instead of fixing it to the top (where the expanded mobile header might cover it), we will dock it to the bottom of the screen on mobile devices. This is a common and user-friendly pattern for mobile action bars.

**File**: `css/style.css`

**Changes**:
1.  Add a media query for `max-width: 768px`.
2.  Target `.selection-bar` and `.moment-selection-bar`.
3.  Change position from `top: ...` to `top: auto` and `bottom: 0`.
4.  Adjust height to `auto` and add padding to accommodate wrapped buttons.
5.  Ensure `z-index` is high enough to sit above other floating elements but below modals.

```css
@media (max-width: 768px) {
    /* Fix: Move selection bar to bottom on mobile to avoid header overlap */
    .selection-bar,
    .moment-selection-bar {
        top: auto;
        bottom: 0;
        height: auto;
        min-height: 60px;
        flex-wrap: wrap;
        padding: 10px;
        justify-content: center;
        gap: 10px;
        animation: slideUpBottom 0.3s ease;
    }

    /* Adjust button sizes for mobile touch targets */
    .selection-actions {
        width: 100%;
        justify-content: space-around;
        flex-wrap: wrap;
    }

    .selection-actions button {
        flex: 1;
        min-width: 80px;
        padding: 8px 4px;
        font-size: 0.85rem;
    }
}
```

## 2. Background Execution for Deletion Functions

### Problem
Currently, deletion operations block the UI and only show a simple alert or toast. The user wants them to execute in the background with a status bar at the top, similar to the upload function.

### Solution
We will implement a `BackgroundActionManager` (or extend the existing `BackgroundUploader` logic) to handle generic background tasks including deletion.

**File**: `js/uploader.js`

**Changes**:
1.  Refactor `BackgroundUploader` or create a new `BackgroundWorker` that reuses the global status bar elements (`globalUploadBar`, `globalProgressBar`).
2.  Add a method `startDeleteTask(photoIds)` that:
    *   Display the global status bar.
    *   Splits the list of photo IDs into small chunks (e.g., 5-10 photos per request) to allow progress tracking and prevent server timeouts.
    *   Process chunks sequentially in the background.
    *   Updates the progress bar (e.g., "Deleting 5/20...").
    *   On completion, refreshes the UI or notifies the user.

**File**: `js/timeline.js`

**Changes**:
1.  Modify `deleteSelectedPhotos` (and any other delete functions like single photo delete).
2.  Remove the blocking `await fetch(...)` logic.
3.  Instead, hand off the photo IDs to `BackgroundWorker.startDeleteTask(ids)`.
4.  Immediately clear the UI selection state and hide the selection bar, telling the user "Deletion started in background".

### Implementation Specs

#### `js/uploader.js` - New Logic

```javascript
const BackgroundWorker = {
    // Reuse existing UI elements from BackgroundUploader
    init() { /* ... */ },
    
    async startDelete(photoIds) {
        if (this.isBusy) return;
        this.isBusy = true;
        this.showBar();
        
        const total = photoIds.length;
        let processed = 0;
        const chunkSize = 5;
        
        // Split into chunks
        for (let i = 0; i < total; i += chunkSize) {
            const chunk = photoIds.slice(i, i + chunkSize);
            
            this.updateStatus(`正在刪除... (${processed}/${total})`);
            this.updateProgress((processed / total) * 100);
            
            try {
                // Call Delete API
                await fetch(`${CONFIG.UPLOAD_API_URL}/api/photos/delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ photoIds: chunk })
                });
                processed += chunk.length;
            } catch (e) {
                console.error("Delete chunk failed", e);
                // Continue or abort? Usually better to try continuing or mark as failed
            }
        }
        
        this.updateStatus('刪除完成');
        this.updateProgress(100);
        setTimeout(() => {
            this.hideBar();
            location.reload(); // Refresh to show changes
        }, 1000);
        this.isBusy = false;
    },
    
    // ... helpers for UI updates
};
```

#### `js/timeline.js` - Update Delete Logic

```javascript
async function deleteSelectedPhotos() {
    const ids = Array.from(SelectionState.selectedPhotos);
    if (ids.length === 0) return;
    
    if (confirm(`確定要背景刪除 ${ids.length} 張照片嗎？`)) {
        // Handover to background worker
        BackgroundWorker.startDelete(ids);
        
        // Clear UI immediately
        SelectionState.selectedPhotos.clear();
        toggleSelectMode();
        showToast('已開始在背景刪除', 'info');
    }
}
```

This ensures all delete operations are non-blocking and provide excellent feedback via the top status bar.
