import {
  ArrowLeft,
  Download,
  LogOut,
  PanelLeft,
  PanelRight,
} from 'lucide-react';

export default function DocumentBar({
  projectName,
  hasUnsavedChanges,
  isSaving,
  onSave,
  onBack,
  backTitle,
  onLogout,
  projectPanelOpen,
  onToggleProjectPanel,
  inspectorOpen,
  onToggleInspector,
}) {
  const saveLabel = isSaving
    ? 'Guardando…'
    : hasUnsavedChanges
      ? 'Guardar cambios'
      : 'Guardado';

  return (
    <header className="document-bar">
      <div className="document-bar__start">
        <button
          type="button"
          className="editor-icon-btn"
          onClick={onBack}
          title={backTitle}
          aria-label={backTitle}
        >
          <ArrowLeft size={18} />
        </button>

        <button
          type="button"
          className={`editor-icon-btn${projectPanelOpen ? ' is-active' : ''}`}
          onClick={onToggleProjectPanel}
          title="Mostrar u ocultar proyecto"
          aria-label="Mostrar u ocultar panel de proyecto"
          aria-pressed={projectPanelOpen}
        >
          <PanelLeft size={18} />
        </button>

        <div className="document-identity">
          <span className="document-identity__eyebrow">Editor de loteo</span>
          <strong className="document-identity__name" title={projectName}>
            {projectName || 'Loteo sin nombre'}
          </strong>
        </div>
      </div>

      <div className="document-bar__end">
        <span
          className={`save-state${hasUnsavedChanges ? ' is-dirty' : ' is-saved'}`}
          aria-live="polite"
        >
          <span className="save-state__dot" aria-hidden="true" />
          {isSaving ? 'Guardando cambios' : hasUnsavedChanges ? 'Cambios sin guardar' : 'Todo guardado'}
        </span>

        <button
          type="button"
          className="editor-btn editor-btn--primary document-save-btn"
          onClick={onSave}
          disabled={isSaving || !hasUnsavedChanges}
          title="Guardar todos los cambios (Ctrl+S)"
        >
          <Download size={16} />
          <span>{saveLabel}</span>
        </button>

        <button
          type="button"
          className={`editor-icon-btn${inspectorOpen ? ' is-active' : ''}`}
          onClick={onToggleInspector}
          title="Mostrar u ocultar propiedades"
          aria-label="Mostrar u ocultar panel de propiedades"
          aria-pressed={inspectorOpen}
        >
          <PanelRight size={18} />
        </button>

        <button
          type="button"
          className="editor-icon-btn"
          onClick={onLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
