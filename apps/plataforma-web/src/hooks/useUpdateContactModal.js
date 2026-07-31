import { useState } from 'react';
import { updateLastContact as updateLastContactService } from '../api/prospects';

export function useUpdateContactModal({ apiFetch, addToast, onSuccess, loteOwnerId, addActivity }) {
  const [updateContactModalOpen, setUpdateContactModalOpen] = useState(false);
  const [selectedProspectId, setSelectedProspectId] = useState(null);
  const [selectedProspectName, setSelectedProspectName] = useState(null);
  const [updateContactLoading, setUpdateContactLoading] = useState(false);
  const [updateContactClosing, setUpdateContactClosing] = useState(false);

  const openUpdateContactModal = (prospectId, prospectName) => {
    setSelectedProspectId(prospectId);
    setSelectedProspectName(prospectName);
    setUpdateContactModalOpen(true);
  };

  const closeUpdateContactModal = () => {
    setUpdateContactClosing(true);
    setTimeout(() => {
      setUpdateContactModalOpen(false);
      setUpdateContactClosing(false);
      setSelectedProspectId(null);
      setSelectedProspectName(null);
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
      prospectName: selectedProspectName,
      observationNotes,
      onUpdate: closeUpdateContactModal,
      loteOwnerId,
      addActivity,
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
