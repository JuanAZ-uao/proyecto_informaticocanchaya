import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { obtenerBloquesOcupados, obtenerCanchaPorId } from '../api/canchasApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DURACION_BLOQUE_MIN = 60;

const formateadorMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const formateadorFecha = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatearHora(hora) {
  return hora?.slice(0, 5) ?? hora;
}

function aMinutos(hora) {
  const [horas, minutos] = hora.split(':').map(Number);
  return horas * 60 + minutos;
}

function aHora(totalMinutos) {
  const horas = String(Math.floor(totalMinutos / 60)).padStart(2, '0');
  const minutos = String(totalMinutos % 60).padStart(2, '0');
  return `${horas}:${minutos}`;
}

function generarBloques(horaInicio, horaFin) {
  const bloques = [];
  let inicioMin = aMinutos(horaInicio);
  const finMin = aMinutos(horaFin);

  while (inicioMin + DURACION_BLOQUE_MIN <= finMin) {
    bloques.push({
      horaInicio: aHora(inicioMin),
      horaFin: aHora(inicioMin + DURACION_BLOQUE_MIN),
    });
    inicioMin += DURACION_BLOQUE_MIN;
  }

  return bloques;
}

function obtenerFechaMinima() {
  const hoy = new Date();
  const offset = hoy.getTimezoneOffset() * 60000;
  return new Date(hoy - offset).toISOString().slice(0, 10);
}

export default function CanchaDetallePage() {
  const { id } = useParams();
  const [cancha, setCancha] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [fecha, setFecha] = useState(obtenerFechaMinima());
  const [bloqueSeleccionado, setBloqueSeleccionado] = useState(null);
  const [reservaIniciada, setReservaIniciada] = useState(false);
  const [bloquesOcupados, setBloquesOcupados] = useState([]);
  const [mensajeValidacion, setMensajeValidacion] = useState('');

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

  useEffect(() => {
    let activo = true;

    async function cargarOcupados() {
      if (!fecha) {
        setBloquesOcupados([]);
        return;
      }

      try {
        const { data } = await obtenerBloquesOcupados(id, fecha);
        if (activo) setBloquesOcupados(data.ocupados);
      } catch {
        if (activo) setBloquesOcupados([]);
      }
    }

    cargarOcupados();
    return () => {
      activo = false;
    };
  }, [id, fecha]);

  const bloquesOcupadosSet = useMemo(
    () => new Set(bloquesOcupados.map((ocupado) => formatearHora(ocupado.horaInicio))),
    [bloquesOcupados]
  );

  const horarioDelDia = useMemo(() => {
    if (!cancha || !fecha) return null;
    const diaSemana = new Date(`${fecha}T00:00:00`).getDay();
    return cancha.horarios.find((horario) => horario.diaSemana === diaSemana) ?? null;
  }, [cancha, fecha]);

  const bloquesDisponibles = useMemo(() => {
    if (!horarioDelDia) return [];
    return generarBloques(horarioDelDia.horaInicio, horarioDelDia.horaFin);
  }, [horarioDelDia]);

  function manejarCambioFecha(evento) {
    setFecha(evento.target.value);
    setBloqueSeleccionado(null);
    setReservaIniciada(false);
    setMensajeValidacion('');
  }

  function manejarSeleccionBloque(bloque) {
    setBloqueSeleccionado(bloque);
    setReservaIniciada(false);
    setMensajeValidacion('');
  }

  function manejarIniciarReserva() {
    if (!fecha) {
      setMensajeValidacion('Selecciona una fecha antes de continuar.');
      return;
    }

    if (!bloqueSeleccionado) {
      setMensajeValidacion('Selecciona un bloque horario disponible antes de continuar.');
      return;
    }

    setMensajeValidacion('');
    setReservaIniciada(true);
  }

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

          <div className="campo campo-fecha">
            <label htmlFor="fecha-reserva">Fecha</label>
            <input
              id="fecha-reserva"
              type="date"
              min={obtenerFechaMinima()}
              value={fecha}
              onChange={manejarCambioFecha}
            />
          </div>

          {!horarioDelDia && (
            <p className="estado-vacio">La cancha no tiene horarios disponibles para el día seleccionado.</p>
          )}

          {horarioDelDia && (
            <div className="grid-bloques">
              {bloquesDisponibles.map((bloque) => {
                const seleccionado = bloqueSeleccionado?.horaInicio === bloque.horaInicio;
                const ocupado = bloquesOcupadosSet.has(bloque.horaInicio);
                const claseBloque = ['bloque-horario', seleccionado ? 'seleccionado' : '', ocupado ? 'ocupado' : '']
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={bloque.horaInicio}
                    type="button"
                    className={claseBloque}
                    disabled={ocupado}
                    aria-disabled={ocupado}
                    onClick={() => manejarSeleccionBloque(bloque)}
                  >
                    {bloque.horaInicio} - {bloque.horaFin}
                    {ocupado && <span className="etiqueta-ocupado"> · Ocupado</span>}
                  </button>
                );
              })}
            </div>
          )}

          <h2 className="subtitulo">Horario semanal</h2>

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

          {!reservaIniciada && (
            <div className="acciones-reserva">
              <button type="button" className="boton-primario" onClick={manejarIniciarReserva}>
                Iniciar reserva
              </button>
              <Alerta mensaje={mensajeValidacion} />
            </div>
          )}

          {reservaIniciada && bloqueSeleccionado && (
            <div className="resumen-reserva">
              <h2 className="subtitulo">Resumen de tu selección</h2>
              <p>
                <strong>Cancha:</strong> {cancha.nombre}
              </p>
              <p>
                <strong>Fecha:</strong> {formateadorFecha.format(new Date(`${fecha}T00:00:00`))}
              </p>
              <p>
                <strong>Horario:</strong> {bloqueSeleccionado.horaInicio} - {bloqueSeleccionado.horaFin}
              </p>
              <p>
                <strong>Costo estimado:</strong> {formateadorMoneda.format(cancha.costoHora)}
              </p>
              <p className="texto-ayuda">
                Este es el primer paso del proceso de reserva. La confirmación y el pago se habilitarán en una
                próxima entrega.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
