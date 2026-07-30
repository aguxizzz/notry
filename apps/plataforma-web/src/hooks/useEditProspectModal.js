import { useState } from 'react';
import { API_BASE } from '../config';
import { saveEditProspect as saveEditProspectService, updateLastContact as updateLastContactService } from '../api/prospects';

export function useEditProspectModal({ apiFetch, setAdvisorsList, addToast, onSuccess, onUpdateProspect, onUpdateLastContact, loteOwnerId, addActivity }) {
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

  const validateForm = (formData) => {
    const hasEmail = formData.email && formData.email.trim() !== '';
    const hasPhone = formData.phone && formData.phone.trim() !== '';

    if (!hasEmail && !hasPhone) {
      return 'Se requiere al menos un email o teléfono';
    }
    return null;
  };

  const saveEditProspect = async (e) => {
    e.preventDefault();
    setEditProspectLoading(true);
    setEditProspectError(null);

    const validationError = validateForm(editProspectForm);
    if (validationError) {
      setEditProspectError(validationError);
      setEditProspectLoading(false);
      return;
    }

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
        onUpdateProspect,
        loteOwnerId,
        addActivity,
      });
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
      addActivity,
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
