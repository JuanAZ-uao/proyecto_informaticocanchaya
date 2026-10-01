module.exports = {
  retener: jest.fn(),
  liberarDeUsuario: jest.fn().mockResolvedValue(null),
  obtenerVigentePorFranja: jest.fn().mockResolvedValue(null),
  listarVigentesPorCanchaYFecha: jest.fn().mockResolvedValue([]),
  extenderDeUsuario: jest.fn().mockResolvedValue(undefined),
  eliminarVencidas: jest.fn().mockResolvedValue([]),
};
