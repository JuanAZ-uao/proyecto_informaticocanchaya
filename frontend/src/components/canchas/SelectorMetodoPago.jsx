import { Link } from 'react-router-dom';
import Icono from '../common/Icono';

// US-28: elige cómo pagar al confirmar. El pago con tarjeta es opcional: sin tarjeta se reserva como siempre
// (se paga en la cancha). Solo muestra tarjetas enmascaradas: el número completo nunca llega al navegador.
export default function SelectorMetodoPago({ metodos, valor, onChange, cargando = false, deshabilitado = false }) {
  return (
    <fieldset className="selector-pago" disabled={deshabilitado}>
      <legend>Método de pago</legend>

      <label className={valor === '' ? 'opcion-pago seleccionada' : 'opcion-pago'}>
        <input type="radio" name="metodo-pago" value="" checked={valor === ''} onChange={() => onChange('')} />
        <span>Pagar en la cancha</span>
      </label>

      {metodos.map((metodo) => (
        <label key={metodo.id} className={valor === metodo.id ? 'opcion-pago seleccionada' : 'opcion-pago'}>
          <input type="radio" name="metodo-pago" value={metodo.id} checked={valor === metodo.id} onChange={() => onChange(metodo.id)} />
          <span>
            <Icono nombre="tarjeta" tamano={16} /> {metodo.marca} ···· {metodo.ultimos4}
            <small> vence {metodo.vencimiento}</small>
          </span>
        </label>
      ))}

      {cargando && <p className="texto-ayuda">Cargando tus tarjetas...</p>}
      {!cargando && metodos.length === 0 && (
        <p className="texto-ayuda">
          ¿Prefieres pagar ahora? <Link to="/perfil">Agrega una tarjeta en tu perfil</Link>.
        </p>
      )}
    </fieldset>
  );
}
