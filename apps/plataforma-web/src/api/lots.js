import { API_BASE } from '../config';

export async function fetchLots({ apiFetch, setLoading, setLots, setSelectedLot, setAdminSubView }) {
  setLoading(true);
  setAdminSubView('lotes');
  try {
    const data = await apiFetch(`${API_BASE}/lots?status=available&limit=50&offset=0`);
    setLots(data.items);
    if (data.items.length > 0) {
      setSelectedLot(data.items[0]);
    }
  } catch (error) {
    console.error(error);
  } finally {
    setLoading(false);
  }
}

export async function fetchInventory({ apiFetch, setInventoryLoading, setInventoryLots, setInventoryLotsHasMore, PAGE_SIZE, name, status, signal }) {
  setInventoryLoading(true);
  try {
    const params = new URLSearchParams({ limit: PAGE_SIZE, offset: 0 });
    if (name) params.set('name', name);
    if (status) params.set('status', status);
    const data = await apiFetch(`${API_BASE}/lots?${params}`, { signal });
    setInventoryLots(data.items);
    setInventoryLotsHasMore(data.items.length === PAGE_SIZE);
  } catch (error) {
    if (error.name !== 'AbortError') console.error(error);
  } finally {
    setInventoryLoading(false);
  }
}

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
    if (error.name !== 'AbortError') addToast(`Error actualizando lotes: ${error.message}`, 'error');
  }
}

export async function createLot({ apiFetch, createLotForm }) {
  const body = {};
  if (createLotForm.name) body.name = createLotForm.name;
  if (createLotForm.price !== '') body.price = parseFloat(createLotForm.price);
  if (createLotForm.area_m2 !== '') body.area_m2 = parseFloat(createLotForm.area_m2);
  if (createLotForm.loteo_id) body.loteo_id = createLotForm.loteo_id;
  if (createLotForm.status) body.status = createLotForm.status;
  if (createLotForm.comments?.trim()) body.comments = createLotForm.comments.trim();
  return apiFetch(`${API_BASE}/lots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function patchLot({ apiFetch, editingLotId, editLotForm }) {
  const body = { status: editLotForm.status };
  if (editLotForm.name) body.name = editLotForm.name;
  if (editLotForm.loteo_id) body.loteo_id = editLotForm.loteo_id;
  if (editLotForm.price !== '') body.price = parseFloat(editLotForm.price);
  else body.price = null;
  if (editLotForm.area_m2 !== '') body.area_m2 = parseFloat(editLotForm.area_m2);
  else body.area_m2 = null;
  if (editLotForm.comments?.trim()) body.comments = editLotForm.comments.trim();
  else body.comments = null;
  return apiFetch(`${API_BASE}/lots/${editingLotId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteLot({ apiFetch, lotId }) {
  return apiFetch(`${API_BASE}/lots/${lotId}`, { method: 'DELETE' });
}

