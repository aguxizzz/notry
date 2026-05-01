import { API_BASE } from '../config';
import { postActivityLog } from './activityLogs';

export async function createProspect({ apiFetch, addProspectForm, setAddProspectLoading, setAddProspectError, setAddProspectOpen, setAddProspectForm, refreshSync, addToast, onAddProspect, loteOwnerId, setActivities }) {
  setAddProspectLoading(true);
  setAddProspectError(null);
  const body = {
    name: addProspectForm.name,
    category: addProspectForm.category,
  };
  if (addProspectForm.lote_id) body.lote_id = addProspectForm.lote_id;
  if (addProspectForm.email) body.email = addProspectForm.email;
  if (addProspectForm.phone) body.phone = addProspectForm.phone;
  try {
    const res = await apiFetch(`${API_BASE}/prospects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    onAddProspect?.(res);
    addToast('Prospecto creado.', 'success');
    setAddProspectOpen(false);
    setAddProspectForm({ name: '', email: '', phone: '', category: 'primer_contacto', lote_id: '' });
    postActivityLog({ apiFetch, activityType: 'other', entityType: 'prospect', entityId: res.id, loteOwnerId, description: `Prospecto "${res.name}" creado`, extraData: { prospect_name: res.name } });
    // Optimistically add to activity feed (no sync call needed)
    setActivities?.([{
      id: crypto.randomUUID(),
      type: 'other',
      name: res.name,
      description: `Prospecto "${res.name}" creado`,
      ts: Date.now(),
    }]);
  } catch (error) {
    addToast(`Error: ${error.message}`, 'error');
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

export async function saveEditProspect({ apiFetch, editingProspectId, editProspectForm, addToast, setEditProspectLoading, setEditProspectError, setEditProspectClosing, setEditProspectModalOpen, setEditingProspectId, refreshSync, loteOwnerId, setActivities }) {
  setEditProspectLoading(true);
  setEditProspectError(null);
  const body = { name: editProspectForm.name, category: editProspectForm.category };
  if (editProspectForm.email) body.email = editProspectForm.email;
  else body.email = null;
  if (editProspectForm.phone) body.phone = editProspectForm.phone;
  else body.phone = null;
  if (editProspectForm.advisor_id) body.advisor_id = editProspectForm.advisor_id;
  else body.advisor_id = null;

  try {
    await apiFetch(`${API_BASE}/prospects/${editingProspectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    addToast('Prospecto actualizado.', 'success');
    postActivityLog({ apiFetch, activityType: 'note_added', entityType: 'prospect', entityId: editingProspectId, loteOwnerId, description: 'Prospecto actualizado', extraData: { prospect_name: editProspectForm.name } });
    setActivities?.([{
      id: crypto.randomUUID(),
      type: 'note_added',
      name: editProspectForm.name,
      description: 'Prospecto actualizado',
      ts: Date.now(),
    }]);
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

export async function updateLastContact({ apiFetch, setUpdatingContact, addToast, refreshSync, prospectId, observationNotes, onUpdate, loteOwnerId, setActivities }) {
  setUpdatingContact(true);
  try {
    const body = {};
    if (observationNotes) body.observation_notes = observationNotes;

    await apiFetch(`${API_BASE}/prospects/${prospectId}/last-contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    onUpdate?.(prospectId);
    addToast('Último contacto actualizado.', 'success');
    postActivityLog({ apiFetch, activityType: 'prospect_contacted', entityType: 'prospect', entityId: prospectId, loteOwnerId, description: observationNotes || 'Contacto registrado' });
    setActivities?.([{
      id: crypto.randomUUID(),
      type: 'prospect_contacted',
      name: '—',
      description: observationNotes || 'Contacto registrado',
      ts: Date.now(),
    }]);
    refreshSync();
  } catch (error) {
    addToast(`Error: ${error.message}`, 'error');
  } finally {
    setUpdatingContact(false);
  }
}

export async function handleDeleteProspectConfirm({ apiFetch, deleteProspectDialog, addToast, setDeleteProspectDialog, refreshSync, onRemoveProspect, loteOwnerId, setActivities }) {
  const prospect = deleteProspectDialog.prospect;
  if (!prospect) return;
  setDeleteProspectDialog(prev => ({ ...prev, loading: true }));
  try {
    postActivityLog({ apiFetch, activityType: 'other', entityType: 'prospect', entityId: prospect.id, loteOwnerId, description: `Prospecto "${prospect.name}" eliminado`, extraData: { prospect_name: prospect.name } });
    // Optimistically add to activity feed before deleting
    setActivities?.([{
      id: crypto.randomUUID(),
      type: 'other',
      name: prospect.name,
      description: `Prospecto "${prospect.name}" eliminado`,
      ts: Date.now(),
    }]);
    await apiFetch(`${API_BASE}/prospects/${prospect.id}`, { method: 'DELETE' });
    onRemoveProspect?.(prospect.id);
    addToast(`Prospecto "${prospect.name}" eliminado.`, 'success');
    setDeleteProspectDialog({ open: false, prospect: null, loading: false });
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
    console.log('Prospects data:', data.items);
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
