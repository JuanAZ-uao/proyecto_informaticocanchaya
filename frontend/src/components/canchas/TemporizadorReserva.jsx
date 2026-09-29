import { useEffect, useState } from 'react';

function formatearMMSS(ms) {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000));
  const minutos = String(Math.floor(totalSegundos / 60)).padStart(2, '0');
  const segundos = String(totalSegundos % 60).padStart(2, '0');
  return `${minutos}:${segundos}`;
}

export default function TemporizadorReserva({ expiresAt, expirado, onReiniciar }) {
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  if (expirado) {
    return (
      <div className="temporizador-reserva temporizador-expirado">
        <p>Tu tiempo expiró.</p>
        <button type="button" className="boton-secundario" onClick={onReiniciar}>
          Reiniciar temporizador
        </button>
      </div>
    );
  }

  if (!expiresAt) return null;

  return (
    <div className="temporizador-reserva">
      Tiempo para reservar: <strong>{formatearMMSS(expiresAt - ahora)}</strong>
    </div>
  );
}
