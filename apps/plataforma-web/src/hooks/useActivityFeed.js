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
    isOptimistic: false, // Mark as real data
  });

  // Create a content signature to dedupe optimistic vs real activities
  const getSignature = (activity) => {
    return `${activity.type}|${activity.description}`;
  };

  // Called by useSync when fresh activity_logs data arrives — MERGE with existing
  const handleRawActivities = useCallback((rawItems) => {
    const incoming = rawItems.map(normalizeItem);
    setActivitiesState(prev => {
      // Remove optimistic activities that now have real counterparts from the API
      const incomingSignatures = new Set(incoming.map(getSignature));
      const filtered = prev.filter(a => {
        // Keep non-optimistic activities or optimistic ones without a real counterpart
        return !a.isOptimistic || !incomingSignatures.has(getSignature(a));
      });

      // Only add incoming items that aren't already present (by ID or signature)
      const existingIds = new Set(filtered.map(a => a.id));
      const existingSignatures = new Set(filtered.map(getSignature));
      const trulyNew = incoming.filter(a => !existingIds.has(a.id) && !existingSignatures.has(getSignature(a)));

      if (trulyNew.length === 0) return filtered; // no changes
      return [...trulyNew, ...filtered];
    });
  }, []);

  // Expose setter so mutations can optimistically add new activities
  const setActivities = useCallback((updater) => {
    setActivitiesState(prev => {
      const newItems = typeof updater === 'function' ? updater(prev) : updater;
      const incoming = Array.isArray(newItems) ? newItems : [newItems];
      const incomingWithFlag = incoming.map(item => ({
        ...item,
        isOptimistic: true, // Mark as optimistic
      }));

      const existingIds = new Set(prev.map(a => a.id));
      const unique = incomingWithFlag.filter(a => !existingIds.has(a.id));
      return unique.length > 0 ? [...unique, ...prev] : prev;
    });
  }, []);

  return { activities, handleRawActivities, setActivities };
}
