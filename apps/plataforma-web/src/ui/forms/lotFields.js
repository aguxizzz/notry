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
        placeholder: 'Ej: 500',
      },
      {
        name: 'price',
        label: 'Precio',
        type: 'number',
        step: '0.01',
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
    ],
  },
  {
    name: 'comments',
    label: 'Observaciones',
    type: 'textarea',
    placeholder: 'Notas u observaciones sobre el lote...',
  },
];
