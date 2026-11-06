// US-14: cancelar una reserva propia desde "Mis reservas" (confirmación, plazo de 2 horas, aviso en pantalla y reembolso).
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  obtenerMisReservas: vi.fn(),
  cancelarReserva: vi.fn(),
}));
vi.mock('../src/api/reservasApi', () => ({ obtenerMisReservas: api.obtenerMisReservas, cancelarReserva: api.cancelarReserva }));

import MisReservasPage from '../src/pages/MisReservasPage';
import { errorHttp, renderConRuta } from './helpers';

const PAGO = { estado: 'aprobado', monto: 60000, moneda: 'COP', marca: 'Visa', ultimos4: '4242' };

function reserva(numero, extra = {}) {
  return {
    id: `r${numero}`,
    codigo: `CY-0000000${numero}`,
    canchaNombre: `Cancha ${numero}`,
    canchaDireccion: `Calle ${numero}`,
    fecha: '2099-10-28',
    horaInicio: '07:00',
    horaFin: '08:00',
    estado: 'confirmada',
    puedeCancelar: true,
    pago: null,
    ...extra,
  };
}

const respuesta = (reservas) => ({ data: { reservas, paginacion: { pagina: 1, limite: 10, total: reservas.length, totalPaginas: 1 } } });

async function abrirHistorial(reservas) {
  api.obtenerMisReservas.mockResolvedValue(respuesta(reservas));
  renderConRuta(<MisReservasPage />);
  await screen.findByText(reservas[0].canchaNombre);
}

const botonCancelar = (numero = 1) => within(screen.getByText(`Cancha ${numero}`).closest('li')).getByRole('button', { name: 'Cancelar reserva' });

describe('Cancelación de reserva (US-14)', () => {
  beforeEach(() => {
    api.cancelarReserva.mockResolvedValue({ data: { reserva: { id: 'r1', estado: 'cancelada' }, reembolso: null } });
  });

  it('ofrece "Cancelar reserva" solo en las reservas confirmadas', async () => {
    await abrirHistorial([reserva(1), reserva(2, { estado: 'cancelada', puedeCancelar: false }), reserva(3, { estado: 'completada', puedeCancelar: false })]);

    expect(screen.getAllByRole('button', { name: 'Cancelar reserva' })).toHaveLength(1);
  });

  it('pide confirmar antes de cancelar, mostrando el detalle de la reserva, y no cancela si se vuelve atrás', async () => {
    await abrirHistorial([reserva(1)]);

    await userEvent.click(botonCancelar());

    const dialogo = screen.getByRole('dialog', { name: '¿Cancelar esta reserva?' });
    expect(within(dialogo).getByText('Cancha 1')).toBeInTheDocument();
    expect(within(dialogo).getByText('CY-00000001')).toBeInTheDocument();
    expect(within(dialogo).getByText(/La franja quedará disponible para otros usuarios de inmediato/)).toBeInTheDocument();
    expect(api.cancelarReserva).not.toHaveBeenCalled();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'No, conservarla' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.cancelarReserva).not.toHaveBeenCalled();
  });

  it('el diálogo se cierra con la tecla Escape y al pulsar fuera de él', async () => {
    await abrirHistorial([reserva(1)]);

    await userEvent.click(botonCancelar());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(botonCancelar());
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('al confirmar cancela, avisa en pantalla con el detalle y actualiza la lista', async () => {
    await abrirHistorial([reserva(1)]);
    api.obtenerMisReservas.mockResolvedValue(respuesta([reserva(1, { estado: 'cancelada', puedeCancelar: false })]));

    await userEvent.click(botonCancelar());
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, cancelar reserva' }));

    expect(api.cancelarReserva).toHaveBeenCalledWith('r1');
    const aviso = await screen.findByText(/Reserva CY-00000001 cancelada/);
    expect(aviso).toHaveTextContent('Te enviamos un correo con el detalle');
    expect(aviso).not.toHaveTextContent('Reembolsamos');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // la lista se volvió a consultar y la reserva ya figura como cancelada, sin botón
    await waitFor(() => expect(api.obtenerMisReservas).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Cancelada', { selector: 'span.estado-reserva' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
  });

  it('si la reserva estaba pagada con tarjeta, avisa del reembolso antes y después de cancelar', async () => {
    api.cancelarReserva.mockResolvedValue({ data: { reserva: { id: 'r1', estado: 'cancelada' }, reembolso: { ...PAGO, estado: 'reembolsado' } } });
    await abrirHistorial([reserva(1, { pago: PAGO })]);

    expect(screen.getByText(/Pagada · Visa ···· 4242/)).toBeInTheDocument();

    await userEvent.click(botonCancelar());
    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveTextContent(/Te reembolsaremos .*60\.000.* a tu tarjeta Visa terminada en 4242/);

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Sí, cancelar reserva' }));

    expect(await screen.findByText(/Reembolsamos .*60\.000.* a tu tarjeta Visa terminada en 4242/)).toBeInTheDocument();
  });

  it('muestra "Reembolsada" en las reservas cuyo pago ya se devolvió', async () => {
    await abrirHistorial([reserva(1, { estado: 'cancelada', puedeCancelar: false, pago: { ...PAGO, estado: 'reembolsado' } })]);

    expect(screen.getByText(/Reembolsada · Visa ···· 4242/)).toBeInTheDocument();
  });

  it('si faltan menos de 2 horas bloquea la acción y explica la restricción, sin abrir el diálogo ni llamar al servidor', async () => {
    await abrirHistorial([reserva(1, { puedeCancelar: false })]);

    await userEvent.click(botonCancelar());

    expect(screen.getByRole('alert')).toHaveTextContent('Ya no puedes cancelar esta reserva: solo se puede cancelar con al menos 2 horas de anticipación al inicio.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.cancelarReserva).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza la cancelación (por ejemplo, pasó el plazo mientras tanto) muestra su mensaje y actualiza la lista', async () => {
    api.cancelarReserva.mockRejectedValue(
      errorHttp(409, { codigo: 'CANCELACION_FUERA_DE_PLAZO', mensaje: 'Solo puedes cancelar una reserva con al menos 2 horas de anticipación al inicio. Ya no es posible cancelar esta reserva.' })
    );
    await abrirHistorial([reserva(1)]);
    api.obtenerMisReservas.mockResolvedValue(respuesta([reserva(1, { puedeCancelar: false })]));

    await userEvent.click(botonCancelar());
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, cancelar reserva' }));

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Ya no es posible cancelar esta reserva');
    expect(screen.queryByText(/Reserva CY-00000001 cancelada/)).not.toBeInTheDocument();
    await waitFor(() => expect(api.obtenerMisReservas).toHaveBeenCalledTimes(2));
  });

  it('usa un mensaje por defecto si cancelar falla sin detalle', async () => {
    api.cancelarReserva.mockRejectedValue(new Error('red'));
    await abrirHistorial([reserva(1)]);

    await userEvent.click(botonCancelar());
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, cancelar reserva' }));

    expect(await within(screen.getByRole('dialog')).findByText('No fue posible cancelar la reserva. Intenta nuevamente.')).toBeInTheDocument();
  });

  it('mientras se procesa la cancelación deshabilita los botones del diálogo (no se envía dos veces)', async () => {
    let terminar;
    api.cancelarReserva.mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    await abrirHistorial([reserva(1)]);

    await userEvent.click(botonCancelar());
    const dialogo = screen.getByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Sí, cancelar reserva' }));

    expect(within(dialogo).getByRole('button', { name: 'Procesando...' })).toBeDisabled();
    expect(within(dialogo).getByRole('button', { name: 'No, conservarla' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.cancelarReserva).toHaveBeenCalledTimes(1);

    await act(async () => terminar({ data: { reserva: {}, reembolso: null } }));
  });
});
