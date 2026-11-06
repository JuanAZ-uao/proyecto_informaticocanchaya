import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  obtenerCanchas: vi.fn(),
  obtenerMisReservas: vi.fn(),
}));
vi.mock('../src/api/canchasApi', () => ({ obtenerCanchas: api.obtenerCanchas }));
vi.mock('../src/api/reservasApi', () => ({ obtenerMisReservas: api.obtenerMisReservas }));

import CanchasListPage from '../src/pages/CanchasListPage';
import MisReservasPage from '../src/pages/MisReservasPage';
import { errorHttp, renderConRuta } from './helpers';

const canchas = [
  { id: 'c1', nombre: 'Cancha El Bosque', direccion: 'Calle 1', costoHora: 60000, servicios: [] },
  { id: 'c2', nombre: 'Cancha Los Cerros', direccion: 'Calle 2', costoHora: 80000, servicios: [] },
];

describe('CanchasListPage', () => {
  it('lista las canchas y saluda al usuario por su nombre', async () => {
    api.obtenerCanchas.mockResolvedValue({ data: { canchas } });
    renderConRuta(<CanchasListPage />);

    expect(await screen.findByText('Cancha El Bosque')).toBeInTheDocument();
    expect(screen.getByText('Cancha Los Cerros')).toBeInTheDocument();
    expect(screen.getByText('2 canchas')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ana, ¿dónde juegas hoy?');
  });

  it('usa el singular con una sola cancha y no saluda sin usuario', async () => {
    api.obtenerCanchas.mockResolvedValue({ data: { canchas: [canchas[0]] } });
    renderConRuta(<CanchasListPage />, { auth: { usuario: null } });

    expect(await screen.findByText('1 cancha')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('¿Dónde juegas hoy?');
  });

  it('muestra el estado de carga mientras espera', () => {
    api.obtenerCanchas.mockReturnValue(new Promise(() => {}));
    renderConRuta(<CanchasListPage />);
    expect(screen.getByText('Cargando canchas...')).toBeInTheDocument();
  });

  it('muestra un mensaje cuando no hay canchas con esos filtros', async () => {
    api.obtenerCanchas.mockResolvedValue({ data: { canchas: [] } });
    renderConRuta(<CanchasListPage />);
    expect(await screen.findByText('No encontramos canchas con esos filtros')).toBeInTheDocument();
  });

  it('muestra el error si no se pudo cargar', async () => {
    api.obtenerCanchas.mockRejectedValue(errorHttp(500, { mensaje: 'Servidor caído' }));
    renderConRuta(<CanchasListPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor caído');
  });

  it('vuelve a consultar al aplicar un filtro', async () => {
    api.obtenerCanchas.mockResolvedValue({ data: { canchas } });
    renderConRuta(<CanchasListPage />);
    await screen.findByText('Cancha El Bosque');

    await userEvent.type(screen.getByLabelText(/Zona/), 'Sur');
    await userEvent.click(screen.getByRole('button', { name: /Buscar/ }));

    await waitFor(() => expect(api.obtenerCanchas).toHaveBeenLastCalledWith(expect.objectContaining({ zona: 'Sur' })));
  });
});

function reservaDe(numero, sobrescribir = {}) {
  return {
    id: `r${numero}`,
    codigo: `CY-0000000${numero}`,
    canchaNombre: `Cancha ${numero}`,
    canchaDireccion: `Calle ${numero}`,
    fecha: '2026-10-28',
    horaInicio: '07:00',
    horaFin: '08:00',
    estado: 'confirmada',
    ...sobrescribir,
  };
}

const paginacion = (sobrescribir = {}) => ({ pagina: 1, limite: 10, total: 2, totalPaginas: 1, ...sobrescribir });

describe('MisReservasPage', () => {
  it('US-16: muestra el motivo solo en la reserva cancelada administrativamente', async () => {
    api.obtenerMisReservas.mockResolvedValue({
      data: {
        reservas: [
          reservaDe(1, { estado: 'cancelada_administrativamente', motivoCancelacion: 'La cancha estará en mantenimiento' }),
          reservaDe(2, { estado: 'cancelada', motivoCancelacion: null }),
          reservaDe(3),
        ],
        paginacion: paginacion({ total: 3 }),
      },
    });
    renderConRuta(<MisReservasPage />);

    expect(await screen.findByText('Cancelada administrativamente', { selector: 'span.estado-reserva' })).toBeInTheDocument();
    expect(screen.getByText('La cancha estará en mantenimiento')).toBeInTheDocument();
    expect(screen.getAllByText(/Motivo de la cancelación/)).toHaveLength(1);
  });

  it('lista las reservas con cancha, fecha, hora, estado y código', async () => {
    api.obtenerMisReservas.mockResolvedValue({
      data: { reservas: [reservaDe(1), reservaDe(2, { estado: 'cancelada', canchaDireccion: null })], paginacion: paginacion() },
    });
    renderConRuta(<MisReservasPage />);

    expect(await screen.findByText('Cancha 1')).toBeInTheDocument();
    expect(screen.getByText('Confirmada', { selector: 'span.estado-reserva' })).toBeInTheDocument();
    expect(screen.getByText('Cancelada', { selector: 'span.estado-reserva' })).toBeInTheDocument();
    expect(screen.getByText('CY-00000001')).toBeInTheDocument();
    expect(screen.getAllByText(/07:00 – 08:00/)).toHaveLength(2);
    expect(screen.getByText('2 reservas')).toBeInTheDocument();
    expect(api.obtenerMisReservas).toHaveBeenCalledWith({ periodo: 'proximas', estado: '', pagina: 1, limite: 10 });
  });

  it('muestra "Aún no tienes reservas" con un botón para reservar', async () => {
    api.obtenerMisReservas.mockResolvedValue({ data: { reservas: [], paginacion: paginacion({ total: 0 }) } });
    renderConRuta(<MisReservasPage />);

    expect(await screen.findByText('Aún no tienes reservas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reservar una cancha' })).toHaveAttribute('href', '/canchas');
  });

  it('cambia a la pestaña de pasadas y explica el historial vacío', async () => {
    api.obtenerMisReservas.mockResolvedValue({ data: { reservas: [], paginacion: paginacion({ total: 0 }) } });
    renderConRuta(<MisReservasPage />);
    await screen.findByText('Aún no tienes reservas');

    await userEvent.click(screen.getByRole('tab', { name: 'Pasadas' }));

    await waitFor(() => expect(api.obtenerMisReservas).toHaveBeenLastCalledWith(expect.objectContaining({ periodo: 'pasadas', pagina: 1 })));
    expect(await screen.findByText(/Tu historial aparecerá aquí/)).toBeInTheDocument();
  });

  it('filtra por estado y permite quitar el filtro', async () => {
    api.obtenerMisReservas.mockResolvedValue({ data: { reservas: [], paginacion: paginacion({ total: 0 }) } });
    renderConRuta(<MisReservasPage />);
    await screen.findByText('Aún no tienes reservas');

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'cancelada');
    expect(await screen.findByText('No hay reservas con ese estado')).toBeInTheDocument();
    expect(api.obtenerMisReservas).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'cancelada' }));

    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro' }));
    await waitFor(() => expect(api.obtenerMisReservas).toHaveBeenLastCalledWith(expect.objectContaining({ estado: '' })));
  });

  it('al filtrar por "Completada" desde Próximas cambia a la pestaña Pasadas', async () => {
    api.obtenerMisReservas.mockResolvedValue({ data: { reservas: [], paginacion: paginacion({ total: 0 }) } });
    renderConRuta(<MisReservasPage />);
    await screen.findByText('Aún no tienes reservas');
    expect(screen.getByRole('tab', { name: 'Próximas' })).toHaveAttribute('aria-selected', 'true');

    api.obtenerMisReservas.mockResolvedValue({
      data: { reservas: [reservaDe(1, { estado: 'completada' })], paginacion: paginacion({ total: 1 }) },
    });
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'completada');

    await waitFor(() =>
      expect(api.obtenerMisReservas).toHaveBeenLastCalledWith({ periodo: 'pasadas', estado: 'completada', pagina: 1, limite: 10 })
    );
    expect(screen.getByRole('tab', { name: 'Pasadas' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Completada', { selector: 'span.estado-reserva' })).toBeInTheDocument();
    expect(screen.queryByText('No hay reservas con ese estado')).not.toBeInTheDocument();
  });

  it('al filtrar por "Confirmada" desde Pasadas vuelve a la pestaña Próximas', async () => {
    api.obtenerMisReservas.mockResolvedValue({ data: { reservas: [], paginacion: paginacion({ total: 0 }) } });
    renderConRuta(<MisReservasPage />);
    await screen.findByText('Aún no tienes reservas');
    await userEvent.click(screen.getByRole('tab', { name: 'Pasadas' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Pasadas' })).toHaveAttribute('aria-selected', 'true'));

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'confirmada');

    await waitFor(() =>
      expect(api.obtenerMisReservas).toHaveBeenLastCalledWith({ periodo: 'proximas', estado: 'confirmada', pagina: 1, limite: 10 })
    );
    expect(screen.getByRole('tab', { name: 'Próximas' })).toHaveAttribute('aria-selected', 'true');
  });

  it('al pasar a otra pestaña quita el filtro que ya no aplica, pero conserva "Cancelada"', async () => {
    api.obtenerMisReservas.mockResolvedValue({ data: { reservas: [], paginacion: paginacion({ total: 0 }) } });
    renderConRuta(<MisReservasPage />);
    await screen.findByText('Aún no tienes reservas');

    // "Completada" lleva a Pasadas; al volver a Próximas ese filtro se quita
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'completada');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Pasadas' })).toHaveAttribute('aria-selected', 'true'));
    await userEvent.click(screen.getByRole('tab', { name: 'Próximas' }));
    await waitFor(() =>
      expect(api.obtenerMisReservas).toHaveBeenLastCalledWith({ periodo: 'proximas', estado: '', pagina: 1, limite: 10 })
    );
    expect(screen.getByLabelText('Filtrar por estado')).toHaveValue('');

    // "Cancelada" existe en ambas pestañas: se conserva al cambiar
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'cancelada');
    await userEvent.click(screen.getByRole('tab', { name: 'Pasadas' }));
    await waitFor(() =>
      expect(api.obtenerMisReservas).toHaveBeenLastCalledWith({ periodo: 'pasadas', estado: 'cancelada', pagina: 1, limite: 10 })
    );
    expect(screen.getByLabelText('Filtrar por estado')).toHaveValue('cancelada');
  });

  it('pagina las listas largas', async () => {
    api.obtenerMisReservas.mockResolvedValue({
      data: { reservas: [reservaDe(1)], paginacion: paginacion({ total: 25, totalPaginas: 3 }) },
    });
    renderConRuta(<MisReservasPage />);

    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    api.obtenerMisReservas.mockResolvedValue({
      data: { reservas: [reservaDe(2)], paginacion: paginacion({ pagina: 2, total: 25, totalPaginas: 3 }) },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument();
    expect(api.obtenerMisReservas).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 }));

    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    await waitFor(() => expect(api.obtenerMisReservas).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 1 })));
  });

  it('muestra el error si no se pudo cargar el historial', async () => {
    api.obtenerMisReservas.mockRejectedValue(errorHttp(500, { mensaje: 'Fallo del servidor' }));
    renderConRuta(<MisReservasPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo del servidor');
  });

  it('muestra marcadores de carga mientras espera', () => {
    api.obtenerMisReservas.mockReturnValue(new Promise(() => {}));
    renderConRuta(<MisReservasPage />);
    expect(screen.getByText('Cargando tus reservas...')).toBeInTheDocument();
  });

  it('usa el singular con una sola reserva y muestra el estado completada', async () => {
    api.obtenerMisReservas.mockResolvedValue({
      data: { reservas: [reservaDe(1, { estado: 'completada' })], paginacion: paginacion({ total: 1 }) },
    });
    renderConRuta(<MisReservasPage />);

    expect(await screen.findByText('1 reserva')).toBeInTheDocument();
    expect(screen.getByText('Completada', { selector: 'span.estado-reserva' })).toBeInTheDocument();
  });
});
