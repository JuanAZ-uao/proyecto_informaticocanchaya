// Errores de validación por campo ({ campo, mensaje }) convertidos en { campo: mensaje } para mostrarlos junto a cada input.
export function erroresPorCampo(error) {
  const lista = error?.response?.data?.errores;
  if (!Array.isArray(lista)) return {};

  return Object.fromEntries(lista.filter((e) => e?.campo).map((e) => [e.campo, e.mensaje]));
}

export default function extraerMensajeError(error, mensajePorDefecto = 'Ocurrió un error inesperado') {
  const data = error?.response?.data;

  if (data?.errores?.length) {
    return data.errores.map((e) => e.mensaje).join(' | ');
  }

  return data?.mensaje || mensajePorDefecto;
}
