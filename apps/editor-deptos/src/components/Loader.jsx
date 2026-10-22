// Pantalla de carga: una torre cuyos pisos se encienden de abajo hacia arriba.
const FLOORS = [0, 1, 2, 3, 4];

export default function Loader({ label = 'Cargando…' }) {
  return (
    <div className="splash" role="status" aria-live="polite">
      <svg className="loader-tower" viewBox="0 0 40 56" aria-hidden="true">
        <path className="loader-tower-frame" d="M6 52V10l14-6 14 6v42M2 52h36" />
        {FLOORS.map((i) => (
          <rect
            key={i}
            className="loader-tower-floor"
            x="11"
            y={43 - i * 7.5}
            width="18"
            height="4.5"
            rx="1"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </svg>
      <p className="loader-label">{label}</p>
    </div>
  );
}
