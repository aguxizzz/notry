import { API_BASE } from '../config';
import { logActivity } from './activityLogs';

export async function fetchInventoryLoteos({ apiFetch, setInventoryLoteosLoading, setInventoryLoteos }) {
  setInventoryLoteosLoading(true);
  try {
    const data = await apiFetch(`${API_BASE}/loteos?include_lotes=false&limit=50&offset=0`);
    setInventoryLoteos(data.items);
  } catch (error) {
    console.error(error);
  } finally {
    setInventoryLoteosLoading(false);
  }
}

export async function fetchInventoryLoteosBg({ apiFetch, setInventoryLoteos, addToast }) {
  try {
    const data = await apiFetch(`${API_BASE}/loteos?include_lotes=false&limit=50&offset=0`);
    setInventoryLoteos(data.items);
  } catch (error) {
    if (error.name !== 'AbortError') addToast(error.message, 'error');
  }
}

export async function createLoteo({ apiFetch, createLoteoForm, setCreateLoteoLoading, setCreateLoteoError, setCreateLoteoOpen, setCreateLoteoForm, onSuccess, onAddLoteo, loteOwnerId, addActivity }) {
  setCreateLoteoLoading(true);
  setCreateLoteoError(null);

  try {
    const res = await apiFetch(`${API_BASE}/loteos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createLoteoForm.name,
        slug: createLoteoForm.slug,
        image_url: createLoteoForm.image_url,
        thumbnail_url: createLoteoForm.thumbnail_url || undefined,
        panorama_width: createLoteoForm.panorama_width || undefined,
        panorama_height: createLoteoForm.panorama_height || undefined,
        blueprint_url: createLoteoForm.blueprint_url,
        text_annotations: [],
      }),
    });
    onAddLoteo?.(res);
    setCreateLoteoOpen(false);
    setCreateLoteoForm({ name: '', slug: '', image_url: '', thumbnail_url: '', blueprint_url: '', panorama_width: null, panorama_height: null });
    if (res?.id) {
      logActivity({ apiFetch, activityType: 'loteo_created', entityType: 'loteo', entityId: res.id, loteOwnerId, description: `Loteo "${res.name}" creado`, name: res.name, addActivity });
    }
    onSuccess?.();
  } catch (error) {
    setCreateLoteoError(error.message);
  } finally {
    setCreateLoteoLoading(false);
  }
}

export async function addLoteoToGroup({ apiFetch, loteoId, targetGrupoId, tipo, orden = 0 }) {
  return apiFetch(`${API_BASE}/loteos/${loteoId}/group`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_grupo_id: targetGrupoId || undefined,
      tipo,
      orden,
    }),
  });
}

export async function removeLoteoFromGroup({ apiFetch, loteoId }) {
  return apiFetch(`${API_BASE}/loteos/${loteoId}/group`, { method: 'DELETE' });
}

export async function deleteLoteo({ apiFetch, loteoId, loteoName, loteOwnerId, addActivity }) {
  logActivity({ apiFetch, activityType: 'loteo_deleted', entityType: 'loteo', entityId: loteoId, loteOwnerId, description: `Loteo "${loteoName}" eliminado`, name: loteoName, addActivity });
  await apiFetch(`${API_BASE}/loteos/${loteoId}`, { method: 'DELETE' });
}

export async function saveEditLoteo({ apiFetch, editingLoteoId, editLoteoForm, addToast, setEditLoteoLoading, setEditLoteoError, setEditLoteoClosing, setEditLoteoOpen, setEditingLoteoId, onUpdateLoteo, loteOwnerId, addActivity }) {
  setEditLoteoLoading(true);
  setEditLoteoError(null);

  try {
    const res = await apiFetch(`${API_BASE}/loteos/${editingLoteoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editLoteoForm.name,
        slug: editLoteoForm.slug,
        image_url: editLoteoForm.image_url,
        thumbnail_url: editLoteoForm.thumbnail_url || undefined,
        panorama_width: editLoteoForm.panorama_width || undefined,
        panorama_height: editLoteoForm.panorama_height || undefined,
        previous_panorama_width: editLoteoForm.previous_panorama_width || undefined,
        previous_panorama_height: editLoteoForm.previous_panorama_height || undefined,
        blueprint_url: editLoteoForm.blueprint_url,
      }),
    });
    onUpdateLoteo?.(editingLoteoId, editLoteoForm);
    if (res?.id) {
      logActivity({ apiFetch, activityType: 'loteo_updated', entityType: 'loteo', entityId: res.id, loteOwnerId, description: `Loteo "${res.name}" actualizado`, name: res.name, addActivity });
    }
    addToast('Loteo actualizado.', 'success');
    // No immediate refetch: optimistic update + next sync (reconciled) cover it.
    setEditLoteoClosing(true);
    setTimeout(() => {
      setEditLoteoOpen(false);
      setEditLoteoClosing(false);
      setEditingLoteoId(null);
    }, 200);
  } catch (error) {
    setEditLoteoError(error.message);
  } finally {
    setEditLoteoLoading(false);
  }
}
