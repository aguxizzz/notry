import { SegmentedControl } from '../../ui/components';

export default function LoteoSelector({ loteos, selectedLoteo, onSelect }) {
  return (
    <SegmentedControl
      variant="underline"
      label="Loteo"
      ariaLabel="Seleccionar loteo. Usa Tab para navegar y Enter o Espacio para seleccionar."
      value={selectedLoteo?.id}
      onChange={(id) => onSelect(loteos.find(loteo => loteo.id === id))}
      options={loteos.map(loteo => ({ value: loteo.id, label: loteo.name }))}
      emptyMessage="Sin loteos registrados"
    />
  );
}
