import { useState } from 'react';
import { createLot } from '../api/lots';

export function useCreateLotModal({ apiFetch, onSuccess, onAddLot }) {
  const initialForm = { name: '', price: '', area_m2: '', loteo_id: '', status: 'available', comments: '' };
  const [createLotOpen, setCreateLotOpen] = useState(false);
  const [createLotForm, setCreateLotForm] = useState(initialForm);
  const [createLotLoading, setCreateLotLoading] = useState(false);
  const [createLotError, setCreateLotError] = useState(null);

  const validateForm = () => {
    if (!createLotForm.loteo_id || createLotForm.loteo_id === '') {
      return 'Debes seleccionar un loteo';
    }
    if (!createLotForm.name || createLotForm.name.trim() === '') {
      return 'El nombre del lote es requerido';
    }
    if (!createLotForm.price || createLotForm.price === '') {
      return 'El precio es requerido';
    }
    if (!createLotForm.area_m2 || createLotForm.area_m2 === '') {
      return 'El área es requerida';
    }
    if (!createLotForm.status) {
      return 'El estado es requerido';
    }
    return null;
  };

  const openCreateLotModal = () => {
    setCreateLotOpen(true);
    setCreateLotError(null);
    setCreateLotForm(initialForm);
  };

  const closeCreateLotModal = () => {
    setCreateLotOpen(false);
    setCreateLotForm(initialForm);
  };

  const submitCreateLot = async (e) => {
    e.preventDefault();
    setCreateLotError(null);

    const validationError = validateForm();
    if (validationError) {
      setCreateLotError(validationError);
      return;
    }

    setCreateLotLoading(true);
    try {
      const res = await createLot({
        apiFetch,
        createLotForm,
      });
      onAddLot?.(res);
      closeCreateLotModal();
      onSuccess?.();
    } catch (err) {
      setCreateLotError(err.message);
    } finally {
      setCreateLotLoading(false);
    }
  };

  return {
    createLotOpen,
    createLotForm,
    setCreateLotForm,
    createLotLoading,
    createLotError,
    openCreateLotModal,
    closeCreateLotModal,
    submitCreateLot,
  };
}
