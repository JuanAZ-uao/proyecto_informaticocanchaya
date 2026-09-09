import { useEffect, useState } from 'react';
import { obtenerCanchas } from '../api/canchasApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
import CanchaCard from '../components/canchas/CanchaCard';

export default function CanchasListPage() {
  const [canchas, setCanchas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;

    async function cargarCanchas() {
      try {
        const { data } = await obtenerCanchas();
        if (activo) setCanchas(data.canchas);
      } catch (err) {
        if (activo) setError(extraerMensajeError(err, 'No fue posible cargar el listado de canchas'));
      } finally {
        if (activo) setCargando(false);
      }
    }

    cargarCanchas();
    return () => {
      activo = false;
    };
  }, []);

  return (
    <div>
      <h1 className="titulo-pagina">Canchas disponibles</h1>

      <Alerta mensaje={error} />

      {cargando && <p className="estado-carga">Cargando canchas...</p>}

      {!cargando && !error && canchas.length === 0 && (
        <p className="estado-vacio">No hay canchas disponibles por el momento.</p>
      )}

      {!cargando && canchas.length > 0 && (
        <div className="grid-canchas">
          {canchas.map((cancha) => (
            <CanchaCard key={cancha.id} cancha={cancha} />
          ))}
        </div>
      )}
    </div>
  );
}
