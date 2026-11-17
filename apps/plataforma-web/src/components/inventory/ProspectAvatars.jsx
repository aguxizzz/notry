// Prospectos de un lote como pila de avatares con iniciales. El color de cada
// avatar es la etapa del prospecto (mismos tokens que el badge de categoría),
// así la pila también se lee como "qué tan avanzados están".

import { CATEGORY_DISPLAY } from '../../constants';
import { initials } from '../../utils/prospects';
import './ProspectAvatars.css';

const MAX_VISIBLE = 3;

export default function ProspectAvatars({ prospectos, names = [], activeId, onSelect }) {
  // Sin datos completos de prospectos (sólo nombres): avatares neutros, sin clic.
  const items = prospectos.length > 0
    ? prospectos
    : names.map((name, i) => ({ id: `name-${i}`, name }));

  if (items.length === 0) return <span className="td-empty">—</span>;

  const visible = items.slice(0, MAX_VISIBLE);
  const hidden = items.slice(MAX_VISIBLE);
  const clickable = prospectos.length > 0;

  return (
    <div className="prospect-avatars">
      {visible.map(p => {
        const stage = CATEGORY_DISPLAY[p.category];
        const title = stage ? `${p.name} · ${stage}` : p.name;
        const className = [
          'prospect-avatar',
          p.category && `prospect-avatar--${p.category}`,
          activeId === p.id && 'is-active',
        ].filter(Boolean).join(' ');

        return clickable ? (
          <button
            key={p.id}
            type="button"
            className={className}
            onClick={e => onSelect(e, p)}
            title={title}
            aria-label={`Ver info de ${p.name}`}
          >
            {initials(p.name)}
          </button>
        ) : (
          <span key={p.id} className={className} title={title}>
            {initials(p.name)}
          </span>
        );
      })}
      {hidden.length > 0 && (
        <span
          className="prospect-avatar prospect-avatar--more"
          title={hidden.map(p => p.name).join(', ')}
        >
          +{hidden.length}
        </span>
      )}
    </div>
  );
}
