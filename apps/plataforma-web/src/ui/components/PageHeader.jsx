import './PageHeader.css';

/**
 * Encabezado único para rutas principales: eyebrow + h1 + descripción + acciones.
 * Los encabezados internos siguen usando SectionHeader.
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className = '',
  ...rest
}) {
  const classes = ['page-header', className].filter(Boolean).join(' ');

  return (
    <header className={classes} {...rest}>
      <div className="page-header__text">
        {eyebrow && <p className="page-header__eyebrow">{eyebrow}</p>}
        <h1 className="page-header__title">{title}</h1>
        {description && <p className="page-header__description">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
