const { body, param } = require('express-validator');

// US-15: validaciones de los datos de una cancha y de sus horarios de atención.
const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIPOS = ['Fútbol 5', 'Fútbol 6', 'Fútbol 7', 'Fútbol 8', 'Fútbol 11'];

const idCanchaValidator = param('id').isUUID().withMessage('El id de la cancha no es válido');

// Cada horario es { diaSemana: 0-6 (0 = domingo), horaInicio: 'HH:mm', horaFin: 'HH:mm' }; un solo horario por día.
function validarHorarios(horarios) {
  if (!Array.isArray(horarios) || horarios.length === 0) {
    throw new Error('Define al menos un horario de atención');
  }

  const dias = new Set();
  for (const [indice, horario] of horarios.entries()) {
    const etiqueta = `Horario ${indice + 1}`;

    if (!Number.isInteger(horario?.diaSemana) || horario.diaSemana < 0 || horario.diaSemana > 6) {
      throw new Error(`${etiqueta}: el día debe ser un número de 0 (domingo) a 6 (sábado)`);
    }
    if (dias.has(horario.diaSemana)) {
      throw new Error(`${etiqueta}: el día ${horario.diaSemana} está repetido`);
    }
    dias.add(horario.diaSemana);

    if (!HORA_REGEX.test(horario.horaInicio ?? '') || !HORA_REGEX.test(horario.horaFin ?? '')) {
      throw new Error(`${etiqueta}: las horas de apertura y cierre deben tener el formato HH:mm`);
    }
    if (horario.horaFin <= horario.horaInicio) {
      throw new Error(`${etiqueta}: la hora de cierre debe ser posterior a la de apertura`);
    }
  }

  return true;
}

const datosCanchaValidators = [
  body('nombre')
    .isString()
    .withMessage('El nombre es obligatorio')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('El nombre es obligatorio')
    .bail()
    .isLength({ max: 120 })
    .withMessage('El nombre no puede superar los 120 caracteres'),
  body('direccion')
    .isString()
    .withMessage('La dirección es obligatoria')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('La dirección es obligatoria')
    .bail()
    .isLength({ max: 200 })
    .withMessage('La dirección no puede superar los 200 caracteres'),
  body('zona')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('La zona no es válida')
    .bail()
    .trim()
    .isLength({ max: 60 })
    .withMessage('La zona no puede superar los 60 caracteres'),
  body('costoHora')
    .exists({ values: 'null' })
    .withMessage('El precio por hora es obligatorio')
    .bail()
    .isFloat({ gt: 0, max: 100000000 })
    .withMessage('El precio por hora debe ser un número mayor que 0')
    .bail()
    .toFloat(),
  body('tipo').optional({ values: 'falsy' }).isIn(TIPOS).withMessage(`El tipo debe ser uno de: ${TIPOS.join(', ')}`),
  body('descripcion')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('La descripción no es válida')
    .bail()
    .isLength({ max: 1000 })
    .withMessage('La descripción no puede superar los 1000 caracteres'),
  body('servicios')
    .optional()
    .isArray({ max: 20 })
    .withMessage('Los servicios deben ser una lista de hasta 20 elementos')
    .bail()
    .custom((servicios) => servicios.every((servicio) => typeof servicio === 'string' && servicio.trim() && servicio.length <= 60))
    .withMessage('Cada servicio debe ser un texto de hasta 60 caracteres'),
  body('horarios').custom(validarHorarios),
];

const crearCanchaValidators = datosCanchaValidators;
const editarCanchaValidators = [idCanchaValidator, ...datosCanchaValidators];
const obtenerCanchaAdminValidators = [idCanchaValidator];
const desactivarCanchaValidators = [
  idCanchaValidator,
  body('confirmar').optional().isBoolean().withMessage('confirmar debe ser verdadero o falso').toBoolean(),
];
const activarCanchaValidators = [idCanchaValidator];

module.exports = {
  TIPOS,
  crearCanchaValidators,
  editarCanchaValidators,
  obtenerCanchaAdminValidators,
  desactivarCanchaValidators,
  activarCanchaValidators,
};
