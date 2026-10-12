import React, { useRef, useEffect, useState } from 'react';
import { Button, Loader } from '../../ui/components';
import '../../ui/components/Modal.css';
import ImageUploadField from '../ImageUploadField';
import LocationPickerMap from '../LocationPickerMap';

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
  uploadFn,
  onUploadEvent,
}) {
  const modalRef = useRef(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);

  const isCreate = mode === 'create';
  const hasCoords =
    formData.latitude !== '' && formData.latitude != null &&
    formData.longitude !== '' && formData.longitude != null;

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
        className="modal-card modal-card--wide"
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
              autoComplete="off"
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
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <ImageUploadField
              label="Imagen de portada"
              value={formData.image_url}
              thumbnailUrl={formData.thumbnail_url}
              onUpload={({ url, thumbnailUrl, width, height }) => {
                onFieldChange('image_url', url);
                onFieldChange('thumbnail_url', thumbnailUrl);
                onFieldChange('panorama_width', width);
                onFieldChange('panorama_height', height);
              }}
              apiFetch={apiFetch}
              uploadFn={uploadFn}
              onUploadEvent={onUploadEvent}
              kind="panorama"
            />
          </div>
          <div className="form-group">
            <ImageUploadField
              label="Blueprint"
              value={formData.blueprint_url}
              onUpload={({ url }) => onFieldChange('blueprint_url', url)}
              apiFetch={apiFetch}
              uploadFn={uploadFn}
              onUploadEvent={onUploadEvent}
              kind="plano"
            />
          </div>
          <div className="form-group">
            <label>Ubicación</label>
            <div className="location-summary">
              <span className="location-summary__coords">
                {hasCoords
                  ? `${Number(formData.latitude).toFixed(6)}, ${Number(formData.longitude).toFixed(6)}`
                  : 'Sin definir'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLocationPickerOpen(true)}
              >
                Seleccionar ubicación
              </Button>
            </div>
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
      {locationPickerOpen && (
        <div
          className="location-overlay"
          onClick={e => {
            e.stopPropagation();
            setLocationPickerOpen(false);
          }}
        >
          <div
            className="location-overlay__panel"
            onClick={e => e.stopPropagation()}
          >
            <div className="location-overlay__header">
              <h4>Seleccionar ubicación</h4>
              <button
                type="button"
                className="location-overlay__close"
                onClick={() => setLocationPickerOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <LocationPickerMap
              latitude={formData.latitude === '' ? null : formData.latitude}
              longitude={formData.longitude === '' ? null : formData.longitude}
              onChange={({ latitude, longitude }) => {
                onFieldChange('latitude', latitude);
                onFieldChange('longitude', longitude);
              }}
            />
            <div className="form-group form-group--coords location-overlay__coords">
              <div>
                <label htmlFor={isCreate ? 'loteo-latitude' : 'edit-loteo-latitude'}>Latitud</label>
                <input
                  id={isCreate ? 'loteo-latitude' : 'edit-loteo-latitude'}
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={e => onFieldChange('latitude', e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor={isCreate ? 'loteo-longitude' : 'edit-loteo-longitude'}>Longitud</label>
                <input
                  id={isCreate ? 'loteo-longitude' : 'edit-loteo-longitude'}
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={e => onFieldChange('longitude', e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="location-overlay__footer">
              <Button type="button" size="sm" onClick={() => setLocationPickerOpen(false)}>
                Listo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
