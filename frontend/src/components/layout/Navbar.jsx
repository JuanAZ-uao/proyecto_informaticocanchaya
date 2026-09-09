import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

export default function Navbar() {
  const { estaAutenticado, usuario, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="navbar">
      <Link to="/" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
        CanchaYa
      </Link>
      <nav className="navbar-links">
        {estaAutenticado ? (
          <>
            <Link to="/canchas">Canchas</Link>
            <span>Hola, {usuario?.nombre}</span>
            <button type="button" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Iniciar sesión</Link>
            <Link to="/registro">Registrarme</Link>
          </>
        )}
      </nav>
    </header>
  );
}
