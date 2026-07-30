import { useState } from 'react';
import { createProspect as createProspectService } from '../api/prospects';

export function useAddProspectModal({ apiFetch, onSuccess, addToast, onAddProspect, loteOwnerId, addActivity }) {
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

  const validateForm = (formData) => {
    if (!formData.category || formData.category.trim() === '') {
      return 'La categoría es requerida';
    }
    const hasEmail = formData.email && formData.email.trim() !== '';
    const hasPhone = formData.phone && formData.phone.trim() !== '';

    if (!hasEmail && !hasPhone) {
      return 'Se requiere al menos un email o teléfono';
    }
    return null;
  };

  const submitAddProspect = async (formData) => {
    setAddProspectLoading(true);
    setAddProspectError(null);

    const validationError = validateForm(formData);
    if (validationError) {
      setAddProspectError(validationError);
      setAddProspectLoading(false);
      return;
    }

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
        addActivity,
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
