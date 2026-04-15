import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Copy, Search, SlidersHorizontal, Pencil, Trash2, Check, X, AlertCircle, Menu, Eye } from 'lucide-react';
import Sidebar from './components/Sidebar';
import StatCard from './components/StatCard';
import LoginBackground from './components/LoginBackground';
import KanbanBoard from './components/KanbanBoard';
import AnalisisView from './components/AnalisisView';
import CategoryPieChart from './components/CategoryPieChart';
import BudgetPieChart from './components/BudgetPieChart';
import { Badge, Button, Loader, Select, EditEntityModal } from './ui/components';
import { API_BASE, EDITOR_URL, VISOR_URL } from './config';
import './App.css';

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

const getProspectFields = (advisorsList, advisorsLoading) => [
  { name: 'name', label: 'Nombre', required: true },
  {
    type: 'group',
    fields: [
      { name: 'email', label: 'Correo electrónico', type: 'email', placeholder: 'ej: usuario@correo.com' },
      { name: 'phone', label: 'Teléfono', type: 'tel', placeholder: 'ej: +52 55 1234 5678' },
    ],
  },
  {
    type: 'group',
    fields: [
      {
        name: 'category',
        label: 'Categoría',
        type: 'select',
        options: [
          { value: 'primer_contacto', label: 'Primer Contacto' },
          { value: 'seguimiento', label: 'Seguimiento' },
          { value: 'negociacion', label: 'Negociación' },
          { value: 'vendido', label: 'Vendido' },
        ],
      },
      {
        name: 'budget',
        label: 'Presupuesto',
        type: 'number',
        step: '0.01',
        placeholder: 'Ej: 150000',
      },
    ],
  },
  {
    type: 'group',
    fields: [
      {
        name: 'payment_method',
        label: 'Forma de pago',
        type: 'select',
        options: [
          { value: 'contado', label: 'Contado' },
          { value: 'credito', label: 'Crédito' },
        ],
      },
      {
        name: 'advisor_id',
        label: 'Asesor',
        type: 'select',
        disabled: advisorsLoading,
        options: [
          { value: '', label: 'Sin asignar' },
          ...advisorsList.map(a => ({ value: a.id, label: a.full_name })),
        ],
      },
    ],
  },
];

const getLotFields = () => [
  {
    type: 'group',
    fields: [
      {
        name: 'area_m2',
        label: 'Área (m²)',
        type: 'number',
        step: '0.01',
        placeholder: 'Ej: 500',
      },
      {
        name: 'price',
        label: 'Precio',
        type: 'number',
        step: '0.01',
        placeholder: 'Ej: 100000',
      },
    ],
  },
  {
    name: 'status',
    label: 'Estado',
    type: 'select',
    options: [
      { value: 'available', label: 'Disponible' },
      { value: 'reserved', label: 'Reservado' },
      { value: 'sold', label: 'Vendido' },
    ],
  },
];

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
  const [editLotModalOpen, setEditLotModalOpen] = useState(false);
  const [editingLotId, setEditingLotId] = useState(null);
  const [editLotForm, setEditLotForm] = useState({ status: '', price: '', area_m2: '' });
  const [editLotLoading, setEditLotLoading] = useState(false);
  const [editLotError, setEditLotError] = useState(null);
  const [editLotClosing, setEditLotClosing] = useState(false);
  const [editProspectClosing, setEditProspectClosing] = useState(false);
  const [prospectosList, setProspectosList] = useState([]);
  const [allProspectosList, setAllProspectosList] = useState([]);
  const [prospectosLoading, setProspectosLoading] = useState(false);
  const [prospectosCategoryFilter, setProspectosCategoryFilter] = useState('');
  const [prospectosWithoutAdvisor, setProspectosWithoutAdvisor] = useState(false);
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
  const [advisorsList, setAdvisorsList] = useState([]);
  const [advisorsLoading, setAdvisorsLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [bgLoadingLots, setBgLoadingLots] = useState(false);
  const [bgLoadingLoteos, setBgLoadingLoteos] = useState(false);
  const [bgLoadingProspectos, setBgLoadingProspectos] = useState(false);
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
    inventoryLoteos
  });

  // Focus management refs for modals
  const createLoteoButtonRef = useRef(null);
  const previousCreateLoteoFocusRef = useRef(null);
  const addProspectButtonRef = useRef(null);
  const previousAddProspectFocusRef = useRef(null);
  const deleteProspectButtonRef = useRef(null);
  const previousDeleteProspectFocusRef = useRef(null);
  const createLoteoModalRef = useRef(null);
  const editLoteoModalRef = useRef(null);
  const addProspectModalRef = useRef(null);
  const deleteProspectModalRef = useRef(null);

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
    previousDeleteProspectFocusRef.current = document.activeElement;
    setDeleteProspectDialog({ open: true, prospect, loading: false });
  };

  React.useEffect(() => {
    filtersRef.current = {
      inventorySearch,
      inventoryStatusFilter,
      prospectosCategoryFilter,
      prospectosWithoutAdvisor,
      inventoryLoteos
    };
  });

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

  // Focus management for deleteProspect modal
  useEffect(() => {
    if (deleteProspectDialog.open && deleteProspectModalRef.current) {
      const focusableElements = deleteProspectModalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    } else if (!deleteProspectDialog.open && previousDeleteProspectFocusRef.current) {
      previousDeleteProspectFocusRef.current.focus();
    }
  }, [deleteProspectDialog.open]);

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

  // Initial fetch for clicks and visor data
  React.useEffect(() => {
    if (view === 'lote_owner' && inventoryLoteos.length > 0) {
      if (Object.keys(clicksCache).length === 0) fetchClicksForAllLoteos(inventoryLoteos);
      if (Object.keys(visorDataCache).length === 0) fetchVisorDataForAllLoteos(inventoryLoteos);
    }
  }, [inventoryLoteos, view]);

  // Background polling for lote_owner
  React.useEffect(() => {
    if (!token || view !== 'lote_owner') return;

    // Initial prefetch if not already loaded
    if (inventoryLots.length === 0) {
      fetchInventoryBg(filtersRef.current.inventorySearch, filtersRef.current.inventoryStatusFilter);
    }
    if (inventoryLoteos.length === 0) {
      fetchInventoryLoteosBg();
    }
    if (prospectosList.length === 0) {
      fetchProspectosBg(filtersRef.current.prospectosCategoryFilter, filtersRef.current.prospectosWithoutAdvisor);
    }
    if (allProspectosList.length === 0) {
      fetchAllProspectos();
    }
    // Prefetch reports for all time options so switching is instant
    const TIME_OPTIONS = [1, 5, 10, 20, 30, 60];
    TIME_OPTIONS.forEach(days => {
      if (!reportsCache[days]) {
        fetchReportsBg(days);
      }
    });

    // Set up polling intervals
    const lotsInterval = setInterval(() => {
      fetchInventoryBg(filtersRef.current.inventorySearch, filtersRef.current.inventoryStatusFilter);
    }, 15000); // 15s

    const loteosInterval = setInterval(() => {
      fetchInventoryLoteosBg();
    }, 30000); // 30s

    const prospectosInterval = setInterval(() => {
      fetchProspectosBg(filtersRef.current.prospectosCategoryFilter, filtersRef.current.prospectosWithoutAdvisor);
    }, 30000); // 30s

    const allProspectosInterval = setInterval(() => {
      fetchAllProspectos();
    }, 30000); // 30s

    const dashboardInterval = setInterval(() => {
      fetchDashboardSummary(token);
    }, 30000); // 30s

    const clicksInterval = setInterval(() => {
      const currentLoteos = filtersRef.current.inventoryLoteos;
      if (currentLoteos.length > 0) {
        fetchClicksForAllLoteos(currentLoteos);
      }
    }, 30000); // 30s

    const visorDataInterval = setInterval(() => {
      const currentLoteos = filtersRef.current.inventoryLoteos;
      if (currentLoteos.length > 0) {
        fetchVisorDataForAllLoteos(currentLoteos);
      }
    }, 300000); // 5 minutes

    const reportsInterval = setInterval(() => {
      TIME_OPTIONS.forEach(days => fetchReportsBg(days));
    }, 30000); // 30s

    return () => {
      clearInterval(lotsInterval);
      clearInterval(loteosInterval);
      clearInterval(prospectosInterval);
      clearInterval(allProspectosInterval);
      clearInterval(dashboardInterval);
      clearInterval(clicksInterval);
      clearInterval(visorDataInterval);
      clearInterval(reportsInterval);
    };
  }, [token, view, analisisLastDays]);

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

  // Debounced fetch for clientes — delegates to background fetch
  React.useEffect(() => {
    if (ownerSubView !== 'clientes' || !token) return;
    const timer = setTimeout(() => {
      fetchProspectosBg(prospectosCategoryFilter, prospectosWithoutAdvisor);
      fetchAllProspectos();
    }, 300);
    return () => clearTimeout(timer);
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
      if (!loginRes.ok) {
        let message;
        if (loginRes.status === 401) {
          message = 'Credenciales inválidas. Verificá tu email y contraseña.';
        } else if (loginRes.status === 400 && loginData.detail?.toLowerCase().includes('inactive')) {
          message = 'Tu cuenta está inactiva. Contactá al administrador para habilitarla.';
        } else {
          message = loginData.detail || 'Error al iniciar sesión. Intentá de nuevo.';
        }
        throw new Error(message);
      }

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
        fetchDashboardSummary(accessToken);
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
          blueprint_url: createLoteoForm.blueprint_url,
          text_annotations: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al crear loteo');
      setCreateLoteoOpen(false);
      setCreateLoteoForm({ name: '', slug: '', image_url: '', blueprint_url: '' });
      setInventoryLoteos([]);
      fetchInventoryLoteos();
    } catch (error) {
      setCreateLoteoError(error.message);
    } finally {
      setCreateLoteoLoading(false);
    }
  };

  const saveEditLoteo = async (e) => {
    e.preventDefault();
    setEditLoteoLoading(true);
    setEditLoteoError(null);
    try {
      const res = await apiFetch(`${API_BASE}/loteos/${editingLoteoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editLoteoForm.name,
          slug: editLoteoForm.slug,
          image_url: editLoteoForm.image_url,
          blueprint_url: editLoteoForm.blueprint_url,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al actualizar loteo');
      addToast('Loteo actualizado.');
      setEditLoteoClosing(true);
      setTimeout(() => {
        setEditLoteoOpen(false);
        setEditLoteoClosing(false);
        setEditingLoteoId(null);
        setInventoryLoteos([]);
        fetchInventoryLoteos();
      }, 200);
    } catch (error) {
      setEditLoteoError(error.message);
    } finally {
      setEditLoteoLoading(false);
    }
  };

  const createProspect = async (e) => {
    e.preventDefault();
    setAddProspectLoading(true);
    setAddProspectError(null);
    const body = {
      name: addProspectForm.name,
      category: addProspectForm.category,
    };
    if (addProspectForm.email) body.email = addProspectForm.email;
    if (addProspectForm.phone) body.phone = addProspectForm.phone;
    if (addProspectForm.budget) body.budget = parseFloat(addProspectForm.budget);
    if (addProspectForm.payment_method) body.payment_method = addProspectForm.payment_method;
    try {
      const res = await apiFetch(`${API_BASE}/prospects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al crear prospecto');
      setAddProspectOpen(false);
      setAddProspectForm({ name: '', email: '', phone: '', category: 'primer_contacto', budget: '', payment_method: 'contado' });
      fetchProspectosBg(prospectosCategoryFilter, prospectosWithoutAdvisor);
      fetchAllProspectos();
    } catch (error) {
      setAddProspectError(error.message);
    } finally {
      setAddProspectLoading(false);
    }
  };

  const fetchAdvisors = async () => {
    setAdvisorsLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/advisors`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al cargar asesores');
      setAdvisorsList(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    } finally {
      setAdvisorsLoading(false);
    }
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
    setEditProspectLoading(true);
    setEditProspectError(null);
    const body = { name: editProspectForm.name, category: editProspectForm.category };
    if (editProspectForm.email) body.email = editProspectForm.email;
    else body.email = null;
    if (editProspectForm.phone) body.phone = editProspectForm.phone;
    else body.phone = null;
    if (editProspectForm.budget !== '') body.budget = parseFloat(editProspectForm.budget);
    else body.budget = null;
    if (editProspectForm.payment_method) body.payment_method = editProspectForm.payment_method;
    if (editProspectForm.advisor_id) body.advisor_id = editProspectForm.advisor_id;
    else body.advisor_id = null;
    try {
      const res = await apiFetch(`${API_BASE}/prospects/${editingProspectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al actualizar prospecto');
      addToast('Prospecto actualizado.');
      setEditProspectClosing(true);
      setTimeout(() => {
        setEditProspectModalOpen(false);
        setEditProspectClosing(false);
        setEditingProspectId(null);
        fetchProspectosBg(prospectosCategoryFilter, prospectosWithoutAdvisor);
        fetchAllProspectos();
      }, 200);
    } catch (error) {
      setEditProspectError(error.message);
    } finally {
      setEditProspectLoading(false);
    }
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
    setUpdatingContact(true);
    try {
      const res = await apiFetch(`${API_BASE}/prospects/${prospectId}/last-contact`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al actualizar contacto');
      addToast('Último contacto actualizado.');
      fetchProspectosBg(prospectosCategoryFilter, prospectosWithoutAdvisor);
      fetchAllProspectos();
    } catch (error) {
      addToast(`Error: ${error.message}`);
    } finally {
      setUpdatingContact(false);
    }
  };

  const openDeleteProspectDialog = (prospect) => {
    setDeleteProspectDialog({ open: true, prospect, loading: false });
  };

  const handleDeleteProspectConfirm = async () => {
    const prospect = deleteProspectDialog.prospect;
    if (!prospect) return;
    setDeleteProspectDialog(prev => ({ ...prev, loading: true }));
    try {
      const res = await apiFetch(`${API_BASE}/prospects/${prospect.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Error al eliminar prospecto');
      }
      addToast(`Prospecto "${prospect.name}" eliminado.`);
      setDeleteProspectDialog({ open: false, prospect: null, loading: false });
      fetchProspectosBg(prospectosCategoryFilter, prospectosWithoutAdvisor);
      fetchAllProspectos();
    } catch (err) {
      addToast(`Error: ${err.message}`);
      setDeleteProspectDialog(prev => ({ ...prev, loading: false }));
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

  const fetchAllProspectos = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/prospects?limit=50&offset=0`);
      const data = await res.json();
      if (!res.ok) throw new Error('Error al cargar prospectos');
      setAllProspectosList(data.items);
    } catch (error) {
      console.error(error);
    }
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
    const body = {};
    body.status = editLotForm.status;
    if (editLotForm.price !== '') body.price = parseFloat(editLotForm.price);
    else body.price = null;
    if (editLotForm.area_m2 !== '') body.area_m2 = parseFloat(editLotForm.area_m2);
    else body.area_m2 = null;
    try {
      const res = await apiFetch(`${API_BASE}/lots/${editingLotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Error al actualizar lote');
      }
      addToast('Lote actualizado.');
      closeEditLotModal();
      fetchInventoryBg(inventorySearch, inventoryStatusFilter);
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

  const fetchDashboardSummary = async (authToken) => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/summary`, {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (res.status === 401) {
        logout();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al cargar resumen');
      setDashboardSummary(data);
    } catch (error) {
      console.error(error);
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

  const fetchReportsBg = async (days) => {
    if (!token) return;
    try {
      const [genRes, finRes] = await Promise.all([
        apiFetch(`${API_BASE}/reports/general?last_days=${days}`),
        apiFetch(`${API_BASE}/reports/finances?last_days=${days}`),
      ]);

      if (genRes.status === 401 || finRes.status === 401) {
        logout();
        return;
      }

      const [genData, finData] = await Promise.all([genRes.json(), finRes.json()]);

      setReportsCache(prev => ({
        ...prev,
        [days]: {
          prospectos: genData.prospectos_en_periodo ?? 0,
          ventas: finData.ventas_en_periodo ?? 0,
          lotesVendidos: finData.cantidad_vendidos_en_periodo ?? 0,
        },
      }));
    } catch (error) {
      console.error(error);
    }
  };

  // Callbacks passed to AnalisisView so it can request data through the shared cache
  const handleAnalisisRequestClicks = useCallback((loteoId, signal) => {
    fetch(`${API_BASE}/loteos/${loteoId}/clicks`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
      signal,
    })
      .then(res => res.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        setClicksCache(prev => ({
          ...prev,
          [loteoId]: [...data].sort((a, b) => b.clicks - a.clicks),
        }));
      })
      .catch(err => { if (err.name !== 'AbortError') console.error(err); });
  }, [token]);

  const handleAnalisisRequestVisorData = useCallback((loteoId, signal) => {
    fetch(`${API_BASE}/loteos/${loteoId}/visor_data`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
      signal,
    })
      .then(res => res.json())
      .then(data => {
        if (data.blueprintUrl || data.annotations) {
          setVisorDataCache(prev => ({ ...prev, [loteoId]: data }));
        }
      })
      .catch(err => { if (err.name !== 'AbortError') console.error(err); });
  }, [token]);

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
    setAllProspectosList([]);
    setProspectosCategoryFilter('');
    setProspectosWithoutAdvisor(false);
    setToasts([]);
    setBgLoadingLots(false);
    setBgLoadingLoteos(false);
    setBgLoadingProspectos(false);
    setClicksCache({});
    setVisorDataCache({});
    setReportsCache({});
    setDashboardSummary(null);
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
                  <KanbanBoard token={token} onSessionExpired={logout} prospectosList={prospectosList} loteos={inventoryLoteos} advisorsList={advisorsList} />
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
                            <Select
                              id="inventory-area-filter"
                              disabled={true}
                              value=""
                              onChange={() => {}}
                              options={[
                                { value: '', label: 'Área: Todas' },
                                { value: '0-200', label: 'Menor a 200 m²' },
                                { value: '200-500', label: '200 – 500 m²' },
                                { value: '500+', label: 'Mayor a 500 m²' },
                              ]}
                            />
                          </div>
                          <div className="loader-container small">
                            {(inventoryLoading || bgLoadingLots) && <Loader size="sm" />}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="inventory-search" />
                          <div className="inventory-filters">
                            <Select
                              id="loteos-status-filter"
                              disabled={true}
                              value=""
                              onChange={() => {}}
                              options={[
                                { value: '', label: 'Estado: Todos' },
                              ]}
                            />
                            <Select
                              id="loteos-area-filter"
                              disabled={true}
                              value=""
                              onChange={() => {}}
                              options={[
                                { value: '', label: 'Área: Todas' },
                              ]}
                            />
                          </div>
                          <div className="loader-container small">
                            {bgLoadingLoteos && <Loader size="sm" />}
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
                                <th>Nombre</th>
                                <th>Imagen</th>
                                <th>Blueprint</th>
                                <th>Acciones</th>
                                <th>Links</th>
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
                                          onClick={() => window.open(loteo.image_url, '_blank')}
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
                                          onClick={() => window.open(loteo.blueprint_url, '_blank')}
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
                                          onClick={() => window.open(`https://notry-visor.vercel.app/?data=${API_BASE}/loteos/${loteo.id}/visor_data`, '_blank')}
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
                  </div>
                </>
              )}

              {ownerSubView === 'clientes' && (
                <>
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
                    {(prospectosLoading || bgLoadingProspectos) && (
                      <Loader size="sm" />
                    )}
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
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prospectosList.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="td-empty-row">No se encontraron prospectos.</td>
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
                  </div>
                </div>
                </>
              )}

              {ownerSubView === 'analisis' && (
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
          <div
            ref={createLoteoModalRef}
            className="modal-card"
            onClick={e => e.stopPropagation()}
            aria-modal="true"
            role="dialog"
          >
            <h3 className="modal-title">Nuevo Loteo</h3>
            <form onSubmit={createLoteo}>
              <div className="form-group">
                <label htmlFor="loteo-name">Nombre</label>
                <input
                  id="loteo-name"
                  type="text"
                  required
                  value={createLoteoForm.name}
                  onChange={e => setCreateLoteoForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="loteo-slug">Slug</label>
                <input
                  id="loteo-slug"
                  type="text"
                  required
                  value={createLoteoForm.slug}
                  onChange={e => setCreateLoteoForm(f => ({ ...f, slug: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="loteo-image-url">URL de Imagen</label>
                <input
                  id="loteo-image-url"
                  type="text"
                  value={createLoteoForm.image_url}
                  onChange={e => setCreateLoteoForm(f => ({ ...f, image_url: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="loteo-blueprint-url">URL de Blueprint</label>
                <input
                  id="loteo-blueprint-url"
                  type="text"
                  value={createLoteoForm.blueprint_url}
                  onChange={e => setCreateLoteoForm(f => ({ ...f, blueprint_url: e.target.value }))}
                />
              </div>
              {createLoteoError && <div className="status-message error">{createLoteoError}</div>}
              <div className="modal-footer">
                <Button variant="outline" size="sm" onClick={() => setCreateLoteoOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" loading={createLoteoLoading}>
                  {createLoteoLoading ? <Loader size="sm" /> : 'Crear'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editLoteoOpen && (
        <div className="modal-overlay" onClick={closeEditLoteoModal}>
          <div
            ref={editLoteoModalRef}
            className="modal-card"
            onClick={e => e.stopPropagation()}
            aria-modal="true"
            role="dialog"
          >
            <h3 className="modal-title">Editar Loteo</h3>
            <form onSubmit={saveEditLoteo}>
              <div className="form-group">
                <label htmlFor="edit-loteo-name">Nombre</label>
                <input
                  id="edit-loteo-name"
                  type="text"
                  required
                  value={editLoteoForm.name}
                  onChange={e => setEditLoteoForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-loteo-slug">Slug</label>
                <input
                  id="edit-loteo-slug"
                  type="text"
                  required
                  value={editLoteoForm.slug}
                  onChange={e => setEditLoteoForm(f => ({ ...f, slug: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-loteo-image-url">URL de Imagen</label>
                <input
                  id="edit-loteo-image-url"
                  type="text"
                  value={editLoteoForm.image_url}
                  onChange={e => setEditLoteoForm(f => ({ ...f, image_url: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-loteo-blueprint-url">URL de Blueprint</label>
                <input
                  id="edit-loteo-blueprint-url"
                  type="text"
                  value={editLoteoForm.blueprint_url}
                  onChange={e => setEditLoteoForm(f => ({ ...f, blueprint_url: e.target.value }))}
                />
              </div>
              {editLoteoError && <div className="status-message error">{editLoteoError}</div>}
              <div className="modal-footer">
                <Button type="button" variant="outline" size="sm" onClick={closeEditLoteoModal} disabled={editLoteoLoading}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" loading={editLoteoLoading}>
                  {editLoteoLoading ? <Loader size="sm" /> : 'Guardar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addProspectOpen && (
        <div className="modal-overlay" onClick={() => setAddProspectOpen(false)}>
          <div
            ref={addProspectModalRef}
            className="modal-card"
            onClick={e => e.stopPropagation()}
            aria-modal="true"
            role="dialog"
          >
            <h3 className="modal-title">Nuevo Prospecto</h3>
            <form onSubmit={createProspect}>
              <div className="form-group">
                <label htmlFor="prospect-name">Nombre *</label>
                <input
                  id="prospect-name"
                  type="text"
                  required
                  maxLength={200}
                  value={addProspectForm.name}
                  onChange={e => setAddProspectForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="prospect-email">Correo electrónico</label>
                <input
                  id="prospect-email"
                  type="email"
                  maxLength={254}
                  placeholder="ej: usuario@correo.com"
                  aria-describedby="prospect-email-hint"
                  value={addProspectForm.email}
                  onChange={e => setAddProspectForm(f => ({ ...f, email: e.target.value }))}
                />
                <span id="prospect-email-hint" className="sr-only">Dirección de correo electrónico válida</span>
              </div>
              <div className="form-group">
                <label htmlFor="prospect-phone">Teléfono</label>
                <input
                  id="prospect-phone"
                  type="tel"
                  maxLength={20}
                  placeholder="ej: +52 55 1234 5678"
                  aria-describedby="prospect-phone-hint"
                  value={addProspectForm.phone}
                  onChange={e => setAddProspectForm(f => ({ ...f, phone: e.target.value }))}
                />
                <span id="prospect-phone-hint" className="sr-only">Número de teléfono de contacto</span>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="prospect-category">Categoría</label>
                  <select
                    id="prospect-category"
                    aria-label="Categoría"
                    value={addProspectForm.category}
                    onChange={e => setAddProspectForm(f => ({ ...f, category: e.target.value }))}
                  >
                    <option value="primer_contacto">Primer Contacto</option>
                    <option value="seguimiento">Seguimiento</option>
                    <option value="negociacion">Negociación</option>
                    <option value="vendido">Vendido</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="prospect-budget">Presupuesto</label>
                  <input
                    id="prospect-budget"
                    type="number"
                    step="0.01"
                    placeholder="Ej: 150000"
                    aria-describedby="prospect-budget-hint"
                    value={addProspectForm.budget}
                    onChange={e => setAddProspectForm(f => ({ ...f, budget: e.target.value }))}
                  />
                  <span id="prospect-budget-hint" className="sr-only">Cantidad en pesos, use números</span>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="prospect-payment">Forma de pago</label>
                <select
                  id="prospect-payment"
                  aria-label="Forma de pago"
                  value={addProspectForm.payment_method}
                  onChange={e => setAddProspectForm(f => ({ ...f, payment_method: e.target.value }))}
                >
                  <option value="contado">Contado</option>
                  <option value="credito">Crédito</option>
                </select>
              </div>
              {addProspectError && <div className="status-message error">{addProspectError}</div>}
              <div className="modal-footer">
                <Button variant="outline" size="sm" onClick={() => setAddProspectOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" loading={addProspectLoading}>
                  {addProspectLoading ? <Loader size="sm" /> : 'Crear'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {deleteProspectDialog.open && (
        <div className="modal-overlay" onClick={() => !deleteProspectDialog.loading && setDeleteProspectDialog({ open: false, prospect: null, loading: false })}>
          <div
            ref={deleteProspectModalRef}
            className="modal-card delete-confirm"
            onClick={e => e.stopPropagation()}
            aria-modal="true"
            role="dialog"
          >
            <div className="confirm-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 className="confirm-title">¿Eliminar prospecto?</h3>
            <p className="confirm-message">
              Estás a punto de eliminar <strong>"{deleteProspectDialog.prospect?.name}"</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="confirm-actions">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteProspectDialog({ open: false, prospect: null, loading: false })}
                disabled={deleteProspectDialog.loading}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleDeleteProspectConfirm}
                disabled={deleteProspectDialog.loading}
                loading={deleteProspectDialog.loading}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog.open && (
        <div className="modal-overlay" onClick={() => !confirmDialog.loading && setConfirmDialog({ open: false, lot: null, loading: false })}>
          <div
            className="modal-card delete-confirm"
            onClick={e => e.stopPropagation()}
            aria-modal="true"
            role="dialog"
          >
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDialog({ open: false, lot: null, loading: false })}
                disabled={confirmDialog.loading}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleDeleteConfirm}
                disabled={confirmDialog.loading}
                loading={confirmDialog.loading}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

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
