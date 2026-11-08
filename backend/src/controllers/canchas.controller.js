import { Cancha, Reserva } from '../models/index.js'; // Ajusta la ruta a tus modelos Sequelize/Prisma/PG
import { Op } from 'sequelize';

// Función de validación de campos y rangos
const validarDatosCancha = (body) => {
  const errores = [];
  const { nombre, direccion, hora_apertura, hora_cierre, precio_hora } = body;

  if (!nombre || nombre.trim() === '') errores.push('El nombre de la cancha es obligatorio.');
  if (!direccion || direccion.trim() === '') errores.push('La dirección es obligatoria.');
  
  const precio = Number(precio_hora);
  if (isNaN(precio) || precio <= 0) {
    errores.push('El precio por hora debe ser un valor numérico mayor a 0.');
  }

  if (!hora_apertura || !hora_cierre) {
    errores.push('Las horas de apertura y cierre son obligatorias.');
  } else if (hora_cierre <= hora_apertura) {
    errores.push('La hora de cierre debe ser posterior a la hora de apertura.');
  }

  return errores;
};

// 1. Crear Cancha (Admin)
export const crearCancha = async (req, res) => {
  try {
    const errores = validarDatosCancha(req.body);
    if (errores.length > 0) return res.status(400).json({ errores });

    const nuevaCancha = await Cancha.create({
      ...req.body,
      activa: true
    });

    return res.status(201).json(nuevaCancha);
  } catch (error) {
    return res.status(500).json({ error: 'Error al crear la cancha: ' + error.message });
  }
};

// 2. Editar Cancha (Admin)
export const editarCancha = async (req, res) => {
  try {
    const { id } = req.params;
    const errores = validarDatosCancha(req.body);
    if (errores.length > 0) return res.status(400).json({ errores });

    const cancha = await Cancha.findByPk(id);
    if (!cancha) return res.status(404).json({ error: 'Cancha no encontrada.' });

    // Actualiza los datos de la cancha sin modificar las reservas preexistentes
    await cancha.update(req.body);

    return res.status(200).json(cancha);
  } catch (error) {
    return res.status(500).json({ error: 'Error al actualizar la cancha: ' + error.message });
  }
};

// 3. Desactivar Cancha (Admin con Advertencia de Reservas Futuras)
export const desactivarCancha = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmacion_explicita } = req.body;

    const cancha = await Cancha.findByPk(id);
    if (!cancha) return res.status(404).json({ error: 'Cancha no encontrada.' });

    // Buscar reservas futuras activas
    const reservasFuturas = await Reserva.findAll({
      where: {
        cancha_id: id,
        estado: 'CONFIRMADA',
        fecha: { [Op.gte]: new Date() }
      }
    });

    // Si existen reservas futuras y el admin aún no ha confirmado explícitamente
    if (reservasFuturas.length > 0 && !confirmacion_explicita) {
      return res.status(409).json({
        requiere_confirmacion: true,
        total_reservas: reservasFuturas.length,
        mensaje: `La cancha tiene ${reservasFuturas.length} reserva(s) futura(s) confirmada(s). ¿Desea desactivarla de todos modos?`,
        reservas: reservasFuturas
      });
    }

    // Desactivación lógica (Soft Delete)
    cancha.activa = false;
    await cancha.save();

    return res.status(200).json({ 
      mensaje: 'Cancha desactivada exitosamente.', 
      cancha 
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al desactivar la cancha: ' + error.message });
  }
};

// 4. Catálogo Público (Solo Canchas Activas)
export const listarCanchasPublicas = async (req, res) => {
  try {
    const canchas = await Cancha.findAll({ where: { activa: true } });
    return res.status(200).json(canchas);
  } catch (error) {
    return res.status(500).json({ error: 'Error al obtener el catálogo: ' + error.message });
  }
};
