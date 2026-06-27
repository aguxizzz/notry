import { useState } from 'react';
import { Layers, Plus, Trash2, X } from 'lucide-react';
import ProjectFormModal from '../modals/ProjectFormModal';
import ConfirmModal from '../ConfirmModal';
import { Select } from '../../ui/components';
import { createProject, updateProject, deleteProject, assignLoteos, unassignLoteo } from '../../api/projects';
import './ProjectsView.css';

export default function ProjectsView({ apiFetch, uploadFn, onUploadEvent, allLoteos = [], addToast, projects, projectsLoading, setProjects }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleCreate({ name, branding }) {
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createProject({ apiFetch, name, branding });
      setProjects(prev => [...prev, created]);
      setModalOpen(false);
      addToast?.('Proyecto creado', 'success');
    } catch (e) {
      setSaveError(e.message || 'Error al crear el proyecto');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit({ name, branding }) {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateProject({ apiFetch, projectId: editingProject.id, name, branding });
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
      setEditingProject(null);
      addToast?.('Proyecto actualizado', 'success');
    } catch (e) {
      setSaveError(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!projectToDelete) return;
    setDeleting(true);
    try {
      await deleteProject({ apiFetch, projectId: projectToDelete.id });
      setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
      addToast?.('Proyecto eliminado', 'success');
      setProjectToDelete(null);
    } catch {
      addToast?.('Error al eliminar el proyecto', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleAssignLoteo(projectId, loteoId) {
    if (!loteoId) return;
    try {
      const updated = await assignLoteos({ apiFetch, projectId, loteoIds: [loteoId] });
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      addToast?.('Loteo asignado al proyecto', 'success');
    } catch {
      addToast?.('Error al asignar el loteo', 'error');
    }
  }

  async function handleUnassign(projectId, loteoId) {
    try {
      const updated = await unassignLoteo({ apiFetch, projectId, loteoId });
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      addToast?.('Loteo removido del proyecto', 'success');
    } catch {
      addToast?.('Error al remover el loteo', 'error');
    }
  }

  // Loteos no asignados a ningún proyecto (o asignados a otro, también se pueden reasignar)
  function getAvailableLoteos(project) {
    const assigned = new Set(project.loteo_ids.map(String));
    return allLoteos.filter(l => !assigned.has(String(l.id)));
  }

  if (projectsLoading) return <div className="projects-loading">Cargando proyectos...</div>;

  return (
    <div className="projects-view">
      {projects.length === 0 ? (
        <div className="projects-empty">
          <Layers size={40} />
          <h3>Creá tu primer proyecto</h3>
          <p>Definí una identidad visual y asigná los loteos que van a compartirla.</p>
          <button className="btn-primary" onClick={() => setModalOpen(true)}>Crear el primero</button>
        </div>
      ) : (
        <>
        <div className="projects-header">
          <div className="projects-title-row">
            <Layers size={22} />
            <h2>Proyectos activos</h2>
          </div>
          <button className="btn-primary projects-new-btn" onClick={() => { setSaveError(null); setModalOpen(true); }}>
            <Plus size={15} />
            Nuevo proyecto
          </button>
        </div>
        <div className="projects-list">
          {projects.map(project => {
            const b = project.branding || {};
            const projectLoteoIds = new Set((project.loteo_ids ?? []).map(String));
            const assignedLoteos = allLoteos.filter(l => projectLoteoIds.has(String(l.id)));
            const available = getAvailableLoteos(project);

            return (
              <div key={project.id} className="project-card">
                <div className="project-card-header">
                  <div className="project-color-preview">
                    <span style={{ background: b.primary_color || '#c5a059' }} />
                    <span style={{ background: b.accent_color || '#b38a3f' }} />
                  </div>
                  <div className="project-card-info">
                    <h3>{project.name}</h3>
                    <span className="project-loteo-count">{assignedLoteos.length} loteo{assignedLoteos.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="project-card-actions">
                    <button className="btn-ghost btn-sm" onClick={() => { setSaveError(null); setEditingProject(project); }}>Editar</button>
                    <button className="btn-ghost btn-sm btn-danger" onClick={() => setProjectToDelete(project)}><Trash2 size={14} /></button>
                  </div>
                </div>

                {b.logo_primary && (
                  <div className="project-logo-preview">
                    <img src={b.logo_primary} alt="Logo principal" />
                    {b.logo_secondary && <img src={b.logo_secondary} alt="Logo secundario" />}
                  </div>
                )}

                <div className="project-loteos-section">
                  <p className="project-section-label">Loteos asignados</p>
                  {assignedLoteos.length === 0 ? (
                    <p className="project-no-loteos">Ningún loteo asignado todavía.</p>
                  ) : (
                    <div className="project-loteos-list">
                      {assignedLoteos.map(l => (
                        <div key={l.id} className="project-loteo-chip">
                          <span>{l.name}</span>
                          <button onClick={() => handleUnassign(project.id, l.id)} title="Remover"><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  {available.length > 0 && (
                    <div className="project-assign-row">
                      <Select
                        id={`assign-loteo-${project.id}`}
                        className="project-assign-select"
                        value=""
                        onChange={e => handleAssignLoteo(project.id, e.target.value)}
                        options={[
                          { value: '', label: '+ Asignar loteo' },
                          ...available.map(l => ({ value: String(l.id), label: l.name })),
                        ]}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      <ProjectFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
        loading={saving}
        error={saveError}
        apiFetch={apiFetch}
        uploadFn={uploadFn}
        onUploadEvent={onUploadEvent}
      />

      <ProjectFormModal
        key={editingProject?.id ?? 'edit'}
        isOpen={!!editingProject}
        onClose={() => setEditingProject(null)}
        onSubmit={handleEdit}
        loading={saving}
        error={saveError}
        initialData={editingProject}
        apiFetch={apiFetch}
        uploadFn={uploadFn}
        onUploadEvent={onUploadEvent}
      />

      <ConfirmModal
        isOpen={!!projectToDelete}
        title="¿Eliminar proyecto?"
        message={projectToDelete ? `Estás a punto de eliminar "${projectToDelete.name}". Los loteos quedarán sin proyecto asignado.` : ''}
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setProjectToDelete(null)}
      />
    </div>
  );
}
