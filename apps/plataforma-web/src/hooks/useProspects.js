import { useState } from 'react';

/**
 * useProspects — encapsulates prospects filter/pagination state.
 *
 * Manages filter, pagination, and advisor state for the clientes view.
 * Extracted per the refactoring plan.
 *
 * Note: allProspectosList is managed by useSync in App.jsx.
 */
export function useProspects() {
  const [prospectosLoading, setProspectosLoading] = useState(false);
  const [prospectosCategoryFilter, setProspectosCategoryFilter] = useState('');
  const [prospectosWithoutAdvisor, setProspectosWithoutAdvisor] = useState(false);
  const [prospectosHasMore, setProspectosHasMore] = useState(false);
  const [prospectosLoadingMore, setProspectosLoadingMore] = useState(false);
  const [advisorsList, setAdvisorsList] = useState([]);
  const [advisorsLoading, setAdvisorsLoading] = useState(false);

  return {
    // State
    prospectosLoading,
    setProspectosLoading,
    prospectosCategoryFilter,
    setProspectosCategoryFilter,
    prospectosWithoutAdvisor,
    setProspectosWithoutAdvisor,
    prospectosHasMore,
    setProspectosHasMore,
    prospectosLoadingMore,
    setProspectosLoadingMore,
    advisorsList,
    setAdvisorsList,
    advisorsLoading,
    setAdvisorsLoading,
  };
}
