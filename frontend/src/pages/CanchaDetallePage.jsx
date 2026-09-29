import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { crearReserva, entrarPanelReserva, obtenerBloquesOcupados, obtenerCanchaPorId } from '../api/canchasApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
import TemporizadorReserva from '../components/canchas/TemporizadorReserva';
import useAuth from '../hooks/useAuth';
import useTemporizadorReserva from '../hooks/useTemporizadorReserva';

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

function claveFlujo(canchaId) {
  return `canchaya_flujo_reserva_${canchaId}`;
}

function leerFlujoGuardado(canchaId) {
  try {
    const guardado = sessionStorage.getItem(claveFlujo(canchaId));
    return guardado ? JSON.parse(guardado) : null;
  } catch {
    return null;
  }
}

function guardarFlujo(canchaId, flujo) {
  try {
    sessionStorage.setItem(claveFlujo(canchaId), JSON.stringify(flujo));
  } catch {
    // El almacenamiento de sesión es solo una comodidad: si falla, el flujo sigue funcionando en memoria.
  }
}

function borrarFlujoGuardado(canchaId) {
  try {
    sessionStorage.removeItem(claveFlujo(canchaId));
  } catch {
    // no-op
  }
}

export default function CanchaDetallePage() {
  const { id } = useParams();
  const { usuario, token } = useAuth();
  const { expiresAt, expirado: expiradoSocket, reiniciar } = useTemporizadorReserva(id, token);
  const [expiradoServidor, setExpiradoServidor] = useState(false);
  const [entrandoPanel, setEntrandoPanel] = useState(false);
  const expiradoCombinado = expiradoSocket || expiradoServidor;
  const [cancha, setCancha] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [fecha, setFecha] = useState(obtenerFechaMinima());
  const [bloqueSeleccionado, setBloqueSeleccionado] = useState(null);
  const [reservaIniciada, setReservaIniciada] = useState(false);
  const [bloquesOcupados, setBloquesOcupados] = useState([]);
  const [cargandoOcupados, setCargandoOcupados] = useState(false);
  const [errorOcupados, setErrorOcupados] = useState('');
  const [mensajeValidacion, setMensajeValidacion] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [errorReserva, setErrorReserva] = useState('');
  const [reservaConfirmada, setReservaConfirmada] = useState(null);

  useEffect(() => {
    const flujoGuardado = leerFlujoGuardado(id);
    if (flujoGuardado) {
      setFecha(flujoGuardado.fecha || obtenerFechaMinima());
      setBloqueSeleccionado(flujoGuardado.bloqueSeleccionado || null);
      setReservaIniciada(Boolean(flujoGuardado.reservaIniciada));
    } else {
      setFecha(obtenerFechaMinima());
      setBloqueSeleccionado(null);
      setReservaIniciada(false);
    }
    setReservaConfirmada(null);
  }, [id]);

  useEffect(() => {
    if (!cancha) return;
    guardarFlujo(id, { fecha, bloqueSeleccionado, reservaIniciada });
  }, [id, cancha, fecha, bloqueSeleccionado, reservaIniciada]);

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

  async function recargarOcupados(fechaConsulta) {
    if (!fechaConsulta) {
      setBloquesOcupados([]);
      return;
    }

    try {
      const { data } = await obtenerBloquesOcupados(id, fechaConsulta);
      setBloquesOcupados(data.ocupados);
      setErrorOcupados('');
    } catch (err) {
      setBloquesOcupados([]);
      setErrorOcupados(extraerMensajeError(err, 'No fue posible actualizar la disponibilidad'));
    }
  }

  useEffect(() => {
    let activo = true;

    async function cargarOcupados() {
      if (!fecha) {
        setBloquesOcupados([]);
        return;
      }

      setCargandoOcupados(true);
      setErrorOcupados('');

      try {
        const { data } = await obtenerBloquesOcupados(id, fecha);
        if (activo) setBloquesOcupados(data.ocupados);
      } catch (err) {
        if (activo) {
          setBloquesOcupados([]);
          setErrorOcupados(extraerMensajeError(err, 'No fue posible consultar la disponibilidad'));
        }
      } finally {
        if (activo) setCargandoOcupados(false);
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
    setErrorReserva('');
    setReservaConfirmada(null);
  }

  function manejarSeleccionBloque(bloque) {
    setBloqueSeleccionado(bloque);
    setReservaIniciada(false);
    setMensajeValidacion('');
    setErrorReserva('');
    setReservaConfirmada(null);
  }

  async function manejarIniciarReserva() {
    if (!fecha) {
      setMensajeValidacion('Selecciona una fecha antes de continuar.');
      return;
    }

    if (!bloqueSeleccionado) {
      setMensajeValidacion('Selecciona un bloque horario disponible antes de continuar.');
      return;
    }

    if (expiradoCombinado) {
      setMensajeValidacion('Tu tiempo para reservar expiró. Reinicia el temporizador para continuar.');
      return;
    }

    setMensajeValidacion('');
    setEntrandoPanel(true);

    try {
      await entrarPanelReserva(id);
      setReservaIniciada(true);
    } catch (err) {
      if (err.response?.status === 409 || err.response?.status === 403) {
        setExpiradoServidor(true);
      }
      setMensajeValidacion(
        extraerMensajeError(err, 'No fue posible continuar con la reserva. Intenta nuevamente.')
      );
    } finally {
      setEntrandoPanel(false);
    }
  }

  function manejarVolverASeleccion() {
    setReservaIniciada(false);
    setErrorReserva('');
  }

  function manejarReiniciarTemporizador() {
    reiniciar();
    setExpiradoServidor(false);
    setMensajeValidacion('');
  }

  async function manejarConfirmarReserva() {
    if (!bloqueSeleccionado || confirmando) return;

    setConfirmando(true);
    setErrorReserva('');

    try {
      const { data } = await crearReserva(id, {
        fecha,
        horaInicio: bloqueSeleccionado.horaInicio,
        horaFin: bloqueSeleccionado.horaFin,
      });

      setReservaConfirmada(data.reserva);
      setReservaIniciada(false);
      setBloqueSeleccionado(null);
      borrarFlujoGuardado(id);
      await recargarOcupados(fecha);
    } catch (err) {
      setErrorReserva(
        extraerMensajeError(err, 'No fue posible confirmar la reserva. Intenta nuevamente.')
      );
      setReservaIniciada(false);
      setBloqueSeleccionado(null);
      await recargarOcupados(fecha);
    } finally {
      setConfirmando(false);
    }
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

          <TemporizadorReserva
            expiresAt={expiresAt}
            expirado={expiradoCombinado}
            onReiniciar={manejarReiniciarTemporizador}
          />

          <h2 className="subtitulo">Horarios disponibles</h2>

          <div className="campo campo-fecha">
            <label htmlFor="fecha-reserva">Fecha</label>
            <input
              id="fecha-reserva"
              type="date"
              min={obtenerFechaMinima()}
              value={fecha}
              onChange={manejarCambioFecha}
              disabled={expiradoCombinado}
            />
          </div>

          {cargandoOcupados && <p className="estado-carga">Consultando disponibilidad...</p>}
          <Alerta mensaje={errorOcupados} />

          {!horarioDelDia && (
            <p className="estado-vacio">La cancha no tiene horarios disponibles para el día seleccionado.</p>
          )}

          {horarioDelDia && (
            <div className="grid-bloques">
              {bloquesDisponibles.map((bloque) => {
                const seleccionado = bloqueSeleccionado?.horaInicio === bloque.horaInicio;
                const ocupado = bloquesOcupadosSet.has(bloque.horaInicio);
                const bloqueado = ocupado || expiradoCombinado;
                const claseBloque = ['bloque-horario', seleccionado ? 'seleccionado' : '', ocupado ? 'ocupado' : '']
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={bloque.horaInicio}
                    type="button"
                    className={claseBloque}
                    disabled={bloqueado}
                    aria-disabled={bloqueado}
                    onClick={() => manejarSeleccionBloque(bloque)}
                  >
                    {bloque.horaInicio} - {bloque.horaFin}
                    {ocupado && <span className="etiqueta-ocupado"> · No disponible</span>}
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

          {reservaConfirmada && (
            <div className="resumen-reserva">
              <Alerta tipo="exito" mensaje="¡Tu reserva quedó confirmada! Nadie más podrá reservar esta franja." />
            </div>
          )}

          {!reservaIniciada && !reservaConfirmada && (
            <div className="acciones-reserva">
              <button
                type="button"
                className="boton-primario"
                onClick={manejarIniciarReserva}
                disabled={!fecha || !bloqueSeleccionado || expiradoCombinado || entrandoPanel}
                aria-disabled={!fecha || !bloqueSeleccionado || expiradoCombinado || entrandoPanel}
              >
                {entrandoPanel ? 'Verificando...' : 'Iniciar reserva'}
              </button>
              <Alerta mensaje={mensajeValidacion} />
              <Alerta mensaje={errorReserva} />
            </div>
          )}

          {reservaIniciada && bloqueSeleccionado && (
            <div className="resumen-reserva">
              <h2 className="subtitulo">Resumen de tu selección</h2>
              {usuario && (
                <p className="texto-ayuda">
                  Reservando como <strong>{usuario.nombre}</strong> ({usuario.correo})
                </p>
              )}
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
              <div className="acciones-reserva">
                <div className="fila-botones">
                  <button
                    type="button"
                    className="boton-secundario"
                    onClick={manejarVolverASeleccion}
                    disabled={confirmando}
                  >
                    &larr; Cambiar horario
                  </button>
                  <button
                    type="button"
                    className="boton-primario"
                    onClick={manejarConfirmarReserva}
                    disabled={confirmando}
                    aria-disabled={confirmando}
                  >
                    {confirmando ? 'Confirmando...' : 'Confirmar reserva'}
                  </button>
                </div>
                <Alerta mensaje={errorReserva} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
