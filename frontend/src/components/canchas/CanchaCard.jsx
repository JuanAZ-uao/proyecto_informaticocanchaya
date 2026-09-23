import { Link } from 'react-router-dom';

export default function CanchaCard({ cancha }) {
  return (
    <Link to={`/canchas/${cancha.id}`} className="tarjeta tarjeta-cancha">
      <h3>{cancha.nombre}</h3>
      <p>{cancha.direccion}</p>
    </Link>
  );
}
