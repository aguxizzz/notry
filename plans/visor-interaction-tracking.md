# Plan: Tracking de interacciones del visor → Análisis

## Contexto

Hoy el visor público solo trackea el **embudo de conversión** (`session_start`,
`lote_click`, `whatsapp_click`, `form_open`, `form_submit`) vía `visor_events`
(back: `app/models/visor_event.py`, endpoint `POST /public/visor-events`,
agregado en `GET /loteos/{id}/funnel`). Eso alimenta `FunnelCard` en Análisis
[[feedback_funnel_redesign_direction]] — ya resuelto y commiteado.

Falta capturar **el resto de la actividad del visitante** durante la visita, no
solo los pasos de conversión, para dar información más rica y dinámica a la
página de Análisis. Cuatro ejes acordados:

1. Navegación entre etapas/panoramas (qué stages explora, cuánto tiempo)
2. Interacción con POIs (marcadores que no son lotes: amenities, referencias)
3. Profundidad de sesión (duración, cantidad de panoramas vistos)
4. Interés pasivo vs activo (lotes vistos pero nunca clickeados)

## v1 vs v2: qué tan precisas son estas métricas

Ninguna de las dos simplificaciones de abajo es una medición exacta — son
proxies razonables para arrancar, con sesgos conocidos. Se documentan
explícitamente para no venderlas como más precisas de lo que son, y para dejar
un camino claro a v2 si el dato de v1 no alcanza.

### Punto 4 — interés pasivo (lot_interest)

**v1 (proxy, sin evento nuevo)**:

```
lotes_sin_interacción = total_lotes(loteo) − lotes_distintos_con_click(loteo, período)
```

Ya existe `lote_clicks` (`app/models/lote_click.py`) con `clicked_at` — alcanza
con una query nueva, sin tocar el modelo de eventos ni el frontend del visor.

**Lo que en realidad mide**: tasa de click por lote (CTR), no visualización
real. No hay evento que confirme que el visitante *vio* el marcador — en un
panorama 360° puede estar fuera del campo de visión inicial. Además es
agregado por loteo/período, no por sesión: mezcla "nadie vio nunca este lote"
con "lo vieron muchas sesiones pero no les interesó" bajo el mismo número.
Por eso en el response y en la UI se etiqueta como **"tasa de interacción por
lote"**, no como "interés pasivo" — el nombre no debe prometer más precisión
que la que tiene el dato.

**v2 (medición real, no incluida en este plan)**: evento de impresión real —
detectar cuándo un marcador entra al campo de visión de la cámara (el
markers-plugin de PSV expone visibilidad de markers) y disparar un evento una
vez por sesión por lote (deduplicado). Evaluar después de ver si el proxy v1
ya responde la pregunta de negocio.

### Punto 1 — dwell time por etapa (stage_visits)

**v1 (proxy, sin columna nueva)**: si cada cambio de etapa dispara un evento
`stage_change`, el tiempo en la etapa A se aproxima restando `created_at` del
siguiente evento de esa sesión menos el `created_at` de la entrada a A.

**Lo que en realidad mide**: un piso (cota inferior), no el tiempo real de
atención. Dos sesgos conocidos:
- La **última etapa de cada sesión nunca tiene evento siguiente** → su dwell
  time queda sin medir y se excluye del promedio (sesgo estructural: suele
  ser justo la etapa donde más se quedaron).
- Sin heartbeat ni Page Visibility API, una pestaña inactiva/AFK cuenta como
  atención real — sin cap de outliers, una sesión con la pestaña abierta 40
  minutos infla el promedio de esa etapa.

`avg_dwell_seconds` en el response/UI se etiqueta como aproximado (ej. tooltip
"estimado, cota inferior") para dejar esto claro.

**v2 (medición real, no incluida en este plan)**: heartbeat periódico mientras
la pestaña está visible (pausado con `visibilitychange`) + evento de cierre
real con `sendBeacon` que cubra también la última etapa de la sesión.

## Bug de paso: POI clicks no se trackean en ningún lado

`ViewerExperience.jsx` llama `postLoteClick(marker.id)` también para POIs
(`handleMarkerSelect`/`handleBlueprintSelect`), pero ese endpoint espera un
`Lote` real → 404 silencioso. El schema ya soporta `target_type: "poi"` pero
nunca se envía. Esto se corrige como parte del punto 2, no es trabajo extra.

## Diseño

### Backend (`notry-back`)

**1. Extender el enum de eventos** — `app/schemas/public.py`, `VisorEventRequest.event_type`:
añadir `"stage_change"` y `"poi_click"` al `Literal` existente (sin migración,
la columna ya es `String(30)`).

**2. Nuevo endpoint de agregación** — `GET /loteos/{loteo_id}/engagement`
(mismo patrón que `/funnel`: `last_days` de la tupla fija, filtra por
`loteo_id` + rango de fechas). Devuelve (campos `_estimado`/`avg_dwell_seconds`
marcados como v1/aproximado en la doc del endpoint, no solo en el nombre):

```jsonc
{
  "stage_visits": [{ "stage_id", "stage_name", "sessions", "avg_dwell_seconds" }], // v1: cota inferior, ver caveats arriba
  "poi_clicks":   [{ "poi_id", "poi_name", "clicks" }],
  "session_depth": { "avg_stages_per_session", "avg_duration_seconds", "sessions_total" }, // avg_duration_seconds: mismo caveat que dwell time
  "lot_interest":  { "total_lotes", "lotes_con_click", "lotes_sin_interaccion", "tasa_interaccion" } // v1: CTR por lote, no visualización real
}
```

Endpoint separado del `/funnel` existente (no lo tocamos) para no romper su
contrato hardcodeado de 5 claves.

### Frontend visor (`apps/visor`)

**3. Disparar `stage_change`** en `goToStage` (`ViewerExperience.jsx`,
alrededor de la línea 267) — mismo `trackEvent` que ya se usa, sin lógica
nueva del lado cliente.

**4. Corregir + agregar `poi_click`** en `handleMarkerSelect` y
`handleBlueprintSelect` (líneas ~385-452): cuando el marker es un POI, dejar
de llamar `postLoteClick` (elimina el 404 silencioso) y llamar
`trackEvent(stageId, 'poi_click', { type: 'poi', id: marker.id })` en su lugar.

**Fuera de alcance para el v1** (para no meter riesgo/complejidad innecesaria):
duración de sesión vía `sendBeacon`/`beforeunload` para capturar el cierre
exacto de pestaña. `session_depth.avg_duration_seconds` v1 se aproxima con
`max(created_at) − min(created_at)` por `session_id` sobre los eventos ya
existentes — más simple, sin endpoint/listener nuevo, con la limitación
conocida de que subestima si el visitante no interactúa después del último
evento. Si el dato no alcanza, se agrega `session_end` + `sendBeacon` después
como mejora incremental.

### Frontend plataforma-web (`apps/plataforma-web`)

**5. Card nueva "Exploración"/"Interacción"** en Análisis, mismo patrón que
`HeatmapCard`/`TopLotsPanel` (props `isLoading`, `*FocusedIdx`/`onFocusChange`
para navegación por teclado).

**6. Caching**: replicar el patrón de `funnel` — estado `engagementCache` +
`engagementLoadingIds` en `App.jsx`, fetch en `api/reports.js`
(`buildAnalisisCallbacks`), `useEffect` en `AnalisisView.jsx` con key
`` `${loteoId}:${lastDays}` `` que dispara `onRequestEngagement` si falta en cache.

## Orden de implementación (un módulo por vez, valido cada uno antes de seguir)

1. ✅ Backend: enum + endpoint `/engagement` con los 4 bloques de datos.
   Commiteado (`notry-back` `411214a`). Probado con curl contra datos reales.
2. ✅ Visor: `stage_change` + fix de `poi_click`. Sin commitear (política
   front). Validado con curl end-to-end contra un backend local.
3. ✅ Plataforma-web: `EngagementCard` + wiring de caching en Análisis
   (`App.jsx`, `api/reports.js`, `AnalisisView.jsx`). Sin commitear. Probado
   visualmente con datos reales (org de testeo `aguxis@a.a`) contra backend
   local — encontró y corrigió un bug de redondeo en `fmtDuration` ("28m 60s"
   en vez de "29m 0s").

## Fuera de alcance / decisiones abiertas para más adelante

- Rate limiting en `/public/visor-events` (endpoint público sin auth, hoy sin
  límite) — no es parte de este trabajo pero vale mencionarlo si el volumen de
  eventos crece con `stage_change`/`poi_click` sumados al embudo.
- Agrupar `stage_visits` por proyecto/loteo-grupo (etapas) en vez de por
  loteo individual — depende del estado de [[project_etapas_loteos]] (M2-4
  frontend pendiente); el plan de arriba agrega por loteo suelto, que es lo
  que ya soporta `/funnel` hoy.
