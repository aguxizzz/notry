// Límites espejo de app/schemas/lote.py (columnas Numeric del backend),
// para dar feedback antes de enviar el guardado masivo (bulk-save).
export const MAX_LOTE_PRICE = 9999999999.99; // Numeric(14, 2)
export const MAX_LOTE_AREA_M2 = 99999999.99; // Numeric(10, 2)
