// Constantes del inventario. Movidas desde InventarioView.jsx en la Fase 1
// del refactor. Sin React, sólo valores.

// ── Ordenamiento de la tabla de lotes ─────────────────────────────────────────

export const STATUS_RANK = { available: 0, reserved: 1, sold: 2 };

export const LOT_SORT_ACCESSORS = {
  name: l => l.name,
  area: l => (l.area_m2 != null && l.area_m2 !== '' ? parseFloat(l.area_m2) : null),
  price: l => (l.price != null && l.price !== '' ? parseFloat(l.price) : null),
  status: l => STATUS_RANK[l.status] ?? 99,
  loteo: l => l.loteo_name,
  prospectos: l => l.prospect_names?.length ?? 0,
};

// ── Paginación de la tabla de lotes (client-side; el /sync ya trae todo) ─────

export const LOTS_PER_PAGE = 10;

// ── Actividad reciente: filtramos los tipos que aplican al inventario ──────────

import { ACTIVITY_SCOPES, getActivityTypesForScope } from '../../constants/activityTypes';
export const INVENTORY_ACTIVITY_TYPES = new Set(getActivityTypesForScope(ACTIVITY_SCOPES.INVENTORY));