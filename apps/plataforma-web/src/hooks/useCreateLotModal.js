import { useState } from 'react';
import { createLot } from '../api/lots';
import { MAX_LOT_AREA_M2, MAX_LOT_COMMENTS_LENGTH, MAX_LOT_PRICE } from '../ui/forms/lotFields';

export function useCreateLotModal({ apiFetch, onSuccess, onAddLot, loteOwnerId, addActivity }) {
  const initialForm = { name: '', price: '', area_m2: '', loteo_id: '', status: 'available', comments: '' };
  const [createLotOpen, setCreateLotOpen] = useState(false);
  const [createLotForm, setCreateLotForm] = useState(initialForm);
  const [createLotLoading, setCreateLotLoading] = useState(false);
  const [createLotError, setCreateLotError] = useState(null);

  const validateForm = () => {
    if (!createLotForm.loteo_id || createLotForm.loteo_id === '') {
      return 'Debes seleccionar un loteo';
    }
    if (!createLotForm.price || createLotForm.price === '') {
      return 'El precio es requerido';
    }
    const priceNum = parseFloat(createLotForm.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return 'El precio debe ser un número positivo';
    }
    if (priceNum > MAX_LOT_PRICE) {
      return `El precio no puede superar ${MAX_LOT_PRICE.toLocaleString('es-AR')}`;
    }
    if (!createLotForm.name || createLotForm.name.trim() === '') {
      return 'El nombre del lote es requerido';
    }
    if (!createLotForm.area_m2 || createLotForm.area_m2 === '') {
      return 'El área es requerida';
    }
    const areaNum = parseFloat(createLotForm.area_m2);
    if (isNaN(areaNum) || areaNum <= 0) {
      return 'El área debe ser un número positivo';
    }
    if (areaNum > MAX_LOT_AREA_M2) {
      return `El área no puede superar ${MAX_LOT_AREA_M2.toLocaleString('es-AR')} m²`;
    }
    if (!createLotForm.status) {
      return 'El estado es requerido';
    }
    if (createLotForm.comments?.length > MAX_LOT_COMMENTS_LENGTH) {
      return `Las observaciones no pueden superar los ${MAX_LOT_COMMENTS_LENGTH} caracteres`;
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
        loteOwnerId,
        addActivity,
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
