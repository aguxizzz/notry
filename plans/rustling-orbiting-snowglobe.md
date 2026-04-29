# Plan: Refactor Blueprint Overlay → Blueprint-as-Polygon

## Context

The current blueprint overlay system in `EditorViewer.jsx` uses a separate canvas-based `QuadImageWarper` + SVG `WarpedPolygons` + `OverlayCorners` pipeline. This creates:
- **Dual coordinate systems** (`blueprint_coordinates` and `panorama_coordinates`) with separate rendering paths
- **~300 lines of overlay-specific code** (`BlueprintOverlay`, `QuadImageWarper`, `WarpedPolygons`, `OverlayCorners`, `BlueprintCropModal`)
- **Non-interactive lot polygons in panorama mode** — `blueprintOverlayAnnotations` are passed to `EditorViewer` but only rendered in `BlueprintOverlay` (a `pointerEvents: none` SVG layer); they never become interactive PSV markers
- **Wrong geometry for 360°** — bilinear quad warping projects a flat image onto the sphere incorrectly

The fix: make the blueprint a **first-class polygon annotation** with the blueprint image as its fill. It follows the same rendering pipeline as all other polygons.

---

## What Changes

### Core Idea
- The blueprint becomes a `polygon` annotation with `isBlueprint: true` and `blueprintImageUrl` 
- In **BlueprintEditor**: polygon rendered with SVG `<pattern>` fill (image inside the shape)
- In **Panorama mode**: polygon passed to PSV MarkersPlugin with `svgStyle.fill` set to the image URL — the PSV marker's polygon renders with that fill on the sphere
- Lot polygons are **interactive PSV markers** in both modes (not just a static overlay)
- `cropRegion`, `overlayCorners`, `BlueprintCropModal`, `QuadImageWarper`, `WarpedPolygons`, `OverlayCorners` — all eliminated

---

## File-by-File Changes

### 1. `utils/annotations.js`

**Modify polygon case in `annotationsToMarkers()`** to handle blueprint image fill:

```js
case 'polygon': {
  const points = (ann.polygonPixels ?? ann.polygon ?? []).filter(
    pt => Array.isArray(pt) && pt.length === 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number'
  );
  const estadoStyles = { ... };
  let svgStyle = ann.estado && estadoStyles[ann.estado]
    ? estadoStyles[ann.estado]
    : (ann.svgStyle ?? {});

  // Blueprint polygon: use image URL as fill
  if (ann.isBlueprint && ann.blueprintImageUrl) {
    svgStyle = {
      ...svgStyle,
      fill: `url(${ann.blueprintImageUrl})`,
      fillOpacity: ann.fillOpacity ?? 0.4,
    };
  }

  return { ...base, svgStyle, polygonPixels: points };
}
```

The existing `annotations` → PSV markers pipeline now handles the blueprint polygon without any other changes.

### 2. `components/BlueprintEditor.jsx`

**Add SVG `<defs>` + `<pattern>`** for blueprint image fill. Find the polygon with `isBlueprint: true` and use:

```jsx
<defs>
  <pattern id="blueprint-pattern" patternUnits="objectBoundingBox" width="1" height="1">
    <image href={ann.blueprintImageUrl} preserveAspectRatio="none" width="100%" height="100%" />
  </pattern>
</defs>
```

**Blueprint polygon rendering** (first, below other polygons so it's the background layer):

```jsx
{ann.isBlueprint && (
  <polygon
    points={polyStr}
    fill="url(#blueprint-pattern)"
    stroke="rgba(255,255,255,0.3)"
    strokeWidth={1}
    data-type="polygon"
    data-marker-id={ann.id}
  />
)}
```

**Other lot polygons** render on top with their semi-transparent fills (existing code).

**Blueprint polygon's corner dragging** already works via existing `handlePointerDown` on `data-type="corner"` — it updates `polygonPixels` which IS the `blueprint_coordinates`.

### 3. `components/EditorViewer.jsx`

**Remove** (~300 lines):
- `BlueprintOverlay` component (lines ~481-763)
- `quadCorners` state (line 18)
- `blueprintImgDims` state (line 16)
- `confirmCropRef` useEffect (lines ~30-44)
- `initialQuadCorners` useEffect (lines ~399-437)
- `blueprintImgDims` loading effect (lines ~387-397)
- `computeContainRect` (lines ~456-473)
- `ESTADO_STYLES` (lines ~475-479) — moved to `annotations.js`
- `BlueprintOverlay` conditional render (lines ~442-451)

**Simplify function signature** — remove `cropRegion`, `onBlueprintConfirm`, `confirmCropRef`, `initialQuadCorners`.

**Key change**: `displayAnnotations` (passed to `setMarkers`) now includes `blueprintAnnotations` via the `annotations` prop from App.jsx. The blueprint polygon is rendered as a standard PSV polygon marker with the image fill. Lot polygons are fully interactive PSV markers.

### 4. `App.jsx`

**Remove state**:
- `cropRegion` / `setCropRegion`
- `isCropModalOpen` / `setIsCropModalOpen`
- `overlayCorners` / `setOverlayCorners`
- `confirmCropRef`

**Remove functions**:
- `handleBlueprintConfirm`
- All `BlueprintCropModal` related code

**Remove imports**:
- `BlueprintCropModal`

**Simplify toolbar**: Remove Scissors and Check buttons. The blueprint polygon is always editable when visible.

**Blueprint polygon creation**: When `showBlueprintOverlay` is toggled ON and no blueprint polygon exists, create one with 4 vertices at the contain-rect bounds (using `computeContainRect` logic). Set:
- `isBlueprint: true`
- `blueprintImageUrl: blueprintUrl`
- `blueprint_coordinates: [[0,0], [1,0], [1,1], [0,1]]` (full image quad)
- `svgStyle: { fillOpacity: 0.35, stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }`

**Prop changes to EditorViewer**: Remove `cropRegion`, `initialQuadCorners`, `onBlueprintConfirm`, `confirmCropRef`.

**`handlePolygonUpdate`**: Already correctly updates `blueprint_coordinates` when editing the blueprint polygon (no changes needed).

---

## Eliminated Code (Summary)

| What | Where | ~Lines |
|------|-------|--------|
| `BlueprintOverlay` + sub-components | `EditorViewer.jsx` | ~280 |
| `cropRegion` / `overlayCorners` state + handlers | `App.jsx` | ~80 |
| `BlueprintCropModal` | Separate file | ~180 |
| `computeContainRect` (if unused elsewhere) | `EditorViewer.jsx` | ~17 |

---

## Risks & Mitigations

**Risk**: PSV MarkersPlugin may not render `fill: url(http://...)` correctly on polygon markers.
**Mitigation**: Test `annotations.js` change first (Phase 1). If PSV doesn't support it, the fallback is a canvas-based approach in `EditorViewer` where the blueprint polygon is rendered as a separate canvas layer using `ctx.clip()` with the polygon path and `ctx.drawImage()` — the same way the current `QuadImageWarper` works but using the polygon's own vertices as the clip path instead of a bilinear quad. This is actually simpler than the current bilinear warping since it uses the polygon vertices directly.

**Risk**: `blueprintCoordinates` = `[[0,0],[1,0],[1,1],[0,1]]` means the blueprint polygon covers the full blueprint image. If the actual development boundary is smaller, the polygon should match it.
**Mitigation**: The polygon IS editable — users can drag corners to match the actual development boundary. The initial full-image quad is a sensible default.

---

## Verification

1. Toggle `showBlueprintOverlay` — blueprint appears as textured polygon in BlueprintEditor with lot polygons visible on top
2. Switch to panorama mode — blueprint polygon appears on the sphere surface (as a textured polygon marker), lot polygons are interactive (clickable, draggable corners)
3. Draw a new lot polygon in blueprint mode — it appears in the annotations list with `blueprint_coordinates`
4. In panorama mode, click/drag a lot polygon corner — coordinates update correctly
5. Toggle blueprint off — no overlay renders, lot polygons remain visible on sphere as PSV markers

---

## Order of Implementation

1. `annotations.js` — add blueprint fill support (lowest risk, validates the approach)
2. `BlueprintEditor.jsx` — add SVG pattern fill for blueprint polygon (visual verification)
3. `App.jsx` — create blueprint polygon on toggle, remove old state/modal
4. `EditorViewer.jsx` — remove `BlueprintOverlay` and all associated code
