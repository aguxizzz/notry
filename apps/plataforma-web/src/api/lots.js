import { API_BASE } from '../config';
import { logActivity } from './activityLogs';

// fetchInventoryBg — fire-and-forget refresh, no loading state
export async function fetchInventoryBg({ apiFetch, setInventoryLots, setInventoryLotsHasMore, PAGE_SIZE, name, status, addToast }) {
  try {
    const params = new URLSearchParams({ limit: PAGE_SIZE, offset: 0 });
    if (name) params.set('name', name);
    if (status) params.set('status', status);
    const data = await apiFetch(`${API_BASE}/lots?${params}`);
    setInventoryLots(data.items);
    setInventoryLotsHasMore(data.items.length === PAGE_SIZE);
  } catch (error) {
    if (error.name !== 'AbortError') addToast(error.message, 'error');
  }
}

// manzana/frente/fondo/orientación son opcionales. En el PATCH se mandan como
// null cuando quedan vacíos (para poder borrarlos); en el POST se omiten.
export function lotDetailsBody(form, sendNulls) {
  const body = {};
  const manzana = form.manzana?.trim();
  if (manzana) body.manzana = manzana;
  else if (sendNulls) body.manzana = null;
  for (const key of ['frente', 'fondo']) {
    if (form[key] !== '' && form[key] != null) body[key] = parseFloat(form[key]);
    else if (sendNulls) body[key] = null;
  }
  if (form.orientation) body.orientation = form.orientation;
  else if (sendNulls) body.orientation = null;
  return body;
}

export async function createLot({ apiFetch, createLotForm, loteOwnerId, addActivity }) {
  const body = {};
  if (createLotForm.name) body.name = createLotForm.name;
  if (createLotForm.price !== '') body.price = parseFloat(createLotForm.price);
  if (createLotForm.area_m2 !== '') body.area_m2 = parseFloat(createLotForm.area_m2);
  if (createLotForm.loteo_id) body.loteo_id = createLotForm.loteo_id;
  if (createLotForm.status) body.status = createLotForm.status;
  if (createLotForm.comments?.trim()) body.comments = createLotForm.comments.trim();
  Object.assign(body, lotDetailsBody(createLotForm, false));
  const res = await apiFetch(`${API_BASE}/lots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res?.id) {
    logActivity({ apiFetch, activityType: 'lote_created', entityType: 'lote', entityId: res.id, loteOwnerId, description: `Lote "${res.name || 'Sin nombre'}" creado`, name: res.name || 'Sin nombre', addActivity });
  }
  return res;
}

export async function patchLot({ apiFetch, editingLotId, editLotForm, loteOwnerId, addActivity }) {
  const body = { status: editLotForm.status };
  if (editLotForm.name) body.name = editLotForm.name;
  if (editLotForm.loteo_id) body.loteo_id = editLotForm.loteo_id;
  if (editLotForm.price !== '') body.price = parseFloat(editLotForm.price);
  else body.price = null;
  if (editLotForm.area_m2 !== '') body.area_m2 = parseFloat(editLotForm.area_m2);
  else body.area_m2 = null;
  if (editLotForm.comments?.trim()) body.comments = editLotForm.comments.trim();
  else body.comments = null;
  Object.assign(body, lotDetailsBody(editLotForm, true));
  const res = await apiFetch(`${API_BASE}/lots/${editingLotId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res?.id) {
    logActivity({ apiFetch, activityType: 'lote_updated', entityType: 'lote', entityId: res.id, loteOwnerId, description: `Lote "${res.name || 'Sin nombre'}" actualizado`, name: res.name || 'Sin nombre', addActivity });
  }
  return res;
}

export async function deleteLot({ apiFetch, lotId, lotName, loteOwnerId, addActivity }) {
  logActivity({ apiFetch, activityType: 'lote_deleted', entityType: 'lote', entityId: lotId, loteOwnerId, description: `Lote "${lotName || 'Sin nombre'}" eliminado`, name: lotName || 'Sin nombre', addActivity });
  await apiFetch(`${API_BASE}/lots/${lotId}`, { method: 'DELETE' });
}

