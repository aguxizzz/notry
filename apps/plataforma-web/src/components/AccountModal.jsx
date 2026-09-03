import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, Users, LogOut, X } from 'lucide-react';
import { PLATFORM_ROLE_LABELS } from '../constants/roles';
import ProfileCard from './ProfileCard';
import TeamPanel from './TeamPanel';
import './Configuracion.css';
import './AccountModal.css';

const SECTIONS = [
  { id: 'perfil', label: 'Perfil', icon: <User size={18} /> },
  { id: 'equipo', label: 'Equipo', icon: <Users size={18} /> },
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
  onLogout,
}) {
  const [activeSection, setActiveSection] = useState('perfil');
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const roleLabel = PLATFORM_ROLE_LABELS[user?.role] || 'Cuenta';
  const firstLetter = user?.full_name?.charAt(0).toUpperCase() || '?';

  return createPortal(
    <div className="account-modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="account-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Mi cuenta"
      >
        <button className="account-modal-close" onClick={onClose} aria-label="Cerrar">
          <X size={18} />
        </button>

        <nav className="account-modal-nav">
          <div className="account-modal-nav-user">
            <div className="user-avatar user-avatar--sm">{firstLetter}</div>
            <div className="sidebar-user-meta">
              <span className="sidebar-user-name">{user?.full_name || 'Mi cuenta'}</span>
              <span className="sidebar-user-role">{roleLabel}</span>
            </div>
          </div>

          <div className="account-modal-nav-items">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                className={`account-modal-nav-item ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
                aria-current={activeSection === section.id ? 'page' : undefined}
              >
                <span className="account-modal-nav-icon">{section.icon}</span>
                <span>{section.label}</span>
              </button>
            ))}
          </div>

          <button className="account-modal-nav-item account-modal-logout" onClick={onLogout}>
            <span className="account-modal-nav-icon"><LogOut size={18} /></span>
            <span>Salir</span>
          </button>
        </nav>

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
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
