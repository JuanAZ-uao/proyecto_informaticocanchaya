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
-- 'cancelada_administrativamente' ya existe en la base compartida (cancelaciones hechas por un administrador): se conserva para no invalidar esas filas.
ALTER TABLE reservas ALTER COLUMN estado SET DEFAULT 'confirmada';
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS chk_reservas_estado;
UPDATE reservas SET estado = 'confirmada' WHERE estado = 'activa';
-- US-16: 'cancelada_administrativamente' es la cancelación hecha por un administrador.
ALTER TABLE reservas ADD CONSTRAINT chk_reservas_estado CHECK (estado IN ('confirmada', 'cancelada', 'cancelada_administrativamente'));

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

-- US-09: además del índice único por hora de inicio, ninguna reserva confirmada puede solaparse
-- con otra de la misma cancha (defensa en profundidad frente a franjas que no sean de 1 hora).
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ex_reservas_sin_solape') THEN
    ALTER TABLE reservas ADD CONSTRAINT ex_reservas_sin_solape
      EXCLUDE USING gist (cancha_id WITH =, tsrange((fecha + hora_inicio), (fecha + hora_fin)) WITH &&)
      WHERE (estado = 'confirmada');
  END IF;
END $$;

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

-- US-27: cambio de correo con verificación. El cambio solo se aplica cuando el dueño del nuevo
-- correo abre el enlace; se guarda el hash del token, nunca el token.
CREATE TABLE IF NOT EXISTS cambios_correo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nuevo_correo TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cambios_correo_token_hash ON cambios_correo (token_hash);
CREATE INDEX IF NOT EXISTS idx_cambios_correo_usuario_id ON cambios_correo (usuario_id);

-- US-28: métodos de pago. NUNCA se guarda el número completo ni el CVV: solo el token que entrega la
-- pasarela, la marca y los últimos 4 dígitos (más el titular y el vencimiento, para mostrarlos).
CREATE TABLE IF NOT EXISTS metodos_pago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  marca TEXT NOT NULL,
  ultimos4 CHAR(4) NOT NULL,
  titular TEXT NOT NULL,
  vencimiento_mes SMALLINT NOT NULL CHECK (vencimiento_mes BETWEEN 1 AND 12),
  vencimiento_anio SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metodos_pago_usuario_id ON metodos_pago (usuario_id);

-- US-28 / US-14: pago de una reserva. Se conserva la marca y los últimos 4 aunque el usuario elimine la
-- tarjeta (las reservas ya pagadas no se ven afectadas). Un pago rechazado no deja rastro aquí porque la
-- reserva no se confirma.
CREATE TABLE IF NOT EXISTS pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id UUID NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  metodo_pago_id UUID REFERENCES metodos_pago(id) ON DELETE SET NULL,
  marca TEXT NOT NULL,
  ultimos4 CHAR(4) NOT NULL,
  monto NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  moneda TEXT NOT NULL DEFAULT 'COP',
  estado TEXT NOT NULL DEFAULT 'aprobado' CHECK (estado IN ('aprobado', 'reembolsado')),
  referencia TEXT NOT NULL,
  reembolso_referencia TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reembolsado_at TIMESTAMPTZ,
  CONSTRAINT uq_pagos_reserva UNIQUE (reserva_id)
);

CREATE INDEX IF NOT EXISTS idx_pagos_usuario_id ON pagos (usuario_id);

-- US-29: roles. Todo usuario nuevo es "usuario"; un administrador se crea o se promueve con
-- `npm run crear:admin` (nunca desde el registro público).
-- US-16: rol del usuario. Solo un administrador puede cancelar reservas ajenas.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'usuario';
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_usuarios_rol;
ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_rol CHECK (rol IN ('usuario', 'administrador'));

-- US-29: el código de reserva (CY-XXXXXXXX) pasa a ser una columna calculada a partir del id, y única.
-- Es exactamente el mismo valor que ya se mostraba al usuario, ahora garantizado por la base de datos.
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS codigo TEXT
  GENERATED ALWAYS AS ('CY-' || upper(substr(replace(id::text, '-', ''), 1, 8))) STORED;

-- Si existieran dos reservas antiguas con el mismo código (probabilidad ínfima) no se rompe la migración:
-- se avisa y el índice único no se crea hasta resolverlo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_reservas_codigo') THEN
    IF EXISTS (SELECT 1 FROM reservas GROUP BY codigo HAVING COUNT(*) > 1) THEN
      RAISE WARNING 'Hay códigos de reserva duplicados: no se creó el índice único uq_reservas_codigo';
    ELSE
      CREATE UNIQUE INDEX uq_reservas_codigo ON reservas (codigo);
    END IF;
  END IF;
END $$;

-- US-29: una reserva vigente que el administrador marca como utilizada ya no puede validarse de nuevo.
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS usada_at TIMESTAMPTZ;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS usada_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- US-29: auditoría. Cada verificación (y cada "marcar como utilizada") deja registro de quién, qué código,
-- con qué resultado y cuándo. El código se guarda tal como lo escribió el administrador (acotado).
CREATE TABLE IF NOT EXISTS verificaciones_reserva (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  administrador_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  codigo TEXT NOT NULL,
  resultado TEXT NOT NULL CHECK (resultado IN ('vigente', 'vencida', 'cancelada', 'usada', 'no_encontrado', 'marcada_usada')),
  reserva_id UUID REFERENCES reservas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verificaciones_reserva_created_at ON verificaciones_reserva (created_at DESC);
-- US-16: auditoría de las cancelaciones administrativas (quién, cuándo y por qué).
-- Sin ON DELETE CASCADE sobre el administrador: el registro de auditoría debe conservarse.
CREATE TABLE IF NOT EXISTS cancelaciones_administrativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id UUID NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  administrador_id UUID NOT NULL REFERENCES usuarios(id),
  motivo TEXT NOT NULL CHECK (length(btrim(motivo)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cancelaciones_admin_reserva ON cancelaciones_administrativas (reserva_id);
