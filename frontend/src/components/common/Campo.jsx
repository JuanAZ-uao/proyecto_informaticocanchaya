import { useId } from 'react';

// Campo de formulario con su etiqueta y el mensaje de error del propio campo (el que devuelve el servidor
// para ese `campo`). Pasa el resto de propiedades al <input>.
export default function Campo({ etiqueta, error = '', ayuda = '', ...propiedadesInput }) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const describedBy = [error ? idError : null, ayuda ? idAyuda : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={error ? 'campo campo-con-error' : 'campo'}>
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} {...propiedadesInput} />
      {ayuda && (
        <span id={idAyuda} className="texto-ayuda">
          {ayuda}
        </span>
      )}
      {error && (
        <span id={idError} className="campo-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
