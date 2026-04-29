# Plan: Blueprint Viewer for Visor + Fix for Web Platform

## Context

The visor app currently has no blueprint support (only panorama/360 view). The editor app has a full dual-mode system (panorama ↔ blueprint) using normalized 0-1 coordinates. The plataforma-web has a `BlueprintHeatmap` component that is **broken** — it uses `blueprint_coordinates` directly as SVG pixel coordinates, but the backend stores normalized 0-1 values, so polygons render at the wrong scale (e.g., `0.68` maps to pixel `0.68` instead of 68% of image width).

Goal: Add blueprint toggle to visor (for testing), then fix/replace BlueprintHeatmap in plataforma-web.

---

## Data Format

Backend (`server_response.json`) returns:
- `blueprintUrl`: image URL
- `annotations[].blueprint_coordinates`: normalized `[[0.68, 0.26], ...]` (0-1 range)
- `annotations[].panorama_coordinates`: normalized `[[1017, 4831], ...]` (pixel coords on panorama image)
- `annotations[].status`: `"available" | "sold" | "reserved"`

---

## Step 1: Create `BlueprintViewer` component in Visor

**File:** `/apps/visor/src/components/BlueprintViewer.jsx`

A read-only blueprint renderer (no editing tools). Based on `BlueprintEditor` architecture but stripped of editing.

**Props:**
```js
{
  blueprintUrl: string,
  annotations: Annotation[],   // filtered to type: 'polygon' with blueprint_coordinates
  selectedId: string | null,
  onMarkerSelect: (annotation) => void,
  onMarkerHover: (annotation | null) => void,
}
```

**Features:**
- Zoom (scroll wheel, 0.5x–5x) and pan (middle-mouse drag)
- Renders polygons from `blueprint_coordinates` (normalized 0-1) → SVG coords via `x * displayW, y * displayH`
- Color-coded by `status`: green (available), red (sold), blue (reserved)
- Hover highlights polygon (opacity 0.8 → 1.0, stroke-width increases)
- Click calls `onMarkerSelect(annotation)` → triggers InfoPanel via App.jsx state
- Same coordinate math pattern as `BlueprintEditor`

**Coordinate formula:**
```js
const normToSvg = (nx, ny) => ({ x: nx * dw, y: ny * dh });
// where dw/dh = image's display size at zoom=1
```

---

## Step 2: Add blueprint toggle to Visor `App.jsx`

**File:** `/apps/visor/src/App.jsx`

**Changes:**

1. Add `blueprintUrl` state (from `rawData.blueprintUrl`)
2. Add `viewMode` state (`'panorama'` | `'blueprint'`)
3. Add toggle button (fixed position, top-right):
   - Shows `📷` for panorama, `<grid>` icon for blueprint
   - Blueprint button only rendered if `blueprintUrl` exists
4. Conditional render:
   ```jsx
   viewMode === 'blueprint'
     ? <BlueprintViewer blueprintUrl={blueprintUrl} annotations={filteredAnnotations} ... />
     : <div id="viewer-container" ref={viewerRef} />
   ```
5. When `onMarkerSelect` fires from BlueprintViewer, call same `handleMarkerSelect` already used by panorama markers

**Annotation filtering for blueprint view:**
```js
const blueprintAnnotations = annotations.filter(
  a => a.type === 'polygon' && a.blueprint_coordinates?.length >= 3
);
```

---

## Step 3: Fix `BlueprintHeatmap` in plataforma-web

**File:** `/apps/plataforma-web/src/components/BlueprintHeatmap.jsx`

**Bug:** `blueprint_coordinates` are normalized 0-1 values, but SVG `viewBox` uses pixel dimensions. `polygon points="0.68,0.26"` renders at pixel position 0.68 instead of 68% across.

**Fix:** Multiply normalized coords by image dimensions inside the component.

**Changes:**
1. Remove `imageDims` state (it was measuring the loaded image, which is correct for aspect ratio but coords need scaling)
2. The SVG `viewBox` remains `{w} {h}` (image natural dimensions)
3. When rendering polygons, scale coords: `x * imageDims.w, y * imageDims.h`
4. Keep the heatmap color logic (`getHeatColor`) for analytics use case

**After fix, `BlueprintHeatmap` and `BlueprintViewer` will share the same coordinate logic** — the main difference is:
- `BlueprintViewer`: solid colors by status, click-to-select, hover highlight
- `BlueprintHeatmap`: heat colors by click density, hover tooltip

---

## Step 4: Verify data flow in plataforma-web

**File:** `/apps/plataforma-web/src/components/AnalisisView.jsx`

Check how `BlueprintHeatmap` is called and ensure the fix will work:

```jsx
<BlueprintHeatmap
  blueprintUrl={visorData?.blueprintUrl}
  annotations={polygonAnnotations}  // pre-filtered in AnalisisView
  clicksData={clicksData}
  missingCoordinatesCount={missingCoordinatesCount}
/>
```

The `annotations` passed are already filtered to `type === 'polygon'` with `blueprint_coordinates`. The fix scales coordinates internally — no changes needed in AnalisisView.

---

## Verification Plan

### Visor (new blueprint toggle)
1. Start visor dev server: `cd visor && npm run dev`
2. Open visor with `?data=<url>` pointing to a server response that has `blueprintUrl`
3. Confirm no toggle button appears when `blueprintUrl` is absent
4. Confirm toggle button appears when `blueprintUrl` is present
5. Click toggle → blueprint renders with polygons colored by status
6. Click a polygon → InfoPanel opens with correct lot info

### Plataforma-web (heatmap fix)
1. Start plataforma-web dev server: `cd plataforma-web && npm run dev`
2. Navigate to analisis page, select a loteo
3. Open browser DevTools → Network, filter for the blueprint image
4. Verify polygons overlay the blueprint correctly (align with image features)
5. Hover a polygon → tooltip shows correct lot name and click count

---

## Files to Modify

| File | Action |
|------|--------|
| `visor/src/components/BlueprintViewer.jsx` | **Create** — new read-only blueprint renderer |
| `visor/src/App.jsx` | Modify — add `viewMode` state, toggle button, conditional render |
| `plataforma-web/src/components/BlueprintHeatmap.jsx` | Modify — fix coordinate scaling bug |
