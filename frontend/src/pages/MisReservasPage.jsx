import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { obtenerMisReservas } from '../api/reservasApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
import Icono from '../components/common/Icono';
import { formatearFechaLarga, formatearHora } from '../utils/formato';

const ETIQUETA_ESTADO = {
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
};

export default function MisReservasPage() {
  const [reservas, setReservas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;

    async function cargarReservas() {
      try {
        const { data } = await obtenerMisReservas();
        if (activo) setReservas(data.reservas);
      } catch (err) {
        if (activo) setError(extraerMensajeError(err, 'No fue posible cargar tus reservas'));
      } finally {
        if (activo) setCargando(false);
      }
    }

    cargarReservas();
    return () => {
      activo = false;
    };
  }, []);

  return (
    <div className="contenedor seccion-espaciada">
      <div className="seccion-encabezado seccion-encabezado-pagina">
        <div>
          <h1 className="titulo-pagina">Mis reservas</h1>
          <p className="texto-ayuda">Aquí aparecen todas las reservas que has hecho, con su código y estado.</p>
        </div>
        {!cargando && !error && (
          <span className="contador">
            {reservas.length} {reservas.length === 1 ? 'reserva' : 'reservas'}
          </span>
        )}
      </div>

      <Alerta mensaje={error} />

      {cargando && <p className="estado-carga">Cargando tus reservas...</p>}

      {!cargando && !error && reservas.length === 0 && (
        <div className="estado-vacio">
          <Icono nombre="calendario" tamano={40} grosor={1.5} />
          <h3>Aún no tienes reservas</h3>
          <p>Elige una cancha y reserva tu primer turno.</p>
          <Link to="/canchas" className="boton-acento">
            Ver canchas
          </Link>
        </div>
      )}

      {!cargando && reservas.length > 0 && (
        <ul className="lista-mis-reservas">
          {reservas.map((reserva) => (
            <li key={reserva.id} className={`mi-reserva mi-reserva-${reserva.estado}`}>
              <div className="mi-reserva-principal">
                <Link to={`/canchas/${reserva.cancha.id}`} className="mi-reserva-cancha">
                  {reserva.cancha.nombre}
                </Link>
                <p className="mi-reserva-dato">
                  <Icono nombre="calendario" tamano={15} /> {formatearFechaLarga(reserva.fecha)}
                </p>
                <p className="mi-reserva-dato">
                  <Icono nombre="reloj" tamano={15} /> {formatearHora(reserva.horaInicio)} -{' '}
                  {formatearHora(reserva.horaFin)}
                </p>
              </div>
              <div className="mi-reserva-lateral">
                <span className={`insignia insignia-estado insignia-${reserva.estado}`}>
                  {ETIQUETA_ESTADO[reserva.estado] ?? reserva.estado}
                </span>
                <span className="mi-reserva-codigo">{reserva.codigo}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
