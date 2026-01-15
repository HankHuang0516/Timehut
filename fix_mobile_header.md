# Mobile Header Overlap Fix Plan

## Problem
The mobile header (Logo + Search Bar) has a height of ~120px, but the content top margin is only ~108px, causing the header to overlap the content.

## Fix Instructions

**Target File**: `css/style.css`

1.  Open `css/style.css`.
2.  Search for `@media (max-width: 768px)` to find the mobile styles.
3.  Locate the `.main-content` selector (around line 2654).
4.  Update the `margin-top` property:

```css
/* CURRENT (Buggy) */
.main-content {
    margin-top: calc(var(--header-height) + 44px);
}

/* FIXED */
.main-content {
    margin-top: calc(var(--header-height) + 76px); /* Increase buffer by 32px */
}
```

This change ensures the content starts below the search bar, fixing the visual overlap.
