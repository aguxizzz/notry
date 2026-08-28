export const API_BASE = (import.meta.env.VITE_NOTRY_API_BASE || 'http://localhost:8000/api/v1').replace(/\/$/, '');
export const VISOR_URL = (import.meta.env.VITE_NOTRY_VISOR_URL || 'https://notry-visor.vercel.app').replace(/\/$/, '');

function toNumber(value) {
  return typeof value === 'number' ? value : Number(value);
}

function toProjectConfig(data) {
  return {
    id: data.project_id,
    name: data.project_name,
    cementRateArs: toNumber(data.rate_ars_per_ucb),
    usdRateArs: toNumber(data.rate_ars_per_usd),
    viewerLoteoId: data.viewer_loteo_id,
    writingThresholdPercent: toNumber(data.writing_threshold_percent),
    plans: (data.plans || []).map((plan) => ({
      id: String(plan.id),
      installments: toNumber(plan.installments),
      years: toNumber(plan.years),
    })),
    lots: (data.lots || []).map((lot) => ({
      id: lot.id,
      name: lot.name,
      sector: lot.sector,
      area: toNumber(lot.area_m2),
      listPriceUsd: toNumber(lot.list_price_usd),
    })),
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || 'No pudimos consultar el simulador.');
  return data;
}

export async function fetchSimulatorConfig(projectId, options) {
  const data = await request(`/public/projects/${projectId}/simulator`, options);
  return toProjectConfig(data);
}

export async function fetchSimulatorConfigBySlug(slug, options) {
  const data = await request(`/public/projects/by-slug/${slug}/simulator`, options);
  return toProjectConfig(data);
}
