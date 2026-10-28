import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthContext } from '../src/context/AuthContext';

function UbicacionActual() {
  const { pathname, search } = useLocation();
  return <p data-testid="ubicacion">{`${pathname}${search}`}</p>;
}

export function crearAuth(sobrescribir = {}) {
  return {
    token: 'token-de-prueba',
    usuario: { nombre: 'Ana Pérez', correo: 'ana@correo.com' },
    estaAutenticado: true,
    cerroSesion: false,
    login: vi.fn(),
    logout: vi.fn(),
    ...sobrescribir,
  };
}

// Renderiza `ui` dentro de un router en memoria, con un contexto de autenticación simulado.
// `patron` es la ruta con parámetros (por ejemplo "/canchas/:id") y `ruta` la URL inicial.
export function renderConRuta(ui, { ruta = '/', patron = '*', auth = {}, state } = {}) {
  const valor = crearAuth(auth);
  const entrada = state ? { pathname: ruta.split('?')[0], search: ruta.includes('?') ? `?${ruta.split('?')[1]}` : '', state } : ruta;

  const resultado = render(
    <AuthContext.Provider value={valor}>
      <MemoryRouter initialEntries={[entrada]}>
        <Routes>
          <Route path={patron} element={ui} />
          <Route path="*" element={<p>otra ruta</p>} />
        </Routes>
        <UbicacionActual />
      </MemoryRouter>
    </AuthContext.Provider>
  );

  return { ...resultado, auth: valor };
}

export function errorHttp(status, data) {
  return { response: { status, data } };
}
