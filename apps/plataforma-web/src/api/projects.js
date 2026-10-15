import { API_BASE } from '../config';

export async function fetchProjects({ apiFetch }) {
  return apiFetch(`${API_BASE}/projects`);
}

export async function createProject({ apiFetch, name, slug, branding, finance_config, loading_gallery }) {
  return apiFetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, slug, branding, finance_config, loading_gallery }),
  });
}

export async function updateProject({ apiFetch, projectId, name, slug, branding, finance_config, loading_gallery }) {
  return apiFetch(`${API_BASE}/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, slug, branding, finance_config, loading_gallery }),
  });
}

export async function deleteProject({ apiFetch, projectId }) {
  return apiFetch(`${API_BASE}/projects/${projectId}`, { method: 'DELETE' });
}

export async function assignLoteos({ apiFetch, projectId, loteoIds }) {
  return apiFetch(`${API_BASE}/projects/${projectId}/loteos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loteo_ids: loteoIds }),
  });
}

export async function unassignLoteo({ apiFetch, projectId, loteoId }) {
  return apiFetch(`${API_BASE}/projects/${projectId}/loteos/${loteoId}`, {
    method: 'DELETE',
  });
}
