// Fuente única para los pendientes de Inventario. Cada regla define qué entidad
// filtra, cómo se presenta y el predicado usado tanto por las métricas como por
// la tabla. Así el número de la alerta y sus resultados nunca divergen.
function hasLinkedProspect(lot, context) {
  if (lot.prospect_names?.length > 0) return true;
  return context.prospects.some(
    prospect => String(prospect.lote_id) === String(lot.id)
  );
}

function loteoHasLots(loteo, context) {
  if (Array.isArray(loteo.lotes) && loteo.lotes.length > 0) return true;

  const declaredCount = loteo.lot_count ?? loteo.lots_count ?? loteo.total_lots;
  if (declaredCount !== undefined && declaredCount !== null) {
    return Number(declaredCount) > 0;
  }

  return context.lots.some(lot => String(lot.loteo_id) === String(loteo.id));
}

function hasActiveContract(lot, context) {
  return context.contracts.some(contract => (
    String(contract.lote_id) === String(lot.id)
    && contract.status !== 'cancelled'
  ));
}

export const INVENTORY_ATTENTION_RULES = Object.freeze({
  noVisual: Object.freeze({
    key: 'noVisual',
    tab: 'loteos',
    tone: 'info',
    label: 'Sin imagen o plano',
    sub: 'Loteos incompletos para el visor 360',
    matches: loteo => !loteo.image_url || !loteo.blueprint_url,
  }),
  emptyLoteo: Object.freeze({
    key: 'emptyLoteo',
    tab: 'loteos',
    tone: 'accent',
    label: 'Loteos sin lotes',
    sub: 'Configuraciones iniciadas sin inventario',
    matches: (loteo, context) => !loteoHasLots(loteo, context),
  }),
  reservedWithoutClient: Object.freeze({
    key: 'reservedWithoutClient',
    tab: 'lotes',
    tone: 'warn',
    label: 'Reservados sin cliente',
    sub: 'Reservas sin prospecto asociado',
    matches: (lot, context) => (
      lot.status === 'reserved' && !hasLinkedProspect(lot, context)
    ),
  }),
  soldWithoutContract: Object.freeze({
    key: 'soldWithoutContract',
    tab: 'lotes',
    tone: 'danger',
    label: 'Vendidos sin contrato',
    sub: 'Ventas sin contrato activo en Cobranzas',
    matches: (lot, context) => (
      context.contractsAvailable
      && lot.status === 'sold'
      && !hasActiveContract(lot, context)
    ),
  }),
});

export const INVENTORY_ATTENTION_ORDER = Object.freeze([
  'noVisual',
  'emptyLoteo',
  'reservedWithoutClient',
  'soldWithoutContract',
]);

function normalizeContext(lots, context = {}) {
  return {
    lots,
    prospects: context.prospects ?? [],
    contracts: context.contracts ?? [],
    contractsAvailable: context.contractsAvailable ?? false,
  };
}

export function getInventoryAttentionCounts(lots = [], loteos = [], context = {}) {
  const normalizedContext = normalizeContext(lots, context);
  return Object.fromEntries(
    INVENTORY_ATTENTION_ORDER.map(key => {
      const rule = INVENTORY_ATTENTION_RULES[key];
      const source = rule.tab === 'lotes' ? lots : loteos;
      return [key, source.filter(item => rule.matches(item, normalizedContext)).length];
    })
  );
}

export function filterByInventoryAttention(items = [], ruleKey, context = {}) {
  const rule = INVENTORY_ATTENTION_RULES[ruleKey];
  if (!rule) return items;
  const normalizedContext = normalizeContext(context.lots ?? items, context);
  return items.filter(item => rule.matches(item, normalizedContext));
}
