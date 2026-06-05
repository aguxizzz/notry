// Feature flags. Toggled via Vite env vars (VITE_*).
//
// CALIBRATION_ENABLED: gates the blueprint↔panorama calibration tooling.
// Enable it locally by setting VITE_CALIBRATION=true in apps/editor/.env.local
// (git-ignored via *.local). It stays OFF in production/Vercel because the var
// is left unset there, so the calibration UI ships in the bundle but is hidden.
export const CALIBRATION_ENABLED = import.meta.env.VITE_CALIBRATION === 'true';
