import { useState } from 'react';
import { saveEditLoteo } from '../api/loteos';

export function useEditLoteoModal({ apiFetch, setInventoryLoteos, addToast, onUpdateLoteo, loteOwnerId, addActivity }) {
  const [editLoteoOpen, setEditLoteoOpen] = useState(false);
  const [editLoteoClosing, setEditLoteoClosing] = useState(false);
  const [editingLoteoId, setEditingLoteoId] = useState(null);
  const [editLoteoForm, setEditLoteoForm] = useState({ name: '', slug: '', image_url: '', thumbnail_url: '', blueprint_url: '' });
  const [editLoteoLoading, setEditLoteoLoading] = useState(false);
  const [editLoteoError, setEditLoteoError] = useState(null);

  const openEditLoteoModal = (loteo) => {
    setEditingLoteoId(loteo.id);
    setEditLoteoForm({
      name: loteo.name || '',
      slug: loteo.slug || '',
      image_url: loteo.image_url || '',
      thumbnail_url: loteo.thumbnail_url || '',
      blueprint_url: loteo.blueprint_url || '',
    });
    setEditLoteoOpen(true);
    setEditLoteoError(null);
  };

  const closeEditLoteoModal = () => {
    setEditLoteoClosing(true);
    setTimeout(() => {
      setEditLoteoOpen(false);
      setEditLoteoClosing(false);
    }, 200);
  };

  const validateForm = (formData) => {
    if (!formData.name || formData.name.trim() === '') {
      return 'El nombre del loteo es requerido';
    }
    return null;
  };

  const submitEditLoteo = async (e) => {
    e.preventDefault();
    setEditLoteoLoading(true);
    setEditLoteoError(null);

    const validationError = validateForm(editLoteoForm);
    if (validationError) {
      setEditLoteoError(validationError);
      setEditLoteoLoading(false);
      return;
    }

    try {
      await saveEditLoteo({
        apiFetch,
        editingLoteoId,
        editLoteoForm,
        addToast,
        setEditLoteoLoading,
        setEditLoteoError,
        setEditLoteoClosing,
        setEditLoteoOpen,
        setEditingLoteoId,
        setInventoryLoteos,
        onUpdateLoteo,
        loteOwnerId,
        addActivity,
      });
    } catch (err) {
      setEditLoteoError(err.message);
    } finally {
      setEditLoteoLoading(false);
    }
  };

  return {
    editLoteoOpen,
    editLoteoClosing,
    editingLoteoId,
    editLoteoForm,
    setEditLoteoForm,
    editLoteoLoading,
    editLoteoError,
    openEditLoteoModal,
    closeEditLoteoModal,
    submitEditLoteo,
  };
}
