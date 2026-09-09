const TABLA = 'password_reset_tokens';

function aDominio(fila) {
  if (!fila) return null;

  return {
    id: fila.id,
    usuarioId: fila.usuario_id,
    tokenHash: fila.token_hash,
    expiresAt: fila.expires_at,
    usedAt: fila.used_at,
    createdAt: fila.created_at,
  };
}

module.exports = { TABLA, aDominio };
