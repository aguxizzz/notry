import './SegmentRing.css';

// Ring segmentado (conic-gradient + máscara), mismo estilo que "Lotes por estado"
// del inventario. No es 1:1 con los datos: cada segmento presente lleva un piso
// visual mínimo (para que valores chicos no desaparezcan) y el resto se reparte
// proporcional; hay un hueco entre segmentos. Los números reales van en la leyenda.
//
// segments: [{ color, n }]  (color = string CSS, ej. 'var(--badge-available)')
function buildRingGradient(segments = []) {
  const present = segments.filter(s => (s.n ?? 0) > 0);
  const totalN = present.reduce((a, s) => a + s.n, 0);
  if (totalN === 0) return 'var(--ring-track, var(--border-color)) 0 100%';

  const GAP = present.length > 1 ? 1.6 : 0; // hueco entre segmentos (%)
  const FLOOR = 9;   // piso visual por segmento (%)
  const gapTotal = present.length * GAP;
  const usable = 100 - gapTotal;
  const floorTotal = Math.min(present.length * FLOOR, usable * 0.6);
  const floor = floorTotal / present.length;
  const remainder = usable - floorTotal;

  const stops = [];
  let cursor = 0;
  present.forEach((s, i) => {
    const size = floor + (s.n / totalN) * remainder;
    const end = cursor + size;
    stops.push(`${s.color} ${cursor}% ${end}%`);
    const gapEnd = i === present.length - 1 ? 100 : end + GAP;
    stops.push(`transparent ${end}% ${gapEnd}%`);
    cursor = gapEnd;
  });
  return stops.join(', ');
}

export default function SegmentRing({ segments, size = 'md', children }) {
  const gradient = buildRingGradient(segments);
  return (
    <div className={`segment-ring segment-ring--${size}`}>
      <div className="segment-ring-pie" style={{ '--ring-grad': gradient }} />
      <div className="segment-ring-ctr">{children}</div>
    </div>
  );
}
