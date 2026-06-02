import React, { useRef, useState } from 'react';
import { uploadImage } from '../api/upload';

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif';

/**
 * @param {string} value - URL original de la imagen (para guardar en DB)
 * @param {string} thumbnailUrl - URL del thumbnail (para mostrar en preview)
 * @param {({url, thumbnailUrl}) => void} onUpload - callback con ambas URLs tras upload
 * @param {string} label
 * @param {Function} apiFetch
 */
export default function ImageUploadField({ value, thumbnailUrl, onUpload, label, apiFetch }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const previewSrc = thumbnailUrl || value;

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadImage(file, apiFetch);
      onUpload(result);
    } catch (err) {
      setUploadError(err.message || 'Error al subir la imagen');
    } finally {
      setUploading(false);
    }
  }

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
          background: previewSrc ? 'transparent' : 'var(--color-bg)',
          cursor: uploading ? 'default' : 'pointer',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color var(--duration-fast)',
        }}
      >
        {previewSrc && (
          <img
            src={previewSrc}
            alt="preview"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}

        {previewSrc && !uploading && (
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
      `}</style>
    </div>
  );
}
