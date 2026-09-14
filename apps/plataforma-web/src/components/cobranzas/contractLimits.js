// Límites espejo de app/schemas/contract.py (columnas Numeric del backend),
// para dar feedback antes de enviar el request y evitar depender solo del 4xx del server.
export const MAX_CONTRACT_AMOUNT = 9999999999.99; // Numeric(14, 2)
export const MAX_INTEREST_RATE_PERCENT = 99.9999; // Numeric(6, 4)
