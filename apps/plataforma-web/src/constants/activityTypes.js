// Taxonomía única de tipos de actividad. Antes esta info vivía dispersa:
//   - ICONS y DESCRIPTIONS en ActivityFeed.jsx
//   - CLIENT_ACTIVITY_TYPES e INVENTORY_ACTIVITY_TYPES en ClientesView/InventarioView
// Centralizar evita drift entre vistas (ej. un type agregado al feed pero no al
// filtro, o iconos distintos para el mismo type).
import {
  UserPlus, ArrowRight, Phone, UserMinus, Calendar, FileText, Mail,
  Activity as ActivityIcon, Plus, Pencil, Trash2, CircleCheck,
} from 'lucide-react';

// Scopes: dónde se muestra esta actividad. 'clients' y 'inventory' pueden
// aparecer en ambos lados si aplica.
export const ACTIVITY_SCOPES = { CLIENTS: 'clients', INVENTORY: 'inventory' };

const FALLBACK = { Icon: ArrowRight, color: 'var(--color-text-muted)' };

// `description(e)` puede usar e.description, e.name, e.to, etc. y caer al
// fallback hardcodeado si el backend no mandó description.
export const ACTIVITY_TYPES = {
  prospect_created: {
    Icon: UserPlus, color: 'var(--color-success)',
    scope: ACTIVITY_SCOPES.CLIENTS,
    description: (e) => e.description ?? `Prospecto "${e.name}" agregado`,
  },
  prospect_updated: {
    Icon: FileText, color: '#8b5cf6',
    scope: ACTIVITY_SCOPES.CLIENTS,
    description: (e) => e.description ?? `Prospecto "${e.name}" actualizado`,
  },
  prospect_deleted: {
    Icon: UserMinus, color: 'var(--color-danger)',
    scope: ACTIVITY_SCOPES.CLIENTS,
    description: (e) => e.description ?? `Prospecto "${e.name}" eliminado`,
  },
  prospect_category: {
    Icon: ArrowRight, color: '#3b82f6',
    scope: ACTIVITY_SCOPES.CLIENTS,
    description: (e) => `Prospecto "${e.name}" movido a ${e.to}`,
  },
  prospect_followup: {
    Icon: Phone, color: '#14b8a6',
    scope: ACTIVITY_SCOPES.CLIENTS,
    description: (e) => `Seguimiento con "${e.name}"`,
  },
  prospect_contacted: {
    Icon: Phone, color: '#14b8a6',
    scope: ACTIVITY_SCOPES.CLIENTS,
    description: (e) => e.description ?? `Contacto con "${e.name}"`,
  },
  call_made: {
    Icon: Phone, color: '#14b8a6',
    scope: ACTIVITY_SCOPES.CLIENTS,
    description: (e) => `Llamada con "${e.name}"`,
  },
  meeting_scheduled: {
    Icon: Calendar, color: '#3b82f6',
    scope: ACTIVITY_SCOPES.CLIENTS,
    description: (e) => `Reunión agendada con "${e.name}"`,
  },
  meeting_completed: {
    Icon: Calendar, color: '#10b981',
    scope: ACTIVITY_SCOPES.CLIENTS,
    description: (e) => `Reunión completada con "${e.name}"`,
  },
  note_added: {
    Icon: FileText, color: '#8b5cf6',
    scope: ACTIVITY_SCOPES.CLIENTS,
    description: (e) => e.description ?? `Nota en "${e.name}"`,
  },
  email_sent: {
    Icon: Mail, color: '#3b82f6',
    scope: ACTIVITY_SCOPES.CLIENTS,
    description: (e) => `Email a "${e.name}"`,
  },
  lote_created: {
    Icon: Plus, color: 'var(--color-success)',
    scope: ACTIVITY_SCOPES.INVENTORY,
    description: (e) => e.description ?? `Lote "${e.name}" creado`,
  },
  lote_updated: {
    Icon: Pencil, color: '#c5a059',
    scope: ACTIVITY_SCOPES.INVENTORY,
    description: (e) => e.description ?? `Lote "${e.name}" actualizado`,
  },
  lote_deleted: {
    Icon: Trash2, color: 'var(--color-danger)',
    scope: ACTIVITY_SCOPES.INVENTORY,
    description: (e) => e.description ?? `Lote "${e.name}" eliminado`,
  },
  loteo_created: {
    Icon: Plus, color: 'var(--color-success)',
    scope: ACTIVITY_SCOPES.INVENTORY,
    description: (e) => e.description ?? `Loteo "${e.name}" creado`,
  },
  loteo_updated: {
    Icon: Pencil, color: '#c5a059',
    scope: ACTIVITY_SCOPES.INVENTORY,
    description: (e) => e.description ?? `Loteo "${e.name}" actualizado`,
  },
  loteo_deleted: {
    Icon: Trash2, color: 'var(--color-danger)',
    scope: ACTIVITY_SCOPES.INVENTORY,
    description: (e) => e.description ?? `Loteo "${e.name}" eliminado`,
  },
  lot_status: {
    Icon: CircleCheck, color: '#2563eb',
    scope: ACTIVITY_SCOPES.INVENTORY,
    description: (e) => `Lote "${e.name}" ${e.to}`,
  },
  other: {
    Icon: ActivityIcon, color: 'var(--color-text-muted)',
    scope: null,
    description: (e) => e.description ?? `Actividad en "${e.name}"`,
  },
};

// Resuelve los metadatos (icon, color, description) para un evento, con fallback.
export function getActivityMeta(type) {
  return ACTIVITY_TYPES[type] ?? FALLBACK;
}

// Devuelve los types que aplican a un scope. Útil para filtrar el feed.
export function getActivityTypesForScope(scope) {
  return Object.entries(ACTIVITY_TYPES)
    .filter(([, meta]) => meta.scope === scope)
    .map(([type]) => type);
}
