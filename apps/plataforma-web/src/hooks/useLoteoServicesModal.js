import { useState } from 'react';
import { saveLoteoServices } from '../api/loteos';

/**
 * Maneja el modal de "servicios del loteo" (agua, luz, gas, etc.): abrir con
 * el estado actual, guardar la lista completa como PATCH de `services`.
 */
export function useLoteoServicesModal({ apiFetch, addToast, onUpdateLoteo, loteOwnerId, addActivity }) {
  const [servicesModalOpen, setServicesModalOpen] = useState(false);
  const [servicesLoteo, setServicesLoteo] = useState(null);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState(null);

  const openServicesModal = (loteo) => {
    setServicesLoteo(loteo);
    setServicesError(null);
    setServicesModalOpen(true);
  };

  const closeServicesModal = () => {
    setServicesModalOpen(false);
    setServicesLoteo(null);
    setServicesError(null);
  };

  const submitServices = async (services) => {
    if (!servicesLoteo) return;
    setServicesLoading(true);
    setServicesError(null);
    try {
      await saveLoteoServices({
        apiFetch,
        loteoId: servicesLoteo.id,
        loteoName: servicesLoteo.name,
        services,
        addToast,
        onUpdateLoteo,
        loteOwnerId,
        addActivity,
      });
      closeServicesModal();
    } catch (err) {
      setServicesError(err.message);
    } finally {
      setServicesLoading(false);
    }
  };

  return {
    servicesModalOpen,
    servicesLoteo,
    servicesLoading,
    servicesError,
    openServicesModal,
    closeServicesModal,
    submitServices,
  };
}
