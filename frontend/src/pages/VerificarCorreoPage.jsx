import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verificarCorreo } from '../api/authApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
import AuthLayout from '../components/layout/AuthLayout';
import useAuth from '../hooks/useAuth';

// US-27: página a la que lleva el enlace del correo nuevo. Confirma el cambio de correo con el token del enlace.
export default function VerificarCorreoPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { estaAutenticado, actualizarUsuario } = useAuth();
  const [estado, setEstado] = useState(token ? 'verificando' : 'error');
  const [mensaje, setMensaje] = useState(token ? '' : 'El enlace de verificación no es válido. Solicita el cambio de correo de nuevo desde tu perfil.');
  // El token es de un solo uso: aunque React monte el efecto dos veces (modo estricto), solo se envía una vez.
  const enviado = useRef(false);

  useEffect(() => {
    if (!token || enviado.current) return;
    enviado.current = true;

    async function verificar() {
      try {
        const { data } = await verificarCorreo({ token });
        setMensaje(data.mensaje);
        setEstado('listo');
        if (estaAutenticado) actualizarUsuario({ correo: data.correo });
      } catch (err) {
        setMensaje(extraerMensajeError(err, 'No fue posible verificar el correo'));
        setEstado('error');
      }
    }

    void verificar();
  }, [token, estaAutenticado, actualizarUsuario]);

  return (
    <AuthLayout titulo="Verificar correo">
      {estado === 'verificando' && (
        <p className="estado-carga" aria-busy="true">
          Verificando tu correo...
        </p>
      )}
      <Alerta tipo="exito" mensaje={estado === 'listo' ? mensaje : ''} />
      <Alerta mensaje={estado === 'error' ? mensaje : ''} />

      {estado !== 'verificando' && (
        <p className="enlace-secundario">
          <Link to={estaAutenticado ? '/perfil' : '/login'}>{estaAutenticado ? 'Ir a mi perfil' : 'Iniciar sesión'}</Link>
        </p>
      )}
    </AuthLayout>
  );
}
