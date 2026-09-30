import { useEffect, useState } from 'react';
import Icono from '../common/Icono';

const DURACION_SESION_MS = 180000;
const UMBRAL_URGENCIA_MS = 30000;

function formatearMMSS(ms) {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000));
  const minutos = String(Math.floor(totalSegundos / 60)).padStart(2, '0');
  const segundos = String(totalSegundos % 60).padStart(2, '0');
  return `${minutos}:${segundos}`;
}

export default function TemporizadorReserva({ expiresAt, expirado, completado, onReiniciar }) {
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  if (expirado) {
    return (
      <div className="temporizador-reserva temporizador-expirado" role="alert">
        <Icono nombre="alerta" tamano={22} />
        <div className="temporizador-textos">
          <p className="temporizador-titulo">Tu tiempo expiró</p>
          <p className="temporizador-sub">Inicia una nueva sesión de 3 minutos para seguir reservando.</p>
        </div>
        <button type="button" className="boton-secundario boton-compacto" onClick={onReiniciar}>
          Reiniciar temporizador
        </button>
      </div>
    );
  }

  if (completado) {
    return (
      <div className="temporizador-reserva temporizador-completado">
        <Icono nombre="escudo" tamano={22} />
        <div className="temporizador-textos">
          <p className="temporizador-titulo">Selección asegurada</p>
          <p className="temporizador-sub">El temporizador se detuvo: confirma tu reserva sin afanes.</p>
        </div>
      </div>
    );
  }

  if (!expiresAt) {
    return (
      <div className="temporizador-reserva temporizador-cargando">
        <Icono nombre="reloj" tamano={18} /> Preparando tu sesión de reserva...
      </div>
    );
  }

  const restanteMs = Math.max(0, expiresAt - ahora);
  const porcentaje = Math.min(100, (restanteMs / DURACION_SESION_MS) * 100);
  const urgente = restanteMs <= UMBRAL_URGENCIA_MS;

  return (
    <div className={`temporizador-reserva ${urgente ? 'temporizador-urgente' : ''}`}>
      <div className="temporizador-fila">
        <Icono nombre="reloj" tamano={18} />
        <span>
          Tiempo para reservar: <strong>{formatearMMSS(restanteMs)}</strong>
        </span>
      </div>
      <div
        className="temporizador-barra"
        role="progressbar"
        aria-label="Tiempo restante de la sesión de reserva"
        aria-valuemin={0}
        aria-valuemax={DURACION_SESION_MS / 1000}
        aria-valuenow={Math.round(restanteMs / 1000)}
      >
        <span style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  );
}
