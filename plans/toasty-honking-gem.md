# Plan: Deformable Quadrilateral Blueprint Overlay

## Context

The blueprint overlay in `EditorViewer` currently uses a **rectangle** model (`overlayBounds = {left, top, width, height}`). The 4 corner handles are positioned relative to a crop box, and dragging any corner actually moves 2 edges simultaneously (width + height change together). This is insufficient for matching real-world panorama lots, which may form non-rectangular quadrilaterals due to camera angle and perspective.

The goal: replace the rectangle model with a **deformable quadrilateral** where each of the 4 corners moves independently — mirroring how polygon vertices work in the existing editor.

**Crop modal stays independent:** `BlueprintCropModal` still outputs `cropRegion = {x1,y1,x2,y2}` to select which portion of the blueprint image to display. The quadrilateral corners define **where and at what shape** that cropped image appears on the panorama.

---

## Files to Modify

1. **`src/components/EditorViewer.jsx`** — main changes to `BlueprintOverlay` and `OverlayCorners`
2. **`src/App.jsx`** — `handleBlueprintConfirm` needs minor update to accept 4-corner format

---

## Implementation

### Step 1: Replace `overlayBounds` state with `quadCorners`

In `EditorViewer` state, replace:
```js
const [overlayBounds, setOverlayBounds] = useState(null); // { left, top, width, height }
```

With:
```js
const [quadCorners, setQuadCorners] = useState(null); // { tl: {x,y}, tr: {x,y}, br: {x,y}, bl: {x,y} } — container pixels
```

The `ResizeObserver` initialization (currently computing `computeContainRect`) should set the initial 4 corners as a rectangle:
```js
setQuadCorners({
  tl: { x: rect.left, y: rect.top },
  tr: { x: rect.left + rect.width, y: rect.top },
  br: { x: rect.left + rect.width, y: rect.top + rect.height },
  bl: { x: rect.left, y: rect.top + rect.height },
});
```

Remove `overlayRect` and `cropLeft/cropTop/cropWidth/cropHeight` calculations — replaced by quad bounding box computed from corners.

### Step 2: Simplify `OverlayCorners` — independent corner dragging

`OverlayCorners` currently computes width/height changes per corner (TL shrinks width when moving left). Replace with independent `x,y` updates only:

```js
const handlePointerMove = (e) => {
  if (!dragRef.current || dragRef.current.type !== 'corner') return;
  const dx = e.clientX - dragRef.current.startClientX;
  const dy = e.clientY - dragRef.current.startClientY;
  const key = ['tl', 'tr', 'br', 'bl'][dragRef.current.cornerIndex];

  setQuadCorners(prev => ({
    ...prev,
    [key]: {
      x: dragRef.current.startBounds[key].x + dx,
      y: dragRef.current.startBounds[key].y + dy,
    }
  }));
};
```

Remove the `width/height` math from all 4 corner branches. Remove the minimum-size (40px) guard — a degenerate quad is a valid user action.

Corner handle positions are computed from the bounding box of corners:
```js
const minX = Math.min(tl.x, tr.x, br.x, bl.x);
const minY = Math.min(tl.y, tr.y, br.y, bl.y);
```

Handle positions: `left: corner[key].x - 6, top: corner[key].y - 6` (using absolute corner coordinates directly, not crop-relative offsets).

### Step 3: Update `BlueprintOverlay` — clip image to quad + warp polygons

**Image layer (Layer 1):**

The blueprint image fills the container. `cropRegion` offsets the image so only the cropped portion shows (same `imgOffsetLeft/Top` logic). CSS `clip-path: polygon()` cuts to the quad shape.

```jsx
const { tl, tr, br, bl } = bounds;
<img
  src={blueprintUrl}
  style={{
    position: 'absolute',
    left: -(cr.x1 * containerSize.width),
    top: -(cr.y1 * containerSize.height),
    width: containerSize.width,
    height: containerSize.height,
    clipPath: `polygon(${tl.x}px,${tl.y}px ${tr.x}px,${tr.y}px ${br.x}px,${br.y}px ${bl.x}px,${bl.y}px)`,
    opacity: 0.45,
    pointerEvents: 'auto',
    cursor: 'move',
  }}
  draggable="false"
/>
```

**Polygon annotation layer (Layer 2 — replace affine map with bilinear):**

Old affine mapping (removed):
```js
`${((nx - cr.x1) / (cr.x2 - cr.x1)) * cropWidth},${((ny - cr.y1) / (cr.y2 - cr.y1)) * cropHeight}`
```

New bilinear interpolation — maps normalized [0,1] polygon points to screen positions inside the quad:
```js
function mapNormToQuad(u, v, quad) {
  const x = quad[0].x * (1-u) * (1-v) + quad[1].x * u * (1-v)
          + quad[2].x * u * v       + quad[3].x * (1-u) * v;
  const y = quad[0].y * (1-u) * (1-v) + quad[1].y * u * (1-v)
          + quad[2].y * u * v       + quad[3].y * (1-u) * v;
  return { x, y };
}
```

SVG `<polygon>` points computed as:
```js
const pts = ann.polygonPixels.map(([u, v]) => {
  const { x, y } = mapNormToQuad(u, v, [tl, tr, br, bl]);
  return `${x},${y}`;
}).join(' ');
```

Note: `cropRegion` is NOT applied to polygon point mapping — `polygonPixels` already represents positions within the blueprint image in normalized [0,1] space; bilinear interpolation with the quad corners directly maps them to screen.

### Step 4: Update `confirmCropRef` to output 4 normalized corners

```js
confirmCropRef.current = () => {
  const { tl, tr, br, bl } = quadCorners;
  onBlueprintConfirmRef.current({
    tl: { x: tl.x / containerSize.width, y: tl.y / containerSize.height },
    tr: { x: tr.x / containerSize.width, y: tr.y / containerSize.height },
    br: { x: br.x / containerSize.width, y: br.y / containerSize.height },
    bl: { x: bl.x / containerSize.width, y: bl.y / containerSize.height },
  });
};
```

`handleBlueprintConfirm` in `App.jsx` currently sets `cropRegion = computedCrop`. It should also store the quad corners (or derive them from the confirmed rect on next restore). Since the crop modal already provides `cropRegion`, and the quad corners are what the user deformed, both should be saved. Minor change in App.jsx to handle the new 4-corner format.

### Step 5: Pass `quadCorners` instead of `overlayBounds` to `BlueprintOverlay`

In `EditorViewer` render:
```jsx
<BlueprintOverlay
  blueprintUrl={blueprintUrl}
  quadCorners={quadCorners}
  onQuadCornersChange={setQuadCorners}
  containerSize={containerSize}
  annotations={blueprintAnnotations || []}
  cropRegion={cropRegion}
/>
```

Remove the `overlayRect`, `overlayBounds`, `onBoundsChange` props — replaced by `quadCorners` + `onQuadCornersChange`.

---

## Key Technical Decisions

1. **CSS `clip-path: polygon()`** for image clipping — 94% browser support, works for convex quads. Polygon points passed in absolute `px` units since corners are already in container pixel space.

2. **Bilinear interpolation** (not full homography) for polygon warping — sufficient for approximately planar surfaces, much simpler to implement.

3. **`cropRegion` stays independent** — crop modal defines source image region; quad corners define destination shape/position. No interaction between the two.

4. **No aspect ratio lock** — each corner moves freely.

---

## Verification

1. Open editor with a `?data=` URL that includes a blueprint
2. Toggle blueprint overlay (Layers icon)
3. Drag each corner independently — image should clip to the new quad shape
4. Verify polygon annotations warp correctly to follow the new quad shape
5. Corners can form non-rectangular trapezoid/keystone shapes
6. Click green confirm button — corners are preserved
7. Toggle overlay off and back on — corners restore to confirmed positions
8. Crop modal still works independently for selecting the blueprint image region
