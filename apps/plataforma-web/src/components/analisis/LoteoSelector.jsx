import './LoteoSelector.css';

export default function LoteoSelector({ loteos, selectedLoteo, onSelect }) {
  return (
    <div
      className="loteo-selector"
      role="group"
      aria-label="Seleccionar loteo. Usa Tab para navegar y Enter o Espacio para seleccionar."
    >
      {loteos.map((loteo) => (
        <button
          key={loteo.id}
          className={`loteo-pill ${selectedLoteo?.id === loteo.id ? 'active' : ''}`}
          onClick={() => onSelect(loteo)}
        >
          {loteo.name}
        </button>
      ))}
    </div>
  );
}