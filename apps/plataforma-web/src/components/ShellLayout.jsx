import './ShellLayout.css';

/**
 * Layout de página: contenido principal + aside con scroll propio.
 * Reutilizable entre vistas (Inicio, Inventario y futuras).
 *
 * La vista aporta:
 *  - className: clase scope de la vista (ej. "inicio-shell"), para los estilos
 *    de contenido y para setear las vars --shell-gap / --shell-aside-bg /
 *    --shell-aside-border.
 *  - asideClassName: hook de contenido del aside (ej. "inicio-aside").
 *  - aside: contenido de la columna derecha (omitir para no renderizarla).
 *    Sin aside, el layout colapsa a una sola columna a ancho completo — las
 *    vistas "sin rail" (Inicio, Inventario) reubican el contenido secundario
 *    en bandas dentro del main.
 *
 * El edge-to-edge en desktop lo da la clase owner-layout--shell (en App.jsx).
 */
export default function ShellLayout({ className = '', asideClassName = '', aside, children }) {
  const hasAside = aside != null;
  return (
    <div className={`shell ${className}`.trim()}>
      <div className={`shell-layout${hasAside ? '' : ' shell-layout--no-aside'}`}>
        <div className="shell-main">{children}</div>
        {hasAside && (
          <aside className={`shell-aside ${asideClassName}`.trim()}>
            <div className="shell-aside-inner">{aside}</div>
          </aside>
        )}
      </div>
    </div>
  );
}
