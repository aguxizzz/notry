export default function BlueprintWarningBanner({ missingCount }) {
  if (!missingCount || missingCount <= 0) return null;
  return (
    <div className="blueprint-warning">
      <span>⚠️ {missingCount} lote{missingCount > 1 ? 's' : ''} no se muestran (sin coordenadas en blueprint)</span>
    </div>
  );
}