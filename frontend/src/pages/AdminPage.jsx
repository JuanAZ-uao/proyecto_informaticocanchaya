import { useCallback, useEffect, useState } from 'react';
import { listarVerificaciones } from '../api/adminApi';
import extraerMensajeError from '../api/extraerMensajeError';
import AdminNav from '../components/admin/AdminNav';
import TablaVerificaciones from '../components/admin/TablaVerificaciones';
import VerificadorCodigo from '../components/admin/VerificadorCodigo';

// US-29: panel de administración. Solo se llega aquí con rol de administrador (AdminRoute); el servidor lo vuelve a
// comprobar en cada petición y responde 403 a cualquiera que no lo sea.
export default function AdminPage() {
  const [verificaciones, setVerificaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { data } = await listarVerificaciones();
      setVerificaciones(data.verificaciones);
      setError('');
    } catch (err) {
      setError(extraerMensajeError(err, 'No fue posible cargar las verificaciones'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="contenedor seccion-espaciada admin">
      <div className="seccion-encabezado">
        <div>
          <h1 className="titulo-pagina">Panel de administración</h1>
          <p className="texto-ayuda">Verifica las reservas cuando los usuarios llegan a usar la cancha.</p>
        </div>
      </div>

      <AdminNav />

      <div className="admin-grid">
        <VerificadorCodigo onActividad={cargar} />
        <TablaVerificaciones verificaciones={verificaciones} cargando={cargando} error={error} />
      </div>
    </div>
  );
}
