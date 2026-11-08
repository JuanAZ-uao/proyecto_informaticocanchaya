import { Navigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import ProtectedRoute from './ProtectedRoute';

// US-29: además de iniciar sesión, exige rol de administrador. Quien no lo es vuelve a las canchas y nunca ve el panel
// (el backend también responde 403 a sus llamadas).
export default function AdminRoute({ children }) {
  const { esAdministrador } = useAuth();

  return (
    <ProtectedRoute>
      {esAdministrador ? children : <Navigate to="/canchas" replace />}
    </ProtectedRoute>
  );
}
