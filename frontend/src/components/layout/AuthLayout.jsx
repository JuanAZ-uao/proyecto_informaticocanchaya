import Icono from '../common/Icono';

export default function AuthLayout({ titulo, subtitulo, children }) {
  return (
    <div className="auth">
      <div className="auth-tarjeta">
        <aside className="auth-panel">
          <img className="auth-panel-foto" src="/img/canchas/los-cerros.jpg" alt="" />
          <div className="auth-panel-contenido">
            <span className="etiqueta-acento">Canchas sintéticas · Cali</span>
            <h2>Tu partido empieza aquí</h2>
            <ul className="auth-beneficios">
              <li>
                <Icono nombre="rayo" tamano={18} /> Reserva en menos de 2 minutos
              </li>
              <li>
                <Icono nombre="bombillo" tamano={18} /> Canchas iluminadas para jugar de noche
              </li>
              <li>
                <Icono nombre="escudo" tamano={18} /> Tu franja queda bloqueada solo para ti
              </li>
            </ul>
          </div>
        </aside>

        <section className="auth-formulario">
          <h1 className="titulo-pagina">{titulo}</h1>
          {subtitulo && <p className="auth-subtitulo">{subtitulo}</p>}
          {children}
        </section>
      </div>
    </div>
  );
}
