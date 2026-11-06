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

async function actualizarPerfil(usuarioId, { nombre, telefono }) {
  const { rows } = await pool.query(
    `UPDATE usuarios
     SET nombre = $1, telefono = $2, updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [nombre, telefono, usuarioId]
  );

  return Usuario.aDominio(rows[0]);
}

async function actualizarCorreo(usuarioId, correo) {
  const { rows } = await pool.query(
    `UPDATE usuarios
     SET correo = $1, updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [correo.toLowerCase().trim(), usuarioId]
  );

  return Usuario.aDominio(rows[0]);
}

async function asignarRol(usuarioId, rol) {
  const { rows } = await pool.query(
    `UPDATE usuarios
     SET rol = $1, updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [rol, usuarioId]
  );

  return Usuario.aDominio(rows[0]);
}

module.exports = {
  crear,
  asignarRol,
  buscarPorCorreo,
  buscarPorId,
  actualizarPassword,
  actualizarPerfil,
  actualizarCorreo,
};
