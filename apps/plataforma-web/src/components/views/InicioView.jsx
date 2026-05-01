import React from 'react';
import StatCard from '../StatCard';
import KanbanBoard from '../KanbanBoard';
import ActivityFeed from '../ActivityFeed';
import { ErrorBoundary } from '../../ui/components';

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
        <div className="stats-header">
          <h2>Métricas Clave</h2>
          <p>Resumen de tu desempeño</p>
        </div>
        <div className="stats-grid">
          <StatCard
            label="Lotes Disponibles"
            value={dashboardSummary?.lotes_disponibles ?? '—'}
            color="#c5a059"
            loading={!dashboardSummary}
          />
          <StatCard
            label="Total Prospectos"
            value={dashboardSummary?.total_prospectos ?? '—'}
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
            color="#10b981"
            loading={!allProspectosList || allProspectosList.length === 0}
          />
        </div>
      </div>
      <div className="kanban-section">
        <div className="kanban-header">
          <h2>Gestión de Prospectos</h2>
          <p>Arrastra prospectos entre etapas</p>
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
      <ActivityFeed activities={activities} />
    </>
  );
}
