import { NavLink } from 'react-router-dom';

// Acceso entre las pantallas de administración: verificar códigos (US-29), cancelar reservas (US-16) y gestionar canchas (US-15).
export default function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Secciones de administración">
      <NavLink to="/admin" end className="admin-nav-enlace">
        Verificar códigos
      </NavLink>
      <NavLink to="/admin/reservas" className="admin-nav-enlace">
        Cancelar reservas
      </NavLink>
      <NavLink to="/admin/canchas" className="admin-nav-enlace">
        Gestionar canchas
      </NavLink>
    </nav>
  );
}
