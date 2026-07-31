const TRANSLATIONS = {
  // Auth / autorización
  'Could not validate credentials': 'Sesión inválida. Iniciá sesión nuevamente.',
  'Insufficient permissions': 'Permisos insuficientes.',
  'No access': 'Sin acceso.',

  // Contratos
  'Only advisors or admins can manage contracts': 'Solo asesores o administradores pueden gestionar contratos.',
  'No access to this contract': 'Sin acceso a este contrato.',
  'Contract not found': 'Contrato no encontrado.',
  'Cannot delete contract with registered payments': 'No se puede eliminar un contrato con pagos registrados.',
  'Invalid contract form': 'Datos del contrato inválidos.',
  'No access to lot': 'Sin acceso a este lote.',
  'Lot not found': 'Lote no encontrado.',
  'Prospect not found': 'Prospecto no encontrado.',
  'Installment already paid': 'La cuota ya fue pagada.',
  'Installment not found': 'Cuota no encontrada.',
  'No access to the specified lote_owner_id': 'Sin acceso al propietario especificado.',
  'Entity not found': 'Entidad no encontrada.',
  'Loteo already exists': 'Ya existe un loteo con ese nombre o slug.',
  'Loteo already exists with this name': 'Ya existe un loteo con ese nombre.',
  'Loteo already exists with this slug': 'Ya existe un loteo con ese slug.',
  'Duplicate loteo': 'Ya existe un loteo con esos datos.',
  'At least one of email or phone is required': 'Se requiere al menos un email o teléfono.',
  'At least email or phone is required': 'Se requiere al menos un email o teléfono.',

  // Reportes y activity logs
  'last_days must be one of: 1, 5, 10, 20, 30, 60': 'El parámetro last_days debe ser uno de: 1, 5, 10, 20, 30 o 60.',
  'entity_id requires entity_type': 'Se requiere entity_type al filtrar por entity_id.',

  // Pydantic validation (msg exactos)
  'Input should be greater than 0': 'El valor debe ser mayor que 0.',
  'Input should be greater than or equal to 1': 'El valor debe ser al menos 1.',
  'Field required': 'Campo requerido.',
  'none is not an allowed value': 'Este campo no puede estar vacío.',
};

// Pydantic prefixes — mensajes que empiezan con estas frases pero pueden tener datos variables
const PYDANTIC_PREFIXES = [
  { prefix: 'String should have at most', translation: 'El texto excede el largo máximo.' },
  { prefix: 'Value is not a valid', translation: 'Valor inválido.' },
  { prefix: 'Input should be greater than 0', translation: 'El valor debe ser mayor que 0.' },
  { prefix: 'Input should be greater than or equal to', translation: 'El valor debe ser al menos 1.' },
  { prefix: 'Input should be a valid', translation: 'Valor inválido.' },
];

function translateSingleMsg(msg) {
  if (!msg || typeof msg !== 'string') return null;
  const exact = TRANSLATIONS[msg];
  if (exact) return exact;
  for (const { prefix, translation } of PYDANTIC_PREFIXES) {
    if (msg.startsWith(prefix)) return translation;
  }
  return null;
}

/**
 * Convierte cualquier rawDetail de la API en un mensaje legible en español.
 *
 * @param {string | Array | undefined} rawDetail — el campo `detail` de la respuesta de error,
 *   o una string de fallback como "HTTP 500".
 * @returns {string} Mensaje listo para mostrar al usuario.
 */
export function getErrorMessage(rawDetail) {
  if (!rawDetail) return 'Error inesperado. Intentá de nuevo.';

  // Array: errores de validación Pydantic (422)
  if (Array.isArray(rawDetail)) {
    const msgs = rawDetail
      .map(item => translateSingleMsg(item?.msg) || item?.msg)
      .filter(Boolean);
    return msgs.length > 0 ? msgs.join('; ') : 'Error de validación.';
  }

  if (typeof rawDetail !== 'string') return 'Error inesperado. Intentá de nuevo.';

  // PostgreSQL/async drivers sometimes expose the constraint instead of the
  // domain error. Keep this detail out of the UI and map it to an actionable
  // message until the backend returns a stable 409 contract.
  if (/duplicate key|unique constraint|already exists/i.test(rawDetail)) {
    return 'Ya existe un loteo con ese nombre o slug.';
  }
  if (/email.*phone|phone.*email/i.test(rawDetail) && /required|requir|neces|at least/i.test(rawDetail)) {
    return 'Se requiere al menos un email o teléfono.';
  }

  const translated = translateSingleMsg(rawDetail);
  if (translated) return translated;

  return rawDetail;
}
