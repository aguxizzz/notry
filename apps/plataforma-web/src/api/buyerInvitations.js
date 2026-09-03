import { API_BASE } from '../config';

export async function fetchBuyerContractAccess(apiFetch, contractId) {
  return apiFetch(`${API_BASE}/buyer-invitations/contracts/${contractId}/access`, { retries: 1 });
}

export async function createBuyerInvitation(apiFetch, contractId) {
  return apiFetch(`${API_BASE}/buyer-invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contract_id: contractId }),
    // En apiFetch, retries representa la cantidad total de intentos. Un solo
    // intento evita repetir una escritura si la red deja el resultado ambiguo.
    retries: 1,
  });
}

export async function revokeBuyerInvitation(apiFetch, invitationId) {
  return apiFetch(`${API_BASE}/buyer-invitations/${invitationId}`, {
    method: 'DELETE',
    retries: 1,
  });
}

export function buildBuyerInvitationUrl(token) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('portal', 'buyer');
  url.searchParams.set('buyer_invite', token);
  return url.toString();
}

export function buildBuyerPortalLoginUrl() {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('portal', 'buyer');
  url.searchParams.set('access', 'login');
  return url.toString();
}
