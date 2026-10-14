import { Navigate, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

export default function ProtectedRoute({ children }) {
  const { estaAutenticado, cerroSesion } = useAuth();
  const location = useLocation();

  if (!estaAutenticado) {
    // Cierre de sesión voluntario: se va al login sin recordar la ruta.
    if (cerroSesion) return <Navigate to="/login" replace />;

    const rutaActual = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(rutaActual)}`} replace />;
  }

  return children;
}
