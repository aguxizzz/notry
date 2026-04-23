import { useState } from 'react';
import { saveEditLoteo } from '../api/loteos';

export function useEditLoteoModal({ apiFetch, setInventoryLoteos, addToast, onSuccess, onUpdateLoteo }) {
  const [editLoteoOpen, setEditLoteoOpen] = useState(false);
  const [editLoteoClosing, setEditLoteoClosing] = useState(false);
  const [editingLoteoId, setEditingLoteoId] = useState(null);
  const [editLoteoForm, setEditLoteoForm] = useState({ name: '', slug: '', image_url: '', blueprint_url: '' });
  const [editLoteoLoading, setEditLoteoLoading] = useState(false);
  const [editLoteoError, setEditLoteoError] = useState(null);

  const openEditLoteoModal = (loteo) => {
    setEditingLoteoId(loteo.id);
    setEditLoteoForm({
      name: loteo.name || '',
      slug: loteo.slug || '',
      image_url: loteo.image_url || '',
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

  const submitEditLoteo = async (e) => {
    e.preventDefault();
    setEditLoteoLoading(true);
    setEditLoteoError(null);
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
        fetchInventoryLoteos: onSuccess,
        onUpdateLoteo,
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
