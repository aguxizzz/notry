// Keeps auto-detected pending lots in sync with the back's lot drafts, so they survive
// a reload and can be filled in from outside the editor (the MCP). Creating the lot itself
// is still useLotOperations (POST /lots with `draft_id`); this hook loads, stores, discards
// and polls the back so what the MCP does shows up without reloading.
import { useEffect, useRef } from 'react';
import { errorMessage } from '../api/client';
import { fetchVisorData } from '../api/loteos';
import { createLotDrafts, deleteLotDraft, listLotDrafts } from '../api/lots';
import { normalizeApiAnnotation } from '../utils/annotationModel';
import { draftToAnnotation, insertIntoSaved, mergeServerChanges, reconcileRestoredDrafts } from '../utils/lotDrafts';
import { useLatest } from './useLatest';

// Drafts are one small query, so a few seconds keeps up with the MCP without hammering
// the back. Only while the tab is visible; coming back to it checks right away.
const SYNC_INTERVAL_MS = 5000;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function useLotDrafts({ annotations, setAnnotations, savedAnnotationsRef, token, loteoId, notify, onAuthError, onServerChanges }) {
  // Server drafts as of the last load: what a restored local draft is reconciled against.
  const serverDraftsRef = useRef([]);
  const annotationsRef = useLatest(annotations);
  // The poll doesn't start until the first load answered: before that there's nothing to diff.
  const loadedRef = useRef(false);
  // Bumped by every local draft change (detect, discard, create). A poll that started before
  // one of those carries a stale picture of the back and is thrown away instead of applied.
  const localEpochRef = useRef(0);
  const inFlightRef = useRef(0);
  const syncingRef = useRef(false);
  const onServerChangesRef = useLatest(onServerChanges);
  const notifyRef = useLatest(notify);
  const noteLocalChange = () => { localEpochRef.current += 1; };

  const reportError = (action, error) => {
    if (error?.isUnauthorized) { onAuthError(); return; }
    notify(`No se pudo ${action}: ${errorMessage(error, 'error del servidor.')}`, { variant: 'error' });
  };

  /** Appends the loteo's drafts as pending lots, counted as saved (they're already on the back). */
  const loadServerDrafts = async (id) => {
    if (!token || !id) return;
    try {
      const drafts = (await listLotDrafts(token, id)).map(draftToAnnotation);
      serverDraftsRef.current = drafts;
      loadedRef.current = true;
      if (drafts.length === 0) return;
      // Skip any already on screen (a restore that ran before this answered).
      setAnnotations(prev => {
        const onScreen = new Set(prev.map(a => a.draftId).filter(Boolean));
        return [...prev, ...drafts.filter(d => !onScreen.has(d.draftId))];
      });
      savedAnnotationsRef.current = [...savedAnnotationsRef.current, ...drafts];
    } catch (error) {
      reportError('cargar los lotes pendientes', error);
    }
  };

  /**
   * Stores a just-detected polygon as a draft. It's already on screen; when the back answers
   * it gets its `draftId` and joins the saved snapshot. If it fails it stays local-only, like before.
   */
  const persistDetected = async (annotation) => {
    if (!token || !loteoId) return;
    noteLocalChange();
    // While this is in flight the back already has the draft but the screen doesn't know its
    // id yet: a poll in between would see it as new and add it twice.
    inFlightRef.current += 1;
    try {
      const [draft] = await createLotDrafts(token, loteoId, [{
        blueprint_coordinates: annotation.blueprint_coordinates,
        label: annotation.tooltip || null,
      }]);
      const current = annotationsRef.current;
      if (!current.some(a => a.id === annotation.id)) {
        // Discarded while the request was in flight: don't leave an orphan on the back.
        deleteLotDraft(token, loteoId, draft.id).catch(() => {});
        return;
      }
      const linked = { ...annotation, draftId: draft.id };
      setAnnotations(prev => prev.map(a => (a.id === annotation.id ? { ...a, draftId: draft.id } : a)));
      savedAnnotationsRef.current = insertIntoSaved(savedAnnotationsRef.current, linked, current, annotation.id);
      serverDraftsRef.current = [...serverDraftsRef.current, linked];
    } catch (error) {
      reportError('guardar el lote detectado', error);
    } finally {
      inFlightRef.current -= 1;
      noteLocalChange();
    }
  };

  /**
   * Removes a draft from the back and from the saved snapshot. Used when the pending lot is
   * discarded or its shape is assigned to an existing lot. Returns false if the back refused.
   */
  const discardDraft = async (annotation) => {
    if (!annotation?.draftId) return true;
    // Before and after: a poll that read the drafts while the DELETE was in flight would
    // still see this one and bring it back.
    noteLocalChange();
    try {
      await deleteLotDraft(token, loteoId, annotation.draftId);
    } catch (error) {
      // Already gone on the back (filled in from the MCP, another tab): nothing left to delete.
      if (error?.status !== 404) {
        reportError('descartar el lote pendiente', error);
        return false;
      }
    } finally {
      noteLocalChange();
    }
    savedAnnotationsRef.current = savedAnnotationsRef.current.filter(a => a.id !== annotation.id);
    serverDraftsRef.current = serverDraftsRef.current.filter(a => a.draftId !== annotation.draftId);
    return true;
  };

  /** For "restore local draft": the restored annotations, reconciled with the server's drafts. */
  const reconcileRestored = restored => reconcileRestoredDrafts(restored, serverDraftsRef.current);

  /**
   * One look at the back. Lots are only fetched when a draft on screen is gone, which is
   * what the MCP does when it creates or discards, so most ticks are a single small request.
   */
  const syncWithServer = async () => {
    if (!token || !loteoId || !loadedRef.current || syncingRef.current) return;
    // A lot being created from a pending is mid-swap on screen; wait for the next tick.
    if (inFlightRef.current > 0 || annotationsRef.current.some(a => a.creating)) return;
    syncingRef.current = true;
    const epoch = localEpochRef.current;
    try {
      const serverDrafts = (await listLotDrafts(token, loteoId)).map(draftToAnnotation);
      const ids = new Set(serverDrafts.map(d => d.draftId));
      const anyGone = annotationsRef.current.some(a => a.pending && a.draftId && !ids.has(a.draftId));
      const serverLots = anyGone
        ? ((await fetchVisorData(`/loteos/${loteoId}/visor_data`)).annotations ?? []).map(normalizeApiAnnotation)
        : null;
      if (epoch !== localEpochRef.current || annotationsRef.current.some(a => a.creating)) return;

      serverDraftsRef.current = serverDrafts;
      const merged = mergeServerChanges(annotationsRef.current, savedAnnotationsRef.current, { serverDrafts, serverLots });
      if (!merged) return;
      setAnnotations(merged.annotations);
      savedAnnotationsRef.current = merged.saved;
      onServerChangesRef.current?.(merged);

      const parts = [
        merged.createdLots && plural(merged.createdLots, 'lote creado', 'lotes creados'),
        merged.discardedDrafts && plural(merged.discardedDrafts, 'pendiente descartado', 'pendientes descartados'),
        merged.newDrafts && plural(merged.newDrafts, 'pendiente nuevo', 'pendientes nuevos'),
      ].filter(Boolean);
      notifyRef.current(`Actualizado desde afuera: ${parts.join(', ')}.`, { variant: 'info' });
    } catch (error) {
      // A failed tick is retried by the next one; only a dead session is worth telling.
      if (error?.isUnauthorized) onAuthError();
    } finally {
      syncingRef.current = false;
    }
  };
  const syncRef = useLatest(syncWithServer);

  useEffect(() => {
    if (!token || !loteoId) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') syncRef.current(); };
    const timer = setInterval(tick, SYNC_INTERVAL_MS);
    // Switching back from Claude to the editor is the moment you want to see the result.
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [token, loteoId, syncRef]);

  return { loadServerDrafts, persistDetected, discardDraft, reconcileRestored, noteLocalChange };
}
