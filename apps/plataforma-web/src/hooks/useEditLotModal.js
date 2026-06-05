import { useState } from 'react';
import { patchLot } from '../api/lots';

export function useEditLotModal({ apiFetch, onSuccess, onUpdateLot, loteOwnerId, setActivities }) {
  const [editLotModalOpen, setEditLotModalOpen] = useState(false);
  const [editingLotId, setEditingLotId] = useState(null);
  const [editLotForm, setEditLotForm] = useState({ status: '', price: '', area_m2: '', comments: '' });
  const [editLotLoading, setEditLotLoading] = useState(false);
  const [editLotError, setEditLotError] = useState(null);
  const [editLotClosing, setEditLotClosing] = useState(false);

  const openEditLotModal = (lot) => {
    setEditLotForm({
      name: lot.name || '',
      loteo_id: lot.loteo_id || '',
      status: lot.status || 'available',
      price: lot.price != null ? String(lot.price) : '',
      area_m2: lot.area_m2 != null ? String(lot.area_m2) : '',
      comments: lot.comments || '',
    });
    setEditLotError(null);
    setEditingLotId(lot.id);
    setEditLotModalOpen(true);
  };

  const closeEditLotModal = () => {
    setEditLotClosing(true);
    setTimeout(() => {
      setEditLotModalOpen(false);
      setEditLotClosing(false);
      setEditingLotId(null);
      setEditLotForm({ status: '', price: '', area_m2: '', comments: '' });
    }, 200);
  };

  const validateForm = () => {
    if (!editLotForm.loteo_id || editLotForm.loteo_id === '') {
      return 'Debes seleccionar un loteo';
    }
    if (!editLotForm.name || editLotForm.name.trim() === '') {
      return 'El nombre del lote es requerido';
    }
    if (!editLotForm.price || editLotForm.price === '') {
      return 'El precio es requerido';
    }
    const priceNum = parseFloat(editLotForm.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return 'El precio debe ser un número positivo';
    }
    if (!editLotForm.area_m2 || editLotForm.area_m2 === '') {
      return 'El área es requerida';
    }
    const areaNum = parseFloat(editLotForm.area_m2);
    if (isNaN(areaNum) || areaNum <= 0) {
      return 'El área debe ser un número positivo';
    }
    if (!editLotForm.status) {
      return 'El estado es requerido';
    }
    return null;
  };

  const saveLotFromModal = async (e) => {
    e.preventDefault();
    setEditLotError(null);

    const validationError = validateForm();
    if (validationError) {
      setEditLotError(validationError);
      return;
    }

    setEditLotLoading(true);
    try {
      await patchLot({ apiFetch, editingLotId, editLotForm, loteOwnerId, setActivities });
      const updates = { status: editLotForm.status };
      if (editLotForm.name) updates.name = editLotForm.name;
      if (editLotForm.loteo_id) updates.loteo_id = editLotForm.loteo_id;
      if (editLotForm.price !== '') updates.price = parseFloat(editLotForm.price);
      if (editLotForm.area_m2 !== '') updates.area_m2 = parseFloat(editLotForm.area_m2);
      if (editLotForm.comments?.trim()) updates.comments = editLotForm.comments.trim();
      else updates.comments = null;
      onUpdateLot?.(editingLotId, updates);
      onSuccess?.();
      closeEditLotModal();
    } catch (err) {
      setEditLotError(err.message);
    } finally {
      setEditLotLoading(false);
    }
  };

  return {
    editLotModalOpen,
    editLotForm,
    setEditLotForm,
    editLotLoading,
    editLotError,
    editLotClosing,
    openEditLotModal,
    closeEditLotModal,
    saveLotFromModal,
  };
}
