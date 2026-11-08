import Alerta from '../common/Alerta';
import Icono from '../common/Icono';

const RESULTADOS = {
  vigente: 'Vigente',
  vencida: 'No vigente · vencida',
  cancelada: 'No vigente · cancelada',
  usada: 'No vigente · usada',
  no_encontrado: 'Código no encontrado',
  marcada_usada: 'Marcada como utilizada',
};

function formatearMomento(iso) {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });
}

// US-29: registro de auditoría (quién verificó qué código, con qué resultado y cuándo).
export default function TablaVerificaciones({ verificaciones, cargando, error }) {
  return (
    <section className="admin-seccion" aria-labelledby="titulo-auditoria">
      <h2 id="titulo-auditoria" className="perfil-seccion-titulo">
        <Icono nombre="reloj" tamano={20} /> Últimas verificaciones
      </h2>

      <Alerta mensaje={error} />
      {cargando && verificaciones.length === 0 && <p className="estado-carga estado-carga-compacto">Cargando...</p>}
      {!cargando && !error && verificaciones.length === 0 && <p className="perfil-vacio">Todavía no hay verificaciones registradas.</p>}

      {verificaciones.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla-auditoria">
            <thead>
              <tr>
                <th scope="col">Fecha y hora</th>
                <th scope="col">Administrador</th>
                <th scope="col">Código</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {verificaciones.map((v) => (
                <tr key={v.id}>
                  <td>{formatearMomento(v.createdAt)}</td>
                  <td>{v.administrador ?? '—'}</td>
                  <td>
                    <code>{v.codigo}</code>
                  </td>
                  <td>
                    <span className={`resultado-auditoria resultado-${v.resultado}`}>{RESULTADOS[v.resultado] ?? v.resultado}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
