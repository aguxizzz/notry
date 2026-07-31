import { API_BASE } from '../config';
import { logActivity } from './activityLogs';

export async function createProspect({ apiFetch, addProspectForm, setAddProspectLoading, setAddProspectError, setAddProspectOpen, setAddProspectForm, addToast, onAddProspect, loteOwnerId, addActivity }) {
  setAddProspectLoading(true);
  setAddProspectError(null);
  const body = {
    name: addProspectForm.name,
    category: addProspectForm.category,
    origin: 'web_platform',
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
    logActivity({ apiFetch, activityType: 'prospect_created', entityType: 'prospect', entityId: res.id, loteOwnerId, description: `Prospecto "${res.name}" creado`, extraData: { prospect_name: res.name }, name: res.name, addActivity });
  } catch (error) {
    addToast(error.message, 'error');
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

export async function saveEditProspect({ apiFetch, editingProspectId, editProspectForm, addToast, setEditProspectLoading, setEditProspectError, setEditProspectClosing, setEditProspectModalOpen, setEditingProspectId, onUpdateProspect, loteOwnerId, addActivity }) {
  setEditProspectLoading(true);
  setEditProspectError(null);
  const body = { name: editProspectForm.name, category: editProspectForm.category };
  if (editProspectForm.email) body.email = editProspectForm.email;
  else body.email = null;
  if (editProspectForm.phone) body.phone = editProspectForm.phone;
  else body.phone = null;
  if (editProspectForm.advisor_id) body.advisor_id = editProspectForm.advisor_id;
  else body.advisor_id = null;
  if (editProspectForm.origin) body.origin = editProspectForm.origin;
  else body.origin = null;

  try {
    await apiFetch(`${API_BASE}/prospects/${editingProspectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // Optimistic cache update (no immediate sync): the row reflects the edit at
    // once and the next poll reconciles it (protected by usePendingMutations).
    onUpdateProspect?.(editingProspectId, body);
    addToast('Prospecto actualizado.', 'success');
    logActivity({ apiFetch, activityType: 'prospect_updated', entityType: 'prospect', entityId: editingProspectId, loteOwnerId, description: `Prospecto "${editProspectForm.name}" actualizado`, extraData: { prospect_name: editProspectForm.name }, name: editProspectForm.name, addActivity });
    setEditProspectClosing(true);
    setTimeout(() => {
      setEditProspectModalOpen(false);
      setEditProspectClosing(false);
      setEditingProspectId(null);
    }, 200);
  } catch (error) {
    setEditProspectError(error.message);
  } finally {
    setEditProspectLoading(false);
  }
}

export async function updateLastContact({ apiFetch, setUpdatingContact, addToast, refreshSync, prospectId, prospectName, observationNotes, onUpdate, loteOwnerId, addActivity }) {
  setUpdatingContact(true);
  // Reflect the contact immediately. The next sync confirms it or restores
  // the server value if the request fails.
  onUpdate?.(prospectId);
  try {
    const body = {};
    if (observationNotes) body.observation_notes = observationNotes;

    await apiFetch(`${API_BASE}/prospects/${prospectId}/last-contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    addToast('Último contacto actualizado.', 'success');
    logActivity({ apiFetch, activityType: 'prospect_contacted', entityType: 'prospect', entityId: prospectId, loteOwnerId, description: observationNotes || 'Contacto registrado', extraData: { prospect_name: prospectName }, name: prospectName, addActivity });
    refreshSync();
  } catch (error) {
    addToast(error.message, 'error');
    // Reconcile immediately so an optimistic timestamp does not linger after
    // a failed request. The regular sync will also correct it if this fails.
    refreshSync?.();
  } finally {
    setUpdatingContact(false);
  }
}

export async function handleDeleteProspectConfirm({ apiFetch, deleteProspectDialog, addToast, setDeleteProspectDialog, refreshSync, onRemoveProspect, loteOwnerId, addActivity }) {
  const prospect = deleteProspectDialog.prospect;
  if (!prospect) return;
  setDeleteProspectDialog(prev => ({ ...prev, loading: true }));
  try {
    // Log before deleting (entity still exists); also pushes to the feed optimistically.
    logActivity({ apiFetch, activityType: 'prospect_deleted', entityType: 'prospect', entityId: prospect.id, loteOwnerId, description: `Prospecto "${prospect.name}" eliminado`, extraData: { prospect_name: prospect.name }, name: prospect.name, addActivity });
    await apiFetch(`${API_BASE}/prospects/${prospect.id}`, { method: 'DELETE' });
    onRemoveProspect?.(prospect.id);
    addToast(`Prospecto "${prospect.name}" eliminado.`, 'success');
    setDeleteProspectDialog({ open: false, prospect: null, loading: false });
    refreshSync();
  } catch (err) {
    addToast(err.message, 'error');
    setDeleteProspectDialog(prev => ({ ...prev, loading: false }));
  }
}
