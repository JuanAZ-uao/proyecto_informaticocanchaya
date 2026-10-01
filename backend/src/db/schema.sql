-- CanchaYa - Esquema inicial (Sprint 1)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  correo TEXT NOT NULL UNIQUE,
  telefono TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canchas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  direccion TEXT NOT NULL,
  disponible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE canchas ADD COLUMN IF NOT EXISTS zona TEXT NOT NULL DEFAULT 'Sin zona';
ALTER TABLE canchas ADD COLUMN IF NOT EXISTS costo_hora NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE canchas ADD COLUMN IF NOT EXISTS imagen_url TEXT;
ALTER TABLE canchas ADD COLUMN IF NOT EXISTS imagen_credito TEXT;
ALTER TABLE canchas ADD COLUMN IF NOT EXISTS descripcion TEXT;
ALTER TABLE canchas ADD COLUMN IF NOT EXISTS tipo TEXT;
ALTER TABLE canchas ADD COLUMN IF NOT EXISTS servicios TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS horarios_disponibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cancha_id UUID NOT NULL REFERENCES canchas(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_horarios_disponibles_cancha_id ON horarios_disponibles (cancha_id);

CREATE TABLE IF NOT EXISTS reservas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cancha_id UUID NOT NULL REFERENCES canchas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservas_cancha_fecha ON reservas (cancha_id, fecha);

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'confirmada';

-- US-11: toda reserva creada queda "confirmada". Las reservas guardadas antes con el
-- estado 'activa' (US-08/US-09) equivalen a confirmadas y se migran.
ALTER TABLE reservas ALTER COLUMN estado SET DEFAULT 'confirmada';
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS chk_reservas_estado;
UPDATE reservas SET estado = 'confirmada' WHERE estado = 'activa';
ALTER TABLE reservas ADD CONSTRAINT chk_reservas_estado CHECK (estado IN ('confirmada', 'cancelada'));

-- Antes de exigir unicidad solo entre reservas vigentes, se elimina la restricción
-- única "a secas" (bloqueaba reutilizar la franja incluso después de cancelar).
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS uq_reservas_cancha_fecha_hora;
DROP INDEX IF EXISTS uq_reservas_activa_cancha_fecha_hora;

-- Restricción real a nivel de base de datos: nunca puede haber dos reservas
-- confirmadas para la misma cancha/fecha/hora, sin importar la concurrencia.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservas_confirmada_cancha_fecha_hora
  ON reservas (cancha_id, fecha, hora_inicio)
  WHERE estado = 'confirmada';

CREATE INDEX IF NOT EXISTS idx_reservas_usuario_fecha ON reservas (usuario_id, fecha DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_usuario_id ON password_reset_tokens (usuario_id);

-- US-18: sesiones del temporizador (US-17) persistidas para sobrevivir a un reinicio
-- del servidor. Una sesión por usuario y cancha.
CREATE TABLE IF NOT EXISTS sesiones_reserva (
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cancha_id UUID NOT NULL REFERENCES canchas(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'completado')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, cancha_id)
);

-- US-18: retención temporal de una franja mientras el usuario completa su reserva.
-- uq_retenciones_franja: una franja solo puede estar retenida por un usuario a la vez.
-- uq_retenciones_usuario_cancha: un usuario retiene como máximo una franja por cancha.
CREATE TABLE IF NOT EXISTS retenciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cancha_id UUID NOT NULL REFERENCES canchas(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_retenciones_franja UNIQUE (cancha_id, fecha, hora_inicio),
  CONSTRAINT uq_retenciones_usuario_cancha UNIQUE (usuario_id, cancha_id)
);

CREATE INDEX IF NOT EXISTS idx_retenciones_expires_at ON retenciones (expires_at);
