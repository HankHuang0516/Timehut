---
description: Automated Self-Verification of UI
---

# UI Self-Verification Protocol

Run this protocol before every deployment to ensure quality.

1. **Initial State Check**:
   - Open the timeline page.
   - // turbo
   - Verify that `#confirmModal` has the class `.hidden` and is effectively invisible.
   - Verify that `#batchViewModal` is hidden.

2. **Interaction Check**:
   - Toggle "Select Mode".
   - Select a photo.
   - Click "Delete Selected".
   - Verify `#confirmModal` becomes visible.
   - Click "Cancel".
   - Verify `#confirmModal` becomes hidden.

3. **Console Check**:
   - Check for any new errors in the console.
