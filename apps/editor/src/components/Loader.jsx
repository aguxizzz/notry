// Pantalla de carga: una manzana cuyos lotes se van marcando uno por uno
// (fila de arriba de izquierda a derecha, la de abajo de vuelta).
const LOTS = [
  [0, 0], [1, 0], [2, 0], [3, 0],
  [3, 1], [2, 1], [1, 1], [0, 1],
];

export default function Loader({ label = 'Cargando…', fullscreen = false }) {
  return (
    <div className={`loader${fullscreen ? ' loader--screen' : ''}`} role="status" aria-live="polite">
      <svg className="loader-block" viewBox="0 0 56 40" aria-hidden="true">
        <rect className="loader-block-frame" x="2" y="2" width="52" height="36" rx="4" />
        {LOTS.map(([col, row], i) => (
          <rect
            key={i}
            className="loader-block-lot"
            x={6 + col * 11.5}
            y={6 + row * 15}
            width="9.5"
            height="13"
            rx="1.5"
            style={{ animationDelay: `${i * 110}ms` }}
          />
        ))}
      </svg>
      <p className="loader-label">{label}</p>
    </div>
  );
}
