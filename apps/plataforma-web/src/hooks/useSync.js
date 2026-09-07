import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../config';
import { reconcileById } from '../utils/reconcile';

const SYNC_INTERVAL = 60000; // 60 seconds

/**
 * useSync — polls /api/v1/sync and distributes data to state setters.
 *
 * Fires immediately on mount, then every SYNC_INTERVAL ms.
 * Uses AbortController to cancel in-flight requests when token changes.
 * Gracefully handles per-section errors without failing the whole sync.
 * Error toasts are deduplicated: only shown on the first failure after a
 * successful sync, preventing spam from repeated poll failures.
 *
 * @param {string|null} token - Auth token (null while logged out)
 * @param {Function} apiFetch - The app's apiFetch wrapper
 * @param {Object} setters - Named state setters from App.jsx
 * @param {Function} addToast - Toast helper from App.jsx (only shows on first failure)
 * @param {boolean} hasUsableOrgContext - False for a super_admin with no active org selected yet
 */
export function useSync(token, apiFetch, setters, addToast, hasUsableOrgContext = true) {
  const {
    setInventoryLots,
    setInventoryLoteos,
    setAllProspectosList,
    setDashboardSummary,
    setClicksCache,
    setVisorDataCache,
    setReportsCache,
    setRawActivities,
    shouldKeepLocal,
  } = setters;

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState(null);

  const intervalRef = useRef(null);
  const abortRef = useRef(null);
  const lastSyncSuccessRef = useRef(true);

  const doSync = useCallback(async (isInitial = false) => {
    if (!token || !hasUsableOrgContext) return;

    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    if (isInitial) setSyncLoading(true);
    setSyncError(null);

    try {
      const res = await apiFetch(`${API_BASE}/sync`, {
        signal: abortRef.current.signal,
      });

      // ── Lots ──────────────────────────────────────────────────────────────
      // Merge instead of wholesale replace: identical data produces no
      // re-render or reorder (see utils/reconcile).
      if (res.lots?.data !== undefined) {
        const items = res.lots.data ?? [];
        setInventoryLots(prev => reconcileById(prev, items, undefined,
          shouldKeepLocal && ((p, inc) => shouldKeepLocal('lots', inc))));
      }

      // ── Loteos ───────────────────────────────────────────────────────────
      if (res.loteos?.data !== undefined) {
        const items = res.loteos.data ?? [];
        setInventoryLoteos(prev => reconcileById(prev, items, undefined,
          shouldKeepLocal && ((p, inc) => shouldKeepLocal('loteos', inc))));
      }

      // ── Prospectos (all, unfiltered — used by kanban) ───────────────────
      if (res.prospectos?.data !== undefined) {
        const items = res.prospectos.data ?? [];
        setAllProspectosList(prev => reconcileById(prev, items, undefined,
          shouldKeepLocal && ((p, inc) => shouldKeepLocal('prospectos', inc))));
      }

      // ── Dashboard ─────────────────────────────────────────────────────────
      if (res.dashboard?.data !== undefined) {
        setDashboardSummary(res.dashboard.data);
      }

      // ── Clicks per loteo (direct format match) ──────────────────────────
      if (res.clicks) {
        setClicksCache(prev => {
          const next = { ...prev };
          for (const [loteoId, clicksList] of Object.entries(res.clicks)) {
            next[loteoId] = Array.isArray(clicksList)
              ? [...clicksList].sort((a, b) => b.clicks - a.clicks)
              : prev[loteoId] ?? [];
          }
          return next;
        });
      }

      // ── Visor data per loteo (direct format match) ──────────────────────
      if (res.visor_data) {
        setVisorDataCache(prev => {
          const next = { ...prev };
          for (const [loteoId, visorData] of Object.entries(res.visor_data)) {
            next[loteoId] = visorData ?? null;
          }
          return next;
        });
      }

      // ── Reports (transform field names: snake_case → camelCase) ──────────
      if (res.reports) {
        setReportsCache(prev => {
          const next = { ...prev };
          for (const [days, report] of Object.entries(res.reports)) {
            if (report) {
              next[days] = {
                prospectos: report.prospectos_en_periodo ?? 0,
                clicks: report.clicks_en_periodo ?? 0,
                leadsPorOrigen: report.leads_por_origen ?? {},
              };
            }
          }
          return next;
        });
      }

      // ── Activity Logs ─────────────────────────────────────────────────────
      if (res.activity_logs?.data !== undefined && setRawActivities) {
        setRawActivities(res.activity_logs.data ?? []);
      }
      lastSyncSuccessRef.current = true;
    } catch (err) {
      if (err.name === 'AbortError') return; // Intentional cancel, not an error
      console.error('[useSync]', err);
      const errorMessage = err.message || 'Error de conexión';
      setSyncError(errorMessage);
      // Deduplicate: only toast on the first failure after a success.
      // Subsequent polls while sync is broken stay silent until recovery.
      if (lastSyncSuccessRef.current && typeof addToast === 'function') {
        addToast(`Error de sincronización: ${errorMessage}`, 'error');
      }
      lastSyncSuccessRef.current = false;
    } finally {
      setSyncLoading(false);
    }
    // apiFetch must stay in the deps: it changes when a super_admin switches
    // the active org (X-Active-Org-Id header), and this callback needs the
    // fresh closure so the next sync actually hits the newly selected org.
  }, [token, apiFetch, hasUsableOrgContext]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token || !hasUsableOrgContext) {
      setSyncLoading(false);
      setSyncError(null);
      lastSyncSuccessRef.current = true;
      return;
    }

    // Initial sync (immediate, not from interval)
    doSync(true);

    // Polling interval
    intervalRef.current = setInterval(() => doSync(false), SYNC_INTERVAL);

    return () => {
      clearInterval(intervalRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [token, hasUsableOrgContext, doSync]);

  const refresh = useCallback(() => doSync(false), [doSync]);

  const clearSyncError = useCallback(() => setSyncError(null), []);

  return { syncLoading, syncError, refresh, clearSyncError };
}
