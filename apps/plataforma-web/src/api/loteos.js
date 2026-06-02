import { API_BASE } from '../config';
import { isValidHttpsUrl } from '../utils/validation';
import { postActivityLog } from './activityLogs';

export async function fetchLoteos({ apiFetch, setLoading, setLoteos, setAdminSubView, addToast }) {
  setLoading(true);
  setAdminSubView('loteos');
  try {
    const data = await apiFetch(`${API_BASE}/loteos?include_lotes=false&limit=50&offset=0`);
    setLoteos(data.items);
  } catch (error) {
    addToast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

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
    if (error.name !== 'AbortError') addToast(`Error actualizando loteos: ${error.message}`, 'error');
  }
}

export async function createLoteo({ apiFetch, createLoteoForm, setCreateLoteoLoading, setCreateLoteoError, setCreateLoteoOpen, setCreateLoteoForm, onSuccess, onAddLoteo, loteOwnerId, setActivities }) {
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
        blueprint_url: createLoteoForm.blueprint_url,
        text_annotations: [],
      }),
    });
    onAddLoteo?.(res);
    setCreateLoteoOpen(false);
    setCreateLoteoForm({ name: '', slug: '', image_url: '', thumbnail_url: '', blueprint_url: '' });
    if (loteOwnerId && res?.id) {
      postActivityLog({ apiFetch, activityType: 'loteo_created', entityType: 'lote', entityId: res.id, loteOwnerId, description: `Loteo "${res.name}" creado` });
      setActivities?.([{
        id: crypto.randomUUID(),
        type: 'loteo_created',
        name: res.name,
        description: `Loteo "${res.name}" creado`,
        ts: Date.now(),
      }]);
    }
    onSuccess?.();
  } catch (error) {
    setCreateLoteoError(error.message);
  } finally {
    setCreateLoteoLoading(false);
  }
}

export async function deleteLoteo({ apiFetch, loteoId, loteoName, loteOwnerId, setActivities }) {
  if (loteOwnerId) {
    postActivityLog({ apiFetch, activityType: 'loteo_deleted', entityType: 'lote', entityId: loteoId, loteOwnerId, description: `Loteo "${loteoName}" eliminado` });
    setActivities?.([{
      id: crypto.randomUUID(),
      type: 'loteo_deleted',
      name: loteoName,
      description: `Loteo "${loteoName}" eliminado`,
      ts: Date.now(),
    }]);
  }
  await apiFetch(`${API_BASE}/loteos/${loteoId}`, { method: 'DELETE' });
}

export async function saveEditLoteo({ apiFetch, editingLoteoId, editLoteoForm, addToast, setEditLoteoLoading, setEditLoteoError, setEditLoteoClosing, setEditLoteoOpen, setEditingLoteoId, setInventoryLoteos, fetchInventoryLoteos, onUpdateLoteo, loteOwnerId, setActivities }) {
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
        blueprint_url: editLoteoForm.blueprint_url,
      }),
    });
    onUpdateLoteo?.(editingLoteoId, editLoteoForm);
    if (loteOwnerId && res?.id) {
      postActivityLog({ apiFetch, activityType: 'loteo_updated', entityType: 'lote', entityId: res.id, loteOwnerId, description: `Loteo "${res.name}" actualizado` });
      setActivities?.([{
        id: crypto.randomUUID(),
        type: 'loteo_updated',
        name: res.name,
        description: `Loteo "${res.name}" actualizado`,
        ts: Date.now(),
      }]);
    }
    addToast('Loteo actualizado.', 'success');
    setEditLoteoClosing(true);
    setTimeout(() => {
      setEditLoteoOpen(false);
      setEditLoteoClosing(false);
      setEditingLoteoId(null);
      fetchInventoryLoteos();
    }, 200);
  } catch (error) {
    setEditLoteoError(error.message);
  } finally {
    setEditLoteoLoading(false);
  }
}