import { NavLink } from 'react-router-dom';

// Acceso entre las dos pantallas de administración: verificar códigos (US-29) y cancelar reservas (US-16).
export default function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Secciones de administración">
      <NavLink to="/admin" end className="admin-nav-enlace">
        Verificar códigos
      </NavLink>
      <NavLink to="/admin/reservas" className="admin-nav-enlace">
        Cancelar reservas
      </NavLink>
    </nav>
  );
}
