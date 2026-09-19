import React from 'react';
import {
  Home,
  Package,
  Users,
  BarChart2,
  Menu,
  X,
  CreditCard,
  Share2,
} from 'lucide-react';
import { PLATFORM_ROLE_LABELS } from '../constants/roles';
import logo from '../assets/logo-paseo-berlin.png';
import OrgSwitcher from './OrgSwitcher';
import './Sidebar.css';

const Sidebar = ({ user, activeItem, onItemClick, onOpenAccount, onOpenShare, shareDisabledReason, isOpen, onToggle, apiFetch, activeOrgId, onChangeOrg, orgListVersion, isVisorOnly }) => {
  const isSuperAdmin = user?.role === 'super_admin';
  const firstLetter = user?.full_name?.charAt(0).toUpperCase() || '?';
  const roleLabel = PLATFORM_ROLE_LABELS[user?.role];
  const nameWords = user?.full_name?.trim().split(/\s+/) || [];
  const displayName = nameWords.length >= 3 ? nameWords.slice(0, 2).join(' ') : user?.full_name || 'Mi cuenta';

  // Orgs visor_only (tier "solo visor") solo administran Proyectos/Loteos/Lotes
  // y ven Análisis; sin Inicio (Kanban), Clientes ni Cobranzas.
  const menuSections = [
    {
      id: 'panorama',
      label: 'Panorama',
      items: [
        ...(isVisorOnly ? [] : [{ id: 'inicio', label: 'Inicio', icon: <Home size={20} /> }]),
        { id: 'analisis', label: 'Análisis', icon: <BarChart2 size={20} /> },
      ],
    },
    {
      id: 'operacion',
      label: 'Operación',
      items: [
        { id: 'inventario', label: 'Inventario', icon: <Package size={20} /> },
        ...(isVisorOnly ? [] : [
          { id: 'clientes', label: 'Clientes', icon: <Users size={20} /> },
          { id: 'cobranzas', label: 'Cobranzas', icon: <CreditCard size={20} /> },
        ]),
      ],
    },
  ];

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`} data-active-view={activeItem}>
      <div className="sidebar-top">
        <button className="sidebar-hamburger" onClick={onToggle} aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'}>
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        {isSuperAdmin ? (
          <OrgSwitcher apiFetch={apiFetch} activeOrgId={activeOrgId} onChangeOrg={onChangeOrg} orgListVersion={orgListVersion} />
        ) : (
          <img src={logo} alt="Paseo Berlín" className="sidebar-logo" />
        )}
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-nav-content">
          {menuSections.map((section) => (
            <div
              key={section.id}
              className="sidebar-nav-group"
              role="group"
              aria-labelledby={`sidebar-section-${section.id}`}
            >
              <span
                id={`sidebar-section-${section.id}`}
                className="sidebar-section"
              >
                {section.label}
              </span>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  className={`sidebar-item ${activeItem === item.id ? 'active' : ''}`}
                  onClick={() => onItemClick(item.id)}
                  aria-current={activeItem === item.id ? 'page' : undefined}
                >
                  <span className="sidebar-icon">{item.icon}</span>
                  <span className="sidebar-label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>

      <div className="sidebar-bottom">
        <button
          type="button"
          onClick={onOpenShare}
          className="sidebar-item sidebar-share"
          disabled={Boolean(shareDisabledReason)}
          title={shareDisabledReason || undefined}
        >
          <span className="sidebar-icon"><Share2 size={20} /></span>
          <span className="sidebar-label">Compartir visor</span>
        </button>
        <button onClick={onOpenAccount} className="sidebar-item account-item">
          <div className="user-avatar user-avatar--sm">{firstLetter}</div>
          <div className="sidebar-user-meta">
            <span className="sidebar-user-name">{displayName}</span>
            {roleLabel && <span className="sidebar-user-role">{roleLabel}</span>}
          </div>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
