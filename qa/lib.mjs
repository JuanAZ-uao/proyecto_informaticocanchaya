// Infraestructura común de las pruebas QA de CanchaYa.
// Todas las pruebas corren contra un entorno Docker aislado (proyecto "canchaya-qa", con su
// propio Postgres): nunca contra la base compartida de Neon.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { io } from 'socket.io-client';

export const ROOT = path.resolve(import.meta.dirname, '..').split(path.sep).join('/');
export const OUT = path.resolve(import.meta.dirname, 'resultados');
export const EVID = path.join(OUT, 'evidencias');
fs.mkdirSync(EVID, { recursive: true });

// Si "docker" no está en el PATH, defina DOCKER_BIN con la carpeta que contiene docker.exe.
const DOCKER_BIN = process.env.DOCKER_BIN ?? '';

export const CFG = {
  proyecto: 'canchaya-qa',
  apiPort: 4300,
  webPort: 8380,
  jwtSecret: 'qa_jwt_secret_solo_para_pruebas_2026',
  postgresPassword: 'qa_postgres',
  API: 'http://localhost:4300/api',
  WEB: 'http://localhost:8380',
  SOCKET: 'http://localhost:4300',
  password: 'Password123!',
};

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Shell / Docker ----------
export function sh(cmd, { cwd = ROOT, timeout = 600000, env = {} } = {}) {
  const r = spawnSync(cmd, {
    shell: true,
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: 1 << 27,
    env: {
      ...process.env,
      PATH: DOCKER_BIN ? `${process.env.PATH}${path.delimiter}${DOCKER_BIN}` : process.env.PATH,
      BACKEND_PORT: String(CFG.apiPort),
      FRONTEND_PORT: String(CFG.webPort),
      JWT_SECRET: CFG.jwtSecret,
      POSTGRES_PASSWORD: CFG.postgresPassword,
      ...env,
    },
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: `${r.stdout || ''}${r.stderr || ''}` };
}

// US-12 limita las reservas activas por usuario (5 por defecto). Las pruebas reutilizan usuarios fijos y
// crean muchas reservas, así que el entorno Docker de QA sube el límite; el límite real se prueba en Jest.
export const dc = (args, opts = {}) =>
  sh(`docker compose -p ${CFG.proyecto} ${args}`, { ...opts, env: { MAX_RESERVAS_ACTIVAS_USUARIO: '500', ...opts.env } });

export function sql(consulta) {
  const r = dc(`exec -T db psql -U canchaya -d canchaya -tAc "${consulta.replace(/"/g, '\\"')}"`);
  if (r.code !== 0) throw new Error(`psql falló: ${r.out.trim()}`);
  return r.stdout.trim();
}

export function logsBackend(desde = '10m') {
  return dc(`logs backend --since ${desde} --no-color`).out;
}

// ---------- Fechas (hora de Colombia, UTC-5) ----------
export const ahoraCO = () => new Date(Date.now() - 5 * 3600e3);
export const fechaCO = (offsetDias = 0) => new Date(Date.now() - 5 * 3600e3 + offsetDias * 86400e3).toISOString().slice(0, 10);
export const horaCO = () => ahoraCO().toISOString().slice(11, 16);

let contadorFechas = 0;
// Fecha futura única (año 2100+) para pruebas de API que no dependen del horario de la cancha.
export function fechaUnica() {
  contadorFechas += 1;
  const base = Date.UTC(2100, 0, 1) + (Date.now() % 1500) * 86400e3 + contadorFechas * 86400e3 * 3;
  return new Date(base).toISOString().slice(0, 10);
}

// ---------- HTTP ----------
// Docker Desktop a veces rechaza o corta una conexión justo después de que un contenedor se inicia o
// de ejecutar un comando en él; se reintenta unos instantes solo ante esos cortes de red.
async function fetchConReintento(url, opciones) {
  for (let intento = 0; ; intento += 1) {
    try {
      return await fetch(url, opciones);
    } catch (error) {
      const codigo = error.cause?.code;
      const reintentable = ['ECONNREFUSED', 'ECONNRESET', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'].includes(codigo);
      if (intento >= 3 || !reintentable) throw error;
      await esperar(400);
    }
  }
}

export async function api(metodo, ruta, cuerpo, token, cabeceras = {}) {
  const t0 = performance.now();
  const res = await fetchConReintento(`${CFG.API}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...cabeceras,
    },
    body: cuerpo !== undefined ? (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  });
  const texto = await res.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = texto;
  }
  return { status: res.status, datos, ms: performance.now() - t0, headers: res.headers };
}

let contadorUsuarios = 0;
export async function crearUsuario(prefijo = 'qa') {
  contadorUsuarios += 1;
  const correo = `${prefijo}.${Date.now()}.${contadorUsuarios}@qa.local`;
  const nombre = `${prefijo.toUpperCase()} Usuario ${contadorUsuarios}`;
  const reg = await api('POST', '/auth/registro', { nombre, correo, telefono: '3001234567', password: CFG.password });
  if (reg.status !== 201) throw new Error(`No se pudo registrar a ${correo}: ${reg.status} ${JSON.stringify(reg.datos)}`);
  const login = await api('POST', '/auth/login', { correo, password: CFG.password });
  if (login.status !== 200 || !login.datos.token) throw new Error(`No se pudo iniciar sesión con ${correo}`);
  const id = JSON.parse(Buffer.from(login.datos.token.split('.')[1], 'base64url').toString()).sub;
  return { correo, nombre, password: CFG.password, token: login.datos.token, usuario: login.datos.usuario, id };
}

let canchasCache;
export async function canchas(token) {
  if (!canchasCache) {
    const u = token ? { token } : await crearUsuario('cat');
    const r = await api('GET', '/canchas', undefined, u.token);
    canchasCache = r.datos.canchas;
  }
  return canchasCache;
}

// ---------- Sockets ----------
export function conectar(token, canchaId, { timeout = 8000, esperarInicio = true } = {}) {
  return new Promise((resolve) => {
    const socket = io(CFG.SOCKET, {
      auth: token ? { token } : {},
      query: canchaId ? { canchaId } : {},
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    const cliente = { socket, token, eventos: [], desconectadoEn: null };
    const limite = setTimeout(() => resolve({ ...cliente, ok: false, error: 'TIMEOUT sin temporizador:inicio' }), timeout);

    socket.onAny((evento, datos) => cliente.eventos.push({ evento, datos, t: Date.now() }));
    socket.on('disconnect', () => (cliente.desconectadoEn = Date.now()));
    socket.once('connect_error', (error) => {
      clearTimeout(limite);
      resolve({ ...cliente, ok: false, error: error.message });
    });
    socket.once('temporizador:inicio', ({ expiresAt, estado }) => {
      clearTimeout(limite);
      cliente.expiresAt = expiresAt;
      cliente.estado = estado;
      resolve({ ...cliente, ok: true });
    });
    if (!esperarInicio) {
      socket.once('connect', () => {
        clearTimeout(limite);
        resolve({ ...cliente, ok: true });
      });
    }
  });
}

export function emitir(cliente, evento, datos, timeout = 8000) {
  return new Promise((resolve) => {
    cliente.socket.timeout(timeout).emit(evento, datos, (error, respuesta) =>
      resolve(error ? { ok: false, error: { codigo: 'TIMEOUT' } } : respuesta)
    );
  });
}

export const eventosDe = (cliente, nombre, pred = () => true) =>
  cliente.eventos.filter((e) => e.evento === nombre && pred(e.datos));

export async function esperarEvento(cliente, nombre, pred = () => true, timeout = 6000) {
  const limite = Date.now() + timeout;
  while (Date.now() < limite) {
    const e = eventosDe(cliente, nombre, pred)[0];
    if (e) return e;
    await esperar(50);
  }
  return null;
}

export function cerrar(...clientes) {
  clientes.flat().forEach((c) => c?.socket?.disconnect());
}

// ---------- Registro de resultados ----------
const SOLO = process.env.SOLO ? process.env.SOLO.split(',') : null;

export class Suite {
  constructor(clave, titulo, { anexar = false } = {}) {
    if (SOLO) anexar = true;
    this.clave = clave;
    this.titulo = titulo;
    this.archivo = path.join(OUT, `${clave}.json`);
    this.casos = [];
    this.inicio = new Date().toISOString();
    if (anexar && fs.existsSync(this.archivo)) {
      const previo = JSON.parse(fs.readFileSync(this.archivo, 'utf8'));
      this.casos = previo.casos;
      this.inicio = previo.inicio;
    }
  }

  async caso(meta, fn) {
    if (SOLO && !SOLO.includes(meta.id)) return;
    const t0 = Date.now();
    const lineas = [];
    const evidencias = [];
    let falla = false;
    let observacion = false;
    let n = 0;

    const ctx = {
      verifica(condicion, texto, detalle) {
        lineas.push({ ok: Boolean(condicion), texto: detalle !== undefined ? `${texto} → ${detalle}` : texto });
        if (!condicion) falla = true;
        return Boolean(condicion);
      },
      nota(texto) {
        lineas.push({ ok: null, texto });
      },
      observacion(texto) {
        lineas.push({ ok: 'obs', texto });
        observacion = true;
      },
      async captura(pagina, leyenda, selector) {
        n += 1;
        const archivo = `${meta.id}-${n}.jpg`;
        const destino = path.join(EVID, archivo);
        if (selector) await pagina.locator(selector).first().screenshot({ path: destino, type: 'jpeg', quality: 72 });
        else await pagina.screenshot({ path: destino, type: 'jpeg', quality: 72 });
        evidencias.push({ archivo, leyenda });
      },
      adjuntar(archivo, leyenda) {
        evidencias.push({ archivo, leyenda });
      },
      evidenciaTexto(titulo, contenido) {
        evidencias.push({ titulo, texto: String(contenido).slice(0, 3500) });
      },
    };

    try {
      await fn(ctx);
    } catch (error) {
      lineas.push({ ok: false, texto: `Error inesperado durante la ejecución: ${String(error.message).split('\n')[0]}` });
      falla = true;
    }

    const estado = falla ? 'FALLIDA' : observacion ? 'OBSERVACIÓN' : 'APROBADA';
    const duracionMs = Date.now() - t0;
    const registro = { ...meta, estado, duracionMs, resultado: lineas, evidencias, ejecutadaEn: new Date().toISOString() };
    const previo = this.casos.findIndex((x) => x.id === meta.id);
    if (previo >= 0) this.casos[previo] = registro;
    else this.casos.push(registro);
    console.log(`[${estado}] ${meta.id} ${meta.titulo} (${(duracionMs / 1000).toFixed(1)} s)`);
    this.guardar();
  }

  guardar() {
    fs.writeFileSync(
      this.archivo,
      JSON.stringify({ clave: this.clave, titulo: this.titulo, inicio: this.inicio, fin: new Date().toISOString(), casos: this.casos }, null, 2)
    );
  }

  resumen() {
    const c = (e) => this.casos.filter((x) => x.estado === e).length;
    return { total: this.casos.length, aprobadas: c('APROBADA'), fallidas: c('FALLIDA'), observaciones: c('OBSERVACIÓN') };
  }
}
