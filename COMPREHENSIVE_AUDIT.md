# React CRM Dashboard - Comprehensive Security & Performance Audit

**Date:** April 2026  
**Project:** Notry Platform Web (plataforma-web)  
**Scope:** Security, Performance, Stability, Scalability

---

## CRITICAL ISSUES 🔴

### 1. **Token Exposure via URL Parameters (SECURITY)**
**Severity:** CRITICAL | **File:** `App.jsx:756`

Token passed directly in URL query parameters to external domains.

```javascript
// ❌ INSECURE: Token visible in URL
const dataUrl = `${API_BASE}/loteos/${loteoId}/visor_data`;
window.open(`${EDITOR_URL}/?data=${encodeURIComponent(dataUrl)}&token=${encodeURIComponent(token)}`, '_blank');
```

**Risks:**
- Token exposed in browser history
- Visible in referrer headers when external site is visited
- Cached in browser logs and server logs
- Can be leaked to analytics services

**Fix:**
```javascript
// ✅ SECURE: Use postMessage for cross-origin communication
const handleOpenEditor = (loteoId) => {
  const editorWindow = window.open(EDITOR_URL, '_blank', 'noopener,noreferrer');
  if (editorWindow) {
    setTimeout(() => {
      editorWindow.postMessage({ 
        type: 'AUTH', 
        token, 
        dataUrl: `${API_BASE}/loteos/${loteoId}/visor_data` 
      }, EDITOR_ORIGIN);
    }, 500);
  }
};
```

---

### 2. **Monolithic State Management + Prop Drilling (PERFORMANCE)**
**Severity:** CRITICAL | **File:** `App.jsx:135-205`

App.jsx contains **50+ useState calls** with tightly coupled state logic. This causes:
- Every state change triggers full component re-render
- Impossible to optimize child components with React.memo
- ~2000 lines in single file
- Unmanageable when scaling

```javascript
// ❌ CURRENT: All state in one place
const [inventoryLots, setInventoryLots] = useState([]);
const [inventoryLoading, setInventoryLoading] = useState(false);
const [inventorySearch, setInventorySearch] = useState('');
const [inventoryStatusFilter, setInventoryStatusFilter] = useState('');
// ... 46 more useState calls

// Then passed through 4+ levels of props
<KanbanBoard 
  token={token} 
  prospectosList={prospectosList} 
  advisorsList={advisorsList}
  // ...
/>
```

**Impact:** 
- 2KB+ props object passed to each nested component
- All siblings re-render when unrelated state changes
- Child components can't be memoized effectively

**Fix:** Use Context API with separate contexts by domain:

```javascript
// ✅ Create domain-scoped contexts
const InventoryContext = createContext();
const ProspectsContext = createContext();
const AuthContext = createContext();

export function App() {
  // Top-level auth state only
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  return (
    <AuthContext.Provider value={{ token, user }}>
      <InventoryProvider>
        <ProspectsProvider>
          <Dashboard />
        </ProspectsProvider>
      </InventoryProvider>
    </AuthContext.Provider>
  );
}
```

---

### 3. **Missing Request Timeout (STABILITY)**
**Severity:** CRITICAL | **File:** `App.jsx:967-1011`

No timeout configured on fetch requests. If backend hangs, UI will hang indefinitely.

```javascript
const apiFetch = async (url, opts = {}) => {
  const { retries = 3, retryDelay = 500, ...fetchOpts } = opts;
  // ❌ No timeout handling
  const res = await fetch(url, { ...fetchOpts });
};
```

**Fix:**
```javascript
const apiFetch = async (url, opts = {}) => {
  const { retries = 3, retryDelay = 500, timeout = 10000, ...fetchOpts } = opts;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const res = await fetch(url, {
        ...fetchOpts,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const body = await res.text();
        return body ? JSON.parse(body) : null;
      }
      // ... rest of error handling
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      // ... retry logic
    }
  }
};
```

---

### 4. **Hardcoded Configuration (SCALABILITY)**
**Severity:** HIGH | **File:** `config.js:1-3`

Production URLs hardcoded in source, no environment separation.

```javascript
// ❌ CURRENT: No environment support
export const API_BASE = 'https://notry-back.onrender.com/api/v1';
export const EDITOR_URL = 'https://notry-editor.vercel.app';
export const VISOR_URL = 'https://notry-visor.vercel.app';
```

**Fix:**
```javascript
// ✅ Environment-aware configuration
const ENV = import.meta.env.MODE; // 'development' | 'production'

const CONFIG = {
  development: {
    API_BASE: import.meta.env.VITE_API_BASE || 'http://localhost:8000/api/v1',
    EDITOR_URL: 'http://localhost:3001',
    VISOR_URL: 'http://localhost:3002',
  },
  production: {
    API_BASE: 'https://notry-back.onrender.com/api/v1',
    EDITOR_URL: 'https://notry-editor.vercel.app',
    VISOR_URL: 'https://notry-visor.vercel.app',
  },
};

export const API_BASE = CONFIG[ENV].API_BASE;
export const EDITOR_URL = CONFIG[ENV].EDITOR_URL;
export const VISOR_URL = CONFIG[ENV].VISOR_URL;

// Add to .env.local:
// VITE_API_BASE=http://localhost:8000/api/v1
```

---

## HIGH PRIORITY ISSUES 🟠

### 5. **Token Lost on Page Refresh (SECURITY)**
**Severity:** HIGH | **File:** `App.jsx:141`

Token stored only in React state. Refresh = logout (security good, UX bad).

```javascript
// ❌ Volatile storage
const [token, setToken] = useState(null);

// No persistence mechanism
```

**Options:**
1. **Secure:** Use only session/HTTP-only cookie (best)
2. **Acceptable:** Store in sessionStorage (not persistent across tabs)
3. **Avoid:** localStorage (XSS risk)

**Recommendation:** Backend should issue HTTP-only cookie instead:

```javascript
// Backend sends:
Set-Cookie: auth_token=...; HttpOnly; Secure; SameSite=Strict; Path=/

// Frontend removes manual token handling:
const handleLogin = async () => {
  // Cookie sent automatically
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    credentials: 'include', // IMPORTANT: Send cookies
    body: JSON.stringify({ email, password }),
  });
  // Token is now in HTTP-only cookie, safe from XSS
};
```

---

### 6. **Missing Cleanup in useSync Hook (STABILITY)**
**Severity:** HIGH | **File:** `hooks/useSync.js:131`

Missing dependency in useCallback, can cause stale closures.

```javascript
// ❌ CURRENT: Missing setters in dependency array
const doSync = useCallback(async (isInitial = false) => {
  // ... 65 lines of code
  setInventoryLots(items); // Depends on this setter
  setAllProspectosList(data); // And these
  // ... 5 more setState calls
}, [token]); // ❌ Missing: all 7 setters
```

**Impact:** 
- doSync could capture stale setter references
- State updates might not propagate correctly

**Fix:**
```javascript
// ✅ Include all dependencies
const doSync = useCallback(async (isInitial = false) => {
  // ...
}, [
  token,
  setInventoryLots,
  setInventoryLoteos,
  setAllProspectosList,
  setDashboardSummary,
  setClicksCache,
  setVisorDataCache,
  setReportsCache,
]);
```

---

### 7. **Race Condition in Modal Focus Management (STABILITY)**
**Severity:** HIGH | **File:** `App.jsx:281-335`

Modal focus management relies on setTimeout without guarding against rapid open/close.

```javascript
// ❌ FRAGILE: Race condition possible
useEffect(() => {
  if (createLoteoOpen && createLoteoModalRef.current) {
    const focusableElements = createLoteoModalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements.length > 0) {
      focusableElements[0].focus(); // ❌ No cleanup timer
    }
  }
}, [createLoteoOpen]);
```

If user opens → closes → opens modal in quick succession, focus may be set on unmounted element.

**Fix:**
```javascript
useEffect(() => {
  if (!createLoteoOpen || !createLoteoModalRef.current) return;

  const timer = setTimeout(() => {
    if (createLoteoModalRef.current) { // Guard against unmount
      const focusableElements = createLoteoModalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusableElements[0]?.focus();
    }
  }, 0);

  return () => clearTimeout(timer); // Always cleanup
}, [createLoteoOpen]);
```

---

### 8. **Missing Content-Security-Policy Headers (SECURITY)**
**Severity:** HIGH | **File:** `vite.config.js`

No CSP configured. Vulnerable to injected scripts.

**Fix:** Add to vite.config.js:

```javascript
// vite.config.js
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://notry-back.onrender.com; frame-ancestors 'self'",
    },
  },
});

// Or in nginx/server config
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://notry-back.onrender.com;";
```

---

### 9. **Inefficient Data Fetching in AnalisisView (PERFORMANCE)**
**Severity:** HIGH | **File:** `components/AnalisisView.jsx:73-93`

Direct fetch instead of using app's apiFetch wrapper, no caching, no error recovery.

```javascript
// ❌ CURRENT: Direct fetch, no retry logic, no error UI
const fetchLoteos = async () => {
  setLoteosLoading(true);
  setLoteosError(null);
  try {
    const res = await fetch(`${API_BASE}/loteos?include_lotes=false&limit=50&offset=0`, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    // ...
  } catch (err) {
    setLoteosError(err.message);
    console.error(err);
  }
};
```

**Issues:**
- No retry logic (direct fetch doesn't have apiFetch's 3-retry logic)
- 401 response not handled (should logout)
- No timeout
- No cancel token if token changes

**Fix:**
```javascript
// ✅ Use apiFetch from parent via context
const { apiFetch } = useContext(AppContext);

const fetchLoteos = useCallback(async () => {
  setLoteosLoading(true);
  setLoteosError(null);
  try {
    const data = await apiFetch(`${API_BASE}/loteos?include_lotes=false&limit=50&offset=0`);
    setLoteos(data.items);
  } catch (err) {
    if (err.message.includes('Sesión expirada')) {
      onSessionExpired?.();
    } else {
      setLoteosError(err.message);
    }
  } finally {
    setLoteosLoading(false);
  }
}, [apiFetch, onSessionExpired]);
```

---

### 10. **No Validation on Number Inputs (STABILITY)**
**Severity:** HIGH | **File:** `App.jsx:626, 682, 819`

Budget and area inputs parsed with parseFloat() without validation.

```javascript
// ❌ CURRENT: No validation
if (addProspectForm.budget) body.budget = parseFloat(addProspectForm.budget);
// User can submit "-999" or "Infinity" or "NaN"

if (editLotForm.area_m2 !== '') body.area_m2 = parseFloat(editLotForm.area_m2);
// Should validate: > 0, reasonable max, correct decimal places
```

**Fix:**
```javascript
const validateBudget = (val) => {
  const num = parseFloat(val);
  if (isNaN(num) || num < 0 || num > 999_999_999) {
    return 'Presupuesto debe ser entre 0 y 999.999.999';
  }
  return null;
};

const validateArea = (val) => {
  const num = parseFloat(val);
  if (isNaN(num) || num <= 0 || num > 999_999) {
    return 'Área debe ser entre 0.01 y 999.999 m²';
  }
  return null;
};

// In form:
const budgetError = validateBudget(addProspectForm.budget);
{budgetError && <span className="field-error">{budgetError}</span>}
```

---

## MEDIUM PRIORITY ISSUES 🟡

### 11. **Missing Error Boundaries at Key Points (STABILITY)**
**Severity:** MEDIUM | **File:** `App.jsx:1249-1615`

Only 4 ErrorBoundaries for entire app. Risks:
- Login form error → whole app crashes
- Header error → whole app crashes

```javascript
// ❌ CURRENT: Partial coverage
<ErrorBoundary label="Error en el tablero Kanban">
  <KanbanBoard ... />
</ErrorBoundary>

// ❌ Missing: Login form, tables, filters
if (view === 'login') {
  return (
    <div className="login-container">
      <LoginBackground /> {/* No ErrorBoundary */}
      <div className="login-card">
        <form onSubmit={handleLogin}> {/* No ErrorBoundary */}
```

**Fix:**
```javascript
// ✅ Wrap critical sections
<ErrorBoundary label="Error en login">
  <LoginBackground />
</ErrorBoundary>

<ErrorBoundary label="Error en formulario">
  <form onSubmit={handleLogin}>
    {/* ... */}
  </form>
</ErrorBoundary>
```

---

### 12. **No Memoization of List Items (PERFORMANCE)**
**Severity:** MEDIUM | **File:** `App.jsx:1207-1387, 1415-1479, 1554-1586`

Table rows re-render on any parent state change.

```javascript
// ❌ CURRENT: No memoization
{lots?.map(lot => (
  <div key={lot.id} className={...}>
    {/* Re-renders entire row when parent state changes */}
  </div>
))}
```

**Impact:** 
- 1000 lot rows = 1000 unnecessary re-renders when filters change
- Inventory filters → re-render all 1000 rows unnecessarily

**Fix:**
```javascript
// ✅ Memoized row component
const LotRow = React.memo(({ lot, onEdit, onDelete }) => (
  <tr key={lot.id}>
    <td className="td-name">{lot.name}</td>
    {/* ... */}
    <td className="td-actions">
      <button onClick={() => onEdit(lot)}>Editar</button>
      <button onClick={() => onDelete(lot)}>Eliminar</button>
    </td>
  </tr>
));

// In table:
{lots?.map(lot => (
  <LotRow key={lot.id} lot={lot} onEdit={openEditLotModal} onDelete={openDeleteConfirm} />
))}
```

---

### 13. **Race Condition in Filter Logic (STABILITY)**
**Severity:** MEDIUM | **File:** `App.jsx:384-388`

Resetting filtered list when filter changes, but doesn't account for in-flight requests.

```javascript
// ❌ CURRENT: Race condition
React.useEffect(() => {
  if (ownerSubView !== 'clientes') return;
  setProspectosList(allProspectosList); // Resets list
  setProspectosHasMore(false);
  // But if load-more request is in-flight, it will merge old data
}, [ownerSubView, prospectosCategoryFilter, prospectosWithoutAdvisor, allProspectosList]);
```

If user:
1. Loads more prospectos (offset=50)
2. Changes category filter
3. load-more response arrives
→ Old data merges with new filtered data

**Fix:**
```javascript
// ✅ Cancel in-flight requests
const filterAbortRef = useRef(null);

useEffect(() => {
  if (ownerSubView !== 'clientes') return;
  
  // Cancel previous load-more request
  if (filterAbortRef.current) {
    filterAbortRef.current.abort();
  }
  
  setProspectosList(allProspectosList);
  setProspectosHasMore(false);
}, [prospectosCategoryFilter, prospectosWithoutAdvisor]);

const loadMoreProspectos = async () => {
  filterAbortRef.current = new AbortController();
  try {
    const data = await apiFetch(
      `${API_BASE}/prospects?...`,
      { signal: filterAbortRef.current.signal }
    );
    // ...
  } catch (err) {
    if (err.name !== 'AbortError') console.error(err);
  }
};
```

---

### 14. **No Pagination for Initial Inventory Load (PERFORMANCE)**
**Severity:** MEDIUM | **File:** `App.jsx:504-518`

Loads 50 items but doesn't lazy-load remaining inventory. Table could have thousands of rows.

```javascript
const fetchInventory = async (name, status, signal) => {
  setInventoryLoading(true);
  try {
    const params = new URLSearchParams({ limit: PAGE_SIZE, offset: 0 });
    // ❌ Loads all 50, but if there are 10k items in DB, table gets slow
    const data = await apiFetch(`${API_BASE}/lots?${params}`, { signal });
    setInventoryLots(data.items);
  }
};
```

**Fix:** Implement virtual scrolling or server-side pagination:

```javascript
// ✅ Virtual scroll (using react-window for 10k items)
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={inventoryLots.length}
  itemSize={45}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <LotRow lot={inventoryLots[index]} />
    </div>
  )}
</FixedSizeList>

// Or implement infinite scroll with load-more
useEffect(() => {
  const container = scrollRef.current;
  if (!container) return;

  const handleScroll = () => {
    if (container.scrollTop + container.clientHeight > container.scrollHeight - 100) {
      if (!loading && hasMore) loadMore();
    }
  };

  container.addEventListener('scroll', handleScroll);
  return () => container.removeEventListener('scroll', handleScroll);
}, [loading, hasMore]);
```

---

### 15. **Unhandled Errors in Modal Submission (STABILITY)**
**Severity:** MEDIUM | **File:** `App.jsx:532-571, 845-869`

Form submissions don't handle network errors gracefully.

```javascript
const createLoteo = async (e) => {
  e.preventDefault();
  setCreateLoteoLoading(true);
  setCreateLoteoError(null);

  try {
    await apiFetch(`${API_BASE}/loteos`, {
      method: 'POST',
      body: JSON.stringify({...}),
    });
    setCreateLoteoOpen(false);
    setCreateLoteoForm({...}); // Reset form before response confirmation
    setInventoryLoteos([]); // Clear cache
    fetchInventoryLoteos(); // Refetch
    // ❌ If fetch fails, form is already reset but user doesn't know
  } catch (error) {
    setCreateLoteoError(error.message);
  } finally {
    setCreateLoteoLoading(false);
  }
};
```

**Issues:**
- Form resets before confirming success
- If error occurs, user loses their input
- No retry capability

**Fix:**
```javascript
const createLoteo = async (e) => {
  e.preventDefault();
  setCreateLoteoLoading(true);
  setCreateLoteoError(null);

  try {
    await apiFetch(`${API_BASE}/loteos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createLoteoForm.name,
        slug: createLoteoForm.slug,
        image_url: createLoteoForm.image_url,
        blueprint_url: createLoteoForm.blueprint_url,
      }),
    });

    // Only reset after successful response
    addToast('Loteo creado exitosamente', 'success');
    setCreateLoteoOpen(false);
    setCreateLoteoForm({ name: '', slug: '', image_url: '', blueprint_url: '' });
    setInventoryLoteos([]); // Clear cache
    await fetchInventoryLoteos();
  } catch (error) {
    setCreateLoteoError(error.message);
    // Form data preserved for retry
  } finally {
    setCreateLoteoLoading(false);
  }
};
```

---

### 16. **Console Errors from Stale Refs (STABILITY)**
**Severity:** MEDIUM | **File:** `App.jsx:747, 923-934`

Multiple duplicate refreshSync calls and stale promise chains.

```javascript
// ❌ CURRENT: Duplicate refresh calls
const handleDeleteProspectConfirm = async () => {
  // ...
  refreshSync(); // Called twice
  refreshSync();
};

// ❌ Stale promise in handleAnalisisRequest*
const handleAnalisisRequestClicks = useCallback((loteoId, signal) => {
  apiFetch(`${API_BASE}/loteos/${loteoId}/clicks`, { signal })
    .then(data => {
      // ❌ setClicksCache called but data could be for old loteoId
      setClicksCache(prev => ({...}));
    })
    .catch(err => { if (err.name !== 'AbortError') console.error(err); });
}, [token]); // ❌ Missing setClicksCache dependency
```

**Fix:**
```javascript
const handleAnalisisRequestClicks = useCallback((loteoId, signal) => {
  const actualLoteoId = loteoId; // Capture in closure
  
  apiFetch(`${API_BASE}/loteos/${loteoId}/clicks`, { signal })
    .then(data => {
      if (!Array.isArray(data)) return;
      setClicksCache(prev => ({
        ...prev,
        [actualLoteoId]: [...data].sort((a, b) => b.clicks - a.clicks),
      }));
    })
    .catch(err => { 
      if (err.name !== 'AbortError') console.error(err); 
    });
}, []); // Empty dependency since we capture loteoId in closure

// Or better: use AbortController instead of signal prop
const handleAnalisisRequestClicks = useCallback((loteoId) => {
  const controller = new AbortController();
  
  apiFetch(`${API_BASE}/loteos/${loteoId}/clicks`, { 
    signal: controller.signal 
  })
    .then(data => {
      // ...
    })
    .catch(err => { 
      if (err.name !== 'AbortError') console.error(err);
    });
}, []);
```

---

## RECOMMENDATIONS & SUMMARY

### Immediate Actions (Next Sprint)
1. ✅ **Fix token in URL** → Use postMessage or HTTP-only cookies
2. ✅ **Add request timeout** → 10-30s max
3. ✅ **Fix useSync dependencies** → Include all setState functions
4. ✅ **Add CSP headers** → Reduce XSS risk

### Short-term (1-2 Weeks)
1. **Extract state management** → Move to Context API by domain
2. **Add validation** → Input sanitization + range checks
3. **Comprehensive error boundaries** → Wrap all critical paths
4. **Fix modal race conditions** → Proper cleanup in useEffect

### Medium-term (1 Month)
1. **Memoize list components** → React.memo for rows
2. **Virtual scrolling** → For large tables
3. **Environment configuration** → .env files
4. **Refactor AnalisisView** → Use shared apiFetch wrapper
5. **Add loading timeouts** → Show error if >30s

### Long-term (Roadmap)
1. **Move to state management library** → Zustand or Redux Toolkit
2. **Code splitting** → Lazy load routes/modals
3. **E2E tests** → Cypress/Playwright for happy paths
4. **Logging service** → Sentry integration for error tracking
5. **Unit tests** → Vitest for utilities, custom hooks
6. **Bundle analysis** → Check for duplicate dependencies

---

## Dependency Summary

**package.json:** Minimal dependencies (good practice)
- ✅ No outdated packages found
- ✅ React 19.2.4 + React DOM 19.2.4 (latest)
- ✅ Vite 8.0.1 + plugins (good)
- ⚠️ Consider adding: `axios` (retry logic), `zustand` (state), `zod` (validation), `sentry` (error tracking)

---

## Files Requiring Changes

| Priority | File | Issue | LOC |
|----------|------|-------|-----|
| 🔴 | App.jsx | Token in URL, 50+ useState, state management | 2000 |
| 🔴 | config.js | Hardcoded URLs | 3 |
| 🔴 | hooks/useSync.js | Missing dependencies | 156 |
| 🟠 | App.jsx | Modal race conditions, form validation | 350 |
| 🟠 | components/AnalisisView.jsx | Direct fetch, no error recovery | 378 |
| 🟠 | vite.config.js | No CSP, no env config | 8 |
| 🟡 | App.jsx | No memoization, no error boundaries | 1500 |
| 🟡 | components/KanbanBoard.jsx | Direct patch, missing retry | 250 |

---

**Estimated remediation time:** 
- Critical fixes: 2-3 days
- High priority: 1 week
- Medium priority: 2 weeks
- Long-term refactor: 1-2 months
