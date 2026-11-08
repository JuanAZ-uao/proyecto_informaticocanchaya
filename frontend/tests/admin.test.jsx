// US-29: panel de administración (verificación del código de reserva y auditoría) y su acceso restringido.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  verificarCodigoReserva: vi.fn(),
  marcarReservaUsada: vi.fn(),
  listarVerificaciones: vi.fn(),
}));
vi.mock('../src/api/adminApi', () => api);

import AdminPage from '../src/pages/AdminPage';
import AdminRoute from '../src/components/layout/AdminRoute';
import Navbar from '../src/components/layout/Navbar';
import { errorHttp, renderConRuta } from './helpers';

const RESERVA = {
  id: 'r1',
  codigo: 'CY-D1AD1C79',
  cancha: { nombre: 'Cancha El Bosque', direccion: 'Av. Roosevelt # 30-10, Cali' },
  fecha: '2099-10-22',
  horaInicio: '10:00',
  horaFin: '11:00',
  usuario: { nombre: 'Ana Pérez' },
  usadaAt: null,
};

const vigente = { estado: 'vigente', motivo: null, reserva: RESERVA };
const noVigente = (motivo) => ({ estado: 'no_vigente', motivo, reserva: RESERVA });

async function abrirPanel() {
  renderConRuta(<AdminPage />, { ruta: '/admin', patron: '/admin', auth: { esAdministrador: true, usuario: { id: 'a1', nombre: 'Admin', rol: 'administrador' } } });
  await screen.findByRole('heading', { name: 'Verificar código de reserva' });
}

async function verificar(codigo) {
  await userEvent.type(screen.getByLabelText('Código de reserva'), codigo);
  await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
}

describe('AdminPage (US-29)', () => {
  beforeEach(() => {
    api.listarVerificaciones.mockResolvedValue({ data: { verificaciones: [] } });
  });

  it('muestra la sección "Verificar código de reserva" con su campo y la auditoría', async () => {
    await abrirPanel();

    expect(screen.getByRole('heading', { level: 1, name: 'Panel de administración' })).toBeInTheDocument();
    expect(screen.getByLabelText('Código de reserva')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeDisabled();
    expect(await screen.findByText('Todavía no hay verificaciones registradas.')).toBeInTheDocument();
  });

  it('una reserva vigente muestra "Vigente" con cancha, fecha, horario y nombre del usuario', async () => {
    api.verificarCodigoReserva.mockResolvedValue({ data: vigente });
    await abrirPanel();

    await verificar('cy-d1ad1c79');

    expect(api.verificarCodigoReserva).toHaveBeenCalledWith('cy-d1ad1c79');
    const resultado = await screen.findByText('Vigente');
    expect(resultado).toBeInTheDocument();
    const tarjeta = resultado.closest('.resultado-codigo');
    expect(tarjeta).toHaveTextContent('CY-D1AD1C79');
    expect(tarjeta).toHaveTextContent('Cancha El Bosque');
    expect(tarjeta).toHaveTextContent('10:00 - 11:00');
    expect(tarjeta).toHaveTextContent('Ana Pérez');
    expect(tarjeta).toHaveTextContent('octubre');
    expect(within(tarjeta).getByRole('button', { name: 'Marcar como utilizada' })).toBeInTheDocument();
  });

  it.each([
    ['vencida', 'La reserva venció'],
    ['cancelada', 'La reserva fue cancelada'],
    ['usada', 'La reserva ya fue utilizada'],
  ])('una reserva %s muestra "No vigente" con el motivo y sin la opción de marcarla', async (motivo, explicacion) => {
    api.verificarCodigoReserva.mockResolvedValue({ data: noVigente(motivo) });
    await abrirPanel();

    await verificar('CY-D1AD1C79');

    const estado = await screen.findByText('No vigente');
    expect(estado.closest('.resultado-codigo')).toHaveTextContent(`Motivo: ${motivo} · ${explicacion}`);
    expect(screen.queryByRole('button', { name: 'Marcar como utilizada' })).not.toBeInTheDocument();
  });

  it('un código inexistente o mal escrito muestra "Código no encontrado" sin datos de ninguna reserva', async () => {
    api.verificarCodigoReserva.mockRejectedValue(errorHttp(404, { mensaje: 'Código no encontrado', codigo: 'CODIGO_NO_ENCONTRADO' }));
    await abrirPanel();

    await verificar('ZZZ');

    expect(await screen.findByText('Código no encontrado')).toBeInTheDocument();
    expect(screen.queryByText('Vigente')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancha El Bosque')).not.toBeInTheDocument();
  });

  it('muestra un error general si la verificación falla por otra causa', async () => {
    api.verificarCodigoReserva.mockRejectedValue(errorHttp(500, { mensaje: 'Error interno del servidor' }));
    await abrirPanel();

    await verificar('CY-D1AD1C79');

    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno del servidor');
  });

  it('usa un mensaje por defecto si la verificación falla sin detalle', async () => {
    api.verificarCodigoReserva.mockRejectedValue(new Error('red'));
    await abrirPanel();

    await verificar('CY-D1AD1C79');

    expect(await screen.findByText('No fue posible verificar el código')).toBeInTheDocument();
  });

  it('al marcarla como utilizada, el código deja de ser vigente y se actualiza la auditoría', async () => {
    api.verificarCodigoReserva.mockResolvedValue({ data: vigente });
    api.marcarReservaUsada.mockResolvedValue({ data: { ...noVigente('usada'), reserva: { ...RESERVA, usadaAt: '2099-10-22T15:00:00.000Z' } } });
    await abrirPanel();
    await verificar('CY-D1AD1C79');
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar como utilizada' }));

    expect(api.marcarReservaUsada).toHaveBeenCalledWith('CY-D1AD1C79');
    expect(await screen.findByText('No vigente')).toBeInTheDocument();
    expect(screen.getByText(/Motivo: usada/)).toBeInTheDocument();
    expect(screen.getByText(/ya no puede validarse como vigente/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar como utilizada' })).not.toBeInTheDocument();
    // la auditoría se recargó tras la verificación y tras marcarla
    await waitFor(() => expect(api.listarVerificaciones.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it('si no se puede marcar (otro administrador la marcó antes) muestra el error', async () => {
    api.verificarCodigoReserva.mockResolvedValue({ data: vigente });
    api.marcarReservaUsada.mockRejectedValue(errorHttp(409, { mensaje: 'La reserva ya no está vigente (usada); no se puede marcar como utilizada' }));
    await abrirPanel();
    await verificar('CY-D1AD1C79');

    await userEvent.click(await screen.findByRole('button', { name: 'Marcar como utilizada' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La reserva ya no está vigente');
    expect(screen.getByText('Vigente')).toBeInTheDocument();
  });

  it('usa un mensaje por defecto si marcarla falla sin detalle', async () => {
    api.verificarCodigoReserva.mockResolvedValue({ data: vigente });
    api.marcarReservaUsada.mockRejectedValue(new Error('red'));
    await abrirPanel();
    await verificar('CY-D1AD1C79');

    await userEvent.click(await screen.findByRole('button', { name: 'Marcar como utilizada' }));

    expect(await screen.findByText('No fue posible marcar la reserva como utilizada')).toBeInTheDocument();
  });

  it('lista las últimas verificaciones: fecha, administrador, código y resultado', async () => {
    api.listarVerificaciones.mockResolvedValue({
      data: {
        verificaciones: [
          { id: 'v1', administrador: 'Admin CanchaYa', codigo: 'CY-D1AD1C79', resultado: 'marcada_usada', reservaCodigo: 'CY-D1AD1C79', createdAt: '2026-10-22T15:30:00.000Z' },
          { id: 'v2', administrador: null, codigo: 'CY-FFFFFFFF', resultado: 'no_encontrado', reservaCodigo: null, createdAt: '2026-10-22T15:20:00.000Z' },
          { id: 'v3', administrador: 'Admin CanchaYa', codigo: 'CY-AAAA1111', resultado: 'vencida', reservaCodigo: 'CY-AAAA1111', createdAt: '2026-10-22T15:10:00.000Z' },
          { id: 'v4', administrador: 'Admin CanchaYa', codigo: 'CY-BBBB2222', resultado: 'otro_nuevo', reservaCodigo: null, createdAt: '2026-10-22T15:00:00.000Z' },
        ],
      },
    });
    await abrirPanel();

    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('Marcada como utilizada')).toBeInTheDocument();
    expect(within(tabla).getByText('Código no encontrado')).toBeInTheDocument();
    expect(within(tabla).getByText('No vigente · vencida')).toBeInTheDocument();
    expect(within(tabla).getByText('otro_nuevo')).toBeInTheDocument();
    expect(within(tabla).getAllByText('Admin CanchaYa')).toHaveLength(3);
    expect(within(tabla).getByText('—')).toBeInTheDocument();
    expect(within(tabla).getByText('CY-FFFFFFFF')).toBeInTheDocument();
    expect(within(tabla).getAllByRole('row')).toHaveLength(5);
  });

  it('muestra el error si no se puede cargar la auditoría', async () => {
    api.listarVerificaciones.mockRejectedValue(errorHttp(500, { mensaje: 'Error interno del servidor' }));
    await abrirPanel();

    expect(await screen.findByText('Error interno del servidor')).toBeInTheDocument();
  });

  it('usa un mensaje por defecto si la auditoría falla sin detalle', async () => {
    api.listarVerificaciones.mockRejectedValue(new Error('red'));
    await abrirPanel();

    expect(await screen.findByText('No fue posible cargar las verificaciones')).toBeInTheDocument();
  });
});

describe('acceso restringido al panel (US-29)', () => {
  const rutas = (auth) =>
    renderConRuta(
      <AdminRoute>
        <p>contenido del panel</p>
      </AdminRoute>,
      { ruta: '/admin', patron: '/admin', auth }
    );

  it('un administrador entra al panel', () => {
    rutas({ esAdministrador: true });

    expect(screen.getByText('contenido del panel')).toBeInTheDocument();
  });

  it('un usuario sin rol de administrador no ve el panel y vuelve a las canchas', () => {
    rutas({ esAdministrador: false });

    expect(screen.queryByText('contenido del panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/canchas');
  });

  it('un visitante sin sesión va al login', () => {
    rutas({ estaAutenticado: false, esAdministrador: false });

    expect(screen.queryByText('contenido del panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/login?redirect=%2Fadmin');
  });

  it('el menú muestra "Administración" solo a los administradores', () => {
    const { unmount } = renderConRuta(<Navbar />, { auth: { esAdministrador: true } });
    expect(screen.getByRole('link', { name: 'Administración' })).toHaveAttribute('href', '/admin');
    unmount();

    renderConRuta(<Navbar />, { auth: { esAdministrador: false } });
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument();
  });

  it('el nombre del usuario en el menú lleva a "Mi perfil"', () => {
    renderConRuta(<Navbar />);

    expect(screen.getByRole('link', { name: /^Mi perfil/ })).toHaveAttribute('href', '/perfil');
  });
});
