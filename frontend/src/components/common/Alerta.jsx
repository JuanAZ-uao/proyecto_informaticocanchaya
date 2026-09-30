import Icono from './Icono';

export default function Alerta({ tipo = 'error', mensaje }) {
  if (!mensaje) return null;

  const esExito = tipo === 'exito';

  return (
    <div className={esExito ? 'mensaje-exito' : 'mensaje-error'} role={esExito ? 'status' : 'alert'}>
      <Icono nombre={esExito ? 'check' : 'alerta'} tamano={18} />
      <span>{mensaje}</span>
    </div>
  );
}
