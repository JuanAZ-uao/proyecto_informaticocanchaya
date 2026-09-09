const pool = require('../config/db');
const Usuario = require('../models/Usuario');

async function crear({ nombre, correo, telefono, passwordHash }) {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, correo, telefono, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [nombre, correo.toLowerCase().trim(), telefono, passwordHash]
  );

  return Usuario.aDominio(rows[0]);
}

async function buscarPorCorreo(correo) {
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE correo = $1', [
    correo.toLowerCase().trim(),
  ]);

  return Usuario.aDominio(rows[0]);
}

async function buscarPorId(id) {
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
  return Usuario.aDominio(rows[0]);
}

async function actualizarPassword(usuarioId, passwordHash) {
  const { rows } = await pool.query(
    `UPDATE usuarios
     SET password_hash = $1, updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [passwordHash, usuarioId]
  );

  return Usuario.aDominio(rows[0]);
}

module.exports = {
  crear,
  buscarPorCorreo,
  buscarPorId,
  actualizarPassword,
};
