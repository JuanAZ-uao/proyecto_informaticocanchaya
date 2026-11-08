const TABLA = 'metodos_pago';

function aDominio(fila) {
  if (!fila) return null;

  return {
    id: fila.id,
    usuarioId: fila.usuario_id,
    token: fila.token,
    marca: fila.marca,
    ultimos4: fila.ultimos4,
    titular: fila.titular,
    vencimientoMes: fila.vencimiento_mes,
    vencimientoAnio: fila.vencimiento_anio,
    createdAt: fila.created_at,
  };
}

// Lo único que sale de la API: la tarjeta enmascarada. Nunca el token de la pasarela.
function aPublico(metodo) {
  return {
    id: metodo.id,
    marca: metodo.marca,
    ultimos4: metodo.ultimos4,
    titular: metodo.titular,
    vencimiento: `${String(metodo.vencimientoMes).padStart(2, '0')}/${String(metodo.vencimientoAnio).slice(-2)}`,
    createdAt: metodo.createdAt,
  };
}

module.exports = { TABLA, aDominio, aPublico };
