import { useState } from 'react';
import { createLoteo } from '../api/loteos';

export function useCreateLoteoModal({ apiFetch, onSuccess, onAddLoteo, loteOwnerId, addActivity, existingLoteos = [] }) {
  const [createLoteoOpen, setCreateLoteoOpen] = useState(false);
  const [createLoteoForm, setCreateLoteoForm] = useState({ name: '', slug: '', image_url: '', thumbnail_url: '', blueprint_url: '', panorama_width: null, panorama_height: null, latitude: '', longitude: '', loading_gallery: [] });
  const [createLoteoLoading, setCreateLoteoLoading] = useState(false);
  const [createLoteoError, setCreateLoteoError] = useState(null);

  const openCreateLoteoModal = () => {
    setCreateLoteoOpen(true);
    setCreateLoteoError(null);
  };

  const closeCreateLoteoModal = () => {
    setCreateLoteoOpen(false);
    setCreateLoteoForm({ name: '', slug: '', image_url: '', thumbnail_url: '', blueprint_url: '', panorama_width: null, panorama_height: null, latitude: '', longitude: '', loading_gallery: [] });
  };

  const validateForm = (formData) => {
    if (!formData.name || formData.name.trim() === '') {
      return 'El nombre del loteo es requerido';
    }
    const normalizedName = formData.name.trim().toLocaleLowerCase('es');
    const normalizedSlug = formData.slug.trim().toLocaleLowerCase('es');
    if ((existingLoteos || []).some(loteo => (
      loteo.name?.trim().toLocaleLowerCase('es') === normalizedName
      || (normalizedSlug && loteo.slug?.trim().toLocaleLowerCase('es') === normalizedSlug)
    ))) {
      return 'Ya existe un loteo con ese nombre o slug.';
    }
    return null;
  };

  const submitCreateLoteo = async (e) => {
    e.preventDefault();
    setCreateLoteoLoading(true);
    setCreateLoteoError(null);

    const validationError = validateForm(createLoteoForm);
    if (validationError) {
      setCreateLoteoError(validationError);
      setCreateLoteoLoading(false);
      return;
    }

    try {
      await createLoteo({
        apiFetch,
        createLoteoForm,
        setCreateLoteoLoading,
        setCreateLoteoError,
        setCreateLoteoOpen,
        setCreateLoteoForm,
        onSuccess,
        onAddLoteo,
        loteOwnerId,
        addActivity,
      });
    } catch (err) {
      setCreateLoteoError(err.message);
    } finally {
      setCreateLoteoLoading(false);
    }
  };

  return {
    createLoteoOpen,
    createLoteoForm,
    setCreateLoteoForm,
    createLoteoLoading,
    createLoteoError,
    openCreateLoteoModal,
    closeCreateLoteoModal,
    submitCreateLoteo,
  };
}
