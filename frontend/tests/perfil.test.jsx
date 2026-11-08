// US-27 (perfil) y US-28 (tarjetas): pantalla "Mi perfil" y la verificación del nuevo correo.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  obtenerPerfil: vi.fn(),
  actualizarPerfil: vi.fn(),
  cambiarPassword: vi.fn(),
  solicitarCambioCorreo: vi.fn(),
  listarMetodosPago: vi.fn(),
  agregarMetodoPago: vi.fn(),
  eliminarMetodoPago: vi.fn(),
  verificarCorreo: vi.fn(),
}));
vi.mock('../src/api/perfilApi', () => ({
  obtenerPerfil: api.obtenerPerfil,
  actualizarPerfil: api.actualizarPerfil,
  cambiarPassword: api.cambiarPassword,
  solicitarCambioCorreo: api.solicitarCambioCorreo,
  listarMetodosPago: api.listarMetodosPago,
  agregarMetodoPago: api.agregarMetodoPago,
  eliminarMetodoPago: api.eliminarMetodoPago,
}));
vi.mock('../src/api/authApi', () => ({ verificarCorreo: api.verificarCorreo }));

import PerfilPage from '../src/pages/PerfilPage';
import VerificarCorreoPage from '../src/pages/VerificarCorreoPage';
import { errorHttp, renderConRuta } from './helpers';

const USUARIO = { id: 'u1', nombre: 'Ana Pérez', correo: 'ana@correo.com' };
const PERFIL = { id: 'u1', nombre: 'Ana Pérez', correo: 'ana@correo.com', telefono: '3001234567', correoPendiente: null };
const VISA = { id: 'm1', marca: 'Visa', ultimos4: '4242', titular: 'ANA PEREZ', vencimiento: '12/30' };

async function abrirPerfil(opciones = {}) {
  const resultado = renderConRuta(<PerfilPage />, { ruta: '/perfil', patron: '/perfil', auth: { usuario: USUARIO }, ...opciones });
  await screen.findByRole('heading', { name: 'Datos personales' });
  return resultado;
}

const seccion = (nombre) => screen.getByRole('region', { name: nombre });

describe('PerfilPage (US-27)', () => {
  beforeEach(() => {
    api.obtenerPerfil.mockResolvedValue({ data: { usuario: PERFIL } });
    api.listarMetodosPago.mockResolvedValue({ data: { metodosPago: [] } });
  });

  describe('carga', () => {
    it('muestra los datos actuales: nombre, teléfono y correo', async () => {
      await abrirPerfil();

      expect(api.obtenerPerfil).toHaveBeenCalledWith('u1');
      expect(screen.getByLabelText('Nombre completo')).toHaveValue('Ana Pérez');
      expect(screen.getByLabelText('Teléfono')).toHaveValue('3001234567');
      expect(screen.getByText('ana@correo.com')).toBeInTheDocument();
    });

    it('muestra un aviso mientras carga y el error si no se puede cargar', async () => {
      api.obtenerPerfil.mockRejectedValue(errorHttp(500, { mensaje: 'Error interno del servidor' }));
      renderConRuta(<PerfilPage />, { auth: { usuario: USUARIO } });

      expect(screen.getByText('Cargando tu perfil...')).toBeInTheDocument();
      expect(await screen.findByRole('alert')).toHaveTextContent('Error interno del servidor');
      expect(screen.queryByRole('heading', { name: 'Datos personales' })).not.toBeInTheDocument();
    });

    it('usa un mensaje genérico si el error no trae detalle', async () => {
      api.obtenerPerfil.mockRejectedValue(new Error('red'));
      renderConRuta(<PerfilPage />, { auth: { usuario: USUARIO } });

      expect(await screen.findByText('No fue posible cargar tu perfil')).toBeInTheDocument();
    });
  });

  describe('datos personales', () => {
    it('guarda el nombre y el teléfono, muestra la confirmación y actualiza el nombre de la sesión', async () => {
      api.actualizarPerfil.mockResolvedValue({ data: { mensaje: 'Perfil actualizado correctamente', usuario: { ...PERFIL, nombre: 'Ana María', telefono: '+573109998888' } } });
      const { auth } = await abrirPerfil();

      await userEvent.clear(screen.getByLabelText('Nombre completo'));
      await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana María');
      await userEvent.clear(screen.getByLabelText('Teléfono'));
      await userEvent.type(screen.getByLabelText('Teléfono'), '310 999 8888');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      expect(api.actualizarPerfil).toHaveBeenCalledWith('u1', { nombre: 'Ana María', telefono: '310 999 8888' });
      expect(await screen.findByText('Perfil actualizado correctamente')).toBeInTheDocument();
      expect(auth.actualizarUsuario).toHaveBeenCalledWith({ nombre: 'Ana María' });
      expect(screen.getByLabelText('Teléfono')).toHaveValue('+573109998888');
    });

    it('muestra el error de cada campo junto al campo y no confirma el guardado', async () => {
      api.actualizarPerfil.mockRejectedValue(
        errorHttp(400, {
          mensaje: 'Error de validación',
          errores: [
            { campo: 'nombre', mensaje: 'El nombre es obligatorio' },
            { campo: 'telefono', mensaje: 'El teléfono no es válido (de 7 a 15 dígitos, puede iniciar con +)' },
          ],
        })
      );
      await abrirPerfil();

      await userEvent.clear(screen.getByLabelText('Nombre completo'));
      await userEvent.clear(screen.getByLabelText('Teléfono'));
      await userEvent.type(screen.getByLabelText('Teléfono'), 'abc');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      expect(await within(seccion('Datos personales')).findByText('El nombre es obligatorio')).toBeInTheDocument();
      expect(within(seccion('Datos personales')).getByText(/El teléfono no es válido/)).toBeInTheDocument();
      expect(screen.getByLabelText('Nombre completo')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByText('Perfil actualizado correctamente')).not.toBeInTheDocument();
    });

    it('si el error no es de un campo muestra un mensaje general', async () => {
      api.actualizarPerfil.mockRejectedValue(errorHttp(500, { mensaje: 'Error interno del servidor' }));
      await abrirPerfil();

      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      expect(await within(seccion('Datos personales')).findByRole('alert')).toHaveTextContent('Error interno del servidor');
    });

    it('usa un mensaje por defecto cuando no hay respuesta del servidor', async () => {
      api.actualizarPerfil.mockRejectedValue(new Error('red'));
      await abrirPerfil();

      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      expect(await screen.findByText('No fue posible guardar tus datos')).toBeInTheDocument();
    });
  });

  describe('correo', () => {
    it('pide la verificación del correo nuevo y deja claro que el actual sigue vigente hasta confirmarlo', async () => {
      api.solicitarCambioCorreo.mockResolvedValue({ data: { mensaje: 'Enviamos un enlace de verificación a nueva@correo.com. Tu correo cambiará cuando lo confirmes.' } });
      await abrirPerfil();

      await userEvent.type(screen.getByLabelText('Correo nuevo'), 'Nueva@Correo.com');
      await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace de verificación' }));

      expect(api.solicitarCambioCorreo).toHaveBeenCalledWith('u1', { nuevoCorreo: 'Nueva@Correo.com' });
      expect(await screen.findByText(/Tu correo cambiará cuando lo confirmes/)).toBeInTheDocument();
      expect(screen.getByText(/Esperando verificación de/)).toHaveTextContent('nueva@correo.com');
      expect(screen.getByText('ana@correo.com')).toBeInTheDocument();
      expect(screen.getByLabelText('Correo nuevo')).toHaveValue('');
    });

    it('muestra el cambio pendiente que ya existía al abrir el perfil', async () => {
      api.obtenerPerfil.mockResolvedValue({ data: { usuario: { ...PERFIL, correoPendiente: 'pendiente@correo.com' } } });
      await abrirPerfil();

      expect(screen.getByRole('status')).toHaveTextContent('pendiente@correo.com');
    });

    it('avisa si el correo ya pertenece a otra cuenta', async () => {
      api.solicitarCambioCorreo.mockRejectedValue(errorHttp(409, { mensaje: 'El correo ya está registrado', codigo: 'CORREO_DUPLICADO' }));
      await abrirPerfil();

      await userEvent.type(screen.getByLabelText('Correo nuevo'), 'otra@correo.com');
      await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace de verificación' }));

      expect(await within(seccion('Correo electrónico')).findByRole('alert')).toHaveTextContent('El correo ya está registrado');
      expect(screen.queryByText(/Esperando verificación/)).not.toBeInTheDocument();
    });

    it('muestra el error del campo cuando el correo no es válido', async () => {
      api.solicitarCambioCorreo.mockRejectedValue(errorHttp(400, { mensaje: 'Error de validación', errores: [{ campo: 'nuevoCorreo', mensaje: 'El correo no es válido' }] }));
      await abrirPerfil();

      await userEvent.type(screen.getByLabelText('Correo nuevo'), 'malo');
      await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace de verificación' }));

      expect(await within(seccion('Correo electrónico')).findByText('El correo no es válido')).toBeInTheDocument();
    });

    it('usa un mensaje por defecto si la solicitud falla sin detalle', async () => {
      api.solicitarCambioCorreo.mockRejectedValue(new Error('red'));
      await abrirPerfil();

      await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace de verificación' }));

      expect(await screen.findByText('No fue posible solicitar el cambio de correo')).toBeInTheDocument();
    });
  });

  describe('contraseña', () => {
    async function llenar(actual, nueva, confirmar) {
      await userEvent.type(screen.getByLabelText('Contraseña actual'), actual);
      await userEvent.type(screen.getByLabelText('Contraseña nueva'), nueva);
      await userEvent.type(screen.getByLabelText('Confirmar contraseña nueva'), confirmar);
      await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    }

    it('cambia la contraseña con la actual y limpia el formulario', async () => {
      api.cambiarPassword.mockResolvedValue({ data: { mensaje: 'Contraseña actualizada correctamente' } });
      await abrirPerfil();

      await llenar('Password123!', 'NuevaClave456', 'NuevaClave456');

      expect(api.cambiarPassword).toHaveBeenCalledWith('u1', { passwordActual: 'Password123!', nuevaPassword: 'NuevaClave456' });
      expect(await screen.findByText('Contraseña actualizada correctamente')).toBeInTheDocument();
      expect(screen.getByLabelText('Contraseña actual')).toHaveValue('');
      expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('');
    });

    it('no envía si la confirmación no coincide', async () => {
      await abrirPerfil();

      await llenar('Password123!', 'NuevaClave456', 'Otra12345');

      expect(within(seccion('Contraseña')).getByText('Las contraseñas no coinciden')).toBeInTheDocument();
      expect(api.cambiarPassword).not.toHaveBeenCalled();
    });

    it('muestra junto al campo que la contraseña actual es incorrecta', async () => {
      api.cambiarPassword.mockRejectedValue(
        errorHttp(400, { mensaje: 'La contraseña actual no es correcta', codigo: 'PASSWORD_ACTUAL_INCORRECTA', errores: [{ campo: 'passwordActual', mensaje: 'La contraseña actual no es correcta' }] })
      );
      await abrirPerfil();

      await llenar('Mala12345', 'NuevaClave456', 'NuevaClave456');

      expect(await within(seccion('Contraseña')).findByText('La contraseña actual no es correcta')).toBeInTheDocument();
      expect(screen.getByLabelText('Contraseña actual')).toHaveAttribute('aria-invalid', 'true');
    });

    it('muestra el error cuando la nueva no cumple las reglas de seguridad', async () => {
      api.cambiarPassword.mockRejectedValue(
        errorHttp(400, { mensaje: 'Error de validación', errores: [{ campo: 'nuevaPassword', mensaje: 'La contraseña debe tener mínimo 8 caracteres, incluyendo una letra y un número' }] })
      );
      await abrirPerfil();

      await llenar('Password123!', 'corta', 'corta');

      expect(await within(seccion('Contraseña')).findByText(/mínimo 8 caracteres/)).toBeInTheDocument();
    });

    it('usa un mensaje por defecto si falla sin detalle', async () => {
      api.cambiarPassword.mockRejectedValue(new Error('red'));
      await abrirPerfil();

      await llenar('Password123!', 'NuevaClave456', 'NuevaClave456');

      expect(await screen.findByText('No fue posible cambiar la contraseña')).toBeInTheDocument();
    });
  });
});

describe('Métodos de pago en el perfil (US-28)', () => {
  const vencimiento = '1230';

  async function llenarTarjeta({ numero = '4242424242424242', titular = 'Ana Pérez', cvv = '123' } = {}) {
    await userEvent.type(screen.getByLabelText('Número de tarjeta'), numero);
    await userEvent.type(screen.getByLabelText('Nombre del titular'), titular);
    await userEvent.type(screen.getByLabelText('Vencimiento (MM/AA)'), vencimiento);
    await userEvent.type(screen.getByLabelText('CVV'), cvv);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar tarjeta' }));
  }

  beforeEach(() => {
    api.obtenerPerfil.mockResolvedValue({ data: { usuario: PERFIL } });
    api.listarMetodosPago.mockResolvedValue({ data: { metodosPago: [VISA] } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lista las tarjetas enmascaradas: marca, últimos 4 y vencimiento, sin número completo', async () => {
    await abrirPerfil();

    expect(await screen.findByText('Visa ···· 4242')).toBeInTheDocument();
    expect(screen.getByText(/ANA PEREZ · vence 12\/30/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{13,}/);
    expect(api.listarMetodosPago).toHaveBeenCalledWith('u1');
  });

  it('invita a guardar una tarjeta cuando no hay ninguna y avisa si no se pueden cargar', async () => {
    api.listarMetodosPago.mockResolvedValueOnce({ data: { metodosPago: [] } });
    const { unmount } = await abrirPerfil();
    expect(await screen.findByText('Aún no tienes tarjetas guardadas.')).toBeInTheDocument();
    unmount();

    api.listarMetodosPago.mockRejectedValueOnce(errorHttp(500, { mensaje: 'Fallo al cargar' }));
    await abrirPerfil();
    expect(await within(seccion('Métodos de pago')).findByRole('alert')).toHaveTextContent('Fallo al cargar');
  });

  it('da formato al número, envía solo lo necesario y limpia el formulario al guardar', async () => {
    api.agregarMetodoPago.mockResolvedValue({
      data: { mensaje: 'Tarjeta guardada correctamente', metodoPago: { id: 'm2', marca: 'Mastercard', ultimos4: '4444', titular: 'ANA PÉREZ', vencimiento: '12/30' } },
    });
    await abrirPerfil();
    await screen.findByText('Visa ···· 4242');

    await userEvent.type(screen.getByLabelText('Número de tarjeta'), '5555555555554444');
    expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('5555 5555 5555 4444');
    await userEvent.type(screen.getByLabelText('Nombre del titular'), 'Ana Pérez');
    await userEvent.type(screen.getByLabelText('Vencimiento (MM/AA)'), vencimiento);
    expect(screen.getByLabelText('Vencimiento (MM/AA)')).toHaveValue('12/30');
    await userEvent.type(screen.getByLabelText('CVV'), '12a3');
    expect(screen.getByLabelText('CVV')).toHaveValue('123');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar tarjeta' }));

    expect(api.agregarMetodoPago).toHaveBeenCalledWith('u1', { numero: '5555 5555 5555 4444', titular: 'Ana Pérez', vencimientoMes: '12', vencimientoAnio: '30', cvv: '123' });
    expect(await screen.findByText('Tarjeta guardada correctamente')).toBeInTheDocument();
    expect(screen.getByText('Mastercard ···· 4444')).toBeInTheDocument();
    // el número y el CVV desaparecen del formulario
    expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('');
    expect(screen.getByLabelText('CVV')).toHaveValue('');
    expect(document.body.textContent).not.toContain('5555 5555 5555 4444');
  });

  it('muestra el error de cada campo cuando la tarjeta es inválida, sin repetir los datos sensibles', async () => {
    api.agregarMetodoPago.mockRejectedValue(
      errorHttp(400, {
        mensaje: 'La tarjeta no es válida',
        codigo: 'TARJETA_INVALIDA',
        errores: [
          { campo: 'numero', mensaje: 'El número de tarjeta no es válido' },
          { campo: 'vencimientoAnio', mensaje: 'La tarjeta está vencida' },
          { campo: 'cvv', mensaje: 'El código de seguridad (CVV) no es válido' },
        ],
      })
    );
    await abrirPerfil();

    await llenarTarjeta({ numero: '4242424242424241', cvv: '12' });

    const tarjetas = within(seccion('Métodos de pago'));
    expect(await tarjetas.findByText('El número de tarjeta no es válido')).toBeInTheDocument();
    expect(tarjetas.getByText('La tarjeta está vencida')).toBeInTheDocument();
    expect(tarjetas.getByText('El código de seguridad (CVV) no es válido')).toBeInTheDocument();
    expect(screen.queryByText('Tarjeta guardada correctamente')).not.toBeInTheDocument();
  });

  it('muestra un mensaje general si el error no es de un campo', async () => {
    api.agregarMetodoPago.mockRejectedValue(errorHttp(409, { mensaje: 'Ya tienes 5 tarjetas guardadas. Elimina una para agregar otra.', codigo: 'LIMITE_TARJETAS' }));
    await abrirPerfil();

    await llenarTarjeta();

    expect(await screen.findByText(/Ya tienes 5 tarjetas guardadas/)).toBeInTheDocument();
  });

  it('usa un mensaje por defecto si guardar falla sin detalle', async () => {
    api.agregarMetodoPago.mockRejectedValue(new Error('red'));
    await abrirPerfil();

    await llenarTarjeta();

    expect(await screen.findByText('No fue posible guardar la tarjeta')).toBeInTheDocument();
  });

  it('pide confirmación antes de eliminar y la quita de la lista', async () => {
    api.eliminarMetodoPago.mockResolvedValue({ data: { mensaje: 'Método de pago eliminado' } });
    await abrirPerfil();
    await screen.findByText('Visa ···· 4242');

    await userEvent.click(screen.getByRole('button', { name: /Eliminar la tarjeta Visa terminada en 4242/ }));
    const dialogo = screen.getByRole('dialog', { name: '¿Eliminar esta tarjeta?' });
    expect(within(dialogo).getByText(/Las reservas que ya pagaste con ella no se ven afectadas/)).toBeInTheDocument();
    expect(api.eliminarMetodoPago).not.toHaveBeenCalled();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Sí, eliminar' }));

    expect(api.eliminarMetodoPago).toHaveBeenCalledWith('u1', 'm1');
    await waitFor(() => expect(screen.queryByText('Visa ···· 4242')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Ya no aparece como opción de pago/)).toBeInTheDocument();
  });

  it('permite volver atrás sin eliminar y muestra el error si falla al eliminar', async () => {
    api.eliminarMetodoPago.mockRejectedValue(errorHttp(502, { mensaje: 'No fue posible comunicarse con la pasarela de pago. Intenta de nuevo.' }));
    await abrirPerfil();
    await screen.findByText('Visa ···· 4242');

    await userEvent.click(screen.getByRole('button', { name: /Eliminar la tarjeta/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.eliminarMetodoPago).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Eliminar la tarjeta/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('No fue posible comunicarse con la pasarela de pago');
    // la tarjeta sigue en la lista (su botón de eliminar sigue ahí)
    expect(screen.getByRole('button', { name: /Eliminar la tarjeta Visa terminada en 4242/ })).toBeInTheDocument();
  });

  it('usa un mensaje por defecto si eliminar falla sin detalle', async () => {
    api.eliminarMetodoPago.mockRejectedValue(new Error('red'));
    await abrirPerfil();
    await screen.findByText('Visa ···· 4242');

    await userEvent.click(screen.getByRole('button', { name: /Eliminar la tarjeta/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));

    expect(await screen.findByText('No fue posible eliminar la tarjeta')).toBeInTheDocument();
  });

  it('en una conexión no segura (HTTP fuera de localhost) no deja agregar tarjetas', async () => {
    vi.stubGlobal('location', { protocol: 'http:', hostname: 'canchaya.ejemplo.com' });
    await abrirPerfil();

    expect(await screen.findByText(/solo puedes agregar una tarjeta desde una conexión segura/)).toBeInTheDocument();
    expect(screen.getByLabelText('Número de tarjeta')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar tarjeta' })).toBeDisabled();
  });
});

describe('VerificarCorreoPage (US-27)', () => {
  it('confirma el cambio con el token del enlace y lo envía una sola vez', async () => {
    api.verificarCorreo.mockResolvedValue({ data: { mensaje: 'Correo actualizado correctamente', correo: 'nueva@correo.com' } });
    const { auth } = renderConRuta(<VerificarCorreoPage />, { ruta: '/verificar-correo?token=abc123', patron: '/verificar-correo', auth: { usuario: USUARIO } });

    expect(screen.getByText('Verificando tu correo...')).toBeInTheDocument();
    expect(await screen.findByText('Correo actualizado correctamente')).toBeInTheDocument();
    expect(api.verificarCorreo).toHaveBeenCalledTimes(1);
    expect(api.verificarCorreo).toHaveBeenCalledWith({ token: 'abc123' });
    expect(auth.actualizarUsuario).toHaveBeenCalledWith({ correo: 'nueva@correo.com' });
    expect(screen.getByRole('link', { name: 'Ir a mi perfil' })).toHaveAttribute('href', '/perfil');
  });

  it('a un visitante sin sesión le ofrece iniciar sesión', async () => {
    api.verificarCorreo.mockResolvedValue({ data: { mensaje: 'Correo actualizado correctamente', correo: 'nueva@correo.com' } });
    const { auth } = renderConRuta(<VerificarCorreoPage />, { ruta: '/verificar-correo?token=abc123', patron: '/verificar-correo', auth: { estaAutenticado: false, usuario: null } });

    expect(await screen.findByText('Correo actualizado correctamente')).toBeInTheDocument();
    expect(auth.actualizarUsuario).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
  });

  it('muestra el error si el enlace es inválido, ya se usó o venció', async () => {
    api.verificarCorreo.mockRejectedValue(errorHttp(400, { mensaje: 'El enlace de verificación es inválido o ha expirado' }));
    renderConRuta(<VerificarCorreoPage />, { ruta: '/verificar-correo?token=malo', patron: '/verificar-correo' });

    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace de verificación es inválido o ha expirado');
  });

  it('usa un mensaje por defecto si falla sin detalle', async () => {
    api.verificarCorreo.mockRejectedValue(new Error('red'));
    renderConRuta(<VerificarCorreoPage />, { ruta: '/verificar-correo?token=abc', patron: '/verificar-correo' });

    expect(await screen.findByText('No fue posible verificar el correo')).toBeInTheDocument();
  });

  it('sin token explica que el enlace no es válido y no llama al servidor', () => {
    api.verificarCorreo.mockClear();
    renderConRuta(<VerificarCorreoPage />, { ruta: '/verificar-correo', patron: '/verificar-correo' });

    expect(screen.getByRole('alert')).toHaveTextContent('El enlace de verificación no es válido');
    expect(api.verificarCorreo).not.toHaveBeenCalled();
  });
});
