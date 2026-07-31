import './SectionHeader.css';

const TITLE_TAG = { section: 'h2', aside: 'h3' };

// Header de sección del sistema. Ver SectionHeader.css para tiers y estilos.
// Uso: <SectionHeader eyebrow="Dashboard" title="Métricas Clave" sub="…" />
export default function SectionHeader({
  eyebrow,
  title,
  sub,
  tier = 'section',
  actions,
  className = '',
  ...rest
}) {
  const Title = TITLE_TAG[tier] || 'h2';
  const classes = ['section-header', `section-header--${tier}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...rest}>
      <div className="section-header-text">
        {eyebrow && <p className="section-header-eyebrow">{eyebrow}</p>}
        {title && <Title className="section-header-title">{title}</Title>}
        {sub && <p className="section-header-sub">{sub}</p>}
      </div>
      {actions && <div className="section-header-actions">{actions}</div>}
    </div>
  );
}
