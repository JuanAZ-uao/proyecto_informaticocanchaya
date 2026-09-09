export default function Alerta({ tipo = 'error', mensaje }) {
  if (!mensaje) return null;

  const clase = tipo === 'exito' ? 'mensaje-exito' : 'mensaje-error';
  return <div className={clase}>{mensaje}</div>;
}
