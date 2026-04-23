import { useState } from 'react';
import { createLoteo } from '../api/loteos';

export function useCreateLoteoModal({ apiFetch, onSuccess, onAddLoteo }) {
  const [createLoteoOpen, setCreateLoteoOpen] = useState(false);
  const [createLoteoForm, setCreateLoteoForm] = useState({ name: '', slug: '', image_url: '', blueprint_url: '' });
  const [createLoteoLoading, setCreateLoteoLoading] = useState(false);
  const [createLoteoError, setCreateLoteoError] = useState(null);

  const openCreateLoteoModal = () => {
    setCreateLoteoOpen(true);
    setCreateLoteoError(null);
  };

  const closeCreateLoteoModal = () => {
    setCreateLoteoOpen(false);
    setCreateLoteoForm({ name: '', slug: '', image_url: '', blueprint_url: '' });
  };

  const submitCreateLoteo = async (e) => {
    e.preventDefault();
    setCreateLoteoLoading(true);
    setCreateLoteoError(null);
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
