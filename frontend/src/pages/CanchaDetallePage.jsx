import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { crearReserva, entrarPanelReserva, obtenerBloquesOcupados, obtenerCanchaPorId } from '../api/canchasApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
import Icono from '../components/common/Icono';
import TemporizadorReserva from '../components/canchas/TemporizadorReserva';
import ConfirmacionReserva from '../components/canchas/ConfirmacionReserva';
import useAuth from '../hooks/useAuth';
import useTemporizadorReserva from '../hooks/useTemporizadorReserva';
import iconoServicio from '../utils/iconoServicio';
import { formateadorMoneda, formatearFechaLarga, formatearHora } from '../utils/formato';
import { esBloquePasado, obtenerFechaHoyColombia } from '../utils/fechaHora';

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const DURACION_BLOQUE_MIN = 60;
const INTERVALO_RELOJ_MS = 30000;
const MENSAJE_BLOQUE_PASADO = 'Ese horario ya pasó. Elige otro bloque disponible.';
const DESCRIPCION_POR_DEFECTO =
  'Cancha de grama sintética lista para tu partido. Reserva tu franja en línea y llega directo a jugar.';

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
  return obtenerFechaHoyColombia();
}

function horasRetenidas(retenidos = []) {
  return retenidos.map((retenido) => formatearHora(retenido.horaInicio));
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
  const {
    expiresAt,
    expirado: expiradoSocket,
    reiniciar,
    retenerFranja,
    liberarFranja,
  } = useTemporizadorReserva(id, token, {
    onSesionIniciada: manejarSesionIniciada,
    onCambioDisponibilidad: manejarCambioDisponibilidad,
  });
  const [expiradoServidor, setExpiradoServidor] = useState(false);
  const [panelCompletado, setPanelCompletado] = useState(false);
  const [entrandoPanel, setEntrandoPanel] = useState(false);
  const expiradoCombinado = expiradoSocket || expiradoServidor;
  const [cancha, setCancha] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [fecha, setFecha] = useState(obtenerFechaMinima());
  const [bloqueSeleccionado, setBloqueSeleccionado] = useState(null);
  const [reservaIniciada, setReservaIniciada] = useState(false);
  const [bloquesOcupados, setBloquesOcupados] = useState([]);
  // US-18: franjas que otros usuarios tienen retenidas ("En proceso de reserva") en la fecha elegida.
  const [bloquesRetenidos, setBloquesRetenidos] = useState([]);
  const [reteniendo, setReteniendo] = useState(null);
  const [cargandoOcupados, setCargandoOcupados] = useState(false);
  const [errorOcupados, setErrorOcupados] = useState('');
  const [mensajeValidacion, setMensajeValidacion] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [errorReserva, setErrorReserva] = useState('');
  const [reservaConfirmada, setReservaConfirmada] = useState(null);
  const [ahora, setAhora] = useState(() => Date.now());

  // Reloj local para que los bloques de hoy pasen a "No disponible" a medida que avanza la hora.
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), INTERVALO_RELOJ_MS);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    const flujoGuardado = leerFlujoGuardado(id);
    if (flujoGuardado && flujoGuardado.fecha >= obtenerFechaMinima()) {
      setFecha(flujoGuardado.fecha || obtenerFechaMinima());
      setBloqueSeleccionado(flujoGuardado.bloqueSeleccionado || null);
      setReservaIniciada(Boolean(flujoGuardado.reservaIniciada));
    } else {
      setFecha(obtenerFechaMinima());
      setBloqueSeleccionado(null);
      setReservaIniciada(false);
    }
    setReservaConfirmada(null);
    setPanelCompletado(false);
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
      setBloquesRetenidos(horasRetenidas(data.retenidos));
      setErrorOcupados('');
    } catch (err) {
      setBloquesOcupados([]);
      setBloquesRetenidos([]);
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
        if (activo) {
          setBloquesOcupados(data.ocupados);
          setBloquesRetenidos(horasRetenidas(data.retenidos));
        }
      } catch (err) {
        if (activo) {
          setBloquesOcupados([]);
          setBloquesRetenidos([]);
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

  const bloquesRetenidosSet = useMemo(() => new Set(bloquesRetenidos), [bloquesRetenidos]);

  const horarioDelDia = useMemo(() => {
    if (!cancha || !fecha) return null;
    const diaSemana = new Date(`${fecha}T00:00:00`).getDay();
    return cancha.horarios.find((horario) => horario.diaSemana === diaSemana) ?? null;
  }, [cancha, fecha]);

  const bloquesDisponibles = useMemo(() => {
    if (!horarioDelDia) return [];
    return generarBloques(horarioDelDia.horaInicio, horarioDelDia.horaFin);
  }, [horarioDelDia]);

  const horariosOrdenados = useMemo(() => {
    if (!cancha) return [];
    return ORDEN_SEMANA.map((dia) => cancha.horarios.find((horario) => horario.diaSemana === dia)).filter(Boolean);
  }, [cancha]);

  const diaHoy = new Date().getDay();
  const libresDelDia = bloquesDisponibles.filter(
    (bloque) =>
      !bloquesOcupadosSet.has(bloque.horaInicio) &&
      !bloquesRetenidosSet.has(bloque.horaInicio) &&
      !esBloquePasado(fecha, bloque.horaInicio, ahora)
  ).length;

  useEffect(() => {
    if (bloqueSeleccionado && esBloquePasado(fecha, bloqueSeleccionado.horaInicio, ahora)) {
      setBloqueSeleccionado(null);
      setReservaIniciada(false);
      setMensajeValidacion(MENSAJE_BLOQUE_PASADO);
    }
  }, [fecha, bloqueSeleccionado, ahora]);

  function marcarRetenido(hora) {
    setBloquesRetenidos((previos) => (previos.includes(hora) ? previos : [...previos, hora]));
  }

  // US-18: cambios que llegan por socket desde otros usuarios que miran esta cancha.
  function manejarCambioDisponibilidad(tipo, franja) {
    if (franja.fecha !== fecha) return;
    const hora = franja.horaInicio;

    if (tipo === 'retenida') {
      marcarRetenido(hora);
    } else if (tipo === 'reservada') {
      setBloquesRetenidos((previos) => previos.filter((h) => h !== hora));
      setBloquesOcupados((previos) =>
        previos.some((o) => formatearHora(o.horaInicio) === hora)
          ? previos
          : [...previos, { horaInicio: hora, horaFin: franja.horaFin }]
      );
    } else if (tipo === 'liberada') {
      // Puede venir de una retención que terminó o de una reserva cancelada: se consulta el estado real.
      setBloquesRetenidos((previos) => previos.filter((h) => h !== hora));
      recargarOcupados(fecha);
    }
  }

  function manejarRechazoRetencion(errorRetencion, bloque) {
    const codigo = errorRetencion?.codigo;
    if (codigo === 'FRANJA_RETENIDA') marcarRetenido(bloque.horaInicio);
    if (codigo === 'FRANJA_OCUPADA') recargarOcupados(fecha);
    if (codigo === 'SESION_EXPIRADA') setExpiradoServidor(true);
    if (codigo === 'HORA_PASADA') setAhora(Date.now());
    setMensajeValidacion(errorRetencion?.mensaje || 'No fue posible apartar esta franja. Intenta con otra.');
  }

  // Al (re)conectar el socket, por ejemplo tras recargar la página o un reinicio del servidor,
  // se vuelve a retener la franja que el usuario ya tenía elegida.
  async function manejarSesionIniciada() {
    if (!bloqueSeleccionado || reservaConfirmada) return;

    const bloque = bloqueSeleccionado;
    const respuesta = await retenerFranja({ fecha, horaInicio: bloque.horaInicio, horaFin: bloque.horaFin });
    if (!respuesta?.ok) {
      setBloqueSeleccionado(null);
      setReservaIniciada(false);
      manejarRechazoRetencion(respuesta?.error, bloque);
    }
  }

  function manejarCambioFecha(evento) {
    if (bloqueSeleccionado) liberarFranja();
    setFecha(evento.target.value);
    setBloqueSeleccionado(null);
    setBloquesRetenidos([]);
    setReservaIniciada(false);
    setMensajeValidacion('');
    setErrorReserva('');
    setReservaConfirmada(null);
  }

  // US-18: elegir un bloque lo retiene en el servidor; solo se marca como elegido si el
  // servidor lo confirma. Al elegir otro, el servidor libera el anterior.
  async function manejarSeleccionBloque(bloque) {
    if (reteniendo || bloqueSeleccionado?.horaInicio === bloque.horaInicio) return;

    setMensajeValidacion('');
    setErrorReserva('');
    setReservaConfirmada(null);
    setReteniendo(bloque.horaInicio);

    const respuesta = await retenerFranja({ fecha, horaInicio: bloque.horaInicio, horaFin: bloque.horaFin });
    setReteniendo(null);

    if (respuesta?.ok) {
      setBloqueSeleccionado(bloque);
      setReservaIniciada(false);
      return;
    }

    manejarRechazoRetencion(respuesta?.error, bloque);
  }

  function manejarCancelarSeleccion() {
    liberarFranja();
    setBloqueSeleccionado(null);
    setReservaIniciada(false);
    setErrorReserva('');
    setMensajeValidacion('');
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

    if (esBloquePasado(fecha, bloqueSeleccionado.horaInicio)) {
      setAhora(Date.now());
      setBloqueSeleccionado(null);
      setMensajeValidacion(MENSAJE_BLOQUE_PASADO);
      return;
    }

    setMensajeValidacion('');
    setEntrandoPanel(true);

    try {
      await entrarPanelReserva(id, {
        fecha,
        horaInicio: bloqueSeleccionado.horaInicio,
        horaFin: bloqueSeleccionado.horaFin,
      });
      setPanelCompletado(true);
      setReservaIniciada(true);
    } catch (err) {
      const { status, data } = err.response ?? {};
      if (data?.codigo === 'FRANJA_RETENIDA' || data?.codigo === 'FRANJA_OCUPADA') {
        if (data.codigo === 'FRANJA_RETENIDA') marcarRetenido(bloqueSeleccionado.horaInicio);
        setBloqueSeleccionado(null);
        recargarOcupados(fecha);
      } else if (status === 409 || status === 403) {
        setExpiradoServidor(true);
      }
      if (status === 400) {
        setAhora(Date.now());
        setBloqueSeleccionado(null);
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
    setPanelCompletado(false);
    setMensajeValidacion('');
  }

  // Tras confirmar, el temporizador quedó completado: otra reserva arranca una sesión nueva.
  function manejarHacerOtraReserva() {
    setReservaConfirmada(null);
    setErrorReserva('');
    manejarReiniciarTemporizador();
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

  if (cargando) {
    return (
      <div className="detalle-cargando" aria-busy="true">
        <div className="esqueleto detalle-hero-esqueleto" />
        <div className="contenedor">
          <p className="estado-carga">Cargando cancha...</p>
        </div>
      </div>
    );
  }

  if (!cancha) {
    return (
      <div className="contenedor seccion-espaciada">
        <Link to="/canchas" className="enlace-volver enlace-volver-oscuro">
          <Icono nombre="flechaIzquierda" tamano={16} /> Todas las canchas
        </Link>
        <Alerta mensaje={error || 'No encontramos esta cancha.'} />
      </div>
    );
  }

  const servicios = cancha.servicios ?? [];

  return (
    <div className="pagina-detalle">
      <section className="detalle-hero">
        {cancha.imagenUrl ? (
          <img className="detalle-hero-foto" src={cancha.imagenUrl} alt={`Foto de ${cancha.nombre}`} />
        ) : (
          <div className="detalle-hero-foto media-placeholder" />
        )}
        <div className="detalle-hero-velo" />

        <div className="contenedor detalle-hero-contenido">
          <Link to="/canchas" className="enlace-volver">
            <Icono nombre="flechaIzquierda" tamano={16} /> Todas las canchas
          </Link>

          <div className="detalle-hero-fila">
            <div>
              <div className="detalle-insignias">
                {cancha.tipo && <span className="insignia insignia-acento">{cancha.tipo}</span>}
                {cancha.zona && (
                  <span className="insignia insignia-vidrio">
                    <Icono nombre="pin" tamano={13} /> Zona {cancha.zona}
                  </span>
                )}
              </div>
              <h1 className="titulo-pagina detalle-titulo">{cancha.nombre}</h1>
              <p className="detalle-direccion">
                <Icono nombre="pin" tamano={16} /> {cancha.direccion}
              </p>
            </div>

            <div className="detalle-precio">
              <span>Desde</span>
              <strong>{formateadorMoneda.format(cancha.costoHora)}</strong>
              <span>por hora</span>
            </div>
          </div>
        </div>

        {cancha.imagenCredito && (
          <p className="credito-foto">
            <Icono nombre="camara" tamano={12} /> {cancha.imagenCredito}
          </p>
        )}
      </section>

      <div className="contenedor detalle-cuerpo">
        <div className="detalle-info">
          <section className="bloque-info">
            <h2 className="seccion-titulo">Sobre esta cancha</h2>
            <p className="detalle-descripcion">{cancha.descripcion || DESCRIPCION_POR_DEFECTO}</p>
          </section>

          {servicios.length > 0 && (
            <section className="bloque-info">
              <h2 className="seccion-titulo">Lo que incluye</h2>
              <ul className="grid-servicios">
                {servicios.map((servicio) => (
                  <li key={servicio} className="servicio">
                    <span className="servicio-icono">
                      <Icono nombre={iconoServicio(servicio)} tamano={20} />
                    </span>
                    {servicio}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="bloque-info">
            <h2 className="seccion-titulo">Horario semanal</h2>
            {horariosOrdenados.length === 0 ? (
              <p className="estado-vacio">Esta cancha aún no tiene horarios configurados.</p>
            ) : (
              <ul className="lista-horarios">
                {horariosOrdenados.map((horario) => (
                  <li key={horario.diaSemana} className={horario.diaSemana === diaHoy ? 'hoy' : ''}>
                    <span className="dia-horario">
                      {NOMBRES_DIA[horario.diaSemana]}
                      {horario.diaSemana === diaHoy && <span className="etiqueta-hoy">Hoy</span>}
                    </span>
                    <span>
                      {formatearHora(horario.horaInicio)} – {formatearHora(horario.horaFin)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="tarjeta-reserva" aria-label="Reservar esta cancha">
          <div className="tarjeta-reserva-encabezado">
            <h2>Reserva tu turno</h2>
            <p>Bloques de 1 hora · {formateadorMoneda.format(cancha.costoHora)}</p>
          </div>

          {reservaConfirmada ? (
            <ConfirmacionReserva reserva={reservaConfirmada} onHacerOtraReserva={manejarHacerOtraReserva} />
          ) : (
            <>
              <TemporizadorReserva
                expiresAt={expiresAt}
                expirado={expiradoCombinado}
                completado={panelCompletado && !expiradoCombinado}
                onReiniciar={manejarReiniciarTemporizador}
              />

              <div className="campo campo-fecha">
                <label htmlFor="fecha-reserva">
                  <Icono nombre="calendario" tamano={14} /> Fecha
                </label>
                <input
                  id="fecha-reserva"
                  type="date"
                  min={obtenerFechaMinima()}
                  value={fecha}
                  onChange={manejarCambioFecha}
                  disabled={expiradoCombinado}
                />
              </div>

              {cargandoOcupados && <p className="estado-carga estado-carga-compacto">Consultando disponibilidad...</p>}
              <Alerta mensaje={errorOcupados} />

              {!horarioDelDia && (
                <p className="estado-vacio estado-vacio-compacto">
                  La cancha no tiene horarios disponibles para el día seleccionado.
                </p>
              )}

              {horarioDelDia && (
                <>
                  <div className="bloques-encabezado">
                    <span>
                      <strong>{libresDelDia}</strong> {libresDelDia === 1 ? 'bloque libre' : 'bloques libres'}
                    </span>
                    <span className="leyenda">
                      <span className="leyenda-item leyenda-libre">Libre</span>
                      <span className="leyenda-item leyenda-retenido">En proceso</span>
                      <span className="leyenda-item leyenda-ocupado">Ocupado</span>
                    </span>
                  </div>
                  <div className="grid-bloques">
                    {bloquesDisponibles.map((bloque) => {
                      const seleccionado = bloqueSeleccionado?.horaInicio === bloque.horaInicio;
                      const ocupado =
                        bloquesOcupadosSet.has(bloque.horaInicio) || esBloquePasado(fecha, bloque.horaInicio, ahora);
                      const retenido = !ocupado && !seleccionado && bloquesRetenidosSet.has(bloque.horaInicio);
                      const bloqueado = ocupado || retenido || expiradoCombinado;
                      const claseBloque = [
                        'bloque-horario',
                        seleccionado ? 'seleccionado' : '',
                        ocupado ? 'ocupado' : '',
                        retenido ? 'retenido' : '',
                        reteniendo === bloque.horaInicio ? 'reteniendo' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <button
                          key={bloque.horaInicio}
                          type="button"
                          className={claseBloque}
                          disabled={bloqueado}
                          aria-disabled={bloqueado}
                          aria-pressed={seleccionado}
                          aria-busy={reteniendo === bloque.horaInicio}
                          onClick={() => manejarSeleccionBloque(bloque)}
                        >
                          {bloque.horaInicio} - {bloque.horaFin}
                          {ocupado && <span className="etiqueta-ocupado"> · No disponible</span>}
                          {retenido && <span className="etiqueta-retenido"> · En proceso de reserva</span>}
                        </button>
                      );
                    })}
                  </div>
                  {bloqueSeleccionado && !reservaIniciada && (
                    <p className="nota-retencion" role="status">
                      <Icono nombre="escudo" tamano={15} /> Apartamos las {bloqueSeleccionado.horaInicio} para ti
                      mientras completas la reserva.
                    </p>
                  )}
                  {libresDelDia === 0 && bloquesDisponibles.length > 0 && !cargandoOcupados && (
                    <p className="estado-vacio estado-vacio-compacto">
                      No quedan bloques libres para este día. Elige otra fecha.
                    </p>
                  )}
            </>
          )}

          {!reservaIniciada && (
            <div className="acciones-reserva">
              <button
                type="button"
                className="boton-acento boton-bloque boton-grande"
                onClick={manejarIniciarReserva}
                disabled={!fecha || !bloqueSeleccionado || expiradoCombinado || entrandoPanel}
                aria-disabled={!fecha || !bloqueSeleccionado || expiradoCombinado || entrandoPanel}
              >
                {entrandoPanel ? 'Verificando...' : 'Iniciar reserva'}
              </button>
              {!bloqueSeleccionado && libresDelDia > 0 && !mensajeValidacion && !errorReserva && (
                <p className="texto-ayuda texto-centrado">Elige un bloque libre para continuar.</p>
              )}
              <Alerta mensaje={mensajeValidacion} />
              <Alerta mensaje={errorReserva} />
            </div>
          )}

          {reservaIniciada && bloqueSeleccionado && (
            <div className="resumen-reserva">
              <h3 className="resumen-titulo">Resumen de tu selección</h3>
              {usuario && (
                <p className="resumen-usuario">
                  Reservando como <strong>{usuario.nombre}</strong> ({usuario.correo})
                </p>
              )}
              <dl className="resumen-lista">
                <div>
                  <dt>Cancha</dt>
                  <dd>{cancha.nombre}</dd>
                </div>
                <div>
                  <dt>Fecha</dt>
                  <dd>{formatearFechaLarga(fecha)}</dd>
                </div>
                <div>
                  <dt>Horario</dt>
                  <dd>
                    {bloqueSeleccionado.horaInicio} - {bloqueSeleccionado.horaFin}
                  </dd>
                </div>
                <div className="resumen-total">
                  <dt>Costo estimado</dt>
                  <dd>{formateadorMoneda.format(cancha.costoHora)}</dd>
                </div>
              </dl>
              <div className="acciones-reserva">
                <button
                  type="button"
                  className="boton-acento boton-bloque boton-grande"
                  onClick={manejarConfirmarReserva}
                  disabled={confirmando}
                  aria-disabled={confirmando}
                >
                  {confirmando ? 'Confirmando...' : 'Confirmar reserva'}
                </button>
                <button
                  type="button"
                  className="boton-fantasma boton-bloque"
                  onClick={manejarVolverASeleccion}
                  disabled={confirmando}
                >
                  <Icono nombre="flechaIzquierda" tamano={16} /> Cambiar horario
                </button>
                <button
                  type="button"
                  className="enlace-cancelar"
                  onClick={manejarCancelarSeleccion}
                  disabled={confirmando}
                >
                  Cancelar y liberar la franja
                </button>
                <Alerta mensaje={errorReserva} />
              </div>
            </div>
          )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
