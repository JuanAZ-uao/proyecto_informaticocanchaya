// Prueba de carga básica de reservas (US-26): N usuarios concurrentes reservando contra un despliegue real.
//   Fase 1 — todos compiten por LA MISMA franja: debe haber exactamente 1 reserva (201) y N-1 rechazos (409).
//   Fase 2 — cada usuario reserva SU propia franja a la vez: deben crearse las N, sin ningún error 5xx.
//   Fase 3 — se consulta la disponibilidad: cada franja ocupada aparece una sola vez (sin duplicados).
//   Limpieza — se cancelan todas las reservas creadas.
//
// Uso (respeta los límites del plan: por defecto 30 usuarios, en lotes de 10 para el registro):
//   API_URL=https://api.ejemplo.com/api USUARIOS=30 npm run test:carga-reservas
//   EVIDENCIA_ARCHIVO=../docs/evidencias-despliegue/carga-produccion.md  (opcional)
// Sale con código 1 si alguna verificación falla. Crea cuentas "carga.<fecha>.<n>@canchaya-humo.test".
const fs = require('fs');
const path = require('path');
const { franjaDeUnaHora, elegirCancha } = require('./franjasDeCancha');

function leerUrlApi(valor) {
  if (!valor) throw new Error('Define API_URL (por ejemplo https://api.ejemplo.com/api)');
  const url = new URL(valor);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API_URL debe usar http o https');
  return url.href.replace(/\/$/, '');
}

const API = leerUrlApi(process.env.API_URL);
const USUARIOS = Math.max(2, Number(process.env.USUARIOS || 30));
const LOTE_REGISTRO = 10;
const PASSWORD = 'Carga12345!';
const resultados = [];
const latencias = [];

function verificar(nombre, condicion, detalle = '') {
  resultados.push({ nombre, ok: Boolean(condicion), detalle });
  console.log(`${condicion ? '[OK]   ' : '[FALLO]'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

async function llamar(metodo, ruta, cuerpo, token) {
  const inicio = Date.now();
  const respuesta = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  latencias.push(Date.now() - inicio);
  const datos = await respuesta.json().catch(() => ({}));
  return { status: respuesta.status, datos };
}

async function crearUsuario(prefijo, indice) {
  const correo = `${prefijo}.${indice}@canchaya-humo.test`;
  await llamar('POST', '/auth/registro', { nombre: `Carga ${indice}`, correo, telefono: '3000000000', password: PASSWORD });
  const { datos } = await llamar('POST', '/auth/login', { correo, password: PASSWORD });
  if (!datos.token) throw new Error(`No se pudo iniciar sesión con ${correo}`);
  return datos.token;
}

async function crearUsuarios(cantidad) {
  const prefijo = `carga.${Date.now()}`;
  const tokens = [];
  for (let inicio = 0; inicio < cantidad; inicio += LOTE_REGISTRO) {
    const lote = Array.from({ length: Math.min(LOTE_REGISTRO, cantidad - inicio) }, (_, i) => crearUsuario(prefijo, inicio + i));
    tokens.push(...(await Promise.all(lote)));
  }
  return tokens;
}

const fechaDia = (base, desplazamiento) => new Date(Date.UTC(2095, 0, 1) + (base + desplazamiento) * 86400000).toISOString().slice(0, 10);

function percentil(valores, p) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length))] ?? 0;
}

function guardarEvidencia(duracionMs) {
  const ruta = process.env.EVIDENCIA_ARCHIVO;
  if (!ruta) return;
  const fallas = resultados.filter((r) => !r.ok).length;
  const filas = resultados.map((r) => `| ${r.ok ? 'Aprobada' : '**FALLÓ**'} | ${r.nombre} | ${r.detalle.replace(/\|/g, '/')} |`).join('\n');
  const texto = `# Prueba de carga básica de reservas

- **Fecha:** ${new Date().toISOString()}
- **API:** ${API}
- **Usuarios concurrentes:** ${USUARIOS}
- **Peticiones HTTP:** ${latencias.length} · latencia p50 ${percentil(latencias, 50)} ms · p95 ${percentil(latencias, 95)} ms · máxima ${Math.max(...latencias)} ms
- **Duración total:** ${(duracionMs / 1000).toFixed(1)} s
- **Resultado:** ${resultados.length - fallas}/${resultados.length} verificaciones aprobadas

| Resultado | Verificación | Detalle |
| --- | --- | --- |
${filas}
`;
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, texto);
  console.log(`Evidencia guardada en ${ruta}`);
}

async function principal() {
  const inicio = Date.now();
  console.log(`Prueba de carga de reservas contra ${API} con ${USUARIOS} usuarios\n`);

  const tokens = await crearUsuarios(USUARIOS);
  verificar(`${USUARIOS} usuarios registrados e iniciaron sesión`, tokens.length === USUARIOS);

  const lista = await llamar('GET', '/canchas', null, tokens[0]);
  // Se necesita una cancha que atienda los 7 días de la semana: las franjas de la prueba caen en fechas distintas y,
  // en producción, cada cancha tiene su propio horario.
  const elegida = await elegirCancha(llamar, tokens[0], lista.datos.canchas ?? [], (horarios) => new Set(horarios.map((h) => h.diaSemana)).size === 7);
  const cancha = elegida?.cancha;
  if (!cancha) throw new Error('No hay una cancha con horario de atención los 7 días (¿falta el catálogo inicial? npm run seed:inicial)');

  const base = Math.floor(Math.random() * 3000);
  const creadas = [];

  // Fase 1: todos por la misma franja
  const franjaCompartida = franjaDeUnaHora(elegida.horarios, fechaDia(base, 0));
  const compitiendo = await Promise.all(tokens.map((token) => llamar('POST', `/canchas/${cancha.id}/reservas`, franjaCompartida, token)));
  const ganadoras = compitiendo.filter((r) => r.status === 201);
  const conflictos = compitiendo.filter((r) => r.status === 409).length;
  const errores5xx1 = compitiendo.filter((r) => r.status >= 500).length;
  creadas.push(...ganadoras.map((r, i) => ({ id: r.datos.reserva?.id, token: tokens[compitiendo.indexOf(r)] || tokens[i] })));
  verificar(
    `Fase 1: ${USUARIOS} usuarios reservan la misma franja a la vez`,
    ganadoras.length === 1 && conflictos === USUARIOS - 1 && errores5xx1 === 0,
    `${ganadoras.length} creada (201), ${conflictos} rechazadas (409), ${errores5xx1} errores 5xx`
  );

  // Fase 2: cada uno su propia franja
  const propias = await Promise.all(
    tokens.map((token, i) => llamar('POST', `/canchas/${cancha.id}/reservas`, franjaDeUnaHora(elegida.horarios, fechaDia(base, 1 + i)), token))
  );
  const exitosas = propias.filter((r) => r.status === 201);
  const errores5xx2 = propias.filter((r) => r.status >= 500).length;
  propias.forEach((r, i) => {
    if (r.status === 201) creadas.push({ id: r.datos.reserva?.id, token: tokens[i] });
  });
  verificar(
    `Fase 2: ${USUARIOS} usuarios reservan cada uno su franja a la vez`,
    exitosas.length === USUARIOS && errores5xx2 === 0,
    `${exitosas.length}/${USUARIOS} creadas, ${errores5xx2} errores 5xx, estados: ${[...new Set(propias.map((r) => r.status))].join(', ')}`
  );

  // Fase 3: sin duplicados
  const fechas = [franjaCompartida.fecha, ...tokens.map((_, i) => fechaDia(base, 1 + i))];
  const consultas = await Promise.all(fechas.map((fecha) => llamar('GET', `/canchas/${cancha.id}/disponibilidad?fecha=${fecha}`, null, tokens[0])));
  const duplicados = consultas.filter((c) => {
    const horas = (c.datos.ocupados || []).map((o) => String(o.horaInicio).slice(0, 5));
    return new Set(horas).size !== horas.length;
  }).length;
  const totalOcupadas = consultas.reduce((suma, c) => suma + (c.datos.ocupados || []).length, 0);
  verificar('Fase 3: ninguna franja quedó reservada dos veces', duplicados === 0 && totalOcupadas === 1 + USUARIOS, `${totalOcupadas} franjas ocupadas (esperadas ${1 + USUARIOS}), ${duplicados} fechas con duplicados`);

  // Limpieza
  const cancelaciones = await Promise.all(creadas.filter((c) => c.id).map((c) => llamar('PATCH', `/reservas/${c.id}/cancelar`, null, c.token)));
  const canceladas = cancelaciones.filter((r) => r.status === 200).length;
  verificar('Limpieza: las reservas de la prueba se cancelaron', canceladas === creadas.length, `${canceladas}/${creadas.length}`);

  const p95 = percentil(latencias, 95);
  console.log(`\nLatencia: p50 ${percentil(latencias, 50)} ms · p95 ${p95} ms · máx ${Math.max(...latencias)} ms en ${latencias.length} peticiones`);
  return inicio;
}

let inicioGlobal = Date.now();
principal()
  .then((inicio) => {
    inicioGlobal = inicio;
  })
  .catch((error) => verificar(`Error inesperado: ${error.message}`, false))
  .finally(() => {
    const fallas = resultados.filter((r) => !r.ok).length;
    console.log(`${resultados.length - fallas}/${resultados.length} verificaciones aprobadas`);
    if (latencias.length) guardarEvidencia(Date.now() - inicioGlobal);
    process.exit(fallas === 0 && resultados.length > 0 ? 0 : 1);
  });
