import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { obtenerCanchaPorId } from '../api/canchasApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const formateadorMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function formatearHora(hora) {
  return hora?.slice(0, 5) ?? hora;
}

export default function CanchaDetallePage() {
  const { id } = useParams();
  const [cancha, setCancha] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;

    async function cargarCancha() {
      try {
        const { data } = await obtenerCanchaPorId(id);
        if (activo) setCancha(data.cancha);
      } catch (err) {
        if (activo) setError(extraerMensajeError(err, 'No fue posible cargar el detalle de la cancha'));
      } finally {
        if (activo) setCargando(false);
      }
    }

    cargarCancha();
    return () => {
      activo = false;
    };
  }, [id]);

  return (
    <div>
      <Link to="/canchas" className="enlace-volver">
        &larr; Volver al listado
      </Link>

      <Alerta mensaje={error} />

      {cargando && <p className="estado-carga">Cargando cancha...</p>}

      {!cargando && cancha && (
        <div className="tarjeta detalle-cancha">
          <h1 className="titulo-pagina">{cancha.nombre}</h1>
          <p className="detalle-direccion">{cancha.direccion}</p>
          <p className="detalle-costo">{formateadorMoneda.format(cancha.costoHora)} / hora</p>

          <h2 className="subtitulo">Horarios disponibles</h2>

          {cancha.horarios.length === 0 && (
            <p className="estado-vacio">Esta cancha aún no tiene horarios configurados.</p>
          )}

          {cancha.horarios.length > 0 && (
            <ul className="lista-horarios">
              {cancha.horarios.map((horario, indice) => (
                <li key={indice}>
                  <span className="dia-horario">{NOMBRES_DIA[horario.diaSemana]}</span>
                  <span>
                    {formatearHora(horario.horaInicio)} - {formatearHora(horario.horaFin)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
