import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Cada prueba parte de una pantalla y un almacenamiento limpios.
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
