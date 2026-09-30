import { useState } from 'react';
import Icono from '../common/Icono';

const ZONAS_SUGERIDAS = ['Norte', 'Sur', 'Oeste', 'Oriente', 'Centro'];

export default function FiltroCanchas({ onFiltrar }) {
  const [zona, setZona] = useState('');
  const [precioMin, setPrecioMin] = useState('');
  const [precioMax, setPrecioMax] = useState('');
  const [fecha, setFecha] = useState('');

  function manejarSubmit(evento) {
    evento.preventDefault();
    onFiltrar({ zona, precioMin, precioMax, fecha });
  }

  function limpiarFiltros() {
    setZona('');
    setPrecioMin('');
    setPrecioMax('');
    setFecha('');
    onFiltrar({});
  }

  return (
    <form className="formulario-filtro" onSubmit={manejarSubmit} aria-label="Filtrar canchas">
      <div className="campo">
        <label htmlFor="zona">
          <Icono nombre="pin" tamano={14} /> Zona
        </label>
        <input
          id="zona"
          type="text"
          list="zonas-sugeridas"
          value={zona}
          onChange={(evento) => setZona(evento.target.value)}
          placeholder="Todas las zonas"
        />
        <datalist id="zonas-sugeridas">
          {ZONAS_SUGERIDAS.map((opcion) => (
            <option key={opcion} value={opcion} />
          ))}
        </datalist>
      </div>

      <div className="campo">
        <label htmlFor="precioMin">Precio mín. / hora</label>
        <input
          id="precioMin"
          type="number"
          min="0"
          step="5000"
          value={precioMin}
          onChange={(evento) => setPrecioMin(evento.target.value)}
          placeholder="$ 0"
        />
      </div>

      <div className="campo">
        <label htmlFor="precioMax">Precio máx. / hora</label>
        <input
          id="precioMax"
          type="number"
          min="0"
          step="5000"
          value={precioMax}
          onChange={(evento) => setPrecioMax(evento.target.value)}
          placeholder="Sin límite"
        />
      </div>

      <div className="campo">
        <label htmlFor="fecha">
          <Icono nombre="calendario" tamano={14} /> Fecha
        </label>
        <input id="fecha" type="date" value={fecha} onChange={(evento) => setFecha(evento.target.value)} />
      </div>

      <div className="fila-botones">
        <button type="submit" className="boton-primario">
          <Icono nombre="lupa" tamano={16} /> Buscar
        </button>
        <button type="button" className="boton-fantasma" onClick={limpiarFiltros}>
          Limpiar
        </button>
      </div>
    </form>
  );
}
