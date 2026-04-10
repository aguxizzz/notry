import React, { useState } from 'react';
import { Copy, Search, SlidersHorizontal, Pencil, Trash2, Check, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import StatCard from './components/StatCard';
import LoginBackground from './components/LoginBackground';
import KanbanBoard from './components/KanbanBoard';
import AnalisisView from './components/AnalisisView';
import CategoryPieChart from './components/CategoryPieChart';
import BudgetPieChart from './components/BudgetPieChart';
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
  const [inventoryEditingId, setInventoryEditingId] = useState(null);
  const [inventoryEditForm, setInventoryEditForm] = useState({ status: '', price: '', area_m2: '' });
  const [prospectosList, setProspectosList] = useState([]);
  const [prospectosLoading, setProspectosLoading] = useState(false);
  const [prospectosCategoryFilter, setProspectosCategoryFilter] = useState('');
  const [prospectosWithoutAdvisor, setProspectosWithoutAdvisor] = useState(false);
  const [createLoteoOpen, setCreateLoteoOpen] = useState(false);
  const [createLoteoForm, setCreateLoteoForm] = useState({ name: '', slug: '', image_url: '' });
  const [createLoteoLoading, setCreateLoteoLoading] = useState(false);
  const [createLoteoError, setCreateLoteoError] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, lot: null, loading: false });
  const [toasts, setToasts] = useState([]);
  const [bgLoadingLots, setBgLoadingLots] = useState(false);
  const [bgLoadingLoteos, setBgLoadingLoteos] = useState(false);
  const [bgLoadingProspectos, setBgLoadingProspectos] = useState(false);
  const [clicksCache, setClicksCache] = useState({}); // { loteoId: clicksData }
  const [visorDataCache, setVisorDataCache] = useState({}); // { loteoId: visorData }
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const addToast = (message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Auto-fetch lots when entering super_admin view
  React.useEffect(() => {
    if (view === 'super_admin' && !lots) {
      fetchLots();
    }
  }, [view]);

  // Background polling for lote_owner
  React.useEffect(() => {
    if (!token || view !== 'lote_owner') return;

    // Initial prefetch if not already loaded
    if (inventoryLots.length === 0) {
      fetchInventoryBg('', '');
    }
    if (inventoryLoteos.length === 0) {
      fetchInventoryLoteosBg();
    }
    if (prospectosList.length === 0) {
      fetchProspectosBg('', false);
    }
    if (inventoryLoteos.length > 0 && Object.keys(clicksCache).length === 0) {
      fetchClicksForAllLoteos(inventoryLoteos);
    }
    if (inventoryLoteos.length > 0 && Object.keys(visorDataCache).length === 0) {
      fetchVisorDataForAllLoteos(inventoryLoteos);
    }

    // Set up polling intervals
    const lotsInterval = setInterval(() => {
      fetchInventoryBg(inventorySearch, inventoryStatusFilter);
    }, 15000); // 15s

    const loteosInterval = setInterval(() => {
      fetchInventoryLoteosBg();
    }, 30000); // 30s

    const prospectosInterval = setInterval(() => {
      fetchProspectosBg(prospectosCategoryFilter, prospectosWithoutAdvisor);
    }, 30000); // 30s

    const clicksInterval = setInterval(() => {
      if (inventoryLoteos.length > 0) {
        fetchClicksForAllLoteos(inventoryLoteos);
      }
    }, 30000); // 30s

    const visorDataInterval = setInterval(() => {
      if (inventoryLoteos.length > 0) {
        fetchVisorDataForAllLoteos(inventoryLoteos);
      }
    }, 300000); // 5 minutes

    return () => {
      clearInterval(lotsInterval);
      clearInterval(loteosInterval);
      clearInterval(prospectosInterval);
      clearInterval(clicksInterval);
      clearInterval(visorDataInterval);
    };
  }, [token, view, inventoryLoteos]);

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
        // Prefetch lots for super_admin
        setTimeout(() => {
          fetchLots();
        }, 0);
      } else if (meData.role === 'lote_owner') {
        setView('lote_owner');
        // Prefetch data for lote_owner (polling will start via useEffect)
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

    // Refresh data when user returns from editor
    const onFocus = () => {
      fetchInventoryLoteosBg();
      fetchInventoryBg(inventorySearch, inventoryStatusFilter);
      document.removeEventListener('visibilitychange', onFocus);
    };
    document.addEventListener('visibilitychange', onFocus);
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

  // Background fetch functions (for polling)
  const fetchInventoryBg = async (name, status) => {
    setBgLoadingLots(true);
    try {
      const params = new URLSearchParams({ limit: 50, offset: 0 });
      if (name) params.set('name', name);
      if (status) params.set('status', status);
      const res = await apiFetch(`${API_BASE}/lots?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error('Error al cargar inventario');
      setInventoryLots(data.items);
    } catch (error) {
      addToast(`Error actualizando lotes: ${error.message}`);
    } finally {
      setBgLoadingLots(false);
    }
  };

  const fetchInventoryLoteosBg = async () => {
    setBgLoadingLoteos(true);
    try {
      const res = await apiFetch(`${API_BASE}/loteos?include_lotes=false&limit=50&offset=0`);
      const data = await res.json();
      if (!res.ok) throw new Error('Error al cargar loteos');
      setInventoryLoteos(data.items);
    } catch (error) {
      addToast(`Error actualizando loteos: ${error.message}`);
    } finally {
      setBgLoadingLoteos(false);
    }
  };

  const fetchProspectosBg = async (category, withoutAdvisor) => {
    setBgLoadingProspectos(true);
    try {
      const params = new URLSearchParams({ limit: 50, offset: 0 });
      if (category) params.set('category', category);
      if (withoutAdvisor) params.set('without_advisor', 'true');
      const res = await apiFetch(`${API_BASE}/prospects?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error('Error al cargar prospectos');
      setProspectosList(data.items);
    } catch (error) {
      addToast(`Error actualizando prospectos: ${error.message}`);
    } finally {
      setBgLoadingProspectos(false);
    }
  };

  const startInventoryEdit = (lot) => {
    setInventoryEditingId(lot.id);
    setInventoryEditForm({
      status: lot.status || 'available',
      price: lot.price != null ? String(lot.price) : '',
      area_m2: lot.area_m2 != null ? String(lot.area_m2) : '',
    });
  };

  const cancelInventoryEdit = () => {
    setInventoryEditingId(null);
    setInventoryEditForm({ status: '', price: '', area_m2: '' });
  };

  const saveInventoryEdit = async (lot) => {
    const body = {};
    body.status = inventoryEditForm.status;
    if (inventoryEditForm.price !== '') body.price = parseFloat(inventoryEditForm.price);
    else body.price = null;
    if (inventoryEditForm.area_m2 !== '') body.area_m2 = parseFloat(inventoryEditForm.area_m2);
    else body.area_m2 = null;

    // Optimistic update
    setInventoryLots(prev => prev.map(l =>
      l.id === lot.id ? { ...l, status: body.status, price: body.price, area_m2: body.area_m2 } : l
    ));
    setInventoryEditingId(null);
    setInventoryEditForm({ status: '', price: '', area_m2: '' });

    try {
      const res = await apiFetch(`${API_BASE}/lots/${lot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Error al actualizar lote');
      }
      // success — background refresh will pick up any server-side changes
      fetchInventoryBg(inventorySearch, inventoryStatusFilter);
    } catch (err) {
      addToast(`Error: ${err.message}`);
      // revert optimistic update
      fetchInventoryBg(inventorySearch, inventoryStatusFilter);
    }
  };

  const openDeleteConfirm = (lot) => {
    setConfirmDialog({ open: true, lot, loading: false });
  };

  const handleDeleteConfirm = async () => {
    const lot = confirmDialog.lot;
    if (!lot) return;
    setConfirmDialog(prev => ({ ...prev, loading: true }));
    try {
      const res = await apiFetch(`${API_BASE}/lots/${lot.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Error al eliminar lote');
      }
      addToast(`Lote "${lot.name}" eliminado.`);
      fetchInventoryBg(inventorySearch, inventoryStatusFilter);
      setConfirmDialog({ open: false, lot: null, loading: false });
    } catch (err) {
      addToast(`Error: ${err.message}`);
      setConfirmDialog(prev => ({ ...prev, loading: false }));
    }
  };

  const fetchClicksForAllLoteos = async (loteos) => {
    if (!loteos || loteos.length === 0) return;
    try {
      const newCache = { ...clicksCache };
      for (const loteo of loteos) {
        try {
          const res = await apiFetch(`${API_BASE}/loteos/${loteo.id}/clicks`);
          const data = await res.json();
          if (res.ok) {
            newCache[loteo.id] = [...data].sort((a, b) => b.clicks - a.clicks);
          }
        } catch {
          // Skip individual loteo errors, continue with others
        }
      }
      setClicksCache(newCache);
    } catch (error) {
      addToast(`Error actualizando clicks: ${error.message}`);
    }
  };

  const fetchVisorDataForAllLoteos = async (loteos) => {
    if (!loteos || loteos.length === 0) return;
    try {
      const newCache = { ...visorDataCache };
      for (const loteo of loteos) {
        try {
          const res = await fetch(`${API_BASE}/loteos/${loteo.id}/visor_data`, {
            headers: {
              accept: 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });
          const data = await res.json();
          if (res.ok) {
            newCache[loteo.id] = data;
          }
        } catch {
          // Skip individual loteo errors, continue with others
        }
      }
      setVisorDataCache(newCache);
    } catch (error) {
      addToast(`Error actualizando datos de blueprint: ${error.message}`);
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
    setToasts([]);
    setBgLoadingLots(false);
    setBgLoadingLoteos(false);
    setBgLoadingProspectos(false);
    setClicksCache({});
    setVisorDataCache({});
    setInventoryEditingId(null);
    setInventoryEditForm({ status: '', price: '', area_m2: '' });
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
              <label htmlFor="login-email">Correo Electrónico</label>
              <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="login-password">Contraseña</label>
              <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
        <>
          <div
            className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
            onClick={() => setSidebarOpen(false)}
          />
          <Sidebar
            user={user}
            activeItem={ownerSubView}
            onItemClick={(id) => { setOwnerSubView(id); setSidebarOpen(false); }}
            onLogout={logout}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(v => !v)}
          />
        </>
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
                    <div className="inventory-controls">
                      <div className="inventory-tab-controls">
                        <SlidersHorizontal size={16} className="filter-icon" />
                        <span className="inventory-tab-label">Ver tabla de:</span>
                        <select
                          className="inventory-tab-select"
                          value={inventoryTab}
                          onChange={e => { setInventoryTab(e.target.value); cancelInventoryEdit(); }}
                        >
                          <option value="lotes">Lotes</option>
                          <option value="loteos">Loteos</option>
                        </select>
                      </div>

                      {inventoryTab === 'lotes' ? (
                        <>
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
                          {(inventoryLoading || bgLoadingLots) && <span className="loader small" title={bgLoadingLots ? "Actualizando..." : ""}></span>}
                        </>
                      ) : (
                        <>
                          <div className="inventory-search" />
                          <div className="inventory-filters">
                            <select className="filter-select" disabled>
                              <option>Estado: Todos</option>
                            </select>
                            <select className="filter-select" disabled>
                              <option>Área: Todas</option>
                            </select>
                          </div>
                          {bgLoadingLoteos && <span className="loader small" title="Actualizando..."></span>}
                        </>
                      )}
                    </div>

                    {inventoryTab === 'lotes' ? (
                      <div key="lotes" className="inventory-table-wrapper fade-in">
                        <table className="inventory-table">
                          <thead>
                            <tr>
                              <th>Nombre</th>
                              <th>Área</th>
                              <th>Precio</th>
                              <th>Estado</th>
                              <th>Loteo</th>
                              <th>Prospectos</th>
                              <th>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inventoryLots.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="td-empty-row">No se encontraron lotes.</td>
                              </tr>
                            ) : (
                              inventoryLots.map(lot => (
                                <tr key={lot.id}>
                                  <td className="td-name">{lot.name}</td>
                                  <td>
                                    {inventoryEditingId === lot.id ? (
                                      <input
                                        className="edit-input"
                                        type="number"
                                        value={inventoryEditForm.area_m2}
                                        onChange={e => setInventoryEditForm(f => ({ ...f, area_m2: e.target.value }))}
                                        placeholder="m²"
                                      />
                                    ) : (
                                      lot.area_m2 ? `${parseFloat(lot.area_m2).toLocaleString()} m²` : '—'
                                    )}
                                  </td>
                                  <td>
                                    {inventoryEditingId === lot.id ? (
                                      <input
                                        className="edit-input"
                                        type="number"
                                        value={inventoryEditForm.price}
                                        onChange={e => setInventoryEditForm(f => ({ ...f, price: e.target.value }))}
                                        placeholder="Precio"
                                      />
                                    ) : (
                                      lot.price ? `$${parseFloat(lot.price).toLocaleString()}` : '—'
                                    )}
                                  </td>
                                  <td>
                                    {inventoryEditingId === lot.id ? (
                                      <select
                                        className="edit-select"
                                        value={inventoryEditForm.status}
                                        onChange={e => setInventoryEditForm(f => ({ ...f, status: e.target.value }))}
                                      >
                                        <option value="available">Disponible</option>
                                        <option value="reserved">Reservado</option>
                                        <option value="sold">Vendido</option>
                                      </select>
                                    ) : (
                                      <span className={`badge status-${STATUS_DISPLAY[lot.status] ?? lot.status}`}>
                                        {STATUS_DISPLAY[lot.status] ?? lot.status}
                                      </span>
                                    )}
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
                                  <td className="td-actions">
                                    {inventoryEditingId === lot.id ? (
                                      <>
                                        <button
                                          className="action-btn save"
                                          onClick={() => saveInventoryEdit(lot)}
                                          title="Guardar"
                                        >
                                          <Check size={15} />
                                        </button>
                                        <button
                                          className="action-btn cancel"
                                          onClick={cancelInventoryEdit}
                                          title="Cancelar"
                                        >
                                          <X size={15} />
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          className="action-btn edit"
                                          onClick={() => startInventoryEdit(lot)}
                                          title="Editar"
                                        >
                                          <Pencil size={15} />
                                        </button>
                                        <button
                                          className="action-btn delete"
                                          onClick={() => openDeleteConfirm(lot)}
                                          title="Eliminar"
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                      </>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div key="loteos" className="inventory-table-wrapper fade-in">
                        {inventoryLoteosLoading && inventoryLoteos.length === 0 ? (
                          <div className="table-cell-center">
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
                                    <td className="table-cell-right">
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
                        <div className="table-footer">
                          <button
                            className="primary-button btn-fit gold"
                            onClick={() => { setCreateLoteoOpen(true); setCreateLoteoError(null); }}
                          >
                            + Nuevo Loteo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {ownerSubView === 'clientes' && (
                <>
                <div className="charts-row">
                  <CategoryPieChart prospects={prospectosList} />
                  <BudgetPieChart prospects={prospectosList} />
                </div>
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
                      <label className="filter-toggle" htmlFor="filter-no-advisor">
                        <input
                          id="filter-no-advisor"
                          type="checkbox"
                          checked={prospectosWithoutAdvisor}
                          onChange={e => setProspectosWithoutAdvisor(e.target.checked)}
                        />
                        Sin asesor
                      </label>
                    </div>
                    {(prospectosLoading || bgLoadingProspectos) && <span className="loader small" title={bgLoadingProspectos ? "Actualizando..." : ""}></span>}
                  </div>

                  <div className="inventory-table-wrapper">
                    <table className="inventory-table">
                      <caption className="sr-only">Lista de prospectos</caption>
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
                        {prospectosList.length === 0 ? (
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
                </>
              )}

              {ownerSubView === 'analisis' && (
                <AnalisisView token={token} onSessionExpired={logout} prefetchedLoteos={inventoryLoteos} cachedClicks={clicksCache} cachedVisorData={visorDataCache} />
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
              <div className="modal-footer">
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

      {confirmDialog.open && (
        <div className="modal-overlay" onClick={() => !confirmDialog.loading && setConfirmDialog({ open: false, lot: null, loading: false })}>
          <div className="modal-card delete-confirm" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 className="confirm-title">¿Eliminar lote?</h3>
            <p className="confirm-message">
              Estás a punto de eliminar <strong>"{confirmDialog.lot?.name}"</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="primary-button btn-fit outline"
                onClick={() => setConfirmDialog({ open: false, lot: null, loading: false })}
                disabled={confirmDialog.loading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button btn-fit danger"
                onClick={handleDeleteConfirm}
                disabled={confirmDialog.loading}
              >
                {confirmDialog.loading ? <span className="loader small"></span> : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toasts-container">
        {toasts.map(toast => (
          <div key={toast.id} className="toast" onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
