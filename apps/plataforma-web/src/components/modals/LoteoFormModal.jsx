import React, { useRef, useEffect } from 'react';
import { Button, Loader } from '../../ui/components';
import '../../ui/components/Modal.css';
import ImageUploadField from '../ImageUploadField';

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
 * @param {Function} props.apiFetch
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
  apiFetch,
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
            <ImageUploadField
              label="Imagen de portada"
              value={formData.image_url}
              thumbnailUrl={formData.thumbnail_url}
              onUpload={({ url, thumbnailUrl }) => {
                onFieldChange('image_url', url);
                onFieldChange('thumbnail_url', thumbnailUrl);
              }}
              apiFetch={apiFetch}
            />
          </div>
          <div className="form-group">
            <ImageUploadField
              label="Blueprint"
              value={formData.blueprint_url}
              onUpload={({ url }) => onFieldChange('blueprint_url', url)}
              apiFetch={apiFetch}
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
              {loading ? <Loader size="sm" /> : isCreate ? 'Crear' : 'Guardar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}