# Notry UI

Sistema visual compartido de `plataforma-web`. La dirección es editorial cálida:
Space Grotesk para jerarquía, Outfit para lectura, superficies crema/blancas,
borde antes que sombra y dorado como acento funcional.

## Reglas

- Consumir colores, tipografía, espacio, radio y movimiento desde `tokens/index.css`.
- Usar `PageLayout` + `PageHeader` una vez por ruta principal.
- Usar `SectionHeader` dentro de módulos; nunca como reemplazo del `h1` de página.
- Usar `Panel` para superficies. `compact` es para alta densidad y `raised` sólo
  para elementos realmente elevados.
- Usar `DataToolbar` + `SearchField` en tablas y directorios.
- Usar `SummaryBand` para una lectura principal acompañada por 2–3 métricas.
- Usar `FeedbackState` para loading y errores de página.
- Mantener verde para éxito operativo. Los lotes usan dorado=disponible,
  ámbar=reservado y rojo=vendido.

## Ejemplo de página operativa

```jsx
<PageLayout>
  <PageHeader
    eyebrow="Cartera"
    title="Cobranzas"
    description="Cuotas, vencimientos y saldo pendiente."
    actions={<Button>Nueva operación</Button>}
  />

  <SummaryBand lead={<PortfolioProgress />}>
    <SummaryMetric label="Pendiente" value="$1 M" />
    <SummaryMetric label="Vencidas" value="2" tone="danger" />
    <SummaryMetric label="Activos" value="14" />
  </SummaryBand>

  <Panel as="section" flush>
    <DataToolbar>
      <SearchField
        id="operations-search"
        ariaLabel="Buscar operaciones"
        value={search}
        onChange={event => setSearch(event.target.value)}
      />
    </DataToolbar>
  </Panel>
</PageLayout>
```
