const UNIT_LABELS = {
  pesos: 'Pesos',
  dolares: 'Dólares',
  cemento: 'Bolsas de cemento',
};

export function unitLabel(unitType) {
  return UNIT_LABELS[unitType] || unitType || 'Sin unidad';
}

export function formatContractAmount(value, unitType, { compact = false } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';

  if (unitType === 'cemento') {
    return `${new Intl.NumberFormat('es-AR', {
      maximumFractionDigits: 2,
      notation: compact ? 'compact' : 'standard',
    }).format(amount)} bolsas`;
  }

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: unitType === 'dolares' ? 'USD' : 'ARS',
    maximumFractionDigits: 2,
    notation: compact ? 'compact' : 'standard',
  }).format(amount);
}

export function formatArsApprox(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
    notation: amount >= 1_000_000 ? 'compact' : 'standard',
  }).format(amount);
}

export function formatContractDate(value, options = {}) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: options.short ? 'short' : '2-digit',
    year: options.withYear === false ? undefined : 'numeric',
  }).format(date);
}

export function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || '—';
}

export function isInstallmentOverdue(installment, now = new Date()) {
  if (installment?.status !== 'pending' || !installment?.due_date) return false;
  const due = new Date(installment.due_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due < today;
}

export function contractProgress(contract) {
  const total = Number(contract.installments_count) || contract.installments?.length || 0;
  const paid = Number(contract.paid_count)
    || contract.installments?.filter(item => item.status === 'paid').length
    || 0;
  const totalAmount = Number(contract.total_amount);
  const pendingAmount = contract.total_pending_amount != null
    ? Number(contract.total_pending_amount)
    : contract.installments?.reduce((sum, item) => {
      const remaining = item.remaining_amount != null
        ? Number(item.remaining_amount)
        : Math.max(Number(item.amount || 0) - Number(item.paid_amount || 0), 0);
      return sum + remaining;
    }, 0);
  const amountPercentage = Number.isFinite(totalAmount)
    && totalAmount > 0
    && Number.isFinite(pendingAmount)
    ? Math.round(((totalAmount - pendingAmount) / totalAmount) * 100)
    : null;
  return {
    total,
    paid,
    percentage: amountPercentage != null
      ? Math.max(0, Math.min(100, amountPercentage))
      : total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0,
  };
}

export function contractState(contract) {
  if (contract.status === 'cancelled') {
    return { key: 'cancelled', label: 'Cancelado', overdueCount: 0 };
  }

  const progress = contractProgress(contract);
  if (progress.total > 0 && progress.paid >= progress.total) {
    return { key: 'completed', label: 'Completado', overdueCount: 0 };
  }

  const overdueCount = (contract.installments || []).filter(item => isInstallmentOverdue(item)).length;
  if (overdueCount > 0) {
    return {
      key: 'overdue',
      label: `${overdueCount} ${overdueCount === 1 ? 'vencida' : 'vencidas'}`,
      overdueCount,
    };
  }

  return { key: 'current', label: 'Al día', overdueCount: 0 };
}

export function nextPendingInstallment(contract) {
  return [...(contract.installments || [])]
    .filter(item => item.status === 'pending')
    .sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    })[0] || null;
}

