const crypto = require('crypto');

function generarTokenPlano() {
  return crypto.randomBytes(32).toString('hex');
}

function hashearToken(tokenPlano) {
  return crypto.createHash('sha256').update(tokenPlano).digest('hex');
}

module.exports = { generarTokenPlano, hashearToken };
