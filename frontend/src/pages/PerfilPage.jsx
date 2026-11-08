import { useEffect, useState } from 'react';
import { obtenerPerfil } from '../api/perfilApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
import SeccionCorreo from '../components/perfil/SeccionCorreo';
import SeccionDatos from '../components/perfil/SeccionDatos';
import SeccionPassword from '../components/perfil/SeccionPassword';
import SeccionTarjetas from '../components/perfil/SeccionTarjetas';
import useAuth from '../hooks/useAuth';

// US-27 y US-28: "Mi perfil". Cada usuario solo ve y edita su propio perfil (el servidor responde 403 con otro id).
export default function PerfilPage() {
  const { usuario, actualizarUsuario } = useAuth();
  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        const { data } = await obtenerPerfil(usuario.id);
        if (activo) setPerfil(data.usuario);
      } catch (err) {
        if (activo) setError(extraerMensajeError(err, 'No fue posible cargar tu perfil'));
      }
    }

    void cargar();
    return () => {
      activo = false;
    };
  }, [usuario.id]);

  function manejarGuardado(actualizado) {
    setPerfil((actual) => ({ ...actual, ...actualizado }));
    actualizarUsuario({ nombre: actualizado.nombre });
  }

  return (
    <div className="contenedor seccion-espaciada perfil">
      <div className="seccion-encabezado">
        <div>
          <h1 className="titulo-pagina">Mi perfil</h1>
          <p className="texto-ayuda">Mantén tus datos al día y administra cómo pagas tus reservas.</p>
        </div>
      </div>

      <Alerta mensaje={error} />
      {!perfil && !error && (
        <p className="estado-carga" aria-busy="true">
          Cargando tu perfil...
        </p>
      )}

      {perfil && (
        <div className="perfil-grid">
          <SeccionDatos usuarioId={usuario.id} perfil={perfil} onGuardado={manejarGuardado} />
          <SeccionCorreo usuarioId={usuario.id} correo={perfil.correo} correoPendiente={perfil.correoPendiente} onSolicitado={(correo) => setPerfil((actual) => ({ ...actual, correoPendiente: correo }))} />
          <SeccionPassword usuarioId={usuario.id} />
          <SeccionTarjetas usuarioId={usuario.id} />
        </div>
      )}
    </div>
  );
}
