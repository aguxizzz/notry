import './LoteoSelector.css';

export default function LoteoSelector({ loteos, selectedLoteo, onSelect }) {
  if (loteos.length === 0) {
    return (
      <div className="picker-a picker-a-host" aria-label="Sin loteos registrados">
        <span className="pa-lbl">Loteo</span>
        <div className="pa-opts">
          <span className="pa-opt" aria-disabled="true" style={{ fontStyle: 'italic', opacity: 0.7 }}>
            Sin loteos registrados
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="picker-a picker-a-host"
      role="group"
      aria-label="Seleccionar loteo. Usa Tab para navegar y Enter o Espacio para seleccionar."
    >
      <span className="pa-lbl">Loteo</span>
      <div className="pa-opts">
        {loteos.map((loteo) => (
          <button
            key={loteo.id}
            type="button"
            className={`pa-opt${selectedLoteo?.id === loteo.id ? ' on' : ''}`}
            onClick={() => onSelect(loteo)}
            aria-pressed={selectedLoteo?.id === loteo.id}
          >
            {loteo.name}
          </button>
        ))}
      </div>
    </div>
  );
}