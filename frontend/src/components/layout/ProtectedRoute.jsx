import { Navigate, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

export default function ProtectedRoute({ children }) {
  const { estaAutenticado } = useAuth();
  const location = useLocation();

  if (!estaAutenticado) {
    const rutaActual = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(rutaActual)}`} replace />;
  }

  return children;
}
