import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import useAuth from '../src/hooks/useAuth';
import ProtectedRoute from '../src/components/layout/ProtectedRoute';
import Navbar from '../src/components/layout/Navbar';
import Footer from '../src/components/layout/Footer';
import ConfirmarDialogo from '../src/components/common/ConfirmarDialogo';
import Campo from '../src/components/common/Campo';
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

describe('AuthProvider: rol y actualización del usuario (US-27, US-29)', () => {
  it('reconoce al administrador por el rol del usuario guardado', () => {
    localStorage.setItem('canchaya_token', 'tok');
    localStorage.setItem('canchaya_usuario', JSON.stringify({ nombre: 'Admin', rol: 'administrador' }));

    const { result } = renderHook(() => useAuth(), { wrapper: envolver });

    expect(result.current.esAdministrador).toBe(true);
  });

  it('un usuario común o sin rol no es administrador', () => {
    localStorage.setItem('canchaya_token', 'tok');
    localStorage.setItem('canchaya_usuario', JSON.stringify({ nombre: 'Ana', rol: 'usuario' }));
    expect(renderHook(() => useAuth(), { wrapper: envolver }).result.current.esAdministrador).toBe(false);

    localStorage.setItem('canchaya_usuario', JSON.stringify({ nombre: 'Ana' }));
    expect(renderHook(() => useAuth(), { wrapper: envolver }).result.current.esAdministrador).toBe(false);
  });

  it('actualizarUsuario mezcla los cambios y los guarda en el navegador', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: envolver });
    act(() => result.current.login('tok', { id: 'u1', nombre: 'Ana', correo: 'ana@correo.com', rol: 'usuario' }));

    act(() => result.current.actualizarUsuario({ nombre: 'Ana María' }));

    expect(result.current.usuario).toEqual({ id: 'u1', nombre: 'Ana María', correo: 'ana@correo.com', rol: 'usuario' });
    expect(JSON.parse(localStorage.getItem('canchaya_usuario')).nombre).toBe('Ana María');
  });
});

describe('ConfirmarDialogo', () => {
  it('enfoca la opción segura al abrirse y llama a confirmar y cancelar', async () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    render(
      <ConfirmarDialogo titulo="¿Seguro?" textoConfirmar="Sí" textoCancelar="No" onConfirmar={onConfirmar} onCancelar={onCancelar}>
        <p>Detalle</p>
      </ConfirmarDialogo>
    );

    expect(screen.getByRole('dialog', { name: '¿Seguro?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Sí' }));
    await userEvent.click(screen.getByRole('button', { name: 'No' }));

    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('muestra el error y usa el estilo de peligro cuando se pide', () => {
    render(
      <ConfirmarDialogo titulo="Eliminar" peligro error="Falló" onConfirmar={() => {}} onCancelar={() => {}}>
        <p>Detalle</p>
      </ConfirmarDialogo>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Falló');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveClass('boton-peligro');
  });
});

describe('Campo', () => {
  it('asocia la etiqueta, la ayuda y el error con el input', () => {
    render(<Campo etiqueta="Teléfono" ayuda="De 7 a 15 dígitos" error="El teléfono no es válido" defaultValue="abc" />);

    const input = screen.getByLabelText('Teléfono');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('El teléfono no es válido De 7 a 15 dígitos');
  });

  it('sin error ni ayuda no marca el campo como inválido', () => {
    render(<Campo etiqueta="Nombre" />);

    const input = screen.getByLabelText('Nombre');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});
