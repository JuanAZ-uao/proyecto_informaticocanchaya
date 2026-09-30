import { Link, NavLink, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import Icono from '../common/Icono';

function obtenerIniciales(nombre = '') {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join('');
}

export default function Navbar() {
  const { estaAutenticado, usuario, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="navbar">
      <div className="navbar-interior">
        <Link to="/" className="marca" aria-label="CanchaYa, ir al inicio">
          <span className="marca-logo">
            <Icono nombre="balon" tamano={20} />
          </span>
          <span className="marca-texto">
            Cancha<span>Ya</span>
          </span>
        </Link>

        <nav className="navbar-links" aria-label="Principal">
          {estaAutenticado ? (
            <>
              <NavLink to="/canchas" className="navbar-enlace">
                Canchas
              </NavLink>
              <span className="navbar-usuario" title={usuario?.correo}>
                <span className="avatar" aria-hidden="true">
                  {obtenerIniciales(usuario?.nombre)}
                </span>
                <span className="navbar-nombre">{usuario?.nombre?.split(' ')[0]}</span>
              </span>
              <button type="button" className="navbar-salir" onClick={handleLogout}>
                <Icono nombre="salir" tamano={16} />
                <span>Salir</span>
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="navbar-enlace navbar-enlace-opcional">
                Iniciar sesión
              </NavLink>
              <Link to="/registro" className="boton-acento boton-compacto">
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
