import { useState, useEffect, useMemo } from 'react';
import { annId, lotStatus, sizeBuckets, filterLots } from '../lotData.js';

// Lotes y lugares del loteo + buscador y filtros.
function useLotBrowser({ annotations, labels, loteoId, onFilterChange }) {
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  // El rango de tamaño es de la etapa: al cambiar de etapa vuelve a "Todas".
  const [sizeByStage, setSizeByStage] = useState({ loteoId, id: 'all' });
  const size = sizeByStage.loteoId === loteoId ? sizeByStage.id : 'all';
  const setSize = (id) => setSizeByStage({ loteoId, id });
  const [query, setQuery] = useState('');

  const lots = useMemo(
    () => annotations
      .filter((a) => a.type === 'polygon')
      .sort((a, b) => String(a.tooltip ?? '').localeCompare(String(b.tooltip ?? ''), 'es', { numeric: true })),
    [annotations]
  );
  const pois = useMemo(
    () => annotations
      .filter((a) => a.type === 'poi' && !a.target_loteo_id)
      .sort((a, b) => (parseFloat(a.distance_value) || Infinity) - (parseFloat(b.distance_value) || Infinity)),
    [annotations]
  );
  const counts = useMemo(() => {
    const c = { available: 0, reserved: 0, sold: 0, unavailable: 0 };
    for (const l of lots) c[lotStatus(l)] += 1;
    return c;
  }, [lots]);
  const buckets = useMemo(() => sizeBuckets(lots), [lots]);
  const labelOf = (ann) => labels.get(annId(ann)) ?? ann.tooltip ?? '';

  const filtersActive = onlyAvailable || size !== 'all' || query.trim() !== '';
  const visibleLots = useMemo(
    () => filterLots(lots, { labels, onlyAvailable, bucket: buckets?.find((b) => b.id === size), query }),
    [lots, labels, onlyAvailable, size, query, buckets]
  );

  useEffect(() => {
    onFilterChange?.(filtersActive ? new Set(visibleLots.map(annId)) : null);
  }, [filtersActive, visibleLots, onFilterChange]);

  const clearFilters = () => { setOnlyAvailable(false); setSize('all'); setQuery(''); };

  return {
    lots, pois, counts, buckets, labelOf,
    onlyAvailable, setOnlyAvailable, size, setSize, query, setQuery,
    filtersActive, visibleLots, clearFilters,
  };
}

// Estado del formulario de la ficha. Es del lote abierto: al cambiar de lote
// vuelve a cerrado/idle sin pasar por un efecto.
function useFichaForm(selectedId) {
  const [form, setForm] = useState({ lotId: selectedId, open: false, status: 'idle' });
  const current = form.lotId === selectedId ? form : { lotId: selectedId, open: false, status: 'idle' };
  const update = (patch) => setForm((prev) => ({
    ...(prev.lotId === selectedId ? prev : { lotId: selectedId, open: false, status: 'idle' }),
    ...patch,
  }));
  return {
    showForm: current.open,
    setShowForm: (open) => update({ open }),
    submitStatus: current.status,
    setSubmitStatus: (status) => update({ status }),
    resetForm: () => update({ open: false, status: 'idle' }),
  };
}

/**
 * Lo que comparten el panel de escritorio y el flotante de celular: lista con
 * filtros, lote abierto, formulario y Esc para cerrar la ficha. Devuelve las
 * props de la ficha ya armadas (menos cómo se vuelve atrás, que cambia).
 */
export function useLotUi({
  project,
  annotations,
  labels,
  services,
  selectedId,
  onSelectLot,
  onHoverLot,
  onCloseLot,
  onFilterChange,
  whatsappPhone,
  hideContactForm,
  origin,
  loteoId,
  showcase = false,
}) {
  const browser = useLotBrowser({ annotations, labels, loteoId, onFilterChange });
  const selected = selectedId ? browser.lots.find((l) => annId(l) === selectedId) ?? null : null;
  const form = useFichaForm(selected ? selectedId : null);

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.target.matches?.('input, textarea')) return;
      onCloseLot();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onCloseLot]);

  const fichaProps = selected && {
    ann: selected,
    browser,
    services,
    contact: { whatsappPhone, hideContactForm, origin, loteoId, showcase },
    showPrice: Boolean(project?.show_price),
    onSelect: onSelectLot,
    onHover: onHoverLot,
    form,
  };

  return { browser, selected, form, fichaProps };
}
