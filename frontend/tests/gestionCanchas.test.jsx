// US-15: gestión de canchas (crear, editar, desactivar con advertencia de reservas futuras y reactivar).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listarCanchasAdmin: vi.fn(),
  obtenerCanchaAdmin: vi.fn(),
  crearCanchaAdmin: vi.fn(),
  editarCanchaAdmin: vi.fn(),
  desactivarCanchaAdmin: vi.fn(),
  activarCanchaAdmin: vi.fn(),
}));
vi.mock('../src/api/adminApi', () => api);

import AdminCanchasPage from '../src/pages/AdminCanchasPage';
import AdminRoute from '../src/components/layout/AdminRoute';
import { DIAS_SEMANA, aListaHorarios, errorDeHorarios, estadoHorarios } from '../src/utils/horariosCancha';
import { errorHttp, renderConRuta } from './helpers';

const admin = { auth: { usuario: { nombre: 'Admin', correo: 'a@a.com', rol: 'administrador' }, esAdministrador: true } };

const activa = { id: 'c1', nombre: 'Cancha El Bosque', direccion: 'Av. Roosevelt # 30-10', zona: 'Sur', costoHora: 70000, tipo: 'Fútbol 5', disponible: true, reservasFuturas: 0 };
const conReservas = { ...activa, id: 'c2', nombre: 'Cancha Con Reservas', reservasFuturas: 2 };
const desactivada = { ...activa, id: 'c3', nombre: 'Cancha Cerrada', disponible: false };
const detalle = { ...activa, descripcion: 'Con luz', servicios: ['Parqueadero'], horarios: [{ diaSemana: 1, horaInicio: '06:00', horaFin: '22:00' }] };

describe('AdminCanchasPage (US-15)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.listarCanchasAdmin.mockResolvedValue({ data: { canchas: [activa, conReservas, desactivada] } });
    api.obtenerCanchaAdmin.mockResolvedValue({ data: { cancha: detalle } });
  });

  it('lista todas las canchas, también las desactivadas, con su estado y sus reservas futuras', async () => {
    renderConRuta(<AdminCanchasPage />, admin);

    const lista = await screen.findByRole('list', { name: 'Canchas' });
    const items = within(lista).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Activa')).toBeInTheDocument();
    expect(within(items[1]).getByText(/2 reservas futuras/)).toBeInTheDocument();
    expect(within(items[2]).getByText('Desactivada')).toBeInTheDocument();
    expect(within(items[2]).getByRole('button', { name: 'Activar' })).toBeInTheDocument();
  });

  it('crea una cancha con los datos del formulario y la deja en el catálogo', async () => {
    api.crearCanchaAdmin.mockResolvedValue({ data: { cancha: { ...activa, nombre: 'Cancha Nueva' } } });
    renderConRuta(<AdminCanchasPage />, admin);
    await screen.findByRole('list', { name: 'Canchas' });

    await userEvent.click(screen.getByRole('button', { name: 'Nueva cancha' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Cancha Nueva');
    await userEvent.type(screen.getByLabelText('Dirección'), 'Calle 1 # 2-3');
    await userEvent.type(screen.getByLabelText('Precio por hora (COP)'), '80000');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de cancha'), 'Fútbol 7');
    await userEvent.type(screen.getByLabelText('Servicios'), 'Parqueadero, Iluminación LED');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cancha' }));

    await waitFor(() => expect(api.crearCanchaAdmin).toHaveBeenCalledTimes(1));
    const [datos] = api.crearCanchaAdmin.mock.calls[0];
    expect(datos).toMatchObject({ nombre: 'Cancha Nueva', direccion: 'Calle 1 # 2-3', costoHora: 80000, tipo: 'Fútbol 7', servicios: ['Parqueadero', 'Iluminación LED'] });
    // una cancha nueva abre de lunes a viernes por defecto
    expect(datos.horarios.map((h) => h.diaSemana)).toEqual([1, 2, 3, 4, 5]);
    expect(await screen.findByText(/se creó y ya aparece en el catálogo/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Nueva cancha' })).not.toBeInTheDocument();
  });

  it('muestra los errores del servidor junto a cada campo y conserva el formulario abierto', async () => {
    api.crearCanchaAdmin.mockRejectedValue(
      errorHttp(400, { mensaje: 'Error de validación', errores: [{ campo: 'nombre', mensaje: 'El nombre es obligatorio' }, { campo: 'costoHora', mensaje: 'El precio por hora debe ser un número mayor que 0' }] })
    );
    renderConRuta(<AdminCanchasPage />, admin);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva cancha' }));

    await userEvent.click(screen.getByRole('button', { name: 'Crear cancha' }));

    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument();
    expect(screen.getByText('El precio por hora debe ser un número mayor que 0')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Nueva cancha' })).toBeInTheDocument();
  });

  it('valida antes de enviar que el cierre sea posterior a la apertura y que haya al menos un día', async () => {
    renderConRuta(<AdminCanchasPage />, admin);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva cancha' }));

    fireEvent.change(screen.getByLabelText('Apertura del lunes'), { target: { value: '20:00' } });
    fireEvent.change(screen.getByLabelText('Cierre del lunes'), { target: { value: '08:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Crear cancha' }));

    expect(await screen.findByText('Lunes: la hora de cierre debe ser posterior a la de apertura')).toBeInTheDocument();
    expect(api.crearCanchaAdmin).not.toHaveBeenCalled();

    for (const { etiqueta } of DIAS_SEMANA) {
      const casilla = screen.getByRole('checkbox', { name: etiqueta });
      if (casilla.checked) await userEvent.click(casilla);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Crear cancha' }));

    expect(await screen.findByText('Define al menos un día de atención')).toBeInTheDocument();
    expect(api.crearCanchaAdmin).not.toHaveBeenCalled();
  });

  it('edita una cancha cargando sus datos y avisa que las reservas confirmadas no se modifican', async () => {
    api.editarCanchaAdmin.mockResolvedValue({ data: { cancha: { ...activa, costoHora: 90000 } } });
    renderConRuta(<AdminCanchasPage />, admin);
    const lista = await screen.findByRole('list', { name: 'Canchas' });

    await userEvent.click(within(within(lista).getAllByRole('listitem')[0]).getByRole('button', { name: 'Editar' }));

    expect(await screen.findByLabelText('Nombre')).toHaveValue('Cancha El Bosque');
    expect(screen.getByLabelText('Precio por hora (COP)')).toHaveValue(70000);
    expect(screen.getByLabelText('Servicios')).toHaveValue('Parqueadero');
    expect(screen.getByLabelText('Apertura del lunes')).toHaveValue('06:00');
    expect(screen.getByRole('checkbox', { name: 'Martes' })).not.toBeChecked();

    await userEvent.clear(screen.getByLabelText('Precio por hora (COP)'));
    await userEvent.type(screen.getByLabelText('Precio por hora (COP)'), '90000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.editarCanchaAdmin).toHaveBeenCalledWith('c1', expect.objectContaining({ costoHora: 90000, horarios: [{ diaSemana: 1, horaInicio: '06:00', horaFin: '22:00' }] })));
    expect(await screen.findByText(/Las reservas ya confirmadas no se modificaron/)).toBeInTheDocument();
  });

  it('desactiva una cancha sin reservas futuras tras una confirmación simple', async () => {
    api.desactivarCanchaAdmin.mockResolvedValue({ data: { reservasAfectadas: 0 } });
    renderConRuta(<AdminCanchasPage />, admin);
    const lista = await screen.findByRole('list', { name: 'Canchas' });

    await userEvent.click(within(within(lista).getAllByRole('listitem')[0]).getByRole('button', { name: 'Desactivar' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('¿Desactivar esta cancha?')).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Sí, desactivar' }));

    await waitFor(() => expect(api.desactivarCanchaAdmin).toHaveBeenCalledWith('c1', false));
    expect(await screen.findByText(/ya no aparece en el catálogo ni admite reservas/)).toBeInTheDocument();
  });

  it('con reservas futuras advierte de las afectadas y exige una confirmación explícita', async () => {
    api.desactivarCanchaAdmin
      .mockRejectedValueOnce(
        errorHttp(409, {
          codigo: 'CONFIRMACION_REQUERIDA',
          reservasAfectadas: 2,
          reservas: [
            { id: 'r1', codigo: 'CY-AAAA1111', usuarioNombre: 'Ana', fecha: '2099-12-31', horaInicio: '10:00', horaFin: '11:00' },
            { id: 'r2', codigo: 'CY-BBBB2222', usuarioNombre: 'Luis', fecha: '2099-12-31', horaInicio: '12:00', horaFin: '13:00' },
          ],
        })
      )
      .mockResolvedValueOnce({ data: { reservasAfectadas: 2 } });
    renderConRuta(<AdminCanchasPage />, admin);
    const lista = await screen.findByRole('list', { name: 'Canchas' });

    await userEvent.click(within(within(lista).getAllByRole('listitem')[1]).getByRole('button', { name: 'Desactivar' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, desactivar' }));

    const advertencia = await screen.findByText('Esta cancha tiene reservas futuras');
    expect(advertencia).toBeInTheDocument();
    expect(screen.getByText('CY-AAAA1111')).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    expect(api.desactivarCanchaAdmin).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Sí, desactivar de todos modos' }));

    await waitFor(() => expect(api.desactivarCanchaAdmin).toHaveBeenLastCalledWith('c2', true));
    expect(await screen.findByText(/Sus 2 reserva\(s\) futuras se conservan/)).toBeInTheDocument();
  });

  it('"No, conservarla" cierra el diálogo sin desactivar nada', async () => {
    renderConRuta(<AdminCanchasPage />, admin);
    const lista = await screen.findByRole('list', { name: 'Canchas' });

    await userEvent.click(within(within(lista).getAllByRole('listitem')[0]).getByRole('button', { name: 'Desactivar' }));
    await userEvent.click(screen.getByRole('button', { name: 'No, conservarla' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.desactivarCanchaAdmin).not.toHaveBeenCalled();
  });

  it('reactiva una cancha desactivada', async () => {
    api.activarCanchaAdmin.mockResolvedValue({ data: {} });
    renderConRuta(<AdminCanchasPage />, admin);
    await userEvent.click(await screen.findByRole('button', { name: 'Activar' }));

    await waitFor(() => expect(api.activarCanchaAdmin).toHaveBeenCalledWith('c3'));
    expect(await screen.findByText(/se reactivó y vuelve a aparecer en el catálogo/)).toBeInTheDocument();
  });

  it('muestra el error cuando falla la carga, la edición, la activación o la desactivación', async () => {
    api.listarCanchasAdmin.mockRejectedValueOnce(errorHttp(500, { mensaje: 'Error interno' }));
    const { unmount } = renderConRuta(<AdminCanchasPage />, admin);
    expect(await screen.findByText('Error interno')).toBeInTheDocument();
    unmount();

    api.obtenerCanchaAdmin.mockRejectedValue(errorHttp(404, { mensaje: 'Cancha no encontrada' }));
    api.activarCanchaAdmin.mockRejectedValue(errorHttp(409, { mensaje: 'La cancha ya estaba activa' }));
    api.desactivarCanchaAdmin.mockRejectedValue(errorHttp(500, { mensaje: 'No se pudo desactivar' }));
    renderConRuta(<AdminCanchasPage />, admin);
    const lista = await screen.findByRole('list', { name: 'Canchas' });
    const items = within(lista).getAllByRole('listitem');

    await userEvent.click(within(items[0]).getByRole('button', { name: 'Editar' }));
    expect(await screen.findByText('Cancha no encontrada')).toBeInTheDocument();

    await userEvent.click(within(items[2]).getByRole('button', { name: 'Activar' }));
    expect(await screen.findByText('La cancha ya estaba activa')).toBeInTheDocument();

    await userEvent.click(within(items[0]).getByRole('button', { name: 'Desactivar' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, desactivar' }));
    expect(await within(screen.getByRole('dialog')).findByText('No se pudo desactivar')).toBeInTheDocument();
  });

  it('sin canchas muestra el estado vacío', async () => {
    api.listarCanchasAdmin.mockResolvedValue({ data: { canchas: [] } });
    renderConRuta(<AdminCanchasPage />, admin);

    expect(await screen.findByText(/Todavía no hay canchas/)).toBeInTheDocument();
  });

  it('un usuario sin rol de administrador no ve la gestión: vuelve a las canchas', () => {
    renderConRuta(
      <AdminRoute>
        <AdminCanchasPage />
      </AdminRoute>,
      { auth: { usuario: { nombre: 'Ana', correo: 'ana@a.com', rol: 'usuario' }, esAdministrador: false, estaAutenticado: true } }
    );

    expect(screen.queryByRole('heading', { name: 'Gestión de canchas' })).not.toBeInTheDocument();
    expect(api.listarCanchasAdmin).not.toHaveBeenCalled();
  });
});

describe('horariosCancha', () => {
  it('una cancha nueva abre de lunes a viernes y una existente conserva sus días', () => {
    expect(aListaHorarios(estadoHorarios(undefined)).map((h) => h.diaSemana)).toEqual([1, 2, 3, 4, 5]);
    expect(aListaHorarios(estadoHorarios([{ diaSemana: 0, horaInicio: '07:00:00', horaFin: '20:00:00' }]))).toEqual([{ diaSemana: 0, horaInicio: '07:00', horaFin: '20:00' }]);
  });

  it('detecta cierre anterior o igual a la apertura, horas vacías y falta de días', () => {
    const base = estadoHorarios(undefined);
    expect(errorDeHorarios(base)).toBeNull();
    expect(errorDeHorarios({ ...base, 1: { abre: true, inicio: '10:00', fin: '10:00' } })).toMatch(/Lunes: la hora de cierre/);
    expect(errorDeHorarios({ ...base, 2: { abre: true, inicio: '', fin: '10:00' } })).toMatch(/Martes: indica la hora/);
    expect(errorDeHorarios(estadoHorarios([]))).toBe('Define al menos un día de atención');
  });
});
