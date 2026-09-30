import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registrarUsuario } from '../api/authApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
import AuthLayout from '../components/layout/AuthLayout';

const valoresIniciales = { nombre: '', correo: '', telefono: '', password: '' };

export default function RegisterPage() {
  const [form, setForm] = useState(valoresIniciales);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      await registrarUsuario(form);
      navigate('/login', { state: { registroExitoso: true } });
    } catch (err) {
      setError(extraerMensajeError(err, 'No fue posible completar el registro'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <AuthLayout titulo="Crea tu cuenta" subtitulo="Es gratis y en menos de un minuto estás reservando.">
      <form className="formulario" onSubmit={handleSubmit}>
        <Alerta mensaje={error} />

        <div className="campo">
          <label htmlFor="nombre">Nombre completo</label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            required
            value={form.nombre}
            onChange={handleChange}
            autoComplete="name"
          />
        </div>

        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="correo">Correo electrónico</label>
            <input
              id="correo"
              name="correo"
              type="email"
              required
              value={form.correo}
              onChange={handleChange}
              autoComplete="email"
            />
          </div>

          <div className="campo">
            <label htmlFor="telefono">Teléfono</label>
            <input
              id="telefono"
              name="telefono"
              type="tel"
              required
              value={form.telefono}
              onChange={handleChange}
              autoComplete="tel"
            />
          </div>
        </div>

        <div className="campo">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            pattern="(?=.*[A-Za-z])(?=.*\d).{8,}"
            title="Mínimo 8 caracteres, incluyendo al menos una letra y un número"
            value={form.password}
            onChange={handleChange}
            autoComplete="new-password"
          />
          <span className="texto-ayuda">Mínimo 8 caracteres, con al menos una letra y un número.</span>
        </div>

        <button className="boton-acento boton-bloque" type="submit" disabled={cargando}>
          {cargando ? 'Creando cuenta...' : 'Registrarme'}
        </button>

        <p className="enlace-secundario">
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
