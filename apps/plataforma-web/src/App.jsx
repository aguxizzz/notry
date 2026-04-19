import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Copy, Search, SlidersHorizontal, Pencil, Trash2, Check, X, AlertCircle, Menu, Eye } from 'lucide-react';
import Sidebar from './components/Sidebar';
import StatCard from './components/StatCard';
import LoginBackground from './components/LoginBackground';
import KanbanBoard from './components/KanbanBoard';
import AnalisisView from './components/AnalisisView';
import CategoryPieChart from './components/CategoryPieChart';
import BudgetPieChart from './components/BudgetPieChart';
import ConfirmDialog from './components/ConfirmDialog';
import DeleteProspectDialog from './components/DeleteProspectDialog';
import CreateLoteoModal from './components/modals/CreateLoteoModal';
import EditLoteoModal from './components/modals/EditLoteoModal';
import AddProspectModal from './components/modals/AddProspectModal';
import { Badge, Button, ErrorBoundary, Loader, Select, EditEntityModal } from './ui/components';
import { API_BASE, EDITOR_URL, VISOR_URL } from './config';
import { useSync } from './hooks/useSync';
import { useAuth } from './hooks/useAuth';
import { useInventory } from './hooks/useInventory';
import { useProspects } from './hooks/useProspects';
import { PAGE_SIZE, STATUS_DISPLAY, CATEGORY_DISPLAY, formatDate, isValidHttpsUrl, getProspectFields, getLotFields } from './constants';
import { createApiFetch } from './api';
import { fetchLots as fetchLotsService, fetchInventory as fetchInventoryService, fetchInventoryBg as fetchInventoryBgService, patchLot, deleteLot } from './api/lots';
import { fetchLoteos as fetchLoteosService, fetchInventoryLoteos as fetchInventoryLoteosService, fetchInventoryLoteosBg as fetchInventoryLoteosBgService, createLoteo as createLoteoService, saveEditLoteo as saveEditLoteoService } from './api/loteos';
import { createProspect as createProspectService, fetchAdvisors as fetchAdvisorsService, saveEditProspect as saveEditProspectService, updateLastContact as updateLastContactService, handleDeleteProspectConfirm as handleDeleteProspectConfirmService, fetchProspectos as fetchProspectosService, loadMoreProspectos as loadMoreProspectosService } from './api/prospects';
import { fetchReportsBg as fetchReportsBgService, buildAnalisisCallbacks } from './api/reports';
import './App.css';

function App() {
  const [view, setView] = useState('login'); // 'login' | 'lote_owner' | 'super_admin'
  const [adminSubView, setAdminSubView] = useState('lotes'); // 'lotes' | 'loteos'
  const [ownerSubView, setOwnerSubView] = useState('inicio');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { token, user, handleLogin: authLogin, logout: authLogout } = useAuth();
  const [lots, setLots] = useState(null);
  const [loteos, setLoteos] = useState(null);
  const [selectedLot, setSelectedLot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [inventoryLots, setInventoryLots] = useState([]);
  const {
    inventoryLoading, setInventoryLoading,
    inventoryLoteosLoading, setInventoryLoteosLoading,
    inventoryLoteos, setInventoryLoteos,
    inventorySearch, setInventorySearch,
    inventoryStatusFilter, setInventoryStatusFilter,
    inventoryTab, setInventoryTab,
    inventoryLotsHasMore, setInventoryLotsHasMore,
    inventoryLotsLoadingMore, setInventoryLotsLoadingMore,
  } = useInventory();

  const {
    prospectosLoading, setProspectosLoading,
    prospectosCategoryFilter, setProspectosCategoryFilter,
    prospectosWithoutAdvisor, setProspectosWithoutAdvisor,
    prospectosHasMore, setProspectosHasMore,
    prospectosLoadingMore, setProspectosLoadingMore,
    advisorsList, setAdvisorsList,
    advisorsLoading, setAdvisorsLoading,
  } = useProspects();

  const [editLotModalOpen, setEditLotModalOpen] = useState(false);
  const [editingLotId, setEditingLotId] = useState(null);
  const [editLotForm, setEditLotForm] = useState({ status: '', price: '', area_m2: '' });
  const [editLotLoading, setEditLotLoading] = useState(false);
  const [editLotError, setEditLotError] = useState(null);
  const [editLotClosing, setEditLotClosing] = useState(false);
  const [editProspectClosing, setEditProspectClosing] = useState(false);
  const [prospectosList, setProspectosList] = useState([]);
  const [allProspectosList, setAllProspectosList] = useState([]);
  const [createLoteoOpen, setCreateLoteoOpen] = useState(false);
  const [createLoteoForm, setCreateLoteoForm] = useState({ name: '', slug: '', image_url: '', blueprint_url: '' });
  const [createLoteoLoading, setCreateLoteoLoading] = useState(false);
  const [createLoteoError, setCreateLoteoError] = useState(null);
  const [editLoteoOpen, setEditLoteoOpen] = useState(false);
  const [editLoteoClosing, setEditLoteoClosing] = useState(false);
  const [editingLoteoId, setEditingLoteoId] = useState(null);
  const [editLoteoForm, setEditLoteoForm] = useState({ name: '', slug: '', image_url: '', blueprint_url: '' });
  const [editLoteoLoading, setEditLoteoLoading] = useState(false);
  const [editLoteoError, setEditLoteoError] = useState(null);
  const [addProspectOpen, setAddProspectOpen] = useState(false);
  const [addProspectForm, setAddProspectForm] = useState({
    name: '', email: '', phone: '', category: 'primer_contacto', budget: '', payment_method: 'contado',
  });
  const [addProspectLoading, setAddProspectLoading] = useState(false);
  const [addProspectError, setAddProspectError] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, lot: null, loading: false });
  const [editProspectModalOpen, setEditProspectModalOpen] = useState(false);
  const [editingProspectId, setEditingProspectId] = useState(null);
  const [editProspectForm, setEditProspectForm] = useState({
    name: '', email: '', phone: '', category: '', budget: '', payment_method: '', advisor_id: '',
  });
  const [editProspectLoading, setEditProspectLoading] = useState(false);
  const [updatingContact, setUpdatingContact] = useState(false);
  const [editProspectError, setEditProspectError] = useState(null);
  const [deleteProspectDialog, setDeleteProspectDialog] = useState({ open: false, prospect: null, loading: false });
  const [toasts, setToasts] = useState([]);
  const [clicksCache, setClicksCache] = useState({}); // { loteoId: clicksData }
  const [visorDataCache, setVisorDataCache] = useState({}); // { loteoId: visorData }
  const [reportsCache, setReportsCache] = useState({}); // { lastDays: { prospectos, ventas, lotesVendidos } }
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [analisisLastDays, setAnalisisLastDays] = useState(30);

  const filtersRef = React.useRef({
    inventorySearch,
    inventoryStatusFilter,
    prospectosCategoryFilter,
    prospectosWithoutAdvisor,
    inventoryLoteos,
    inventoryLotsCount: 0,
    prospectosCount: 0,
  });

  // ── Combined sync hook (replaces 8 separate polling intervals) ──────────────
  // Focus management refs for modals
  const createLoteoButtonRef = useRef(null);
  const previousCreateLoteoFocusRef = useRef(null);
  const addProspectButtonRef = useRef(null);
  const previousAddProspectFocusRef = useRef(null);
  const createLoteoModalRef = useRef(null);
  const editLoteoModalRef = useRef(null);
  const addProspectModalRef = useRef(null);

  // Helper function to store focus and open modal
  const openCreateLoteoModal = () => {
    previousCreateLoteoFocusRef.current = document.activeElement;
    setCreateLoteoOpen(true);
    setCreateLoteoError(null);
  };

  const openEditLoteoModal = (loteo) => {
    previousCreateLoteoFocusRef.current = document.activeElement;
    setEditingLoteoId(loteo.id);
    setEditLoteoForm({
      name: loteo.name || '',
      slug: loteo.slug || '',
      image_url: loteo.image_url || '',
      blueprint_url: loteo.blueprint_url || '',
    });
    setEditLoteoOpen(true);
    setEditLoteoError(null);
  };

  const closeEditLoteoModal = () => {
    setEditLoteoClosing(true);
    setTimeout(() => {
      setEditLoteoOpen(false);
      setEditLoteoClosing(false);
    }, 200);
  };

  const openAddProspectModal = () => {
    previousAddProspectFocusRef.current = document.activeElement;
    setAddProspectOpen(true);
    setAddProspectError(null);
  };

  const openDeleteProspectModalForFocus = (prospect) => {
    setDeleteProspectDialog({ open: true, prospect, loading: false });
  };

  React.useEffect(() => {
    filtersRef.current = {
      inventorySearch,
      inventoryStatusFilter,
      prospectosCategoryFilter,
      prospectosWithoutAdvisor,
      inventoryLoteos,
      inventoryLotsCount: inventoryLots.length,
      prospectosCount: prospectosList.length,
    };
  }, [inventorySearch, inventoryStatusFilter, prospectosCategoryFilter, prospectosWithoutAdvisor, inventoryLoteos, inventoryLots.length, prospectosList.length]);

  // Focus management for createLoteo modal
  useEffect(() => {
    if (createLoteoOpen && createLoteoModalRef.current) {
      const focusableElements = createLoteoModalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    } else if (!createLoteoOpen && previousCreateLoteoFocusRef.current) {
      previousCreateLoteoFocusRef.current.focus();
    }
  }, [createLoteoOpen]);

  // Focus management for editLoteo modal
  useEffect(() => {
    if (editLoteoOpen && editLoteoModalRef.current) {
      const focusableElements = editLoteoModalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    } else if (!editLoteoOpen && previousCreateLoteoFocusRef.current) {
      previousCreateLoteoFocusRef.current.focus();
    }
  }, [editLoteoOpen]);

  // Focus management for addProspect modal
  useEffect(() => {
    if (addProspectOpen && addProspectModalRef.current) {
      const focusableElements = addProspectModalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    } else if (!addProspectOpen && previousAddProspectFocusRef.current) {
      previousAddProspectFocusRef.current.focus();
    }
  }, [addProspectOpen]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    if (type === 'success') {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
    }
  }, []);

  // Auto-fetch lots when entering super_admin view
  React.useEffect(() => {
    if (view === 'super_admin' && !lots) {
      fetchLots();
    }
  }, [view]);

  // Note: All background polling is now handled by the useSync hook above.
  // It fires immediately on login and every 60 seconds thereafter.

  // Reset filters when leaving the inventario view.
  // Filtering is derived client-side from inventoryLots via useMemo — no API call needed.
  React.useEffect(() => {
    if (ownerSubView === 'inventario') return;
    setInventorySearch('');
    setInventoryStatusFilter('');
  }, [ownerSubView]);

  // Fetch loteos for inventory editor tab (lazy, only once)
  React.useEffect(() => {
    if (ownerSubView !== 'inventario' || inventoryTab !== 'loteos' || !token) return;
    if (inventoryLoteos.length > 0) return;
    fetchInventoryLoteos();
  }, [ownerSubView, inventoryTab]);

  // Reset prospectos filters and pagination when leaving the clientes view.
  React.useEffect(() => {
    if (ownerSubView === 'clientes') return;
    setProspectosCategoryFilter('');
    setProspectosWithoutAdvisor(false);
    setProspectosList(allProspectosList);
    setProspectosHasMore(false);
  }, [ownerSubView]);

  // When filters change while on clientes view, reset pagination to stay in sync.
  // loadMoreProspectos accumulates into prospectosList; resetting it here ensures
  // load-more offset stays consistent with allProspectosList.
  React.useEffect(() => {
    if (ownerSubView !== 'clientes') return;
    setProspectosList(allProspectosList);
    setProspectosHasMore(false);
  }, [ownerSubView, prospectosCategoryFilter, prospectosWithoutAdvisor, allProspectosList]);

  // ── Client-side filtered data (derived from useSync cache, no extra API calls) ──
  const filteredInventoryLots = useMemo(() => {
    if (!inventorySearch && !inventoryStatusFilter) return null;
    const q = inventorySearch.toLowerCase();
    return inventoryLots.filter(lot => {
      const matchSearch = !q || lot.name?.toLowerCase().includes(q);
      const matchStatus = !inventoryStatusFilter || lot.status === inventoryStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [inventoryLots, inventorySearch, inventoryStatusFilter]);

  const filteredProspectos = useMemo(() => {
    if (!prospectosCategoryFilter && !prospectosWithoutAdvisor) return null;
    return allProspectosList.filter(p => {
      const matchCat = !prospectosCategoryFilter || p.category === prospectosCategoryFilter;
      const matchAdv = !prospectosWithoutAdvisor || !p.advisor_id;
      return matchCat && matchAdv;
    });
  }, [allProspectosList, prospectosCategoryFilter, prospectosWithoutAdvisor]);

  const handleLogin = async (e) => {
    e.preventDefault();
    await authLogin(email, password, { setLoading, setStatus, setView, fetchLots });
  };

  const fetchLots = async () => {
    fetchLotsService({ apiFetch, setLoading, setLots, setSelectedLot, setAdminSubView });
  };

  const fetchLoteos = async () => {
    fetchLoteosService({ apiFetch, setLoading, setLoteos, setAdminSubView, addToast });
  };

  const fetchInventory = async (name, status, signal) => {
    fetchInventoryService({ apiFetch, setInventoryLoading, setInventoryLots, setInventoryLotsHasMore, PAGE_SIZE, name, status, signal });
  };

  const fetchInventoryLoteos = async () => {
    fetchInventoryLoteosService({ apiFetch, setInventoryLoteosLoading, setInventoryLoteos });
  };

  const createLoteo = async (e) => {
    e.preventDefault();
    await createLoteoService({ apiFetch, createLoteoForm, isValidHttpsUrl, setCreateLoteoLoading, setCreateLoteoError, setCreateLoteoOpen, setCreateLoteoForm, fetchInventoryLoteos });
  };

  const saveEditLoteo = async (e) => {
    e.preventDefault();
    await saveEditLoteoService({ apiFetch, editingLoteoId, editLoteoForm, isValidHttpsUrl, addToast, setEditLoteoLoading, setEditLoteoError, setEditLoteoClosing, setEditLoteoOpen, setEditingLoteoId, setInventoryLoteos, fetchInventoryLoteos });
  };

  const createProspect = async (e) => {
    e.preventDefault();
    await createProspectService({ apiFetch, addProspectForm, setAddProspectLoading, setAddProspectError, setAddProspectOpen, setAddProspectForm, refreshSync });
  };

  const fetchAdvisors = async () => {
    fetchAdvisorsService({ apiFetch, setAdvisorsLoading, setAdvisorsList });
  };

  const openEditProspect = (prospect) => {
    setEditProspectForm({
      name: prospect.name || '',
      email: prospect.email || '',
      phone: prospect.phone || '',
      category: prospect.category || 'primer_contacto',
      budget: prospect.budget != null ? String(prospect.budget) : '',
      payment_method: prospect.payment_method || 'contado',
      advisor_id: prospect.advisor_id || '',
    });
    setEditProspectError(null);
    setEditingProspectId(prospect.id);
    setEditProspectModalOpen(true);
    fetchAdvisors();
  };

  const saveEditProspect = async (e) => {
    e.preventDefault();
    await saveEditProspectService({ apiFetch, editingProspectId, editProspectForm, addToast, setEditProspectLoading, setEditProspectError, setEditProspectClosing, setEditProspectModalOpen, setEditingProspectId, refreshSync });
  };

  const closeEditProspectModal = () => {
    setEditProspectClosing(true);
    setTimeout(() => {
      setEditProspectModalOpen(false);
      setEditProspectClosing(false);
      setEditingProspectId(null);
    }, 200);
  };

  const updateLastContact = async (prospectId) => {
    await updateLastContactService({ apiFetch, setUpdatingContact, addToast, refreshSync, prospectId });
  };

  const openDeleteProspectDialog = (prospect) => {
    setDeleteProspectDialog({ open: true, prospect, loading: false });
  };

  const handleDeleteProspectConfirm = async () => {
    await handleDeleteProspectConfirmService({ apiFetch, deleteProspectDialog, addToast, setDeleteProspectDialog, refreshSync });
  };

  const openEditor = (loteoId) => {
    const dataUrl = `${API_BASE}/loteos/${loteoId}/visor_data`;
    window.open(`${EDITOR_URL}/?data=${encodeURIComponent(dataUrl)}&token=${encodeURIComponent(token)}`, '_blank');

    // Refresh data when user returns from editor.
    // Reads current filter values at event time via filtersRef to avoid stale closure.
    const onFocus = () => {
      fetchInventoryLoteosBg();
      fetchInventoryBg({ apiFetch, setInventoryLots, setInventoryLotsHasMore, PAGE_SIZE, name: filtersRef.current.inventorySearch, status: filtersRef.current.inventoryStatusFilter, addToast });
      document.removeEventListener('visibilitychange', onFocus);
    };
    document.addEventListener('visibilitychange', onFocus);
  };

  const fetchProspectos = async (category, withoutAdvisor, signal) => {
    fetchProspectosService({ apiFetch, setProspectosLoading, setProspectosList, category, withoutAdvisor, signal });
  };

  // Called by external triggers (openEditor focus, saveLotFromModal, handleDeleteConfirm).
  // No internal AbortController — callers pass their own if needed.
  const fetchInventoryBg = async (name, status) => {
    fetchInventoryBgService({ apiFetch, setInventoryLots, setInventoryLotsHasMore, PAGE_SIZE, name, status, addToast });
  };

  const fetchInventoryLoteosBg = async () => {
    fetchInventoryLoteosBgService({ apiFetch, setInventoryLoteos, addToast });
  };

  const loadMoreProspectos = async () => {
    await loadMoreProspectosService({ apiFetch, setProspectosLoadingMore, setProspectosList, setProspectosHasMore, prospectosList, prospectosCategoryFilter, prospectosWithoutAdvisor, PAGE_SIZE });
  };

  const openEditLotModal = (lot) => {
    setEditLotForm({
      status: lot.status || 'available',
      price: lot.price != null ? String(lot.price) : '',
      area_m2: lot.area_m2 != null ? String(lot.area_m2) : '',
    });
    setEditLotError(null);
    setEditingLotId(lot.id);
    setEditLotModalOpen(true);
  };

  const closeEditLotModal = () => {
    setEditLotClosing(true);
    setTimeout(() => {
      setEditLotModalOpen(false);
      setEditLotClosing(false);
      setEditingLotId(null);
      setEditLotForm({ status: '', price: '', area_m2: '' });
    }, 200);
  };

  const saveLotFromModal = async (e) => {
    e.preventDefault();
    setEditLotLoading(true);
    setEditLotError(null);
    try {
      await patchLot({ apiFetch, editingLotId, editLotForm });
      addToast('Lote actualizado.', 'success');
      // Refresh inventory before closing modal to avoid flicker
      await fetchInventoryBg({ apiFetch, setInventoryLots, setInventoryLotsHasMore, PAGE_SIZE, name: inventorySearch, status: inventoryStatusFilter, addToast });
      closeEditLotModal();
    } catch (err) {
      setEditLotError(err.message);
    } finally {
      setEditLotLoading(false);
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
      await deleteLot({ apiFetch, lotId: lot.id });
      addToast(`Lote "${lot.name}" eliminado.`, 'success');
      await fetchInventoryBg({ apiFetch, setInventoryLots, setInventoryLotsHasMore, PAGE_SIZE, name: inventorySearch, status: inventoryStatusFilter, addToast });
      setConfirmDialog({ open: false, lot: null, loading: false });
    } catch (err) {
      addToast(`Error: ${err.message}`, 'error');
      setConfirmDialog(prev => ({ ...prev, loading: false }));
    }
  };

  const fetchReportsBg = async (days) => {
    await fetchReportsBgService({ apiFetch, token, setReportsCache, days });
  };

  // Wrapped logout for child components that call it with no arguments.
  // Defined before apiFetch so it can be passed as the logout callback.
  const logout = () => authLogout({
    setView, setLots, setLoteos, setSelectedLot, setStatus,
    setAdminSubView, setInventoryLots, setInventoryLotsHasMore, setInventorySearch,
    setInventoryStatusFilter, setInventoryTab, setInventoryLoteos, setProspectosList,
    setProspectosHasMore, setAllProspectosList, setProspectosCategoryFilter,
    setProspectosWithoutAdvisor, setToasts, setClicksCache, setVisorDataCache,
    setReportsCache, setDashboardSummary,
  });

  // apiFetch uses logout (no-arg) as the 401 handler
  const apiFetch = useMemo(() => createApiFetch(token, logout), [token, logout]);

  // Callbacks passed to AnalisisView so it can request data through the shared cache
  const { handleAnalisisRequestClicks, handleAnalisisRequestVisorData } = buildAnalisisCallbacks({ apiFetch, setClicksCache, setVisorDataCache });

  // ── Combined sync hook (must be after apiFetch and addToast) ─────────────────
  const { syncLoading, syncError, refresh: refreshSync } = useSync(token, apiFetch, {
    setInventoryLots,
    setInventoryLoteos,
    setAllProspectosList,
    setDashboardSummary,
    setClicksCache,
    setVisorDataCache,
    setReportsCache,
  }, addToast);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  // TODO: Replace regex check with URL constructor for stricter validation:
  //   const parsed = new URL(url);
  //   if (parsed.protocol !== 'https:') return;
  // This also prevents trick URLs like 'http://evil.com#https://legit.com'
  const safeOpen = (url) => {
    if (!url) return;
    if (!/^https:\/\//i.test(url)) {
      console.warn(`[safeOpen] Blocked non-HTTPS URL: ${url}`);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
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
              <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="form-group">
              <label htmlFor="login-password">Contraseña</label>
              <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader /> : 'Iniciar Sesión'}
            </Button>
          </form>
          {status?.type === 'error' && (
            <div className="login-error">
              <AlertCircle size={18} />
              <span>{status.message}</span>
            </div>
          )}
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
            <Button variant="outline" onClick={logout}>Salir</Button>
          </div>
        </nav>
      )}

      {view === 'lote_owner' && (
        <>
          <div
            className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
            onClick={() => setSidebarOpen(false)}
          />
          <div className="mobile-topbar">
            <button
              className="mobile-topbar-hamburger"
              onClick={() => setSidebarOpen(v => !v)}
              aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
            >
              {sidebarOpen ? (
                <X size={20} />
              ) : (
                <Menu size={20} />
              )}
            </button>
            <span className="mobile-topbar-brand">NOTRY</span>
            <span className="mobile-topbar-user">{user?.full_name?.split(' ')[0]}</span>
          </div>
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
                          <button
                            onClick={() => copyToClipboard(selectedLot.id)}
                            className="copy-btn-inline"
                            aria-label="Copiar ID del lote"
                          >
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
                        <Badge value={selectedLot.status} />
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
                          href={`${VISOR_URL}/?data=${API_BASE}/loteos/${loteo.id}/visor_data`}
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
                <Button
                  onClick={adminSubView === 'loteos' ? fetchLots : fetchLoteos}
                  size="sm"
                >
                  {adminSubView === 'loteos' ? 'Volver a Lotes' : 'Listar Loteos'}
                </Button>
              </div>
            </div>

            <div className="list-panel">
              <header className="panel-header">
                <h2>{adminSubView === 'lotes' ? 'Todos los Lotes' : 'Loteos Disponibles'}</h2>
                {loading && <Loader size="sm" />}
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
                        <Badge value={lot.status} />
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
                    <StatCard label="Lotes Disponibles" value={dashboardSummary?.lotes_disponibles ?? '—'} color="#c5a059" loading={!dashboardSummary} />
                    <StatCard label="Total Prospectos" value={dashboardSummary?.total_prospectos ?? '—'} color="#3b82f6" loading={!dashboardSummary} />
                    <StatCard
                      label="Tasa de Conversión"
                      value={dashboardSummary && dashboardSummary.total_lotes > 0
                        ? `${((dashboardSummary.total_prospectos / dashboardSummary.total_lotes) * 100).toFixed(1)}%`
                        : '—'}
                      color="#10b981"
                      loading={!dashboardSummary}
                    />
                  </div>
                  <ErrorBoundary label="Error en el tablero Kanban">
                    <KanbanBoard token={token} onSessionExpired={logout} prospectosList={allProspectosList} loteos={inventoryLoteos} advisorsList={advisorsList} />
                  </ErrorBoundary>
                </>
              )}

              {ownerSubView === 'inventario' && (
                <>
                  <div className="stats-grid">
                    <StatCard label="Lotes Disponibles" value={dashboardSummary?.lotes_disponibles ?? '—'} color="#c5a059" loading={!dashboardSummary} />
                    <StatCard label="Reservados" value={dashboardSummary?.lotes_reservados ?? '—'} color="#f59e0b" loading={!dashboardSummary} />
                    <StatCard label="Vendidos" value={dashboardSummary?.lotes_vendidos ?? '—'} color="#ef4444" loading={!dashboardSummary} />
                  </div>

                  <div className="inventory-section">
                    <div className="inventory-controls">
                      <div className="inventory-tab-controls">
                        <SlidersHorizontal size={16} className="filter-icon" />
                        <span className="inventory-tab-label">Ver tabla de:</span>
                        <select
                          className="inventory-tab-select"
                          value={inventoryTab}
                          onChange={e => { setInventoryTab(e.target.value); }}
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
                            <Select
                              id="inventory-status-filter"
                              value={inventoryStatusFilter}
                              onChange={e => setInventoryStatusFilter(e.target.value)}
                              options={[
                                { value: '', label: 'Estado: Todos' },
                                { value: 'available', label: 'Disponible' },
                                { value: 'reserved', label: 'Reservado' },
                                { value: 'sold', label: 'Vendido' },
                              ]}
                            />
                          </div>
                          <div className="loader-container small">
                            {(inventoryLoading || syncLoading) && <Loader size="sm" />}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="inventory-search" />
                          <div className="loader-container small">
                            {(syncLoading || inventoryLoteosLoading) && <Loader size="sm" />}
                          </div>
                            <Button
                              ref={createLoteoButtonRef}
                              size="sm"
                              onClick={openCreateLoteoModal}
                            >
                              + Nuevo Loteo
                            </Button>
                        </>
                      )}
                    </div>

                    <ErrorBoundary label="Error al cargar inventario">
                    {inventoryTab === 'lotes' ? (
                      <div key="lotes" className="inventory-table-wrapper fade-in">
                        <table className="inventory-table">
                          <thead>
                            <tr>
                              <th scope="col">Nombre</th>
                              <th scope="col">Área</th>
                              <th scope="col">Precio</th>
                              <th scope="col">Estado</th>
                              <th scope="col">Loteo</th>
                              <th scope="col">Prospectos</th>
                              <th scope="col">Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(filteredInventoryLots ?? inventoryLots).length === 0 ? (
                              <tr>
                                <td colSpan={7} className="td-empty-row">No se encontraron lotes.</td>
                              </tr>
                            ) : (
                              (filteredInventoryLots ?? inventoryLots).map(lot => (
                                <tr key={lot.id}>
                                  <td className="td-name">{lot.name}</td>
                                  <td>{lot.area_m2 ? `${parseFloat(lot.area_m2).toLocaleString()} m²` : '—'}</td>
                                  <td>{lot.price ? `$${parseFloat(lot.price).toLocaleString()}` : '—'}</td>
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
                                  <td className="td-actions">
                                    <button
                                      className="action-btn edit"
                                      onClick={() => openEditLotModal(lot)}
                                      title="Editar"
                                      aria-label={`Editar ${lot.name}`}
                                    >
                                      <Pencil size={16} />
                                    </button>
                                    <button
                                      className="action-btn delete"
                                      onClick={() => openDeleteConfirm(lot)}
                                      title="Eliminar"
                                      aria-label={`Eliminar ${lot.name}`}
                                    >
                                      <Trash2 size={16} />
                                    </button>
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
                            <Loader />
                          </div>
                        ) : (
                          <table className="inventory-table">
                            <thead>
                              <tr>
                                <th scope="col">Nombre</th>
                                <th scope="col">Imagen</th>
                                <th scope="col">Blueprint</th>
                                <th scope="col">Acciones</th>
                                <th scope="col">Links</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inventoryLoteos.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="td-empty-row">No se encontraron loteos.</td>
                                </tr>
                              ) : (
                                inventoryLoteos.map(loteo => (
                                  <tr key={loteo.id}>
                                    <td className="td-name">{loteo.name}</td>
                                    <td>
                                      {loteo.image_url ? (
                                        <button
                                          type="button"
                                          className="text-action-btn view"
                                          onClick={() => safeOpen(loteo.image_url)}
                                          title="Ver imagen"
                                          aria-label="Ver imagen"
                                        >
                                          <Eye size={16} style={{ marginRight: '6px' }} /> Ver
                                        </button>
                                      ) : (
                                        <span className="td-empty">—</span>
                                      )}
                                    </td>
                                    <td>
                                      {loteo.blueprint_url ? (
                                        <button
                                          type="button"
                                          className="text-action-btn view"
                                          onClick={() => safeOpen(loteo.blueprint_url)}
                                          title="Ver blueprint"
                                          aria-label="Ver blueprint"
                                        >
                                          <Eye size={16} style={{ marginRight: '6px' }} /> Ver
                                        </button>
                                      ) : (
                                        <span className="td-empty">—</span>
                                      )}
                                    </td>
                                    <td className="td-actions">
                                      <button
                                        type="button"
                                        className="text-action-btn edit"
                                        onClick={() => openEditLoteoModal(loteo)}
                                        title="Editar"
                                        aria-label={`Editar ${loteo.name}`}
                                      >
                                        <Pencil size={16} style={{ marginRight: '6px' }} /> Editar
                                      </button>
                                    </td>
                                    <td className="td-links">
                                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <button
                                          type="button"
                                          className="text-action-btn view"
                                          onClick={() => window.open(`${VISOR_URL}/?data=${API_BASE}/loteos/${loteo.id}/visor_data`, '_blank', 'noopener,noreferrer')}
                                        >
                                          Visor
                                        </button>
                                        <button
                                          type="button"
                                          className="text-action-btn view"
                                          onClick={() => openEditor(loteo.id)}
                                        >
                                          Editor
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </ErrorBoundary>
                  </div>
                </>
              )}

              {ownerSubView === 'clientes' && (
                <ErrorBoundary label="Error al cargar prospectos">
                <div className="charts-row">
                  <CategoryPieChart prospects={allProspectosList} />
                  <BudgetPieChart prospects={allProspectosList} />
                </div>
                <div className="inventory-section">
                  <div className="inventory-controls">
                    <div className="inventory-filters">
                      <SlidersHorizontal size={16} className="filter-icon" />
                      <Select
                        id="prospects-category-filter"
                        value={prospectosCategoryFilter}
                        onChange={e => setProspectosCategoryFilter(e.target.value)}
                        options={[
                          { value: '', label: 'Categoría: Todas' },
                          ...Object.entries(CATEGORY_DISPLAY).map(([val, label]) => ({
                            value: val,
                            label,
                          })),
                        ]}
                      />
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
                    <Button
                      ref={addProspectButtonRef}
                      size="sm"
                      onClick={openAddProspectModal}
                    >
                      + Nuevo Prospecto
                    </Button>
                    {prospectosLoading && (
                      <Loader size="sm" />
                    )}
                  </div>

                  <div className="inventory-table-wrapper">
                    <table className="inventory-table">
                      <caption className="sr-only">Lista de prospectos</caption>
                      <thead>
                        <tr>
                          <th scope="col">Nombre</th>
                          <th scope="col">Email</th>
                          <th scope="col">Teléfono</th>
                          <th scope="col">Categoría</th>
                          <th scope="col">Presupuesto</th>
                          <th scope="col">Último Contacto</th>
                          <th scope="col">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(filteredProspectos ?? prospectosList).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="td-empty-row">No se encontraron prospectos.</td>
                          </tr>
                        ) : (
                          (filteredProspectos ?? prospectosList).map(p => (
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
                              <td className="td-actions">
                                <button
                                  className="action-btn edit"
                                  onClick={() => openEditProspect(p)}
                                  title="Editar"
                                  aria-label={`Editar ${p.name}`}
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  className="action-btn delete"
                                  onClick={() => openDeleteProspectModalForFocus(p)}
                                  title="Eliminar"
                                  aria-label={`Eliminar ${p.name}`}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    {prospectosHasMore && (
                      <div className="load-more-row">
                        <Button variant="outline" size="sm" onClick={loadMoreProspectos} disabled={prospectosLoadingMore}>
                          {prospectosLoadingMore ? <Loader size="sm" /> : 'Cargar más prospectos'}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                </ErrorBoundary>
              )}

              {ownerSubView === 'analisis' && (
                <ErrorBoundary label="Error en la vista de análisis">
                  <AnalisisView
                    token={token}
                    onSessionExpired={logout}
                    prefetchedLoteos={inventoryLoteos}
                    cachedClicks={clicksCache}
                    cachedVisorData={visorDataCache}
                    cachedReports={reportsCache}
                    analisisLastDays={analisisLastDays}
                    onAnalisisLastDaysChange={setAnalisisLastDays}
                    onRequestClicks={handleAnalisisRequestClicks}
                    onRequestVisorData={handleAnalisisRequestVisorData}
                  />
                </ErrorBoundary>
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

      <CreateLoteoModal
        isOpen={createLoteoOpen}
        onClose={() => setCreateLoteoOpen(false)}
        formData={createLoteoForm}
        onFieldChange={(field, value) => setCreateLoteoForm(f => ({ ...f, [field]: value }))}
        onSubmit={createLoteo}
        loading={createLoteoLoading}
        error={createLoteoError}
        isValidHttpsUrl={isValidHttpsUrl}
      />

      <EditLoteoModal
        isOpen={editLoteoOpen}
        isClosing={editLoteoClosing}
        onClose={closeEditLoteoModal}
        formData={editLoteoForm}
        onFieldChange={(field, value) => setEditLoteoForm(f => ({ ...f, [field]: value }))}
        onSubmit={saveEditLoteo}
        loading={editLoteoLoading}
        error={editLoteoError}
      />

      <AddProspectModal
        isOpen={addProspectOpen}
        onClose={() => setAddProspectOpen(false)}
        onSubmit={async (formData) => {
          await createProspectService({ apiFetch, addProspectForm: formData, setAddProspectLoading: setAddProspectLoading, setAddProspectError: setAddProspectError, setAddProspectOpen: setAddProspectOpen, setAddProspectForm: setAddProspectForm, refreshSync });
        }}
        loading={addProspectLoading}
        error={addProspectError}
        addToast={addToast}
      />

      <EditEntityModal
        isOpen={editProspectModalOpen}
        isClosing={editProspectClosing}
        title="Editar Prospecto"
        fields={getProspectFields(advisorsList, advisorsLoading)}
        formData={editProspectForm}
        onFormChange={(field, value) =>
          setEditProspectForm(f => ({ ...f, [field]: value }))
        }
        onSubmit={saveEditProspect}
        onClose={closeEditProspectModal}
        loading={editProspectLoading}
        error={editProspectError}
        wide={true}
        secondaryActions={[
          {
            label: 'Actualizar Contacto',
            onClick: () => updateLastContact(editingProspectId),
            disabled: editProspectLoading || updatingContact,
            loading: updatingContact,
          },
        ]}
      />

      <DeleteProspectDialog
        isOpen={deleteProspectDialog.open}
        prospect={deleteProspectDialog.prospect}
        loading={deleteProspectDialog.loading}
        onConfirm={handleDeleteProspectConfirm}
        onCancel={() => setDeleteProspectDialog({ open: false, prospect: null, loading: false })}
      />

      <ConfirmDialog
        isOpen={confirmDialog.open}
        lot={confirmDialog.lot}
        loading={confirmDialog.loading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDialog({ open: false, lot: null, loading: false })}
      />

      <EditEntityModal
        isOpen={editLotModalOpen}
        isClosing={editLotClosing}
        title="Editar Lote"
        fields={getLotFields()}
        formData={editLotForm}
        onFormChange={(field, value) =>
          setEditLotForm(f => ({ ...f, [field]: value }))
        }
        onSubmit={saveLotFromModal}
        onClose={closeEditLotModal}
        loading={editLotLoading}
        error={editLotError}
      />

      <div className="toasts-container">
        {syncError && (
          <div
            key="sync-error"
            className="toast toast--error"
            onClick={() => {}}
          >
            Error de sincronización: {syncError}
          </div>
        )}
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`toast toast--${toast.type ?? 'success'}`}
            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
