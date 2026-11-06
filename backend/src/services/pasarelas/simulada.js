// Pasarela de pago SIMULADA (US-28). Se comporta como una pasarela real, pero no usa credenciales ni red:
// sirve para desarrollo, pruebas y demostraciones. Contrato que debe cumplir cualquier pasarela:
//   tokenizarTarjeta(tarjeta)   → { token, marca, ultimos4 }
//   cobrar({ token, monto, ... }) → { aprobado, referencia?, motivo? }
//   reembolsar({ referencia })  → { referencia }
//   eliminarToken(token)        → { eliminado }
//
// El token NO contiene el número de la tarjeta; solo un identificador aleatorio y una letra que
// indica cómo se comportará el cobro, según los últimos 4 dígitos de la tarjeta de prueba:
//   ...0002 → rechazada por el banco · ...9995 → fondos insuficientes · cualquier otra → aprobada
const crypto = require('crypto');
const { detectarMarca } = require('../../utils/tarjeta');

const PREFIJO_TOKEN = 'tok_sim_';
const ESCENARIOS = {
  aprobada: { letra: 'a' },
  rechazada: { letra: 'r', motivo: 'La tarjeta fue rechazada por el banco emisor' },
  fondos: { letra: 'f', motivo: 'Fondos insuficientes' },
};
const ESCENARIO_POR_ULTIMOS4 = { '0002': 'rechazada', '9995': 'fondos' };

function aleatorio(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function escenarioDelToken(token) {
  const letra = typeof token === 'string' && token.startsWith(PREFIJO_TOKEN) ? token.slice(-1) : null;
  return Object.values(ESCENARIOS).find((e) => e.letra === letra) ?? null;
}

async function tokenizarTarjeta({ numero }) {
  const ultimos4 = numero.slice(-4);
  const escenario = ESCENARIOS[ESCENARIO_POR_ULTIMOS4[ultimos4] ?? 'aprobada'];

  return {
    token: `${PREFIJO_TOKEN}${aleatorio(12)}_${escenario.letra}`,
    marca: detectarMarca(numero).marca,
    ultimos4,
  };
}

async function cobrar({ token, monto }) {
  const escenario = escenarioDelToken(token);

  if (!escenario) return { aprobado: false, motivo: 'El método de pago no es válido' };
  if (!(monto > 0)) return { aprobado: false, motivo: 'El monto a cobrar no es válido' };
  if (escenario.motivo) return { aprobado: false, motivo: escenario.motivo };

  return { aprobado: true, referencia: `pay_sim_${aleatorio(8)}` };
}

async function reembolsar({ referencia }) {
  if (typeof referencia !== 'string' || !referencia.startsWith('pay_sim_')) {
    throw new Error('Referencia de pago desconocida');
  }

  return { referencia: `ref_sim_${aleatorio(8)}` };
}

async function eliminarToken(token) {
  return { eliminado: Boolean(escenarioDelToken(token)) };
}

module.exports = { tokenizarTarjeta, cobrar, reembolsar, eliminarToken };
