export const API_BASE = import.meta.env.VITE_API_BASE || 'https://notry-back.vercel.app/api/v1';

export const fetchWithTimeout = (url, options, ms = 30000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

// Org sobre la que opera el usuario (solo relevante para super_admin, que no
// tiene membership propia — ver resolve_active_organization_id en el backend).
// Vive fuera de React porque token/orgId se leen desde funciones de servicio
// planas (poiService, useLotOperations, etc.) que no reciben props del árbol;
// useAuth.js es quien la mantiene sincronizada con su estado.
let activeOrgId = null;

export function setActiveOrgId(orgId) {
  activeOrgId = orgId || null;
}

// Arma los headers de auth para un fetch autenticado, agregando
// X-Active-Org-Id cuando hay una org activa seleccionada. El backend lo
// ignora para cualquier rol que no sea super_admin, así que es seguro
// mandarlo siempre que esté seteado.
export function authHeaders(token, extra) {
  return {
    ...extra,
    Authorization: `Bearer ${token}`,
    ...(activeOrgId ? { 'X-Active-Org-Id': activeOrgId } : {}),
  };
}
