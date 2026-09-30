// Fotos: Wikimedia Commons, con licencias libres. El crédito se muestra en la ficha de cada cancha.
const catalogoCanchas = [
  {
    nombre: 'Cancha Los Cerros',
    direccion: 'Cra 15 # 45-20, Cali',
    zona: 'Norte',
    costoHora: 80000,
    disponible: true,
    tipo: 'Fútbol 7',
    imagenUrl: '/img/canchas/los-cerros.jpg',
    imagenCredito: 'Foto: Luisbaleta15 · CC BY-SA 4.0 · Wikimedia Commons',
    descripcion:
      'Juega con los cerros de Cali de fondo. Grama sintética de alto rendimiento, gradería techada para tu hinchada y reflectores que convierten cada partido nocturno en una final.',
    servicios: ['Iluminación LED', 'Gradería techada', 'Parqueadero', 'Vestieres', 'Punto de hidratación'],
  },
  {
    nombre: 'Cancha El Bosque',
    direccion: 'Av. Roosevelt # 30-10, Cali',
    zona: 'Oeste',
    costoHora: 70000,
    disponible: true,
    tipo: 'Fútbol 5',
    imagenUrl: '/img/canchas/el-bosque.jpg',
    imagenCredito: 'Foto: Reptonix · CC BY 3.0 · Wikimedia Commons',
    descripcion:
      'Cancha cerrada rodeada de árboles: el balón nunca se va y el partido nunca se detiene. Ideal para el fútbol 5 de la oficina o el picadito de los viernes.',
    servicios: ['Cancha cerrada', 'Iluminación LED', 'Parqueadero', 'Zona verde', 'Préstamo de petos'],
  },
  {
    nombre: 'Cancha La Rivera',
    direccion: 'Cra 8 # 12-50, Cali',
    zona: 'Centro',
    costoHora: 65000,
    disponible: true,
    tipo: 'Fútbol 5',
    imagenUrl: '/img/canchas/la-rivera.jpg',
    imagenCredito: 'Foto: Jimmy Gómez N · CC BY-SA 3.0 · Wikimedia Commons',
    descripcion:
      'En el corazón de Cali y al mejor precio. Grama sintética bien demarcada, malla perimetral completa y todo lo que necesitas para armar el partido sin complicaciones.',
    servicios: ['Iluminación nocturna', 'Vestieres', 'Cafetería', 'Préstamo de balones'],
  },
  {
    nombre: 'Cancha Santa Mónica',
    direccion: 'Calle 5 # 38-60, Cali',
    zona: 'Sur',
    costoHora: 90000,
    disponible: true,
    tipo: 'Fútbol 6',
    imagenUrl: '/img/canchas/santa-monica.jpg',
    imagenCredito: 'Foto: Nguyendinh Deptrai · CC0 · Wikimedia Commons',
    descripcion:
      'Nuestra cancha premium. Iluminación LED profesional, grama de última generación y vestieres con duchas: la experiencia más completa para los que se toman el partido en serio.',
    servicios: [
      'Iluminación LED profesional',
      'Grama de última generación',
      'Parqueadero vigilado',
      'Vestieres con duchas',
      'Cafetería',
      'Wi-Fi',
    ],
  },
  {
    nombre: 'Cancha San Fernando',
    direccion: 'Cra 24 # 3-15, Cali',
    zona: 'Sur',
    costoHora: 75000,
    disponible: true,
    tipo: 'Fútbol 8',
    imagenUrl: '/img/canchas/san-fernando.jpg',
    imagenCredito: 'Foto: SageData · CC BY-SA 4.0 · Wikimedia Commons',
    descripcion:
      'Espacio de sobra para equipos grandes. Grama sintética rayada de alto tráfico, amplias bandas laterales y un ambiente perfecto para torneos y partidos de fin de semana.',
    servicios: ['Grama de alto tráfico', 'Graderías', 'Parqueadero', 'Vestieres', 'Punto de hidratación'],
  },
];

module.exports = catalogoCanchas;
