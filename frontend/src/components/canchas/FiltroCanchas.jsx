import { useState } from 'react';

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
    <form className="formulario formulario-filtro" onSubmit={manejarSubmit}>
      <div className="campo">
        <label htmlFor="zona">Zona</label>
        <input
          id="zona"
          type="text"
          value={zona}
          onChange={(evento) => setZona(evento.target.value)}
          placeholder="Ej: Norte"
        />
      </div>

      <div className="campo">
        <label htmlFor="precioMin">Precio mín. ($/hora)</label>
        <input
          id="precioMin"
          type="number"
          min="0"
          value={precioMin}
          onChange={(evento) => setPrecioMin(evento.target.value)}
        />
      </div>

      <div className="campo">
        <label htmlFor="precioMax">Precio máx. ($/hora)</label>
        <input
          id="precioMax"
          type="number"
          min="0"
          value={precioMax}
          onChange={(evento) => setPrecioMax(evento.target.value)}
        />
      </div>

      <div className="campo">
        <label htmlFor="fecha">Fecha</label>
        <input
          id="fecha"
          type="date"
          value={fecha}
          onChange={(evento) => setFecha(evento.target.value)}
        />
      </div>

      <div className="fila-botones">
        <button type="submit" className="boton-primario">Filtrar</button>
        <button type="button" className="boton-secundario" onClick={limpiarFiltros}>Limpiar</button>
      </div>
    </form>
  );
}
