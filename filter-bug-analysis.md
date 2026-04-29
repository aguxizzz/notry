# Filter Bug Analysis - Lotes/Loteos/Prospectos Tables

## Bug Description
When a filter is applied on the lotes table:
1. Filter is activated and fetch is sent
2. Table refreshes but filter disappears
3. After 1-2 more refreshes, the filter finally "sticks"

## Root Cause

**Race condition between debounced fetch and background polling with stale closures.**

The polling `useEffect` had `inventoryLoteos` in its dependency array:
```javascript
// BEFORE (buggy)
React.useEffect(() => {
  // ...
  const lotsInterval = setInterval(() => {
    fetchInventoryBg(inventorySearch, inventoryStatusFilter); // captures stale values!
  }, 15000);
  // ...
}, [token, view, inventoryLoteos]); // ← problem: recreation destroys intervals
```

Issues:
1. When `inventoryLoteos` changed, the effect re-ran, recreating all intervals
2. The new intervals captured filter values via closure at that moment
3. The debounced fetch's `AbortController` could be aborted when the effect re-ran
4. Background polling would overwrite filtered results with unfiltered data (captured in closure)

## The Fix

Use a single ref object with an empty-dependency effect to always access current values:

```javascript
// Store all filters in one ref object
const filtersRef = React.useRef({
  inventorySearch,
  inventoryStatusFilter,
  prospectosCategoryFilter,
  prospectosWithoutAdvisor,
  inventoryLoteos
});

// Sync ref with state after EVERY render (no dependency array)
React.useEffect(() => {
  filtersRef.current = {
    inventorySearch,
    inventoryStatusFilter,
    prospectosCategoryFilter,
    prospectosWithoutAdvisor,
    inventoryLoteos
  };
});

// Polling effect uses refs and does NOT depend on inventoryLoteos
React.useEffect(() => {
  // ...
  const lotsInterval = setInterval(() => {
    fetchInventoryBg(filtersRef.current.inventorySearch, filtersRef.current.inventoryStatusFilter);
  }, 15000);
  // ...
}, [token, view]); // ← removed inventoryLoteos
```

## Key Differences from Original Code

| Issue | Original | Fixed |
|-------|----------|-------|
| Filter access in intervals | Direct state (`inventorySearch`) | Via ref (`filtersRef.current.inventorySearch`) |
| Effect dependencies | `[token, view, inventoryLoteos]` | `[token, view]` |
| Filter sync | None (stale closures) | `useEffect` with empty deps runs after every render |

## Files Affected

- `apps/plataforma-web/src/App.jsx`
  - Background polling effect (around line 103)
  - Filter ref initialization (around line 70)

## Prevention

When using `setInterval` or `setTimeout` in effects:
- Always use refs to access current state values inside callbacks
- Be careful with dependency arrays that can cause interval recreation
- The empty-dependency `useEffect` pattern ensures ref is always in sync
