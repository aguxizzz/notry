import { useState, useCallback } from 'react';

export function useActivityFeed({}) {
  const [activities, setActivitiesState] = useState([]);

  // Normalize a raw item from the API
  const normalizeItem = (item) => ({
    id: item.id,
    type: item.activity_type,
    name: item.extra_data?.prospect_name
          ?? item.user_full_name
          ?? item.description
          ?? '—',
    description: item.description ?? null,
    ts: Date.parse(item.created_at),
  });

  // Called by useSync when fresh activity_logs data arrives — MERGE with existing
  const handleRawActivities = useCallback((rawItems) => {
    const incoming = rawItems.map(normalizeItem);
    setActivitiesState(prev => {
      const existingIds = new Set(prev.map(a => a.id));
      const trulyNew = incoming.filter(a => !existingIds.has(a.id));
      if (trulyNew.length === 0) return prev; // no changes
      return [...trulyNew, ...prev];
    });
  }, []);

  // Expose setter so mutations can optimistically add new activities
  const setActivities = useCallback((updater) => {
    setActivitiesState(prev => {
      const newItems = typeof updater === 'function' ? updater(prev) : updater;
      const incoming = Array.isArray(newItems) ? newItems : [newItems];
      const existingIds = new Set(prev.map(a => a.id));
      const unique = incoming.filter(a => !existingIds.has(a.id));
      return unique.length > 0 ? [...unique, ...prev] : prev;
    });
  }, []);

  return { activities, handleRawActivities, setActivities };
}
