import { useEffect, useState } from 'react';
import { agregarMetodoPago, eliminarMetodoPago, listarMetodosPago } from '../../api/perfilApi';
import extraerMensajeError, { erroresPorCampo } from '../../api/extraerMensajeError';
import { esConexionSegura, formatearNumeroTarjeta, formatearVencimiento, separarVencimiento } from '../../utils/tarjeta';
import Alerta from '../common/Alerta';
import Campo from '../common/Campo';
import ConfirmarDialogo from '../common/ConfirmarDialogo';
import Icono from '../common/Icono';

const FORMULARIO_VACIO = { numero: '', titular: '', vencimiento: '', cvv: '' };

// US-28: tarjetas del usuario. Se muestran enmascaradas (marca y últimos 4); el número completo y el CVV solo
// existen en el formulario hasta que se envían, y se borran al guardar.
export default function SeccionTarjetas({ usuarioId }) {
  const [tarjetas, setTarjetas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorLista, setErrorLista] = useState('');
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [porEliminar, setPorEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState('');
  const conexionSegura = esConexionSegura();

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        const { data } = await listarMetodosPago(usuarioId);
        if (activo) setTarjetas(data.metodosPago);
      } catch (err) {
        if (activo) setErrorLista(extraerMensajeError(err, 'No fue posible cargar tus tarjetas'));
      } finally {
        if (activo) setCargando(false);
      }
    }

    void cargar();
    return () => {
      activo = false;
    };
  }, [usuarioId]);

  function alCambiar(campo, formatear = (valor) => valor) {
    return (evento) => setFormulario((actual) => ({ ...actual, [campo]: formatear(evento.target.value) }));
  }

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setErrores({});
    setError('');
    setMensaje('');
    setGuardando(true);

    try {
      const { data } = await agregarMetodoPago(usuarioId, {
        numero: formulario.numero,
        titular: formulario.titular,
        ...separarVencimiento(formulario.vencimiento),
        cvv: formulario.cvv,
      });
      setTarjetas((actuales) => [...actuales, data.metodoPago]);
      setMensaje(data.mensaje);
      setFormulario(FORMULARIO_VACIO);
    } catch (err) {
      const porCampo = erroresPorCampo(err);
      setErrores(porCampo);
      // Si el servidor ya indicó qué campo falló, el mensaje va junto al campo; si no, uno general.
      if (Object.keys(porCampo).length === 0) setError(extraerMensajeError(err, 'No fue posible guardar la tarjeta'));
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminacion() {
    setEliminando(true);
    setErrorEliminar('');

    try {
      await eliminarMetodoPago(usuarioId, porEliminar.id);
      setTarjetas((actuales) => actuales.filter((t) => t.id !== porEliminar.id));
      setPorEliminar(null);
      setMensaje('Tarjeta eliminada. Ya no aparece como opción de pago.');
    } catch (err) {
      setErrorEliminar(extraerMensajeError(err, 'No fue posible eliminar la tarjeta'));
    } finally {
      setEliminando(false);
    }
  }

  return (
    <section className="perfil-seccion perfil-seccion-ancha" aria-labelledby="titulo-tarjetas">
      <h2 id="titulo-tarjetas" className="perfil-seccion-titulo">
        <Icono nombre="tarjeta" tamano={20} /> Métodos de pago
      </h2>
      <p className="texto-ayuda">
        Guarda una tarjeta para pagar tus reservas al confirmarlas. Solo conservamos la marca y los últimos 4 dígitos: el número completo y el CVV nunca se almacenan.
      </p>

      <Alerta mensaje={errorLista} />
      {cargando && <p className="estado-carga estado-carga-compacto">Cargando tus tarjetas...</p>}
      {!cargando && !errorLista && tarjetas.length === 0 && <p className="perfil-vacio">Aún no tienes tarjetas guardadas.</p>}

      {tarjetas.length > 0 && (
        <ul className="lista-tarjetas">
          {tarjetas.map((tarjeta) => (
            <li key={tarjeta.id} className="tarjeta-guardada">
              <span className="tarjeta-guardada-icono">
                <Icono nombre="tarjeta" tamano={22} />
              </span>
              <span className="tarjeta-guardada-datos">
                <strong>
                  {tarjeta.marca} ···· {tarjeta.ultimos4}
                </strong>
                <small>
                  {tarjeta.titular} · vence {tarjeta.vencimiento}
                </small>
              </span>
              <button type="button" className="boton-fantasma boton-compacto" onClick={() => setPorEliminar(tarjeta)} aria-label={`Eliminar la tarjeta ${tarjeta.marca} terminada en ${tarjeta.ultimos4}`}>
                <Icono nombre="basura" tamano={16} /> Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="perfil-subtitulo">Agregar una tarjeta</h3>
      {!conexionSegura && (
        <Alerta mensaje="Por seguridad, solo puedes agregar una tarjeta desde una conexión segura (HTTPS). Abre la aplicación con https://." />
      )}

      <form className="formulario" onSubmit={manejarSubmit} noValidate>
        <Alerta tipo="exito" mensaje={mensaje} />
        <Alerta mensaje={error} />

        <Campo
          etiqueta="Número de tarjeta"
          name="numero"
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 5678 9012 3456"
          value={formulario.numero}
          onChange={alCambiar('numero', formatearNumeroTarjeta)}
          error={errores.numero}
          disabled={!conexionSegura}
        />
        <Campo etiqueta="Nombre del titular" name="titular" type="text" autoComplete="cc-name" value={formulario.titular} onChange={alCambiar('titular')} error={errores.titular} disabled={!conexionSegura} />

        <div className="fila-campos">
          <Campo
            etiqueta="Vencimiento (MM/AA)"
            name="vencimiento"
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/AA"
            value={formulario.vencimiento}
            onChange={alCambiar('vencimiento', formatearVencimiento)}
            error={errores.vencimientoMes || errores.vencimientoAnio}
            disabled={!conexionSegura}
          />
          <Campo
            etiqueta="CVV"
            name="cvv"
            type="password"
            inputMode="numeric"
            autoComplete="cc-csc"
            maxLength={4}
            value={formulario.cvv}
            onChange={alCambiar('cvv', (valor) => valor.replace(/\D/g, ''))}
            error={errores.cvv}
            disabled={!conexionSegura}
          />
        </div>

        <button type="submit" className="boton-acento" disabled={guardando || !conexionSegura}>
          {guardando ? 'Guardando...' : 'Guardar tarjeta'}
        </button>
      </form>

      {porEliminar && (
        <ConfirmarDialogo
          titulo="¿Eliminar esta tarjeta?"
          textoConfirmar="Sí, eliminar"
          peligro
          cargando={eliminando}
          error={errorEliminar}
          onConfirmar={confirmarEliminacion}
          onCancelar={() => {
            setPorEliminar(null);
            setErrorEliminar('');
          }}
        >
          <p>
            Se borrará <strong>{porEliminar.marca} ···· {porEliminar.ultimos4}</strong> y dejará de aparecer como opción de pago. Las reservas que ya pagaste con ella no se ven afectadas.
          </p>
        </ConfirmarDialogo>
      )}
    </section>
  );
}
