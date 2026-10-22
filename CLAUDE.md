# notry-front

Monorepo de frontend (npm workspaces). Frontend del proyecto **Not Royaltor360**.

## Backend

El backend vive en `../notry-back` (FastAPI + SQLAlchemy 2 + PostgreSQL + Alembic + JWT).
Tiene su propio `CLAUDE.md` con detalles. Si una tarea toca front y back, leer ambos.

- API en producción: `https://notry-back.vercel.app/api/v1`
- Configurada en [apps/plataforma-web/src/config.js](apps/plataforma-web/src/config.js) y
  [apps/editor/src/api/config.js](apps/editor/src/api/config.js) (`API_BASE`), vía `import.meta.env.VITE_API_BASE`
  con fallback a producción.
- `npm run dev` → apunta a producción (default). `npm run dev:local` → apunta al backend local
  (`http://localhost:8000/api/v1`, requiere `notry-back` corriendo).

## Apps (`apps/*`)

| App | Qué es |
|-----|--------|
| `plataforma-web` | Plataforma de gestión (auth, prospectos, lotes, loteos, equipos). Consume la API. |
| `visor` | Visor 360 público de lotes (Photo Sphere Viewer). Deploy en Vercel (`apps/visor/vercel.json`). |
| `editor` | Editor/calibrador blueprint↔panorama. Herramienta de dev. |
| `visor-deptos` | Prototipo de visor de unidades de un edificio (fachada → planta → ficha). Datos mock en `src/data.js`, sin API ni PSV. Puerto 5178. |
| `editor-deptos` | Editor de edificios para `visor-deptos`: pisos, imagen por piso, alineación contra el plano original (overlay con opacidad) y polígonos por unidad. Consume `/api/v1/buildings` (login propio, `X-Active-Org-Id` para super_admin). Puerto 5179. |

Stack común: Vite 8 + React 19 + `@photo-sphere-viewer/core` y `markers-plugin`.

## Comandos (correr dentro de cada app, ej. `apps/plataforma-web/`)

```bash
npm run dev       # servidor de desarrollo (Vite)
npm run build     # build de producción
npm run lint      # eslint (no existe en visor)
npm run preview   # previsualizar build
npm run test      # vitest en editor (proyección, streetPath, payload de guardado) y editor-deptos (guardado optimista)
```

En el editor, los tests van al lado del módulo (`*.test.js`). `src/test/syntheticCamera.js` arma una
cámara con geometría conocida para testear la proyección contra la verdad, no contra la propia implementación.

## Testeo visual (Playwright)

Playwright está instalado en la raíz con su **Chromium propio** (no usa Brave/Chrome del sistema).
Sirve para levantar la app, navegarla, sacar capturas y depurar bugs visuales.

```bash
# 1. Levantar el server (en la app que toque), correr en background:
cd apps/plataforma-web && npm run dev          # queda en http://localhost:5173

# 2. Sacar una captura con el helper:
node scripts/shot.mjs http://localhost:5173 /tmp/home.png
node scripts/shot.mjs http://localhost:5173/login /tmp/login.png --full
node scripts/shot.mjs http://localhost:5173 /tmp/mobile.png --mobile
```

Flags de `scripts/shot.mjs`: `--full` (página completa), `--mobile`, `--width=`, `--height=`, `--wait=<ms>`,
`--login` (loguea antes de capturar, usando `TEST_EMAIL`/`TEST_PASSWORD` o la cuenta de testeo por default).

`scripts/lib/` tiene helpers reusables entre las 3 apps para escribir otros scripts de Playwright
sin repetir boilerplate: `browser.mjs` (parseo de flags, viewport, lanzar Chromium) y `auth.mjs`
(`login(page, { email, password })`, genérico porque selecciona por `type` de input, no por id).
No es un framework de tests — es deliberadamente chico, para scripts de debugging ad-hoc.

## Convención de commits

Al terminar un bloque de trabajo, **hacer commit** (no pushear — el push lo hace el usuario).
Aplica también al backend.
