/* global process */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En Vercel la dirección del backend debe venir de variables de entorno y ser HTTPS (sin contenido mixto):
// si falta o es insegura, el despliegue falla en lugar de publicar una app que llamaría a localhost.
function validarEntornoVercel() {
  if (!process.env.VERCEL) return;
  if (!process.env.VITE_API_URL) throw new Error('Falta la variable de entorno VITE_API_URL (por ejemplo https://api.ejemplo.com/api)');
  for (const nombre of ['VITE_API_URL', 'VITE_SOCKET_URL']) {
    const valor = process.env[nombre];
    if (valor && !valor.startsWith('https://')) throw new Error(`${nombre} debe empezar por https:// en producción (llegó "${valor}")`);
  }
}

export default defineConfig(({ command }) => {
  if (command === 'build') validarEntornoVercel();

  return {
    plugins: [react()],
    server: {
      port: 5173,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.js'],
      include: ['tests/**/*.test.{js,jsx}'],
      clearMocks: true,
      // Las pruebas de formularios simulan muchas pulsaciones; con la cobertura activada pueden pasar de los 5 s por defecto.
      testTimeout: 20000,
      coverage: {
        provider: 'v8',
        all: true,
        include: ['src/**/*.{js,jsx}'],
        exclude: ['src/main.jsx'],
        reporter: ['text-summary', 'lcov'],
        reportsDirectory: 'coverage',
      },
    },
  };
});
