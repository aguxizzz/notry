import React from 'react';
import StatCard from '../StatCard';
import KanbanBoard from '../KanbanBoard';
import { ErrorBoundary } from '../../ui/components';

export default function InicioView({
  dashboardSummary,
  allProspectosList,
  inventoryLoteos,
  advisorsList,
  token,
  onSessionExpired,
  onUpdateProspectCategory,
}) {
  return (
    <>
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
            dashboardSummary && dashboardSummary.total_lotes > 0
              ? `${((dashboardSummary.total_prospectos / dashboardSummary.total_lotes) * 100).toFixed(1)}%`
              : '—'
          }
          color="#10b981"
          loading={!dashboardSummary}
        />
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
    </>
  );
}
