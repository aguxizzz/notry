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
