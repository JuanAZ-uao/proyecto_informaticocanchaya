import { useEffect, useState } from 'react';
import { cancelarReservaAdmin, obtenerReservasAdmin } from '../api/adminApi';
import { obtenerCanchas } from '../api/canchasApi';
import extraerMensajeError from '../api/extraerMensajeError';
import AdminNav from '../components/admin/AdminNav';
import Alerta from '../components/common/Alerta';
import Icono from '../components/common/Icono';

const RESERVAS_POR_PAGINA = 20;
const MOTIVO_MAXIMO = 500;
const FILTROS_VACIOS = { canchaId: '', fecha: '', usuario: '' };

const ETIQUETA_ESTADO = {
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  cancelada_administrativamente: 'Cancelada administrativamente',
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

// US-16: el administrador busca reservas futuras (por cancha, fecha o usuario) y las cancela con un motivo.
export default function AdminReservasPage() {
  const [canchas, setCanchas] = useState([]);
  const [borrador, setBorrador] = useState(FILTROS_VACIOS);
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [recarga, setRecarga] = useState(0);
  const [reservas, setReservas] = useState([]);
  const [paginacion, setPaginacion] = useState({ pagina: 1, totalPaginas: 1, total: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const [reservaACancelar, setReservaACancelar] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelacion, setErrorCancelacion] = useState('');

  useEffect(() => {
    let activo = true;
    obtenerCanchas()
      .then(({ data }) => {
        if (activo) setCanchas(data.canchas ?? []);
      })
      // Sin la lista de canchas igual se puede buscar por fecha o usuario.
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      setCargando(true);
      setError('');
      try {
        const { data } = await obtenerReservasAdmin({ ...filtros, pagina, limite: RESERVAS_POR_PAGINA });
        if (!activo) return;
        setReservas(data.reservas);
        setPaginacion(data.paginacion);
      } catch (err) {
        if (activo) setError(extraerMensajeError(err, 'No fue posible cargar las reservas'));
      } finally {
        if (activo) setCargando(false);
      }
    }

    void cargar();
    return () => {
      activo = false;
    };
  }, [filtros, pagina, recarga]);

  function cambiarCampo(evento) {
    setBorrador((actual) => ({ ...actual, [evento.target.name]: evento.target.value }));
  }

  function buscar(evento) {
    evento.preventDefault();
    setExito('');
    setPagina(1);
    setFiltros(borrador);
  }

  function limpiar() {
    setExito('');
    setPagina(1);
    setBorrador(FILTROS_VACIOS);
    setFiltros(FILTROS_VACIOS);
  }

  function abrirCancelacion(reserva) {
    setExito('');
    setReservaACancelar(reserva);
    setMotivo('');
    setErrorCancelacion('');
  }

  function cerrarCancelacion() {
    if (cancelando) return;
    setReservaACancelar(null);
  }

  async function confirmarCancelacion(evento) {
    evento.preventDefault();

    if (!motivo.trim()) {
      setErrorCancelacion('El motivo de la cancelación es obligatorio');
      return;
    }

    setCancelando(true);
    setErrorCancelacion('');
    try {
      await cancelarReservaAdmin(reservaACancelar.id, motivo.trim());
      setExito(`La reserva ${reservaACancelar.codigo} fue cancelada. Se notificó al usuario por correo.`);
      setReservaACancelar(null);
      setRecarga((actual) => actual + 1);
    } catch (err) {
      // Incluye el bloqueo por faltar menos de 2 horas: se muestra el motivo de la restricción.
      setErrorCancelacion(extraerMensajeError(err, 'No fue posible cancelar la reserva'));
    } finally {
      setCancelando(false);
    }
  }

  const hayFiltro = Boolean(filtros.canchaId || filtros.fecha || filtros.usuario);
  const sinReservas = !cargando && !error && reservas.length === 0;

  return (
    <div className="contenedor seccion-espaciada mis-reservas">
      <div className="seccion-encabezado">
        <div>
          <h1 className="titulo-pagina">Administración de reservas</h1>
          <p className="texto-ayuda">
            Busca reservas futuras y cancélalas con al menos 2 horas de anticipación. El usuario recibe el motivo por correo.
          </p>
        </div>
        {!cargando && !error && (
          <span className="contador">
            {paginacion.total} {paginacion.total === 1 ? 'reserva' : 'reservas'}
          </span>
        )}
      </div>

      <AdminNav />

      <form className="admin-filtros" onSubmit={buscar} aria-label="Filtros de reservas">
        <div className="campo">
          <label htmlFor="filtro-cancha">Cancha</label>
          <select id="filtro-cancha" name="canchaId" value={borrador.canchaId} onChange={cambiarCampo}>
            <option value="">Todas las canchas</option>
            {canchas.map((cancha) => (
              <option key={cancha.id} value={cancha.id}>
                {cancha.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="filtro-fecha">Fecha</label>
          <input id="filtro-fecha" name="fecha" type="date" value={borrador.fecha} onChange={cambiarCampo} />
        </div>
        <div className="campo">
          <label htmlFor="filtro-usuario">Usuario</label>
          <input
            id="filtro-usuario"
            name="usuario"
            type="text"
            maxLength={100}
            placeholder="Nombre o correo"
            value={borrador.usuario}
            onChange={cambiarCampo}
          />
        </div>
        <div className="admin-filtros-acciones">
          <button type="submit" className="boton-acento boton-compacto">
            Buscar
          </button>
          <button type="button" className="boton-secundario boton-compacto" onClick={limpiar}>
            Limpiar
          </button>
        </div>
      </form>

      <Alerta tipo="exito" mensaje={exito} />
      <Alerta mensaje={error} />

      {cargando && (
        <div className="lista-reservas" aria-busy="true">
          <span className="sr-only">Cargando reservas...</span>
          {[0, 1, 2].map((indice) => (
            <div key={indice} className="reserva-item reserva-item-esqueleto" aria-hidden="true">
              <div className="esqueleto esqueleto-linea" />
              <div className="esqueleto esqueleto-linea corta" />
            </div>
          ))}
        </div>
      )}

      {sinReservas && (
        <div className="estado-vacio">
          <Icono nombre="calendario" tamano={40} grosor={1.5} />
          <h3>{hayFiltro ? 'No hay reservas con esos filtros' : 'No hay reservas futuras'}</h3>
          <p>{hayFiltro ? 'Prueba con otra cancha, fecha o usuario.' : 'Cuando los usuarios reserven, aparecerán aquí.'}</p>
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
                <li>
                  <Icono nombre="personas" tamano={16} /> {reserva.usuarioNombre} ({reserva.usuarioCorreo})
                </li>
              </ul>

              <div className="admin-reserva-pie">
                <p className="reserva-item-id">
                  Reserva <code>{reserva.codigo}</code>
                </p>
                {reserva.estado === 'confirmada' && (
                  <button
                    type="button"
                    className="boton-secundario boton-compacto"
                    onClick={() => abrirCancelacion(reserva)}
                    aria-label={`Cancelar la reserva ${reserva.codigo}`}
                  >
                    Cancelar reserva
                  </button>
                )}
              </div>
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

      {reservaACancelar && (
        <div className="admin-modal-fondo">
          <form
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-cancelacion"
            onSubmit={confirmarCancelacion}
            onKeyDown={(evento) => evento.key === 'Escape' && cerrarCancelacion()}
          >
            <h2 id="titulo-cancelacion">Cancelar reserva {reservaACancelar.codigo}</h2>
            <p className="texto-ayuda">
              {reservaACancelar.canchaNombre} · {formatearFecha(reservaACancelar.fecha)} · {reservaACancelar.horaInicio} –{' '}
              {reservaACancelar.horaFin}. Se notificará a {reservaACancelar.usuarioNombre}.
            </p>

            <div className="campo">
              <label htmlFor="motivo-cancelacion">Motivo de la cancelación</label>
              <textarea
                id="motivo-cancelacion"
                rows={4}
                maxLength={MOTIVO_MAXIMO}
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                placeholder="Explica por qué se cancela la reserva"
                required
                autoFocus
              />
              <small className="texto-ayuda">
                {motivo.length}/{MOTIVO_MAXIMO}
              </small>
            </div>

            <Alerta mensaje={errorCancelacion} />

            <div className="admin-modal-acciones">
              <button type="button" className="boton-secundario boton-compacto" onClick={cerrarCancelacion} disabled={cancelando}>
                Volver
              </button>
              <button type="submit" className="boton-acento boton-compacto" disabled={cancelando}>
                {cancelando ? 'Cancelando...' : 'Confirmar cancelación'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
