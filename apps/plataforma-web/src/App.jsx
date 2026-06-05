import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Copy, Search, SlidersHorizontal, Pencil, Trash2, Check, X, AlertCircle, Menu, Eye } from 'lucide-react';
import Sidebar from './components/Sidebar';
import StatCard from './components/StatCard';
import LoginView from './components/views/LoginView';
import InicioView from './components/views/InicioView';
import AdminView from './components/views/AdminView';
import InventarioView from './components/views/InventarioView';
import ClientesView from './components/views/ClientesView';
import KanbanBoard from './components/KanbanBoard';
import AnalisisView from './components/AnalisisView';
import CategoryPieChart from './components/CategoryPieChart';
import ConfirmDialog from './components/ConfirmDialog';
import DeleteProspectDialog from './components/DeleteProspectDialog';
import DeleteLoteoDialog from './components/DeleteLoteoDialog';
import LoteoFormModal from './components/modals/LoteoFormModal';
import AddProspectModal from './components/modals/AddProspectModal';
import UpdateContactModal from './components/modals/UpdateContactModal';
import { Badge, Button, ErrorBoundary, Loader, Select, EditEntityModal } from './ui/components';
import { API_BASE, EDITOR_URL, VISOR_URL } from './config';
import { useSync } from './hooks/useSync';
import { useActivityFeed } from './hooks/useActivityFeed';
import { useAuth } from './hooks/useAuth';
import { useToast } from './hooks/useToast';
import { useEditLotModal } from './hooks/useEditLotModal';
import { useCreateLotModal } from './hooks/useCreateLotModal';
import { useEditLoteoModal } from './hooks/useEditLoteoModal';
import { useCreateLoteoModal } from './hooks/useCreateLoteoModal';
import { useAddProspectModal } from './hooks/useAddProspectModal';
import { useEditProspectModal } from './hooks/useEditProspectModal';
import { useUpdateContactModal } from './hooks/useUpdateContactModal';
import { useConfirmDialogs } from './hooks/useConfirmDialogs';
import { useInventory } from './hooks/useInventory';
import { useProspects } from './hooks/useProspects';
import ShareLoteoModal from './components/modals/ShareLoteoModal';
import { PAGE_SIZE, STATUS_DISPLAY, CATEGORY_DISPLAY, formatDate, getProspectFields, getLotFields } from './constants';
import { createApiFetch } from './api';
import { createUploadFn } from './api/upload';
import UploadProgressCard from './components/UploadProgressCard';
import { fetchLots as fetchLotsService, fetchInventory as fetchInventoryService, fetchInventoryBg as fetchInventoryBgService, createLot, patchLot, deleteLot } from './api/lots';
import { fetchLoteos as fetchLoteosService, fetchInventoryLoteos as fetchInventoryLoteosService, fetchInventoryLoteosBg as fetchInventoryLoteosBgService, deleteLoteo } from './api/loteos';
import { createProspect as createProspectService, fetchAdvisors as fetchAdvisorsService, saveEditProspect as saveEditProspectService, updateLastContact as updateLastContactService, fetchProspectos as fetchProspectosService, loadMoreProspectos as loadMoreProspectosService } from './api/prospects';
import { fetchReportsBg as fetchReportsBgService, buildAnalisisCallbacks } from './api/reports';
import './App.css';
import './components/Layout.css';

const OWNER_VIEW_HEADERS = {
  inicio: {
    title: 'Inicio',
    subtitle: (firstName) => `Hola ${firstName}, este es el pulso general de tu operación.`,
  },
  inventario: {
    title: 'Inventario',
    subtitle: 'Controlá disponibilidad, reservas y ventas de tus lotes.',
  },
  clientes: {
    title: 'Clientes',
    subtitle: 'Seguimiento claro para prospectos, asesores y próximos contactos.',
  },
  analisis: {
    title: 'Análisis',
    subtitle: 'Medí la actividad comercial y detectá oportunidades con datos reales.',
  },
  configuracion: {
    title: 'Configuración',
    subtitle: 'Ajustá preferencias y detalles de tu espacio de trabajo.',
  },
};

function App() {
  const [view, setView] = useState('login'); // 'login' | 'lote_owner' | 'super_admin'
  const [adminSubView, setAdminSubView] = useState('lotes'); // 'lotes' | 'loteos'
  const [adminLoading, setAdminLoading] = useState(false);
  const [ownerSubView, setOwnerSubView] = useState(() => localStorage.getItem('owner_sub_view') || 'inicio');
  const { token, user, isInitializing, handleLogin: authLogin, logout: authLogout } = useAuth();
  const [lots, setLots] = useState(null);
  const [loteos, setLoteos] = useState(null);
  const [selectedLot, setSelectedLot] = useState(null);
  const [inventoryLots, setInventoryLots] = useState([]);
  const {
    inventoryLoading, setInventoryLoading,
    inventoryLoteosLoading, setInventoryLoteosLoading,
    inventoryLoteos, setInventoryLoteos,
    inventorySearch, setInventorySearch,
    inventoryLoteosSearch, setInventoryLoteosSearch,
    inventoryStatusFilter, setInventoryStatusFilter,
    inventoryTab, setInventoryTab,
    inventoryLotsHasMore, setInventoryLotsHasMore,
    inventoryLotsLoadingMore, setInventoryLotsLoadingMore,
  } = useInventory();

  const {
    prospectosLoading, setProspectosLoading,
    prospectosSearch, setProspectosSearch,
    prospectosCategoryFilter, setProspectosCategoryFilter,
    prospectosWithoutAdvisor, setProspectosWithoutAdvisor,
    prospectosHasMore, setProspectosHasMore,
    prospectosLoadingMore, setProspectosLoadingMore,
    advisorsList, setAdvisorsList,
    advisorsLoading, setAdvisorsLoading,
  } = useProspects();

  const [prospectosList, setProspectosList] = useState([]);
  const [allProspectosList, setAllProspectosList] = useState([]);
  const [clicksCache, setClicksCache] = useState({});
  const [clicksLoadingIds, setClicksLoadingIds] = useState(new Set()); // Track which loteos are loading clicks
  const [visorDataCache, setVisorDataCache] = useState({}); // { loteoId: visorData }
  const [visorDataLoadingIds, setVisorDataLoadingIds] = useState(new Set()); // Track which loteos are loading visor data
  const [reportsCache, setReportsCache] = useState({}); // { lastDays: { prospectos, ventas, lotesVendidos } }
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [analisisLastDays, setAnalisisLastDays] = useState(30);
  const [deleteLoteoDialog, setDeleteLoteoDialog] = useState({ open: false, loteo: null, loading: false });
  const [shareLoteoOpen, setShareLoteoOpen] = useState(false);
  const [selectedLoteoId, setSelectedLoteoId] = useState(null);

  const filtersRef = React.useRef({
    inventorySearch,
    inventoryLoteosSearch,
    inventoryStatusFilter,
    prospectosSearch,
    prospectosCategoryFilter,
    prospectosWithoutAdvisor,
    inventoryLoteos,
    inventoryLotsCount: 0,
    prospectosCount: 0,
  });

  // ── Combined sync hook (replaces 8 separate polling intervals) ──────────────
  // ── Helper functions ────────────────────────────────────────────────────────
  React.useEffect(() => {
    filtersRef.current = {
      inventorySearch,
      inventoryLoteosSearch,
      inventoryStatusFilter,
      prospectosSearch,
      prospectosCategoryFilter,
      prospectosWithoutAdvisor,
      inventoryLoteos,
      inventoryLotsCount: inventoryLots.length,
      prospectosCount: prospectosList.length,
    };
  }, [inventorySearch, inventoryLoteosSearch, inventoryStatusFilter, prospectosSearch, prospectosCategoryFilter, prospectosWithoutAdvisor, inventoryLoteos, inventoryLots.length, prospectosList.length]);

  // ── Toast notifications ────────────────────────────────────────────────────────
  const { toasts, addToast, removeToast } = useToast();

  // ── Activity Feed Hook (called early so setActivities is available for modal hooks) ──
  const { activities, handleRawActivities, setActivities } = useActivityFeed({});

  // Restore view when session is recovered from localStorage
  React.useEffect(() => {
    if (isInitializing || !user) return;
    if (user.role === 'super_admin' || user.role === 'admin') {
      setView('super_admin');
    } else if (user.role === 'lote_owner') {
      setView('lote_owner');
    }
  }, [user, isInitializing]);

  // Persist ownerSubView so it survives page reloads
  React.useEffect(() => {
    localStorage.setItem('owner_sub_view', ownerSubView);
  }, [ownerSubView]);

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
    const q = (inventorySearch || '').toLowerCase();
    return (inventoryLots || []).filter(lot => {
      const matchSearch = !q || lot.name?.toLowerCase().includes(q);
      const matchStatus = !inventoryStatusFilter || lot.status === inventoryStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [inventoryLots, inventorySearch, inventoryStatusFilter]);

  const filteredInventoryLoteos = useMemo(() => {
    if (!inventoryLoteosSearch) return null;
    const q = (inventoryLoteosSearch || '').toLowerCase();
    return (inventoryLoteos || []).filter(loteo => loteo.name?.toLowerCase().includes(q));
  }, [inventoryLoteos, inventoryLoteosSearch]);

  const filteredProspectos = useMemo(() => {
    if (!prospectosSearch && !prospectosCategoryFilter && !prospectosWithoutAdvisor) return null;
    const q = (prospectosSearch || '').toLowerCase();
    return (allProspectosList || []).filter(p => {
      const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q);
      const matchCat = !prospectosCategoryFilter || p.category === prospectosCategoryFilter;
      const matchAdv = !prospectosWithoutAdvisor || !p.advisor_id;
      return matchSearch && matchCat && matchAdv;
    });
  }, [allProspectosList, prospectosSearch, prospectosCategoryFilter, prospectosWithoutAdvisor]);

  const handleLogin = async (email, password, { setLoading, setStatus }) => {
    try {
      await authLogin(email, password, { setLoading, setStatus, setView });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
      setLoading(false);
    }
  };

  const fetchLots = async () => {
    fetchLotsService({ apiFetch, setLoading: setAdminLoading, setLots, setSelectedLot, setAdminSubView });
  };

  const fetchLoteos = async () => {
    fetchLoteosService({ apiFetch, setLoading: setAdminLoading, setLoteos, setAdminSubView, addToast });
  };

  const fetchInventory = async (name, status, signal) => {
    fetchInventoryService({ apiFetch, setInventoryLoading, setInventoryLots, setInventoryLotsHasMore, PAGE_SIZE, name, status, signal });
  };

  const fetchInventoryLoteos = async () => {
    fetchInventoryLoteosService({ apiFetch, setInventoryLoteosLoading, setInventoryLoteos });
  };

  
  
  const fetchAdvisors = async () => {
    fetchAdvisorsService({ apiFetch, setAdvisorsLoading, setAdvisorsList });
  };

  const openDeleteProspectDialog = (prospect) => {
    confirmDialogs.openDeleteProspectDialog(prospect);
  };

  const openEditor = (loteoId) => {
    const dataUrl = `${API_BASE}/loteos/${loteoId}/visor_data`;
    window.open(`${EDITOR_URL}/?data=${encodeURIComponent(dataUrl)}&token=${encodeURIComponent(token)}`, '_blank');

    // Refresh data when user returns from editor.
    // Reads current filter values at event time via filtersRef to avoid stale closure.
    const onFocus = () => {
      fetchInventoryLoteosBg();
      fetchInventoryBgService({ apiFetch, setInventoryLots, setInventoryLotsHasMore, PAGE_SIZE, name: filtersRef.current.inventorySearch, status: filtersRef.current.inventoryStatusFilter, addToast });
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

  // Helper: Update dashboard cache based on current prospects list
  // Avoids backend call; calculates derived metrics locally
  const updateDashboardFromProspects = (prospectos) => {
    setDashboardSummary(prev => prev ? { ...prev, total_prospectos: prospectos.length } : null);
  };

  const updateProspectCategory = (prospectId, newCategory) => {
    setAllProspectosList(prev => {
      const updated = prev.map(p => p.id === prospectId ? { ...p, category: newCategory } : p);
      // Update dashboard cache locally (no API call)
      updateDashboardFromProspects(updated);
      return updated;
    });
  };

  const updateProspectLastContact = (prospectId) => {
    const now = new Date().toISOString();
    setAllProspectosList(prev =>
      prev.map(p => p.id === prospectId ? { ...p, last_contact: now } : p)
    );
  };

  const updateLot = (lotId, updates) => {
    setInventoryLots(prev =>
      prev.map(lot => lot.id === lotId ? { ...lot, ...updates } : lot)
    );
  };

  const addLoteo = (newLoteo) => {
    setInventoryLoteos(prev => [...prev, newLoteo]);
  };

  const updateLoteo = (loteoId, updates) => {
    setInventoryLoteos(prev =>
      prev.map(loteo => loteo.id === loteoId ? { ...loteo, ...updates } : loteo)
    );
  };

  const removeLoteoFromList = (loteoId) => {
    setInventoryLoteos(prev => prev.filter(loteo => loteo.id !== loteoId));
  };

  const addLot = (newLot) => {
    setInventoryLots(prev => [...prev, newLot]);
  };

  const addProspect = (newProspect) => {
    setAllProspectosList(prev => {
      const updated = [...prev, newProspect];
      updateDashboardFromProspects(updated);
      return updated;
    });
  };

  const removeProspect = (prospectId) => {
    setAllProspectosList(prev => {
      const updated = prev.filter(p => p.id !== prospectId);
      updateDashboardFromProspects(updated);
      return updated;
    });
  };

  const openDeleteConfirm = (lot) => {
    confirmDialogs.openDeleteConfirm(lot);
  };

  const handleDeleteConfirm = async () => {
    await confirmDialogs.handleDeleteConfirm(fetchInventoryBg);
  };

  const openDeleteLoteoDialog = (loteo) => {
    setDeleteLoteoDialog({ open: true, loteo, loading: false });
  };

  const closeDeleteLoteoDialog = () => {
    setDeleteLoteoDialog({ open: false, loteo: null, loading: false });
  };

  const handleOpenShareLoteo = (loteoId) => {
    setSelectedLoteoId(loteoId);
    setShareLoteoOpen(true);
  };

  const handleCloseShareLoteo = () => {
    setShareLoteoOpen(false);
    setSelectedLoteoId(null);
  };

  const handleDeleteLoteoConfirm = async () => {
    const loteo = deleteLoteoDialog.loteo;
    if (!loteo) return;
    setDeleteLoteoDialog(prev => ({ ...prev, loading: true }));
    try {
      await deleteLoteo({ apiFetch, loteoId: loteo.id, loteoName: loteo.name, loteOwnerId: user?.lote_owner_id, setActivities });
      addToast(`Loteo "${loteo.name}" eliminado.`, 'success');
      setDeleteLoteoDialog({ open: false, loteo: null, loading: false });
      removeLoteoFromList(loteo.id);
      refreshSync();
    } catch (err) {
      addToast(`Error: ${err.message}`, 'error');
      setDeleteLoteoDialog(prev => ({ ...prev, loading: false }));
    }
  };

  const fetchReportsBg = async (days) => {
    await fetchReportsBgService({ apiFetch, token, setReportsCache, days });
  };

  // Wrapped logout for child components that call it with no arguments.
  // Defined before apiFetch so it can be passed as the logout callback.
  // Wrapped in useCallback to prevent unnecessary recreations that would cause apiFetch to be recreated.
  const logout = useCallback(() => authLogout({
    setView, setLots, setLoteos, setSelectedLot,
    setAdminSubView, setInventoryLots, setInventoryLotsHasMore, setInventorySearch,
    setInventoryStatusFilter, setInventoryTab, setInventoryLoteos, setProspectosList,
    setProspectosHasMore, setAllProspectosList, setProspectosCategoryFilter,
    setProspectosWithoutAdvisor, setClicksCache, setVisorDataCache,
    setReportsCache, setDashboardSummary,
  }), []);

  // apiFetch uses logout (no-arg) as the 401 handler
  const apiFetch = useMemo(() => createApiFetch(token, logout), [token, logout]);

  // uploadFn: XHR-based upload with WebP conversion + progress events
  const uploadFn = useMemo(() => createUploadFn(token, logout), [token, logout]);

  const [uploadJobs, setUploadJobs] = useState([]);

  const handleUploadEvent = useCallback(({ type, id, label, phase, percent }) => {
    if (type === 'start')
      setUploadJobs(prev => [...prev, { id, label, phase: 'converting', percent: 0, done: false }]);
    else if (type === 'progress')
      setUploadJobs(prev => prev.map(j => j.id === id ? { ...j, phase, percent } : j));
    else if (type === 'complete') {
      setUploadJobs(prev => prev.map(j => j.id === id ? { ...j, done: true, percent: 100 } : j));
      setTimeout(() => setUploadJobs(prev => prev.filter(j => j.id !== id)), 2200);
    } else if (type === 'error')
      setUploadJobs(prev => prev.filter(j => j.id !== id));
  }, []);

  // ── Edit Lot Modal ──────────────────────────────────────────────────────────
  const editLotModal = useEditLotModal({
    apiFetch,
    onSuccess: () => {
      addToast('Lote actualizado.', 'success');
      fetchInventoryBg(inventorySearch, inventoryStatusFilter);
    },
    onUpdateLot: updateLot,
    loteOwnerId: user?.lote_owner_id,
    setActivities,
  });

  // ── Create Lot Modal ─────────────────────────────────────────────────────────
  const createLotModal = useCreateLotModal({
    apiFetch,
    onSuccess: () => {
      addToast('Lote creado.', 'success');
      fetchInventoryBg(inventorySearch, inventoryStatusFilter);
    },
    onAddLot: addLot,
    loteOwnerId: user?.lote_owner_id,
    setActivities,
  });

  // ── Create Loteo Modal ─────────────────────────────────────────────────────
  const createLoteoModal = useCreateLoteoModal({
    apiFetch,
    onSuccess: () => {
      addToast('Loteo creado.', 'success');
      fetchInventoryLoteosBg();
    },
    onAddLoteo: addLoteo,
    loteOwnerId: user?.lote_owner_id,
    setActivities,
  });

  // ── Edit Loteo Modal ──────────────────────────────────────────────────────────
  const editLoteoModal = useEditLoteoModal({
    apiFetch,
    setInventoryLoteos,
    addToast,
    onSuccess: () => {
      addToast('Loteo actualizado.', 'success');
      fetchInventoryLoteos();
    },
    setActivities,
    onUpdateLoteo: updateLoteo,
    loteOwnerId: user?.lote_owner_id,
  });

  // Callbacks passed to AnalisisView so it can request data through the shared cache
  const { handleAnalisisRequestClicks, handleAnalisisRequestVisorData } = buildAnalisisCallbacks({ apiFetch, setClicksCache, setVisorDataCache, setClicksLoadingIds, setVisorDataLoadingIds });

  // ── Combined sync hook (must be after apiFetch and addToast) ─────────────────
  const { syncLoading, syncError, refresh: refreshSync } = useSync(token, apiFetch, {
    setInventoryLots,
    setInventoryLoteos,
    setAllProspectosList,
    setDashboardSummary,
    setClicksCache,
    setVisorDataCache,
    setReportsCache,
    setRawActivities: handleRawActivities,
  }, addToast);

  // ── Add Prospect Modal ────────────────────────────────────────────────────────
  const addProspectModal = useAddProspectModal({
    apiFetch,
    onSuccess: refreshSync,
    addToast,
    onAddProspect: addProspect,
    loteOwnerId: user?.lote_owner_id,
    setActivities: setActivities,
  });

  // ── Edit Prospect Modal ──────────────────────────────────────────────────────
  const editProspectModal = useEditProspectModal({
    apiFetch,
    advisorsList,
    setAdvisorsList,
    addToast,
    onSuccess: refreshSync,
    onUpdateLastContact: updateProspectLastContact,
    loteOwnerId: user?.lote_owner_id,
    setActivities: setActivities,
  });

  const updateContactModal = useUpdateContactModal({
    apiFetch,
    addToast,
    onSuccess: refreshSync,
    loteOwnerId: user?.lote_owner_id,
    setActivities: setActivities,
  });

  // ── Confirm Dialogs ─────────────────────────────────────────────────────────
  const confirmDialogs = useConfirmDialogs({
    apiFetch,
    addToast,
    onSuccess: refreshSync,
    onRemoveProspect: removeProspect,
    loteOwnerId: user?.lote_owner_id,
    setActivities: setActivities,
  });

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

  if (isInitializing) {
    return <div className="app-loading"><Loader /></div>;
  }

  if (view === 'login') {
    return <LoginView onLogin={handleLogin} />;
  }

  const ownerFirstName = user?.full_name?.split(' ')[0] || 'equipo';
  const ownerViewHeader = OWNER_VIEW_HEADERS[ownerSubView] || {
    title: ownerSubView,
    subtitle: 'Esta sección está siendo preparada.',
  };
  const ownerViewSubtitle = typeof ownerViewHeader.subtitle === 'function'
    ? ownerViewHeader.subtitle(ownerFirstName)
    : ownerViewHeader.subtitle;

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
          <AdminView
            lots={lots}
            loteos={loteos}
            selectedLot={selectedLot}
            loading={adminLoading}
            adminSubView={adminSubView}
            onSelectLot={setSelectedLot}
            onFetchLots={fetchLots}
            onFetchLoteos={fetchLoteos}
            copyToClipboard={copyToClipboard}
          />
        ) : (
          <div className="owner-layout">
            <div key={ownerSubView} className="view-content">
              <header className="owner-header">
                <h1 className="view-title">{ownerViewHeader.title}</h1>
                <h2>{ownerViewSubtitle}</h2>
              </header>

              {ownerSubView === 'inicio' && (
                <InicioView
                  dashboardSummary={dashboardSummary}
                  allProspectosList={allProspectosList}
                  inventoryLoteos={inventoryLoteos}
                  inventoryLots={inventoryLots}
                  advisorsList={advisorsList}
                  token={token}
                  onSessionExpired={logout}
                  onUpdateProspectCategory={updateProspectCategory}
                  activities={activities}
                  loteos={inventoryLoteos}
                  onOpenShareLoteo={handleOpenShareLoteo}
                  apiFetch={apiFetch}
                  loteOwnerId={user?.lote_owner_id}
                  setActivities={setActivities}
                />
              )}

              {ownerSubView === 'inventario' && (
                <InventarioView
                  dashboardSummary={dashboardSummary}
                  inventoryLots={inventoryLots}
                  filteredInventoryLots={filteredInventoryLots}
                  inventoryLoteos={inventoryLoteos}
                  filteredInventoryLoteos={filteredInventoryLoteos}
                  inventoryLoading={inventoryLoading}
                  inventoryLoteosLoading={inventoryLoteosLoading}
                  inventoryTab={inventoryTab}
                  onTabChange={setInventoryTab}
                  inventorySearch={inventorySearch}
                  onSearchChange={setInventorySearch}
                  inventoryLoteosSearch={inventoryLoteosSearch}
                  onLoteosSearchChange={setInventoryLoteosSearch}
                  inventoryStatusFilter={inventoryStatusFilter}
                  onStatusFilterChange={setInventoryStatusFilter}
                  syncLoading={syncLoading}
                  onOpenEditLotModal={editLotModal.openEditLotModal}
                  onOpenDeleteConfirm={confirmDialogs.openDeleteConfirm}
                  onOpenCreateLotModal={createLotModal.openCreateLotModal}
                  onOpenCreateLoteoModal={createLoteoModal.openCreateLoteoModal}
                  onOpenEditLoteoModal={editLoteoModal.openEditLoteoModal}
                  onOpenDeleteLoteoDialog={openDeleteLoteoDialog}
                  onOpenEditor={openEditor}
                  safeOpen={safeOpen}
                  onOpenShareLoteo={handleOpenShareLoteo}
                />
              )}

              {ownerSubView === 'clientes' && (
                <ClientesView
                  allProspectosList={allProspectosList}
                  prospectosList={prospectosList}
                  filteredProspectos={filteredProspectos}
                  prospectosLoading={prospectosLoading}
                  prospectosLoadingMore={prospectosLoadingMore}
                  prospectosHasMore={prospectosHasMore}
                  prospectosSearch={prospectosSearch}
                  onSearchChange={setProspectosSearch}
                  prospectosCategoryFilter={prospectosCategoryFilter}
                  onCategoryChange={setProspectosCategoryFilter}
                  prospectosWithoutAdvisor={prospectosWithoutAdvisor}
                  onWithoutAdvisorChange={setProspectosWithoutAdvisor}
                  onOpenAddProspect={addProspectModal.openAddProspectModal}
                  onEditProspect={editProspectModal.openEditProspectModal}
                  onDeleteProspect={openDeleteProspectDialog}
                  onLoadMore={loadMoreProspectos}
                  onUpdateContact={updateContactModal.openUpdateContactModal}
                />
              )}

              {ownerSubView === 'analisis' && (
                <ErrorBoundary label="Error en la vista de análisis">
                  <AnalisisView
                    apiFetch={apiFetch}
                    token={token}
                    onSessionExpired={logout}
                    prefetchedLoteos={inventoryLoteos}
                    cachedClicks={clicksCache}
                    clicksLoadingIds={clicksLoadingIds}
                    cachedVisorData={visorDataCache}
                    visorDataLoadingIds={visorDataLoadingIds}
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

      <LoteoFormModal
        mode="create"
        isOpen={createLoteoModal.createLoteoOpen}
        onClose={createLoteoModal.closeCreateLoteoModal}
        formData={createLoteoModal.createLoteoForm}
        onFieldChange={(field, value) => createLoteoModal.setCreateLoteoForm(f => ({ ...f, [field]: value }))}
        onSubmit={createLoteoModal.submitCreateLoteo}
        loading={createLoteoModal.createLoteoLoading}
        error={createLoteoModal.createLoteoError}
        apiFetch={apiFetch}
        uploadFn={uploadFn}
        onUploadEvent={handleUploadEvent}
      />

      <LoteoFormModal
        mode="edit"
        isOpen={editLoteoModal.editLoteoOpen}
        isClosing={editLoteoModal.editLoteoClosing}
        onClose={editLoteoModal.closeEditLoteoModal}
        formData={editLoteoModal.editLoteoForm}
        onFieldChange={(field, value) => editLoteoModal.setEditLoteoForm(f => ({ ...f, [field]: value }))}
        onSubmit={editLoteoModal.submitEditLoteo}
        loading={editLoteoModal.editLoteoLoading}
        error={editLoteoModal.editLoteoError}
        apiFetch={apiFetch}
        uploadFn={uploadFn}
        onUploadEvent={handleUploadEvent}
      />

      <AddProspectModal
        isOpen={addProspectModal.addProspectOpen}
        onClose={addProspectModal.closeAddProspectModal}
        onSubmit={addProspectModal.submitAddProspect}
        loading={addProspectModal.addProspectLoading}
        error={addProspectModal.addProspectError}
        addToast={addToast}
        loteosList={inventoryLots}
      />

      <EditEntityModal
        isOpen={editProspectModal.editProspectModalOpen}
        isClosing={editProspectModal.editProspectClosing}
        title="Editar Prospecto"
        fields={getProspectFields(advisorsList, advisorsLoading, inventoryLots, inventoryLoading)}
        formData={editProspectModal.editProspectForm}
        onFormChange={(field, value) =>
          editProspectModal.setEditProspectForm(f => ({ ...f, [field]: value }))
        }
        onSubmit={editProspectModal.saveEditProspect}
        onClose={editProspectModal.closeEditProspectModal}
        loading={editProspectModal.editProspectLoading}
        error={editProspectModal.editProspectError}
        wide={true}
      />

      <DeleteProspectDialog
        isOpen={confirmDialogs.deleteProspectDialog.open}
        prospect={confirmDialogs.deleteProspectDialog.prospect}
        loading={confirmDialogs.deleteProspectDialog.loading}
        onConfirm={confirmDialogs.handleDeleteProspectConfirm}
        onCancel={confirmDialogs.closeDeleteProspectDialog}
      />

      <UpdateContactModal
        isOpen={updateContactModal.updateContactModalOpen}
        isClosing={updateContactModal.updateContactClosing}
        loading={updateContactModal.updateContactLoading}
        onConfirm={updateContactModal.handleUpdateContact}
        onCancel={updateContactModal.closeUpdateContactModal}
      />

      <DeleteLoteoDialog
        isOpen={deleteLoteoDialog.open}
        loteo={deleteLoteoDialog.loteo}
        loading={deleteLoteoDialog.loading}
        onConfirm={handleDeleteLoteoConfirm}
        onCancel={closeDeleteLoteoDialog}
      />

      <ConfirmDialog
        isOpen={confirmDialogs.confirmDialog.open}
        lot={confirmDialogs.confirmDialog.lot}
        loading={confirmDialogs.confirmDialog.loading}
        onConfirm={handleDeleteConfirm}
        onCancel={confirmDialogs.closeConfirmDialog}
      />

      <ShareLoteoModal
        isOpen={shareLoteoOpen}
        onClose={handleCloseShareLoteo}
        visorBaseUrl={VISOR_URL}
        apiBaseUrl={API_BASE}
        loteoId={selectedLoteoId}
      />

      <EditEntityModal
        isOpen={editLotModal.editLotModalOpen}
        isClosing={editLotModal.editLotClosing}
        title="Editar Lote"
        fields={getLotFields(inventoryLoteos)}
        formData={editLotModal.editLotForm}
        onFormChange={(field, value) =>
          editLotModal.setEditLotForm(f => ({ ...f, [field]: value }))
        }
        onSubmit={editLotModal.saveLotFromModal}
        onClose={editLotModal.closeEditLotModal}
        loading={editLotModal.editLotLoading}
        error={editLotModal.editLotError}
      />

      <EditEntityModal
        isOpen={createLotModal.createLotOpen}
        title="Crear Lote"
        fields={getLotFields(inventoryLoteos)}
        formData={createLotModal.createLotForm}
        onFormChange={(field, value) =>
          createLotModal.setCreateLotForm(f => ({ ...f, [field]: value }))
        }
        onSubmit={createLotModal.submitCreateLot}
        onClose={createLotModal.closeCreateLotModal}
        loading={createLotModal.createLotLoading}
        error={createLotModal.createLotError}
      />

      <UploadProgressCard jobs={uploadJobs} />

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
            onClick={() => removeToast(toast.id)}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
