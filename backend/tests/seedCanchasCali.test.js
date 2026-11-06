// Seed de canchas adicionales de Cali: calidad de los datos del catálogo y lógica de siembra (sin base de datos).
const fs = require('fs');
const path = require('path');
const catalogoBase = require('../src/seed/catalogoCanchas');
const { canchasCali, PATRONES_HORARIO, FOTOS } = require('../src/seed/catalogoCanchasCali');
const { horariosDeCancha, seleccionarNuevas, sembrarCanchasCali } = require('../src/seed/planCanchasCali');

const ZONAS = ['Norte', 'Sur', 'Oeste', 'Oriente', 'Centro'];
const RANGO_PRECIO = { 'Fútbol 5': [40000, 100000], 'Fútbol 6': [50000, 110000], 'Fútbol 7': [60000, 125000], 'Fútbol 8': [75000, 140000], 'Fútbol 11': [150000, 260000] };
const carpetaImagenes = path.join(__dirname, '../../frontend/public/img/canchas');

describe('catálogo de canchas de Cali', () => {
  it('agrega muchas canchas repartidas en todas las zonas de la ciudad', () => {
    expect(canchasCali.length).toBeGreaterThanOrEqual(50);

    ZONAS.forEach((zona) => expect(canchasCali.filter((c) => c.zona === zona).length).toBeGreaterThanOrEqual(5));
    expect(new Set(canchasCali.map((c) => c.tipo)).size).toBeGreaterThanOrEqual(4);
  });

  it('cada nombre es único y no repite el de las canchas del catálogo base', () => {
    const nombres = canchasCali.map((c) => c.nombre);

    expect(new Set(nombres).size).toBe(nombres.length);
    nombres.forEach((nombre) => expect(catalogoBase.map((c) => c.nombre)).not.toContain(nombre));
  });

  it.each(canchasCali.map((c) => [c.nombre, c]))('%s tiene datos completos y coherentes', (_nombre, cancha) => {
    expect(cancha.nombre).toMatch(/^Cancha /);
    expect(cancha.direccion).toMatch(/, Cali$/);
    expect(ZONAS).toContain(cancha.zona);
    expect(cancha.disponible).toBe(true);

    const [minimo, maximo] = RANGO_PRECIO[cancha.tipo];
    expect(cancha.costoHora).toBeGreaterThanOrEqual(minimo);
    expect(cancha.costoHora).toBeLessThanOrEqual(maximo);
    expect(cancha.costoHora % 1000).toBe(0);

    expect(cancha.servicios.length).toBeGreaterThanOrEqual(3);
    expect(cancha.servicios.length).toBeLessThanOrEqual(6);
    expect(new Set(cancha.servicios).size).toBe(cancha.servicios.length);

    expect(cancha.descripcion.length).toBeGreaterThan(60);
    expect(cancha.imagenCredito).toMatch(/Wikimedia Commons/);
  });

  it('las descripciones no se repiten y las fotos existen en el frontend', () => {
    const descripciones = canchasCali.map((c) => c.descripcion);
    expect(new Set(descripciones).size).toBe(descripciones.length);

    FOTOS.forEach((foto) => expect(fs.existsSync(path.join(carpetaImagenes, path.basename(foto.imagenUrl)))).toBe(true));
    canchasCali.forEach((c) => expect(FOTOS.map((f) => f.imagenUrl)).toContain(c.imagenUrl));
  });

  it('las direcciones tampoco se repiten', () => {
    const direcciones = canchasCali.map((c) => c.direccion);
    expect(new Set(direcciones).size).toBe(direcciones.length);
  });
});

describe('horarios de atención', () => {
  it.each(PATRONES_HORARIO.map((p, i) => [i, p]))('el patrón %i abre y cierra en horas exactas, en bloques de 1 hora', (_i, patron) => {
    [patron.semana, patron.finDeSemana].forEach(([apertura, cierre]) => {
      expect(apertura).toMatch(/^\d{2}:00$/);
      expect(cierre).toMatch(/^\d{2}:00$/);
      expect(cierre > apertura).toBe(true);
    });
  });

  it('genera los 7 días de la semana, con horario distinto en fin de semana cuando el patrón lo define', () => {
    const horarios = horariosDeCancha('c1', 0);

    expect(horarios.map((h) => h.diaSemana)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(horarios.every((h) => h.canchaId === 'c1')).toBe(true);
    expect(horarios[1]).toMatchObject({ horaInicio: '06:00', horaFin: '22:00' });
    expect(horarios[0]).toMatchObject({ horaInicio: '07:00', horaFin: '20:00' });
    expect(horarios[6]).toMatchObject({ horaInicio: '07:00', horaFin: '20:00' });
  });

  it('rota los patrones entre las canchas', () => {
    const usados = new Set(canchasCali.map((_, i) => JSON.stringify(horariosDeCancha('x', i)[1])));
    expect(usados.size).toBe(PATRONES_HORARIO.length);
    expect(horariosDeCancha('x', PATRONES_HORARIO.length)).toEqual(horariosDeCancha('x', 0));
  });
});

describe('sembrarCanchasCali', () => {
  const catalogo = [
    { nombre: 'Cancha A', direccion: 'Calle 1, Cali', zona: 'Norte' },
    { nombre: 'Cancha B', direccion: 'Calle 2, Cali', zona: 'Sur' },
    { nombre: 'Cancha C', direccion: 'Calle 3, Cali', zona: 'Oeste' },
  ];

  function repositorios({ existentes = [], sinHorario = [] } = {}) {
    return {
      canchaRepository: {
        listarNombres: jest.fn().mockResolvedValue(existentes),
        crearMuchas: jest.fn(async (canchas) => canchas.map((c, i) => ({ id: `id-${c.nombre}`, nombre: c.nombre, indice: i }))),
        listarSinHorarioPorNombres: jest.fn().mockResolvedValue(sinHorario),
      },
      horarioRepository: { crearMuchos: jest.fn().mockResolvedValue([]) },
    };
  }

  it('selecciona solo las canchas que todavía no existen', () => {
    expect(seleccionarNuevas(catalogo, ['Cancha B']).map((c) => c.nombre)).toEqual(['Cancha A', 'Cancha C']);
    expect(seleccionarNuevas(catalogo, [])).toHaveLength(3);
    expect(seleccionarNuevas(catalogo, ['Cancha A', 'Cancha B', 'Cancha C'])).toEqual([]);
  });

  it('en una base vacía crea todas las canchas y completa el horario de cada una', async () => {
    const repos = repositorios({ sinHorario: [{ id: 'id-Cancha A', nombre: 'Cancha A' }, { id: 'id-Cancha B', nombre: 'Cancha B' }, { id: 'id-Cancha C', nombre: 'Cancha C' }] });

    const resultado = await sembrarCanchasCali({ ...repos, catalogo });

    expect(resultado).toEqual({ creadas: 3, yaExistian: 0, conHorarioNuevo: 3 });
    expect(repos.canchaRepository.crearMuchas).toHaveBeenCalledWith(catalogo);
    expect(repos.horarioRepository.crearMuchos).toHaveBeenCalledTimes(3);
    // el patrón de horario sigue la posición de la cancha en el catálogo
    expect(repos.horarioRepository.crearMuchos.mock.calls[2][0]).toEqual(horariosDeCancha('id-Cancha C', 2));
  });

  it('repetido: no crea nada ni vuelve a insertar horarios', async () => {
    const repos = repositorios({ existentes: ['Cancha A', 'Cancha B', 'Cancha C'], sinHorario: [] });

    const resultado = await sembrarCanchasCali({ ...repos, catalogo });

    expect(resultado).toEqual({ creadas: 0, yaExistian: 3, conHorarioNuevo: 0 });
    expect(repos.canchaRepository.crearMuchas).not.toHaveBeenCalled();
    expect(repos.horarioRepository.crearMuchos).not.toHaveBeenCalled();
  });

  it('solo crea las que faltan y respeta las que ya estaban', async () => {
    const repos = repositorios({ existentes: ['Cancha A'], sinHorario: [{ id: 'id-Cancha B', nombre: 'Cancha B' }, { id: 'id-Cancha C', nombre: 'Cancha C' }] });

    const resultado = await sembrarCanchasCali({ ...repos, catalogo });

    expect(resultado).toEqual({ creadas: 2, yaExistian: 1, conHorarioNuevo: 2 });
    expect(repos.canchaRepository.crearMuchas).toHaveBeenCalledWith([catalogo[1], catalogo[2]]);
  });

  it('completa el horario de una cancha que quedó sin él por una ejecución interrumpida', async () => {
    const repos = repositorios({ existentes: ['Cancha A', 'Cancha B', 'Cancha C'], sinHorario: [{ id: 'id-b', nombre: 'Cancha B' }] });

    const resultado = await sembrarCanchasCali({ ...repos, catalogo });

    expect(resultado).toEqual({ creadas: 0, yaExistian: 3, conHorarioNuevo: 1 });
    expect(repos.horarioRepository.crearMuchos).toHaveBeenCalledWith(horariosDeCancha('id-b', 1));
  });

  it('usa el catálogo completo de Cali por defecto', async () => {
    const repos = repositorios();

    await sembrarCanchasCali(repos);

    expect(repos.canchaRepository.crearMuchas).toHaveBeenCalledWith(canchasCali);
  });
});
