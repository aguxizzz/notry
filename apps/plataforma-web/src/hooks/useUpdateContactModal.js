import { useState } from 'react';
import { updateLastContact as updateLastContactService } from '../api/prospects';

export function useUpdateContactModal({ apiFetch, addToast, onSuccess, loteOwnerId, setActivities }) {
  const [updateContactModalOpen, setUpdateContactModalOpen] = useState(false);
  const [selectedProspectId, setSelectedProspectId] = useState(null);
  const [updateContactLoading, setUpdateContactLoading] = useState(false);
  const [updateContactClosing, setUpdateContactClosing] = useState(false);

  const openUpdateContactModal = (prospectId) => {
    setSelectedProspectId(prospectId);
    setUpdateContactModalOpen(true);
  };

  const closeUpdateContactModal = () => {
    setUpdateContactClosing(true);
    setTimeout(() => {
      setUpdateContactModalOpen(false);
      setUpdateContactClosing(false);
      setSelectedProspectId(null);
    }, 200);
  };

  const handleUpdateContact = async (observationNotes) => {
    if (!selectedProspectId) return;
    await updateLastContactService({
      apiFetch,
      setUpdatingContact: setUpdateContactLoading,
      addToast,
      refreshSync: onSuccess,
      prospectId: selectedProspectId,
      observationNotes,
      onUpdate: closeUpdateContactModal,
      loteOwnerId,
      setActivities,
    });
  };

  return {
    updateContactModalOpen,
    updateContactLoading,
    updateContactClosing,
    selectedProspectId,
    openUpdateContactModal,
    closeUpdateContactModal,
    handleUpdateContact,
  };
}
