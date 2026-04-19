import { API_BASE } from '../config';

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

export async function createLoteo({ apiFetch, createLoteoForm, isValidHttpsUrl, setCreateLoteoLoading, setCreateLoteoError, setCreateLoteoOpen, setCreateLoteoForm, fetchInventoryLoteos }) {
  setCreateLoteoLoading(true);
  setCreateLoteoError(null);

  if (createLoteoForm.image_url && !isValidHttpsUrl(createLoteoForm.image_url)) {
    setCreateLoteoError('La URL de imagen debe usar https://');
    setCreateLoteoLoading(false);
    return;
  }
  if (createLoteoForm.blueprint_url && !isValidHttpsUrl(createLoteoForm.blueprint_url)) {
    setCreateLoteoError('La URL de blueprint debe usar https://');
    setCreateLoteoLoading(false);
    return;
  }

  try {
    await apiFetch(`${API_BASE}/loteos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createLoteoForm.name,
        slug: createLoteoForm.slug,
        image_url: createLoteoForm.image_url,
        blueprint_url: createLoteoForm.blueprint_url,
        text_annotations: [],
      }),
    });
    setCreateLoteoOpen(false);
    setCreateLoteoForm({ name: '', slug: '', image_url: '', blueprint_url: '' });
    fetchInventoryLoteos();
  } catch (error) {
    setCreateLoteoError(error.message);
  } finally {
    setCreateLoteoLoading(false);
  }
}

export async function saveEditLoteo({ apiFetch, editingLoteoId, editLoteoForm, isValidHttpsUrl, addToast, setEditLoteoLoading, setEditLoteoError, setEditLoteoClosing, setEditLoteoOpen, setEditingLoteoId, setInventoryLoteos, fetchInventoryLoteos }) {
  setEditLoteoLoading(true);
  setEditLoteoError(null);

  if (editLoteoForm.image_url && !isValidHttpsUrl(editLoteoForm.image_url)) {
    setEditLoteoError('La URL de imagen debe usar https://');
    setEditLoteoLoading(false);
    return;
  }
  if (editLoteoForm.blueprint_url && !isValidHttpsUrl(editLoteoForm.blueprint_url)) {
    setEditLoteoError('La URL de blueprint debe usar https://');
    setEditLoteoLoading(false);
    return;
  }

  try {
    await apiFetch(`${API_BASE}/loteos/${editingLoteoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editLoteoForm.name,
        slug: editLoteoForm.slug,
        image_url: editLoteoForm.image_url,
        blueprint_url: editLoteoForm.blueprint_url,
      }),
    });
    addToast('Loteo actualizado.', 'success');
    setEditLoteoClosing(true);
    setTimeout(() => {
      setEditLoteoOpen(false);
      setEditLoteoClosing(false);
      setEditingLoteoId(null);
      setInventoryLoteos([]);
      fetchInventoryLoteos();
    }, 200);
  } catch (error) {
    setEditLoteoError(error.message);
  } finally {
    setEditLoteoLoading(false);
  }
}
