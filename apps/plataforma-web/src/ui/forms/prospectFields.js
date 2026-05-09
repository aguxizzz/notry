import { ORIGIN_DISPLAY } from '../../constants/display';

export const getProspectFields = (advisorsList, advisorsLoading, lotsList = [], lotsLoading = false) => [
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
    ],
  },
  {
    type: 'group',
    fields: [
      {
        name: 'lote_id',
        label: 'Lote',
        type: 'select',
        disabled: lotsLoading,
        options: [
          { value: '', label: 'Sin asignar' },
          ...lotsList.map(l => ({ value: l.id, label: l.name })),
        ],
      },
    ],
  },
  {
    type: 'group',
    fields: [
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
  {
    type: 'group',
    fields: [
      {
        name: 'origin',
        label: 'Origen',
        type: 'select',
        options: [
          { value: '', label: 'Sin especificar' },
          ...Object.entries(ORIGIN_DISPLAY).map(([value, label]) => ({ value, label })),
        ],
      },
    ],
  },
];
