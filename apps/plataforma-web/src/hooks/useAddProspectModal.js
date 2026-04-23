import { useState } from 'react';
import { createProspect as createProspectService } from '../api/prospects';

export function useAddProspectModal({ apiFetch, onSuccess, addToast }) {
  const [addProspectOpen, setAddProspectOpen] = useState(false);
  const [addProspectForm, setAddProspectForm] = useState({
    name: '', email: '', phone: '', category: 'primer_contacto', budget: '', payment_method: 'contado', lote_id: '',
  });
  const [addProspectLoading, setAddProspectLoading] = useState(false);
  const [addProspectError, setAddProspectError] = useState(null);

  const openAddProspectModal = () => {
    setAddProspectOpen(true);
    setAddProspectError(null);
  };

  const closeAddProspectModal = () => {
    setAddProspectOpen(false);
    setAddProspectForm({ name: '', email: '', phone: '', category: 'primer_contacto', budget: '', payment_method: 'contado', lote_id: '' });
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