import { Navigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import ProtectedRoute from './ProtectedRoute';

// US-16: exige sesión iniciada y rol de administrador. Es solo comodidad de interfaz: el
// backend vuelve a comprobar el rol en cada petición a /api/admin.
export default function AdminRoute({ children }) {
  const { esAdministrador } = useAuth();

  return (
    <ProtectedRoute>{esAdministrador ? children : <Navigate to="/canchas" replace />}</ProtectedRoute>
  );
}
