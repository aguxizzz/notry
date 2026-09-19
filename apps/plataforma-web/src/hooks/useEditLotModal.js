import { useState } from 'react';
import { patchLot } from '../api/lots';
import { API_BASE } from '../config';
import { MAX_LOT_AREA_M2, MAX_LOT_COMMENTS_LENGTH, MAX_LOT_PRICE } from '../ui/forms/lotFields';

export function useEditLotModal({ apiFetch, onSuccess, onUpdateLot, loteOwnerId, addActivity }) {
  const [editLotModalOpen, setEditLotModalOpen] = useState(false);
  const [editingLotId, setEditingLotId] = useState(null);
  const [editLotForm, setEditLotForm] = useState({ status: '', price: '', area_m2: '', comments: '' });
  const [editLotLoading, setEditLotLoading] = useState(false);
  const [editLotError, setEditLotError] = useState(null);
  const [editLotClosing, setEditLotClosing] = useState(false);
  const [editLotOriginalLoteoId, setEditLotOriginalLoteoId] = useState(null);
  const [editLotHasGeometry, setEditLotHasGeometry] = useState(false);

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
    setEditLotOriginalLoteoId(lot.loteo_id || null);
    // inventoryLots viene de /sync, que usa una proyección liviana sin
    // coordinates_360/blueprint_coordinates (son arrays pesados que no tiene
    // sentido pollear cada 60s). Se pide el detalle completo del lote para
    // saber si tiene geometría dibujada y poder avisar si se pierde al
    // cambiar de loteo.
    setEditLotHasGeometry(false);
    apiFetch(`${API_BASE}/lots/${lot.id}`)
      .then((fullLot) => {
        setEditLotHasGeometry(
          (fullLot.coordinates_360?.length > 0) || (fullLot.blueprint_coordinates?.length > 0)
        );
      })
      .catch(() => {});
    setEditLotModalOpen(true);
  };

  const closeEditLotModal = () => {
    setEditLotClosing(true);
    setTimeout(() => {
      setEditLotModalOpen(false);
      setEditLotClosing(false);
      setEditingLotId(null);
      setEditLotForm({ status: '', price: '', area_m2: '', comments: '' });
      setEditLotOriginalLoteoId(null);
      setEditLotHasGeometry(false);
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
    if (priceNum > MAX_LOT_PRICE) {
      return `El precio no puede superar ${MAX_LOT_PRICE.toLocaleString('es-AR')}`;
    }
    if (!editLotForm.area_m2 || editLotForm.area_m2 === '') {
      return 'El área es requerida';
    }
    const areaNum = parseFloat(editLotForm.area_m2);
    if (isNaN(areaNum) || areaNum <= 0) {
      return 'El área debe ser un número positivo';
    }
    if (areaNum > MAX_LOT_AREA_M2) {
      return `El área no puede superar ${MAX_LOT_AREA_M2.toLocaleString('es-AR')} m²`;
    }
    if (!editLotForm.status) {
      return 'El estado es requerido';
    }
    if (editLotForm.comments?.length > MAX_LOT_COMMENTS_LENGTH) {
      return `Las observaciones no pueden superar los ${MAX_LOT_COMMENTS_LENGTH} caracteres`;
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
      await patchLot({ apiFetch, editingLotId, editLotForm, loteOwnerId, addActivity });
      const updates = { status: editLotForm.status };
      if (editLotForm.name) updates.name = editLotForm.name;
      if (editLotForm.loteo_id) updates.loteo_id = editLotForm.loteo_id;
      if (editLotForm.price !== '') updates.price = parseFloat(editLotForm.price);
      if (editLotForm.area_m2 !== '') updates.area_m2 = parseFloat(editLotForm.area_m2);
      if (editLotForm.comments?.trim()) updates.comments = editLotForm.comments.trim();
      else updates.comments = null;
      if (
        editLotOriginalLoteoId != null &&
        editLotForm.loteo_id &&
        editLotForm.loteo_id !== editLotOriginalLoteoId
      ) {
        updates.coordinates_360 = null;
        updates.blueprint_coordinates = null;
      }
      onUpdateLot?.(editingLotId, updates);
      onSuccess?.();
      closeEditLotModal();
    } catch (err) {
      setEditLotError(err.message);
    } finally {
      setEditLotLoading(false);
    }
  };

  const editLotWillLoseGeometry =
    editLotHasGeometry &&
    editLotOriginalLoteoId != null &&
    editLotForm.loteo_id &&
    editLotForm.loteo_id !== editLotOriginalLoteoId;

  return {
    editLotModalOpen,
    editLotForm,
    setEditLotForm,
    editLotLoading,
    editLotError,
    editLotClosing,
    editLotWillLoseGeometry,
    openEditLotModal,
    closeEditLotModal,
    saveLotFromModal,
  };
}
