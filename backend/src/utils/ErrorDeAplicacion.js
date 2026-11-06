class ErrorDeAplicacion extends Error {
  // codigo: identificador estable para clientes que no leen el status HTTP (p. ej. eventos de socket).
  // errores: lista opcional de { campo, mensaje } para respuestas de validación por campo.
  constructor(mensaje, statusCode = 400, codigo = undefined, errores = undefined) {
    super(mensaje);
    this.statusCode = statusCode;
    this.codigo = codigo;
    this.errores = errores;
  }
}

module.exports = ErrorDeAplicacion;
