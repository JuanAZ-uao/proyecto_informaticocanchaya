import { afterEach, describe, expect, it, vi } from 'vitest';

// US-24: las direcciones del backend salen de variables de entorno; el respaldo a localhost solo existe en desarrollo.
async function cargarConfig() {
  vi.resetModules();
  return import('../src/config');
}

describe('config de direcciones del backend', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('toma la API de VITE_API_URL y deriva la del socket quitando /api', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.canchaya.app/api');
    vi.stubEnv('VITE_SOCKET_URL', '');

    const { API_URL, SOCKET_URL } = await cargarConfig();

    expect(API_URL).toBe('https://api.canchaya.app/api');
    expect(SOCKET_URL).toBe('https://api.canchaya.app');
  });

  it('VITE_SOCKET_URL tiene prioridad para el socket', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.canchaya.app/api');
    vi.stubEnv('VITE_SOCKET_URL', 'https://sockets.canchaya.app');

    const { SOCKET_URL } = await cargarConfig();

    expect(SOCKET_URL).toBe('https://sockets.canchaya.app');
  });

  it('en desarrollo, sin variables, usa localhost como respaldo', async () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.stubEnv('VITE_SOCKET_URL', '');
    vi.stubEnv('DEV', true);

    const { API_URL, SOCKET_URL } = await cargarConfig();

    expect(API_URL).toBe('http://localhost:4000/api');
    expect(SOCKET_URL).toBe('http://localhost:4000');
  });

  it('en producción, sin variables, no inventa una dirección de desarrollo', async () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.stubEnv('VITE_SOCKET_URL', '');
    vi.stubEnv('DEV', false);

    const { API_URL, SOCKET_URL } = await cargarConfig();

    expect(API_URL).toBe('');
    expect(SOCKET_URL).toBe('');
  });
});
