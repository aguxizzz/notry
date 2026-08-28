import { useState } from 'react';
import { Layers, Plus, Pencil, Trash2, X } from 'lucide-react';
import ProjectFormModal from '../modals/ProjectFormModal';
import ConfirmModal from '../ConfirmModal';
import ShellLayout from '../ShellLayout';
import {
  Button,
  FeedbackState,
  PageHeader,
  PageLayout,
  Panel,
  Select,
} from '../../ui/components';
import { createProject, updateProject, deleteProject, assignLoteos, unassignLoteo } from '../../api/projects';
import './ProjectsView.css';

export default function ProjectsView({ apiFetch, uploadFn, onUploadEvent, allLoteos = [], addToast, projects, projectsLoading, setProjects }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleCreate({ name, slug, branding }) {
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createProject({ apiFetch, name, slug, branding });
      setProjects(prev => [...prev, created]);
      setModalOpen(false);
      addToast?.('Proyecto creado', 'success');
    } catch (e) {
      setSaveError(e.message || 'Error al crear el proyecto');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit({ name, slug, branding }) {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateProject({ apiFetch, projectId: editingProject.id, name, slug, branding });
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
    const snapshot = projects;
    // Optimista: agrego el loteo al proyecto en el acto; reconcilio con la respuesta.
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, loteo_ids: [...(p.loteo_ids ?? []), loteoId] } : p
    ));
    try {
      const updated = await assignLoteos({ apiFetch, projectId, loteoIds: [loteoId] });
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
    } catch {
      setProjects(snapshot);
      addToast?.('Error al asignar el loteo', 'error');
    }
  }

  async function handleUnassign(projectId, loteoId) {
    const snapshot = projects;
    // Optimista: saco el loteo del proyecto en el acto; reconcilio con la respuesta.
    setProjects(prev => prev.map(p =>
      p.id === projectId
        ? { ...p, loteo_ids: (p.loteo_ids ?? []).filter(id => String(id) !== String(loteoId)) }
        : p
    ));
    try {
      const updated = await unassignLoteo({ apiFetch, projectId, loteoId });
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
    } catch {
      setProjects(snapshot);
      addToast?.('Error al remover el loteo', 'error');
    }
  }

  // Loteos no asignados a ningún proyecto (o asignados a otro, también se pueden reasignar)
  function getAvailableLoteos(project) {
    const assigned = new Set(project.loteo_ids.map(String));
    return allLoteos.filter(l => !assigned.has(String(l.id)));
  }

  return (
    <ShellLayout className="projects-shell">
      <PageLayout className="projects-page">
        <PageHeader
          eyebrow="Identidad de marca"
          title="Proyectos"
          description="Agrupá loteos bajo una identidad visual compartida para cada desarrollo."
          actions={projects.length > 0 ? (
            <Button size="sm" onClick={() => { setSaveError(null); setModalOpen(true); }}>
              <Plus size={16} aria-hidden="true" />
              Nuevo proyecto
            </Button>
          ) : null}
        />

        {projectsLoading ? (
          <FeedbackState
            className="projects-feedback"
            busy
            title="Cargando proyectos"
            description="Consultando identidades y loteos asociados…"
          />
        ) : projects.length === 0 ? (
          <FeedbackState
            className="projects-feedback"
            icon={<Layers size={25} />}
            title="Creá tu primer proyecto"
            description="Definí una identidad visual y asigná los loteos que van a compartirla."
            action={(
              <Button size="sm" onClick={() => { setSaveError(null); setModalOpen(true); }}>
                <Plus size={16} aria-hidden="true" />
                Crear proyecto
              </Button>
            )}
          />
        ) : (
          <div className="projects-grid">
            {projects.map(project => {
            const b = project.branding || {};
            const primary = b.primary_color || '#c5a059';
            const accent = b.accent_color || '#8e7343';
            const projectLoteoIds = new Set((project.loteo_ids ?? []).map(String));
            const assignedLoteos = allLoteos.filter(l => projectLoteoIds.has(String(l.id)));
            const available = getAvailableLoteos(project);
            const count = assignedLoteos.length;

            return (
              <Panel key={project.id} className="project-card" flush style={{ '--pc': primary, '--ac': accent }}>
                <div className="project-brand">
                  <div className="project-logo">
                    {b.logo_primary
                      ? <img src={b.logo_primary} alt="" />
                      : <span>{(project.name || '?').charAt(0).toUpperCase()}</span>}
                  </div>
                  <div className="project-brand-text">
                    <div className="project-name">{project.name}</div>
                    <div className="project-count">
                      {count > 0 ? `${count} loteo${count !== 1 ? 's' : ''} asignado${count !== 1 ? 's' : ''}` : 'Sin loteos'}
                    </div>
                  </div>
                </div>

                {count > 0 ? (
                  <div className="project-loteo-list">
                    {assignedLoteos.map(l => (
                      <div key={l.id} className="project-loteo-row">
                        <span className="project-loteo-name">{l.name}</span>
                        <button
                          className="project-loteo-remove"
                          onClick={() => handleUnassign(project.id, l.id)}
                          title="Quitar loteo"
                          aria-label={`Quitar ${l.name}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="project-loteo-placeholder">
                    <p className="project-loteo-empty-title">Sin loteos asignados</p>
                    <p className="project-loteo-empty-sub">
                      {available.length > 0
                        ? 'Asigná un loteo desde el menú de abajo.'
                        : 'No hay loteos disponibles para asignar.'}
                    </p>
                  </div>
                )}

                <div className="project-foot">
                  <div className="project-foot-assign">
                    {available.length > 0 && (
                      <Select
                        id={`assign-loteo-${project.id}`}
                        className="project-assign-select"
                        value=""
                        onChange={e => handleAssignLoteo(project.id, e.target.value)}
                        options={[
                          { value: '', label: 'Asignar loteo' },
                          ...available.map(l => ({ value: String(l.id), label: l.name })),
                        ]}
                      />
                    )}
                  </div>
                  <div className="project-foot-actions">
                    <button className="project-link" onClick={() => { setSaveError(null); setEditingProject(project); }}>
                      <Pencil size={14} />
                      Editar proyecto
                    </button>
                    <button className="project-link project-link--danger" onClick={() => setProjectToDelete(project)}>
                      <Trash2 size={14} />
                      Eliminar
                    </button>
                  </div>
                </div>
              </Panel>
            );
          })}
          </div>
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
      </PageLayout>
    </ShellLayout>
  );
}
