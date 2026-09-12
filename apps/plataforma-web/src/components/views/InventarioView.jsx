import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, CircleDollarSign, Plus, Ticket, X } from 'lucide-react';
import {
  Button,
  ErrorBoundary,
  PageHeader,
  PageLayout,
  Panel,
  SectionHeader,
  SummaryBand,
  SummaryMetric,
} from '../../ui/components';
import ActivityFeed from '../ActivityFeed';
import ShellLayout from '../ShellLayout';
import { INVENTORY_ACTIVITY_TYPES } from '../inventory/constants';
import {
  computeInventoryStats,
  fmtInt,
  fmtMoney,
} from '../inventory/inventoryStats';
import { useWheelToHorizontal } from '../inventory/useWheelToHorizontal';
import StateRing from '../inventory/StateRing';
import DonutCard from '../inventory/DonutCard';
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
  onOpenEditor,
  safeOpen,
  onOpenShareLoteo,
  allProspectosList,
  onNavigateToProspect,
  contractsState,
}) {
  const [attentionFilter, setAttentionFilter] = useState(null);
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
    return activeAttentionRule?.tab === 'lotes'
      ? filterByInventoryAttention(base, attentionFilter, attentionContext)
      : filteredInventoryLots;
  }, [activeAttentionRule, attentionFilter, attentionContext, filteredInventoryLots, inventoryLots]);

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
    onTabChange(nextTab);
  };

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
    setAttentionFilter(ruleKey);
  };

  const dgridRef = useWheelToHorizontal();
  const donuts = stats.distribution.slice(0, 12);
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
          title="Inventario"
          description="Controlá disponibilidad, valores y pendientes de lotes y loteos."
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

        <SummaryBand
          className="inv-summary"
          aria-label="Resumen del inventario"
          lead={
            <div className="inv-summary-lead">
              <span className="inv-summary-eyebrow">Composición por estado</span>
              <div className="inv-pie-wrap">
                <StateRing
                  counts={{ available: stats.available, reserved: stats.reserved, sold: stats.sold, unavailable: stats.unavailable }}
                  availablePct={stats.availablePct}
                />
                <div className="inv-ring-legend">
                  <span className="inv-lk" style={{ '--c': 'var(--badge-available)' }}>
                    <span className="inv-lk-d" />Disponibles <b>{stats.available}</b>
                  </span>
                  <span className="inv-lk" style={{ '--c': 'var(--color-stat-reserved)' }}>
                    <span className="inv-lk-d" />Reservados <b>{stats.reserved}</b>
                  </span>
                  <span className="inv-lk" style={{ '--c': 'var(--badge-sold)' }}>
                    <span className="inv-lk-d" />Vendidos <b>{stats.sold}</b>
                  </span>
                  <span className="inv-lk" style={{ '--c': 'var(--badge-unavailable)' }}>
                    <span className="inv-lk-d" />No disponibles <b>{stats.unavailable}</b>
                  </span>
                </div>
              </div>
            </div>
          }
        >
          <SummaryMetric
            icon={<Boxes size={17} />}
            label="Total de lotes"
            hint="inventario registrado"
            value={fmtInt(stats.total)}
          />
          <SummaryMetric
            icon={<CircleDollarSign size={17} />}
            label="Valor estimado"
            hint="valor total publicado"
            value={fmtMoney(stats.valorEstimado)}
          />
          <SummaryMetric
            icon={<Ticket size={17} />}
            label="Ticket promedio"
            hint="promedio por lote"
            value={fmtMoney(stats.ticket)}
          />
        </SummaryBand>

        {/* Tabla de gestión */}
        <Panel
          as="section"
          id="inventory-results"
          ref={inventoryPanelRef}
          className="inventory-panel"
          flush
        >
          <SectionHeader
            className="inv-phead"
            eyebrow="Gestión"
            title={inventoryTab === 'lotes' ? 'Lotes' : 'Loteos'}
            sub={inventoryTab === 'lotes'
              ? 'Disponibilidad, valores y prospectos asociados'
              : 'Desarrollos, publicación y configuración del visor'}
          />
          <InventarioControls
            inventoryTab={inventoryTab}
            onTabChange={handleTabChange}
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
          />

          {activeAttentionRule && (
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
                onSafeOpen={safeOpen}
                onOpenEditor={onOpenEditor}
                onOpenShareLoteo={onOpenShareLoteo}
              />
            )}
          </ErrorBoundary>
        </Panel>

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

        {/* Distribución por loteo */}
        {donuts.length > 0 && (
            <Panel as="section" className="inv-mod">
              <SectionHeader
                tier="aside"
                className="inv-mod-head"
                eyebrow="Ocupación"
                title="Distribución por loteo"
                sub="Estado de los lotes en cada loteo"
                actions={
                  <div className="inv-dlegend">
                    <span className="inv-lk" style={{ '--c': 'var(--badge-available)' }}><span className="inv-lk-d" />Disp.</span>
                    <span className="inv-lk" style={{ '--c': 'var(--color-stat-reserved)' }}><span className="inv-lk-d" />Res.</span>
                    <span className="inv-lk" style={{ '--c': 'var(--badge-sold)' }}><span className="inv-lk-d" />Vend.</span>
                  </div>
                }
              />
              <div className="inv-dgrid" ref={dgridRef}>
                {donuts.map(d => (
                  <DonutCard key={d.name} name={d.name} total={d.total} available={d.available} reserved={d.reserved} sold={d.sold} unavailable={d.unavailable} availablePct={d.availablePct} />
                ))}
              </div>
            </Panel>
        )}

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
      </PageLayout>
    </ShellLayout>
  );
}
