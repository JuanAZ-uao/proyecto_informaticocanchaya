import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  iniciarSesion: vi.fn(),
  registrarUsuario: vi.fn(),
  solicitarRecuperacion: vi.fn(),
  restablecerPassword: vi.fn(),
}));
vi.mock('../src/api/authApi', () => api);

import LoginPage from '../src/pages/LoginPage';
import RegisterPage from '../src/pages/RegisterPage';
import ForgotPasswordPage from '../src/pages/ForgotPasswordPage';
import ResetPasswordPage from '../src/pages/ResetPasswordPage';
import { errorHttp, renderConRuta } from './helpers';

const sesionDeLogin = { data: { token: 'tok', usuario: { nombre: 'Ana' } } };

async function iniciarSesionConDatos() {
  await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.com');
  await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave1234');
  await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
}

describe('LoginPage', () => {
  it('inicia sesión y lleva al listado de canchas', async () => {
    api.iniciarSesion.mockResolvedValue(sesionDeLogin);
    const { auth } = renderConRuta(<LoginPage />, { ruta: '/login', patron: '/login', auth: { estaAutenticado: false } });

    await iniciarSesionConDatos();

    expect(api.iniciarSesion).toHaveBeenCalledWith({ correo: 'ana@correo.com', password: 'Clave1234' });
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith('tok', { nombre: 'Ana' }));
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/canchas');
  });

  it('vuelve a la ruta pedida si el destino es interno', async () => {
    api.iniciarSesion.mockResolvedValue(sesionDeLogin);
    renderConRuta(<LoginPage />, { ruta: '/login?redirect=%2Fmis-reservas', patron: '/login' });

    await iniciarSesionConDatos();
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('/mis-reservas'));
  });

  it('ignora un destino externo en el parámetro redirect', async () => {
    api.iniciarSesion.mockResolvedValue(sesionDeLogin);
    renderConRuta(<LoginPage />, { ruta: '/login?redirect=https%3A%2F%2Fmalo.com', patron: '/login' });

    await iniciarSesionConDatos();
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent(/^\/canchas$/));
  });

  it('muestra el error del servidor y no inicia sesión', async () => {
    api.iniciarSesion.mockRejectedValue(errorHttp(401, { mensaje: 'Credenciales inválidas' }));
    const { auth } = renderConRuta(<LoginPage />, { ruta: '/login', patron: '/login' });

    await iniciarSesionConDatos();

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('avisa que la cuenta se creó cuando viene del registro', () => {
    renderConRuta(<LoginPage />, { ruta: '/login', patron: '/login', state: { registroExitoso: true } });
    expect(screen.getByText('Cuenta creada correctamente. Ahora inicia sesión.')).toBeInTheDocument();
  });

  it('deshabilita el botón mientras ingresa', async () => {
    api.iniciarSesion.mockReturnValue(new Promise(() => {}));
    renderConRuta(<LoginPage />, { ruta: '/login', patron: '/login' });

    await iniciarSesionConDatos();
    expect(await screen.findByRole('button', { name: 'Ingresando...' })).toBeDisabled();
  });
});

describe('RegisterPage', () => {
  async function llenarFormulario() {
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.com');
    await userEvent.type(screen.getByLabelText('Teléfono'), '3001234567');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave1234');
    await userEvent.click(screen.getByRole('button', { name: 'Registrarme' }));
  }

  it('registra al usuario y lo manda al login', async () => {
    api.registrarUsuario.mockResolvedValue({});
    renderConRuta(<RegisterPage />, { ruta: '/registro', patron: '/registro' });

    await llenarFormulario();

    expect(api.registrarUsuario).toHaveBeenCalledWith({
      nombre: 'Ana Pérez',
      correo: 'ana@correo.com',
      telefono: '3001234567',
      password: 'Clave1234',
    });
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('/login'));
  });

  it('muestra el error cuando el correo ya existe', async () => {
    api.registrarUsuario.mockRejectedValue(errorHttp(409, { mensaje: 'El correo ya está registrado' }));
    renderConRuta(<RegisterPage />, { ruta: '/registro', patron: '/registro' });

    await llenarFormulario();
    expect(await screen.findByRole('alert')).toHaveTextContent('El correo ya está registrado');
  });
});

describe('ForgotPasswordPage', () => {
  it('muestra el mensaje neutro de la solicitud', async () => {
    api.solicitarRecuperacion.mockResolvedValue({ data: { mensaje: 'Si el correo existe, te enviamos un enlace' } });
    renderConRuta(<ForgotPasswordPage />, { patron: '*' });

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.com');
    await userEvent.click(screen.getByRole('button', { name: /Enviar enlace/ }));

    expect(api.solicitarRecuperacion).toHaveBeenCalledWith({ correo: 'ana@correo.com' });
    expect(await screen.findByText('Si el correo existe, te enviamos un enlace')).toBeInTheDocument();
  });

  it('muestra el error si la solicitud falla', async () => {
    api.solicitarRecuperacion.mockRejectedValue(errorHttp(500, { mensaje: 'Error interno' }));
    renderConRuta(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.com');
    await userEvent.click(screen.getByRole('button', { name: /Enviar enlace/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno');
  });
});

describe('ResetPasswordPage', () => {
  const ruta = '/restablecer-password?token=abc123';

  async function escribir(nueva, confirmar) {
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), nueva);
    await userEvent.type(screen.getByLabelText('Confirmar contraseña'), confirmar);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));
  }

  it('pide un enlace nuevo cuando falta el token', () => {
    renderConRuta(<ResetPasswordPage />, { ruta: '/restablecer-password', patron: '/restablecer-password' });
    expect(screen.getByRole('alert')).toHaveTextContent('El enlace de recuperación no es válido');
    expect(screen.getByRole('link', { name: 'Solicitar nuevo enlace' })).toBeInTheDocument();
  });

  it('no envía si las contraseñas no coinciden', async () => {
    renderConRuta(<ResetPasswordPage />, { ruta, patron: '/restablecer-password' });

    await escribir('Nueva1234', 'Otra12345');

    expect(screen.getByRole('alert')).toHaveTextContent('Las contraseñas no coinciden');
    expect(api.restablecerPassword).not.toHaveBeenCalled();
  });

  it('restablece la contraseña y manda al login', async () => {
    api.restablecerPassword.mockResolvedValue({});
    renderConRuta(<ResetPasswordPage />, { ruta, patron: '/restablecer-password' });

    await escribir('Nueva1234', 'Nueva1234');

    expect(api.restablecerPassword).toHaveBeenCalledWith({ token: 'abc123', nuevaPassword: 'Nueva1234' });
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('/login'));
  });

  it('muestra el error si el token ya no sirve', async () => {
    api.restablecerPassword.mockRejectedValue(errorHttp(400, { mensaje: 'El enlace expiró' }));
    renderConRuta(<ResetPasswordPage />, { ruta, patron: '/restablecer-password' });

    await escribir('Nueva1234', 'Nueva1234');
    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace expiró');
  });
});
