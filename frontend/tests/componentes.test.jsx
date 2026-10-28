import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Alerta from '../src/components/common/Alerta';
import CanchaCard from '../src/components/canchas/CanchaCard';
import FiltroCanchas from '../src/components/canchas/FiltroCanchas';
import TemporizadorReserva from '../src/components/canchas/TemporizadorReserva';
import ConfirmacionReserva from '../src/components/canchas/ConfirmacionReserva';
import { renderConRuta } from './helpers';

describe('Alerta', () => {
  it('no muestra nada sin mensaje', () => {
    const { container } = render(<Alerta mensaje="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra un error con rol alert y un éxito con rol status', () => {
    const { rerender } = render(<Alerta mensaje="Falló" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Falló');

    rerender(<Alerta tipo="exito" mensaje="Listo" />);
    expect(screen.getByRole('status')).toHaveTextContent('Listo');
  });
});

describe('CanchaCard', () => {
  const cancha = {
    id: 'c1',
    nombre: 'Cancha El Bosque',
    direccion: 'Calle 1 # 2-3',
    zona: 'Sur',
    tipo: 'Fútbol 5',
    costoHora: 60000,
    imagenUrl: '/img/bosque.jpg',
    servicios: ['Parqueadero', 'Iluminación', 'Café', 'Wifi'],
  };

  it('muestra los datos de la cancha y solo los tres primeros servicios', () => {
    renderConRuta(<CanchaCard cancha={cancha} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/canchas/c1');
    expect(screen.getByAltText('Foto de Cancha El Bosque')).toBeInTheDocument();
    expect(screen.getByText('Fútbol 5')).toBeInTheDocument();
    expect(screen.getByText(/Sur/)).toBeInTheDocument();
    expect(screen.getByText(/Parqueadero/)).toBeInTheDocument();
    expect(screen.queryByText(/Wifi/)).not.toBeInTheDocument();
  });

  it('funciona sin imagen, zona, tipo ni servicios', () => {
    renderConRuta(<CanchaCard cancha={{ id: 'c2', nombre: 'Sin datos', direccion: 'X', costoHora: 1000 }} />);
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('FiltroCanchas', () => {
  it('envía los filtros escritos y los limpia', async () => {
    const onFiltrar = vi.fn();
    render(<FiltroCanchas onFiltrar={onFiltrar} />);

    await userEvent.type(screen.getByLabelText(/Zona/), 'Norte');
    await userEvent.type(screen.getByLabelText(/Precio mín/), '10000');
    await userEvent.type(screen.getByLabelText(/Precio máx/), '50000');
    await userEvent.type(screen.getByLabelText(/Fecha/), '2026-10-01');
    await userEvent.click(screen.getByRole('button', { name: /Buscar/ }));

    expect(onFiltrar).toHaveBeenLastCalledWith({ zona: 'Norte', precioMin: '10000', precioMax: '50000', fecha: '2026-10-01' });

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(onFiltrar).toHaveBeenLastCalledWith({});
    expect(screen.getByLabelText(/Zona/)).toHaveValue('');
  });
});

describe('TemporizadorReserva', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('avisa que prepara la sesión mientras no hay hora de vencimiento', () => {
    render(<TemporizadorReserva expiresAt={null} />);
    expect(screen.getByText(/Preparando tu sesión/)).toBeInTheDocument();
  });

  it('muestra la cuenta regresiva y la barra de progreso', () => {
    render(<TemporizadorReserva expiresAt={Date.now() + 125000} />);
    expect(screen.getByText('02:05')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '125');
    expect(screen.queryByText(/menos de 30 segundos/)).not.toBeInTheDocument();
  });

  it('avisa visualmente cuando quedan 30 segundos o menos', () => {
    render(<TemporizadorReserva expiresAt={Date.now() + 29000} />);
    expect(screen.getByText(/menos de 30 segundos/)).toBeInTheDocument();
  });

  it('descuenta el tiempo a medida que pasa', () => {
    render(<TemporizadorReserva expiresAt={Date.now() + 60000} />);
    expect(screen.getByText('01:00')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByText('00:50')).toBeInTheDocument();
  });

  it('usa el desfase con la hora del servidor', () => {
    render(<TemporizadorReserva expiresAt={Date.now() + 60000} desfaseMs={30000} />);
    expect(screen.getByText('00:30')).toBeInTheDocument();
  });

  it('muestra que la selección quedó asegurada cuando se completó', () => {
    render(<TemporizadorReserva expiresAt={Date.now() + 60000} completado />);
    expect(screen.getByText('Selección asegurada')).toBeInTheDocument();
  });

  it('permite reiniciar cuando expiró', () => {
    const onReiniciar = vi.fn();
    render(<TemporizadorReserva expirado onReiniciar={onReiniciar} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Tu tiempo expiró');
    act(() => screen.getByRole('button', { name: 'Reiniciar temporizador' }).click());
    expect(onReiniciar).toHaveBeenCalled();
  });
});

describe('ConfirmacionReserva', () => {
  const reserva = {
    codigo: 'CY-ABC12345',
    fecha: '2026-10-28',
    horaInicio: '07:00:00',
    horaFin: '08:00:00',
    estado: 'confirmada',
    cancha: { nombre: 'Cancha El Bosque' },
  };

  it('muestra el resumen con código, cancha, fecha, hora y estado', () => {
    renderConRuta(<ConfirmacionReserva reserva={reserva} onHacerOtraReserva={() => {}} />);

    expect(screen.getByText('¡Reserva confirmada!')).toBeInTheDocument();
    expect(screen.getByText('CY-ABC12345')).toBeInTheDocument();
    expect(screen.getByText('Cancha El Bosque')).toBeInTheDocument();
    expect(screen.getByText('07:00 - 08:00')).toBeInTheDocument();
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver mis reservas/ })).toHaveAttribute('href', '/mis-reservas');
  });

  it('permite hacer otra reserva', async () => {
    const onHacerOtraReserva = vi.fn();
    renderConRuta(<ConfirmacionReserva reserva={reserva} onHacerOtraReserva={onHacerOtraReserva} />);

    await userEvent.click(screen.getByRole('button', { name: 'Hacer otra reserva' }));
    expect(onHacerOtraReserva).toHaveBeenCalled();
  });
});
