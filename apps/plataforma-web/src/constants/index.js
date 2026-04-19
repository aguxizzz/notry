export const PAGE_SIZE = 50;

export const STATUS_DISPLAY = {
  available: 'disponible',
  reserved: 'reservado',
  sold: 'vendido',
};

export const CATEGORY_DISPLAY = {
  primer_contacto: 'Primer Contacto',
  seguimiento: 'Seguimiento',
  negociacion: 'Negociación',
  vendido: 'Vendido',
};

export const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const isValidHttpsUrl = (str) => {
  if (!str) return true; // empty is allowed (optional field)
  try {
    const u = new URL(str);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
};

export const getProspectFields = (advisorsList, advisorsLoading) => [
  { name: 'name', label: 'Nombre', required: true },
  {
    type: 'group',
    fields: [
      { name: 'email', label: 'Correo electrónico', type: 'email', placeholder: 'ej: usuario@correo.com' },
      { name: 'phone', label: 'Teléfono', type: 'tel', placeholder: 'ej: +52 55 1234 5678' },
    ],
  },
  {
    type: 'group',
    fields: [
      {
        name: 'category',
        label: 'Categoría',
        type: 'select',
        options: [
          { value: 'primer_contacto', label: 'Primer Contacto' },
          { value: 'seguimiento', label: 'Seguimiento' },
          { value: 'negociacion', label: 'Negociación' },
          { value: 'vendido', label: 'Vendido' },
        ],
      },
      {
        name: 'budget',
        label: 'Presupuesto',
        type: 'number',
        step: '0.01',
        placeholder: 'Ej: 150000',
      },
    ],
  },
  {
    type: 'group',
    fields: [
      {
        name: 'payment_method',
        label: 'Forma de pago',
        type: 'select',
        options: [
          { value: 'contado', label: 'Contado' },
          { value: 'credito', label: 'Crédito' },
        ],
      },
      {
        name: 'advisor_id',
        label: 'Asesor',
        type: 'select',
        disabled: advisorsLoading,
        options: [
          { value: '', label: 'Sin asignar' },
          ...advisorsList.map(a => ({ value: a.id, label: a.full_name })),
        ],
      },
    ],
  },
];

export const getLotFields = () => [
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
];
