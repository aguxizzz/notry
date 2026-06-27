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
} from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ user, activeItem, onItemClick, onLogout, isOpen, onToggle }) => {
  const firstLetter = user?.full_name?.charAt(0).toUpperCase() || '?';

  const menuItems = [
    { id: 'inicio', label: 'Inicio', icon: <Home size={20} /> },
    { id: 'inventario', label: 'Inventario', icon: <Package size={20} /> },
    { id: 'clientes', label: 'Clientes', icon: <Users size={20} /> },
    { id: 'analisis', label: 'Análisis', icon: <BarChart2 size={20} /> },
    { id: 'proyectos', label: 'Proyectos', icon: <Layers size={20} /> },
    { id: 'configuracion', label: 'Configuración', icon: <Settings size={20} /> },
  ];

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar-top">
        <button className="sidebar-hamburger" onClick={onToggle} aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'}>
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="user-avatar">
          {firstLetter}
        </div>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <button 
            key={item.id} 
            className={`sidebar-item ${activeItem === item.id ? 'active' : ''}`}
            onClick={() => onItemClick(item.id)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
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
