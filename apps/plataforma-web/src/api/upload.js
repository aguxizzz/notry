import { API_BASE } from '../config';

const MAX_DIMENSION = 2048; // px en el lado más largo; reduce memoria en backend y red

async function convertToWebP(file, onProgress) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;

      if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objectUrl);
      onProgress?.(50);

      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;
          img.src = '';
          if (!blob) { reject(new Error('No se pudo convertir la imagen')); return; }
          onProgress?.(100);
          const newName = file.name.replace(/\.[^.]+$/, '.webp');
          resolve(new File([blob], newName, { type: 'image/webp' }));
        },
        'image/webp',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Error al leer la imagen'));
    };

    img.src = objectUrl;
  });
}

function uploadViaXHR(url, token, formData, { onProgress, onComplete, onError, logout }) {
  const xhr = new XMLHttpRequest();

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
  };

  xhr.onload = () => {
    if (xhr.status === 401) {
      logout?.();
      onError?.(new Error('Sesión expirada. Inicia sesión nuevamente.'));
      return;
    }
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        onComplete?.(JSON.parse(xhr.responseText));
      } catch {
        onError?.(new Error('Respuesta inválida del servidor'));
      }
      return;
    }
    let detail = `HTTP ${xhr.status}`;
    try { detail = JSON.parse(xhr.responseText).detail || detail; } catch {}
    onError?.(new Error(detail));
  };

  xhr.onerror = () => onError?.(new Error('Error de red'));

  xhr.open('POST', url);
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.setRequestHeader('Accept', 'application/json');
  xhr.send(formData);

  return xhr;
}

export function createUploadFn(token, logout) {
  return function uploadImage(file, { onConvertProgress, onUploadProgress } = {}) {
    return new Promise(async (resolve, reject) => {
      let webpFile;
      try {
        webpFile = await convertToWebP(file, onConvertProgress);
      } catch (err) {
        reject(err);
        return;
      }

      const formData = new FormData();
      formData.append('file', webpFile);

      uploadViaXHR(`${API_BASE}/upload`, token, formData, {
        onProgress: onUploadProgress,
        onComplete: (data) => resolve({ url: data.url, thumbnailUrl: data.thumbnail_url }),
        onError: reject,
        logout,
      });
    });
  };
}

// Kept for backward compatibility with any callers that still use apiFetch
export async function uploadImage(file, apiFetch) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiFetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
    retries: 1,
  });
  return { url: res.url, thumbnailUrl: res.thumbnail_url };
}
