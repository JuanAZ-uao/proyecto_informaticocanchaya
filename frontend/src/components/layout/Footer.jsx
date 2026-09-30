import Icono from '../common/Icono';

export default function Footer() {
  return (
    <footer className="pie">
      <div className="contenedor pie-interior">
        <div className="pie-marca">
          <span className="marca-texto">
            Cancha<span>Ya</span>
          </span>
          <p>Canchas sintéticas en Cali. Reserva en línea y juega sin esperas.</p>
        </div>
        <ul className="pie-datos">
          <li>
            <Icono nombre="reloj" tamano={16} /> Abierto todos los días
          </li>
          <li>
            <Icono nombre="pin" tamano={16} /> Sedes en toda Cali
          </li>
          <li>
            <Icono nombre="escudo" tamano={16} /> Tu franja se bloquea al confirmar
          </li>
        </ul>
      </div>
      <div className="contenedor pie-legal">
        © {new Date().getFullYear()} CanchaYa
      </div>
    </footer>
  );
}
