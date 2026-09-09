import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { iniciarSesion } from '../api/authApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      const { data } = await iniciarSesion({ correo, password });
      login(data.token, data.usuario);
      navigate('/canchas');
    } catch (err) {
      setError(extraerMensajeError(err, 'No fue posible iniciar sesión'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="tarjeta">
      <h1 className="titulo-pagina">Iniciar sesión</h1>
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
          />
        </div>

        <div className="campo">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <button className="boton-primario" type="submit" disabled={cargando}>
          {cargando ? 'Ingresando...' : 'Ingresar'}
        </button>

        <p className="enlace-secundario">
          <Link to="/olvide-password">¿Olvidaste tu contraseña?</Link>
        </p>
        <p className="enlace-secundario">
          ¿No tienes cuenta? <Link to="/registro">Regístrate</Link>
        </p>
      </form>
    </div>
  );
}
