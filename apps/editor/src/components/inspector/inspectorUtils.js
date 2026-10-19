import { useState } from 'react';

// Mismos tonos que LOT_STATUS_STYLES (utils/lotStyles.js): así el botón de
// estado se ve del color con el que el lote aparece en el plano y el visor.
export const LOT_STATUS_OPTIONS = [
  { value: 'available', label: 'Disponible', color: '#22c55e' },
  { value: 'reserved', label: 'Reservado', color: '#3b82f6' },
  { value: 'sold', label: 'Vendido', color: '#ef4444' },
  { value: 'unavailable', label: 'No disponible', color: '#9ca3af' },
];

export const statusColor = status => (
  LOT_STATUS_OPTIONS.find(option => option.value === status)?.color ?? 'var(--accent)'
);

export const ACCEPTED_IMAGES = 'image/jpeg,image/png,image/webp,image/gif';

// Número con separador de miles y coma decimal (es-AR). El valor viaja como
// string con punto decimal, igual que lo dejaba el input numérico anterior.
// El back devuelve los Numeric como "150000.00": esos ceros no se muestran.
export const numberToDisplay = value => {
  if (value === '' || value == null) return '';
  const [int, rawDec] = String(value).split('.');
  const dec = rawDec === '00' ? undefined : rawDec;
  const intText = int === '' ? '' : Number(int).toLocaleString('es-AR');
  return dec === undefined ? intText : `${intText},${dec}`;
};

export const numberFromDisplay = text => {
  const clean = text.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const [int, ...rest] = clean.split('.');
  return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int;
};

export const hexToRgba = (hex, alpha) => {
  const clean = String(hex || '#000000').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean.padEnd(6, '0');
  const n = parseInt(full.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

export function useImageUpload(uploadFn) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const upload = async (file, kind) => {
    if (!file || !uploadFn) return null;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadFn(file, { kind });
      return result?.url ?? null;
    } catch (err) {
      setError(err.message || 'No se pudo subir la imagen. Probá de nuevo.');
      return null;
    } finally {
      setUploading(false);
    }
  };
  return { upload, uploading, error };
}
