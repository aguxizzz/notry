import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, Users, Building2, Database, Layers, Wallet, LogOut, X } from 'lucide-react';
import { PLATFORM_ROLE_LABELS } from '../constants/roles';
import { Button } from '../ui/components';
import { UnsavedChangesContext } from '../hooks/useUnsavedChanges';
import ProfileCard from './ProfileCard';
import TeamPanel from './TeamPanel';
import DataPanel from './DataPanel';
import CreateOrgPanel from './CreateOrgPanel';
import ProjectSettingsPanel from './ProjectSettingsPanel';
import './Configuracion.css';
import '../ui/components/Modal.css';
import './AccountModal.css';

// Secciones agrupadas para la navegación lateral. `requires` limita quién las ve:
// - owner: solo el owner de la org (identidad visual, finanzas del proyecto y
//   acciones destructivas sobre datos). "Finanzas" no aplica a orgs visor_only
//   (sin simulador), de ahí `hideIf`.
// - superAdmin: alta de organizaciones cliente nuevas.
const NAV_GROUPS = [
  {
    label: 'Cuenta',
    items: [
      { id: 'perfil', label: 'Perfil', icon: <User size={18} /> },
    ],
  },
  {
    label: 'Organización',
    items: [
      { id: 'equipo', label: 'Equipo', icon: <Users size={18} /> },
      { id: 'datos', label: 'Datos', icon: <Database size={18} />, requires: 'owner' },
    ],
  },
  {
    label: 'Proyecto',
    items: [
      { id: 'visual', label: 'Visual', icon: <Layers size={18} />, requires: 'owner' },
      { id: 'finanzas', label: 'Finanzas', icon: <Wallet size={18} />, requires: 'owner', hideIf: 'isVisorOnly' },
    ],
  },
  {
    label: 'Plataforma',
    items: [
      { id: 'organizaciones', label: 'Organizaciones', icon: <Building2 size={18} />, requires: 'superAdmin' },
    ],
  },
];

export default function AccountModal({
  open,
  onClose,
  user,
  setUser,
  apiFetch,
  addToast,
  org,
  orgLoading,
  setOrg,
  orgRole,
  setActiveOrgId,
  onOrgCreated,
  onLogout,
  uploadFn,
  onUploadEvent,
  allLoteos,
  projects,
  projectsLoading,
  setProjects,
  isVisorOnly,
}) {
  const [activeSection, setActiveSection] = useState('perfil');
  const isOwner = orgRole === 'owner' || user?.role === 'super_admin';
  const isSuperAdmin = user?.role === 'super_admin';
  const navGroups = NAV_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        (item.requires !== 'owner' || isOwner) &&
        (item.requires !== 'superAdmin' || isSuperAdmin) &&
        !(item.hideIf === 'isVisorOnly' && isVisorOnly)
      ),
    }))
    .filter(group => group.items.length > 0);
  const modalRef = useRef(null);

  // Configuración no tiene botones de Guardar: los paneles registran acá sus
  // cambios pendientes (useUnsavedChanges) y, antes de cerrar el modal, cambiar
  // de sección o salir, se pregunta si guardarlos.
  const [registry] = useState(() => new Map());
  const [pendingLeave, setPendingLeave] = useState(null); // { proceed } mientras se pide confirmación
  const [leaving, setLeaving] = useState(false);

  const pendingEntries = () => [...registry.values()].map(get => get()).filter(entry => entry.dirty);

  function guard(proceed) {
    if (pendingEntries().length === 0) proceed();
    else setPendingLeave({ proceed });
  }

  async function saveAndLeave() {
    setLeaving(true);
    const results = await Promise.all(pendingEntries().map(entry => entry.save()));
    setLeaving(false);
    if (results.every(Boolean)) {
      pendingLeave.proceed();
    }
    // Si algo falló, el panel ya mostró el error: nos quedamos para que se corrija.
    setPendingLeave(null);
  }

  function discardAndLeave() {
    pendingLeave.proceed();
    setPendingLeave(null);
  }

  const requestClose = () => guard(onClose);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (pendingLeave) { if (!leaving) setPendingLeave(null); } else requestClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  if (!open) return null;

  const roleLabel = PLATFORM_ROLE_LABELS[user?.role];
  const firstLetter = user?.full_name?.charAt(0).toUpperCase() || '?';

  return createPortal(
    <div className="account-modal-overlay" onClick={requestClose}>
      <div
        ref={modalRef}
        className="account-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Mi cuenta"
      >
        <button className="account-modal-close" onClick={requestClose} aria-label="Cerrar">
          <X size={18} />
        </button>

        <nav className="account-modal-nav">
          <div className="account-modal-nav-user">
            <div className="user-avatar user-avatar--sm">{firstLetter}</div>
            <div className="sidebar-user-meta">
              <span className="sidebar-user-name">{user?.full_name || 'Mi cuenta'}</span>
              {roleLabel && <span className="sidebar-user-role">{roleLabel}</span>}
            </div>
          </div>

          <div className="account-modal-nav-items">
            {navGroups.map(group => (
              <div key={group.label} className="account-modal-nav-group" role="group" aria-label={group.label}>
                <span className="account-modal-nav-group-label">{group.label}</span>
                {group.items.map((section) => (
                  <button
                    key={section.id}
                    className={`account-modal-nav-item ${activeSection === section.id ? 'active' : ''}`}
                    onClick={() => section.id !== activeSection && guard(() => setActiveSection(section.id))}
                    aria-current={activeSection === section.id ? 'page' : undefined}
                  >
                    <span className="account-modal-nav-icon">{section.icon}</span>
                    <span>{section.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="account-modal-nav-footer">
            <button className="account-modal-nav-item account-modal-logout" onClick={() => guard(onLogout)}>
              <span className="account-modal-nav-icon"><LogOut size={18} /></span>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </nav>

        <UnsavedChangesContext.Provider value={registry}>
        <div className="account-modal-content">
          {activeSection === 'perfil' && (
            <ProfileCard user={user} setUser={setUser} apiFetch={apiFetch} addToast={addToast} />
          )}
          {activeSection === 'equipo' && (
            <TeamPanel
              user={user}
              apiFetch={apiFetch}
              addToast={addToast}
              org={org}
              orgLoading={orgLoading}
              setOrg={setOrg}
              orgRole={orgRole}
            />
          )}
          {activeSection === 'visual' && isOwner && (
            <ProjectSettingsPanel
              section="visual"
              apiFetch={apiFetch}
              uploadFn={uploadFn}
              onUploadEvent={onUploadEvent}
              allLoteos={allLoteos}
              addToast={addToast}
              projects={projects}
              projectsLoading={projectsLoading}
              setProjects={setProjects}
              isVisorOnly={isVisorOnly}
            />
          )}
          {activeSection === 'finanzas' && isOwner && !isVisorOnly && (
            <ProjectSettingsPanel
              section="finanzas"
              apiFetch={apiFetch}
              uploadFn={uploadFn}
              onUploadEvent={onUploadEvent}
              allLoteos={allLoteos}
              addToast={addToast}
              projects={projects}
              projectsLoading={projectsLoading}
              setProjects={setProjects}
              isVisorOnly={isVisorOnly}
              org={org}
              orgLoading={orgLoading}
              setOrg={setOrg}
            />
          )}
          {activeSection === 'datos' && isOwner && (
            <DataPanel apiFetch={apiFetch} addToast={addToast} />
          )}
          {activeSection === 'organizaciones' && isSuperAdmin && (
            <CreateOrgPanel
              apiFetch={apiFetch}
              addToast={addToast}
              setActiveOrgId={setActiveOrgId}
              onOrgCreated={onOrgCreated}
            />
          )}
        </div>
        </UnsavedChangesContext.Provider>
      </div>

      {pendingLeave && (
        <div className="modal-overlay" onClick={() => !leaving && setPendingLeave(null)}>
          <div
            className="modal-card unsaved-dialog"
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
          >
            <h3 id="unsaved-title" className="unsaved-dialog-title">¿Guardar los cambios?</h3>
            <p className="unsaved-dialog-message">
              Modificaste datos en Configuración que todavía no se guardaron.
            </p>
            <div className="unsaved-dialog-actions">
              <Button variant="outline" size="sm" className="unsaved-dialog-back" onClick={() => setPendingLeave(null)} disabled={leaving}>
                Seguir editando
              </Button>
              <Button variant="outline" size="sm" onClick={discardAndLeave} disabled={leaving}>
                Descartar
              </Button>
              <Button size="sm" onClick={saveAndLeave} disabled={leaving} loading={leaving}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
