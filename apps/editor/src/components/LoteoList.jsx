import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import Loader from './Loader';
import { listOrganizations } from '../api/auth';
import { listLoteos, listProjects } from '../api/loteos';

// Agrupa loteos por proyecto (etapas del stage switcher, por orden); los
// standalones van juntos al final.
function buildSections(loteos, projectNames) {
  const groups = new Map();
  const standalone = [];
  for (const loteo of loteos) {
    if (!loteo.project_id) { standalone.push(loteo); continue; }
    if (!groups.has(loteo.project_id)) {
      groups.set(loteo.project_id, { id: loteo.project_id, name: projectNames.get(loteo.project_id), loteos: [] });
    }
    groups.get(loteo.project_id).loteos.push(loteo);
  }
  const sections = [...groups.values()];
  for (const s of sections) {
    s.loteos.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    s.name ??= s.loteos[0]?.name ?? 'Proyecto';
  }
  if (standalone.length) sections.push({ id: 'standalone', name: null, loteos: standalone });
  return sections;
}

const normalize = s => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Manzana esquemática para los loteos sin miniatura.
const BlockGlyph = () => (
  <svg className="loteo-glyph" viewBox="0 0 48 32" aria-hidden="true">
    <rect x="2" y="2" width="44" height="28" rx="3" />
    <path d="M13 2v28M24 2v28M35 2v28M2 16h44" />
  </svg>
);

function LoteoCard({ loteo, etapa, onSelect }) {
  const thumb = loteo.thumbnail_url || loteo.blueprint_thumbnail_url;
  const lotCount = loteo.lotes?.length ?? 0;
  const uncalibrated = loteo.blueprint_url && !loteo.calibration_points?.length;
  return (
    <li>
      <button type="button" className="loteo-card" onClick={() => onSelect(loteo)}>
        <span className="loteo-card-media">
          {thumb ? <img src={thumb} alt="" loading="lazy" /> : <BlockGlyph />}
          {etapa != null && <span className="loteo-card-etapa">Etapa {etapa}</span>}
        </span>
        <span className="loteo-card-body">
          <strong>{loteo.name || 'Sin nombre'}</strong>
          <span className="loteo-card-meta">
            <span>{lotCount} {lotCount === 1 ? 'lote' : 'lotes'}</span>
            {uncalibrated && <span className="loteo-card-flag">Sin calibrar</span>}
            {!loteo.image_url && <span className="loteo-card-flag">Sin panorama</span>}
          </span>
        </span>
        <span className="loteo-card-open" aria-hidden="true">Abrir →</span>
      </button>
    </li>
  );
}

export default function LoteoList({ token, onSelect, onAuthError, onLogout, user, activeOrgId, onOrgChange }) {
  const isSuperAdmin = user?.role === 'super_admin';
  // Último resultado, marcado con la org y el reintento que lo pidieron: si no
  // coinciden con los actuales, está cargando (sin setState síncrono en el efecto).
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');

  const [orgs, setOrgs] = useState(null);
  const [orgsError, setOrgsError] = useState(null);

  // super_admin no tiene org propia (ver resolve_active_organization_id en el
  // backend) — necesita elegir con cuál trabajar antes de listar sus loteos.
  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    listOrganizations(token)
      .then(data => { if (!cancelled) setOrgs(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setOrgsError('No se pudieron cargar las organizaciones.'); });
    return () => { cancelled = true; };
  }, [isSuperAdmin, token]);

  const needsOrg = isSuperAdmin && !activeOrgId;
  const orgId = activeOrgId ?? null;

  useEffect(() => {
    // super_admin sin org elegida todavía: no hay nada que listar (y pegarle
    // a /loteos sin X-Active-Org-Id devolvería 400).
    if (needsOrg) return;
    let cancelled = false;
    // orgId desde el prop directamente (no el valor ambiental de
    // config.js): al cambiar de org en el switcher de arriba, este
    // efecto puede disparar en el mismo commit en que cambia activeOrgId,
    // antes de que useAuth alcance a sincronizar el valor ambiental — usar
    // el prop evita mandar la org anterior por una carrera de efectos.
    Promise.all([
      listLoteos(token, { orgId, includeLotes: true }),
      // Solo para el nombre de los proyectos: si falla, se cae al de la 1ª etapa.
      listProjects(token, { orgId }).catch(() => []),
    ])
      .then(([data, projects]) => {
        if (cancelled) return;
        setResult({
          orgId,
          attempt,
          loteos: data?.items || [],
          projectNames: new Map((projects ?? []).map(p => [p.id, p.name])),
        });
      })
      .catch(err => {
        if (cancelled) return;
        if (err.isUnauthorized) { onAuthError?.(); return; }
        console.error('Error fetching loteos:', err);
        setResult({ orgId, attempt, error: 'No se pudieron cargar los loteos.' });
      });
    return () => { cancelled = true; };
  }, [needsOrg, token, orgId, attempt, onAuthError]);

  const current = result && result.orgId === orgId && result.attempt === attempt ? result : null;
  const loteos = current?.loteos ?? null;
  const projectNames = current?.projectNames;
  const error = current?.error ?? null;

  const sections = useMemo(() => {
    if (!loteos) return [];
    const q = normalize(query.trim());
    const all = buildSections(loteos, projectNames);
    if (!q) return all;
    // Si matchea el proyecto se muestran todas sus etapas.
    return all
      .map(s => (normalize(s.name).includes(q) ? s : { ...s, loteos: s.loteos.filter(l => normalize(l.name).includes(q)) }))
      .filter(s => s.loteos.length);
  }, [loteos, projectNames, query]);

  const count = loteos?.length ?? 0;
  const hasProjects = sections.some(s => s.id !== 'standalone');

  let content;
  if (needsOrg) {
    content = (
      <div className="loteo-splash">
        <p className="loteo-eyebrow">Super admin</p>
        <p className="loteo-splash-title">Elegí una organización</p>
        <p>{orgsError ?? 'Usá el selector de arriba para ver sus loteos.'}</p>
      </div>
    );
  } else if (error) {
    content = (
      <div className="loteo-splash">
        <p className="loteo-splash-title">{error}</p>
        <button type="button" className="btn-primary" style={{ width: 'auto' }} onClick={() => setAttempt(a => a + 1)}>Reintentar</button>
      </div>
    );
  } else if (!loteos) {
    content = <div className="loteo-splash"><Loader label="Cargando loteos…" /></div>;
  } else {
    content = (
      <>
        <header className="loteo-page-header">
          <div>
            <h1>Loteos</h1>
            <p>
              {count === 0
                ? 'Todavía no hay loteos en esta organización. Se crean desde la plataforma.'
                : `${count} ${count === 1 ? 'loteo' : 'loteos'} · elegí uno para editarlo`}
            </p>
          </div>
          {count > 3 && (
            <label className="loteo-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                placeholder="Buscar loteo o proyecto"
                aria-label="Buscar loteo o proyecto"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </label>
          )}
        </header>

        {count > 0 && sections.length === 0 && (
          <p className="loteo-empty">Ningún loteo coincide con “{query}”.</p>
        )}

        {sections.map(section => {
          const isProject = section.id !== 'standalone';
          const multiStage = isProject && section.loteos.length > 1;
          return (
            <section key={section.id} className="loteo-section">
              {(isProject || hasProjects) && (
                <div className="loteo-section-head">
                  <p className="loteo-eyebrow">{isProject ? 'Proyecto' : 'Sin proyecto'}</p>
                  {isProject && <h2>{section.name}</h2>}
                  {multiStage && <span className="loteo-section-count">{section.loteos.length} etapas</span>}
                </div>
              )}
              <ul className="loteo-grid">
                {section.loteos.map((l, i) => (
                  <LoteoCard key={l.id} loteo={l} etapa={multiStage ? i + 1 : null} onSelect={onSelect} />
                ))}
              </ul>
            </section>
          );
        })}
      </>
    );
  }

  return (
    <div className="loteo-app">
      <header className="loteo-topbar">
        <span className="loteo-topbar-brand">
          <span className="login-brand-mark" aria-hidden="true" />
          notry
        </span>
        <span className="loteo-topbar-divider" aria-hidden="true" />
        <span className="loteo-topbar-app">Editor de loteos</span>
        {isSuperAdmin && !orgsError && (
          <select
            className="loteo-topbar-org"
            aria-label="Organización activa"
            value={activeOrgId || ''}
            onChange={e => onOrgChange?.(e.target.value || null)}
            disabled={!orgs}
          >
            <option value="" disabled>{orgs ? 'Elegí una organización…' : 'Cargando organizaciones…'}</option>
            {orgs?.map(org => (
              <option key={org.org_id} value={org.org_id}>{org.org_name}</option>
            ))}
          </select>
        )}
        <span className="loteo-topbar-spacer" />
        {user?.email && (
          <span className="loteo-topbar-user">
            <span className="loteo-avatar" aria-hidden="true">{user.email[0]}</span>
            <span className="loteo-topbar-email">{user.email}</span>
          </span>
        )}
        {onLogout && <button type="button" className="loteo-ghost" onClick={onLogout}>Salir</button>}
      </header>
      <main className="loteo-page">{content}</main>
    </div>
  );
}
