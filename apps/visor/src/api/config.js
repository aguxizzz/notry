// Permite probar el visor contra un backend local sin modificar el build de
// producción. Vite reemplaza esta variable al iniciar/construir la app.
export const API_BASE = import.meta.env.VITE_API_BASE || 'https://notry-back.vercel.app/api/v1';
