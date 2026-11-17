// Franja de resumen para vistas con tabla (Clientes, Inventario): total, una
// casilla por etapa/estado que filtra la tabla, y un bloque lateral que puede
// ser de alerta (clickeable) o solo informativo. Inicio sigue con SummaryBand.
import './StageSummary.css';

/**
 * total:     { value, label }  — "64 contactos", "47 lotes".
 * segments:  [{ key, label, value, color }] — el % se calcula contra la suma.
 * activeKey: segmento seleccionado (o null); onSelect(key | null) lo alterna.
 * aside:     { title, tone: 'alert' | 'neutral', items: [{ key, label, value, active, onClick }] }
 *            Un item sin onClick se muestra como dato, sin botón.
 */
export default function StageSummary({
  total,
  segments,
  activeKey = null,
  onSelect,
  aside,
  className = '',
  ...rest
}) {
  const sum = segments.reduce((acc, s) => acc + s.value, 0);
  const pct = value => (sum > 0 ? Math.round((value / sum) * 100) : 0);

  return (
    <section className={['stage-summary', className].filter(Boolean).join(' ')} {...rest}>
      <div className="stage-summary__stages">
        <div className="stage-summary__total">
          <strong>{total.value}</strong>
          <span>{total.label}</span>
        </div>

        {segments.map(s => {
          const active = activeKey === s.key;
          return (
            <button
              key={s.key}
              type="button"
              className="stage-summary__stage"
              style={{ '--c': s.color }}
              aria-pressed={active}
              aria-label={`${s.value} ${s.label}, ${pct(s.value)}%. ${active ? 'Quitar filtro' : 'Filtrar la tabla'}`}
              onClick={() => onSelect?.(active ? null : s.key)}
            >
              <span className="stage-summary__num">
                <strong>{s.value}</strong>
                <small>{pct(s.value)}%</small>
              </span>
              <span className="stage-summary__label">{s.label}</span>
              {/* Proporción como relleno sobre el borde inferior de la casilla. */}
              <span className="stage-summary__bar" aria-hidden="true">
                <span style={{ width: `${pct(s.value)}%` }} />
              </span>
            </button>
          );
        })}
      </div>

      {aside && (
        <div className={`stage-summary__aside stage-summary__aside--${aside.tone ?? 'neutral'}`}>
          <span className="stage-summary__aside-title">{aside.title}</span>
          {aside.items.map(item => {
            const content = (
              <>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </>
            );
            return item.onClick ? (
              <button
                key={item.key}
                type="button"
                className="stage-summary__aside-row"
                aria-pressed={Boolean(item.active)}
                onClick={item.onClick}
              >
                {content}
              </button>
            ) : (
              <div key={item.key} className="stage-summary__aside-row">{content}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}
