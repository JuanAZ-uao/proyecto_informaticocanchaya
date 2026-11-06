import { useEffect, useId, useRef } from 'react';
import Alerta from './Alerta';

// Diálogo modal de confirmación (por ejemplo, antes de cancelar una reserva). Se cierra con Escape, enfoca el botón
// de cancelar al abrirse (la acción segura) y deshabilita ambos botones mientras se ejecuta la acción.
export default function ConfirmarDialogo({
  titulo,
  children,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Volver',
  peligro = false,
  cargando = false,
  error = '',
  onConfirmar,
  onCancelar,
}) {
  const idTitulo = useId();
  const botonCancelar = useRef(null);
  // El padre suele pasar funciones nuevas en cada render: se guarda la última sin reinstalar los listeners.
  const alCancelar = useRef(onCancelar);
  alCancelar.current = onCancelar;

  useEffect(() => {
    botonCancelar.current?.focus();
  }, []);

  useEffect(() => {
    function alPresionar(evento) {
      if (evento.key === 'Escape' && !cargando) alCancelar.current();
    }

    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [cargando]);

  return (
    <div className="dialogo-fondo" role="presentation" onMouseDown={(evento) => evento.target === evento.currentTarget && !cargando && onCancelar()}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
        <h2 id={idTitulo} className="dialogo-titulo">
          {titulo}
        </h2>
        <div className="dialogo-cuerpo">{children}</div>
        <Alerta mensaje={error} />
        <div className="dialogo-acciones">
          <button ref={botonCancelar} type="button" className="boton-fantasma" onClick={onCancelar} disabled={cargando}>
            {textoCancelar}
          </button>
          <button type="button" className={peligro ? 'boton-peligro' : 'boton-acento'} onClick={onConfirmar} disabled={cargando}>
            {cargando ? 'Procesando...' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
