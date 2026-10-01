module.exports = {
  obtener: jest.fn().mockResolvedValue(null),
  guardar: jest.fn().mockResolvedValue(null),
  actualizarEstado: jest.fn().mockResolvedValue(undefined),
  eliminar: jest.fn().mockResolvedValue(undefined),
  listarActivasVigentes: jest.fn().mockResolvedValue([]),
  eliminarVencidas: jest.fn().mockResolvedValue(undefined),
};
