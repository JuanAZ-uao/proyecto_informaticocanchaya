import { useState } from 'react';
import Alerta from '../common/Alerta';
import Campo from '../common/Campo';
import { DIAS_SEMANA, TIPOS_CANCHA, aListaHorarios, errorDeHorarios, estadoHorarios } from '../../utils/horariosCancha';

// US-15: formulario para crear o editar una cancha. Los errores de cada campo (los del servidor y los de los horarios,
// que también se comprueban antes de enviar) se muestran junto al campo.
export default function FormularioCancha({ cancha = null, guardando = false, errores = {}, error = '', onGuardar, onCancelar }) {
  const [valores, setValores] = useState({
    nombre: cancha?.nombre ?? '',
    direccion: cancha?.direccion ?? '',
    zona: cancha?.zona && cancha.zona !== 'Sin zona' ? cancha.zona : '',
    costoHora: cancha ? String(cancha.costoHora) : '',
    tipo: cancha?.tipo ?? '',
    descripcion: cancha?.descripcion ?? '',
    servicios: (cancha?.servicios ?? []).join(', '),
  });
  const [horarios, setHorarios] = useState(() => estadoHorarios(cancha?.horarios));
  const [errorHorarios, setErrorHorarios] = useState('');

  const cambiar = (campo) => (evento) => setValores((actuales) => ({ ...actuales, [campo]: evento.target.value }));
  const cambiarHorario = (diaSemana, cambio) =>
    setHorarios((actuales) => ({ ...actuales, [diaSemana]: { ...actuales[diaSemana], ...cambio } }));

  function manejarSubmit(evento) {
    evento.preventDefault();

    const problema = errorDeHorarios(horarios);
    setErrorHorarios(problema ?? '');
    if (problema) return;

    onGuardar({
      nombre: valores.nombre,
      direccion: valores.direccion,
      zona: valores.zona,
      costoHora: valores.costoHora === '' ? '' : Number(valores.costoHora),
      tipo: valores.tipo,
      descripcion: valores.descripcion,
      servicios: valores.servicios.split(',').map((servicio) => servicio.trim()).filter(Boolean),
      horarios: aListaHorarios(horarios),
    });
  }

  const mensajeHorarios = errorHorarios || errores.horarios;

  return (
    <form className="formulario formulario-cancha" onSubmit={manejarSubmit} noValidate aria-label={cancha ? 'Editar cancha' : 'Nueva cancha'}>
      <Alerta mensaje={error} />

      <div className="fila-campos">
        <Campo etiqueta="Nombre" name="nombre" type="text" value={valores.nombre} onChange={cambiar('nombre')} error={errores.nombre} />
        <Campo etiqueta="Zona" name="zona" type="text" value={valores.zona} onChange={cambiar('zona')} error={errores.zona} placeholder="Norte, Sur, Centro…" />
      </div>
      <Campo etiqueta="Dirección" name="direccion" type="text" value={valores.direccion} onChange={cambiar('direccion')} error={errores.direccion} />

      <div className="fila-campos">
        <Campo
          etiqueta="Precio por hora (COP)"
          name="costoHora"
          type="number"
          inputMode="decimal"
          min="0"
          step="1000"
          value={valores.costoHora}
          onChange={cambiar('costoHora')}
          error={errores.costoHora}
        />
        <div className={errores.tipo ? 'campo campo-con-error' : 'campo'}>
          <label htmlFor="tipo-cancha">Tipo de cancha</label>
          <select id="tipo-cancha" name="tipo" value={valores.tipo} onChange={cambiar('tipo')} aria-invalid={errores.tipo ? 'true' : undefined}>
            <option value="">Sin especificar</option>
            {TIPOS_CANCHA.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>
          {errores.tipo && (
            <span className="campo-error" role="alert">
              {errores.tipo}
            </span>
          )}
        </div>
      </div>

      <div className={errores.descripcion ? 'campo campo-con-error' : 'campo'}>
        <label htmlFor="descripcion-cancha">Descripción</label>
        <textarea id="descripcion-cancha" name="descripcion" rows={3} value={valores.descripcion} onChange={cambiar('descripcion')} />
        {errores.descripcion && (
          <span className="campo-error" role="alert">
            {errores.descripcion}
          </span>
        )}
      </div>

      <Campo
        etiqueta="Servicios"
        name="servicios"
        type="text"
        value={valores.servicios}
        onChange={cambiar('servicios')}
        error={errores.servicios}
        ayuda="Separados por coma: Parqueadero, Iluminación LED, Vestieres"
      />

      <fieldset className="horarios-cancha">
        <legend>Horario de atención</legend>
        {DIAS_SEMANA.map(({ diaSemana, etiqueta }) => {
          const fila = horarios[diaSemana];

          return (
            <div key={diaSemana} className="horario-dia">
              <label className="horario-dia-abre">
                <input type="checkbox" checked={fila.abre} onChange={(e) => cambiarHorario(diaSemana, { abre: e.target.checked })} />
                <span>{etiqueta}</span>
              </label>
              <input type="time" aria-label={`Apertura del ${etiqueta.toLowerCase()}`} value={fila.inicio} disabled={!fila.abre} onChange={(e) => cambiarHorario(diaSemana, { inicio: e.target.value })} />
              <span aria-hidden="true">a</span>
              <input type="time" aria-label={`Cierre del ${etiqueta.toLowerCase()}`} value={fila.fin} disabled={!fila.abre} onChange={(e) => cambiarHorario(diaSemana, { fin: e.target.value })} />
            </div>
          );
        })}
        {mensajeHorarios && (
          <span className="campo-error" role="alert">
            {mensajeHorarios}
          </span>
        )}
      </fieldset>

      <div className="formulario-acciones">
        <button type="button" className="boton-fantasma" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
        <button type="submit" className="boton-acento" disabled={guardando}>
          {guardando ? 'Guardando...' : cancha ? 'Guardar cambios' : 'Crear cancha'}
        </button>
      </div>
    </form>
  );
}
