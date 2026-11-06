// Ayudas del formulario de tarjeta (US-28). Solo dan formato a lo que se escribe: la validación de verdad
// (Luhn, vencimiento, CVV) la hace el servidor, y el número y el CVV nunca se guardan en el navegador.

// "4242424242424242" -> "4242 4242 4242 4242" (hasta 19 dígitos)
export function formatearNumeroTarjeta(texto) {
  const digitos = String(texto ?? '').replace(/\D/g, '').slice(0, 19);
  return digitos.replace(/(\d{4})(?=\d)/g, '$1 ');
}

// "1230" -> "12/30"; escribir solo el mes ("12") no agrega la barra hasta que hay más dígitos.
export function formatearVencimiento(texto) {
  const digitos = String(texto ?? '').replace(/\D/g, '').slice(0, 4);
  return digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos;
}

// "12/30" -> { vencimientoMes: '12', vencimientoAnio: '30' }
export function separarVencimiento(texto) {
  const [mes = '', anio = ''] = String(texto ?? '').split('/');
  return { vencimientoMes: mes, vencimientoAnio: anio };
}

// Los datos de tarjeta solo deben escribirse en una conexión cifrada: HTTPS, o localhost durante el desarrollo.
export function esConexionSegura() {
  const { protocol, hostname } = window.location;
  return protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}
