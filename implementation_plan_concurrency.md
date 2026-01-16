# Implementation Plan: Optimize Backend Upload Concurrency

**Problem**:
User reports that uploading a large number of photos (e.g., 90) "occupies backend resources" and suspects delays in the upload API. The current backend implementation processes the upload queue **sequentially** (one by one) with an artificial delay of 500ms between items. This causes a significant bottleneck and underutilizes available network/CPU resources.

**Goal**:
Enable the backend to multitasking by processing multiple background uploads concurrently, thereby speeding up the overall process and freeing up resources faster.

## Proposed Changes

### `server/server.js` [MODIFY]

Update `processUploadQueue` to support concurrent processing.

1.  **Concurrency Control**: Implement a worker pool to process multiple uploads in parallel (Limit: 3).
2.  **Reduce Delay**: Reduce the `await delay(500)` to `100ms` or minimal delay.
3.  **Refactor Loop**: Change the `for...of` sequential loop to a `while` loop that manages active promises.

#### logic Overview:
```javascript
const CONCURRENCY_LIMIT = 3;

async function processUploadQueue() {
    // ... checks ...
    isProcessingQueue = true;

    const executeItem = async (item) => {
        // ... (Existing upload logic) ...
        // Update status, upload to Flickr, delete local file
    };

    while (true) {
        // Dynamically read queue to get new items
        const pending = getPendingItems();
        const uploading = readQueue().filter(i => i.status === 'uploading');
        
        // Safety: If somehow we have too many uploading (restart?), count them
        let activeCount = uploading.length; 
        // Actually, we track our own active promises to avoid "zombie" status checks
        // But for simplicity in this script, we will just process 'pending' items until we hit limit.
        
        // We need an array to track active promises in this session
    }
}
```

**Refined Implementation Logic**:
```javascript
async function processUploadQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    
    // Track active promises
    const activePromises = new Set();
    
    try {
        while (true) {
            // Get fresh list
            const pendingItems = getPendingItems();
            
            // If nothing left and nothing running, we are done
            if (pendingItems.length === 0 && activePromises.size === 0) {
                break;
            }
            
            // Fill slots
            while (activePromises.size < 3 && pendingItems.length > 0) {
                const item = pendingItems.shift();
                
                // Mark start immediately to prevent re-fetching
                // (Note: updateQueueItem is synchronous)
                updateQueueItem(item.localId, { status: 'uploading', ... });
                
                // Create promise
                const promise = (async () => {
                    try {
                        await processSingleItem(item); // Refactor logic into function
                    } catch (e) {
                        console.error('Task error', e);
                    }
                })();
                
                // Add to set
                activePromises.add(promise);
                // Remove when done
                promise.then(() => activePromises.delete(promise));
            }
            
            // Wait for at least one to finish if we are full or empty
            if (activePromises.size > 0) {
                await Promise.race(activePromises);
            }
        }
    } finally {
        isProcessingQueue = false;
    }
}
```

## Verification Plan
1.  **Code Check**: Verify `server/server.js` contains the new concurrency logic.
2.  **Manual Test**: Queue 5-10 uploads.
3.  **Observation**: Check console logs to see interleaved "Attempt 1..." messages, indicating parallel execution.
