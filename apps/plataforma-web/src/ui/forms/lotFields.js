export const MAX_LOT_AREA_M2 = 99999999.99;
export const MAX_LOT_PRICE = 9999999999.99;
export const MAX_LOT_COMMENTS_LENGTH = 2000;
export const MAX_LOT_SIDE_M = 99999.99;
export const MAX_LOT_MANZANA_LENGTH = 20;

export const LOT_ORIENTATIONS = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];

// Valida frente/fondo (opcionales). Devuelve el mensaje de error o null.
export function validateLotSides(form) {
  for (const [key, label] of [['frente', 'El frente'], ['fondo', 'El fondo']]) {
    if (form[key] === '' || form[key] == null) continue;
    const n = parseFloat(form[key]);
    if (isNaN(n) || n <= 0) return `${label} debe ser un número positivo`;
    if (n > MAX_LOT_SIDE_M) return `${label} no puede superar ${MAX_LOT_SIDE_M.toLocaleString('es-AR')} m`;
  }
  if (form.manzana?.length > MAX_LOT_MANZANA_LENGTH) {
    return `La manzana no puede superar los ${MAX_LOT_MANZANA_LENGTH} caracteres`;
  }
  return null;
}

export const getLotFields = (loteos = []) => [
  {
    name: 'name',
    label: 'Nombre',
    type: 'text',
    placeholder: 'Ej: Lote 1',
  },
  {
    name: 'loteo_id',
    label: 'Loteo',
    type: 'select',
    options: [
      { value: '', label: 'Seleccionar loteo...' },
      ...loteos.map(l => ({ value: l.id, label: l.name })),
    ],
  },
  {
    type: 'group',
    fields: [
      {
        name: 'area_m2',
        label: 'Área (m²)',
        type: 'number',
        step: '0.01',
        max: MAX_LOT_AREA_M2,
        placeholder: 'Ej: 500',
      },
      {
        name: 'price',
        label: 'Precio',
        type: 'number',
        step: '0.01',
        max: MAX_LOT_PRICE,
        placeholder: 'Ej: 100000',
      },
    ],
  },
  {
    type: 'group',
    fields: [
      {
        name: 'frente',
        label: 'Frente (m)',
        type: 'number',
        step: '0.01',
        max: MAX_LOT_SIDE_M,
        placeholder: 'Ej: 12',
      },
      {
        name: 'fondo',
        label: 'Fondo (m)',
        type: 'number',
        step: '0.01',
        max: MAX_LOT_SIDE_M,
        placeholder: 'Ej: 30',
      },
    ],
  },
  {
    type: 'group',
    fields: [
      {
        name: 'manzana',
        label: 'Manzana',
        type: 'text',
        maxLength: MAX_LOT_MANZANA_LENGTH,
        placeholder: 'Ej: B',
      },
      {
        name: 'orientation',
        label: 'Orientación',
        type: 'select',
        options: [
          { value: '', label: 'Sin especificar' },
          ...LOT_ORIENTATIONS.map(o => ({ value: o, label: o })),
        ],
      },
    ],
  },
  {
    name: 'status',
    label: 'Estado',
    type: 'select',
    options: [
      { value: 'available', label: 'Disponible' },
      { value: 'reserved', label: 'Reservado' },
      { value: 'sold', label: 'Vendido' },
      { value: 'unavailable', label: 'No disponible' },
    ],
  },
  {
    name: 'comments',
    label: 'Observaciones',
    type: 'textarea',
    placeholder: 'Notas u observaciones sobre el lote...',
    maxLength: MAX_LOT_COMMENTS_LENGTH,
  },
];
