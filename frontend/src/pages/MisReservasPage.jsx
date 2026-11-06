import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelarReserva, obtenerMisReservas } from '../api/reservasApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
import ConfirmarDialogo from '../components/common/ConfirmarDialogo';
import Icono from '../components/common/Icono';
import { formateadorMoneda } from '../utils/formato';

const RESERVAS_POR_PAGINA = 10;

const PERIODOS = [
  { valor: 'proximas', etiqueta: 'Próximas' },
  { valor: 'pasadas', etiqueta: 'Pasadas' },
];

const ESTADOS = [
  { valor: '', etiqueta: 'Todos los estados' },
  { valor: 'confirmada', etiqueta: 'Confirmada' },
  { valor: 'completada', etiqueta: 'Completada' },
  { valor: 'cancelada', etiqueta: 'Cancelada' },
  { valor: 'cancelada_administrativamente', etiqueta: 'Cancelada administrativamente' },
];

// Una reserva confirmada cuyo horario ya terminó se muestra como "completada": por eso cada uno de
// estos estados solo puede aparecer en una de las dos pestañas.
const PERIODO_DEL_ESTADO = { completada: 'pasadas', confirmada: 'proximas' };

const ETIQUETA_ESTADO = {
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  cancelada_administrativamente: 'Cancelada administrativamente',
};

// US-14: el servidor decide si todavía se puede cancelar (`puedeCancelar`) y vuelve a comprobarlo al cancelar.
// Este texto solo explica la regla cuando el botón se pulsa fuera de plazo.
const MENSAJE_FUERA_DE_PLAZO = 'Ya no puedes cancelar esta reserva: solo se puede cancelar con al menos 2 horas de anticipación al inicio.';

const formateadorFecha = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatearFecha(fecha) {
  const texto = formateadorFecha.format(new Date(`${fecha}T00:00:00`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function etiquetaPago(pago) {
  const tarjeta = `${pago.marca} ···· ${pago.ultimos4}`;
  return pago.estado === 'reembolsado'
    ? `Reembolsada · ${tarjeta} · ${formateadorMoneda.format(pago.monto)}`
    : `Pagada · ${tarjeta} · ${formateadorMoneda.format(pago.monto)}`;
}

function textoAvisoCancelacion(reserva, reembolso) {
  const partes = [`Reserva ${reserva.codigo} cancelada. Te enviamos un correo con el detalle y el horario ya quedó disponible.`];
  if (reembolso) {
    partes.push(`Reembolsamos ${formateadorMoneda.format(reembolso.monto)} a tu tarjeta ${reembolso.marca} terminada en ${reembolso.ultimos4}.`);
  }
  return partes.join(' ');
}

export default function MisReservasPage() {
  const [periodo, setPeriodo] = useState('proximas');
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const [reservas, setReservas] = useState([]);
  const [paginacion, setPaginacion] = useState({ pagina: 1, totalPaginas: 1, total: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [porCancelar, setPorCancelar] = useState(null);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState('');
  const [bloqueadas, setBloqueadas] = useState({});
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let activo = true;

    async function cargarReservas() {
      setCargando(true);
      setError('');
      try {
        const { data } = await obtenerMisReservas({ periodo, estado, pagina, limite: RESERVAS_POR_PAGINA });
        if (!activo) return;
        setReservas(data.reservas);
        setPaginacion(data.paginacion);
      } catch (err) {
        if (activo) setError(extraerMensajeError(err, 'No fue posible cargar tus reservas'));
      } finally {
        if (activo) setCargando(false);
      }
    }

    void cargarReservas();
    return () => {
      activo = false;
    };
  }, [periodo, estado, pagina, recarga]);

  function cambiarPeriodo(nuevoPeriodo) {
    setPeriodo(nuevoPeriodo);
    // Si el estado elegido no existe en el nuevo periodo, se quita el filtro en vez de mostrar una lista vacía.
    if (PERIODO_DEL_ESTADO[estado] && PERIODO_DEL_ESTADO[estado] !== nuevoPeriodo) setEstado('');
    setPagina(1);
  }

  function cambiarEstado(evento) {
    const nuevoEstado = evento.target.value;
    setEstado(nuevoEstado);
    // "Completada" solo existe entre las pasadas y "Confirmada" solo entre las próximas: se cambia de pestaña.
    if (PERIODO_DEL_ESTADO[nuevoEstado]) setPeriodo(PERIODO_DEL_ESTADO[nuevoEstado]);
    setPagina(1);
  }

  function limpiarFiltro() {
    setEstado('');
    setPagina(1);
  }

  function pedirCancelacion(reserva) {
    setAviso('');

    if (!reserva.puedeCancelar) {
      setBloqueadas((actuales) => ({ ...actuales, [reserva.id]: MENSAJE_FUERA_DE_PLAZO }));
      return;
    }

    setBloqueadas((actuales) => ({ ...actuales, [reserva.id]: '' }));
    setErrorCancelar('');
    setPorCancelar(reserva);
  }

  async function confirmarCancelacion() {
    setCancelando(true);
    setErrorCancelar('');

    try {
      const { data } = await cancelarReserva(porCancelar.id);
      setAviso(textoAvisoCancelacion(porCancelar, data.reembolso));
      setPorCancelar(null);
      setRecarga((n) => n + 1);
    } catch (err) {
      setErrorCancelar(extraerMensajeError(err, 'No fue posible cancelar la reserva. Intenta nuevamente.'));
      // Si el servidor la rechazó (por ejemplo, ya pasó el plazo), se actualiza la lista para reflejarlo.
      setRecarga((n) => n + 1);
    } finally {
      setCancelando(false);
    }
  }

  const hayFiltro = Boolean(estado);
  const sinReservas = !cargando && !error && reservas.length === 0;

  return (
    <div className="contenedor seccion-espaciada mis-reservas">
      <div className="seccion-encabezado">
        <div>
          <h1 className="titulo-pagina">Mis reservas</h1>
          <p className="texto-ayuda">Consulta tus reservas próximas y pasadas, y el estado de cada una.</p>
        </div>
        {!cargando && !error && (
          <span className="contador">
            {paginacion.total} {paginacion.total === 1 ? 'reserva' : 'reservas'}
          </span>
        )}
      </div>

      <Alerta tipo="exito" mensaje={aviso} />

      <div className="barra-reservas">
        <div className="pestanas-reservas" role="tablist" aria-label="Periodo de las reservas">
          {PERIODOS.map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              role="tab"
              aria-selected={periodo === opcion.valor}
              className={periodo === opcion.valor ? 'pestana-reserva activa' : 'pestana-reserva'}
              onClick={() => cambiarPeriodo(opcion.valor)}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>

        <label className="filtro-estado">
          <span className="sr-only">Filtrar por estado</span>
          <select value={estado} onChange={cambiarEstado} aria-label="Filtrar por estado">
            {ESTADOS.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Alerta mensaje={error} />

      {cargando && (
        <div className="lista-reservas" aria-busy="true">
          <span className="sr-only">Cargando tus reservas...</span>
          {[0, 1, 2].map((indice) => (
            <div key={indice} className="reserva-item reserva-item-esqueleto" aria-hidden="true">
              <div className="esqueleto esqueleto-linea" />
              <div className="esqueleto esqueleto-linea corta" />
            </div>
          ))}
        </div>
      )}

      {sinReservas && !hayFiltro && (
        <div className="estado-vacio">
          <Icono nombre="calendario" tamano={40} grosor={1.5} />
          <h3>Aún no tienes reservas</h3>
          <p>
            {periodo === 'proximas'
              ? 'Cuando reserves una cancha, aparecerá aquí.'
              : 'Tu historial aparecerá aquí cuando hayas jugado o cancelado una reserva.'}
          </p>
          <Link to="/canchas" className="boton-acento boton-grande vacio-boton">
            Reservar una cancha
          </Link>
        </div>
      )}

      {sinReservas && hayFiltro && (
        <div className="estado-vacio">
          <Icono nombre="lupa" tamano={40} grosor={1.5} />
          <h3>No hay reservas con ese estado</h3>
          <p>Prueba con otro estado o quita el filtro.</p>
          <button type="button" className="boton-secundario vacio-boton" onClick={limpiarFiltro}>
            Quitar filtro
          </button>
        </div>
      )}

      {!cargando && reservas.length > 0 && (
        <ul className="lista-reservas">
          {reservas.map((reserva) => (
            <li key={reserva.id} className="reserva-item">
              <div className="reserva-item-cabecera">
                <h2 className="reserva-item-cancha">{reserva.canchaNombre}</h2>
                <span className={`estado-reserva estado-${reserva.estado}`}>
                  {ETIQUETA_ESTADO[reserva.estado] ?? reserva.estado}
                </span>
              </div>

              <ul className="reserva-item-datos">
                <li>
                  <Icono nombre="calendario" tamano={16} /> {formatearFecha(reserva.fecha)}
                </li>
                <li>
                  <Icono nombre="reloj" tamano={16} /> {reserva.horaInicio} – {reserva.horaFin}
                </li>
                {reserva.canchaDireccion && (
                  <li>
                    <Icono nombre="pin" tamano={16} /> {reserva.canchaDireccion}
                  </li>
                )}
                {reserva.pago && (
                  <li className="reserva-item-pago">
                    <Icono nombre="tarjeta" tamano={16} /> {etiquetaPago(reserva.pago)}
                  </li>
                )}
              </ul>

              {reserva.estado === 'cancelada_administrativamente' && reserva.motivoCancelacion && (
                <p className="reserva-item-motivo">
                  <strong>Motivo de la cancelación:</strong> {reserva.motivoCancelacion}
                </p>
              )}

              <div className="reserva-item-pie">
                <p className="reserva-item-id">
                  Reserva <code>{reserva.codigo ?? reserva.id}</code>
                </p>
                {reserva.estado === 'confirmada' && (
                  <button type="button" className="boton-peligro-suave boton-compacto" onClick={() => pedirCancelacion(reserva)}>
                    Cancelar reserva
                  </button>
                )}
              </div>

              <Alerta mensaje={bloqueadas[reserva.id]} />
            </li>
          ))}
        </ul>
      )}

      {!cargando && !error && paginacion.totalPaginas > 1 && (
        <nav className="paginacion" aria-label="Paginación de reservas">
          <button
            type="button"
            className="boton-secundario boton-compacto"
            onClick={() => setPagina((actual) => Math.max(actual - 1, 1))}
            disabled={pagina <= 1}
          >
            Anterior
          </button>
          <span className="paginacion-estado">
            Página {paginacion.pagina} de {paginacion.totalPaginas}
          </span>
          <button
            type="button"
            className="boton-secundario boton-compacto"
            onClick={() => setPagina((actual) => Math.min(actual + 1, paginacion.totalPaginas))}
            disabled={pagina >= paginacion.totalPaginas}
          >
            Siguiente
          </button>
        </nav>
      )}

      {porCancelar && (
        <ConfirmarDialogo
          titulo="¿Cancelar esta reserva?"
          textoConfirmar="Sí, cancelar reserva"
          textoCancelar="No, conservarla"
          peligro
          cargando={cancelando}
          error={errorCancelar}
          onConfirmar={confirmarCancelacion}
          onCancelar={() => setPorCancelar(null)}
        >
          <p>
            <strong>{porCancelar.canchaNombre}</strong> · {formatearFecha(porCancelar.fecha)} · {porCancelar.horaInicio} – {porCancelar.horaFin}
            <br />
            Código <code>{porCancelar.codigo}</code>
          </p>
          <p>La franja quedará disponible para otros usuarios de inmediato.</p>
          {porCancelar.pago?.estado === 'aprobado' && (
            <p>
              Te reembolsaremos {formateadorMoneda.format(porCancelar.pago.monto)} a tu tarjeta {porCancelar.pago.marca} terminada en {porCancelar.pago.ultimos4}.
            </p>
          )}
        </ConfirmarDialogo>
      )}
    </div>
  );
}
