import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Copy, Search, SlidersHorizontal, Pencil, Trash2, Check, X, AlertCircle, Menu, Eye, CircleCheck, CircleAlert, Info } from 'lucide-react';
import Sidebar from './components/Sidebar';
import AccountModal from './components/AccountModal';
import StatCard from './components/StatCard';
import LoginView from './components/views/LoginView';
import BuyerPortalDataView from './components/views/BuyerPortalDataView';
import BuyerAccessView from './components/views/BuyerAccessView';
import AcceptInviteView from './components/views/AcceptInviteView';
import InicioView from './components/views/InicioView';
import InventarioView from './components/views/InventarioView';
import ClientesView from './components/views/ClientesView';
import CobranzasView from './components/views/CobranzasView';
import KanbanBoard from './components/KanbanBoard';
import AnalisisView from './components/AnalisisView';
import ProjectsView from './components/views/ProjectsView';
import CategoryPieChart from './components/CategoryPieChart';
import ConfirmDialog from './components/ConfirmDialog';
import DeleteProspectDialog from './components/DeleteProspectDialog';
import DeleteLoteoDialog from './components/DeleteLoteoDialog';
import LoteoFormModal from './components/modals/LoteoFormModal';
import GroupLoteoModal from './components/modals/GroupLoteoModal';
import AddProspectModal from './components/modals/AddProspectModal';
import UpdateContactModal from './components/modals/UpdateContactModal';
import { Badge, Button, ErrorBoundary, Loader, Select, EditEntityModal } from './ui/components';
import { CAN_EDIT_ORG_ROLES } from './constants/roles';
import { API_BASE, EDITOR_URL, VISOR_URL } from './config';
import { useSync } from './hooks/useSync';
import { useActivityFeed } from './hooks/useActivityFeed';
import { useAuth } from './hooks/useAuth';
import { useToast } from './hooks/useToast';
import { useEditLotModal } from './hooks/useEditLotModal';
import { useCreateLotModal } from './hooks/useCreateLotModal';
import { useEditLoteoModal } from './hooks/useEditLoteoModal';
import { useCreateLoteoModal } from './hooks/useCreateLoteoModal';
import { useGroupLoteoModal } from './hooks/useGroupLoteoModal';
import { useAddProspectModal } from './hooks/useAddProspectModal';
import { useEditProspectModal } from './hooks/useEditProspectModal';
import { useUpdateContactModal } from './hooks/useUpdateContactModal';
import { useConfirmDialogs } from './hooks/useConfirmDialogs';
import { useInventory } from './hooks/useInventory';
import { useProspects } from './hooks/useProspects';
import { usePendingMutations } from './hooks/usePendingMutations';
import { useContracts } from './hooks/useContracts';
import ShareLoteoModal from './components/modals/ShareLoteoModal';
import { PAGE_SIZE, STATUS_DISPLAY, CATEGORY_DISPLAY, getProspectFields, getLotFields } from './constants';
import { createApiFetch } from './api';
import { createUploadFn } from './api/upload';
import UploadProgressCard from './components/UploadProgressCard';
import TopLoadingBar from './components/TopLoadingBar';
import { fetchInventoryBg as fetchInventoryBgService } from './api/lots';
import { fetchInventoryLoteos as fetchInventoryLoteosService, fetchInventoryLoteosBg as fetchInventoryLoteosBgService, deleteLoteo } from './api/loteos';
import { buildAnalisisCallbacks } from './api/reports';
import { fetchMyOrg } from './api/organizations';
import { fetchProjects } from './api/projects';
import './App.css';
import './components/Layout.css';

// Link de invitación al equipo: ?invite=<token>. Si está presente, la app
// muestra la pantalla de aceptación antes de cualquier gate de auth.
const INVITE_TOKEN = new URLSearchParams(window.location.search).get('invite');
const IS_BUYER_PORTAL = new URLSearchParams(window.location.search).get('portal') === 'buyer';
const BUYER_INVITATION_TOKEN = new URLSearchParams(window.location.search).get('buyer_invite');
const IS_BUYER_ACCESS = IS_BUYER_PORTAL && (
  Boolean(BUYER_INVITATION_TOKEN)
  || new URLSearchParams(window.location.search).get('access') === 'login'
);

const TOAST_ICONS = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
};

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
  cobranzas: {
    title: 'Cobranzas',
    subtitle: 'Seguí el avance de pagos y cuotas de cada contrato.',
  },
  analisis: {
    title: 'Análisis',
    subtitle: 'Medí la actividad comercial y detectá oportunidades con datos reales.',
  },
  proyectos: {
    title: 'Proyectos',
    subtitle: 'Agrupá loteos bajo una identidad visual compartida para el visor público.',
  },
};

// Orgs con plan `visor_only` (Fase 3 del tier de visor standalone) no ven el
// CRM completo: solo Proyectos → Loteos/Lotes + Análisis.
const HIDDEN_VIEWS_VISOR_ONLY = ['inicio', 'clientes', 'cobranzas'];

function PlatformApp() {
  // 'lote_owner' cubre tanto cuentas lote_owner como super_admin: ambas ven la
  // misma UI, super_admin elige con qué org operar desde el OrgSwitcher.
  const [view, setView] = useState('login'); // 'login' | 'lote_owner'
  const [ownerSubView, setOwnerSubView] = useState(() => {
    const stored = localStorage.getItem('owner_sub_view');
    return stored && stored !== 'configuracion' ? stored : 'inicio';
  });
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const { token, user, setUser, isInitializing, handleLogin: authLogin, logout: authLogout } = useAuth();
  const [inventoryLots, setInventoryLots] = useState([]);
  const {
    inventoryLoading,
    inventoryLoteosLoading, setInventoryLoteosLoading,
    inventoryLoteos, setInventoryLoteos,
    inventorySearch, setInventorySearch,
    inventoryLoteosSearch, setInventoryLoteosSearch,
    inventoryLoteoFilter, setInventoryLoteoFilter,
    inventoryTab, setInventoryTab,
    setInventoryLotsHasMore,
  } = useInventory();

  const {
    prospectosSearch, setProspectosSearch,
    prospectosCategoryFilter, setProspectosCategoryFilter,
    prospectosWithoutAdvisor, setProspectosWithoutAdvisor,
    advisorsList, setAdvisorsList,
    advisorsLoading,
  } = useProspects();

  const [allProspectosList, setAllProspectosList] = useState([]);
  const [highlightedProspectId, setHighlightedProspectId] = useState(null);
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
  const [org, setOrg] = useState(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const isVisorOnly = org?.plan === 'visor_only';
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  // Org que un super_admin eligió operar (no tiene membership propia). Se
  // persiste para sobrevivir reloads; la setea el OrgSwitcher del Sidebar.
  const [activeOrgId, setActiveOrgId] = useState(() => {
    try {
      return localStorage.getItem('notry_active_org_id') || null;
    } catch {
      return null;
    }
  });

  React.useEffect(() => {
    try {
      if (activeOrgId) localStorage.setItem('notry_active_org_id', activeOrgId);
      else localStorage.removeItem('notry_active_org_id');
    } catch {
      // localStorage puede no estar disponible (ej. modo privado)
    }
  }, [activeOrgId]);

  const filtersRef = React.useRef({
    inventorySearch,
    inventoryLoteosSearch,
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
      prospectosSearch,
      prospectosCategoryFilter,
      prospectosWithoutAdvisor,
      inventoryLoteos,
      inventoryLotsCount: inventoryLots.length,
      prospectosCount: allProspectosList.length,
    };
  }, [inventorySearch, inventoryLoteosSearch, prospectosSearch, prospectosCategoryFilter, prospectosWithoutAdvisor, inventoryLoteos, inventoryLots.length, allProspectosList.length]);

  // ── Toast notifications ────────────────────────────────────────────────────────
  const { toasts, addToast, removeToast } = useToast();

  // ── Activity Feed Hook (called early so addActivity is available for modal hooks) ──
  const { activities, handleRawActivities, addActivity } = useActivityFeed({});

  // Restore view when session is recovered from localStorage
  React.useEffect(() => {
    if (isInitializing || !user) return;
    if (['super_admin', 'admin', 'lote_owner'].includes(user.role)) {
      setView('lote_owner');
    }
  }, [user, isInitializing]);

  // Persist ownerSubView so it survives page reloads
  React.useEffect(() => {
    localStorage.setItem('owner_sub_view', ownerSubView);
  }, [ownerSubView]);

  // Orgs visor_only no tienen Inicio/Clientes/Cobranzas: si el usuario venía
  // de una sección ahora oculta (ej. persistida de un plan anterior), caer a Inventario.
  React.useLayoutEffect(() => {
    if (isVisorOnly && HIDDEN_VIEWS_VISOR_ONLY.includes(ownerSubView)) {
      setOwnerSubView('inventario');
    }
  }, [isVisorOnly, ownerSubView]);

  // Note: All background polling is now handled by the useSync hook above.
  // It fires immediately on login and every 60 seconds thereafter.

  // Reset filters when leaving the inventario view.
  // Filtering is derived client-side from inventoryLots via useMemo — no API call needed.
  React.useEffect(() => {
    if (ownerSubView === 'inventario') return;
    setInventorySearch('');
    setInventoryLoteoFilter('');
  }, [ownerSubView]);

  // Reset prospectos filters when leaving the clientes view.
  React.useEffect(() => {
    if (ownerSubView === 'clientes') return;
    setProspectosCategoryFilter('');
    setProspectosWithoutAdvisor(false);
  }, [ownerSubView]);

  // ── Client-side filtered data (derived from useSync cache, no extra API calls) ──
  const filteredInventoryLots = useMemo(() => {
    if (!inventorySearch && !inventoryLoteoFilter) return null;
    const q = (inventorySearch || '').toLowerCase();
    return (inventoryLots || []).filter(lot => {
      const matchSearch = !q || lot.name?.toLowerCase().includes(q);
      const matchLoteo = !inventoryLoteoFilter || String(lot.loteo_id) === String(inventoryLoteoFilter);
      return matchSearch && matchLoteo;
    });
  }, [inventoryLots, inventorySearch, inventoryLoteoFilter]);

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

  async function fetchInventoryLoteos() {
    fetchInventoryLoteosService({ apiFetch, setInventoryLoteosLoading, setInventoryLoteos });
  }

  const openDeleteProspectDialog = (prospect) => {
    confirmDialogs.openDeleteProspectDialog(prospect);
  };

  const openEditor = (loteoId) => {
    const dataUrl = `${API_BASE}/loteos/${loteoId}/visor_data`;
    // super_admin no tiene org propia — el editor la necesita para mandar
    // X-Active-Org-Id en sus propios requests (lots/pois/bulk-save), así que
    // viaja la ya elegida en el OrgSwitcher en vez de pedirla de nuevo ahí.
    const orgIdParam = (user?.role === 'super_admin' && activeOrgId) ? `&orgId=${encodeURIComponent(activeOrgId)}` : '';
    window.open(`${EDITOR_URL}/?data=${encodeURIComponent(dataUrl)}&token=${encodeURIComponent(token)}${orgIdParam}`, '_blank');

    // Refresh data when user returns from editor.
    // Reads current filter values at event time via filtersRef to avoid stale closure.
    const onFocus = () => {
      fetchInventoryLoteosBg();
      fetchInventoryBgService({ apiFetch, setInventoryLots, setInventoryLotsHasMore, PAGE_SIZE, name: filtersRef.current.inventorySearch, addToast });
      document.removeEventListener('visibilitychange', onFocus);
    };
    document.addEventListener('visibilitychange', onFocus);
  };

  // Called by external triggers (openEditor focus, saveLotFromModal, handleDeleteConfirm).
  // No internal AbortController — callers pass their own if needed.
  const fetchInventoryBg = async (name) => {
    fetchInventoryBgService({ apiFetch, setInventoryLots, setInventoryLotsHasMore, PAGE_SIZE, name, addToast });
  };

  const fetchInventoryLoteosBg = async () => {
    fetchInventoryLoteosBgService({ apiFetch, setInventoryLoteos, addToast });
  };


  // Pending-mutation registry: protects optimistic edits from being clobbered
  // by a sync that hasn't propagated the change yet (see usePendingMutations).
  const { markPending, shouldKeepLocal } = usePendingMutations();

  // Helper: Update dashboard cache based on current prospects list
  // Avoids backend call; calculates derived metrics locally
  const updateDashboardFromProspects = (prospectos) => {
    setDashboardSummary(prev => prev ? { ...prev, total_prospectos: prospectos.length } : null);
  };

  const updateProspectCategory = (prospectId, newCategory) => {
    markPending('prospectos', prospectId, { category: newCategory });
    setAllProspectosList(prev => {
      const updated = prev.map(p => p.id === prospectId ? { ...p, category: newCategory } : p);
      // Update dashboard cache locally (no API call)
      updateDashboardFromProspects(updated);
      return updated;
    });
  };

  const updateProspectLastContact = (prospectId) => {
    const now = new Date().toISOString();
    markPending('prospectos', prospectId, { last_contact: now });
    setAllProspectosList(prev =>
      prev.map(p => p.id === prospectId ? { ...p, last_contact: now } : p)
    );
  };

  const updateProspect = (prospectId, updates) => {
    markPending('prospectos', prospectId, updates);
    setAllProspectosList(prev =>
      prev.map(p => p.id === prospectId ? { ...p, ...updates } : p)
    );
  };

  const updateLot = (lotId, updates) => {
    markPending('lots', lotId, updates);
    setInventoryLots(prev =>
      prev.map(lot => lot.id === lotId ? { ...lot, ...updates } : lot)
    );
  };

  const addLoteo = (newLoteo) => {
    setInventoryLoteos(prev => [...prev, newLoteo]);
  };

  const updateLoteo = (loteoId, updates) => {
    markPending('loteos', loteoId, updates);
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

  const handleDeleteConfirm = async () => {
    await confirmDialogs.handleDeleteConfirm(fetchInventoryBg);
  };

  const openDeleteLoteoDialog = (loteo) => {
    setDeleteLoteoDialog({ open: true, loteo, loading: false });
  };

  const closeDeleteLoteoDialog = () => {
    setDeleteLoteoDialog({ open: false, loteo: null, loading: false });
  };

  const handleNavigateToProspect = (id) => {
    setProspectosSearch('');
    setProspectosCategoryFilter('');
    setHighlightedProspectId(id);
    setOwnerSubView('clientes');
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
      await deleteLoteo({ apiFetch, loteoId: loteo.id, loteoName: loteo.name, loteOwnerId: activeLoteOwnerId, addActivity });
      addToast(`Loteo "${loteo.name}" eliminado.`, 'success');
      setDeleteLoteoDialog({ open: false, loteo: null, loading: false });
      removeLoteoFromList(loteo.id);
      refreshSync();
    } catch (err) {
      addToast(err.message, 'error');
      setDeleteLoteoDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Wrapped logout for child components that call it with no arguments.
  // Defined before apiFetch so it can be passed as the logout callback.
  // Wrapped in useCallback to prevent unnecessary recreations that would cause apiFetch to be recreated.
  // The auth hook exposes stable setters, but React Compiler cannot infer that
  // contract through the wrapper. Keep this callback stable for apiFetch.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const logout = useCallback(() => authLogout({
    setView, setInventoryLots, setInventoryLotsHasMore, setInventorySearch,
    setInventoryTab, setInventoryLoteos,
    setAllProspectosList, setProspectosCategoryFilter,
    setProspectosWithoutAdvisor, setClicksCache, setVisorDataCache,
    setReportsCache, setDashboardSummary,
    setOrg, setProjects, setActiveOrgId,
  }), []);

  // Solo super_admin manda X-Active-Org-Id; el backend lo ignora para cualquier
  // otro rol, pero no lo mandamos ni así para no depender de esa garantía.
  const effectiveActiveOrgId = user?.role === 'super_admin' ? activeOrgId : null;
  // Para cualquier fetch org-scoped: un lote_owner siempre tiene contexto (su
  // propia org, vía membership); un super_admin lo tiene recién cuando eligió
  // una org en el OrgSwitcher. Sin esto, dispararíamos requests que el backend
  // rechaza con 400 (falta X-Active-Org-Id) antes de que elija una.
  // Requires `user` (not just token): both on reload (token read from localStorage
  // synchronously, user resolved later via async /users/me) and on fresh login
  // (setToken then, after an awaited fetch, setUser) there's a render where token
  // is set but user is still null. `user?.role !== 'super_admin'` reads as true in
  // that gap regardless of the real role, wrongly allowing org-scoped requests
  // before we actually know the role/org.
  const hasUsableOrgContext = Boolean(token && user && (user.role !== 'super_admin' || effectiveActiveOrgId));
  // Para lote_owner, user.lote_owner_id (fijo, seteado al login) y org.lote_owner_id
  // (de la org activa) son el mismo valor. Para super_admin, user.lote_owner_id es
  // siempre null (no está atado a ninguna org por relación) — org.lote_owner_id es
  // el único valor válido, y depende de qué org eligió en el OrgSwitcher.
  const activeLoteOwnerId = org?.lote_owner_id ?? user?.lote_owner_id;

  // apiFetch uses logout (no-arg) as the 401 handler
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const apiFetch = useMemo(
    () => createApiFetch(token, logout, effectiveActiveOrgId),
    [token, logout, effectiveActiveOrgId]
  );

  React.useEffect(() => {
    if (ownerSubView !== 'inventario' || inventoryTab !== 'loteos' || !hasUsableOrgContext) return;
    if (inventoryLoteos.length === 0) fetchInventoryLoteos();
  }, [ownerSubView, inventoryTab, hasUsableOrgContext, inventoryLoteos.length]);

  React.useEffect(() => {
    if (ownerSubView !== 'proyectos' || !hasUsableOrgContext) return;
    if (inventoryLoteos.length === 0) fetchInventoryLoteos();
  }, [ownerSubView, hasUsableOrgContext, inventoryLoteos.length]);

  // uploadFn: XHR-based upload with WebP conversion + progress events
  const uploadFn = useMemo(() => createUploadFn(token, logout), [token, logout]);

  // Cobranzas follows the same shared prefetch pattern as org and projects:
  // load once after login, keep the cache above the routed view, and refresh
  // quietly after financial writes.
  const contractsState = useContracts({
    apiFetch,
    addToast,
    enabled: hasUsableOrgContext,
  });

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
      // No immediate refetch: optimistic updateLot + next sync (reconciled, with
      // in-flight protection) cover it without a stale-overwrite revert.
      addToast('Lote actualizado.', 'success');
    },
    onUpdateLot: updateLot,
    loteOwnerId: activeLoteOwnerId,
    addActivity,
  });

  // ── Create Lot Modal ─────────────────────────────────────────────────────────
  const createLotModal = useCreateLotModal({
    apiFetch,
    onSuccess: () => {
      addToast('Lote creado.', 'success');
      fetchInventoryBg(inventorySearch);
    },
    onAddLot: addLot,
    loteOwnerId: activeLoteOwnerId,
    addActivity,
  });

  // ── Create Loteo Modal ─────────────────────────────────────────────────────
  const createLoteoModal = useCreateLoteoModal({
    apiFetch,
    onSuccess: () => {
      addToast('Loteo creado.', 'success');
      fetchInventoryLoteosBg();
    },
    onAddLoteo: addLoteo,
    loteOwnerId: activeLoteOwnerId,
    addActivity,
    existingLoteos: inventoryLoteos,
  });

  // ── Edit Loteo Modal ──────────────────────────────────────────────────────────
  const editLoteoModal = useEditLoteoModal({
    apiFetch,
    setInventoryLoteos,
    addToast,
    // No onSuccess/refetch: saveEditLoteo handles the toast + optimistic update;
    // the next sync (reconciled) confirms it.
    addActivity,
    onUpdateLoteo: updateLoteo,
    loteOwnerId: activeLoteOwnerId,
  });

  // Callbacks passed to AnalisisView so it can request data through the shared cache
  const { handleAnalisisRequestClicks, handleAnalisisRequestVisorData } = buildAnalisisCallbacks({ apiFetch, setClicksCache, setVisorDataCache, setClicksLoadingIds, setVisorDataLoadingIds });

  // ── Combined sync hook (must be after apiFetch and addToast) ─────────────────
  const { syncLoading, syncError, refresh: refreshSync, clearSyncError } = useSync(token, apiFetch, {
    setInventoryLots,
    setInventoryLoteos,
    setAllProspectosList,
    setDashboardSummary,
    setClicksCache,
    setVisorDataCache,
    setReportsCache,
    setRawActivities: handleRawActivities,
    shouldKeepLocal,
  }, addToast, hasUsableOrgContext);

  // Pre-fetch org (configuracion) and projects on login, in parallel with /sync.
  // Not added to the sync endpoint because:
  //   - org is scoped to the user's organization, not to lote_owner_ids (the sync's scope model)
  //   - both datasets change rarely; two extra parallel requests at login are negligible
  // See discussion 2026-06-18 — "Option B" over extending /sync
  useEffect(() => {
    if (!hasUsableOrgContext) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrgLoading(true);
    fetchMyOrg({ apiFetch })
      .then(setOrg)
      .catch(() => addToast('No se pudo cargar la organización', 'error'))
      .finally(() => setOrgLoading(false));
    // effectiveActiveOrgId (not just hasUsableOrgContext) so switching between
    // two already-selected orgs refetches too, not just the first selection.
  }, [hasUsableOrgContext, effectiveActiveOrgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasUsableOrgContext) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjectsLoading(true);
    fetchProjects({ apiFetch })
      .then(setProjects)
      .catch(() => addToast('No se pudieron cargar los proyectos', 'error'))
      .finally(() => setProjectsLoading(false));
  }, [hasUsableOrgContext, effectiveActiveOrgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // True while org/proyectos/sync/cobranzas están recargando para la org activa:
  // cubre tanto la carga inicial post-login como el cambio de org de un
  // super_admin en el OrgSwitcher (effectiveActiveOrgId dispara los 4 fetches).
  const isOrgDataLoading = hasUsableOrgContext
    && (orgLoading || projectsLoading || syncLoading || contractsState.loading);

  // ── Group Loteo Modal ─────────────────────────────────────────────────────────
  const groupLoteoModal = useGroupLoteoModal({
    apiFetch,
    addToast,
    onUpdateLoteo: updateLoteo,
    refreshSync,
  });

  // ── Add Prospect Modal ────────────────────────────────────────────────────────
  const addProspectModal = useAddProspectModal({
    apiFetch,
    onSuccess: refreshSync,
    addToast,
    onAddProspect: addProspect,
    loteOwnerId: activeLoteOwnerId,
    addActivity,
  });

  // ── Edit Prospect Modal ──────────────────────────────────────────────────────
  const editProspectModal = useEditProspectModal({
    apiFetch,
    advisorsList,
    setAdvisorsList,
    addToast,
    onSuccess: refreshSync,
    onUpdateProspect: updateProspect,
    onUpdateLastContact: updateProspectLastContact,
    loteOwnerId: activeLoteOwnerId,
    addActivity,
  });

  const openBuyerEmailEditor = (prospect) => {
    if (!prospect?.id) return;
    setProspectosSearch('');
    setProspectosCategoryFilter('');
    setHighlightedProspectId(prospect.id);
    setOwnerSubView('clientes');
    editProspectModal.openEditProspectModal(prospect);
  };

  const updateContactModal = useUpdateContactModal({
    apiFetch,
    addToast,
    onSuccess: refreshSync,
    loteOwnerId: activeLoteOwnerId,
    addActivity,
  });

  // ── Confirm Dialogs ─────────────────────────────────────────────────────────
  const confirmDialogs = useConfirmDialogs({
    apiFetch,
    addToast,
    onSuccess: refreshSync,
    onRemoveProspect: removeProspect,
    loteOwnerId: activeLoteOwnerId,
    addActivity,
  });

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

  if (INVITE_TOKEN) {
    return <AcceptInviteView token={INVITE_TOKEN} />;
  }

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
    <div className={`dashboard-container with-sidebar${isOrgDataLoading ? ' dashboard-container--org-loading' : ''}`}>
      <TopLoadingBar visible={isOrgDataLoading} />
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
        onOpenAccount={() => { setAccountModalOpen(true); setSidebarOpen(false); }}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(v => !v)}
        apiFetch={apiFetch}
        activeOrgId={activeOrgId}
        onChangeOrg={setActiveOrgId}
        isVisorOnly={isVisorOnly}
      />

      <main className="dashboard-content">
          <div className={`owner-layout${ownerSubView === 'inicio' || ownerSubView === 'inventario' || ownerSubView === 'clientes' || ownerSubView === 'analisis' || ownerSubView === 'proyectos' ? ' owner-layout--shell' : ''}${ownerSubView === 'inicio' ? ' owner-layout--inicio' : ''}`}>
            <div key={ownerSubView} className="view-content">
              {ownerSubView !== 'inicio' && ownerSubView !== 'inventario' && ownerSubView !== 'clientes' && ownerSubView !== 'cobranzas' && ownerSubView !== 'analisis' && ownerSubView !== 'proyectos' && (
                <header className="owner-header owner-header--compact">
                  <h1 className="view-title">{ownerViewHeader.title}</h1>
                  <h2>{ownerViewSubtitle}</h2>
                </header>
              )}

              {ownerSubView === 'inicio' && (
                <InicioView
                  dashboardSummary={dashboardSummary}
                  allProspectosList={allProspectosList}
                  inventoryLoteos={inventoryLoteos}
                  inventoryLots={inventoryLots}
                  advisorsList={advisorsList}
                  onUpdateProspectCategory={updateProspectCategory}
                  activities={activities}
                  apiFetch={apiFetch}
                  loteOwnerId={activeLoteOwnerId}
                  addActivity={addActivity}
                />
              )}

              {ownerSubView === 'inventario' && (
                <InventarioView
                  dashboardSummary={dashboardSummary}
                  activities={activities}
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
                  inventoryLoteoFilter={inventoryLoteoFilter}
                  onLoteoFilterChange={setInventoryLoteoFilter}
                  syncLoading={syncLoading}
                  onOpenEditLotModal={editLotModal.openEditLotModal}
                  onOpenDeleteConfirm={confirmDialogs.openDeleteConfirm}
                  onOpenCreateLotModal={createLotModal.openCreateLotModal}
                  onOpenCreateLoteoModal={createLoteoModal.openCreateLoteoModal}
                  onOpenEditLoteoModal={editLoteoModal.openEditLoteoModal}
                  onOpenDeleteLoteoDialog={openDeleteLoteoDialog}
                  onGroupLoteo={groupLoteoModal.openGroupModal}
                  onOpenEditor={openEditor}
                  safeOpen={safeOpen}
                  onOpenShareLoteo={handleOpenShareLoteo}
                  allProspectosList={allProspectosList}
                  onNavigateToProspect={handleNavigateToProspect}
                  contractsState={contractsState}
                />
              )}

              {ownerSubView === 'clientes' && (
                <ClientesView
                  allProspectosList={allProspectosList}
                  filteredProspectos={filteredProspectos}
                  prospectosSearch={prospectosSearch}
                  onSearchChange={setProspectosSearch}
                  prospectosCategoryFilter={prospectosCategoryFilter}
                  onCategoryChange={setProspectosCategoryFilter}
                  prospectosWithoutAdvisor={prospectosWithoutAdvisor}
                  onWithoutAdvisorChange={setProspectosWithoutAdvisor}
                  onOpenAddProspect={addProspectModal.openAddProspectModal}
                  onEditProspect={editProspectModal.openEditProspectModal}
                  onDeleteProspect={openDeleteProspectDialog}
                  onUpdateContact={updateContactModal.openUpdateContactModal}
                  highlightedProspectId={highlightedProspectId}
                  activities={activities}
                />
              )}

              {ownerSubView === 'cobranzas' && (
                <ErrorBoundary label="Error en la vista de cobranzas">
                  <CobranzasView
                    apiFetch={apiFetch}
                    inventoryLots={inventoryLots}
                    allProspectosList={allProspectosList}
                    advisorsList={advisorsList}
                    contractsState={contractsState}
                    onAddBuyerEmail={openBuyerEmailEditor}
                    org={org}
                    orgLoading={orgLoading}
                    setOrg={setOrg}
                    canEditCementRate={CAN_EDIT_ORG_ROLES.includes(user?.org_role)}
                  />
                </ErrorBoundary>
              )}

              {ownerSubView === 'analisis' && (
                <ErrorBoundary label="Error en la vista de análisis">
                  <AnalisisView
                    apiFetch={apiFetch}
                    token={token}
                    hasUsableOrgContext={hasUsableOrgContext}
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

              {ownerSubView === 'proyectos' && (
                <ProjectsView
                  apiFetch={apiFetch}
                  uploadFn={uploadFn}
                  onUploadEvent={handleUploadEvent}
                  allLoteos={inventoryLoteos}
                  addToast={addToast}
                  projects={projects}
                  projectsLoading={projectsLoading}
                  setProjects={setProjects}
                  isVisorOnly={isVisorOnly}
                />
              )}

              {ownerSubView !== 'inventario' && ownerSubView !== 'clientes' && ownerSubView !== 'cobranzas' && ownerSubView !== 'analisis' && ownerSubView !== 'inicio' && ownerSubView !== 'proyectos' && (
                <div className="owner-panel">
                  <p>Tu dashboard de {ownerSubView} está siendo preparado.</p>
                </div>
              )}
            </div>
          </div>
      </main>

      <AccountModal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        user={user}
        setUser={setUser}
        apiFetch={apiFetch}
        addToast={addToast}
        org={org}
        orgLoading={orgLoading}
        setOrg={setOrg}
        onLogout={logout}
      />

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

      {groupLoteoModal.groupModalOpen && (
        <GroupLoteoModal
          isOpen={groupLoteoModal.groupModalOpen}
          onClose={groupLoteoModal.closeGroupModal}
          loteo={groupLoteoModal.groupLoteo}
          loteos={inventoryLoteos}
          onSubmit={groupLoteoModal.submitGroup}
          onUngroup={groupLoteoModal.ungroup}
          loading={groupLoteoModal.groupLoading}
          error={groupLoteoModal.groupError}
        />
      )}

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
        addToast={addToast}
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
            onClick={clearSyncError}
          >
            <CircleAlert aria-hidden="true" />
            <span>Error de sincronización: {syncError}</span>
          </div>
        )}
        {toasts.map(toast => {
          const type = toast.type ?? 'success';
          const ToastIcon = TOAST_ICONS[type] ?? TOAST_ICONS.info;
          return (
            <div
              key={toast.id}
              className={`toast toast--${type}`}
              onClick={() => removeToast(toast.id)}
            >
              <ToastIcon aria-hidden="true" />
              <span>{toast.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function App() {
  if (IS_BUYER_ACCESS) return <BuyerAccessView invitationToken={BUYER_INVITATION_TOKEN} />;
  if (IS_BUYER_PORTAL) return <BuyerPortalDataView />;
  return <PlatformApp />;
}

export default App;
