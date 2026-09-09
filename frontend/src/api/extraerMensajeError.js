export default function extraerMensajeError(error, mensajePorDefecto = 'Ocurrió un error inesperado') {
  const data = error?.response?.data;

  if (data?.errores?.length) {
    return data.errores.map((e) => e.mensaje).join(' | ');
  }

  return data?.mensaje || mensajePorDefecto;
}
