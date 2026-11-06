// Canchas de ejemplo adicionales para Cali (zonas Norte, Sur, Oeste, Oriente y Centro). Son datos de demostración:
// los nombres y las direcciones son inventados (con barrios reales de la ciudad) y no corresponden a negocios reales.
// Se agregan con `npm run seed:mas-canchas`, que no borra nada y se puede repetir sin duplicar.
//
// Fotos: no hay más imágenes con licencia libre en el proyecto, así que se reutilizan las 5 del catálogo base,
// con sus créditos, de forma rotativa.
const FOTOS = [
  { imagenUrl: '/img/canchas/los-cerros.jpg', imagenCredito: 'Foto: Luisbaleta15 · CC BY-SA 4.0 · Wikimedia Commons' },
  { imagenUrl: '/img/canchas/el-bosque.jpg', imagenCredito: 'Foto: Reptonix · CC BY 3.0 · Wikimedia Commons' },
  { imagenUrl: '/img/canchas/la-rivera.jpg', imagenCredito: 'Foto: Jimmy Gómez N · CC BY-SA 3.0 · Wikimedia Commons' },
  { imagenUrl: '/img/canchas/santa-monica.jpg', imagenCredito: 'Foto: Nguyendinh Deptrai · CC0 · Wikimedia Commons' },
  { imagenUrl: '/img/canchas/san-fernando.jpg', imagenCredito: 'Foto: SageData · CC BY-SA 4.0 · Wikimedia Commons' },
];

// Horarios de atención: [apertura, cierre] entre semana y en fin de semana. Se asignan de forma rotativa.
const PATRONES_HORARIO = [
  { semana: ['06:00', '22:00'], finDeSemana: ['07:00', '20:00'] },
  { semana: ['05:00', '23:00'], finDeSemana: ['06:00', '22:00'] },
  { semana: ['07:00', '21:00'], finDeSemana: ['07:00', '21:00'] },
  { semana: ['08:00', '22:00'], finDeSemana: ['08:00', '20:00'] },
  { semana: ['16:00', '23:00'], finDeSemana: ['08:00', '22:00'] },
];

const S = {
  led: 'Iluminación LED',
  parq: 'Parqueadero',
  vest: 'Vestieres',
  duchas: 'Vestieres con duchas',
  caf: 'Cafetería',
  grad: 'Graderías',
  techo: 'Gradería techada',
  wifi: 'Wi-Fi',
  agua: 'Punto de hidratación',
  balones: 'Préstamo de balones',
  petos: 'Préstamo de petos',
  verde: 'Zona verde',
  cerrada: 'Cancha cerrada',
  vigil: 'Vigilancia 24 h',
  alto: 'Grama de alto tráfico',
  arbitro: 'Árbitro disponible',
};

// Cierre de la descripción según el tipo de cancha (varía con el número de la fila para no repetir siempre la misma frase).
const CIERRES = {
  'Fútbol 5': [
    'Ideal para el fútbol 5 de la oficina o el picadito de los viernes.',
    'Espacio justo para partidos rápidos, de toque y de mucho ritmo.',
    'Perfecta para armar el partido entre amigos sin complicaciones.',
  ],
  'Fútbol 6': [
    'Un tamaño intermedio que deja jugar con espacio sin perder intensidad.',
    'Para los equipos que quieren más cancha que un fútbol 5 sin llegar a la de 11.',
    'Buena para partidos parejos y revanchas de toda la vida.',
  ],
  'Fútbol 7': [
    'Cancha amplia para equipos de siete que quieren correr y jugar largo.',
    'Pensada para campeonatos entre barrios y empresas.',
    'El formato favorito de los equipos que juegan todas las semanas.',
  ],
  'Fútbol 8': [
    'Espacio de sobra para equipos grandes, torneos y partidos de fin de semana.',
    'Tamaño ideal para ligas de aficionados y encuentros entre colegios.',
    'Para jugar abierto, con extremos y todo el campo a disposición.',
  ],
  'Fútbol 11': [
    'Cancha de tamaño reglamentario para partidos de fútbol 11.',
    'Para los equipos que quieren jugar como en el torneo grande, con todas las líneas.',
  ],
};

// [nombre, zona, dirección, tipo, costo por hora, servicios, frase de presentación]
const FILAS = [
  // ---------- Norte
  ['Cancha Granada Gol', 'Norte', 'Av. 9N # 14-30, Granada, Cali', 'Fútbol 5', 85000, [S.led, S.parq, S.caf, S.balones], 'A pasos de la zona gastronómica de Granada: juega y después cena en el barrio.'],
  ['Cancha Versalles', 'Norte', 'Cra 4N # 21-15, Versalles, Cali', 'Fútbol 6', 90000, [S.led, S.vest, S.parq, S.agua], 'Grama bien cuidada en uno de los barrios más tradicionales del norte.'],
  ['Cancha Vipasa Arena', 'Norte', 'Av. 6N # 28-40, Vipasa, Cali', 'Fútbol 7', 105000, [S.led, S.techo, S.duchas, S.parq, S.wifi], 'Gradería techada y duchas para que la hinchada y el equipo estén cómodos.'],
  ['Cancha Menga Norte', 'Norte', 'Calle 44N # 3-25, Menga, Cali', 'Fútbol 5', 75000, [S.led, S.parq, S.petos], 'Cancha cerrada y bien iluminada, muy cerca de la salida a Yumbo.'],
  ['Cancha La Flora', 'Norte', 'Av. 4N # 41-10, La Flora, Cali', 'Fútbol 6', 85000, [S.led, S.vest, S.caf, S.verde], 'Rodeada de zonas verdes y con cafetería para la tertulia posterior al partido.'],
  ['Cancha Prados del Norte', 'Norte', 'Av. 3N # 50-20, Prados del Norte, Cali', 'Fútbol 8', 110000, [S.led, S.grad, S.parq, S.vigil, S.arbitro], 'Pensada para torneos: árbitro disponible y vigilancia todo el día.'],
  ['Cancha Chipichape Sport', 'Norte', 'Calle 38N # 6-45, Chipichape, Cali', 'Fútbol 5', 90000, [S.led, S.duchas, S.parq, S.wifi], 'Junto a las oficinas de Chipichape: el plan perfecto después del trabajo.'],
  ['Cancha Floralia Fútbol Club', 'Norte', 'Cra 5N # 52-30, Floralia, Cali', 'Fútbol 7', 80000, [S.led, S.parq, S.vest, S.agua], 'Un clásico del norte para los equipos de barrio de toda la vida.'],
  ['Cancha Los Álamos', 'Norte', 'Av. 2N # 60-15, Ciudad Los Álamos, Cali', 'Fútbol 5', 70000, [S.led, S.parq, S.balones], 'Precio amable y buena iluminación para los partidos de entre semana.'],
  ['Cancha La Campiña', 'Norte', 'Calle 70N # 4-20, La Campiña, Cali', 'Fútbol 6', 80000, [S.led, S.vest, S.caf, S.petos], 'Tranquila y bien demarcada, con todo a la mano para jugar sin afanes.'],
  ['Cancha Alamos Premium', 'Norte', 'Av. 8N # 62-05, Cali', 'Fútbol 11', 210000, [S.led, S.techo, S.duchas, S.parq, S.vigil, S.arbitro], 'La cancha reglamentaria del norte, con camerinos completos y árbitro.'],
  ['Cancha Torres de Comfandi', 'Norte', 'Cra 1 # 47-80, Cali', 'Fútbol 5', 72000, [S.led, S.parq, S.verde], 'Grama sintética nueva y un entorno arbolado para jugar a gusto.'],
  ['Cancha San Vicente', 'Norte', 'Calle 34N # 2-60, San Vicente, Cali', 'Fútbol 6', 78000, [S.led, S.vest, S.agua, S.parq], 'Cerca del río Cali: ideal para combinar el partido con un paseo.'],
  ['Cancha Bellavista Norte', 'Norte', 'Av. 7N # 24-18, Cali', 'Fútbol 5', 82000, [S.led, S.cerrada, S.caf], 'Cancha cerrada: el balón no se pierde y el partido no para.'],

  // ---------- Sur
  ['Cancha Ciudad Jardín', 'Sur', 'Cra 100 # 14-60, Ciudad Jardín, Cali', 'Fútbol 7', 115000, [S.led, S.techo, S.duchas, S.parq, S.wifi, S.caf], 'La más completa de Ciudad Jardín: duchas, cafetería y gradería techada.'],
  ['Cancha Limonar Gol', 'Sur', 'Calle 5 # 66-20, Limonar, Cali', 'Fútbol 5', 80000, [S.led, S.parq, S.vest, S.balones], 'Una cancha ágil, cómoda y con precio justo en pleno Limonar.'],
  ['Cancha Pance Campestre', 'Sur', 'Km 3 Vía Pance, Pance, Cali', 'Fútbol 8', 130000, [S.led, S.verde, S.grad, S.parq, S.duchas, S.caf], 'Juega rodeado de naturaleza, en la zona campestre de Pance.'],
  ['Cancha Valle del Lili Arena', 'Sur', 'Cra 98 # 25-40, Valle del Lili, Cali', 'Fútbol 6', 100000, [S.led, S.techo, S.duchas, S.parq, S.wifi], 'Cerca de las universidades: el plan de los equipos de estudiantes y egresados.'],
  ['Cancha Caney Fútbol', 'Sur', 'Calle 42 # 83-15, El Caney, Cali', 'Fútbol 7', 95000, [S.led, S.parq, S.vest, S.agua, S.petos], 'Una cancha de barrio con ambiente de torneo cada fin de semana.'],
  ['Cancha Capri', 'Sur', 'Cra 66 # 7-30, Ciudad Capri, Cali', 'Fútbol 5', 76000, [S.led, S.parq, S.caf], 'Grama sintética en excelente estado y cafetería a un costado.'],
  ['Cancha Cuarto de Legua', 'Sur', 'Calle 9 # 56-10, Cuarto de Legua, Cali', 'Fútbol 6', 88000, [S.led, S.vest, S.parq, S.agua], 'Amplia, bien iluminada y con parqueadero para todo el equipo.'],
  ['Cancha Primavera', 'Sur', 'Cra 80 # 5-25, Primavera, Cali', 'Fútbol 5', 70000, [S.led, S.vest, S.balones], 'Precio accesible para jugar varias veces por semana.'],
  ['Cancha Tequendama', 'Sur', 'Cra 56 # 4B-70, Tequendama, Cali', 'Fútbol 7', 98000, [S.led, S.grad, S.parq, S.vigil], 'Vigilada todo el día y con graderías para acompañar a tu equipo.'],
  ['Cancha Meléndez', 'Sur', 'Calle 1 # 94-20, Meléndez, Cali', 'Fútbol 6', 82000, [S.led, S.parq, S.agua, S.petos], 'Al pie de los cerros: partidos con vista y buen ambiente.'],
  ['Cancha Los Chorros', 'Sur', 'Cra 24F # 1-40, Cali', 'Fútbol 5', 68000, [S.led, S.parq, S.verde], 'Rodeada de verde, perfecta para los partidos de la tarde.'],
  ['Cancha Mayapán', 'Sur', 'Calle 2A # 75-12, Mayapán, Cali', 'Fútbol 8', 118000, [S.led, S.alto, S.grad, S.parq, S.duchas], 'Grama de alto tráfico para equipos que juegan fuerte y seguido.'],
  ['Cancha Quintas de Don Simón', 'Sur', 'Cra 100 # 11-80, Cali', 'Fútbol 7', 108000, [S.led, S.techo, S.parq, S.caf, S.wifi], 'Cómoda y moderna, con parqueadero amplio y cafetería.'],
  ['Cancha Refugio Sport', 'Sur', 'Calle 14 # 99-10, El Refugio, Cali', 'Fútbol 5', 84000, [S.led, S.cerrada, S.parq, S.balones], 'Cancha cerrada para jugar sin importar el clima.'],
  ['Cancha Alférez Real', 'Sur', 'Av. Cañasgordas # 125-30, Alférez Real, Cali', 'Fútbol 11', 220000, [S.led, S.grad, S.duchas, S.parq, S.vigil, S.arbitro], 'Cancha reglamentaria en el sur: camerinos con duchas y árbitro.'],
  ['Cancha Nueva Tequendama', 'Sur', 'Cra 52 # 3-18, Cali', 'Fútbol 6', 86000, [S.led, S.vest, S.parq, S.agua], 'Buena opción para los partidos de media semana después del trabajo.'],

  // ---------- Oeste
  ['Cancha San Antonio', 'Oeste', 'Cra 5 # 1-30, San Antonio, Cali', 'Fútbol 5', 88000, [S.led, S.caf, S.balones, S.wifi], 'En el barrio más pintoresco de Cali: juega y termina en una de sus terrazas.'],
  ['Cancha Normandía', 'Oeste', 'Calle 5 # 24-40, Normandía, Cali', 'Fútbol 6', 80000, [S.led, S.vest, S.parq, S.agua], 'Un punto de encuentro del oeste, con buen ambiente de barrio.'],
  ['Cancha Santa Rita', 'Oeste', 'Cra 2 # 2-50, Santa Rita, Cali', 'Fútbol 5', 92000, [S.led, S.parq, S.caf, S.verde], 'Con vista a la ciudad y una brisa que se agradece al final del partido.'],
  ['Cancha Juanambú', 'Oeste', 'Av. 4 Oeste # 3-25, Juanambú, Cali', 'Fútbol 7', 100000, [S.led, S.techo, S.parq, S.duchas], 'Gradería techada y duchas en pleno Juanambú.'],
  ['Cancha Aguacatal', 'Oeste', 'Calle 7 Oeste # 8-15, Aguacatal, Cali', 'Fútbol 8', 105000, [S.led, S.grad, S.parq, S.verde, S.agua], 'Espacio abierto y verde, ideal para equipos grandes.'],
  ['Cancha Arboledas', 'Oeste', 'Cra 3 Oeste # 10-60, Arboledas, Cali', 'Fútbol 6', 78000, [S.led, S.vest, S.parq], 'Una cancha tranquila para jugar en familia o con los compañeros del trabajo.'],
  ['Cancha El Peñón Gol', 'Oeste', 'Av. 2 Oeste # 5-10, El Peñón, Cali', 'Fútbol 5', 95000, [S.led, S.cerrada, S.caf, S.wifi], 'Cerrada y elegante, a un paso de la zona del Peñón.'],
  ['Cancha Terrón Colorado', 'Oeste', 'Cra 1B # 76-20, Terrón Colorado, Cali', 'Fútbol 6', 62000, [S.led, S.parq, S.agua], 'Buen precio y mucho ambiente deportivo en el sector.'],
  ['Cancha Los Cámbulos', 'Oeste', 'Cra 4 Oeste # 14-30, Cali', 'Fútbol 5', 72000, [S.led, S.parq, S.petos], 'Entre árboles de cámbulo: sombra y frescura para jugar de día.'],
  ['Cancha Miraflores', 'Oeste', 'Calle 3 Oeste # 12-45, Miraflores, Cali', 'Fútbol 7', 96000, [S.led, S.vest, S.parq, S.caf], 'Amplia y con cafetería, muy cómoda para las revanchas.'],

  // ---------- Oriente
  ['Cancha Ciudad Córdoba', 'Oriente', 'Cra 50 # 40-10, Ciudad Córdoba, Cali', 'Fútbol 7', 70000, [S.led, S.parq, S.vest, S.alto], 'Una cancha muy movida, con partidos casi todas las noches.'],
  ['Cancha El Retiro', 'Oriente', 'Calle 55 # 31-20, El Retiro, Cali', 'Fútbol 5', 50000, [S.led, S.vest, S.balones], 'La opción más económica para jugar todas las semanas.'],
  ['Cancha Mojica', 'Oriente', 'Cra 26 # 72-15, Mojica, Cali', 'Fútbol 6', 58000, [S.led, S.parq, S.agua], 'Ambiente de barrio y precio justo en Mojica.'],
  ['Cancha Potrero Grande', 'Oriente', 'Calle 100 # 28-40, Potrero Grande, Cali', 'Fútbol 8', 85000, [S.led, S.grad, S.parq, S.alto], 'Amplia y resistente, hecha para los torneos de barrio.'],
  ['Cancha Los Lagos', 'Oriente', 'Cra 44 # 28-30, Cali', 'Fútbol 5', 55000, [S.led, S.parq, S.verde], 'Cerca de zonas verdes y con buen espacio para el equipo.'],
  ['Cancha El Vergel', 'Oriente', 'Calle 48 # 39-12, El Vergel, Cali', 'Fútbol 6', 60000, [S.led, S.vest, S.parq], 'Una cancha concurrida, con buena iluminación para jugar de noche.'],
  ['Cancha Manuela Beltrán', 'Oriente', 'Cra 29 # 80-20, Manuela Beltrán, Cali', 'Fútbol 7', 72000, [S.led, S.grad, S.parq, S.agua], 'Con graderías para que la barra acompañe a su equipo.'],
  ['Cancha Alfonso López', 'Oriente', 'Calle 70 # 1H-30, Alfonso López, Cali', 'Fútbol 5', 52000, [S.led, S.parq, S.balones], 'Precio amable y partidos hasta tarde en la noche.'],
  ['Cancha Marroquín', 'Oriente', 'Cra 32 # 55-60, Marroquín, Cali', 'Fútbol 8', 88000, [S.led, S.alto, S.grad, S.parq, S.vigil], 'Vigilada, amplia y lista para torneos de fin de semana.'],
  ['Cancha Comuneros', 'Oriente', 'Calle 62 # 24-15, Comuneros, Cali', 'Fútbol 6', 58000, [S.led, S.vest, S.agua, S.petos], 'Una cancha social para jugar en grupo sin gastar de más.'],
  ['Cancha Desepaz', 'Oriente', 'Cra 41 # 110-20, Desepaz, Cali', 'Fútbol 7', 66000, [S.led, S.parq, S.alto, S.agua], 'Grama resistente para los equipos que juegan todos los días.'],

  // ---------- Centro
  ['Cancha San Nicolás', 'Centro', 'Cra 6 # 24-30, San Nicolás, Cali', 'Fútbol 5', 68000, [S.led, S.caf, S.balones, S.vest], 'En el centro histórico: un plan diferente en una de las zonas más antiguas de Cali.'],
  ['Cancha Sucre', 'Centro', 'Calle 14 # 10-40, Sucre, Cali', 'Fútbol 5', 62000, [S.led, S.vest, S.balones], 'Práctica y bien ubicada, a pocos minutos del MIO.'],
  ['Cancha Obrero', 'Centro', 'Cra 11 # 20-15, El Obrero, Cali', 'Fútbol 6', 65000, [S.led, S.parq, S.agua], 'Un clásico del centro para los partidos después de la jornada.'],
  ['Cancha Junín', 'Centro', 'Calle 17 # 4-25, Junín, Cali', 'Fútbol 5', 60000, [S.led, S.cerrada, S.petos], 'Cerrada y fácil de encontrar, ideal para los equipos del centro.'],
  ['Cancha San Bosco', 'Centro', 'Cra 9 # 18-10, San Bosco, Cali', 'Fútbol 7', 78000, [S.led, S.grad, S.parq, S.vest], 'Amplia y con graderías, en el corazón del centro.'],
  ['Cancha El Piloto', 'Centro', 'Calle 25 # 15-50, El Piloto, Cali', 'Fútbol 5', 64000, [S.led, S.parq, S.caf], 'Con parqueadero y cafetería, rara combinación en el centro.'],
  ['Cancha Santa Rosa', 'Centro', 'Cra 3 # 12-20, Santa Rosa, Cali', 'Fútbol 6', 70000, [S.led, S.vest, S.agua, S.balones], 'Cerca de todo: fácil de llegar desde cualquier zona de la ciudad.'],
  ['Cancha El Calvario', 'Centro', 'Calle 9 # 8-35, El Calvario, Cali', 'Fútbol 5', 66000, [S.led, S.caf, S.petos], 'Una cancha con historia en uno de los barrios más tradicionales.'],
];

const canchasCali = FILAS.map(([nombre, zona, direccion, tipo, costoHora, servicios, frase], indice) => {
  const cierres = CIERRES[tipo];

  return {
    nombre,
    direccion,
    zona,
    costoHora,
    disponible: true,
    tipo,
    ...FOTOS[indice % FOTOS.length],
    descripcion: `${frase} ${cierres[indice % cierres.length]}`,
    servicios,
  };
});

module.exports = { canchasCali, PATRONES_HORARIO, FOTOS };
