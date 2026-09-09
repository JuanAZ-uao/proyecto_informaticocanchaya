const Usuario = require('../models/Usuario');

async function crear(datosUsuario) {
  return Usuario.create(datosUsuario);
}

async function buscarPorCorreo(correo) {
  return Usuario.findOne({ correo: correo.toLowerCase().trim() });
}

async function buscarPorId(id) {
  return Usuario.findById(id);
}

async function actualizarPassword(usuarioId, passwordHash) {
  return Usuario.findByIdAndUpdate(usuarioId, { passwordHash }, { new: true });
}

module.exports = {
  crear,
  buscarPorCorreo,
  buscarPorId,
  actualizarPassword,
};
