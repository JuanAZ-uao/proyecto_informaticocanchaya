const PasswordResetToken = require('../models/PasswordResetToken');

async function crear({ usuario, tokenHash, expiresAt }) {
  return PasswordResetToken.create({ usuario, tokenHash, expiresAt });
}

async function buscarValidoPorHash(tokenHash) {
  return PasswordResetToken.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
}

async function marcarUsado(id) {
  return PasswordResetToken.findByIdAndUpdate(id, { usedAt: new Date() });
}

async function invalidarPendientesDeUsuario(usuarioId) {
  return PasswordResetToken.updateMany(
    { usuario: usuarioId, usedAt: null },
    { usedAt: new Date() }
  );
}

module.exports = {
  crear,
  buscarValidoPorHash,
  marcarUsado,
  invalidarPendientesDeUsuario,
};
