import { useEffect, useState } from 'react';
import { obtenerCanchas } from '../api/canchasApi';
import extraerMensajeError from '../api/extraerMensajeError';
import Alerta from '../components/common/Alerta';
import Icono from '../components/common/Icono';
import CanchaCard from '../components/canchas/CanchaCard';
import FiltroCanchas from '../components/canchas/FiltroCanchas';
import useAuth from '../hooks/useAuth';

export default function CanchasListPage() {
  const [canchas, setCanchas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtros, setFiltros] = useState({});
  const { usuario } = useAuth();
  const primerNombre = usuario?.nombre?.split(' ')[0];

  useEffect(() => {
    let activo = true;

    async function cargarCanchas() {
      setCargando(true);
      setError('');
      try {
        const { data } = await obtenerCanchas(filtros);
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
  }, [filtros]);

  return (
    <div>
      <section className="hero">
        <img className="hero-foto" src="/img/canchas/santa-monica.jpg" alt="" />
        <div className="hero-velo" />
        <div className="contenedor hero-contenido">
          <span className="etiqueta-acento">
            <Icono nombre="rayo" tamano={14} /> Reserva en menos de 2 minutos
          </span>
          <h1 className="hero-titulo">
            {primerNombre ? `${primerNombre}, ¿dónde` : '¿Dónde'} <span>juegas hoy?</span>
          </h1>
          <p className="hero-texto">
            Canchas sintéticas en Cali con grama de alto rendimiento, iluminación para jugar de noche y tu franja
            asegurada apenas confirmas.
          </p>
          <ul className="hero-datos">
            <li>
              <Icono nombre="bombillo" tamano={16} /> Iluminación LED
            </li>
            <li>
              <Icono nombre="reloj" tamano={16} /> Abierto todos los días
            </li>
            <li>
              <Icono nombre="escudo" tamano={16} /> Sin reservas duplicadas
            </li>
          </ul>
        </div>
      </section>

      <div className="contenedor">
        <div className="panel-filtros">
          <FiltroCanchas onFiltrar={setFiltros} />
        </div>

        <div className="seccion-encabezado">
          <div>
            <h2 className="seccion-titulo">Canchas disponibles</h2>
            <p className="texto-ayuda">
              El filtro de fecha muestra canchas con horario ese día; los bloques libres se confirman en la ficha de
              cada cancha.
            </p>
          </div>
          {!cargando && !error && (
            <span className="contador">
              {canchas.length} {canchas.length === 1 ? 'cancha' : 'canchas'}
            </span>
          )}
        </div>

        <Alerta mensaje={error} />

        {cargando && (
          <div className="grid-canchas" aria-busy="true">
            <span className="sr-only">Cargando canchas...</span>
            {[0, 1, 2].map((indice) => (
              <div key={indice} className="tarjeta-esqueleto" aria-hidden="true">
                <div className="esqueleto esqueleto-media" />
                <div className="esqueleto esqueleto-linea" />
                <div className="esqueleto esqueleto-linea corta" />
              </div>
            ))}
          </div>
        )}

        {!cargando && !error && canchas.length === 0 && (
          <div className="estado-vacio">
            <Icono nombre="lupa" tamano={40} grosor={1.5} />
            <h3>No encontramos canchas con esos filtros</h3>
            <p>Prueba con otra zona o amplía el rango de precios.</p>
          </div>
        )}

        {!cargando && canchas.length > 0 && (
          <div className="grid-canchas">
            {canchas.map((cancha) => (
              <CanchaCard key={cancha.id} cancha={cancha} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
