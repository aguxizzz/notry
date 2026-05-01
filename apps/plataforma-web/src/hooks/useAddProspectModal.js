import { useState } from 'react';
import { createProspect as createProspectService } from '../api/prospects';

export function useAddProspectModal({ apiFetch, onSuccess, addToast, onAddProspect, loteOwnerId, setActivities }) {
  const [addProspectOpen, setAddProspectOpen] = useState(false);
  const [addProspectForm, setAddProspectForm] = useState({
    name: '', email: '', phone: '', category: 'primer_contacto', lote_id: '',
  });
  const [addProspectLoading, setAddProspectLoading] = useState(false);
  const [addProspectError, setAddProspectError] = useState(null);

  const openAddProspectModal = () => {
    setAddProspectOpen(true);
    setAddProspectError(null);
  };

  const closeAddProspectModal = () => {
    setAddProspectOpen(false);
    setAddProspectForm({ name: '', email: '', phone: '', category: 'primer_contacto', lote_id: '' });
  };

  const submitAddProspect = async (formData) => {
    setAddProspectLoading(true);
    setAddProspectError(null);
    try {
      await createProspectService({
        apiFetch,
        addProspectForm: formData,
        setAddProspectLoading,
        setAddProspectError,
        setAddProspectOpen,
        setAddProspectForm,
        refreshSync: onSuccess,
        addToast,
        onAddProspect,
        loteOwnerId,
        setActivities,
      });
    } catch (err) {
      setAddProspectError(err.message);
    } finally {
      setAddProspectLoading(false);
    }
  };

  return {
    addProspectOpen,
    addProspectForm,
    setAddProspectForm,
    addProspectLoading,
    addProspectError,
    openAddProspectModal,
    closeAddProspectModal,
    submitAddProspect,
  };
}