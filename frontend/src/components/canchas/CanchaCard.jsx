export default function CanchaCard({ cancha }) {
  return (
    <div className="tarjeta tarjeta-cancha">
      <h3>{cancha.nombre}</h3>
      <p>{cancha.direccion}</p>
    </div>
  );
}
