import './SummaryBand.css';

/**
 * Resumen horizontal para páginas operativas.
 * `lead` contiene la lectura principal; los SummaryMetric aportan contexto.
 */
export default function SummaryBand({
  as = 'section',
  lead,
  children,
  className = '',
  ...rest
}) {
  const Tag = as;
  const classes = ['summary-band', className].filter(Boolean).join(' ');

  return (
    <Tag className={classes} {...rest}>
      <div className="summary-band__lead">{lead}</div>
      <div className="summary-band__metrics">{children}</div>
    </Tag>
  );
}

export function SummaryMetric({
  icon,
  label,
  hint,
  value,
  tone = 'neutral',
  className = '',
}) {
  const classes = ['summary-metric', `summary-metric--${tone}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {icon && <span className="summary-metric__icon" aria-hidden="true">{icon}</span>}
      <span className="summary-metric__label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <strong className="summary-metric__value">{value}</strong>
    </div>
  );
}
