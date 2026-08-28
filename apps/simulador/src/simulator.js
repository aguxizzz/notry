export function formatArs(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(value);
}

export function formatUcb(value) {
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 1, minimumFractionDigits: 0,
  }).format(value);
}

export function formatUsd(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(value);
}

export function formatMonthYear(date) {
  const text = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Espeja la fórmula de POST /public/projects/{id}/simulator (app/api/v1/public.py
// en notry-back) para poder recalcular en el cliente sin volver a golpear el server.
export function computeSimulation(project, { monthlyArs, downPaymentArs, planId }) {
  const plan = project.plans.find((item) => item.id === planId) ?? null;
  const monthlyUcb = monthlyArs / project.cementRateArs;
  const downPaymentUcb = downPaymentArs / project.cementRateArs;
  if (!plan) return { plan, monthlyUcb, downPaymentUcb, candidates: [] };

  const candidates = project.lots
    .map((lot) => {
      const totalUcb = (lot.listPriceUsd * project.usdRateArs) / project.cementRateArs;
      const financedUcb = Math.max(totalUcb - downPaymentUcb, 0);
      const installmentUcb = financedUcb / plan.installments;
      return { ...lot, totalUcb, installmentUcb, writingThresholdUcb: (totalUcb * project.writingThresholdPercent) / 100 };
    })
    .filter((lot) => lot.installmentUcb <= monthlyUcb)
    .sort((a, b) => b.listPriceUsd - a.listPriceUsd);

  return { plan, monthlyUcb, downPaymentUcb, candidates };
}
