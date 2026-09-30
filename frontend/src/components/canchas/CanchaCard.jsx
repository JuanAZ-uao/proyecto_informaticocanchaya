import { Link } from 'react-router-dom';
import Icono from '../common/Icono';
import iconoServicio from '../../utils/iconoServicio';
import { formateadorMoneda } from '../../utils/formato';

export default function CanchaCard({ cancha }) {
  const serviciosDestacados = (cancha.servicios ?? []).slice(0, 3);

  return (
    <Link to={`/canchas/${cancha.id}`} className="tarjeta-cancha">
      <div className="tarjeta-cancha-media">
        {cancha.imagenUrl ? (
          <img src={cancha.imagenUrl} alt={`Foto de ${cancha.nombre}`} loading="lazy" />
        ) : (
          <div className="media-placeholder">
            <Icono nombre="balon" tamano={48} grosor={1.5} />
          </div>
        )}
        {cancha.tipo && <span className="insignia insignia-acento insignia-izquierda">{cancha.tipo}</span>}
        {cancha.zona && (
          <span className="insignia insignia-vidrio insignia-derecha">
            <Icono nombre="pin" tamano={13} /> {cancha.zona}
          </span>
        )}
      </div>

      <div className="tarjeta-cancha-cuerpo">
        <h3>{cancha.nombre}</h3>
        <p className="tarjeta-cancha-direccion">
          <Icono nombre="pin" tamano={15} /> {cancha.direccion}
        </p>

        {serviciosDestacados.length > 0 && (
          <ul className="tarjeta-cancha-servicios">
            {serviciosDestacados.map((servicio) => (
              <li key={servicio}>
                <Icono nombre={iconoServicio(servicio)} tamano={14} /> {servicio}
              </li>
            ))}
          </ul>
        )}

        <div className="tarjeta-cancha-pie">
          <p className="cancha-precio">
            <strong>{formateadorMoneda.format(cancha.costoHora)}</strong>
            <span>/hora</span>
          </p>
          <span className="tarjeta-cancha-cta">
            Reservar <Icono nombre="flechaDerecha" tamano={16} />
          </span>
        </div>
      </div>
    </Link>
  );
}
