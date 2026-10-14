import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { obtenerMisReservas } from '../api/reservasApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
import Icono from '../components/common/Icono';

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
];

const ETIQUETA_ESTADO = {
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

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

export default function MisReservasPage() {
  const [periodo, setPeriodo] = useState('proximas');
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const [reservas, setReservas] = useState([]);
  const [paginacion, setPaginacion] = useState({ pagina: 1, totalPaginas: 1, total: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

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
  }, [periodo, estado, pagina]);

  function cambiarPeriodo(nuevoPeriodo) {
    setPeriodo(nuevoPeriodo);
    setPagina(1);
  }

  function cambiarEstado(evento) {
    setEstado(evento.target.value);
    setPagina(1);
  }

  function limpiarFiltro() {
    setEstado('');
    setPagina(1);
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
              </ul>

              <p className="reserva-item-id">
                Reserva <code>{reserva.codigo ?? reserva.id}</code>
              </p>
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
    </div>
  );
}