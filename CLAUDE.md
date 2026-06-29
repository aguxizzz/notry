# notry-front

Monorepo de frontend (npm workspaces). Frontend del proyecto **Not Royaltor360**.

## Backend

El backend vive en `../notry-back` (FastAPI + SQLAlchemy 2 + PostgreSQL + Alembic + JWT).
Tiene su propio `CLAUDE.md` con detalles. Si una tarea toca front y back, leer ambos.

- API en producción: `https://notry-back.onrender.com/api/v1`
- Configurada en [apps/plataforma-web/src/config.js](apps/plataforma-web/src/config.js) (`API_BASE`).

## Apps (`apps/*`)

| App | Qué es |
|-----|--------|
| `plataforma-web` | Plataforma de gestión (auth, prospectos, lotes, loteos, equipos). Consume la API. |
| `visor` | Visor 360 público de lotes (Photo Sphere Viewer). Deploy en Vercel (`apps/visor/vercel.json`). |
| `editor` | Editor/calibrador blueprint↔panorama. Herramienta de dev. |

Stack común: Vite 8 + React 19 + `@photo-sphere-viewer/core` y `markers-plugin`.

## Comandos (correr dentro de cada app, ej. `apps/plataforma-web/`)

```bash
npm run dev       # servidor de desarrollo (Vite)
npm run build     # build de producción
npm run lint      # eslint (no existe en visor)
npm run preview   # previsualizar build
```

- El **editor** usa el flag `VITE_CALIBRATION=true` en `apps/editor/.env.local` (git-ignored)
  para habilitar la UI de calibración. Dejar UNSET en producción/Vercel.

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

Flags de `scripts/shot.mjs`: `--full` (página completa), `--mobile`, `--width=`, `--height=`, `--wait=<ms>`.
Para flujos detrás de login hace falta loguearse (credenciales de prueba o token) o mockear la API.

## Convención de commits

Al terminar un bloque de trabajo, **hacer commit** (no pushear — el push lo hace el usuario).
Aplica también al backend.
