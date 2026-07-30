import React from 'react';
import {
  Home,
  Package,
  Users,
  BarChart2,
  Settings,
  LogOut,
  Menu,
  X,
  Layers,
  CreditCard,
} from 'lucide-react';
import { PLATFORM_ROLE_LABELS } from '../constants/roles';
import './Sidebar.css';

const Sidebar = ({ user, activeItem, onItemClick, onLogout, isOpen, onToggle }) => {
  const firstLetter = user?.full_name?.charAt(0).toUpperCase() || '?';
  const roleLabel = PLATFORM_ROLE_LABELS[user?.role] || 'Cuenta';

  const menuSections = [
    {
      id: 'panorama',
      label: 'Panorama',
      items: [
        { id: 'inicio', label: 'Inicio', icon: <Home size={20} /> },
        { id: 'analisis', label: 'Análisis', icon: <BarChart2 size={20} /> },
      ],
    },
    {
      id: 'operacion',
      label: 'Operación',
      items: [
        { id: 'inventario', label: 'Inventario', icon: <Package size={20} /> },
        { id: 'clientes', label: 'Clientes', icon: <Users size={20} /> },
        { id: 'cobranzas', label: 'Cobranzas', icon: <CreditCard size={20} /> },
      ],
    },
    {
      id: 'organizacion',
      label: 'Organización',
      items: [
        { id: 'proyectos', label: 'Proyectos', icon: <Layers size={20} /> },
        { id: 'configuracion', label: 'Configuración', icon: <Settings size={20} /> },
      ],
    },
  ];

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`} data-active-view={activeItem}>
      <div className="sidebar-top">
        <button className="sidebar-hamburger" onClick={onToggle} aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'}>
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="user-avatar">
          {firstLetter}
        </div>
        <div className="sidebar-user-meta">
          <span className="sidebar-user-name">{user?.full_name || 'Mi cuenta'}</span>
          <span className="sidebar-user-role">{roleLabel}</span>
        </div>
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
        <button onClick={onLogout} className="sidebar-item logout-item">
          <span className="sidebar-icon"><LogOut size={20} /></span>
          <span className="sidebar-label">Salir</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
