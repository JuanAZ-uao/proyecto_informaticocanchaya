import { useState } from 'react';
import { actualizarPerfil } from '../../api/perfilApi';
import extraerMensajeError, { erroresPorCampo } from '../../api/extraerMensajeError';
import Alerta from '../common/Alerta';
import Campo from '../common/Campo';
import Icono from '../common/Icono';

// US-27: nombre y teléfono. Los errores de cada campo los devuelve el servidor y se muestran junto al campo.
export default function SeccionDatos({ usuarioId, perfil, onGuardado }) {
  const [nombre, setNombre] = useState(perfil.nombre ?? '');
  const [telefono, setTelefono] = useState(perfil.telefono ?? '');
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setErrores({});
    setError('');
    setMensaje('');
    setGuardando(true);

    try {
      const { data } = await actualizarPerfil(usuarioId, { nombre, telefono });
      setNombre(data.usuario.nombre);
      setTelefono(data.usuario.telefono);
      setMensaje(data.mensaje);
      onGuardado(data.usuario);
    } catch (err) {
      const porCampo = erroresPorCampo(err);
      setErrores(porCampo);
      // Si el servidor ya indicó qué campo falló, el mensaje va junto al campo; si no, uno general.
      if (Object.keys(porCampo).length === 0) setError(extraerMensajeError(err, 'No fue posible guardar tus datos'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="perfil-seccion" aria-labelledby="titulo-datos">
      <h2 id="titulo-datos" className="perfil-seccion-titulo">
        <Icono nombre="usuario" tamano={20} /> Datos personales
      </h2>

      <form className="formulario" onSubmit={manejarSubmit} noValidate>
        <Alerta tipo="exito" mensaje={mensaje} />
        <Alerta mensaje={error} />

        <Campo etiqueta="Nombre completo" name="nombre" type="text" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} />
        <Campo
          etiqueta="Teléfono"
          name="telefono"
          type="tel"
          autoComplete="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          error={errores.telefono}
          ayuda="De 7 a 15 dígitos; puede iniciar con +."
        />

        <button type="submit" className="boton-acento" disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </section>
  );
}
