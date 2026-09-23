import { Link } from 'react-router-dom';

export default function CanchaCard({ cancha }) {
  const precioFormateado = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(cancha.costoHora);

  return (
    <Link to={`/canchas/${cancha.id}`} className="tarjeta tarjeta-cancha">
      <h3>{cancha.nombre}</h3>
      <p>{cancha.direccion}</p>
      {cancha.zona && <p>Zona: {cancha.zona}</p>}
      <p className="cancha-precio">{precioFormateado} / hora</p>
    </Link>
  );
}
