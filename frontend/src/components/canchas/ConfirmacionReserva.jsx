import { Link } from 'react-router-dom';
import Icono from '../common/Icono';
import { formatearFechaLarga, formatearHora } from '../../utils/formato';

export default function ConfirmacionReserva({ reserva, onHacerOtraReserva }) {
  return (
    <div className="confirmacion-reserva" role="status" aria-live="polite">
      <div className="confirmacion-encabezado">
        <span className="reserva-exitosa-icono">
          <Icono nombre="check" tamano={28} grosor={3} />
        </span>
        <h3>¡Reserva confirmada!</h3>
        <p>Tu reserva quedó registrada y nadie más podrá tomar esta franja.</p>
      </div>

      <div className="codigo-reserva">
        <span>Código de reserva</span>
        <strong>{reserva.codigo}</strong>
      </div>

      <dl className="resumen-lista">
        <div>
          <dt>Cancha</dt>
          <dd>{reserva.cancha?.nombre}</dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{formatearFechaLarga(reserva.fecha)}</dd>
        </div>
        <div>
          <dt>Hora</dt>
          <dd>
            {formatearHora(reserva.horaInicio)} - {formatearHora(reserva.horaFin)}
          </dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>
            <span className="insignia insignia-estado insignia-confirmada">Confirmada</span>
          </dd>
        </div>
      </dl>

      <div className="acciones-reserva">
        <Link to="/mis-reservas" className="boton-acento boton-bloque boton-grande">
          <Icono nombre="calendario" tamano={18} /> Ver mis reservas
        </Link>
        <button type="button" className="boton-fantasma boton-bloque" onClick={onHacerOtraReserva}>
          Hacer otra reserva
        </button>
      </div>
    </div>
  );
}
