jest.mock('../src/repositories/horarioRepository');

const horarioRepository = require('../src/repositories/horarioRepository');
const { validarFranjaEnHorario } = require('../src/services/horarioReservaService');

const CANCHA = 'cancha-1';
// 2099-06-01 cae lunes (1); 2099-06-06 cae sábado (6).
const LUNES = '2099-06-01';
const SABADO = '2099-06-06';
const HORARIOS = [
  { diaSemana: 1, horaInicio: '06:00:00', horaFin: '22:00:00' },
  { diaSemana: 6, horaInicio: '07:00:00', horaFin: '20:00:00' },
];

describe('horarioReservaService.validarFranjaEnHorario', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    horarioRepository.listarPorCancha.mockResolvedValue(HORARIOS);
  });

  it('acepta un bloque de 1 hora dentro del horario del día', async () => {
    await expect(validarFranjaEnHorario(CANCHA, { fecha: LUNES, horaInicio: '06:00', horaFin: '07:00' })).resolves.toBeUndefined();
    await expect(validarFranjaEnHorario(CANCHA, { fecha: LUNES, horaInicio: '21:00', horaFin: '22:00' })).resolves.toBeUndefined();
    await expect(validarFranjaEnHorario(CANCHA, { fecha: SABADO, horaInicio: '19:00', horaFin: '20:00' })).resolves.toBeUndefined();
  });

  it('rechaza horas anteriores a la apertura o posteriores al cierre', async () => {
    for (const [fecha, horaInicio, horaFin] of [[LUNES, '05:00', '06:00'], [LUNES, '22:00', '23:00'], [SABADO, '06:00', '07:00'], [SABADO, '20:00', '21:00']]) {
      await expect(validarFranjaEnHorario(CANCHA, { fecha, horaInicio, horaFin })).rejects.toMatchObject({ statusCode: 400, codigo: 'FUERA_DE_HORARIO' });
    }
  });

  it('rechaza un día de la semana sin horario', async () => {
    await expect(validarFranjaEnHorario(CANCHA, { fecha: '2099-06-02', horaInicio: '10:00', horaFin: '11:00' })).rejects.toMatchObject({ codigo: 'FUERA_DE_HORARIO' });
  });

  it('rechaza franjas que no duran exactamente 1 hora', async () => {
    for (const [horaInicio, horaFin] of [['10:00', '12:00'], ['10:00', '10:30'], ['10:00', '10:00']]) {
      await expect(validarFranjaEnHorario(CANCHA, { fecha: LUNES, horaInicio, horaFin })).rejects.toMatchObject({ statusCode: 400, codigo: 'BLOQUE_INVALIDO' });
    }
  });

  it('rechaza bloques que no están alineados con la hora de apertura (se solaparían con la cuadrícula del día)', async () => {
    await expect(validarFranjaEnHorario(CANCHA, { fecha: LUNES, horaInicio: '10:30', horaFin: '11:30' })).rejects.toMatchObject({ codigo: 'FUERA_DE_HORARIO' });
  });
});
