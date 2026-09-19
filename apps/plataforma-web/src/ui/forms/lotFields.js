export const MAX_LOT_AREA_M2 = 99999999.99;
export const MAX_LOT_PRICE = 9999999999.99;
export const MAX_LOT_COMMENTS_LENGTH = 2000;

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
