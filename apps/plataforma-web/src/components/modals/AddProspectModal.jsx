import React, { useRef, useEffect, useState } from 'react';
import { Button, Loader } from '../../ui/components';

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
 */
export default function AddProspectModal({
  isOpen,
  onClose,
  onSubmit,
  loading,
  error,
  addToast,
}) {
  const modalRef = useRef(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    category: 'primer_contacto',
    budget: '',
    payment_method: 'contado',
  });

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        name: '',
        email: '',
        phone: '',
        category: 'primer_contacto',
        budget: '',
        payment_method: 'contado',
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
            />
          </div>
          <div className="form-group">
            <label htmlFor="prospect-email">Correo electrónico</label>
            <input
              id="prospect-email"
              type="email"
              maxLength={254}
              placeholder="ej: usuario@correo.com"
              value={formData.email}
              onChange={e => handleFieldChange('email', e.target.value)}
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
            />
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="prospect-category">Categoría</label>
              <select
                id="prospect-category"
                value={formData.category}
                onChange={e => handleFieldChange('category', e.target.value)}
              >
                <option value="primer_contacto">Primer Contacto</option>
                <option value="seguimiento">Seguimiento</option>
                <option value="negociacion">Negociación</option>
                <option value="vendido">Vendido</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="prospect-budget">Presupuesto</label>
              <input
                id="prospect-budget"
                type="number"
                step="0.01"
                placeholder="Ej: 150000"
                value={formData.budget}
                onChange={e => handleFieldChange('budget', e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="prospect-payment">Forma de pago</label>
            <select
              id="prospect-payment"
              value={formData.payment_method}
              onChange={e => handleFieldChange('payment_method', e.target.value)}
            >
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
            </select>
          </div>
          {error && <div className="status-message error">{error}</div>}
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
