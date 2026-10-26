import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // design-lab/ son prototipos sueltos; visor_data y fotos son fixtures.
  globalIgnores(['dist', 'design-lab', 'visor_data', 'fotos_equirrectangulares']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: { react },
    rules: {
      // Sin esta regla, no-unused-vars no ve el uso de componentes en JSX.
      'react/jsx-uses-vars': 'error',
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      // Temporal: quedan casos en LotPanel (paso 4 del refactor), Compass,
      // LoadingScreen, BlueprintViewer, OnboardingOverlay y SatelliteViewer.
      // Volver a 'error' cuando estén resueltos.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  // Corren en Node (scripts de Playwright, edge function de OG, middleware de Vercel).
  {
    files: ['scripts/**', 'api/**', 'middleware.js', '*.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
])
