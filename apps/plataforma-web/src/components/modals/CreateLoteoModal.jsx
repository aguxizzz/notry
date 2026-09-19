import React, { useRef, useEffect } from 'react';
import { Button, Loader } from '../../ui/components';
import '../../ui/components/Modal.css';

/**
 * CreateLoteoModal — modal form for creating a new loteo.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {Object} props.formData - { name, slug, image_url, blueprint_url }
 * @param {Function} props.onFieldChange - (field, value) => void
 * @param {Function} props.onSubmit
 * @param {boolean} props.loading
 * @param {string|null} props.error
 * @param {Function} props.isValidHttpsUrl
 */
export default function CreateLoteoModal({
  isOpen,
  onClose,
  formData,
  onFieldChange,
  onSubmit,
  loading,
  error,
}) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const focusable = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable?.length > 0) focusable[0].focus();
  }, [isOpen]);

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
        <h3 className="modal-title">Nuevo Loteo</h3>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="loteo-name">Nombre</label>
            <input
              id="loteo-name"
              type="text"
              required
              value={formData.name}
              onChange={e => onFieldChange('name', e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label htmlFor="loteo-slug">Slug</label>
            <input
              id="loteo-slug"
              type="text"
              required
              value={formData.slug}
              onChange={e => onFieldChange('slug', e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label htmlFor="loteo-image-url">URL de Imagen</label>
            <input
              id="loteo-image-url"
              type="text"
              value={formData.image_url}
              onChange={e => onFieldChange('image_url', e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label htmlFor="loteo-blueprint-url">URL de Blueprint</label>
            <input
              id="loteo-blueprint-url"
              type="text"
              value={formData.blueprint_url}
              onChange={e => onFieldChange('blueprint_url', e.target.value)}
              autoComplete="off"
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
