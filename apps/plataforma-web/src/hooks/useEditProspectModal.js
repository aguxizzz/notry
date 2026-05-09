import { useState } from 'react';
import { API_BASE } from '../config';
import { saveEditProspect as saveEditProspectService, updateLastContact as updateLastContactService } from '../api/prospects';

export function useEditProspectModal({ apiFetch, advisorsList, setAdvisorsList, addToast, onSuccess, onUpdateLastContact, loteOwnerId, setActivities }) {
  const [editProspectModalOpen, setEditProspectModalOpen] = useState(false);
  const [editingProspectId, setEditingProspectId] = useState(null);
  const [editProspectForm, setEditProspectForm] = useState({
    name: '', email: '', phone: '', category: '', advisor_id: '', lote_id: '', origin: '',
  });
  const [editProspectLoading, setEditProspectLoading] = useState(false);
  const [updatingContact, setUpdatingContact] = useState(false);
  const [editProspectError, setEditProspectError] = useState(null);
  const [editProspectClosing, setEditProspectClosing] = useState(false);

  const openEditProspectModal = (prospect) => {
    setEditProspectForm({
      name: prospect.name || '',
      email: prospect.email || '',
      phone: prospect.phone || '',
      category: prospect.category || 'primer_contacto',
      advisor_id: prospect.advisor_id || '',
      lote_id: prospect.lote_id || '',
      origin: prospect.origin || '',
    });
    setEditProspectError(null);
    setEditingProspectId(prospect.id);
    setEditProspectModalOpen(true);
    // Fetch advisors for the dropdown
    setAdvisorsList([]);
    apiFetch(`${API_BASE}/advisors`).then(r => r.json()).then(data => {
      if (Array.isArray(data)) setAdvisorsList(data);
    }).catch(() => {});
  };

  const closeEditProspectModal = () => {
    setEditProspectClosing(true);
    setTimeout(() => {
      setEditProspectModalOpen(false);
      setEditProspectClosing(false);
      setEditingProspectId(null);
    }, 200);
  };

  const saveEditProspect = async (e) => {
    e.preventDefault();
    setEditProspectLoading(true);
    setEditProspectError(null);
    try {
      await saveEditProspectService({
        apiFetch,
        editingProspectId,
        editProspectForm,
        addToast,
        setEditProspectLoading,
        setEditProspectError,
        setEditProspectClosing,
        setEditProspectModalOpen,
        setEditingProspectId,
        refreshSync: onSuccess,
        loteOwnerId,
        setActivities,
      });
      onSuccess?.();
    } catch (err) {
      setEditProspectError(err.message);
    } finally {
      setEditProspectLoading(false);
    }
  };

  const updateLastContact = async () => {
    await updateLastContactService({
      apiFetch,
      setUpdatingContact,
      addToast,
      refreshSync: onSuccess,
      prospectId: editingProspectId,
      prospectName: editProspectForm.name,
      onUpdate: onUpdateLastContact,
      loteOwnerId,
      setActivities,
    });
    onSuccess?.();
  };

  return {
    editProspectModalOpen,
    editingProspectId,
    editProspectForm,
    setEditProspectForm,
    editProspectLoading,
    updatingContact,
    editProspectError,
    editProspectClosing,
    openEditProspectModal,
    closeEditProspectModal,
    saveEditProspect,
    updateLastContact,
  };
}