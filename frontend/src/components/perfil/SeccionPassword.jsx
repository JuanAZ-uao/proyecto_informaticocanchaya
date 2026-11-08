import { useState } from 'react';
import { cambiarPassword } from '../../api/perfilApi';
import extraerMensajeError, { erroresPorCampo } from '../../api/extraerMensajeError';
import Alerta from '../common/Alerta';
import Campo from '../common/Campo';
import Icono from '../common/Icono';

const VACIO = { passwordActual: '', nuevaPassword: '', confirmar: '' };

// US-27: pide la contraseña actual y que la nueva cumpla las reglas de seguridad (las valida el servidor).
export default function SeccionPassword({ usuarioId }) {
  const [valores, setValores] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo) => (evento) => setValores((actuales) => ({ ...actuales, [campo]: evento.target.value }));

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setError('');
    setMensaje('');

    if (valores.nuevaPassword !== valores.confirmar) {
      setErrores({ confirmar: 'Las contraseñas no coinciden' });
      return;
    }

    setErrores({});
    setGuardando(true);

    try {
      const { data } = await cambiarPassword(usuarioId, { passwordActual: valores.passwordActual, nuevaPassword: valores.nuevaPassword });
      setMensaje(data.mensaje);
      setValores(VACIO);
    } catch (err) {
      const porCampo = erroresPorCampo(err);
      setErrores(porCampo);
      if (Object.keys(porCampo).length === 0) setError(extraerMensajeError(err, 'No fue posible cambiar la contraseña'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="perfil-seccion" aria-labelledby="titulo-password">
      <h2 id="titulo-password" className="perfil-seccion-titulo">
        <Icono nombre="candado" tamano={20} /> Contraseña
      </h2>

      <form className="formulario" onSubmit={manejarSubmit} noValidate>
        <Alerta tipo="exito" mensaje={mensaje} />
        <Alerta mensaje={error} />

        <Campo etiqueta="Contraseña actual" name="passwordActual" type="password" autoComplete="current-password" value={valores.passwordActual} onChange={cambiar('passwordActual')} error={errores.passwordActual} />
        <Campo
          etiqueta="Contraseña nueva"
          name="nuevaPassword"
          type="password"
          autoComplete="new-password"
          value={valores.nuevaPassword}
          onChange={cambiar('nuevaPassword')}
          error={errores.nuevaPassword}
          ayuda="Mínimo 8 caracteres, con al menos una letra y un número."
        />
        <Campo etiqueta="Confirmar contraseña nueva" name="confirmar" type="password" autoComplete="new-password" value={valores.confirmar} onChange={cambiar('confirmar')} error={errores.confirmar} />

        <button type="submit" className="boton-secundario" disabled={guardando}>
          {guardando ? 'Actualizando...' : 'Cambiar contraseña'}
        </button>
      </form>
    </section>
  );
}
