import { useEffect, useState } from 'react';
import { Select } from '../ui/components';
import { fetchOrganizations } from '../api/organizations';
import './OrgSwitcher.css';

// Solo para super_admin: no tiene organización propia, así que elige acá con
// cuál operar. La selección viaja como header X-Active-Org-Id en cada request
// (ver apiFetch en App.jsx) y todo lo demás (Inicio, Inventario, Cobranzas...)
// se refresca solo porque apiFetch cambia de identidad al cambiar de org.
export default function OrgSwitcher({ apiFetch, activeOrgId, onChangeOrg, orgListVersion }) {
  const [orgs, setOrgs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchOrganizations({ apiFetch })
      .then((data) => { if (!cancelled) setOrgs(data); })
      .catch(() => { if (!cancelled) setError('No se pudieron cargar las organizaciones'); });
    return () => { cancelled = true; };
    // orgListVersion: re-lista tras crear una org nueva (CreateOrgPanel), que no
    // cambia la identidad de apiFetch si el admin no cambió de org activa.
  }, [apiFetch, orgListVersion]);

  if (error) {
    return <div className="org-switcher org-switcher--error">{error}</div>;
  }

  if (!orgs) {
    return <div className="org-switcher org-switcher--loading">Cargando organizaciones…</div>;
  }

  if (orgs.length === 0) {
    return <div className="org-switcher org-switcher--error">No hay organizaciones creadas</div>;
  }

  const options = orgs.map((o) => ({ value: o.org_id, label: o.org_name }));

  return (
    <div className="org-switcher">
      <Select
        id="org-switcher-select"
        ariaLabel="Organización activa"
        value={activeOrgId || ''}
        onChange={(e) => onChangeOrg(e.target.value)}
        options={options}
      />
    </div>
  );
}
