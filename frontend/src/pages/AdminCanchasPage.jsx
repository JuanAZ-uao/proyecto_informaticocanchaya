import { useCallback, useEffect, useState } from 'react';
import {
  activarCanchaAdmin,
  crearCanchaAdmin,
  desactivarCanchaAdmin,
  editarCanchaAdmin,
  listarCanchasAdmin,
  obtenerCanchaAdmin,
} from '../api/adminApi';
import extraerMensajeError, { erroresPorCampo } from '../api/extraerMensajeError';
import AdminNav from '../components/admin/AdminNav';
import FormularioCancha from '../components/admin/FormularioCancha';
import Alerta from '../components/common/Alerta';
import ConfirmarDialogo from '../components/common/ConfirmarDialogo';
import Icono from '../components/common/Icono';
import { formatearFechaLarga, formateadorMoneda } from '../utils/formato';

// US-15: gestión de canchas. Crear, editar y desactivar (o reactivar) canchas del catálogo. Solo llegan administradores
// (AdminRoute) y el servidor vuelve a comprobar el rol en cada petición.
export default function AdminCanchasPage() {
  const [canchas, setCanchas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  // formulario: null = cerrado, { cancha: null } = nueva, { cancha } = editando
  const [formulario, setFormulario] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [erroresForm, setErroresForm] = useState({});

  // desactivación: { cancha, advertencia: null | { reservasAfectadas, reservas } }
  const [porDesactivar, setPorDesactivar] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { data } = await listarCanchasAdmin();
      setCanchas(data.canchas);
      setError('');
    } catch (err) {
      setError(extraerMensajeError(err, 'No fue posible cargar las canchas'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function abrirFormulario(cancha) {
    setAviso('');
    setErrorForm('');
    setErroresForm({});
    setFormulario({ cancha });
  }

  async function editar(id) {
    setAviso('');
    setError('');

    try {
      const { data } = await obtenerCanchaAdmin(id);
      abrirFormulario(data.cancha);
    } catch (err) {
      setError(extraerMensajeError(err, 'No fue posible abrir la cancha'));
    }
  }

  async function guardar(datos) {
    setGuardando(true);
    setErrorForm('');
    setErroresForm({});

    try {
      const esNueva = !formulario.cancha;
      const { data } = esNueva ? await crearCanchaAdmin(datos) : await editarCanchaAdmin(formulario.cancha.id, datos);
      setAviso(esNueva ? `La cancha «${data.cancha.nombre}» se creó y ya aparece en el catálogo.` : `Los cambios de «${data.cancha.nombre}» se guardaron. Las reservas ya confirmadas no se modificaron.`);
      setFormulario(null);
      await cargar();
    } catch (err) {
      const porCampo = erroresPorCampo(err);
      setErroresForm(porCampo);
      if (Object.keys(porCampo).length === 0) setErrorForm(extraerMensajeError(err, 'No fue posible guardar la cancha'));
    } finally {
      setGuardando(false);
    }
  }

  function pedirDesactivacion(cancha) {
    setAviso('');
    setErrorDialogo('');
    setPorDesactivar({ cancha, advertencia: null });
  }

  async function confirmarDesactivacion() {
    setProcesando(true);
    setErrorDialogo('');
    const confirmar = Boolean(porDesactivar.advertencia);

    try {
      const { data } = await desactivarCanchaAdmin(porDesactivar.cancha.id, confirmar);
      setAviso(
        data.reservasAfectadas > 0
          ? `«${porDesactivar.cancha.nombre}» se desactivó. Sus ${data.reservasAfectadas} reserva(s) futuras se conservan, pero no se aceptarán nuevas.`
          : `«${porDesactivar.cancha.nombre}» se desactivó: ya no aparece en el catálogo ni admite reservas.`
      );
      setPorDesactivar(null);
      await cargar();
    } catch (err) {
      const datos = err.response?.data;
      if (err.response?.status === 409 && datos?.codigo === 'CONFIRMACION_REQUERIDA') {
        // Hay reservas futuras: se muestran y se pide una confirmación explícita.
        setPorDesactivar((actual) => ({ ...actual, advertencia: { reservasAfectadas: datos.reservasAfectadas, reservas: datos.reservas } }));
      } else {
        setErrorDialogo(extraerMensajeError(err, 'No fue posible desactivar la cancha'));
      }
    } finally {
      setProcesando(false);
    }
  }

  async function activar(cancha) {
    setAviso('');
    setError('');

    try {
      await activarCanchaAdmin(cancha.id);
      setAviso(`«${cancha.nombre}» se reactivó y vuelve a aparecer en el catálogo.`);
      await cargar();
    } catch (err) {
      setError(extraerMensajeError(err, 'No fue posible activar la cancha'));
    }
  }

  const advertencia = porDesactivar?.advertencia;

  return (
    <div className="contenedor seccion-espaciada admin">
      <div className="seccion-encabezado">
        <div>
          <h1 className="titulo-pagina">Gestión de canchas</h1>
          <p className="texto-ayuda">Crea, edita y desactiva las canchas del catálogo. Desactivar conserva el historial de reservas.</p>
        </div>
        {!formulario && (
          <button type="button" className="boton-acento" onClick={() => abrirFormulario(null)}>
            Nueva cancha
          </button>
        )}
      </div>

      <AdminNav />

      <Alerta tipo="exito" mensaje={aviso} />
      <Alerta mensaje={error} />

      {formulario && (
        <section className="admin-seccion" aria-labelledby="titulo-formulario-cancha">
          <h2 id="titulo-formulario-cancha" className="perfil-seccion-titulo">
            {formulario.cancha ? `Editar «${formulario.cancha.nombre}»` : 'Nueva cancha'}
          </h2>
          <FormularioCancha
            key={formulario.cancha?.id ?? 'nueva'}
            cancha={formulario.cancha}
            guardando={guardando}
            errores={erroresForm}
            error={errorForm}
            onGuardar={guardar}
            onCancelar={() => setFormulario(null)}
          />
        </section>
      )}

      {cargando && <p className="estado-carga">Cargando canchas...</p>}
      {!cargando && !error && canchas.length === 0 && <p className="perfil-vacio">Todavía no hay canchas. Crea la primera con «Nueva cancha».</p>}

      {canchas.length > 0 && (
        <ul className="lista-canchas-admin" aria-label="Canchas">
          {canchas.map((cancha) => (
            <li key={cancha.id} className={cancha.disponible ? 'cancha-admin' : 'cancha-admin cancha-admin-inactiva'}>
              <div className="cancha-admin-datos">
                <h3 className="cancha-admin-nombre">
                  {cancha.nombre}{' '}
                  <span className={cancha.disponible ? 'estado-cancha estado-cancha-activa' : 'estado-cancha estado-cancha-inactiva'}>
                    {cancha.disponible ? 'Activa' : 'Desactivada'}
                  </span>
                </h3>
                <p className="cancha-admin-linea">
                  <Icono nombre="pin" tamano={15} /> {cancha.direccion}
                  {cancha.zona && cancha.zona !== 'Sin zona' ? ` · ${cancha.zona}` : ''}
                </p>
                <p className="cancha-admin-linea">
                  {formateadorMoneda.format(cancha.costoHora)} por hora{cancha.tipo ? ` · ${cancha.tipo}` : ''} ·{' '}
                  {cancha.reservasFuturas} {cancha.reservasFuturas === 1 ? 'reserva futura' : 'reservas futuras'}
                </p>
              </div>
              <div className="cancha-admin-acciones">
                <button type="button" className="boton-secundario boton-compacto" onClick={() => editar(cancha.id)}>
                  Editar
                </button>
                {cancha.disponible ? (
                  <button type="button" className="boton-peligro-suave boton-compacto" onClick={() => pedirDesactivacion(cancha)}>
                    Desactivar
                  </button>
                ) : (
                  <button type="button" className="boton-acento boton-compacto" onClick={() => activar(cancha)}>
                    Activar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {porDesactivar && (
        <ConfirmarDialogo
          titulo={advertencia ? 'Esta cancha tiene reservas futuras' : '¿Desactivar esta cancha?'}
          textoConfirmar={advertencia ? 'Sí, desactivar de todos modos' : 'Sí, desactivar'}
          textoCancelar="No, conservarla"
          peligro
          cargando={procesando}
          error={errorDialogo}
          onConfirmar={confirmarDesactivacion}
          onCancelar={() => setPorDesactivar(null)}
        >
          {advertencia ? (
            <>
              <p>
                <strong>{porDesactivar.cancha.nombre}</strong> tiene <strong>{advertencia.reservasAfectadas}</strong>{' '}
                {advertencia.reservasAfectadas === 1 ? 'reserva futura confirmada' : 'reservas futuras confirmadas'}. Si la desactivas, esas reservas se conservan, pero no se aceptarán nuevas y la cancha dejará de mostrarse.
              </p>
              <ul className="reservas-afectadas">
                {advertencia.reservas.map((reserva) => (
                  <li key={reserva.id}>
                    <code>{reserva.codigo}</code> · {formatearFechaLarga(reserva.fecha)} · {reserva.horaInicio} – {reserva.horaFin} · {reserva.usuarioNombre}
                  </li>
                ))}
              </ul>
              {advertencia.reservasAfectadas > advertencia.reservas.length && <p className="texto-ayuda">Se muestran las primeras {advertencia.reservas.length}.</p>}
            </>
          ) : (
            <p>
              <strong>{porDesactivar.cancha.nombre}</strong> dejará de mostrarse en el catálogo y no admitirá nuevas reservas. Podrás reactivarla cuando quieras y su historial se conserva.
            </p>
          )}
        </ConfirmarDialogo>
      )}
    </div>
  );
}

