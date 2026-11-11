import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  obtenerReservasAdmin: vi.fn(),
  cancelarReservaAdmin: vi.fn(),
  obtenerCanchas: vi.fn(),
}));
vi.mock('../src/api/adminApi', () => ({
  obtenerReservasAdmin: api.obtenerReservasAdmin,
  cancelarReservaAdmin: api.cancelarReservaAdmin,
}));
vi.mock('../src/api/canchasApi', () => ({ obtenerCanchas: api.obtenerCanchas }));

import AdminReservasPage from '../src/pages/AdminReservasPage';
import AdminRoute from '../src/components/layout/AdminRoute';
import { errorHttp, renderConRuta } from './helpers';

const reserva = {
  id: 'r1',
  codigo: 'CY-AAAA1111',
  canchaId: 'c1',
  canchaNombre: 'Cancha El Bosque',
  usuarioNombre: 'Luis Gómez',
  usuarioCorreo: 'luis@correo.com',
  fecha: '2099-12-31',
  horaInicio: '10:00',
  horaFin: '11:00',
  estado: 'confirmada',
};
const respuesta = (reservas) => ({ data: { reservas, paginacion: { pagina: 1, totalPaginas: 1, total: reservas.length } } });
const admin = { auth: { usuario: { nombre: 'Admin', correo: 'a@a.com', rol: 'administrador' }, esAdministrador: true } };

describe('AdminReservasPage (US-16)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.obtenerCanchas.mockResolvedValue({ data: { canchas: [{ id: 'c1', nombre: 'Cancha El Bosque' }] } });
    api.obtenerReservasAdmin.mockResolvedValue(respuesta([reserva]));
  });

  it('lista las reservas futuras con el usuario titular', async () => {
    renderConRuta(<AdminReservasPage />, admin);

    expect(await screen.findByText('Cancha El Bosque', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText(/Luis Gómez \(luis@correo.com\)/)).toBeInTheDocument();
    expect(screen.getByText('1 reserva')).toBeInTheDocument();
  });

  it('busca por cancha, fecha y usuario', async () => {
    renderConRuta(<AdminReservasPage />, admin);
    await screen.findByText(/Luis Gómez/);

    await userEvent.selectOptions(screen.getByLabelText('Cancha'), 'c1');
    await userEvent.type(screen.getByLabelText('Fecha'), '2099-12-31');
    await userEvent.type(screen.getByLabelText('Usuario'), 'Luis');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() =>
      expect(api.obtenerReservasAdmin).toHaveBeenLastCalledWith(
        expect.objectContaining({ canchaId: 'c1', fecha: '2099-12-31', usuario: 'Luis', pagina: 1 })
      )
    );
  });

  it('exige un motivo antes de cancelar y no llama a la API sin él', async () => {
    renderConRuta(<AdminReservasPage />, admin);
    await userEvent.click(await screen.findByRole('button', { name: /Cancelar reserva CY-AAAA1111/ }));

    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Motivo de la cancelación'), '   ');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar cancelación' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('El motivo de la cancelación es obligatorio');
    expect(api.cancelarReservaAdmin).not.toHaveBeenCalled();
  });

  it('cancela con el motivo, avisa del correo y recarga la lista', async () => {
    api.cancelarReservaAdmin.mockResolvedValue({ data: { reserva: { ...reserva, estado: 'cancelada_administrativamente' } } });
    renderConRuta(<AdminReservasPage />, admin);
    await userEvent.click(await screen.findByRole('button', { name: /Cancelar reserva CY-AAAA1111/ }));

    await userEvent.type(screen.getByLabelText('Motivo de la cancelación'), 'Mantenimiento de la cancha');
    api.obtenerReservasAdmin.mockResolvedValue(respuesta([{ ...reserva, estado: 'cancelada_administrativamente' }]));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));

    await waitFor(() => expect(api.cancelarReservaAdmin).toHaveBeenCalledWith('r1', 'Mantenimiento de la cancha'));
    expect(await screen.findByRole('status')).toHaveTextContent('CY-AAAA1111');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Cancelada administrativamente')).toBeInTheDocument();
    // Una reserva ya cancelada no se puede volver a cancelar.
    expect(screen.queryByRole('button', { name: /Cancelar reserva CY-/ })).not.toBeInTheDocument();
  });

  it('si faltan menos de 2 horas, muestra el motivo del bloqueo y deja el diálogo abierto', async () => {
    api.cancelarReservaAdmin.mockRejectedValue(
      errorHttp(409, { mensaje: 'No se puede cancelar: faltan menos de 2 horas para el inicio de la reserva (o ya comenzó)' })
    );
    renderConRuta(<AdminReservasPage />, admin);
    await userEvent.click(await screen.findByRole('button', { name: /Cancelar reserva CY-AAAA1111/ }));

    await userEvent.type(screen.getByLabelText('Motivo de la cancelación'), 'Imprevisto');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('faltan menos de 2 horas');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('el botón Volver cierra el diálogo sin cancelar', async () => {
    renderConRuta(<AdminReservasPage />, admin);
    await userEvent.click(await screen.findByRole('button', { name: /Cancelar reserva CY-AAAA1111/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.cancelarReservaAdmin).not.toHaveBeenCalled();
  });

  it('muestra un estado vacío con filtros y el error de carga', async () => {
    api.obtenerReservasAdmin.mockResolvedValueOnce(respuesta([]));
    renderConRuta(<AdminReservasPage />, admin);
    expect(await screen.findByText('No hay reservas futuras')).toBeInTheDocument();

    api.obtenerReservasAdmin.mockRejectedValueOnce(errorHttp(500, { mensaje: 'Servidor caído' }));
    await userEvent.type(screen.getByLabelText('Usuario'), 'zzz');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor caído');
  });
});

describe('AdminRoute (US-16)', () => {
  it('deja pasar a un administrador', () => {
    renderConRuta(<AdminRoute>contenido admin</AdminRoute>, admin);
    expect(screen.getByText('contenido admin')).toBeInTheDocument();
  });

  it('redirige a un usuario sin rol de administrador', () => {
    renderConRuta(<AdminRoute>contenido admin</AdminRoute>, { auth: { esAdministrador: false } });
    expect(screen.queryByText('contenido admin')).not.toBeInTheDocument();
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/canchas');
  });
});
