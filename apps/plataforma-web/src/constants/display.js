export const STATUS_DISPLAY = {
  available: 'disponible',
  reserved: 'reservado',
  sold: 'vendido',
};

export const CATEGORY_DISPLAY = {
  primer_contacto: 'Primer Contacto',
  seguimiento: 'Seguimiento',
  negociacion: 'Negociación',
  vendido: 'Vendido',
};

export const ORIGIN_DISPLAY = {
  web_platform:   'Plataforma Web',
  visor_direct:   'Visor · Directo',
  visor_whatsapp: 'Visor · WhatsApp',
  visor_google:   'Visor · Google',
  visor_tiktok:   'Visor · TikTok',
  visor_facebook: 'Visor · Facebook',
  visor_youtube:  'Visor · YouTube',
};

// Mismos canales que ORIGIN_DISPLAY pero sin el prefijo "Visor ·" — para
// contextos que ya están adentro del visor (ej. el filtro de canal del
// embudo de conversión). `unknown` es el bucket que arma el backend para
// sesiones sin canal detectado (datos previos a que se empezara a trackear).
export const CHANNEL_DISPLAY = {
  visor_whatsapp: 'WhatsApp',
  visor_direct: 'Directo',
  visor_google: 'Google',
  visor_tiktok: 'TikTok',
  visor_facebook: 'Facebook',
  visor_youtube: 'YouTube',
  web_platform: 'Plataforma',
  unknown: 'Sin datos',
};
