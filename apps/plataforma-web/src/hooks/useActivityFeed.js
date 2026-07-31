import { useState, useCallback } from 'react';

export function useActivityFeed() {
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

  // High-level helper: optimistically push a single activity. Consumers should
  // pass a partial entry (`{ type, name?, description? }`); id/ts/isOptimistic
  // are filled here so callers can't get the wire format wrong.
  //
  // Replaces the old `setActivities` (raw setter) — that leaked React's state
  // shape into every mutation site.
  const addActivity = useCallback((entry) => {
    if (!entry || !entry.type) return;
    const full = {
      id: entry.id ?? crypto.randomUUID(),
      type: entry.type,
      name: entry.name ?? '—',
      description: entry.description ?? null,
      ts: entry.ts ?? Date.now(),
      isOptimistic: true,
    };
    setActivitiesState(prev => {
      const existingIds = new Set(prev.map(a => a.id));
      if (existingIds.has(full.id)) return prev;
      return [full, ...prev];
    });
  }, []);

  return { activities, handleRawActivities, addActivity };
}
