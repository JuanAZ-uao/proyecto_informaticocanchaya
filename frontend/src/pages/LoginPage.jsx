import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { iniciarSesion } from '../api/authApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
import AuthLayout from '../components/layout/AuthLayout';
import useAuth from '../hooks/useAuth';

export default function LoginPage() {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const registroExitoso = location.state?.registroExitoso;
  const parametros = new URLSearchParams(location.search);
  const redirectParam = parametros.get('redirect');
  const redirectDestino = redirectParam?.startsWith('/') ? redirectParam : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      const { data } = await iniciarSesion({ correo, password });
      login(data.token, data.usuario);
      navigate(redirectDestino || '/canchas', { replace: true });
    } catch (err) {
      setError(extraerMensajeError(err, 'No fue posible iniciar sesión'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <AuthLayout titulo="Bienvenido de vuelta" subtitulo="Ingresa para reservar tu próxima cancha.">
      <form className="formulario" onSubmit={handleSubmit}>
        {registroExitoso && (
          <Alerta tipo="exito" mensaje="Cuenta creada correctamente. Ahora inicia sesión." />
        )}
        <Alerta mensaje={error} />

        <div className="campo">
          <label htmlFor="correo">Correo electrónico</label>
          <input
            id="correo"
            type="email"
            required
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoComplete="email"
            placeholder="tu@correo.com"
          />
        </div>

        <div className="campo">
          <div className="campo-etiqueta-fila">
            <label htmlFor="password">Contraseña</label>
            <Link to="/olvide-password" className="enlace-sutil">
              ¿La olvidaste?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <button className="boton-acento boton-bloque" type="submit" disabled={cargando}>
          {cargando ? 'Ingresando...' : 'Ingresar'}
        </button>

        <p className="enlace-secundario">
          ¿No tienes cuenta? <Link to="/registro">Regístrate gratis</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
