import { API_BASE } from '../config';

export async function createProspect({ apiFetch, addProspectForm, setAddProspectLoading, setAddProspectError, setAddProspectOpen, setAddProspectForm, refreshSync }) {
  setAddProspectLoading(true);
  setAddProspectError(null);
  const body = {
    name: addProspectForm.name,
    category: addProspectForm.category,
  };
  if (addProspectForm.email) body.email = addProspectForm.email;
  if (addProspectForm.phone) body.phone = addProspectForm.phone;
  if (addProspectForm.budget) body.budget = parseFloat(addProspectForm.budget);
  if (addProspectForm.payment_method) body.payment_method = addProspectForm.payment_method;

  try {
    await apiFetch(`${API_BASE}/prospects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setAddProspectOpen(false);
    setAddProspectForm({ name: '', email: '', phone: '', category: 'primer_contacto', budget: '', payment_method: 'contado' });
    refreshSync();
  } catch (error) {
    setAddProspectError(error.message);
  } finally {
    setAddProspectLoading(false);
  }
}

export async function fetchAdvisors({ apiFetch, setAdvisorsLoading, setAdvisorsList }) {
  setAdvisorsLoading(true);
  try {
    const data = await apiFetch(`${API_BASE}/advisors`);
    setAdvisorsList(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error(error);
  } finally {
    setAdvisorsLoading(false);
  }
}

export async function saveEditProspect({ apiFetch, editingProspectId, editProspectForm, addToast, setEditProspectLoading, setEditProspectError, setEditProspectClosing, setEditProspectModalOpen, setEditingProspectId, refreshSync }) {
  setEditProspectLoading(true);
  setEditProspectError(null);
  const body = { name: editProspectForm.name, category: editProspectForm.category };
  if (editProspectForm.email) body.email = editProspectForm.email;
  else body.email = null;
  if (editProspectForm.phone) body.phone = editProspectForm.phone;
  else body.phone = null;
  if (editProspectForm.budget !== '') body.budget = parseFloat(editProspectForm.budget);
  else body.budget = null;
  if (editProspectForm.payment_method) body.payment_method = editProspectForm.payment_method;
  if (editProspectForm.advisor_id) body.advisor_id = editProspectForm.advisor_id;
  else body.advisor_id = null;

  try {
    await apiFetch(`${API_BASE}/prospects/${editingProspectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    addToast('Prospecto actualizado.', 'success');
    setEditProspectClosing(true);
    setTimeout(() => {
      setEditProspectModalOpen(false);
      setEditProspectClosing(false);
      setEditingProspectId(null);
      refreshSync();
    }, 200);
  } catch (error) {
    setEditProspectError(error.message);
  } finally {
    setEditProspectLoading(false);
  }
}

export async function updateLastContact({ apiFetch, setUpdatingContact, addToast, refreshSync, prospectId }) {
  setUpdatingContact(true);
  try {
    await apiFetch(`${API_BASE}/prospects/${prospectId}/last-contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    addToast('Último contacto actualizado.', 'success');
    refreshSync();
  } catch (error) {
    addToast(`Error: ${error.message}`, 'error');
  } finally {
    setUpdatingContact(false);
  }
}

export async function handleDeleteProspectConfirm({ apiFetch, deleteProspectDialog, addToast, setDeleteProspectDialog, refreshSync }) {
  const prospect = deleteProspectDialog.prospect;
  if (!prospect) return;
  setDeleteProspectDialog(prev => ({ ...prev, loading: true }));
  try {
    await apiFetch(`${API_BASE}/prospects/${prospect.id}`, { method: 'DELETE' });
    addToast(`Prospecto "${prospect.name}" eliminado.`, 'success');
    setDeleteProspectDialog({ open: false, prospect: null, loading: false });
    refreshSync();
    refreshSync();
  } catch (err) {
    addToast(`Error: ${err.message}`, 'error');
    setDeleteProspectDialog(prev => ({ ...prev, loading: false }));
  }
}

export async function fetchProspectos({ apiFetch, setProspectosLoading, setProspectosList, category, withoutAdvisor, signal }) {
  setProspectosLoading(true);
  try {
    const params = new URLSearchParams({ limit: 50, offset: 0 });
    if (category) params.set('category', category);
    if (withoutAdvisor) params.set('without_advisor', 'true');
    const data = await apiFetch(`${API_BASE}/prospects?${params}`, { signal });
    setProspectosList(data.items);
  } catch (error) {
    if (error.name !== 'AbortError') console.error(error);
  } finally {
    setProspectosLoading(false);
  }
}

export async function loadMoreProspectos({ apiFetch, setProspectosLoadingMore, setProspectosList, setProspectosHasMore, prospectosList, prospectosCategoryFilter, prospectosWithoutAdvisor, PAGE_SIZE }) {
  setProspectosLoadingMore(true);
  try {
    const params = new URLSearchParams({ limit: PAGE_SIZE, offset: prospectosList.length });
    if (prospectosCategoryFilter) params.set('category', prospectosCategoryFilter);
    if (prospectosWithoutAdvisor) params.set('without_advisor', 'true');
    const data = await apiFetch(`${API_BASE}/prospects?${params}`);
    setProspectosList(prev => [...prev, ...data.items]);
    setProspectosHasMore(data.items.length === PAGE_SIZE);
  } catch (error) {
    console.error(error);
  } finally {
    setProspectosLoadingMore(false);
  }
}
