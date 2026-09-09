const Cancha = require('../models/Cancha');

async function listarDisponibles() {
  return Cancha.find({ disponible: true }).sort({ nombre: 1 });
}

async function crearMuchas(canchas) {
  return Cancha.insertMany(canchas);
}

async function contar() {
  return Cancha.countDocuments();
}

module.exports = {
  listarDisponibles,
  crearMuchas,
  contar,
};
