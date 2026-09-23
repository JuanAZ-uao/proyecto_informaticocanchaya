import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import RegisterPage from '../pages/RegisterPage';
import LoginPage from '../pages/LoginPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import CanchasListPage from '../pages/CanchasListPage';
import CanchaDetallePage from '../pages/CanchaDetallePage';

export default function AppRouter() {
  const location = useLocation();
  const esVistaAncha = location.pathname === '/canchas';

  return (
    <div className="contenedor-app">
      <Navbar />
      <main className={`contenido ${esVistaAncha ? 'ancho' : ''}`}>
        <Routes>
          <Route path="/" element={<Navigate to="/canchas" replace />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/olvide-password" element={<ForgotPasswordPage />} />
          <Route path="/restablecer-password" element={<ResetPasswordPage />} />
          <Route
            path="/canchas"
            element={
              <ProtectedRoute>
                <CanchasListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/canchas/:id"
            element={
              <ProtectedRoute>
                <CanchaDetallePage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/canchas" replace />} />
        </Routes>
      </main>
    </div>
  );
}
