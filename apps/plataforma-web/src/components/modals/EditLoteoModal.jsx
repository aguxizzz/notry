import React, { useRef, useEffect } from 'react';
import { Button, Loader } from '../../ui/components';
import '../../ui/components/Modal.css';

/**
 * EditLoteoModal — modal form for editing an existing loteo.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {boolean} props.isClosing - true during the 200ms closing animation
 * @param {Function} props.onClose
 * @param {Object} props.formData - { name, slug, image_url, blueprint_url }
 * @param {Function} props.onFieldChange - (field, value) => void
 * @param {Function} props.onSubmit
 * @param {boolean} props.loading
 * @param {string|null} props.error
 */
export default function EditLoteoModal({
  isOpen,
  isClosing,
  onClose,
  formData,
  onFieldChange,
  onSubmit,
  loading,
  error,
}) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen || isClosing) return;
    const focusable = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable?.length > 0) focusable[0].focus();
  }, [isOpen, isClosing]);

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
        <h3 className="modal-title">Editar Loteo</h3>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="edit-loteo-name">Nombre</label>
            <input
              id="edit-loteo-name"
              type="text"
              required
              value={formData.name}
              onChange={e => onFieldChange('name', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-loteo-slug">Slug</label>
            <input
              id="edit-loteo-slug"
              type="text"
              required
              value={formData.slug}
              onChange={e => onFieldChange('slug', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-loteo-image-url">URL de Imagen</label>
            <input
              id="edit-loteo-image-url"
              type="text"
              value={formData.image_url}
              onChange={e => onFieldChange('image_url', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-loteo-blueprint-url">URL de Blueprint</label>
            <input
              id="edit-loteo-blueprint-url"
              type="text"
              value={formData.blueprint_url}
              onChange={e => onFieldChange('blueprint_url', e.target.value)}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={loading}>
              {loading ? <Loader size="sm" /> : 'Guardar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
