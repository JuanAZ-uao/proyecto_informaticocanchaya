// Prueba de carga básica de US-18: N clientes (100 por defecto) conectados por socket a
// la misma cancha. Verifica que ningún cliente pierda ni reciba duplicado un evento y que
// la competencia por una misma franja termine en una sola retención y una sola reserva.
//
// Uso (contra un backend en marcha, nunca contra la base compartida de Neon):
//   API_URL=http://localhost:4100/api CLIENTES=100 npm run test:carga
// Sale con código 1 si alguna verificación falla.

const { io } = require('socket.io-client');

const API = process.env.API_URL || 'http://localhost:4100/api';
const SOCKET_URL = API.replace(/\/api\/?$/, '');
const CLIENTES = Number(process.env.CLIENTES || 100);
const ESPERA_MAXIMA_MS = 15000;
const PASSWORD = 'Password123!';

const verificaciones = [];

function verificar(condicion, descripcion) {
  verificaciones.push({ ok: Boolean(condicion), descripcion });
  console.log(`${condicion ? '[OK]   ' : '[FALLO]'} ${descripcion}`);
}

async function llamar(metodo, ruta, cuerpo, token) {
  const respuesta = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await respuesta.json().catch(() => ({}));
  return { status: respuesta.status, datos };
}

async function crearUsuario(prefijo, indice) {
  const correo = `${prefijo}.${indice}@carga.local`;
  await llamar('POST', '/auth/registro', { nombre: `Carga ${indice}`, correo, telefono: '3000000000', password: PASSWORD });
  const { datos } = await llamar('POST', '/auth/login', { correo, password: PASSWORD });
  if (!datos.token) throw new Error(`No se pudo iniciar sesión con ${correo}`);
  return datos.token;
}

async function crearUsuarios(cantidad) {
  const prefijo = `carga${Date.now()}`;
  const tokens = [];
  for (let inicio = 0; inicio < cantidad; inicio += 10) {
    const lote = Array.from({ length: Math.min(10, cantidad - inicio) }, (_, i) => crearUsuario(prefijo, inicio + i));
    tokens.push(...(await Promise.all(lote)));
  }
  return tokens;
}

function conectar(token, canchaId) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      query: { canchaId },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    const cliente = { socket, token, eventos: [] };
    const temporizador = setTimeout(() => reject(new Error('Sin temporizador:inicio')), ESPERA_MAXIMA_MS);

    socket.onAny((evento, datos) => cliente.eventos.push({ evento, datos }));
    socket.once('temporizador:inicio', ({ expiresAt }) => {
      clearTimeout(temporizador);
      cliente.expiresAt = expiresAt;
      resolve(cliente);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(temporizador);
      reject(error);
    });
  });
}

function solicitar(cliente, evento, datos) {
  return new Promise((resolve) => {
    cliente.socket.timeout(ESPERA_MAXIMA_MS).emit(evento, datos, (error, respuesta) =>
      resolve(error ? { ok: false, error: { codigo: 'TIMEOUT' } } : respuesta)
    );
  });
}

function contarEventos(cliente, evento, franja) {
  return cliente.eventos.filter(
    (e) => e.evento === evento && e.datos?.fecha === franja.fecha && e.datos?.horaInicio === franja.horaInicio
  ).length;
}

async function esperarHasta(condicion) {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  while (Date.now() < limite) {
    if (condicion()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return condicion();
}

// Cuenta cuántos clientes recibieron el evento exactamente una vez (sin pérdidas ni duplicados).
async function verificarDifusion(clientes, evento, franja, descripcion) {
  const inicio = Date.now();
  await esperarHasta(() => clientes.every((c) => contarEventos(c, evento, franja) >= 1));
  await new Promise((resolve) => setTimeout(resolve, 300));

  const conteos = clientes.map((c) => contarEventos(c, evento, franja));
  const exactos = conteos.filter((n) => n === 1).length;
  const perdidos = conteos.filter((n) => n === 0).length;
  const duplicados = conteos.filter((n) => n > 1).length;
  verificar(
    exactos === clientes.length,
    `${descripcion}: ${exactos}/${clientes.length} lo recibieron una vez (perdidos ${perdidos}, duplicados ${duplicados}, ${Date.now() - inicio} ms)`
  );
}

function fechaFuturaAleatoria() {
  const dias = Math.floor(Math.random() * 3650);
  return new Date(Date.UTC(2090, 0, 1) + dias * 86400000).toISOString().slice(0, 10);
}

async function main() {
  console.log(`Prueba de carga US-18 contra ${API} con ${CLIENTES} clientes\n`);

  const tokens = await crearUsuarios(CLIENTES);
  const { datos } = await llamar('GET', '/canchas', null, tokens[0]);
  const canchaId = datos.canchas?.[0]?.id;
  if (!canchaId) throw new Error('No hay canchas: carga datos semilla antes de la prueba');

  const fecha = fechaFuturaAleatoria();
  const franjaA = { fecha, horaInicio: '07:00', horaFin: '08:00' };
  const franjaB = { fecha, horaInicio: '08:00', horaFin: '09:00' };

  // 1. Conexión concurrente
  const inicioConexion = Date.now();
  const resultados = await Promise.allSettled(tokens.map((token) => conectar(token, canchaId)));
  const clientes = resultados.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  verificar(
    clientes.length === CLIENTES,
    `${clientes.length}/${CLIENTES} conexiones simultáneas recibieron su temporizador (${Date.now() - inicioConexion} ms)`
  );
  if (clientes.length !== CLIENTES) return;

  const [primero, ...resto] = clientes;

  // 2. Una retención se difunde a todos los demás
  const retencionA = await solicitar(primero, 'retencion:solicitar', franjaA);
  verificar(retencionA.ok, 'El primer cliente retiene la franja A y el servidor lo confirma');
  await verificarDifusion(resto, 'disponibilidad:retenida', franjaA, 'Aviso "franja A en proceso de reserva"');

  // 3. Todos compiten a la vez por la franja B: solo uno puede retenerla
  const respuestasB = await Promise.all(resto.map((c) => solicitar(c, 'retencion:solicitar', franjaB)));
  const ganadores = respuestasB.filter((r) => r.ok).length;
  const rechazadas = respuestasB.filter((r) => r.error?.codigo === 'FRANJA_RETENIDA').length;
  verificar(
    ganadores === 1 && rechazadas === resto.length - 1,
    `${resto.length} retenciones simultáneas de la franja B: ${ganadores} aceptada, ${rechazadas} rechazadas con FRANJA_RETENIDA`
  );
  const ganador = resto[respuestasB.findIndex((r) => r.ok)];
  const demasQueB = clientes.filter((c) => c !== ganador);
  await verificarDifusion(demasQueB, 'disponibilidad:retenida', franjaB, 'Aviso "franja B en proceso de reserva"');

  // 4. Todos intentan reservar la franja B a la vez: una sola reserva
  const respuestasReserva = await Promise.all(
    resto.map((c) => llamar('POST', `/canchas/${canchaId}/reservas`, franjaB, c.token))
  );
  const creadas = respuestasReserva.filter((r) => r.status === 201);
  const conflictos = respuestasReserva.filter((r) => r.status === 409).length;
  verificar(
    creadas.length === 1 && conflictos === resto.length - 1,
    `${resto.length} reservas simultáneas de la franja B: ${creadas.length} creada (201), ${conflictos} rechazadas (409)`
  );
  const ocupados = await llamar('GET', `/canchas/${canchaId}/disponibilidad?fecha=${fecha}`, null, tokens[0]);
  const reservasFranjaB = (ocupados.datos.ocupados || []).filter((o) => String(o.horaInicio).startsWith('08:00'));
  verificar(reservasFranjaB.length === 1, `En la base quedó ${reservasFranjaB.length} reserva para la franja B (sin duplicados)`);
  await verificarDifusion(demasQueB, 'disponibilidad:reservada', franjaB, 'Aviso "franja B reservada"');

  // 5. Al salir de la cancha, la retención se libera y se avisa
  primero.socket.disconnect();
  await verificarDifusion(resto, 'disponibilidad:liberada', franjaA, 'Aviso "franja A liberada" al salir el usuario');

  clientes.forEach((c) => c.socket.disconnect());
}

main()
  .catch((error) => verificar(false, `Error inesperado: ${error.message}`))
  .finally(() => {
    const fallas = verificaciones.filter((v) => !v.ok).length;
    console.log(`\n${verificaciones.length - fallas}/${verificaciones.length} verificaciones correctas`);
    process.exit(fallas === 0 && verificaciones.length > 0 ? 0 : 1);
  });
