class ErrorDeAplicacion extends Error {
  // codigo: identificador estable para clientes que no leen el status HTTP (p. ej. eventos de socket).
  constructor(mensaje, statusCode = 400, codigo = undefined) {
    super(mensaje);
    this.statusCode = statusCode;
    this.codigo = codigo;
  }
}

module.exports = ErrorDeAplicacion;
