import { API_BASE } from '../config';

const THUMB_MAX_SIZE = 800; // px en el lado más largo, espejo de THUMB_MAX_SIZE del backend

function generateThumbnail(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      let w = width;
      let h = height;

      if (w > THUMB_MAX_SIZE || h > THUMB_MAX_SIZE) {
        const ratio = Math.min(THUMB_MAX_SIZE / w, THUMB_MAX_SIZE / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objectUrl);

      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;
          img.src = '';
          if (!blob) { reject(new Error('No se pudo generar el thumbnail')); return; }
          const newName = file.name.replace(/\.[^.]+$/, '.webp');
          resolve({
            file: new File([blob], newName, { type: 'image/webp' }),
            width,
            height,
          });
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

function xhrRequest(method, url, { headers = {}, body, onProgress, logout, requiresAuth = true } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      if (requiresAuth && xhr.status === 401) {
        logout?.();
        reject(new Error('Sesión expirada. Inicia sesión nuevamente.'));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null); }
        catch { reject(new Error('Respuesta inválida del servidor')); }
        return;
      }
      let detail = `HTTP ${xhr.status}`;
      try { detail = JSON.parse(xhr.responseText).detail || detail; } catch { /* use HTTP status */ }
      reject(new Error(detail));
    };
    xhr.onerror = () => reject(new Error('Error de red'));
    xhr.send(body);
  });
}

function getPresignedUrl(token, logout, file) {
  return xhrRequest('POST', `${API_BASE}/upload/presign`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ filename: file.name, content_type: file.type }),
    logout,
  });
}

function uploadThumbnail(token, logout, thumbFile, onProgress) {
  const formData = new FormData();
  formData.append('file', thumbFile);
  return xhrRequest('POST', `${API_BASE}/upload/thumbnail`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: formData,
    onProgress,
    logout,
  });
}

function uploadOriginalToR2(uploadUrl, file, onProgress) {
  return xhrRequest('PUT', uploadUrl, {
    headers: { 'Content-Type': file.type },
    body: file,
    onProgress,
    requiresAuth: false,
  });
}

export function createUploadFn(token, logout) {
  return async function uploadImage(file, { onConvertProgress, onUploadProgress } = {}) {
    const { file: thumbFile, width, height } = await generateThumbnail(file);
    onConvertProgress?.(40);
    const thumbResult = await uploadThumbnail(token, logout, thumbFile, (p) =>
      onConvertProgress?.(40 + Math.round(p * 0.6))
    );

    const presign = await getPresignedUrl(token, logout, file);
    await uploadOriginalToR2(presign.upload_url, file, onUploadProgress);

    return { url: presign.public_url, thumbnailUrl: thumbResult.thumbnail_url, width, height };
  };
}

// Kept for backward compatibility with any callers that still use apiFetch
export async function uploadImage(file, apiFetch) {
  const dimensions = await new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Error al leer la imagen'));
    };
    img.src = objectUrl;
  });
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiFetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
    retries: 1,
  });
  return { url: res.url, thumbnailUrl: res.thumbnail_url, ...dimensions };
}
