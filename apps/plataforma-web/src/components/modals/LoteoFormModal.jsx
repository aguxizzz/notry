import React, { useRef, useEffect } from 'react';
import { Button, Loader } from '../../ui/components';

/**
 * LoteoFormModal — unified modal for creating and editing loteos.
 *
 * @param {Object} props
 * @param {boolean} props.mode - 'create' | 'edit'
 * @param {boolean} props.isOpen
 * @param {boolean} [props.isClosing] - true during the 200ms closing animation (edit mode only)
 * @param {Function} props.onClose
 * @param {Object} props.formData - { name, slug, image_url, blueprint_url }
 * @param {Function} props.onFieldChange - (field, value) => void
 * @param {Function} props.onSubmit
 * @param {boolean} props.loading
 * @param {string|null} props.error
 */
export default function LoteoFormModal({
  mode,
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

  const isCreate = mode === 'create';

  useEffect(() => {
    if (!isOpen || (isCreate ? false : isClosing)) return;
    const focusable = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable?.length > 0) focusable[0].focus();
  }, [isOpen, isClosing, isCreate]);

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
        <h3 className="modal-title">{isCreate ? 'Nuevo Loteo' : 'Editar Loteo'}</h3>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor={isCreate ? 'loteo-name' : 'edit-loteo-name'}>Nombre</label>
            <input
              id={isCreate ? 'loteo-name' : 'edit-loteo-name'}
              type="text"
              required
              value={formData.name}
              onChange={e => onFieldChange('name', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor={isCreate ? 'loteo-slug' : 'edit-loteo-slug'}>Slug</label>
            <input
              id={isCreate ? 'loteo-slug' : 'edit-loteo-slug'}
              type="text"
              required
              value={formData.slug}
              onChange={e => onFieldChange('slug', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor={isCreate ? 'loteo-image-url' : 'edit-loteo-image-url'}>URL de Imagen</label>
            <input
              id={isCreate ? 'loteo-image-url' : 'edit-loteo-image-url'}
              type="text"
              value={formData.image_url}
              onChange={e => onFieldChange('image_url', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor={isCreate ? 'loteo-blueprint-url' : 'edit-loteo-blueprint-url'}>URL de Blueprint</label>
            <input
              id={isCreate ? 'loteo-blueprint-url' : 'edit-loteo-blueprint-url'}
              type="text"
              value={formData.blueprint_url}
              onChange={e => onFieldChange('blueprint_url', e.target.value)}
            />
          </div>
          {error && <div className="status-message error">{error}</div>}
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
              {loading ? <Loader size="sm" /> : isCreate ? 'Crear' : 'Guardar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}