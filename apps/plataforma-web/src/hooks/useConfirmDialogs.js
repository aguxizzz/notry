import { useState } from 'react';
import { deleteLot } from '../api/lots';
import { handleDeleteProspectConfirm as handleDeleteProspectConfirmService } from '../api/prospects';

export function useConfirmDialogs({ apiFetch, addToast, onSuccess }) {
  const [confirmDialog, setConfirmDialog] = useState({ open: false, lot: null, loading: false });
  const [deleteProspectDialog, setDeleteProspectDialog] = useState({ open: false, prospect: null, loading: false });

  const openDeleteConfirm = (lot) => {
    setConfirmDialog({ open: true, lot, loading: false });
  };

  const handleDeleteConfirm = async (fetchInventoryBg) => {
    const lot = confirmDialog.lot;
    if (!lot) return;
    setConfirmDialog(prev => ({ ...prev, loading: true }));
    try {
      await deleteLot({ apiFetch, lotId: lot.id });
      addToast(`Lote "${lot.name}" eliminado.`, 'success');
      await fetchInventoryBg();
      setConfirmDialog({ open: false, lot: null, loading: false });
      onSuccess?.();
    } catch (err) {
      addToast(`Error: ${err.message}`, 'error');
      setConfirmDialog(prev => ({ ...prev, loading: false }));
    }
  };

  const openDeleteProspectDialog = (prospect) => {
    setDeleteProspectDialog({ open: true, prospect, loading: false });
  };

  const handleDeleteProspectConfirm = async () => {
    await handleDeleteProspectConfirmService({
      apiFetch,
      deleteProspectDialog,
      addToast,
      setDeleteProspectDialog,
      refreshSync: onSuccess,
    });
  };

  return {
    confirmDialog,
    deleteProspectDialog,
    openDeleteConfirm,
    handleDeleteConfirm,
    openDeleteProspectDialog,
    handleDeleteProspectConfirm,
    closeConfirmDialog: () => setConfirmDialog({ open: false, lot: null, loading: false }),
    closeDeleteProspectDialog: () => setDeleteProspectDialog({ open: false, prospect: null, loading: false }),
  };
}