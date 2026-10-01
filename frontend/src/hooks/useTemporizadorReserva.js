import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/api\/?$/, '');
const ESPERA_RESPUESTA_MS = 8000;
const EVENTOS_DISPONIBILIDAD = {
  'disponibilidad:retenida': 'retenida',
  'disponibilidad:liberada': 'liberada',
  'disponibilidad:reservada': 'reservada',
};

// Socket de la sesión de reserva (US-17) y de la retención de franjas en tiempo real (US-18).
// Eventos documentados en docs/api/eventos-socket.md
export default function useTemporizadorReserva(canchaId, token, { onSesionIniciada, onCambioDisponibilidad } = {}) {
  const [expiresAt, setExpiresAt] = useState(null);
  const [expirado, setExpirado] = useState(false);
  const socketRef = useRef(null);
  const manejadoresRef = useRef({});
  manejadoresRef.current = { onSesionIniciada, onCambioDisponibilidad };

  useEffect(() => {
    if (!canchaId || !token) return undefined;

    setExpiresAt(null);
    setExpirado(false);

    const socket = io(SOCKET_URL, {
      auth: { token },
      query: { canchaId },
    });
    socketRef.current = socket;

    // También llega al reconectar (p. ej. tras un reinicio del servidor), con el mismo expiresAt.
    socket.on('temporizador:inicio', ({ expiresAt: nuevoExpiresAt, estado }) => {
      setExpiresAt(nuevoExpiresAt);
      setExpirado(estado === 'expirado');
      manejadoresRef.current.onSesionIniciada?.();
    });

    socket.on('temporizador:sync', ({ expiresAt: nuevoExpiresAt }) => {
      setExpiresAt(nuevoExpiresAt);
    });

    socket.on('temporizador:expirado', () => {
      setExpirado(true);
    });

    Object.entries(EVENTOS_DISPONIBILIDAD).forEach(([evento, tipo]) => {
      socket.on(evento, (franja) => manejadoresRef.current.onCambioDisponibilidad?.(tipo, franja));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [canchaId, token]);

  function reiniciar() {
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit('temporizador:reiniciar', null, ({ expiresAt: nuevoExpiresAt } = {}) => {
      if (!nuevoExpiresAt) return;
      setExpiresAt(nuevoExpiresAt);
      setExpirado(false);
    });
  }

  // Resuelve { ok: true, retencion } o { ok: false, error: { codigo, mensaje } }.
  function retenerFranja(franja) {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        resolve({ ok: false, error: { codigo: 'SIN_CONEXION', mensaje: 'Sin conexión con el servidor. Intenta de nuevo.' } });
        return;
      }

      socket.timeout(ESPERA_RESPUESTA_MS).emit('retencion:solicitar', franja, (error, respuesta) => {
        resolve(
          error
            ? { ok: false, error: { codigo: 'TIMEOUT', mensaje: 'El servidor no respondió. Intenta de nuevo.' } }
            : respuesta
        );
      });
    });
  }

  function liberarFranja() {
    socketRef.current?.emit('retencion:liberar', null, () => {});
  }

  return { expiresAt, expirado, reiniciar, retenerFranja, liberarFranja };
}
