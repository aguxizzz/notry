import React from 'react';
import StatCard from '../StatCard';
import KanbanBoard from '../KanbanBoard';
import ActivityFeed from '../ActivityFeed';
import { ErrorBoundary } from '../../ui/components';
import { BarChart3, LayoutGrid, TrendingUp, Columns } from 'lucide-react';
import './InicioView.css';

export default function InicioView({
  dashboardSummary,
  allProspectosList,
  inventoryLoteos,
  inventoryLots,
  advisorsList,
  token,
  onSessionExpired,
  onUpdateProspectCategory,
  activities = [],
}) {

  return (
    <>
      <div className="stats-section">
        <div className="stats-header has-deco-icon">
          <BarChart3 className="section-deco-icon" size={72} />
          <div className="stats-header-eyebrow">Dashboard</div>
          <h2>Métricas Clave</h2>
          <p className="stats-header-sub">Resumen de tu desempeño</p>
        </div>
        <div className="stats-grid">
          <StatCard
            label="Lotes Disponibles"
            value={dashboardSummary?.lotes_disponibles ?? '—'}
            subtitle="Lotes listos para venta"
            color="#c5a059"
            loading={!dashboardSummary}
          />
          <StatCard
            label="Total Prospectos"
            value={dashboardSummary?.total_prospectos ?? '—'}
            subtitle="Clientes en seguimiento"
            color="#3b82f6"
            loading={!dashboardSummary}
          />
          <StatCard
            label="Tasa de Conversión"
            value={
              allProspectosList && allProspectosList.length > 0
                ? `${((allProspectosList.filter(p => ['negociacion', 'vendido'].includes(p.category)).length / allProspectosList.length) * 100).toFixed(1)}%`
                : '—'
            }
            subtitle="Negociados + Vendidos"
            color="#10b981"
            loading={!allProspectosList}
          />
        </div>
      </div>
      <div className="kanban-section">
        <div className="kanban-header has-deco-icon">
          <Columns className="section-deco-icon" size={72} />
          <div className="stats-header-eyebrow">Pipeline</div>
          <h2>Gestión de Prospectos</h2>
          <p className="kanban-header-sub">Arrastra prospectos entre etapas</p>
        </div>
        <ErrorBoundary label="Error en el tablero Kanban">
          <KanbanBoard
            token={token}
            onSessionExpired={onSessionExpired}
            prospectosList={allProspectosList}
            loteos={inventoryLoteos}
            advisorsList={advisorsList}
            onUpdateProspectCategory={onUpdateProspectCategory}
          />
        </ErrorBoundary>
      </div>
      <ActivityFeed activities={activities} sectionTitle="Actividad Reciente" sectionEyebrow="Feed" sectionSubtitle="Últimas acciones del equipo" />
    </>
  );
}
