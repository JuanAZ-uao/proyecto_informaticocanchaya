import { useState } from 'react';
import { Link } from 'react-router-dom';
import { solicitarRecuperacion } from '../api/authApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';

export default function ForgotPasswordPage() {
  const [correo, setCorreo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMensaje('');
    setCargando(true);

    try {
      const { data } = await solicitarRecuperacion({ correo });
      setMensaje(data.mensaje);
    } catch (err) {
      setError(extraerMensajeError(err, 'No fue posible procesar la solicitud'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="tarjeta">
      <h1 className="titulo-pagina">Recuperar contraseña</h1>
      <form className="formulario" onSubmit={handleSubmit}>
        <Alerta mensaje={error} />
        <Alerta tipo="exito" mensaje={mensaje} />

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

        <button className="boton-primario" type="submit" disabled={cargando}>
          {cargando ? 'Enviando...' : 'Enviar enlace de recuperación'}
        </button>

        <p className="enlace-secundario">
          <Link to="/login">Volver a iniciar sesión</Link>
        </p>
      </form>
    </div>
  );
}
