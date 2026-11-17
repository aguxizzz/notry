import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  Button,
  ErrorBoundary,
  PageHeader,
  PageLayout,
  Panel,
  SectionHeader,
  StageSummary,
} from '../../ui/components';
import ActivityFeed from '../ActivityFeed';
import ShellLayout from '../ShellLayout';
import { INVENTORY_ACTIVITY_TYPES } from '../inventory/constants';
import {
  computeInventoryStats,
  fmtInt,
  fmtMoney,
  LOT_STATE_SEGMENTS,
} from '../inventory/inventoryStats';
import SalesVelocityChart from '../inventory/SalesVelocityChart';
import AlertCard from '../inventory/AlertCard';
import InventarioControls from '../inventory/InventarioControls';
import LoteosTable from '../inventory/LoteosTable';
import LotesTable from '../inventory/LotesTable';
import {
  filterByInventoryAttention,
  INVENTORY_ATTENTION_ORDER,
  INVENTORY_ATTENTION_RULES,
} from '../inventory/inventoryAttention';
import '../../ui/components/ActionBtn.css';
import './InventarioView.css';

// ─── Main component ───────────────────────────────────────────────────────────

export default function InventarioView({
  dashboardSummary,
  activities = [],
  inventoryLots,
  filteredInventoryLots,
  inventoryLoteos,
  filteredInventoryLoteos,
  projects,
  inventoryLoading,
  inventoryLoteosLoading,
  inventoryTab,
  onTabChange,
  inventorySearch,
  onSearchChange,
  inventoryLoteosSearch,
  onLoteosSearchChange,
  inventoryLoteoFilter,
  onLoteoFilterChange,
  syncLoading,
  onOpenEditLotModal,
  onOpenDeleteConfirm,
  onOpenCreateLotModal,
  onOpenCreateLoteoModal,
  onOpenEditLoteoModal,
  onOpenDeleteLoteoDialog,
  onOpenLoteoServices,
  onOpenEditor,
  safeOpen,
  allProspectosList,
  onNavigateToProspect,
  contractsState,
  isVisorOnly = false,
}) {
  const [attentionFilter, setAttentionFilter] = useState(null);
  // Estado de lote elegido en las casillas del resumen. Excluyente con el
  // filtro de atención para no tener dos franjas de "filtro activo" a la vez.
  const [stateFilter, setStateFilter] = useState(null);
  const inventoryPanelRef = useRef(null);
  const clearAttentionRef = useRef(null);
  const contracts = contractsState?.contracts;
  const contractsLoading = contractsState?.loading;
  const contractsError = contractsState?.error;
  const contractsEnabled = contractsState !== undefined;

  const attentionContext = useMemo(() => ({
    lots: inventoryLots || [],
    prospects: allProspectosList || [],
    contracts: contracts || [],
    contractsAvailable: Boolean(
      contractsEnabled
      && !contractsLoading
      && !contractsError
    ),
  }), [
    inventoryLots,
    allProspectosList,
    contracts,
    contractsLoading,
    contractsError,
    contractsEnabled,
  ]);

  const stats = useMemo(
    () => computeInventoryStats(
      inventoryLots || [],
      inventoryLoteos || [],
      dashboardSummary,
      attentionContext,
    ),
    [inventoryLots, inventoryLoteos, dashboardSummary, attentionContext]
  );

  const inventoryActivities = useMemo(
    () => (activities || []).filter(a => INVENTORY_ACTIVITY_TYPES.has(a.type)),
    [activities]
  );

  const activeAttentionRule = attentionFilter
    ? INVENTORY_ATTENTION_RULES[attentionFilter]
    : null;

  const visibleInventoryLots = useMemo(() => {
    const base = filteredInventoryLots ?? inventoryLots ?? [];
    const lots = activeAttentionRule?.tab === 'lotes'
      ? filterByInventoryAttention(base, attentionFilter, attentionContext)
      : filteredInventoryLots;
    // null = "sin filtro" para LotesTable; con estado elegido siempre devolvemos lista.
    if (!stateFilter) return lots;
    return (lots ?? inventoryLots ?? []).filter(lot => lot.status === stateFilter);
  }, [activeAttentionRule, attentionFilter, attentionContext, filteredInventoryLots, inventoryLots, stateFilter]);

  const visibleInventoryLoteos = useMemo(() => {
    const base = filteredInventoryLoteos ?? inventoryLoteos ?? [];
    return activeAttentionRule?.tab === 'loteos'
      ? filterByInventoryAttention(base, attentionFilter, attentionContext)
      : filteredInventoryLoteos;
  }, [activeAttentionRule, attentionFilter, attentionContext, filteredInventoryLoteos, inventoryLoteos]);

  const attentionResultCount = activeAttentionRule?.tab === 'loteos'
    ? (visibleInventoryLoteos ?? inventoryLoteos ?? []).length
    : (visibleInventoryLots ?? inventoryLots ?? []).length;

  useEffect(() => {
    if (!activeAttentionRule || inventoryTab !== activeAttentionRule.tab) return;
    const frame = requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      inventoryPanelRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      clearAttentionRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeAttentionRule, inventoryTab]);

  const clearAttentionFilter = () => setAttentionFilter(null);

  const handleTabChange = (nextTab) => {
    if (activeAttentionRule && activeAttentionRule.tab !== nextTab) {
      clearAttentionFilter();
    }
    // El estado es de lotes: en la pestaña Loteos no aplica.
    if (nextTab !== 'lotes') setStateFilter(null);
    onTabChange(nextTab);
  };

  const handleStateSelect = (stateKey) => {
    setStateFilter(stateKey);
    if (!stateKey) return;
    clearAttentionFilter();
    onTabChange('lotes');
  };

  const stateSegment = LOT_STATE_SEGMENTS.find(s => s.key === stateFilter);
  const stateResultCount = (visibleInventoryLots ?? []).length;

  const handleAttentionSelect = (ruleKey) => {
    if (attentionFilter === ruleKey) {
      clearAttentionFilter();
      return;
    }

    const rule = INVENTORY_ATTENTION_RULES[ruleKey];
    if (rule.tab === 'lotes') {
      onSearchChange('');
      onLoteoFilterChange('');
    } else {
      onLoteosSearchChange('');
    }
    onTabChange(rule.tab);
    setStateFilter(null);
    setAttentionFilter(ruleKey);
  };

  const priceBars = stats.distribution
    .filter(d => d.avgPrice > 0)
    .sort((a, b) => b.avgPrice - a.avgPrice)
    .slice(0, 6);
  const maxBarPrice = priceBars.reduce((m, d) => Math.max(m, d.avgPrice), 0) || 1;

  return (
    <ShellLayout className="inventario-shell">
      <PageLayout className="inventario-page">
        <PageHeader
          eyebrow="Inventario comercial"
          title={isVisorOnly ? 'Lotes' : 'Inventario'}
          description={isVisorOnly
            ? `${stats.total} lotes registrados.`
            : 'Controlá disponibilidad, valores y pendientes de lotes y loteos.'}
          actions={
            <Button
              size="sm"
              onClick={inventoryTab === 'lotes' ? onOpenCreateLotModal : onOpenCreateLoteoModal}
            >
              <Plus size={16} aria-hidden="true" />
              Nuevo {inventoryTab === 'lotes' ? 'lote' : 'loteo'}
            </Button>
          }
        />

        {/* Resumen: cada estado filtra la tabla de lotes; el bloque "Valor" es solo informativo. */}
        {!isVisorOnly && (
          <StageSummary
            aria-label="Resumen del inventario"
            total={{ value: fmtInt(stats.total), label: 'lotes' }}
            segments={LOT_STATE_SEGMENTS.map(s => ({ ...s, value: stats[s.key] }))}
            activeKey={stateFilter}
            onSelect={handleStateSelect}
            aside={{
              title: 'Valor',
              tone: 'neutral',
              items: [
                { key: 'valor', label: 'Valor estimado', value: fmtMoney(stats.valorEstimado) },
                { key: 'ticket', label: 'Ticket promedio', value: fmtMoney(stats.ticket) },
              ],
            }}
          />
        )}

        {/* Tabla de gestión */}
        <Panel
          as="section"
          id="inventory-results"
          ref={inventoryPanelRef}
          className="inventory-panel"
          flush
        >
          <InventarioControls
            inventoryTab={inventoryTab}
            onTabChange={handleTabChange}
            lotsCount={stats.total}
            loteosCount={(inventoryLoteos || []).length}
            inventorySearch={inventorySearch}
            onSearchChange={onSearchChange}
            inventoryLoteosSearch={inventoryLoteosSearch}
            onLoteosSearchChange={onLoteosSearchChange}
            inventoryLoteoFilter={inventoryLoteoFilter}
            onLoteoFilterChange={onLoteoFilterChange}
            inventoryLoteos={inventoryLoteos}
            inventoryLoading={inventoryLoading}
            syncLoading={syncLoading}
            inventoryLoteosLoading={inventoryLoteosLoading}
            isVisorOnly={isVisorOnly}
          />

          {!isVisorOnly && activeAttentionRule && (
            <div className="inv-attention-filter">
              <span className="inv-attention-filter-copy" role="status" aria-live="polite">
                <span className="inv-attention-filter-label">Filtro de atención</span>
                <strong>{activeAttentionRule.label}</strong>
                <span className="inv-attention-filter-count">
                  {attentionResultCount} {attentionResultCount === 1 ? 'resultado' : 'resultados'}
                </span>
              </span>
              <button
                ref={clearAttentionRef}
                type="button"
                onClick={clearAttentionFilter}
                aria-label={`Quitar filtro ${activeAttentionRule.label}`}
              >
                <X size={14} aria-hidden="true" />
                Quitar
              </button>
            </div>
          )}

          {/* Misma franja que el filtro de atención, para el estado elegido en el resumen. */}
          {stateSegment && (
            <div className="inv-attention-filter">
              <span className="inv-attention-filter-copy" role="status" aria-live="polite">
                <span className="inv-attention-filter-label">Filtro de estado</span>
                <strong>{stateSegment.label}</strong>
                <span className="inv-attention-filter-count">
                  {stateResultCount} {stateResultCount === 1 ? 'resultado' : 'resultados'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setStateFilter(null)}
                aria-label={`Quitar filtro ${stateSegment.label}`}
              >
                <X size={14} aria-hidden="true" />
                Quitar
              </button>
            </div>
          )}

          <ErrorBoundary label="Error al cargar inventario">
            {inventoryTab === 'lotes' ? (
              <LotesTable
                lots={inventoryLots}
                filteredLots={visibleInventoryLots}
                onEditLot={onOpenEditLotModal}
                onDeleteLot={onOpenDeleteConfirm}
                allProspectos={allProspectosList}
                onNavigateToProspect={onNavigateToProspect}
              />
            ) : (
              <LoteosTable
                loteos={inventoryLoteos}
                filteredLoteos={visibleInventoryLoteos}
                projects={projects}
                loading={inventoryLoteosLoading}
                onEditLoteo={onOpenEditLoteoModal}
                onDeleteLoteo={onOpenDeleteLoteoDialog}
                onOpenLoteoServices={onOpenLoteoServices}
                onSafeOpen={safeOpen}
                onOpenEditor={onOpenEditor}
              />
            )}
          </ErrorBoundary>
        </Panel>

        {!isVisorOnly && (
          <>
            {/* Fila: pendientes operativos + actividad reciente */}
            <div className="inv-row3">
                <Panel as="section" className="inv-mod inv-attn">
                  <SectionHeader
                    tier="aside"
                    className="inv-mod-head"
                    eyebrow="Control"
                    title="Pendientes operativos"
                    sub="Inconsistencias que requieren una acción"
                  />
                  <div className="inv-alerts">
                    {INVENTORY_ATTENTION_ORDER.map(ruleKey => {
                      const rule = INVENTORY_ATTENTION_RULES[ruleKey];
                      return (
                        <AlertCard
                          key={rule.key}
                          tone={rule.tone}
                          n={stats.attention[rule.key]}
                          label={rule.label}
                          sub={rule.sub}
                          active={attentionFilter === rule.key}
                          onClick={() => handleAttentionSelect(rule.key)}
                          controls="inventory-results"
                        />
                      );
                    })}
                  </div>
                </Panel>

                <Panel as="section" className="inv-mod inv-activity">
                  <ActivityFeed
                    activities={inventoryActivities}
                    sectionTitle="Actividad reciente"
                    sectionSubtitle="Últimos movimientos del inventario"
                  />
                </Panel>
            </div>

            {/* Velocidad de venta */}
            <Panel as="section" className="inv-mod">
              <SectionHeader
                tier="aside"
                className="inv-mod-head"
                eyebrow="Ritmo"
                title="Velocidad de venta"
                sub="Lotes vendidos por mes"
              />
              <SalesVelocityChart months={stats.monthlySales} />
            </Panel>

            {/* Precio promedio */}
            <Panel as="section" className="inv-mod">
                <SectionHeader tier="aside" className="inv-mod-head" eyebrow="Valores" title="Precio promedio" sub="Valores de venta del inventario" />
                <div className="inv-prices">
                  <div className="inv-prices-hero">
                    <div className="inv-k">Precio promedio por m²</div>
                    <div className="inv-pv">{fmtMoney(stats.pricePerM2)}</div>
                    <div className="inv-r">Rango {fmtMoney(stats.minPrice)} – {fmtMoney(stats.maxPrice)} por lote</div>
                    <div className="inv-kpis">
                      <div className="inv-kpi">
                        <div className="inv-kpi-v">{fmtMoney(stats.ticket)}</div>
                        <div className="inv-kpi-l">Ticket prom.</div>
                      </div>
                      <div className="inv-kpi">
                        <div className="inv-kpi-v">{fmtMoney(stats.valorEstimado)}</div>
                        <div className="inv-kpi-l">Valor total</div>
                      </div>
                    </div>
                  </div>
                  {priceBars.length > 0 && (
                    <div className="inv-hbars">
                      {priceBars.map(d => (
                        <div className="inv-hbar" key={d.name}>
                          <span className="inv-hbar-nm" title={d.name}>{d.name}</span>
                          <div className="inv-hbar-track">
                            <i style={{ width: `${Math.max(4, (d.avgPrice / maxBarPrice) * 100)}%` }} />
                          </div>
                          <span className="inv-hbar-v">{fmtMoney(d.avgPrice)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
            </Panel>
          </>
        )}
      </PageLayout>
    </ShellLayout>
  );
}
