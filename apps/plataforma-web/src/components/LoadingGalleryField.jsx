import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, X, ImagePlus } from 'lucide-react';
import './LoadingGalleryField.css';

// Fotos del desarrollo que el visor muestra en su pantalla de carga:
// [{ url, caption }]. Mismo tope que MAX_LOADING_GALLERY del visor y del back.
export const MAX_LOADING_GALLERY = 6;
// Se ven a pantalla completa pero detrás del progreso: 1600px en webp alcanza
// y evita subir fotos de cámara de varios MB que frenarían la propia carga.
const GALLERY_MAX_SIZE = 1600;
const ACCEPTED = 'image/jpeg,image/png,image/webp';

export default function LoadingGalleryField({ value, onChange, uploadFn, onUploadEvent, label = 'Fotos de la pantalla de carga', hint, kind = 'galeria' }) {
  const items = value ?? [];
  const inputRef = useRef(null);
  const [pending, setPending] = useState([]); // [{ id, preview }]
  const [error, setError] = useState(null);

  // Las subidas terminan de a una y fuera del render: leen siempre la lista
  // vigente para no pisar lo que se agregó/editó mientras tanto.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => pending.forEach(p => URL.revokeObjectURL(p.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const slotsLeft = MAX_LOADING_GALLERY - items.length - pending.length;

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setError(null);

    const accepted = files.slice(0, Math.max(slotsLeft, 0));
    if (accepted.length < files.length) {
      setError(`Máximo ${MAX_LOADING_GALLERY} fotos: se agregaron ${accepted.length} de ${files.length}.`);
    }
    const jobs = accepted.map(file => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
    setPending(prev => [...prev, ...jobs.map(({ id, preview }) => ({ id, preview }))]);

    // En serie para respetar el orden en que se eligieron.
    for (const job of jobs) {
      onUploadEvent?.({ type: 'start', id: job.id, label: 'Foto de carga' });
      try {
        const { url } = await uploadFn(job.file, {
          kind,
          maxSize: GALLERY_MAX_SIZE,
          onConvertProgress: (percent) =>
            onUploadEvent?.({ type: 'progress', id: job.id, phase: 'converting', percent: Math.round(percent / 2) }),
          onUploadProgress: (percent) =>
            onUploadEvent?.({ type: 'progress', id: job.id, phase: 'uploading', percent: 50 + Math.round(percent / 2) }),
        });
        onChange([...itemsRef.current, { url, caption: '' }]);
        onUploadEvent?.({ type: 'complete', id: job.id });
      } catch (err) {
        setError(err.message || 'No se pudo subir la foto');
        onUploadEvent?.({ type: 'error', id: job.id });
      } finally {
        URL.revokeObjectURL(job.preview);
        setPending(prev => prev.filter(p => p.id !== job.id));
      }
    }
  }

  const move = (index, delta) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };

  const setCaption = (index, caption) =>
    onChange(items.map((item, i) => (i === index ? { ...item, caption } : item)));

  const remove = (index) => onChange(items.filter((_, i) => i !== index));

  return (
    <div className="loading-gallery">
      <div className="loading-gallery__head">
        <span className="form-label">{label}</span>
        <span className="loading-gallery__count">{items.length + pending.length} / {MAX_LOADING_GALLERY}</span>
      </div>
      {hint && <p className="form-hint loading-gallery__hint">{hint}</p>}

      {(items.length > 0 || pending.length > 0) && (
        <ol className="loading-gallery__list">
          {items.map((item, index) => (
            <li key={item.url} className="loading-gallery__row">
              <span className="loading-gallery__index">{String(index + 1).padStart(2, '0')}</span>
              <img className="loading-gallery__thumb" src={item.url} alt="" loading="lazy" />
              <input
                type="text"
                className="loading-gallery__caption"
                value={item.caption ?? ''}
                onChange={e => setCaption(index, e.target.value)}
                placeholder="Leyenda (opcional)"
                maxLength={120}
                aria-label={`Leyenda de la foto ${index + 1}`}
                autoComplete="off"
              />
              <div className="loading-gallery__actions">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} title="Subir" aria-label={`Subir foto ${index + 1}`}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} title="Bajar" aria-label={`Bajar foto ${index + 1}`}>
                  <ArrowDown size={14} />
                </button>
                <button type="button" className="is-danger" onClick={() => remove(index)} title="Quitar" aria-label={`Quitar foto ${index + 1}`}>
                  <X size={14} />
                </button>
              </div>
            </li>
          ))}
          {pending.map(p => (
            <li key={p.id} className="loading-gallery__row is-pending">
              <span className="loading-gallery__index">··</span>
              <span className="loading-gallery__thumb-wrap">
                <img className="loading-gallery__thumb" src={p.preview} alt="" />
                <span className="loading-gallery__spinner" />
              </span>
              <span className="loading-gallery__pending-label">Subiendo…</span>
            </li>
          ))}
        </ol>
      )}

      {slotsLeft > 0 && (
        <button type="button" className="loading-gallery__add" onClick={() => inputRef.current?.click()} disabled={!uploadFn}>
          <ImagePlus size={16} />
          {items.length || pending.length ? 'Agregar más fotos' : 'Agregar fotos'}
        </button>
      )}

      {error && <span className="loading-gallery__error">{error}</span>}

      <input ref={inputRef} type="file" accept={ACCEPTED} multiple hidden onChange={handleFiles} />
    </div>
  );
}
