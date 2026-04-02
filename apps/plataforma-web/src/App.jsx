import React, { useState } from 'react';
import { Copy, Search, SlidersHorizontal } from 'lucide-react';
import Sidebar from './components/Sidebar';
import StatCard from './components/StatCard';
import LoginBackground from './components/LoginBackground';
import KanbanBoard from './components/KanbanBoard';
import AnalisisView from './components/AnalisisView';
import './App.css';

const API_BASE = 'https://notry-back.onrender.com/api/v1';
const EDITOR_URL = 'https://notry-editor.vercel.app';
const VISOR_URL = 'https://notry-visor.vercel.app';

const STATUS_DISPLAY = {
  available: 'disponible',
  reserved: 'reservado',
  sold: 'vendido',
};

const CATEGORY_DISPLAY = {
  primer_contacto: 'Primer Contacto',
  seguimiento: 'Seguimiento',
  negociacion: 'Negociación',
  vendido: 'Vendido',
};

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

function App() {
  const [view, setView] = useState('login'); // 'login' | 'lote_owner' | 'super_admin'
  const [adminSubView, setAdminSubView] = useState('lotes'); // 'lotes' | 'loteos'
  const [ownerSubView, setOwnerSubView] = useState('inicio');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [lots, setLots] = useState(null);
  const [loteos, setLoteos] = useState(null);
  const [selectedLot, setSelectedLot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [inventoryLots, setInventoryLots] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState('');
  const [inventoryTab, setInventoryTab] = useState('lotes'); // 'lotes' | 'loteos'
  const [inventoryLoteos, setInventoryLoteos] = useState([]);
  const [inventoryLoteosLoading, setInventoryLoteosLoading] = useState(false);
  const [prospectosList, setProspectosList] = useState([]);
  const [prospectosLoading, setProspectosLoading] = useState(false);
  const [prospectosCategoryFilter, setProspectosCategoryFilter] = useState('');
  const [prospectosWithoutAdvisor, setProspectosWithoutAdvisor] = useState(false);
  const [createLoteoOpen, setCreateLoteoOpen] = useState(false);
  const [createLoteoForm, setCreateLoteoForm] = useState({ name: '', slug: '', image_url: '' });
  const [createLoteoLoading, setCreateLoteoLoading] = useState(false);
  const [createLoteoError, setCreateLoteoError] = useState(null);

  // Auto-fetch lots when entering super_admin view
  React.useEffect(() => {
    if (view === 'super_admin' && !lots) {
      fetchLots();
    }
  }, [view]);

  // Debounced fetch for inventory (triggers on view change, search, or filter)
  React.useEffect(() => {
    if (ownerSubView !== 'inventario' || !token) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchInventory(inventorySearch, inventoryStatusFilter, controller.signal);
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ownerSubView, inventorySearch, inventoryStatusFilter]);

  // Fetch loteos for inventory editor tab (lazy, only once)
  React.useEffect(() => {
    if (ownerSubView !== 'inventario' || inventoryTab !== 'loteos' || !token) return;
    if (inventoryLoteos.length > 0) return;
    fetchInventoryLoteos();
  }, [ownerSubView, inventoryTab]);

  // Debounced fetch for clientes
  React.useEffect(() => {
    if (ownerSubView !== 'clientes' || !token) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchProspectos(prospectosCategoryFilter, prospectosWithoutAdvisor, controller.signal);
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ownerSubView, prospectosCategoryFilter, prospectosWithoutAdvisor]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      // 1. Login
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const loginData = await loginRes.json();
      if (!loginRes.ok) throw new Error(loginData.detail || 'Error en login');

      const accessToken = loginData.access_token;
      setToken(accessToken);

      // 2. Fetch Me
      const meRes = await fetch(`${API_BASE}/auth/me`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
      });

      const meData = await meRes.json();
      if (!meRes.ok) throw new Error('Error al obtener perfil');

      setUser(meData);

      // 3. Redirect
      if (meData.role === 'super_admin' || meData.role === 'admin') {
        setView('super_admin');
      } else if (meData.role === 'lote_owner') {
        setView('lote_owner');
      } else {
        setStatus({ type: 'error', message: `Rol no reconocido: ${meData.role}` });
      }

    } catch (error) {
      setStatus({ type: 'error', message: error.message });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLots = async () => {
    setLoading(true);
    setAdminSubView('lotes');
    try {
      const res = await apiFetch(`${API_BASE}/lots?status=available&limit=50&offset=0`);
      const data = await res.json();
      if (!res.ok) throw new Error('Error al listar lotes');
      setLots(data.items);
      if (data.items.length > 0 && !selectedLot) {
        setSelectedLot(data.items[0]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLoteos = async () => {
    setLoading(true);
    setAdminSubView('loteos');
    try {
      const res = await apiFetch(`${API_BASE}/loteos?include_lotes=false&limit=50&offset=0`);
      const data = await res.json();
      if (!res.ok) throw new Error('Error al listar loteos');
      setLoteos(data.items);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchInventory = async (name, status, signal) => {
    setInventoryLoading(true);
    try {
      const params = new URLSearchParams({ limit: 50, offset: 0 });
      if (name) params.set('name', name);
      if (status) params.set('status', status);
      const res = await apiFetch(`${API_BASE}/lots?${params}`, { signal });
      const data = await res.json();
      if (!res.ok) throw new Error('Error al cargar inventario');
      setInventoryLots(data.items);
    } catch (error) {
      if (error.name !== 'AbortError') console.error(error);
    } finally {
      setInventoryLoading(false);
    }
  };

  const fetchInventoryLoteos = async () => {
    setInventoryLoteosLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/loteos?include_lotes=false&limit=50&offset=0`);
      const data = await res.json();
      if (!res.ok) throw new Error('Error al cargar loteos');
      setInventoryLoteos(data.items);
    } catch (error) {
      console.error(error);
    } finally {
      setInventoryLoteosLoading(false);
    }
  };

  const createLoteo = async (e) => {
    e.preventDefault();
    setCreateLoteoLoading(true);
    setCreateLoteoError(null);
    try {
      const res = await apiFetch(`${API_BASE}/loteos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: createLoteoForm.name,
          slug: createLoteoForm.slug,
          image_url: createLoteoForm.image_url,
          text_annotations: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al crear loteo');
      setCreateLoteoOpen(false);
      setCreateLoteoForm({ name: '', slug: '', image_url: '' });
      setInventoryLoteos([]);
      fetchInventoryLoteos();
    } catch (error) {
      setCreateLoteoError(error.message);
    } finally {
      setCreateLoteoLoading(false);
    }
  };

  const openEditor = (loteoId) => {
    const dataUrl = `${API_BASE}/loteos/${loteoId}/visor_data`;
    window.open(`${EDITOR_URL}/?data=${encodeURIComponent(dataUrl)}&token=${encodeURIComponent(token)}`, '_blank');
  };

  const fetchProspectos = async (category, withoutAdvisor, signal) => {
    setProspectosLoading(true);
    try {
      const params = new URLSearchParams({ limit: 50, offset: 0 });
      if (category) params.set('category', category);
      if (withoutAdvisor) params.set('without_advisor', 'true');
      const res = await apiFetch(`${API_BASE}/prospects?${params}`, { signal });
      const data = await res.json();
      if (!res.ok) throw new Error('Error al cargar prospectos');
      setProspectosList(data.items);
    } catch (error) {
      if (error.name !== 'AbortError') console.error(error);
    } finally {
      setProspectosLoading(false);
    }
  };

  const logout = () => {
    setView('login');
    setToken(null);
    setUser(null);
    setLots(null);
    setLoteos(null);
    setSelectedLot(null);
    setStatus(null);
    setAdminSubView('lotes');
    setInventoryLots([]);
    setInventorySearch('');
    setInventoryStatusFilter('');
    setInventoryTab('lotes');
    setInventoryLoteos([]);
    setProspectosList([]);
    setProspectosCategoryFilter('');
    setProspectosWithoutAdvisor(false);
  };

  const apiFetch = async (url, opts = {}) => {
    const res = await fetch(url, {
      ...opts,
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...opts.headers,
      },
    });
    if (res.status === 401) {
      logout();
      throw new Error('Sesión expirada. Inicia sesión nuevamente.');
    }
    return res;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (view === 'login') {
    return (
      <div className="login-container">
        <LoginBackground />
        <div className="login-card">
          <div className="login-header">
            <h1>Notry</h1>
            <p>Ingresa para administrar tus lotes</p>
          </div>
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Correo Electrónico</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? <span className="loader"></span> : 'Iniciar Sesión'}
            </button>
          </form>
          {status && <div className={`status-message ${status.type}`}>{status.message}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={`dashboard-container ${view === 'lote_owner' ? 'with-sidebar' : ''}`}>
      {view !== 'lote_owner' && (
        <nav className="dashboard-nav">
          <div className="nav-brand">NOTRY / {view.replace('_', ' ').toUpperCase()}</div>
          <div className="nav-user">
            <span>{user?.full_name}</span>
            <button onClick={logout} className="outline-button">Salir</button>
          </div>
        </nav>
      )}

      {view === 'lote_owner' && (
        <Sidebar 
          user={user} 
          activeItem={ownerSubView} 
          onItemClick={setOwnerSubView} 
          onLogout={logout} 
        />
      )}

      <main className="dashboard-content">
        {view === 'super_admin' ? (
          <div className="admin-layout">
            <div className="side-panel">
              {adminSubView === 'lotes' ? (
                <div className="details-card">
                  <h3>Detalles del Lote</h3>
                  {selectedLot ? (
                    <div className="lot-details">
                      <div className="detail-row">
                        <label>ID</label>
                        <div className="id-cell">
                          <span>{selectedLot.id.substring(0, 12)}...</span>
                          <button onClick={() => copyToClipboard(selectedLot.id)} className="copy-btn-inline">
                            <Copy size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="detail-row">
                        <label>Nombre</label>
                        <p>{selectedLot.name}</p>
                      </div>
                      <div className="detail-row">
                        <label>Slug</label>
                        <p>{selectedLot.slug}</p>
                      </div>
                      <div className="detail-row">
                        <label>Estado</label>
                        <span className="badge">{selectedLot.status}</span>
                      </div>
                      <div className="detail-row">
                        <label>Área</label>
                        <p>{selectedLot.area_m2 ? `${selectedLot.area_m2} m²` : '-'}</p>
                      </div>
                      <div className="detail-row">
                        <label>Precio</label>
                        <p className="price-tag">{selectedLot.price ? `$${selectedLot.price}` : '-'}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="placeholder-text">Selecciona un lote para ver los detalles</p>
                  )}
                </div>
              ) : (
                <div className="loteos-view">
                  <h3>Gestión de Loteos</h3>
                  <div className="loteos-container">
                    {loteos?.map(loteo => (
                      <div key={loteo.id} className="loteo-item">
                        <div className="loteo-info">
                          <h4>{loteo.name}</h4>
                          <span>{loteo.id.substring(0, 8)}...</span>
                        </div>
                        <a 
                          href={`https://notry-visor.vercel.app/?data=${API_BASE}/loteos/${loteo.id}/visor_data`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="visor-link"
                        >
                          👁️ Visor
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="side-nav-footer">
                <button 
                  onClick={adminSubView === 'loteos' ? fetchLots : fetchLoteos} 
                  className="primary-button btn-fit gold"
                >
                  {adminSubView === 'loteos' ? 'Volver a Lotes' : 'Listar Loteos'}
                </button>
              </div>
            </div>

            <div className="list-panel">
              <header className="panel-header">
                <h2>{adminSubView === 'lotes' ? 'Todos los Lotes' : 'Loteos Disponibles'}</h2>
                {loading && <span className="loader small"></span>}
              </header>

              <div className="scroll-area">
                {adminSubView === 'lotes' ? (
                  <div className="selectable-list">
                    {lots?.map(lot => (
                      <div 
                        key={lot.id} 
                        className={`list-item ${selectedLot?.id === lot.id ? 'selected' : ''}`}
                        onClick={() => setSelectedLot(lot)}
                      >
                        <div className="item-main">
                          <span className="item-name">{lot.name}</span>
                          <span className="item-slug">{lot.slug}</span>
                        </div>
                        <span className="badge">{lot.status}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="info-text">Administra tus loteos desde el panel izquierdo.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="owner-layout">
            <div key={ownerSubView} className="view-content">
              <header className="owner-header">
                <h1 className="view-title">{ownerSubView.toUpperCase()}</h1>
                <h2>Bienvenido, {user?.full_name?.split(' ')[0]}</h2>
              </header>

              {ownerSubView === 'inicio' && (
                <>
                  <div className="stats-grid">
                    <StatCard label="Lotes Disponibles" value="124" color="#c5a059" />
                    <StatCard label="Nuevos Leads" value="48" color="#3b82f6" />
                    <StatCard label="Tasa de Conversión" value="12.5%" color="#10b981" />
                  </div>
                  <KanbanBoard token={token} onSessionExpired={logout} />
                </>
              )}

              {ownerSubView === 'inventario' && (
                <>
                  <div className="stats-grid">
                    <StatCard label="Lotes Disponibles" value="124" color="#c5a059" />
                    <StatCard label="Reservados" value="12" color="#f59e0b" />
                    <StatCard label="Vendidos este mes" value="8" color="#ef4444" />
                  </div>

                  <div className="inventory-section">
                    <div className="inventory-tab-bar">
                      <button
                        className={`inventory-tab-btn ${inventoryTab === 'lotes' ? 'active' : ''}`}
                        onClick={() => setInventoryTab('lotes')}
                      >
                        Lotes
                      </button>
                      <button
                        className={`inventory-tab-btn ${inventoryTab === 'loteos' ? 'active' : ''}`}
                        onClick={() => setInventoryTab('loteos')}
                      >
                        Loteos
                      </button>
                    </div>

                    {inventoryTab === 'loteos' ? (
                      <div className="inventory-table-wrapper">
                        {inventoryLoteosLoading ? (
                          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                            <span className="loader"></span>
                          </div>
                        ) : (
                          <table className="inventory-table">
                            <thead>
                              <tr>
                                <th>Nombre</th>
                                <th>ID</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {inventoryLoteos.length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="td-empty-row">No se encontraron loteos.</td>
                                </tr>
                              ) : (
                                inventoryLoteos.map(loteo => (
                                  <tr key={loteo.id}>
                                    <td className="td-name">{loteo.name}</td>
                                    <td className="td-muted">{loteo.id.substring(0, 8)}…</td>
                                    <td style={{ textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                      <button
                                        className="primary-button btn-fit"
                                        onClick={() => window.open(`${VISOR_URL}/?data=${encodeURIComponent(`${API_BASE}/loteos/${loteo.id}/visor_data`)}`, '_blank')}
                                      >
                                        Visor
                                      </button>
                                      <button
                                        className="primary-button btn-fit gold"
                                        onClick={() => openEditor(loteo.id)}
                                      >
                                        Editor
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                          <button
                            className="primary-button btn-fit gold"
                            onClick={() => { setCreateLoteoOpen(true); setCreateLoteoError(null); }}
                          >
                            + Nuevo Loteo
                          </button>
                        </div>
                      </div>
                    ) : (
                    <>
                    <div className="inventory-controls">
                      <div className="inventory-search">
                        <Search size={16} className="search-icon" />
                        <input
                          type="text"
                          placeholder="Buscar por nombre..."
                          className="search-input"
                          value={inventorySearch}
                          onChange={e => setInventorySearch(e.target.value)}
                        />
                      </div>
                      <div className="inventory-filters">
                        <SlidersHorizontal size={16} className="filter-icon" />
                        <select
                          className="filter-select"
                          value={inventoryStatusFilter}
                          onChange={e => setInventoryStatusFilter(e.target.value)}
                        >
                          <option value="">Estado: Todos</option>
                          <option value="available">Disponible</option>
                          <option value="reserved">Reservado</option>
                          <option value="sold">Vendido</option>
                        </select>
                        <select className="filter-select" disabled>
                          <option>Área: Todas</option>
                          <option>Menor a 200 m²</option>
                          <option>200 – 500 m²</option>
                          <option>Mayor a 500 m²</option>
                        </select>
                      </div>
                      {inventoryLoading && <span className="loader small"></span>}
                    </div>

                    <div className="inventory-table-wrapper">
                      <table className="inventory-table">
                        <thead>
                          <tr>
                            <th>Nombre</th>
                            <th>Área</th>
                            <th>Precio</th>
                            <th>Estado</th>
                            <th>Loteo</th>
                            <th>Prospectos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inventoryLots.length === 0 && !inventoryLoading ? (
                            <tr>
                              <td colSpan={6} className="td-empty-row">No se encontraron lotes.</td>
                            </tr>
                          ) : (
                            inventoryLots.map(lot => (
                              <tr key={lot.id}>
                                <td className="td-name">{lot.name}</td>
                                <td>{lot.area_m2 ? `${parseFloat(lot.area_m2).toLocaleString()} m²` : '—'}</td>
                                <td className="td-price">{lot.price ? `$${parseFloat(lot.price).toLocaleString()}` : '—'}</td>
                                <td>
                                  <span className={`badge status-${STATUS_DISPLAY[lot.status] ?? lot.status}`}>
                                    {STATUS_DISPLAY[lot.status] ?? lot.status}
                                  </span>
                                </td>
                                <td className="td-loteo">{lot.loteo_name}</td>
                                <td>
                                  {!lot.prospect_names?.length ? (
                                    <span className="td-empty">—</span>
                                  ) : (
                                    <div className="prospectos-list">
                                      {lot.prospect_names.map((p, i) => (
                                        <span key={i} className="prospecto-tag">{p}</span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    </>
                    )}
                  </div>
                </>
              )}

              {ownerSubView === 'clientes' && (
                <div className="inventory-section">
                  <div className="inventory-controls">
                    <div className="inventory-filters">
                      <SlidersHorizontal size={16} className="filter-icon" />
                      <select
                        className="filter-select"
                        value={prospectosCategoryFilter}
                        onChange={e => setProspectosCategoryFilter(e.target.value)}
                      >
                        <option value="">Categoría: Todas</option>
                        {Object.entries(CATEGORY_DISPLAY).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                      <label className="filter-toggle">
                        <input
                          type="checkbox"
                          checked={prospectosWithoutAdvisor}
                          onChange={e => setProspectosWithoutAdvisor(e.target.checked)}
                        />
                        Sin asesor
                      </label>
                    </div>
                    {prospectosLoading && <span className="loader small"></span>}
                  </div>

                  <div className="inventory-table-wrapper">
                    <table className="inventory-table">
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>Email</th>
                          <th>Teléfono</th>
                          <th>Categoría</th>
                          <th>Presupuesto</th>
                          <th>Último Contacto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prospectosList.length === 0 && !prospectosLoading ? (
                          <tr>
                            <td colSpan={6} className="td-empty-row">No se encontraron prospectos.</td>
                          </tr>
                        ) : (
                          prospectosList.map(p => (
                            <tr key={p.id}>
                              <td className="td-name">{p.name}</td>
                              <td className="td-muted">{p.email || '—'}</td>
                              <td className="td-muted">{p.phone || '—'}</td>
                              <td>
                                <span className={`badge category-${p.category}`}>
                                  {CATEGORY_DISPLAY[p.category] ?? p.category?.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="td-price">{p.budget ? `$${parseFloat(p.budget).toLocaleString()}` : '—'}</td>
                              <td className="td-muted">{formatDate(p.last_contact)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {ownerSubView === 'analisis' && (
                <AnalisisView token={token} onSessionExpired={logout} />
              )}

              {ownerSubView !== 'inventario' && ownerSubView !== 'clientes' && ownerSubView !== 'analisis' && ownerSubView !== 'inicio' && (
                <div className="owner-panel">
                  <p>Tu dashboard de {ownerSubView} está siendo preparado.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {createLoteoOpen && (
        <div className="modal-overlay" onClick={() => setCreateLoteoOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Nuevo Loteo</h3>
            <form onSubmit={createLoteo}>
              <div className="form-group">
                <label>Nombre</label>
                <input
                  type="text"
                  required
                  value={createLoteoForm.name}
                  onChange={e => setCreateLoteoForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Slug</label>
                <input
                  type="text"
                  required
                  value={createLoteoForm.slug}
                  onChange={e => setCreateLoteoForm(f => ({ ...f, slug: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>URL de Imagen</label>
                <input
                  type="text"
                  value={createLoteoForm.image_url}
                  onChange={e => setCreateLoteoForm(f => ({ ...f, image_url: e.target.value }))}
                />
              </div>
              {createLoteoError && <div className="status-message error">{createLoteoError}</div>}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" className="outline-button" onClick={() => setCreateLoteoOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button btn-fit gold" disabled={createLoteoLoading}>
                  {createLoteoLoading ? <span className="loader small"></span> : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
