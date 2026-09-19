import React, { useRef, useEffect, useState } from 'react';
import { Button, Loader, Select } from '../../ui/components';
import '../../ui/components/Modal.css';

/**
 * AddProspectModal — modal form for adding a new prospect.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {Function} props.onSubmit - async (formData) => void
 * @param {boolean} props.loading
 * @param {string|null} props.error
 * @param {Function} props.addToast
 * @param {Array}  props.loteosList    - list of lots to display in the selector (from sync inventoryLots)
 */
export default function AddProspectModal({
  isOpen,
  onClose,
  onSubmit,
  loading,
  error,
  loteosList = [],
}) {
  const modalRef = useRef(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    category: 'primer_contacto',
    lote_id: '',
  });

  useEffect(() => {
    if (!isOpen) {
      // Reset the form when the modal closes so the next opening is clean.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        name: '',
        email: '',
        phone: '',
        category: 'primer_contacto',
        lote_id: '',
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const focusable = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable?.length > 0) focusable[0].focus();
  }, [isOpen]);

  const handleFieldChange = (field, value) => {
    setFormData(f => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-card"
        onClick={e => e.stopPropagation()}
        aria-modal="true"
        role="dialog"
      >
        <h3 className="modal-title">Nuevo Prospecto</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="prospect-name">Nombre *</label>
            <input
              id="prospect-name"
              type="text"
              required
              maxLength={200}
              value={formData.name}
              onChange={e => handleFieldChange('name', e.target.value)}
              autoComplete="off"
            />
          </div>
          <Select
            id="prospect-lote"
            label="Lote"
            value={formData.lote_id}
            onChange={e => handleFieldChange('lote_id', e.target.value)}
            options={[
              { value: '', label: 'Sin asignar' },
              ...loteosList.map(lot => ({ value: String(lot.id), label: lot.name })),
            ]}
          />
          <div className="form-group">
            <label htmlFor="prospect-email">Correo electrónico</label>
            <input
              id="prospect-email"
              type="email"
              maxLength={254}
              placeholder="ej: usuario@correo.com"
              value={formData.email}
              onChange={e => handleFieldChange('email', e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label htmlFor="prospect-phone">Teléfono</label>
            <input
              id="prospect-phone"
              type="tel"
              maxLength={20}
              placeholder="ej: +52 55 1234 5678"
              value={formData.phone}
              onChange={e => handleFieldChange('phone', e.target.value)}
              autoComplete="off"
            />
          </div>
          <Select
            id="prospect-category"
            label="Categoría"
            value={formData.category}
            onChange={e => handleFieldChange('category', e.target.value)}
            options={[
              { value: 'primer_contacto', label: 'Primer Contacto' },
              { value: 'seguimiento', label: 'Seguimiento' },
              { value: 'negociacion', label: 'Negociación' },
              { value: 'vendido', label: 'Vendido' },
            ]}
          />
          <div className="form-group">
            <label htmlFor="prospect-origin">Origen</label>
            <input
              id="prospect-origin"
              type="text"
              value="Plataforma Web"
              disabled
              readOnly
            />
          </div>
          {error && (
            <div className="status-message error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 20h20L12 2z" />
                <path d="M12 9v4" />
                <circle cx="12" cy="17" r="1" fill="currentColor" />
              </svg>
              {error}
            </div>
          )}
          <div className="modal-footer">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={loading}>
              {loading ? <Loader size="sm" /> : 'Crear'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
