export default function BlueprintTooltip({ hoveredLoteId, annotations, clicksMap, tooltipPos }) {
  if (!hoveredLoteId || clicksMap[hoveredLoteId] === undefined) return null;

  const ann = annotations.find(a => a.uuid === hoveredLoteId);
  const label = ann?.tooltip || 'Lote';
  const clicks = clicksMap[hoveredLoteId];

  return (
    <div
      className="blueprint-tooltip"
      style={{
        left: `${tooltipPos.x}px`,
        top: `${tooltipPos.y}px`,
        transform: 'translate(-50%, -100%) translateY(-12px)',
        zIndex: 10,
      }}
    >
      {label}
      <br />
      <strong>{clicks} clics</strong>
    </div>
  );
}
