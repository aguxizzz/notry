import { API_BASE } from '../config';

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
