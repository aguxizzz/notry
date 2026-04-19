import { useState } from 'react';

/**
 * useInventory — encapsulates inventory filter/pagination state.
 *
 * Manages filter and pagination state; data (inventoryLots, inventoryLoteos) is
 * managed by useSync in App.jsx. Extracted per the refactoring plan.
 *
 * Exposes filter state, tab state, loading state, and pagination state.
 */
export function useInventory() {
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryLoteosLoading, setInventoryLoteosLoading] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState('');
  const [inventoryTab, setInventoryTab] = useState('lotes');
  const [inventoryLotsHasMore, setInventoryLotsHasMore] = useState(false);
  const [inventoryLotsLoadingMore, setInventoryLotsLoadingMore] = useState(false);
  const [inventoryLoteos, setInventoryLoteos] = useState([]);

  return {
    // State
    inventoryLoading,
    setInventoryLoading,
    inventoryLoteosLoading,
    setInventoryLoteosLoading,
    inventoryLoteos,
    setInventoryLoteos,
    inventorySearch,
    setInventorySearch,
    inventoryStatusFilter,
    setInventoryStatusFilter,
    inventoryTab,
    setInventoryTab,
    inventoryLotsHasMore,
    setInventoryLotsHasMore,
    inventoryLotsLoadingMore,
    setInventoryLotsLoadingMore,
  };
}
