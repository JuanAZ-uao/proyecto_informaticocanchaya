import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { restablecerPassword } from '../api/authApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
import AuthLayout from '../components/layout/AuthLayout';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (nuevaPassword !== confirmarPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setCargando(true);
    try {
      await restablecerPassword({ token, nuevaPassword });
      navigate('/login', { state: { registroExitoso: false } });
    } catch (err) {
      setError(extraerMensajeError(err, 'No fue posible restablecer la contraseña'));
    } finally {
      setCargando(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout titulo="Restablecer contraseña">
        <Alerta mensaje="El enlace de recuperación no es válido. Solicita uno nuevo." />
        <p className="enlace-secundario">
          <Link to="/olvide-password">Solicitar nuevo enlace</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titulo="Restablecer contraseña" subtitulo="Elige una contraseña nueva para tu cuenta.">
      <form className="formulario" onSubmit={handleSubmit}>
        <Alerta mensaje={error} />

        <div className="campo">
          <label htmlFor="nuevaPassword">Nueva contraseña</label>
          <input
            id="nuevaPassword"
            type="password"
            required
            minLength={8}
            pattern="(?=.*[A-Za-z])(?=.*\d).{8,}"
            title="Mínimo 8 caracteres, incluyendo al menos una letra y un número"
            value={nuevaPassword}
            onChange={(e) => setNuevaPassword(e.target.value)}
            autoComplete="new-password"
          />
          <span className="texto-ayuda">Mínimo 8 caracteres, con al menos una letra y un número.</span>
        </div>

        <div className="campo">
          <label htmlFor="confirmarPassword">Confirmar contraseña</label>
          <input
            id="confirmarPassword"
            type="password"
            required
            minLength={8}
            value={confirmarPassword}
            onChange={(e) => setConfirmarPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <button className="boton-acento boton-bloque" type="submit" disabled={cargando}>
          {cargando ? 'Actualizando...' : 'Actualizar contraseña'}
        </button>
      </form>
    </AuthLayout>
  );
}
