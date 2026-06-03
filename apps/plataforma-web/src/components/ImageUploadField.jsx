import React, { useRef, useState, useEffect } from 'react';
import { uploadImage } from '../api/upload';

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif';

export default function ImageUploadField({ value, thumbnailUrl, onUpload, label, apiFetch, uploadFn, onUploadEvent }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  const previewSrc = thumbnailUrl || value;

  useEffect(() => {
    setImgLoaded(false);
  }, [previewSrc]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const jobId = crypto.randomUUID();
    setUploading(true);
    setUploadError(null);
    onUploadEvent?.({ type: 'start', id: jobId, label: label ?? 'Imagen' });

    try {
      let result;
      if (uploadFn) {
        result = await uploadFn(file, {
          onConvertProgress: (percent) =>
            onUploadEvent?.({ type: 'progress', id: jobId, phase: 'converting', percent: Math.round(percent / 2) }),
          onUploadProgress: (percent) =>
            onUploadEvent?.({ type: 'progress', id: jobId, phase: 'uploading', percent: 50 + Math.round(percent / 2) }),
        });
      } else {
        result = await uploadImage(file, apiFetch);
      }
      onUpload(result);
      onUploadEvent?.({ type: 'complete', id: jobId });
    } catch (err) {
      setUploadError(err.message || 'Error al subir la imagen');
      onUploadEvent?.({ type: 'error', id: jobId });
    } finally {
      setUploading(false);
    }
  }

  const showSkeleton = previewSrc && !imgLoaded && !uploading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text)' }}>
          {label}
        </span>
      )}

      <div
        onClick={() => !uploading && inputRef.current?.click()}
        style={{
          position: 'relative',
          width: '100%',
          height: 100,
          borderRadius: 'var(--radius-md)',
          border: previewSrc ? 'none' : '1.5px dashed var(--color-border)',
          background: 'var(--color-bg)',
          cursor: uploading ? 'default' : 'pointer',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color var(--duration-fast)',
        }}
      >
        {showSkeleton && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, var(--color-border) 25%, var(--color-bg) 50%, var(--color-border) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s infinite',
          }} />
        )}

        {previewSrc && (
          <img
            src={previewSrc}
            alt="preview"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              opacity: imgLoaded ? 1 : 0,
              transition: 'opacity 200ms',
            }}
          />
        )}

        {previewSrc && imgLoaded && !uploading && (
          <div
            className="image-upload-overlay"
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0,
              transition: 'opacity var(--duration-fast)',
            }}
          >
            <span style={{ color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>
              Cambiar
            </span>
          </div>
        )}

        {!previewSrc && !uploading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span style={{ fontSize: 'var(--text-sm)' }}>Subir imagen</span>
          </div>
        )}

        {uploading && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(255,255,255,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 22, height: 22,
              border: '2.5px solid var(--color-border)',
              borderTopColor: 'var(--color-accent)',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }} />
          </div>
        )}
      </div>

      {uploadError && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{uploadError}</span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <style>{`
        .image-upload-overlay { opacity: 0; }
        div:hover > .image-upload-overlay { opacity: 1 !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
