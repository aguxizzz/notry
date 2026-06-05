import { useState } from 'react';

/**
 * useProspects — encapsulates prospects filter/advisor state for the clientes view.
 *
 * The prospects data itself (allProspectosList) is managed by useSync in App.jsx;
 * the table renders from it directly with client-side filtering — there is no
 * pagination (sync returns the full set, same source the kanban uses).
 */
export function useProspects() {
  const [prospectosSearch, setProspectosSearch] = useState('');
  const [prospectosCategoryFilter, setProspectosCategoryFilter] = useState('');
  const [prospectosWithoutAdvisor, setProspectosWithoutAdvisor] = useState(false);
  const [advisorsList, setAdvisorsList] = useState([]);
  const [advisorsLoading, setAdvisorsLoading] = useState(false);

  return {
    // State
    prospectosSearch,
    setProspectosSearch,
    prospectosCategoryFilter,
    setProspectosCategoryFilter,
    prospectosWithoutAdvisor,
    setProspectosWithoutAdvisor,
    advisorsList,
    setAdvisorsList,
    advisorsLoading,
    setAdvisorsLoading,
  };
}
