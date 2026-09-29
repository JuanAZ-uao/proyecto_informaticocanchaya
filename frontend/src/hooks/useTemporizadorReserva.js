import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/api\/?$/, '');

export default function useTemporizadorReserva(canchaId, token) {
  const [expiresAt, setExpiresAt] = useState(null);
  const [expirado, setExpirado] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!canchaId || !token) return undefined;

    setExpiresAt(null);
    setExpirado(false);

    const socket = io(SOCKET_URL, {
      auth: { token },
      query: { canchaId },
    });
    socketRef.current = socket;

    socket.on('temporizador:inicio', ({ expiresAt: nuevoExpiresAt, estado }) => {
      setExpiresAt(nuevoExpiresAt);
      setExpirado(estado === 'expirado');
    });

    socket.on('temporizador:sync', ({ expiresAt: nuevoExpiresAt }) => {
      setExpiresAt(nuevoExpiresAt);
    });

    socket.on('temporizador:expirado', () => {
      setExpirado(true);
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

  return { expiresAt, expirado, reiniciar };
}
