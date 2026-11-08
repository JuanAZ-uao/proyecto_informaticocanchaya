import { useState } from 'react';
import { solicitarCambioCorreo } from '../../api/perfilApi';
import extraerMensajeError, { erroresPorCampo } from '../../api/extraerMensajeError';
import Alerta from '../common/Alerta';
import Campo from '../common/Campo';
import Icono from '../common/Icono';

// US-27: el correo no cambia al enviar el formulario. Se manda un enlace al correo nuevo y el cambio se aplica
// cuando el usuario lo abre.
export default function SeccionCorreo({ usuarioId, correo, correoPendiente, onSolicitado }) {
  const [nuevoCorreo, setNuevoCorreo] = useState('');
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setErrores({});
    setError('');
    setMensaje('');
    setEnviando(true);

    try {
      const { data } = await solicitarCambioCorreo(usuarioId, { nuevoCorreo });
      setMensaje(data.mensaje);
      onSolicitado(nuevoCorreo.trim().toLowerCase());
      setNuevoCorreo('');
    } catch (err) {
      const porCampo = erroresPorCampo(err);
      setErrores(porCampo);
      if (Object.keys(porCampo).length === 0) setError(extraerMensajeError(err, 'No fue posible solicitar el cambio de correo'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="perfil-seccion" aria-labelledby="titulo-correo">
      <h2 id="titulo-correo" className="perfil-seccion-titulo">
        <Icono nombre="correo" tamano={20} /> Correo electrónico
      </h2>

      <p className="perfil-dato">
        Correo actual: <strong>{correo}</strong>
      </p>
      {correoPendiente && (
        <p className="perfil-pendiente" role="status">
          Esperando verificación de <strong>{correoPendiente}</strong>: abre el enlace que te enviamos para confirmarlo. Mientras tanto sigues usando el correo actual.
        </p>
      )}

      <form className="formulario" onSubmit={manejarSubmit} noValidate>
        <Alerta tipo="exito" mensaje={mensaje} />
        <Alerta mensaje={error} />

        <Campo
          etiqueta="Correo nuevo"
          name="nuevoCorreo"
          type="email"
          autoComplete="email"
          value={nuevoCorreo}
          onChange={(e) => setNuevoCorreo(e.target.value)}
          error={errores.nuevoCorreo}
          ayuda="Te enviaremos un enlace de verificación a ese correo."
        />

        <button type="submit" className="boton-secundario" disabled={enviando}>
          {enviando ? 'Enviando...' : 'Enviar enlace de verificación'}
        </button>
      </form>
    </section>
  );
}
