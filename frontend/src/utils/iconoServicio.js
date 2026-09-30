const REGLAS = [
  [['ilumin', 'luz'], 'bombillo'],
  [['parque'], 'carro'],
  [['vestier', 'ducha'], 'camiseta'],
  [['cafe'], 'cafe'],
  [['grader'], 'personas'],
  [['wi-fi', 'wifi'], 'wifi'],
  [['hidrat'], 'gota'],
  [['balon', 'peto'], 'balon'],
  [['verde'], 'hoja'],
  [['cerrada', 'vigil'], 'escudo'],
  [['grama'], 'estrella'],
];

function normalizar(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export default function iconoServicio(servicio) {
  const texto = normalizar(servicio);
  const regla = REGLAS.find(([claves]) => claves.some((clave) => texto.includes(clave)));
  return regla ? regla[1] : 'check';
}
