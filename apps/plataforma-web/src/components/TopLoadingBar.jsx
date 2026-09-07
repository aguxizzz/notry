import './TopLoadingBar.css';

// Barra de progreso fina arriba de todo, estilo YouTube/GitHub: se muestra
// mientras se recarga el contexto de organización (org, proyectos, sync),
// típicamente al cambiar de org desde el OrgSwitcher (super_admin).
export default function TopLoadingBar({ visible }) {
  if (!visible) return null;
  return (
    <div className="top-loading-bar" role="status" aria-label="Cargando organización">
      <div className="top-loading-bar__fill" />
    </div>
  );
}
