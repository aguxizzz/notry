// Keeps auto-detected pending lots in sync with the back's lot drafts, so they survive
// a reload and can be filled in from outside the editor (the MCP). Creating the lot itself
// is still useLotOperations (POST /lots with `draft_id`); this hook loads, stores and discards.
import { useRef } from 'react';
import { errorMessage } from '../api/client';
import { createLotDrafts, deleteLotDraft, listLotDrafts } from '../api/lots';
import { draftToAnnotation, insertIntoSaved, reconcileRestoredDrafts } from '../utils/lotDrafts';
import { useLatest } from './useLatest';

export function useLotDrafts({ annotations, setAnnotations, savedAnnotationsRef, token, loteoId, notify, onAuthError }) {
  // Server drafts as of the last load: what a restored local draft is reconciled against.
  const serverDraftsRef = useRef([]);
  const annotationsRef = useLatest(annotations);

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
    }
  };

  /**
   * Removes a draft from the back and from the saved snapshot. Used when the pending lot is
   * discarded or its shape is assigned to an existing lot. Returns false if the back refused.
   */
  const discardDraft = async (annotation) => {
    if (!annotation?.draftId) return true;
    try {
      await deleteLotDraft(token, loteoId, annotation.draftId);
    } catch (error) {
      // Already gone on the back (filled in from the MCP, another tab): nothing left to delete.
      if (error?.status !== 404) {
        reportError('descartar el lote pendiente', error);
        return false;
      }
    }
    savedAnnotationsRef.current = savedAnnotationsRef.current.filter(a => a.id !== annotation.id);
    serverDraftsRef.current = serverDraftsRef.current.filter(a => a.draftId !== annotation.draftId);
    return true;
  };

  /** For "restore local draft": the restored annotations, reconciled with the server's drafts. */
  const reconcileRestored = restored => reconcileRestoredDrafts(restored, serverDraftsRef.current);

  return { loadServerDrafts, persistDetected, discardDraft, reconcileRestored };
}
