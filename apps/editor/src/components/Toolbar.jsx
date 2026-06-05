import { MousePointer2, Pentagon, Type, ArrowLeft, Grid3x3, Camera, MapPin, Menu, X, LogOut, Undo2, Redo2, Crosshair } from 'lucide-react';
import { CALIBRATION_ENABLED } from '../config/features';

const TOOLS = [
  { id: 'select',  icon: MousePointer2, title: 'Seleccionar' },
  { id: 'polygon', icon: Pentagon,      title: 'Lote',        shortcut: '1' },
  { id: 'text',    icon: Type,          title: 'Texto',       shortcut: '2' },
  { id: 'poi',     icon: MapPin,        title: 'POI',         shortcut: '3' },
];

export default function Toolbar({
  activeTool,
  onToolChange,
  mode,
  onModeChange,
  panoramaUrl,
  blueprintUrl,
  drawingPolygon,
  onFinishPolygon,
  onCancelPolygon,
  inspectorOpen,
  onToggleInspector,
  onLogout,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  calibrationPoints,
  calibrationStep,
  onCancelCalibration,
  onDeleteCalibrationPoint,
  onClearCalibration,
}) {
  return (
    <>
      <div className="toolbar">
        <button
          className="tool-btn"
          onClick={() => window.location.href = window.location.origin + window.location.pathname}
          title="Volver al listado"
          style={{ marginRight: '10px', background: '#333' }}
        >
          <ArrowLeft size={20} />
        </button>

        <div style={{ height: '24px', width: '1px', background: '#444', marginRight: '10px' }} />

        <button
          className={`tool-btn ${mode === 'panorama' ? 'active' : ''}`}
          onClick={() => onModeChange('panorama')}
          title="Modo Panorama"
          disabled={!panoramaUrl}
          style={{ opacity: !panoramaUrl ? 0.4 : 1 }}
        >
          <Camera size={20} />
        </button>
        {blueprintUrl && (
          <button
            className={`tool-btn ${mode === 'blueprint' ? 'active' : ''}`}
            onClick={() => onModeChange('blueprint')}
            title="Modo Blueprint"
          >
            <Grid3x3 size={20} />
          </button>
        )}

        <div style={{ height: '24px', width: '1px', background: '#444', marginRight: '10px' }} />

        {TOOLS.map(tool => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
              onClick={() => onToolChange(tool.id)}
              title={tool.shortcut ? `${tool.title} (${tool.shortcut})` : tool.title}
              disabled={!panoramaUrl && !blueprintUrl}
              style={{ position: 'relative' }}
            >
              <Icon size={20} />
              {tool.shortcut && (
                <span style={{
                  position: 'absolute', bottom: '2px', right: '3px',
                  fontSize: '9px', lineHeight: 1, color: '#888', fontWeight: 600,
                  pointerEvents: 'none',
                }}>
                  {tool.shortcut}
                </span>
              )}
            </button>
          );
        })}

        {/* Calibration is a local-only, work-in-progress tool. The CALIBRATION_ENABLED
            flag (VITE_CALIBRATION) hides this entry point in production/Vercel so the
            feature ships in the bundle but stays unreachable for end users. */}
        {CALIBRATION_ENABLED && blueprintUrl && panoramaUrl && (
          <>
            <div style={{ height: '24px', width: '1px', background: '#444', marginLeft: '4px' }} />
            <button
              className={`tool-btn ${activeTool === 'calibrate' ? 'active' : ''}`}
              onClick={() => onToolChange('calibrate')}
              title="Calibrar blueprint ↔ panorama"
              style={{ position: 'relative' }}
            >
              <Crosshair size={20} />
              {calibrationPoints?.length > 0 && (
                <span style={{
                  position: 'absolute', top: '2px', right: '2px',
                  background: calibrationPoints.length >= 4 ? '#22c55e' : '#f59e0b',
                  color: '#fff', fontSize: '9px', fontWeight: 700,
                  borderRadius: '50%', width: '13px', height: '13px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  {calibrationPoints.length}
                </span>
              )}
            </button>
          </>
        )}

        <div style={{ height: '24px', width: '1px', background: '#444', marginLeft: '4px' }} />

        <button
          className="tool-btn"
          onClick={onUndo}
          title="Deshacer (Ctrl+Z)"
          disabled={!canUndo}
          style={{ opacity: canUndo ? 1 : 0.35 }}
        >
          <Undo2 size={20} />
        </button>
        <button
          className="tool-btn"
          onClick={onRedo}
          title="Rehacer (Ctrl+Y)"
          disabled={!canRedo}
          style={{ opacity: canRedo ? 1 : 0.35 }}
        >
          <Redo2 size={20} />
        </button>

        <div style={{ height: '24px', width: '1px', background: '#444', marginLeft: '4px' }} />

        <button
          className="tool-btn"
          onClick={onLogout}
          title="Cerrar Sesión"
          style={{ color: '#ef4444' }}
        >
          <LogOut size={20} />
        </button>
      </div>

      <button
        className="inspector-toggle-btn"
        onClick={onToggleInspector}
        title="Toggle Inspector"
        aria-label="Toggle inspector panel"
      >
        {inspectorOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {(activeTool === 'polygon' || activeTool === 'poi') && drawingPolygon.length > 0 && (
        <div style={{
          position: 'fixed', bottom: '1rem', left: '50%',
          transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', gap: '1rem',
        }}>
          <button className="btn-primary" onClick={onFinishPolygon} style={{ background: '#28a745', width: 'auto' }}>
            Finalizar Polígono ({drawingPolygon.length} pts)
          </button>
          <button className="btn-primary" onClick={onCancelPolygon} style={{ background: '#dc3545', width: 'auto' }}>
            Cancelar
          </button>
        </div>
      )}

      {/* Calibration panel — also gated so it never shows in production even if
          activeTool somehow became 'calibrate' (see CALIBRATION_ENABLED above). */}
      {CALIBRATION_ENABLED && activeTool === 'calibrate' && (
        <div style={{
          position: 'fixed', bottom: '1rem', left: '50%',
          transform: 'translateX(-50%)', zIndex: 1000,
          background: '#1e1e24', border: '1px solid #383840',
          borderRadius: '10px', padding: '12px 20px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
          minWidth: '320px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: calibrationStep ? '#f59e0b' : '#3b82f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {calibrationPoints?.length + 1}
            </div>
            <span style={{ color: '#e5e5e5', fontSize: '13px', lineHeight: 1.4 }}>
              {calibrationStep
                ? 'Ahora clic en el mismo punto en el PANORAMA'
                : 'Clic en un punto de referencia en el BLUEPRINT'}
            </span>
          </div>

          {calibrationPoints?.length > 0 && (
            <div style={{ width: '100%', borderTop: '1px solid #383840', paddingTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ color: '#888', fontSize: '11px' }}>
                  {calibrationPoints.length} par{calibrationPoints.length !== 1 ? 'es' : ''} marcados
                  {calibrationPoints.length < 4 ? ` — necesitás ${4 - calibrationPoints.length} más` : ''}
                </span>
                {calibrationPoints.length >= 4 && (
                  <span style={{ color: '#22c55e', fontSize: '11px', fontWeight: 600 }}>✓ Calibrado</span>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {calibrationPoints.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      background: '#26262e', border: '1px solid #383840', borderRadius: '6px',
                      padding: '3px 6px 3px 7px',
                    }}
                  >
                    <span style={{
                      width: '9px', height: '9px', borderRadius: '50%',
                      background: '#3b82f6', flexShrink: 0,
                      boxShadow: 'inset -3px 0 0 #f59e0b',
                    }} />
                    <span style={{ color: '#ccc', fontSize: '11px', fontWeight: 600 }}>{i + 1}</span>
                    <button
                      onClick={() => onDeleteCalibrationPoint?.(i)}
                      title={`Borrar par ${i + 1}`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: 'none', color: '#888',
                        cursor: 'pointer', padding: 0, lineHeight: 0,
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
            {calibrationPoints?.length > 0 && (
              <button
                onClick={onClearCalibration}
                style={{
                  background: 'transparent', border: '1px solid #7f1d1d', borderRadius: '6px',
                  color: '#ef4444', fontSize: '12px', padding: '4px 14px', cursor: 'pointer',
                }}
              >
                Borrar calibración
              </button>
            )}
            <button
              onClick={onCancelCalibration}
              style={{
                background: 'transparent', border: '1px solid #555', borderRadius: '6px',
                color: '#aaa', fontSize: '12px', padding: '4px 14px', cursor: 'pointer',
              }}
            >
              Salir de calibración
            </button>
          </div>
        </div>
      )}
    </>
  );
}
