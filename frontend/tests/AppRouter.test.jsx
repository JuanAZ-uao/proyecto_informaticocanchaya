import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/api/canchasApi', () => ({
  obtenerCanchas: vi.fn().mockResolvedValue({ data: { canchas: [] } }),
  obtenerCanchaPorId: vi.fn(),
  obtenerBloquesOcupados: vi.fn(),
  crearReserva: vi.fn(),
  entrarPanelReserva: vi.fn(),
}));
vi.mock('../src/api/reservasApi', () => ({
  obtenerMisReservas: vi.fn().mockResolvedValue({ data: { reservas: [], paginacion: { pagina: 1, totalPaginas: 1, total: 0 } } }),
}));
vi.mock('socket.io-client', () => ({ io: vi.fn(() => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() })) }));

import App from '../src/App';
import AppRouter from '../src/router/AppRouter';
import { AuthProvider } from '../src/context/AuthContext';

function renderEn(ruta, conSesion) {
  if (conSesion) {
    localStorage.setItem('canchaya_token', 'tok');
    localStorage.setItem('canchaya_usuario', JSON.stringify({ nombre: 'Ana Pérez', correo: 'ana@correo.com' }));
  }

  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('AppRouter', () => {
  it('manda a un visitante que pide una ruta privada al login', () => {
    renderEn('/mis-reservas', false);
    expect(screen.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeInTheDocument();
  });

  it.each([
    ['/registro', 'Crea tu cuenta'],
    ['/olvide-password', 'Recuperar contraseña'],
    ['/restablecer-password', 'Restablecer contraseña'],
  ])('muestra la página pública %s', (ruta, titulo) => {
    renderEn(ruta, false);
    expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument();
  });

  it('lleva la raíz y las rutas desconocidas al listado de canchas cuando hay sesión', async () => {
    renderEn('/', true);
    expect(await screen.findByText('Canchas disponibles')).toBeInTheDocument();
  });

  it('muestra el historial de reservas a un usuario autenticado', async () => {
    renderEn('/mis-reservas', true);
    expect(await screen.findByRole('heading', { name: 'Mis reservas' })).toBeInTheDocument();
  });

  it('redirige una ruta desconocida a las canchas', async () => {
    renderEn('/no-existe', true);
    expect(await screen.findByText('Canchas disponibles')).toBeInTheDocument();
  });
});

describe('App', () => {
  it('arranca con el router del navegador y muestra el login a un visitante', () => {
    window.history.pushState({}, '', '/login');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeInTheDocument();
  });
});
