import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  obtenerCanchaPorId: vi.fn(),
  obtenerBloquesOcupados: vi.fn(),
  crearReserva: vi.fn(),
  entrarPanelReserva: vi.fn(),
  temporizador: null,
  opciones: null,
}));
vi.mock('../src/api/canchasApi', () => ({
  obtenerCanchaPorId: mocks.obtenerCanchaPorId,
  obtenerBloquesOcupados: mocks.obtenerBloquesOcupados,
  crearReserva: mocks.crearReserva,
  entrarPanelReserva: mocks.entrarPanelReserva,
}));
vi.mock('../src/hooks/useTemporizadorReserva', () => ({
  default: (_canchaId, _token, opciones) => {
    mocks.opciones = opciones;
    return mocks.temporizador;
  },
}));

import CanchaDetallePage from '../src/pages/CanchaDetallePage';
import { errorHttp, renderConRuta } from './helpers';

const FECHA = '2099-03-02';
const CLAVE_FLUJO = 'canchaya_flujo_reserva_c1';

const cancha = {
  id: 'c1',
  nombre: 'Cancha El Bosque',
  direccion: 'Calle 1 # 2-3',
  zona: 'Sur',
  tipo: 'Fútbol 5',
  costoHora: 60000,
  imagenUrl: '/img/bosque.jpg',
  imagenCredito: 'Foto: Ana',
  descripcion: 'Una cancha muy bonita',
  servicios: ['Parqueadero', 'Iluminación'],
  horarios: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, horaInicio: '06:00:00', horaFin: '09:00:00' })),
};

const reservaConfirmada = {
  id: 'r1',
  codigo: 'CY-ABCD1234',
  fecha: FECHA,
  horaInicio: '06:00:00',
  horaFin: '07:00:00',
  estado: 'confirmada',
  cancha: { nombre: 'Cancha El Bosque' },
};

const libres = { data: { ocupados: [], retenidos: [] } };

function renderizar() {
  return renderConRuta(<CanchaDetallePage />, { ruta: '/canchas/c1', patron: '/canchas/:id' });
}

// Abre la página, elige una fecha futura (así los bloques no dependen de la hora actual) y espera los bloques.
async function abrirPagina() {
  const resultado = renderizar();
  await screen.findByRole('heading', { level: 1, name: 'Cancha El Bosque' });
  fireEvent.change(screen.getByLabelText(/Fecha/), { target: { value: FECHA } });
  await screen.findByRole('button', { name: /06:00 - 07:00/ });
  return resultado;
}

const bloque = (inicio, fin) => screen.getByRole('button', { name: new RegExp(`${inicio} - ${fin}`) });

async function elegirBloque(inicio = '06:00', fin = '07:00') {
  await userEvent.click(bloque(inicio, fin));
  await screen.findByText(new RegExp(`Apartamos las ${inicio}`));
}

async function entrarAlResumen() {
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar reserva' }));
  await screen.findByText('Resumen de tu selección');
}

describe('CanchaDetallePage', () => {
  beforeEach(() => {
    mocks.obtenerCanchaPorId.mockResolvedValue({ data: { cancha } });
    mocks.obtenerBloquesOcupados.mockResolvedValue(libres);
    mocks.entrarPanelReserva.mockResolvedValue({ data: { estado: 'completado' } });
    mocks.crearReserva.mockResolvedValue({ data: { reserva: reservaConfirmada } });
    mocks.temporizador = {
      expiresAt: Date.now() + 180000,
      expirado: false,
      desfaseMs: 0,
      reiniciar: vi.fn(),
      retenerFranja: vi.fn().mockResolvedValue({ ok: true }),
      liberarFranja: vi.fn(),
    };
  });

  describe('carga de la cancha', () => {
    it('muestra el detalle, los servicios y el horario semanal', async () => {
      renderizar();

      expect(screen.getByText('Cargando cancha...')).toBeInTheDocument();
      expect(await screen.findByRole('heading', { level: 1, name: 'Cancha El Bosque' })).toBeInTheDocument();
      expect(screen.getByText('Una cancha muy bonita')).toBeInTheDocument();
      expect(screen.getByText('Parqueadero')).toBeInTheDocument();
      expect(screen.getByText('Horario semanal')).toBeInTheDocument();
      expect(screen.getByAltText('Foto de Cancha El Bosque')).toBeInTheDocument();
      expect(screen.getByText('Foto: Ana')).toBeInTheDocument();
      expect(screen.getByText('Hoy')).toBeInTheDocument();
    });

    it('usa valores por defecto cuando la cancha no tiene descripción, servicios, imagen ni horarios', async () => {
      mocks.obtenerCanchaPorId.mockResolvedValue({
        data: { cancha: { ...cancha, descripcion: null, servicios: undefined, imagenUrl: null, imagenCredito: null, tipo: null, zona: null, horarios: [] } },
      });
      renderizar();

      expect(await screen.findByText(/Cancha de grama sintética lista para tu partido/)).toBeInTheDocument();
      expect(screen.getByText('Esta cancha aún no tiene horarios configurados.')).toBeInTheDocument();
      expect(screen.getByText('La cancha no tiene horarios disponibles para el día seleccionado.')).toBeInTheDocument();
    });

    it('muestra el error cuando no se puede cargar la cancha', async () => {
      mocks.obtenerCanchaPorId.mockRejectedValue(errorHttp(404, { mensaje: 'Cancha no encontrada' }));
      renderizar();

      expect(await screen.findByRole('alert')).toHaveTextContent('Cancha no encontrada');
      expect(screen.getByRole('link', { name: /Todas las canchas/ })).toBeInTheDocument();
    });
  });

  describe('disponibilidad', () => {
    it('cuenta los bloques libres y marca los ocupados', async () => {
      mocks.obtenerBloquesOcupados.mockResolvedValue({
        data: { ocupados: [{ horaInicio: '06:00:00', horaFin: '07:00:00' }, { horaInicio: '07:00:00', horaFin: '08:00:00' }], retenidos: [] },
      });
      await abrirPagina();

      expect(document.querySelector('.bloques-encabezado span')).toHaveTextContent('1 bloque libre');
      expect(bloque('06:00', '07:00')).toBeDisabled();
      expect(bloque('06:00', '07:00')).toHaveTextContent('No disponible');
    });

    it('avisa cuando no quedan bloques libres', async () => {
      mocks.obtenerBloquesOcupados.mockResolvedValue({
        data: { ocupados: ['06:00:00', '07:00:00', '08:00:00'].map((horaInicio) => ({ horaInicio })), retenidos: [] },
      });
      await abrirPagina();

      expect(screen.getByText('No quedan bloques libres para este día. Elige otra fecha.')).toBeInTheDocument();
    });

    it('muestra "En proceso de reserva" en las franjas retenidas por otros', async () => {
      mocks.obtenerBloquesOcupados.mockResolvedValue({
        data: { ocupados: [], retenidos: [{ horaInicio: '07:00', horaFin: '08:00' }] },
      });
      await abrirPagina();

      expect(bloque('07:00', '08:00')).toBeDisabled();
      expect(bloque('07:00', '08:00')).toHaveTextContent('En proceso de reserva');
    });

    it('muestra el error cuando no se puede consultar la disponibilidad', async () => {
      mocks.obtenerBloquesOcupados.mockRejectedValue(errorHttp(500, { mensaje: 'Sin conexión a la base' }));
      renderizar();
      await screen.findByRole('heading', { level: 1, name: 'Cancha El Bosque' });

      expect(await screen.findByText('Sin conexión a la base')).toBeInTheDocument();
    });

    it('marca los bloques pasados de hoy como no disponibles', async () => {
      renderizar();
      await screen.findByRole('heading', { level: 1, name: 'Cancha El Bosque' });
      await screen.findByRole('button', { name: /06:00 - 07:00/ });
      fireEvent.change(screen.getByLabelText(/Fecha/), { target: { value: '2000-01-01' } });

      // la fecha mínima impide elegir el pasado, pero un valor forzado deja todos los bloques bloqueados
      await waitFor(() => expect(bloque('06:00', '07:00')).toBeDisabled());
    });
  });

  describe('selección y retención de franja', () => {
    it('retiene la franja elegida y muestra la nota de retención', async () => {
      await abrirPagina();
      await elegirBloque();

      expect(mocks.temporizador.retenerFranja).toHaveBeenCalledWith({ fecha: FECHA, horaInicio: '06:00', horaFin: '07:00' });
      expect(bloque('06:00', '07:00')).toHaveAttribute('aria-pressed', 'true');
    });

    it('si la franja la tiene otro usuario, la marca "En proceso" y muestra el mensaje', async () => {
      mocks.temporizador.retenerFranja.mockResolvedValue({
        ok: false,
        error: { codigo: 'FRANJA_RETENIDA', mensaje: 'Otro usuario está reservando esta franja en este momento' },
      });
      await abrirPagina();

      await userEvent.click(bloque('06:00', '07:00'));

      expect(await screen.findByText('Otro usuario está reservando esta franja en este momento')).toBeInTheDocument();
      expect(bloque('06:00', '07:00')).toHaveTextContent('En proceso de reserva');
    });

    it('consulta de nuevo la disponibilidad si la franja ya fue reservada', async () => {
      mocks.temporizador.retenerFranja.mockResolvedValue({ ok: false, error: { codigo: 'FRANJA_OCUPADA', mensaje: 'El horario ya no está disponible' } });
      await abrirPagina();
      const llamadasAntes = mocks.obtenerBloquesOcupados.mock.calls.length;

      await userEvent.click(bloque('06:00', '07:00'));

      expect(await screen.findByText('El horario ya no está disponible')).toBeInTheDocument();
      await waitFor(() => expect(mocks.obtenerBloquesOcupados.mock.calls.length).toBeGreaterThan(llamadasAntes));
    });

    it('marca la sesión como expirada si el servidor dice que el tiempo se acabó', async () => {
      mocks.temporizador.retenerFranja.mockResolvedValue({ ok: false, error: { codigo: 'SESION_EXPIRADA', mensaje: 'Tu tiempo para reservar expiró' } });
      await abrirPagina();

      await userEvent.click(bloque('06:00', '07:00'));

      expect(await screen.findByText('Tu tiempo expiró')).toBeInTheDocument();
    });

    it('muestra un mensaje genérico si el rechazo no trae detalle', async () => {
      mocks.temporizador.retenerFranja.mockResolvedValue({ ok: false });
      await abrirPagina();

      await userEvent.click(bloque('06:00', '07:00'));

      expect(await screen.findByText('No fue posible apartar esta franja. Intenta con otra.')).toBeInTheDocument();
    });

    it('actualiza la hora si el servidor dice que la franja ya pasó', async () => {
      mocks.temporizador.retenerFranja.mockResolvedValue({ ok: false, error: { codigo: 'HORA_PASADA', mensaje: 'No se pueden reservar fechas u horas pasadas' } });
      await abrirPagina();

      await userEvent.click(bloque('06:00', '07:00'));

      expect(await screen.findByText('No se pueden reservar fechas u horas pasadas')).toBeInTheDocument();
    });

    it('al elegir la misma franja otra vez no pide otra retención', async () => {
      await abrirPagina();
      await elegirBloque();

      await userEvent.click(bloque('06:00', '07:00'));
      expect(mocks.temporizador.retenerFranja).toHaveBeenCalledTimes(1);
    });

    it('libera la franja al cambiar de fecha', async () => {
      await abrirPagina();
      await elegirBloque();

      fireEvent.change(screen.getByLabelText(/Fecha/), { target: { value: '2099-03-03' } });

      expect(mocks.temporizador.liberarFranja).toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByText(/Apartamos las/)).not.toBeInTheDocument());
    });
  });

  describe('avisos en tiempo real de otros usuarios', () => {
    it('muestra una franja retenida por otro usuario sin recargar', async () => {
      await abrirPagina();

      act(() => mocks.opciones.onCambioDisponibilidad('retenida', { fecha: FECHA, horaInicio: '07:00', horaFin: '08:00' }));

      expect(bloque('07:00', '08:00')).toHaveTextContent('En proceso de reserva');
      expect(bloque('07:00', '08:00')).toBeDisabled();
    });

    it('marca una franja como no disponible cuando otro usuario la reserva', async () => {
      await abrirPagina();
      act(() => mocks.opciones.onCambioDisponibilidad('retenida', { fecha: FECHA, horaInicio: '07:00', horaFin: '08:00' }));

      act(() => mocks.opciones.onCambioDisponibilidad('reservada', { fecha: FECHA, horaInicio: '07:00', horaFin: '08:00' }));
      expect(bloque('07:00', '08:00')).toHaveTextContent('No disponible');

      // un segundo aviso de la misma franja no la duplica
      act(() => mocks.opciones.onCambioDisponibilidad('reservada', { fecha: FECHA, horaInicio: '07:00', horaFin: '08:00' }));
      expect(screen.getAllByText(/No disponible/)).toHaveLength(1);
    });

    it('vuelve a consultar y libera la franja cuando otro usuario la suelta', async () => {
      await abrirPagina();
      act(() => mocks.opciones.onCambioDisponibilidad('retenida', { fecha: FECHA, horaInicio: '07:00', horaFin: '08:00' }));
      const llamadasAntes = mocks.obtenerBloquesOcupados.mock.calls.length;

      act(() => mocks.opciones.onCambioDisponibilidad('liberada', { fecha: FECHA, horaInicio: '07:00', horaFin: '08:00' }));

      await waitFor(() => expect(bloque('07:00', '08:00')).not.toHaveTextContent('En proceso de reserva'));
      await waitFor(() => expect(mocks.obtenerBloquesOcupados.mock.calls.length).toBeGreaterThan(llamadasAntes));
    });

    it('ignora avisos de otra fecha', async () => {
      await abrirPagina();

      act(() => mocks.opciones.onCambioDisponibilidad('retenida', { fecha: '2099-12-31', horaInicio: '07:00', horaFin: '08:00' }));

      expect(bloque('07:00', '08:00')).not.toHaveTextContent('En proceso de reserva');
    });

    it('vuelve a retener la franja elegida cuando el socket se reconecta', async () => {
      await abrirPagina();
      await elegirBloque();
      mocks.temporizador.retenerFranja.mockClear();

      await act(async () => {
        await mocks.opciones.onSesionIniciada();
      });

      expect(mocks.temporizador.retenerFranja).toHaveBeenCalledWith({ fecha: FECHA, horaInicio: '06:00', horaFin: '07:00' });
    });

    it('suelta la selección si al reconectar la franja ya no se puede retener', async () => {
      await abrirPagina();
      await elegirBloque();
      mocks.temporizador.retenerFranja.mockResolvedValue({ ok: false, error: { codigo: 'FRANJA_RETENIDA', mensaje: 'Ya la tiene otro usuario' } });

      await act(async () => {
        await mocks.opciones.onSesionIniciada();
      });

      expect(await screen.findByText('Ya la tiene otro usuario')).toBeInTheDocument();
      expect(screen.queryByText(/Apartamos las/)).not.toBeInTheDocument();
    });

    it('no hace nada al reconectar si no hay franja elegida', async () => {
      await abrirPagina();

      await act(async () => {
        await mocks.opciones.onSesionIniciada();
      });

      expect(mocks.temporizador.retenerFranja).not.toHaveBeenCalled();
    });
  });

  describe('confirmación de la reserva', () => {
    it('completa el flujo: elegir, iniciar, confirmar y ver la confirmación', async () => {
      await abrirPagina();
      await elegirBloque();
      await entrarAlResumen();

      expect(mocks.entrarPanelReserva).toHaveBeenCalledWith('c1', { fecha: FECHA, horaInicio: '06:00', horaFin: '07:00' });
      expect(screen.getByText(/Reservando como/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));

      expect(await screen.findByText('¡Reserva confirmada!')).toBeInTheDocument();
      expect(screen.getByText('CY-ABCD1234')).toBeInTheDocument();
      expect(mocks.crearReserva).toHaveBeenCalledWith('c1', { fecha: FECHA, horaInicio: '06:00', horaFin: '07:00' });
      expect(JSON.parse(sessionStorage.getItem(CLAVE_FLUJO)).bloqueSeleccionado).toBeNull();
    });

    it('permite hacer otra reserva reiniciando el temporizador', async () => {
      await abrirPagina();
      await elegirBloque();
      await entrarAlResumen();
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
      await screen.findByText('¡Reserva confirmada!');

      await userEvent.click(screen.getByRole('button', { name: 'Hacer otra reserva' }));

      expect(mocks.temporizador.reiniciar).toHaveBeenCalled();
      expect(await screen.findByRole('button', { name: 'Iniciar reserva' })).toBeInTheDocument();
    });

    it('no envía dos reservas con un doble clic', async () => {
      mocks.crearReserva.mockReturnValue(new Promise(() => {}));
      await abrirPagina();
      await elegirBloque();
      await entrarAlResumen();

      const boton = screen.getByRole('button', { name: 'Confirmar reserva' });
      await userEvent.dblClick(boton);

      expect(mocks.crearReserva).toHaveBeenCalledTimes(1);
      expect(await screen.findByRole('button', { name: 'Confirmando...' })).toBeDisabled();
    });

    it('no muestra éxito si el servidor rechaza la reserva', async () => {
      mocks.crearReserva.mockRejectedValue(errorHttp(409, { mensaje: 'Ya tienes una reserva en ese horario' }));
      await abrirPagina();
      await elegirBloque();
      await entrarAlResumen();

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));

      expect(await screen.findByText('Ya tienes una reserva en ese horario')).toBeInTheDocument();
      expect(screen.queryByText('¡Reserva confirmada!')).not.toBeInTheDocument();
    });

    it('usa un mensaje genérico si el error no trae detalle', async () => {
      mocks.crearReserva.mockRejectedValue(new Error('red'));
      await abrirPagina();
      await elegirBloque();
      await entrarAlResumen();

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));

      expect(await screen.findByText('No fue posible confirmar la reserva. Intenta nuevamente.')).toBeInTheDocument();
    });

    it('permite volver a cambiar el horario desde el resumen', async () => {
      await abrirPagina();
      await elegirBloque();
      await entrarAlResumen();

      await userEvent.click(screen.getByRole('button', { name: /Cambiar horario/ }));

      expect(screen.queryByText('Resumen de tu selección')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Iniciar reserva' })).toBeInTheDocument();
    });

    it('cancela la selección y libera la franja', async () => {
      await abrirPagina();
      await elegirBloque();
      await entrarAlResumen();

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar y liberar la franja' }));

      expect(mocks.temporizador.liberarFranja).toHaveBeenCalled();
      expect(screen.queryByText('Resumen de tu selección')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Iniciar reserva' })).toBeDisabled();
    });
  });

  describe('entrar al panel de confirmación', () => {
    it('si otro usuario retiene la franja, la marca y vuelve a la selección', async () => {
      mocks.entrarPanelReserva.mockRejectedValue(errorHttp(409, { codigo: 'FRANJA_RETENIDA', mensaje: 'Otro usuario está reservando esta franja' }));
      await abrirPagina();
      await elegirBloque();
      // al volver a consultar, el servidor ya informa la franja como retenida
      mocks.obtenerBloquesOcupados.mockResolvedValue({ data: { ocupados: [], retenidos: [{ horaInicio: '06:00', horaFin: '07:00' }] } });

      await userEvent.click(screen.getByRole('button', { name: 'Iniciar reserva' }));

      expect(await screen.findByText('Otro usuario está reservando esta franja')).toBeInTheDocument();
      expect(bloque('06:00', '07:00')).toHaveTextContent('En proceso de reserva');
    });

    it('si la franja ya fue reservada, consulta de nuevo la disponibilidad', async () => {
      mocks.entrarPanelReserva.mockRejectedValue(errorHttp(409, { codigo: 'FRANJA_OCUPADA', mensaje: 'El horario ya no está disponible' }));
      await abrirPagina();
      await elegirBloque();
      const llamadasAntes = mocks.obtenerBloquesOcupados.mock.calls.length;

      await userEvent.click(screen.getByRole('button', { name: 'Iniciar reserva' }));

      expect(await screen.findByText('El horario ya no está disponible')).toBeInTheDocument();
      await waitFor(() => expect(mocks.obtenerBloquesOcupados.mock.calls.length).toBeGreaterThan(llamadasAntes));
    });

    it('si la sesión venció (409), muestra que el tiempo expiró', async () => {
      mocks.entrarPanelReserva.mockRejectedValue(errorHttp(409, { mensaje: 'Tu tiempo para reservar expiró' }));
      await abrirPagina();
      await elegirBloque();

      await userEvent.click(screen.getByRole('button', { name: 'Iniciar reserva' }));

      expect(await screen.findByText('Tu tiempo expiró')).toBeInTheDocument();
    });

    it('si la franja ya pasó (400), descarta la selección', async () => {
      mocks.entrarPanelReserva.mockRejectedValue(errorHttp(400, { mensaje: 'No se pueden reservar fechas u horas pasadas' }));
      await abrirPagina();
      await elegirBloque();

      await userEvent.click(screen.getByRole('button', { name: 'Iniciar reserva' }));

      expect(await screen.findByText('No se pueden reservar fechas u horas pasadas')).toBeInTheDocument();
      expect(screen.queryByText(/Apartamos las/)).not.toBeInTheDocument();
    });

    it('muestra un mensaje genérico ante un error de red', async () => {
      mocks.entrarPanelReserva.mockRejectedValue(new Error('red'));
      await abrirPagina();
      await elegirBloque();

      await userEvent.click(screen.getByRole('button', { name: 'Iniciar reserva' }));

      expect(await screen.findByText('No fue posible continuar con la reserva. Intenta nuevamente.')).toBeInTheDocument();
    });
  });

  describe('temporizador de la sesión', () => {
    it('bloquea la pantalla cuando el tiempo expiró y permite reiniciar', async () => {
      mocks.temporizador.expirado = true;
      renderizar();
      await screen.findByRole('heading', { level: 1, name: 'Cancha El Bosque' });

      expect(screen.getByText('Tu tiempo expiró')).toBeInTheDocument();
      expect(screen.getByLabelText(/Fecha/)).toBeDisabled();

      await userEvent.click(screen.getByRole('button', { name: 'Reiniciar temporizador' }));
      expect(mocks.temporizador.reiniciar).toHaveBeenCalled();
    });

    it('muestra el aviso visual cuando quedan menos de 30 segundos', async () => {
      mocks.temporizador.expiresAt = Date.now() + 20000;
      renderizar();
      await screen.findByRole('heading', { level: 1, name: 'Cancha El Bosque' });

      expect(screen.getByText(/menos de 30 segundos/)).toBeInTheDocument();
    });
  });

  describe('flujo guardado en la sesión del navegador', () => {
    it('recupera la fecha y la franja elegidas al volver a la página', async () => {
      sessionStorage.setItem(CLAVE_FLUJO, JSON.stringify({ fecha: FECHA, bloqueSeleccionado: { horaInicio: '07:00', horaFin: '08:00' }, reservaIniciada: true }));
      renderizar();

      expect(await screen.findByText('Resumen de tu selección')).toBeInTheDocument();
      expect(within(screen.getByText('Resumen de tu selección').parentElement).getByText('07:00 - 08:00')).toBeInTheDocument();
    });

    it('ignora datos guardados con formato inválido', async () => {
      sessionStorage.setItem(CLAVE_FLUJO, JSON.stringify({ fecha: '<script>', bloqueSeleccionado: { horaInicio: 'x', horaFin: 'y' }, reservaIniciada: true }));
      renderizar();

      await screen.findByRole('heading', { level: 1, name: 'Cancha El Bosque' });
      expect(screen.queryByText('Resumen de tu selección')).not.toBeInTheDocument();
    });

    it('ignora datos guardados que no son JSON o de una fecha pasada', async () => {
      sessionStorage.setItem(CLAVE_FLUJO, '{no es json');
      const { unmount } = renderizar();
      await screen.findByRole('heading', { level: 1, name: 'Cancha El Bosque' });
      unmount();

      sessionStorage.setItem(CLAVE_FLUJO, JSON.stringify({ fecha: '2000-01-01', bloqueSeleccionado: { horaInicio: '07:00', horaFin: '08:00' }, reservaIniciada: true }));
      renderizar();
      await screen.findByRole('heading', { level: 1, name: 'Cancha El Bosque' });
      expect(screen.queryByText('Resumen de tu selección')).not.toBeInTheDocument();
    });

    it('guarda un flujo sin franja elegida sin marcarlo como iniciado', async () => {
      sessionStorage.setItem(CLAVE_FLUJO, JSON.stringify({ fecha: FECHA, reservaIniciada: true }));
      renderizar();

      await screen.findByRole('heading', { level: 1, name: 'Cancha El Bosque' });
      expect(screen.queryByText('Resumen de tu selección')).not.toBeInTheDocument();
      expect(JSON.parse(sessionStorage.getItem(CLAVE_FLUJO))).toEqual({ fecha: FECHA, bloqueSeleccionado: null, reservaIniciada: false });
    });

    it('descarta una franja guardada de hoy cuya hora ya pasó', async () => {
      const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
      sessionStorage.setItem(CLAVE_FLUJO, JSON.stringify({ fecha: hoy, bloqueSeleccionado: { horaInicio: '00:00', horaFin: '01:00' }, reservaIniciada: false }));
      renderizar();

      expect(await screen.findByText('Ese horario ya pasó. Elige otro bloque disponible.')).toBeInTheDocument();
    });

    it('sigue funcionando aunque el almacenamiento del navegador falle', async () => {
      const guardar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('lleno');
      });
      const borrar = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('bloqueado');
      });
      await abrirPagina();
      await elegirBloque();
      await entrarAlResumen();

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));

      expect(await screen.findByText('¡Reserva confirmada!')).toBeInTheDocument();
      guardar.mockRestore();
      borrar.mockRestore();
    });
  });
});
