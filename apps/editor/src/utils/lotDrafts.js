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

/**
 * A local (localStorage) draft can be older than the server: someone may have created or
 * discarded a draft meanwhile (the MCP, another tab). Restored pendings whose server draft
 * is gone are dropped, and server drafts the local copy doesn't know about are appended.
 */
export function reconcileRestoredDrafts(restored, serverDrafts) {
  const serverIds = new Set(serverDrafts.map(a => a.draftId));
  const kept = restored.filter(a => !a.draftId || serverIds.has(a.draftId));
  const keptIds = new Set(kept.map(a => a.draftId).filter(Boolean));
  return [...kept, ...serverDrafts.filter(a => !keptIds.has(a.draftId))];
}
