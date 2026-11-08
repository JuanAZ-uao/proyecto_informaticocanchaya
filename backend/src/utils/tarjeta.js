// Validación de tarjetas (US-28). Funciones puras: no guardan ni registran el número ni el CVV,
// y los mensajes de error nunca repiten los datos ingresados.
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;
const ANIOS_MAXIMOS_DE_VIGENCIA = 20;

// Solo dígitos: se aceptan espacios y guiones como separadores (4242 4242 4242 4242).
function normalizarNumero(texto) {
  return String(texto ?? '').replace(/[\s-]/g, '');
}

// Algoritmo de Luhn: suma de los dígitos duplicando uno de cada dos desde la derecha.
function pasaLuhn(numero) {
  if (!/^\d+$/.test(numero)) return false;

  let suma = 0;
  let duplicar = false;

  for (let i = numero.length - 1; i >= 0; i -= 1) {
    let digito = Number(numero[i]);
    if (duplicar) {
      digito *= 2;
      if (digito > 9) digito -= 9;
    }
    suma += digito;
    duplicar = !duplicar;
  }

  return suma % 10 === 0;
}

const MARCAS = [
  { marca: 'American Express', patron: /^3[47]\d{13}$/, cvv: 4 },
  { marca: 'Visa', patron: /^4\d{12}(\d{3}(\d{3})?)?$/, cvv: 3 },
  { marca: 'Mastercard', patron: /^(5[1-5]\d{14}|2(2[2-9]\d|[3-6]\d{2}|7[01]\d|720)\d{12})$/, cvv: 3 },
  { marca: 'Diners Club', patron: /^3(0[0-5]|[68]\d)\d{11,12}$/, cvv: 3 },
  { marca: 'Discover', patron: /^(6011\d{12}|65\d{14})$/, cvv: 3 },
];

function detectarMarca(numero) {
  return MARCAS.find((m) => m.patron.test(numero)) ?? null;
}

function anioCompleto(anio) {
  const valor = Number(anio);
  return Number.isInteger(valor) && valor >= 0 && valor < 100 ? 2000 + valor : valor;
}

function mesYAnioActuales(ahora) {
  const hoy = new Date(ahora - DESFASE_COLOMBIA_MS);
  return { mes: hoy.getUTCMonth() + 1, anio: hoy.getUTCFullYear() };
}

// La tarjeta vale hasta el último día de su mes de vencimiento (hora de Colombia).
function estaVencida(mes, anio, ahora = Date.now()) {
  const actual = mesYAnioActuales(ahora);
  return anio * 12 + mes < actual.anio * 12 + actual.mes;
}

/**
 * Valida los datos de una tarjeta. Devuelve { errores, datos }:
 *  - errores: lista de { campo, mensaje } (vacía si todo está bien).
 *  - datos: número normalizado, marca, últimos 4, titular y vencimiento, solo si no hay errores.
 */
function validarTarjeta({ numero, titular, vencimientoMes, vencimientoAnio, cvv }, ahora = Date.now()) {
  const errores = [];
  const limpio = normalizarNumero(numero);
  const marca = detectarMarca(limpio);

  if (!/^\d{12,19}$/.test(limpio) || !pasaLuhn(limpio) || !marca) {
    errores.push({ campo: 'numero', mensaje: 'El número de tarjeta no es válido' });
  }

  const nombre = String(titular ?? '').trim();
  if (nombre.length < 2 || nombre.length > 60) {
    errores.push({ campo: 'titular', mensaje: 'El nombre del titular es obligatorio (entre 2 y 60 caracteres)' });
  }

  const mes = Number(vencimientoMes);
  const anio = anioCompleto(vencimientoAnio);
  const { anio: anioActual } = mesYAnioActuales(ahora);

  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    errores.push({ campo: 'vencimientoMes', mensaje: 'El mes de vencimiento debe estar entre 1 y 12' });
  } else if (!Number.isInteger(anio) || anio < 2000 || anio > anioActual + ANIOS_MAXIMOS_DE_VIGENCIA) {
    errores.push({ campo: 'vencimientoAnio', mensaje: 'El año de vencimiento no es válido' });
  } else if (estaVencida(mes, anio, ahora)) {
    errores.push({ campo: 'vencimientoAnio', mensaje: 'La tarjeta está vencida' });
  }

  const codigo = String(cvv ?? '');
  const largoEsperado = marca?.cvv;
  const cvvValido = /^\d{3,4}$/.test(codigo) && (largoEsperado ? codigo.length === largoEsperado : true);
  if (!cvvValido) {
    errores.push({ campo: 'cvv', mensaje: 'El código de seguridad (CVV) no es válido' });
  }

  if (errores.length) return { errores, datos: null };

  return {
    errores,
    datos: {
      numero: limpio,
      marca: marca.marca,
      ultimos4: limpio.slice(-4),
      titular: nombre,
      vencimientoMes: mes,
      vencimientoAnio: anio,
    },
  };
}

module.exports = { normalizarNumero, pasaLuhn, detectarMarca, estaVencida, validarTarjeta };
