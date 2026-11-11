// Pruebas de humo post-despliegue (US-26). Recorre contra un despliegue real, sin mocks:
//   frontend (HTTPS y recarga en cualquier ruta) · salud y CORS de la API · registro · login · listado de canchas ·
//   temporizador del socket (WSS) · validación de disponibilidad · creación de reserva · bloqueo de reserva duplicada.
//
// Uso:
//   API_URL=https://api.ejemplo.com/api WEB_URL=https://app.ejemplo.com npm run smoke:produccion
//   EVIDENCIA_ARCHIVO=../docs/evidencias-despliegue/humo-produccion.md  (opcional: guarda el resultado en Markdown)
//
// Deja la base limpia salvo por dos cuentas "humo.<fecha>@canchaya-humo.test": la reserva de la prueba se cancela
// al terminar. Sale con código 1 si alguna verificación falla.
const fs = require('fs');
const { io } = require('socket.io-client');
const { franjaDeUnaHora, elegirCancha } = require('./franjasDeCancha');

function leerUrl(nombre, valor) {
  if (!valor) throw new Error(`Define ${nombre} (por ejemplo ${nombre}=https://...)`);
  const url = new URL(valor);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${nombre} debe usar http o https`);
  return url.href.replace(/\/$/, '');
}

const API = leerUrl('API_URL', process.env.API_URL);
const WEB = leerUrl('WEB_URL', process.env.WEB_URL);
const SOCKET_URL = API.replace(/\/api$/, '');
const ESPERA_SOCKET_MS = 15000;
const PASSWORD = 'Humo12345!';
const esLocal = ['localhost', '127.0.0.1'].includes(new URL(API).hostname);

const resultados = [];

function verificar(nombre, condicion, detalle = '') {
  resultados.push({ nombre, ok: Boolean(condicion), detalle });
  console.log(`${condicion ? '[OK]   ' : '[FALLO]'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  return Boolean(condicion);
}

async function llamar(metodo, ruta, cuerpo, token) {
  const respuesta = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Origin: new URL(WEB).origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await respuesta.json().catch(() => ({}));
  return { status: respuesta.status, datos };
}

async function crearCuenta(sufijo) {
  const correo = `humo.${Date.now()}.${sufijo}@canchaya-humo.test`;
  const registro = await llamar('POST', '/auth/registro', { nombre: `Humo ${sufijo}`, correo, telefono: '3000000000', password: PASSWORD });
  const login = await llamar('POST', '/auth/login', { correo, password: PASSWORD });
  return { correo, registro, login, token: login.datos.token };
}

function esperarTemporizador(token, canchaId) {
  return new Promise((resolve) => {
    const socket = io(SOCKET_URL, { auth: { token }, query: { canchaId }, transports: ['websocket'], reconnection: false, forceNew: true });
    const limite = setTimeout(() => resolve({ socket, error: 'sin temporizador:inicio' }), ESPERA_SOCKET_MS);
    socket.once('temporizador:inicio', (datos) => {
      clearTimeout(limite);
      resolve({ socket, datos });
    });
    socket.once('connect_error', (error) => {
      clearTimeout(limite);
      resolve({ socket, error: error.message });
    });
  });
}

function fechaFutura() {
  const dias = Math.floor(Math.random() * 3650);
  return new Date(Date.UTC(2090, 0, 1) + dias * 86400000).toISOString().slice(0, 10);
}

function guardarEvidencia() {
  const ruta = process.env.EVIDENCIA_ARCHIVO;
  if (!ruta) return;
  const fallas = resultados.filter((r) => !r.ok).length;
  const filas = resultados.map((r) => `| ${r.ok ? 'Aprobada' : '**FALLÓ**'} | ${r.nombre} | ${r.detalle.replace(/\|/g, '/')} |`).join('\n');
  const texto = `# Pruebas de humo post-despliegue

- **Fecha:** ${new Date().toISOString()}
- **Frontend:** ${WEB}
- **API:** ${API}
- **Resultado:** ${resultados.length - fallas}/${resultados.length} verificaciones aprobadas

| Resultado | Verificación | Detalle |
| --- | --- | --- |
${filas}
`;
  fs.mkdirSync(require('path').dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, texto);
  console.log(`Evidencia guardada en ${ruta}`);
}

async function principal() {
  console.log(`Pruebas de humo\n  frontend: ${WEB}\n  API:      ${API}\n`);

  // 1. Frontend
  const inicio = await fetch(`${WEB}/`).catch((error) => ({ ok: false, status: 0, text: async () => error.message }));
  const htmlInicio = await inicio.text();
  verificar('Frontend: la página principal carga la aplicación', inicio.ok && htmlInicio.includes('id="root"'), `HTTP ${inicio.status}`);
  const rutaProfunda = await fetch(`${WEB}/canchas/ruta-que-no-existe-en-el-servidor`).catch(() => ({ ok: false, status: 0, text: async () => '' }));
  verificar('Frontend: recargar una ruta interna devuelve la aplicación (reescritura SPA)', rutaProfunda.ok && (await rutaProfunda.text()).includes('id="root"'), `HTTP ${rutaProfunda.status}`);
  verificar('Frontend y API se sirven por HTTPS', esLocal || (WEB.startsWith('https://') && API.startsWith('https://')), esLocal ? 'entorno local: se omite' : '');

  // 2. Salud y CORS
  const salud = await llamar('GET', '/health');
  verificar('API: /api/health responde ok', salud.status === 200 && salud.datos.estado === 'ok', `HTTP ${salud.status}`);
  const origenWeb = new URL(WEB).origin;
  const preflight = await fetch(`${API}/canchas`, { method: 'OPTIONS', headers: { Origin: origenWeb, 'Access-Control-Request-Method': 'GET' } });
  verificar('CORS: permite el origen del frontend', preflight.headers.get('access-control-allow-origin') === origenWeb, `allow-origin: ${preflight.headers.get('access-control-allow-origin')}`);
  const ajeno = await fetch(`${API}/canchas`, { method: 'OPTIONS', headers: { Origin: 'https://sitio-ajeno.example', 'Access-Control-Request-Method': 'GET' } });
  verificar('CORS: rechaza un origen ajeno', !ajeno.headers.get('access-control-allow-origin') && ajeno.status === 403, `HTTP ${ajeno.status}`);

  // 3. Registro y login
  const ana = await crearCuenta('a');
  verificar('Registro de usuario', ana.registro.status === 201, `HTTP ${ana.registro.status}`);
  verificar('Inicio de sesión devuelve token', ana.login.status === 200 && Boolean(ana.token), `HTTP ${ana.login.status}`);
  if (!ana.token) return;
  const sinToken = await llamar('GET', '/canchas');
  verificar('Sin sesión la API rechaza (401)', sinToken.status === 401, `HTTP ${sinToken.status}`);

  // 4. Canchas
  const lista = await llamar('GET', '/canchas', null, ana.token);
  const cancha = lista.datos.canchas?.[0];
  verificar('Listado de canchas con datos', lista.status === 200 && Boolean(cancha), `${lista.datos.canchas?.length ?? 0} canchas`);
  if (!cancha) return;

  // 5. Temporizador por WebSocket seguro
  const { socket, datos, error } = await esperarTemporizador(ana.token, cancha.id);
  const vigente = datos && Number(datos.expiresAt) > Date.now() - 60000;
  verificar(`Socket (${SOCKET_URL.startsWith('https') ? 'WSS' : 'WS'}): llega temporizador:inicio con vencimiento`, Boolean(datos?.expiresAt) && vigente, error || `expiresAt=${datos?.expiresAt}`);
  socket.disconnect();

  // 6. Disponibilidad. Se elige una cancha y una fecha cuyo horario de atención permita una franja de 1 hora:
  // en producción las canchas tienen horarios distintos y una hora fija podría quedar fuera de horario.
  const fechaBase = fechaFutura();
  let fecha = fechaBase;
  let elegida = null;
  for (let dia = 0; dia < 7 && !elegida; dia += 1) {
    fecha = new Date(new Date(`${fechaBase}T12:00:00Z`).getTime() + dia * 86400000).toISOString().slice(0, 10);
    elegida = await elegirCancha(llamar, ana.token, lista.datos.canchas, (horarios) => franjaDeUnaHora(horarios, fecha) !== null);
  }
  verificar('Hay una cancha con horario de atención para reservar una franja de 1 hora', Boolean(elegida), elegida ? `${elegida.cancha.nombre} · ${fecha}` : 'ninguna cancha tiene horario');
  if (!elegida) return;
  const canchaReserva = elegida.cancha;
  const disponibilidad = await llamar('GET', `/canchas/${canchaReserva.id}/disponibilidad?fecha=${fecha}`, null, ana.token);
  verificar('Disponibilidad: consulta de una fecha', disponibilidad.status === 200 && Array.isArray(disponibilidad.datos.ocupados), `HTTP ${disponibilidad.status}`);
  const fueraDeHorario = await llamar('POST', `/canchas/${canchaReserva.id}/reservas`, { fecha, horaInicio: '03:00', horaFin: '04:00' }, ana.token);
  verificar('Disponibilidad: rechaza una franja fuera del horario de atención', fueraDeHorario.status >= 400 && fueraDeHorario.status < 500, `HTTP ${fueraDeHorario.status}`);
  const horaInvalida = await llamar('POST', `/canchas/${canchaReserva.id}/reservas`, { fecha, horaInicio: '25:00', horaFin: '26:00' }, ana.token);
  verificar('Disponibilidad: valida el formato de la hora (400)', horaInvalida.status === 400, `HTTP ${horaInvalida.status}`);

  // 6b. Reserva y bloqueo de duplicada
  const franja = franjaDeUnaHora(elegida.horarios, fecha);
  const reserva = await llamar('POST', `/canchas/${canchaReserva.id}/reservas`, franja, ana.token);
  verificar('Creación de reserva (201 con código)', reserva.status === 201 && Boolean(reserva.datos.reserva?.codigo), `HTTP ${reserva.status} ${reserva.datos.reserva?.codigo ?? reserva.datos.mensaje ?? ''} · franja ${franja.horaInicio}-${franja.horaFin}`);

  const luis = await crearCuenta('b');
  const duplicadaOtro = await llamar('POST', `/canchas/${canchaReserva.id}/reservas`, franja, luis.token);
  verificar('Reserva duplicada por otro usuario: bloqueada (409)', duplicadaOtro.status === 409, `HTTP ${duplicadaOtro.status}`);
  const duplicadaMismo = await llamar('POST', `/canchas/${canchaReserva.id}/reservas`, franja, ana.token);
  verificar('Reserva duplicada por el mismo usuario: bloqueada (409)', duplicadaMismo.status === 409, `HTTP ${duplicadaMismo.status}`);
  const ocupadas = await llamar('GET', `/canchas/${canchaReserva.id}/disponibilidad?fecha=${fecha}`, null, luis.token);
  const unica = (ocupadas.datos.ocupados || []).filter((o) => String(o.horaInicio).startsWith(franja.horaInicio)).length;
  verificar('Solo existe una reserva para la franja', unica === 1, `${unica} reserva(s)`);

  // 7. Limpieza: se cancela la reserva de prueba
  if (reserva.datos.reserva?.id) {
    const cancelada = await llamar('PATCH', `/reservas/${reserva.datos.reserva.id}/cancelar`, null, ana.token);
    verificar('Limpieza: la reserva de prueba se cancela', cancelada.status === 200, `HTTP ${cancelada.status}`);
  }
}

principal()
  .catch((error) => verificar(`Error inesperado: ${error.message}`, false))
  .finally(() => {
    const fallas = resultados.filter((r) => !r.ok).length;
    console.log(`\n${resultados.length - fallas}/${resultados.length} verificaciones aprobadas`);
    guardarEvidencia();
    process.exit(fallas === 0 && resultados.length > 0 ? 0 : 1);
  });
