import { API_BASE } from '../config';

export async function fetchMyOrg({ apiFetch }) {
  return apiFetch(`${API_BASE}/organizations/me`);
}

// Solo super_admin: lista todas las orgs para el selector cross-org del Sidebar.
export async function fetchOrganizations({ apiFetch }) {
  return apiFetch(`${API_BASE}/organizations`);
}

export async function createInvite({ apiFetch, email, full_name, role, orgId }) {
  return apiFetch(`${API_BASE}/organizations/invites`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Override puntual: usado por CreateOrgPanel para invitar al primer
      // owner de una org recién creada sin depender de cuál sea la org
      // activa del super_admin en ese momento (evita una carrera de estado).
      ...(orgId ? { 'X-Active-Org-Id': orgId } : {}),
    },
    body: JSON.stringify({ email, full_name, role }),
  });
}

// Solo super_admin: crea una organización nueva sin owner todavía. El alta
// del primer usuario se hace aparte con createInvite (orgId: org.org_id).
export async function createOrganization({ apiFetch, org_name, plan }) {
  return apiFetch(`${API_BASE}/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_name, plan }),
  });
}

export async function fetchInvites({ apiFetch }) {
  return apiFetch(`${API_BASE}/organizations/invites`);
}

export async function updateOrg({ apiFetch, phone, org_name, cement_bag_rate_ars, usd_ars_rate }) {
  const body = {};
  if (org_name !== undefined) body.org_name = org_name;
  if (phone !== undefined) body.phone = phone;
  if (cement_bag_rate_ars !== undefined) body.cement_bag_rate_ars = cement_bag_rate_ars;
  if (usd_ars_rate !== undefined) body.usd_ars_rate = usd_ars_rate;
  return apiFetch(`${API_BASE}/organizations/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Solo owner: borra los datos de medición (embudo, clicks por lote) de la org. Irreversible.
export async function resetOrgAnalytics({ apiFetch }) {
  return apiFetch(`${API_BASE}/organizations/me/analytics/reset`, {
    method: 'POST',
  });
}

export async function revokeInvite({ apiFetch, inviteId }) {
  return apiFetch(`${API_BASE}/organizations/invites/${inviteId}`, {
    method: 'DELETE',
  });
}

// Arma el link público de aceptación a partir del token de la invitación.
export function buildInviteUrl(token) {
  return `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(token)}`;
}

// ── Endpoints públicos (sin auth): el invitado aún no tiene sesión ──────────────

export async function validateInvite(token) {
  const res = await fetch(`${API_BASE}/organizations/invites/token/${encodeURIComponent(token)}`);
  if (!res.ok) {
    let detail = 'La invitación no es válida.';
    try { detail = (await res.json()).detail || detail; } catch { /* keep default */ }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function acceptInvite({ token, password }) {
  const res = await fetch(`${API_BASE}/organizations/invites/token/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: password ?? null }),
  });
  if (!res.ok) {
    let detail = 'No se pudo aceptar la invitación.';
    try { detail = (await res.json()).detail || detail; } catch { /* keep default */ }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function updateMemberRole({ apiFetch, userId, role }) {
  return apiFetch(`${API_BASE}/organizations/members/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

export async function removeMember({ apiFetch, userId }) {
  return apiFetch(`${API_BASE}/organizations/members/${userId}`, {
    method: 'DELETE',
  });
}
