// Pure helpers for lot drafts (pending plano polygons stored on the back) and for the
// "last saved" snapshot that detectChanges compares against. No React, so they're tested
// in lotDrafts.test.js; useLotDrafts and App do the wiring.
import { newPendingLot } from './annotationModel';

/** Server draft → pending lot annotation. `draftId` is what links it back to the server row. */
export function draftToAnnotation(draft) {
  return newPendingLot({
    id: `draft-${draft.id}`,
    mode: 'blueprint',
    coords: draft.blueprint_coordinates,
    tooltip: draft.label ?? '',
    draftId: draft.id,
  });
}

/**
 * Inserts `item` into the saved snapshot at the same relative position it has on screen:
 * after the saved annotations that precede `id` in `annotationsAt`. The dirty check compares
 * whole arrays as JSON, so a right element in the wrong place would still count as a change.
 */
export function insertIntoSaved(saved, item, annotationsAt, id) {
  const savedIds = new Set(saved.map(a => a.id));
  const index = annotationsAt.findIndex(a => a.id === id);
  const before = index === -1 ? annotationsAt : annotationsAt.slice(0, index);
  const at = before.filter(a => savedIds.has(a.id)).length;
  return [...saved.slice(0, at), item, ...saved.slice(at)];
}

const isRealLot = a => a.type === 'polygon' && !a.pending;

/**
 * A local (localStorage) draft can be older than the server: someone may have created or
 * discarded a draft meanwhile (the MCP, another tab). Restored pendings whose server draft
 * is gone are dropped, and server drafts the local copy doesn't know about are appended.
 * `serverLots` (real lots from the saved snapshot) brings back lots created after the local
 * copy was taken; deleting a lot is immediate on the back, so one that's still there wasn't
 * removed on purpose.
 */
export function reconcileRestoredDrafts(restored, serverDrafts, serverLots = []) {
  const serverIds = new Set(serverDrafts.map(a => a.draftId));
  const kept = restored.filter(a => !a.draftId || serverIds.has(a.draftId));
  const keptIds = new Set(kept.map(a => a.draftId).filter(Boolean));
  const known = new Set(kept.flatMap(a => [a.id, a.uuid]).filter(Boolean));
  const missingLots = serverLots.filter(a => isRealLot(a) && !known.has(a.id) && !known.has(a.uuid));
  return [...kept, ...missingLots, ...serverDrafts.filter(a => !keptIds.has(a.draftId))];
}

/**
 * Applies what changed on the back since the last look (lots created or drafts discarded
 * from the MCP or another tab) to the screen and to the saved snapshot at once, so none of
 * it counts as an unsaved change. Everything goes at the end of both arrays, which keeps
 * their relative order matching (detectChanges compares them as whole JSON).
 *
 * `serverDrafts` are already mapped with draftToAnnotation; `serverLots` are the polygons
 * from visor_data, or null when they weren't fetched (nothing gone, so no new lots to look for).
 * Returns null when there's nothing to apply.
 */
export function mergeServerChanges(annotations, saved, { serverDrafts, serverLots }) {
  const serverDraftIds = new Set(serverDrafts.map(d => d.draftId));
  const gone = annotations.filter(a => a.draftId && a.pending && !serverDraftIds.has(a.draftId));
  const goneIds = new Set(gone.map(a => a.id));

  const onScreenDraftIds = new Set(annotations.map(a => a.draftId).filter(Boolean));
  const newDrafts = serverDrafts.filter(d => !onScreenDraftIds.has(d.draftId));

  const known = new Set(annotations.flatMap(a => [a.id, a.uuid]).filter(Boolean));
  const newLots = (serverLots ?? []).filter(a => isRealLot(a) && !known.has(a.id) && !known.has(a.uuid));

  if (gone.length === 0 && newDrafts.length === 0 && newLots.length === 0) return null;
  const added = [...newLots, ...newDrafts];
  return {
    annotations: [...annotations.filter(a => !goneIds.has(a.id)), ...added],
    saved: [...saved.filter(a => !goneIds.has(a.id)), ...added],
    goneIds: [...goneIds],
    createdLots: newLots.length,
    // A draft turned into a lot shows up as one gone + one new lot; only the rest were discarded.
    discardedDrafts: Math.max(0, gone.length - newLots.length),
    newDrafts: newDrafts.length,
  };
}
