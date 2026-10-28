import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import useAuth from '../src/hooks/useAuth';
import ProtectedRoute from '../src/components/layout/ProtectedRoute';
import Navbar from '../src/components/layout/Navbar';
import Footer from '../src/components/layout/Footer';
import { renderConRuta } from './helpers';

const envolver = ({ children }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthProvider y useAuth', () => {
  it('useAuth falla si se usa fuera del proveedor', () => {
    const silencio = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow('useAuth debe usarse dentro de un AuthProvider');
    silencio.mockRestore();
  });

  it('arranca sin sesión cuando el almacenamiento está vacío', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });
    expect(result.current.estaAutenticado).toBe(false);
    expect(result.current.usuario).toBeNull();
  });

  it('recupera la sesión guardada en el navegador', () => {
    localStorage.setItem('canchaya_token', 'tok');
    localStorage.setItem('canchaya_usuario', JSON.stringify({ nombre: 'Ana' }));

    const { result } = renderHook(() => useAuth(), { wrapper: envolver });
    expect(result.current.estaAutenticado).toBe(true);
    expect(result.current.usuario).toEqual({ nombre: 'Ana' });
  });

  it('inicia y cierra sesión guardando y borrando los datos', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    act(() => result.current.login('nuevo-token', { nombre: 'Luis' }));
    expect(localStorage.getItem('canchaya_token')).toBe('nuevo-token');
    expect(result.current.estaAutenticado).toBe(true);
    expect(result.current.cerroSesion).toBe(false);

    act(() => result.current.logout());
    expect(localStorage.getItem('canchaya_token')).toBeNull();
    expect(result.current.estaAutenticado).toBe(false);
    expect(result.current.cerroSesion).toBe(true);
  });
});

describe('ProtectedRoute', () => {
  it('muestra el contenido a un usuario autenticado', () => {
    renderConRuta(<ProtectedRoute><p>contenido privado</p></ProtectedRoute>);
    expect(screen.getByText('contenido privado')).toBeInTheDocument();
  });

  it('manda al login recordando la ruta cuando no hay sesión', () => {
    renderConRuta(<ProtectedRoute><p>contenido privado</p></ProtectedRoute>, {
      ruta: '/mis-reservas?pagina=2',
      patron: '/mis-reservas',
      auth: { estaAutenticado: false },
    });
    expect(screen.queryByText('contenido privado')).not.toBeInTheDocument();
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/login?redirect=%2Fmis-reservas%3Fpagina%3D2');
  });

  it('no recuerda la ruta si el usuario cerró sesión a propósito', () => {
    renderConRuta(<ProtectedRoute><p>contenido privado</p></ProtectedRoute>, {
      ruta: '/mis-reservas',
      patron: '/mis-reservas',
      auth: { estaAutenticado: false, cerroSesion: true },
    });
    expect(screen.getByTestId('ubicacion')).toHaveTextContent(/^\/login$/);
  });
});

describe('Navbar', () => {
  it('muestra los accesos de un visitante', () => {
    renderConRuta(<Navbar />, { auth: { estaAutenticado: false, usuario: null } });
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toBeInTheDocument();
  });

  it('muestra el menú del usuario con sus iniciales y permite salir', async () => {
    const { auth } = renderConRuta(<Navbar />);

    expect(screen.getByRole('link', { name: 'Mis reservas' })).toBeInTheDocument();
    expect(screen.getByText('AP')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Salir/ }));
    expect(auth.logout).toHaveBeenCalled();
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/login');
  });

  it('tolera un usuario sin nombre', () => {
    renderConRuta(<Navbar />, { auth: { usuario: undefined } });
    expect(screen.getByRole('button', { name: /Salir/ })).toBeInTheDocument();
  });
});

describe('Footer', () => {
  it('muestra el año actual', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );
    expect(screen.getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument();
  });
});
