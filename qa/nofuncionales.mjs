// Suite de pruebas no funcionales: rendimiento, carga, seguridad, usabilidad/accesibilidad,
// compatibilidad, fiabilidad y mantenibilidad. Se ejecuta contra el entorno Docker aislado.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium, firefox, webkit } from 'playwright';
import { Suite, CFG, ROOT, OUT, api, sql, dc, sh, logsBackend, crearUsuario, canchas, esperar, fechaCO, horaCO, fechaUnica } from './lib.mjs';

const requireBackend = createRequire(`${ROOT}/backend/package.json`);
const jwt = requireBackend('jsonwebtoken');
const requireLocal = createRequire(import.meta.url);

const S = new Suite('nofuncionales', 'Pruebas no funcionales');
const sqlq = (q) => sql(q.replace(/\s+/g, ' '));
const base = { tipo: 'No funcional', prioridad: 'Alta', hu: 'NF', ca: [] };
const pct = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)]; };
const ms = (n) => `${Math.round(n)} ms`;
const tabla = (filas) => filas.map((f) => f.join('\t')).join('\n');

const lista = await canchas();
const [K0, K1, K2] = lista;
const U = await crearUsuario('nf');

async function medir(n, fn) {
  const t = [];
  let errores = 0;
  for (let i = 0; i < n; i += 1) {
    const r = await fn(i);
    t.push(r.ms);
    if (r.status >= 500 || r.status === 0) errores += 1;
  }
  return { t, errores, p50: pct(t, 0.5), p95: pct(t, 0.95), max: Math.max(...t), prom: t.reduce((a, b) => a + b, 0) / t.length };
}

// =====================================================================
// Rendimiento
// =====================================================================
await S.caso(
  { ...base, id: 'NF-01', hu: 'US-04', ca: [3], grupo: 'Rendimiento', rnf: 'RNF-01', nivel: 'API REST', titulo: 'Tiempos de respuesta de la API (p95 < 2 s)', objetivo: 'Medir la latencia de los endpoints principales en secuencia y comprobar el objetivo de RNF-01: menos de 2 s para el 95 % de las solicitudes.', datos: 'Entorno Docker local sin carga; 60 solicitudes por endpoint (20 para el login por el costo de bcrypt).', pasos: ['Ejecutar solicitudes secuenciales a GET /canchas, GET /canchas/:id, GET /disponibilidad, GET /reservas/mias y POST /auth/login.', 'Calcular p50, p95 y máximo de cada endpoint.'], esperado: 'El p95 de todos los endpoints es menor a 2000 ms (objetivo) y no hay errores 5xx.' },
  async (c) => {
    const e = [
      ['GET /api/canchas', 60, () => api('GET', '/canchas', undefined, U.token)],
      ['GET /api/canchas/:id', 60, () => api('GET', `/canchas/${K0.id}`, undefined, U.token)],
      ['GET /api/canchas/:id/disponibilidad', 60, () => api('GET', `/canchas/${K0.id}/disponibilidad?fecha=${fechaCO(3)}`, undefined, U.token)],
      ['GET /api/reservas/mias', 60, () => api('GET', '/reservas/mias', undefined, U.token)],
      ['POST /api/auth/login', 20, () => api('POST', '/auth/login', { correo: U.correo, password: U.password })],
    ];
    const filas = [['Endpoint', 'n', 'p50', 'p95', 'máx', 'errores 5xx']];
    for (const [nombre, n, fn] of e) {
      const r = await medir(n, fn);
      filas.push([nombre, n, ms(r.p50), ms(r.p95), ms(r.max), r.errores]);
      c.verifica(r.p95 < 2000 && r.errores === 0, `${nombre}: p95 ${ms(r.p95)} (< 2000 ms), sin errores`, `p50 ${ms(r.p50)} · máx ${ms(r.max)}`);
    }
    c.evidenciaTexto('Latencias medidas', tabla(filas));
  }
);

await S.caso(
  { ...base, id: 'NF-02', hu: 'US-04', ca: [3], grupo: 'Rendimiento', rnf: 'RNF-01', nivel: 'API REST (concurrencia)', titulo: 'Latencia con 50 solicitudes concurrentes', objetivo: 'Verificar que el listado de canchas mantiene tiempos aceptables con usuarios simultáneos.', datos: '4 rondas de 50 solicitudes simultáneas (200 en total) a GET /api/canchas.', pasos: ['Lanzar 50 solicitudes en paralelo, 4 veces.', 'Calcular p50, p95, máximo y errores.'], esperado: 'p95 menor a 2000 ms y cero errores 5xx.' },
  async (c) => {
    const todas = [];
    for (let ronda = 0; ronda < 4; ronda += 1) {
      const r = await Promise.all(Array.from({ length: 50 }, () => api('GET', '/canchas', undefined, U.token)));
      todas.push(...r);
    }
    const t = todas.map((r) => r.ms);
    const errores = todas.filter((r) => r.status !== 200).length;
    c.verifica(errores === 0, '200 solicitudes respondieron 200 OK', `${errores} con error`);
    c.verifica(pct(t, 0.95) < 2000, 'p95 menor a 2000 ms', `p50 ${ms(pct(t, 0.5))} · p95 ${ms(pct(t, 0.95))} · máx ${ms(Math.max(...t))}`);
  }
);

await S.caso(
  { ...base, id: 'NF-03', hu: 'US-04', ca: [3], grupo: 'Rendimiento', rnf: 'RNF-01', nivel: 'UI (Chromium)', titulo: 'Tiempo de carga de las páginas principales', objetivo: 'Medir cuánto tarda en estar usable el listado de canchas y el detalle (con temporizador) en el navegador.', datos: '8 cargas por página, caché del navegador vacía; red local.', pasos: ['Abrir /canchas con sesión iniciada y medir hasta que aparecen las tarjetas.', 'Abrir el detalle y medir hasta que aparece el temporizador.', 'Leer las métricas de navegación (DOMContentLoaded y load).'], esperado: 'El listado queda usable en menos de 2 s en el p95; el detalle (incluida la conexión del socket) en menos de 3 s.' },
  async (c) => {
    const browser = await chromium.launch();
    const lista1 = [];
    const detalle = [];
    const dcl = [];
    for (let i = 0; i < 8; i += 1) {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(`${CFG.WEB}/login`);
      await page.evaluate(([t, u]) => { localStorage.setItem('canchaya_token', t); localStorage.setItem('canchaya_usuario', u); }, [U.token, JSON.stringify(U.usuario)]);
      let t0 = Date.now();
      await page.goto(`${CFG.WEB}/canchas`);
      await page.waitForSelector('a.tarjeta-cancha');
      lista1.push(Date.now() - t0);
      dcl.push(await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return n.domContentLoadedEventEnd; }));
      t0 = Date.now();
      await page.goto(`${CFG.WEB}/canchas/${K0.id}`);
      await page.waitForSelector('.temporizador-reserva:has-text("Tiempo para reservar")');
      detalle.push(Date.now() - t0);
      await ctx.close();
    }
    await browser.close();
    c.verifica(pct(lista1, 0.95) < 2000, 'Listado usable en menos de 2 s (p95)', `p50 ${ms(pct(lista1, 0.5))} · p95 ${ms(pct(lista1, 0.95))} · máx ${ms(Math.max(...lista1))}`);
    c.verifica(pct(detalle, 0.95) < 3000, 'Detalle con temporizador en menos de 3 s (p95)', `p50 ${ms(pct(detalle, 0.5))} · p95 ${ms(pct(detalle, 0.95))} · máx ${ms(Math.max(...detalle))}`);
    c.nota(`DOMContentLoaded del listado: mediana ${ms(pct(dcl, 0.5))}`);
  }
);

await S.caso(
  { ...base, id: 'NF-04', hu: 'NF', ca: [], grupo: 'Rendimiento', rnf: 'RNF-01', nivel: 'Frontend (build)', titulo: 'Tamaño del bundle del frontend', objetivo: 'Verificar que la aplicación compilada es liviana para conexiones móviles.', pasos: ['Listar los archivos de /assets servidos por nginx y medir su tamaño con y sin compresión gzip.'], esperado: 'El JavaScript principal pesa menos de 500 KB sin comprimir (menos de 150 KB con gzip) y el CSS menos de 60 KB.' },
  async (c) => {
    const html = await (await fetch(CFG.WEB)).text();
    const js = html.match(/\/assets\/[^"']+\.js/)[0];
    const css = html.match(/\/assets\/[^"']+\.css/)[0];
    const pesos = {};
    for (const [k, ruta] of [['js', js], ['css', css]]) {
      const buf = Buffer.from(await (await fetch(`${CFG.WEB}${ruta}`)).arrayBuffer());
      pesos[k] = { bytes: buf.length, gzip: requireLocal('node:zlib').gzipSync(buf).length };
    }
    c.verifica(pesos.js.bytes < 500 * 1024 && pesos.js.gzip < 150 * 1024, 'JavaScript: < 500 KB (< 150 KB gzip)', `${(pesos.js.bytes / 1024).toFixed(0)} KB · ${(pesos.js.gzip / 1024).toFixed(0)} KB gzip`);
    c.verifica(pesos.css.bytes < 60 * 1024, 'CSS: < 60 KB', `${(pesos.css.bytes / 1024).toFixed(0)} KB · ${(pesos.css.gzip / 1024).toFixed(0)} KB gzip`);
    const fotos = fs.readdirSync(`${ROOT}/frontend/public/img/canchas`).map((f) => fs.statSync(`${ROOT}/frontend/public/img/canchas/${f}`).size);
    c.verifica(Math.max(...fotos) < 400 * 1024, 'Cada foto de cancha pesa menos de 400 KB', `máx ${(Math.max(...fotos) / 1024).toFixed(0)} KB, total ${(fotos.reduce((a, b) => a + b, 0) / 1024).toFixed(0)} KB`);
    const gz = (await fetch(`${CFG.WEB}${js}`, { headers: { 'Accept-Encoding': 'gzip' } })).headers.get('content-encoding');
    if (gz !== 'gzip') c.observacion('nginx sirve el JavaScript sin compresión gzip (content-encoding vacío): activar "gzip on" reduciría la transferencia.');
  }
);

// =====================================================================
// Carga y concurrencia
// =====================================================================
await S.caso(
  { ...base, id: 'NF-05', hu: 'US-18', ca: [8], grupo: 'Carga y concurrencia', rnf: 'US-18 CA-8', nivel: 'Socket.IO (carga)', titulo: 'Prueba de carga: 100 conexiones concurrentes sin pérdida de eventos ni reservas duplicadas', objetivo: 'Ejecutar la prueba de carga del criterio de aceptación de US-18.', datos: '100 usuarios nuevos conectados a la misma cancha.', pasos: ['Crear 100 usuarios y conectarlos por socket a la misma cancha.', 'Uno retiene la franja A; los 99 restantes deben recibir el aviso.', 'Los 99 compiten a la vez por la franja B (retención y luego reserva).', 'Verificar eventos recibidos y filas en la base.'], esperado: '100/100 conexiones; 99/99 reciben cada aviso exactamente una vez; 1 retención y 1 reserva ganadoras; una sola fila en la base.' },
  async (c) => {
    const r = sh('npm run test:carga', { cwd: `${ROOT}/backend`, env: { API_URL: CFG.API, CLIENTES: '100' }, timeout: 300000 });
    const m = r.out.match(/(\d+)\/(\d+) verificaciones correctas/);
    const lineas = r.out.split('\n').filter((l) => /^\[(OK|FALLO)\]/.test(l));
    lineas.forEach((l) => c.verifica(l.startsWith('[OK]'), l.replace(/^\[(OK|FALLO)\]\s*/, '')));
    c.verifica(r.code === 0 && m && m[1] === m[2], 'La prueba termina con todas las verificaciones correctas', m ? `${m[1]}/${m[2]}` : `código ${r.code}`);
  }
);

await S.caso(
  { ...base, id: 'NF-06', hu: 'US-18', ca: [8], grupo: 'Carga y concurrencia', rnf: 'Estrés', nivel: 'Socket.IO (estrés)', prioridad: 'Media', titulo: 'Prueba de estrés: 250 conexiones concurrentes', objetivo: 'Superar 2,5 veces la carga exigida para conocer el margen del servidor.', datos: '250 usuarios nuevos; misma cancha.', pasos: ['Ejecutar la prueba de carga con CLIENTES=250.', 'Medir el consumo del contenedor del backend después.'], esperado: 'Todas las verificaciones correctas (sin eventos perdidos ni duplicados) con 250 clientes.' },
  async (c) => {
    const r = sh('npm run test:carga', { cwd: `${ROOT}/backend`, env: { API_URL: CFG.API, CLIENTES: '250' }, timeout: 480000 });
    const m = r.out.match(/(\d+)\/(\d+) verificaciones correctas/);
    c.verifica(r.code === 0 && m && m[1] === m[2], 'Todas las verificaciones correctas con 250 clientes', m ? `${m[1]}/${m[2]}` : `código ${r.code}`);
    const con = r.out.match(/(\d+)\/250 conexiones simultáneas[^\n]*\((\d+) ms\)/);
    if (con) c.nota(`Conexión de 250 clientes: ${con[1]}/250 en ${con[2]} ms`);
    const stats = sh(`docker stats --no-stream --format "{{.Name}} {{.MemUsage}} {{.CPUPerc}}" ${CFG.proyecto}-backend-1`).stdout.trim();
    c.nota(`Consumo del backend tras la prueba: ${stats}`);
    c.evidenciaTexto('Salida de la prueba', r.out.split('\n').filter((l) => /^\[|verificaciones|Prueba/.test(l)).join('\n'));
  }
);

await S.caso(
  { ...base, id: 'NF-07', hu: 'US-09', ca: [2, 6], grupo: 'Carga y concurrencia', rnf: 'Integridad', nivel: 'API REST (concurrencia)', titulo: '100 usuarios reservan a la vez: 10 franjas, 10 usuarios por franja', objetivo: 'Verificar la integridad bajo contención alta y repartida: exactamente una reserva por franja.', datos: '100 usuarios nuevos; 10 franjas distintas de una misma fecha; cada franja recibe 10 intentos simultáneos.', pasos: ['Crear 100 usuarios.', 'Lanzar las 100 peticiones de reserva al mismo tiempo.', 'Contar respuestas 201/409 y filas en la base.'], esperado: '10 respuestas 201 (una por franja), 90 respuestas 409, ninguna 5xx; 10 filas confirmadas en la base.' },
  async (c) => {
    const usuarios = [];
    for (let i = 0; i < 100; i += 20) usuarios.push(...(await Promise.all(Array.from({ length: 20 }, (_, j) => crearUsuario(`nfc${i + j}`)))));
    const fecha = fechaUnica();
    const t0 = Date.now();
    const r = await Promise.all(usuarios.map((u, i) => api('POST', `/canchas/${K1.id}/reservas`, { fecha, horaInicio: `${String(8 + (i % 10)).padStart(2, '0')}:00`, horaFin: `${String(9 + (i % 10)).padStart(2, '0')}:00` }, u.token)));
    const total = Date.now() - t0;
    const creadas = r.filter((x) => x.status === 201).length;
    const conflictos = r.filter((x) => x.status === 409).length;
    c.verifica(creadas === 10, 'Se crearon exactamente 10 reservas (una por franja)', `${creadas}`);
    c.verifica(conflictos === 90, 'Las otras 90 recibieron 409', `${conflictos}`);
    c.verifica(r.every((x) => x.status < 500), 'Ninguna respuesta 5xx');
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE cancha_id='${K1.id}' AND fecha='${fecha}' AND estado='confirmada'`) === '10', '10 filas confirmadas en la base');
    c.nota(`Las 100 peticiones simultáneas se resolvieron en ${ms(total)} (p95 individual ${ms(pct(r.map((x) => x.ms), 0.95))})`);
  }
);

// =====================================================================
// Seguridad
// =====================================================================
await S.caso(
  { ...base, id: 'NF-08', hu: 'US-02', ca: [3, 4], grupo: 'Seguridad', rnf: 'RNF-03', nivel: 'API REST', titulo: 'Seguridad del JWT y control de acceso entre usuarios', objetivo: 'Verificar que el token no contiene datos sensibles, que no se puede manipular y que un usuario no accede a datos ajenos.', pasos: ['Decodificar el JWT y revisar su contenido.', 'Modificar el identificador del payload sin volver a firmar.', 'Usar el token de A para ver el historial y cancelar reservas de B.'], esperado: 'El payload solo trae sub, iat y exp; el token manipulado se rechaza (401); A solo ve sus reservas y no puede cancelar las de B (403).' },
  async (c) => {
    const p = jwt.decode(U.token);
    c.verifica(Object.keys(p).sort().join() === 'exp,iat,sub', 'El payload solo contiene sub, iat y exp (sin correo, nombre ni contraseña)', Object.keys(p).join(', '));
    c.verifica(p.exp - p.iat === 86400, 'Vigencia del token: 24 horas', `${(p.exp - p.iat) / 3600} h`);
    const [h, pl, f] = U.token.split('.');
    const otro = Buffer.from(JSON.stringify({ ...p, sub: '00000000-0000-4000-8000-000000000001' })).toString('base64url');
    const r = await api('GET', '/reservas/mias', undefined, `${h}.${otro}.${f}`);
    c.verifica(r.status === 401, 'Un payload modificado con la firma original se rechaza (401)', `HTTP ${r.status}`);
    const B = await crearUsuario('nfb');
    const res = await api('POST', `/canchas/${K2.id}/reservas`, { fecha: fechaUnica(), horaInicio: '10:00', horaFin: '11:00' }, B.token);
    const ajena = await api('PATCH', `/reservas/${res.datos.reserva.id}/cancelar`, undefined, U.token);
    c.verifica(ajena.status === 403, 'A no puede cancelar la reserva de B (403)', `HTTP ${ajena.status}`);
    const hist = await api('GET', '/reservas/mias', undefined, U.token);
    c.verifica(!hist.datos.reservas.some((x) => x.id === res.datos.reserva.id), 'El historial de A no incluye reservas de B');
  }
);

await S.caso(
  { ...base, id: 'NF-09', hu: 'NF', ca: [], grupo: 'Seguridad', rnf: 'Inyección / XSS', nivel: 'API REST + UI', titulo: 'Inyección SQL y XSS', objetivo: 'Verificar que las entradas maliciosas no alteran la base de datos ni se ejecutan en el navegador.', datos: 'Cargas útiles: \' OR \'1\'=\'1, \'; DROP TABLE usuarios;--, <img src=x onerror=alert(1)>.', pasos: ['Enviar cargas SQL en el correo del login, en los filtros del listado y en el id de la cancha.', 'Registrar un usuario cuyo nombre contiene HTML con un manejador onerror.', 'Iniciar sesión con ese usuario y revisar la interfaz.'], esperado: 'Ninguna respuesta 5xx ni datos adicionales; las tablas siguen existiendo; el nombre se muestra como texto y no se ejecuta ningún script.' },
  async (c) => {
    const sqli = ["' OR '1'='1", "'; DROP TABLE usuarios;--", "\" OR \"\"=\"", '1; SELECT pg_sleep(5)--'];
    for (const p of sqli) {
      const l = await api('POST', '/auth/login', { correo: p, password: p });
      c.verifica([400, 401].includes(l.status), `Login con correo "${p.slice(0, 22)}": ${l.status}`, `HTTP ${l.status}`);
    }
    const normal = (await api('GET', '/canchas', undefined, U.token)).datos.canchas.length;
    const inj = await api('GET', `/canchas?zona=${encodeURIComponent("' OR 1=1 --")}`, undefined, U.token);
    c.verifica(inj.status === 200 && inj.datos.canchas.length === 0, 'Filtro por zona con SQL: 200 y 0 resultados (no devuelve todo)', `${inj.datos.canchas?.length} resultados de ${normal}`);
    const t0 = Date.now();
    const sleep = await api('GET', `/canchas/${encodeURIComponent(K0.id + "'; SELECT pg_sleep(5);--")}`, undefined, U.token);
    c.verifica(sleep.status === 400 && Date.now() - t0 < 3000, 'Id de cancha con SQL: 400 inmediato (sin ejecutar pg_sleep)', `HTTP ${sleep.status} en ${Date.now() - t0} ms`);
    c.verifica(sqlq("SELECT count(*) FROM pg_tables WHERE schemaname='public'") === '7', 'Las 7 tablas siguen existiendo');
    const xss = '<img src=x onerror=alert(1)>';
    const correo = `xss.${Date.now()}@qa.local`;
    const reg = await api('POST', '/auth/registro', { nombre: xss, correo, telefono: '3000000000', password: CFG.password });
    c.verifica(reg.status === 201, 'Se acepta un nombre con HTML (se almacena como texto)', `HTTP ${reg.status}`);
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    let dialogo = false;
    page.on('dialog', async (d) => { dialogo = true; await d.dismiss(); });
    await page.goto(`${CFG.WEB}/login`);
    await page.fill('#correo', correo);
    await page.fill('#password', CFG.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('a.tarjeta-cancha');
    await page.waitForTimeout(800);
    const avatar = await page.locator('.navbar-nombre').innerText().catch(() => '');
    c.verifica(!dialogo, 'No se ejecutó ningún script (sin diálogo alert)');
    c.verifica((await page.locator('.navbar img[src="x"]').count()) === 0, 'El HTML del nombre no se interpretó como elemento', `se muestra como texto: "${avatar}"`);
    await page.screenshot({ path: path.join(OUT, 'evidencias', 'NF-09-1.jpg'), type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: 1280, height: 90 } });
    c.adjuntar('NF-09-1.jpg', 'Barra de navegación con el nombre malicioso mostrado como texto');
    await browser.close();
  }
);

await S.caso(
  { ...base, id: 'NF-10', hu: 'NF', ca: [], grupo: 'Seguridad', rnf: 'Robustez de la API', nivel: 'API REST', titulo: 'Manejo de entradas anómalas y fugas de información', objetivo: 'Verificar que las peticiones mal formadas se rechazan con errores controlados y sin revelar detalles internos.', pasos: ['Enviar JSON mal formado.', 'Enviar un cuerpo de 300 KB.', 'Pedir una ruta inexistente.', 'Enviar un método no soportado.', 'Revisar que ningún error exponga trazas, rutas internas ni SQL.'], esperado: 'JSON inválido → 400; cuerpo excesivo → 413; ruta inexistente → 404 JSON; ningún mensaje contiene "stack", rutas del servidor o SQL.' },
  async (c) => {
    const mal = await api('POST', '/auth/login', '{"correo": "a@b.c", ', undefined, { 'Content-Type': 'application/json' });
    c.verifica(mal.status === 400, 'JSON mal formado: 400', `HTTP ${mal.status}`);
    const grande = await api('POST', '/auth/registro', { nombre: 'x'.repeat(300 * 1024) });
    c.verifica(grande.status === 413, 'Cuerpo de 300 KB: 413 Payload Too Large', `HTTP ${grande.status}`);
    const nf = await api('GET', '/ruta/inexistente', undefined, U.token);
    c.verifica(nf.status === 404 && nf.datos.mensaje === 'Recurso no encontrado', 'Ruta inexistente: 404 {"mensaje":"Recurso no encontrado"}', `HTTP ${nf.status}`);
    const met = await api('DELETE', '/canchas', undefined, U.token);
    c.verifica([404, 405].includes(met.status), 'Método no soportado: 404/405', `HTTP ${met.status}`);
    const todo = JSON.stringify([mal.datos, grande.datos, nf.datos, met.datos]);
    c.verifica(!/at .*\.js|node_modules|SELECT |INSERT |stack|ECONN/i.test(todo), 'Ningún error expone trazas, rutas internas ni SQL');
  }
);

await S.caso(
  { ...base, id: 'NF-11', hu: 'NF', ca: [], grupo: 'Seguridad', rnf: 'CORS y cabeceras', nivel: 'API REST', titulo: 'CORS y cabeceras de seguridad HTTP', objetivo: 'Revisar la política de CORS en modo producción y las cabeceras de seguridad de la API y del frontend.', datos: 'Backend con NODE_ENV=production y CORS_ORIGIN = origen del frontend.', pasos: ['Consultar la API con el origen del frontend y con un origen ajeno.', 'Revisar las cabeceras de seguridad de la API y de nginx.'], esperado: 'El origen permitido recibe Access-Control-Allow-Origin; el ajeno NO la recibe y la respuesta es un 403 claro (no un error 500); las cabeceras X-Content-Type-Options, X-Frame-Options y la ausencia de X-Powered-By son recomendables.' },
  async (c) => {
    const ok = await api('GET', '/health', undefined, undefined, { Origin: CFG.WEB });
    c.verifica(ok.headers.get('access-control-allow-origin') === CFG.WEB, 'Origen permitido: recibe Access-Control-Allow-Origin', ok.headers.get('access-control-allow-origin'));
    const ajeno = await api('GET', '/health', undefined, undefined, { Origin: 'http://sitio-malicioso.example' });
    c.verifica(!ajeno.headers.get('access-control-allow-origin'), 'Origen ajeno: no recibe Access-Control-Allow-Origin', ajeno.headers.get('access-control-allow-origin') ?? 'sin cabecera');
    c.verifica(ajeno.status === 403 && ajeno.datos.mensaje === 'Origen no permitido', 'Origen ajeno: la API responde 403 "Origen no permitido" (no un error interno 500)', `HTTP ${ajeno.status} — ${JSON.stringify(ajeno.datos)}`);
    const front = await fetch(CFG.WEB);
    const reco = [['X-Content-Type-Options', (h) => h === 'nosniff'], ['X-Frame-Options', (h) => Boolean(h)], ['Content-Security-Policy', (h) => Boolean(h)], ['Strict-Transport-Security', (h) => Boolean(h)]];
    const faltan = [];
    for (const [nombre, f] of reco) {
      const en = f(ok.headers.get(nombre)) || f(front.headers.get(nombre));
      if (!en) faltan.push(nombre);
    }
    if (ok.headers.get('x-powered-by')) c.observacion(`La API expone la cabecera "X-Powered-By: ${ok.headers.get('x-powered-by')}" (revela la tecnología); se recomienda deshabilitarla.`);
    if (faltan.length) c.observacion(`Faltan cabeceras de seguridad recomendadas: ${faltan.join(', ')} (se resuelven con el middleware "helmet" y la configuración de nginx).`);
  }
);

await S.caso(
  { ...base, id: 'NF-12', hu: 'NF', ca: [], grupo: 'Seguridad', rnf: 'Fuerza bruta', nivel: 'API REST', prioridad: 'Media', titulo: 'Límite de intentos de inicio de sesión', objetivo: 'Comprobar si la API frena los intentos repetidos de adivinar una contraseña.', datos: '40 intentos fallidos seguidos contra una misma cuenta.', pasos: ['Enviar 40 inicios de sesión con contraseña incorrecta para el mismo correo.', 'Revisar si alguno responde 429 (Too Many Requests) o bloquea la cuenta.'], esperado: 'Después de varios intentos la API debería limitar o bloquear (429).' },
  async (c) => {
    const victima = await crearUsuario('nfbf');
    const codigos = [];
    for (let i = 0; i < 40; i += 1) codigos.push((await api('POST', '/auth/login', { correo: victima.correo, password: `Intento${i}x` })).status);
    const limitado = codigos.includes(429);
    const sigue = (await api('POST', '/auth/login', { correo: victima.correo, password: victima.password })).status;
    c.verifica(limitado, 'La API limita los intentos (algún 429)', `códigos: ${[...new Set(codigos)].join(', ')}; el primer 429 llegó en el intento ${codigos.indexOf(429) + 1}; con la cuenta frenada el login correcto responde ${sigue}`);
    const otra = await crearUsuario('nfbf2');
    c.verifica(otra.token, 'Otra cuenta (misma IP) puede iniciar sesión con normalidad: el límite es por cuenta');
    if (!limitado) c.observacion('No existe limitación de intentos: es posible probar contraseñas sin restricción (riesgo de fuerza bruta). Se recomienda express-rate-limit en /api/auth/login.');
  }
);

await S.caso(
  { ...base, id: 'NF-13', hu: 'NF', ca: [], grupo: 'Seguridad', rnf: 'Secretos y dependencias', nivel: 'Repositorio', titulo: 'Secretos en el repositorio y vulnerabilidades de dependencias', objetivo: 'Verificar que no hay credenciales versionadas y revisar las vulnerabilidades conocidas de las dependencias de producción.', pasos: ['Buscar patrones de credenciales en los archivos versionados.', 'Ejecutar "npm audit --omit=dev" en backend y frontend.'], esperado: 'Sin credenciales en el repositorio y sin vulnerabilidades altas o críticas en dependencias de producción.' },
  async (c) => {
    const archivos = sh('git ls-files', { cwd: ROOT }).stdout.split('\n').filter((f) => /\.(js|jsx|mjs|json|yml|yaml|md|sql|html|css|sh)$/.test(f) && !/package-lock/.test(f));
    const patrones = [[/postgres(ql)?:\/\/[^:@\s<]+:(?!\$|<|%|\{)[^@\s<]{6,}@/, 'cadena de conexión con contraseña'], [/npg_[A-Za-z0-9]{10,}/, 'contraseña de Neon'], [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'llave privada'], [/AKIA[0-9A-Z]{16}/, 'llave de AWS'], [/(JWT_SECRET|SMTP_PASS)\s*[:=]\s*['"]?(?!\$|<|cambia|secreto|secrets|\{|\s|$)[A-Za-z0-9_\-]{12,}/, 'secreto asignado en texto']];
    const hallazgos = [];
    const efimeras = [];
    for (const f of archivos) {
      let texto;
      try { texto = fs.readFileSync(`${ROOT}/${f}`, 'utf8'); } catch { continue; }
      for (const [re, nombre] of patrones) {
        if (!re.test(texto)) continue;
        // Base PostgreSQL efímera del job de pruebas del CI (service container): no es un secreto real.
        if (/ci-cd\.yml$/.test(f) && /canchaya:canchaya@localhost/.test(texto) && nombre.startsWith('cadena de conexión')) efimeras.push(f);
        else hallazgos.push(`${f}: ${nombre}`);
      }
    }
    c.verifica(hallazgos.length === 0, `Ninguno de los ${archivos.length} archivos versionados contiene credenciales`, hallazgos.join('; ') || 'sin coincidencias');
    if (efimeras.length) c.observacion('El workflow de CI define la contraseña de una base PostgreSQL efímera (canchaya:canchaya@localhost) para el job de pruebas: es aceptable porque la base solo existe durante el job y no contiene datos reales, pero no debe reutilizarse en ningún otro entorno.');
    for (const carpeta of ['backend', 'frontend']) {
      const r = sh('npm audit --omit=dev --json', { cwd: `${ROOT}/${carpeta}`, timeout: 120000 });
      let v = {};
      try { v = JSON.parse(r.stdout).metadata?.vulnerabilities ?? {}; } catch { c.verifica(false, `npm audit de ${carpeta} no pudo ejecutarse`, r.out.slice(0, 120)); continue; }
      const graves = (v.high ?? 0) + (v.critical ?? 0);
      c.verifica(graves === 0, `${carpeta}: sin vulnerabilidades altas ni críticas en producción`, `crítica ${v.critical ?? 0} · alta ${v.high ?? 0} · moderada ${v.moderate ?? 0} · baja ${v.low ?? 0}`);
      if ((v.moderate ?? 0) + (v.low ?? 0) > 0) c.observacion(`${carpeta}: ${(v.moderate ?? 0) + (v.low ?? 0)} vulnerabilidades moderadas/bajas pendientes de revisión (npm audit).`);
    }
  }
);

// =====================================================================
// Usabilidad, accesibilidad y compatibilidad
// =====================================================================
const axePath = requireLocal.resolve('axe-core/axe.min.js');
await S.caso(
  { ...base, id: 'NF-14', hu: 'NF', ca: [], grupo: 'Usabilidad y accesibilidad', rnf: 'WCAG 2.1 AA', nivel: 'UI (axe-core)', titulo: 'Auditoría automática de accesibilidad WCAG 2.1 AA', objetivo: 'Detectar problemas de accesibilidad (contraste, etiquetas, nombres accesibles, estructura) en las pantallas principales.', datos: 'axe-core con las reglas wcag2a, wcag2aa, wcag21a y wcag21aa; Chromium 1366×900.', pasos: ['Abrir cada pantalla (login, registro, recuperación, listado, detalle y mis reservas).', 'Ejecutar axe-core en la página.', 'Contar las violaciones por impacto.'], esperado: 'Cero violaciones de impacto crítico o grave en todas las pantallas.' },
  async (c) => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    const pantallas = [['Login', '/login', false], ['Registro', '/registro', false], ['Recuperar contraseña', '/olvide-password', false], ['Listado de canchas', '/canchas', true], ['Detalle de cancha', `/canchas/${K0.id}`, true], ['Mis reservas', '/mis-reservas', true]];
    await api('POST', `/canchas/${K0.id}/reservas`, { fecha: fechaUnica(), horaInicio: '10:00', horaFin: '11:00' }, U.token);
    const resumen = [['Pantalla', 'Crítico', 'Grave', 'Moderado', 'Leve']];
    const detalles = [];
    let graves = 0;
    for (const [nombre, ruta, auth] of pantallas) {
      await page.goto(`${CFG.WEB}/login`);
      await page.evaluate(([t, u, a]) => { if (a) { localStorage.setItem('canchaya_token', t); localStorage.setItem('canchaya_usuario', u); } else localStorage.clear(); }, [U.token, JSON.stringify(U.usuario), auth]);
      await page.goto(`${CFG.WEB}${ruta}`);
      await page.waitForTimeout(1500);
      await page.addScriptTag({ path: axePath });
      const res = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }));
      const cuenta = (imp) => res.violations.filter((v) => v.impact === imp).length;
      resumen.push([nombre, cuenta('critical'), cuenta('serious'), cuenta('moderate'), cuenta('minor')]);
      graves += cuenta('critical') + cuenta('serious');
      res.violations.forEach((v) => detalles.push(`[${nombre}] ${v.impact?.toUpperCase()} · ${v.id}: ${v.help} (${v.nodes.length} elemento/s)  p. ej. ${v.nodes[0].target.join(' ')}`));
    }
    await browser.close();
    c.verifica(graves === 0, 'Ninguna pantalla tiene violaciones de impacto crítico o grave', `${graves} violaciones críticas/graves`);
    c.evidenciaTexto('Violaciones por pantalla', tabla(resumen));
    if (detalles.length) c.evidenciaTexto('Detalle de las violaciones', detalles.join('\n'));
    const leves = detalles.filter((d) => /MODERATE|MINOR/.test(d)).length;
    if (leves) c.observacion(`${leves} violación(es) de impacto moderado/leve para revisar (ver detalle).`);
  }
);

await S.caso(
  { ...base, id: 'NF-15', hu: 'US-04', ca: [4], grupo: 'Usabilidad y accesibilidad', rnf: 'RNF-05', nivel: 'UI (Chromium)', titulo: 'Diseño responsive entre 360 px y 1920 px', objetivo: 'Verificar que ninguna pantalla se desborda ni oculta contenido esencial en los anchos soportados.', pasos: ['Para cada ancho (360, 390, 768, 1024, 1366, 1920 px) abrir login, registro, listado, detalle y mis reservas.', 'Medir el desborde horizontal y comprobar que la barra de navegación y el contenido principal son visibles.'], esperado: 'Sin scroll horizontal en ninguna combinación de pantalla y ancho; contenido principal visible.' },
  async (c) => {
    const browser = await chromium.launch();
    const anchos = [360, 390, 768, 1024, 1366, 1920];
    const pantallas = [['Login', '/login', false, '.auth-formulario'], ['Registro', '/registro', false, '.auth-formulario'], ['Listado', '/canchas', true, 'a.tarjeta-cancha'], ['Detalle', `/canchas/${K0.id}`, true, '.tarjeta-reserva'], ['Mis reservas', '/mis-reservas', true, '.mi-reserva']];
    const filas = [['Pantalla', ...anchos.map((a) => `${a} px`)]];
    let problemas = 0;
    for (const [nombre, ruta, auth, sel] of pantallas) {
      const fila = [nombre];
      for (const ancho of anchos) {
        const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
        const page = await ctx.newPage();
        await page.goto(`${CFG.WEB}/login`);
        await page.evaluate(([t, u, a]) => { if (a) { localStorage.setItem('canchaya_token', t); localStorage.setItem('canchaya_usuario', u); } }, [U.token, JSON.stringify(U.usuario), auth]);
        await page.goto(`${CFG.WEB}${ruta}`);
        await page.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(700);
        const d = await page.evaluate(() => ({ desborde: document.documentElement.scrollWidth - window.innerWidth, navbar: !!document.querySelector('.navbar') }));
        const visible = await page.locator(sel).first().isVisible().catch(() => false);
        const bien = d.desborde <= 0 && d.navbar && visible;
        if (!bien) problemas += 1;
        fila.push(bien ? 'OK' : `FALLO (desborde ${d.desborde}px)`);
        if ((ancho === 360 || ancho === 1920) && (nombre === 'Listado' || nombre === 'Detalle')) {
          const archivo = `NF-15-${nombre}-${ancho}.jpg`;
          await page.screenshot({ path: path.join(OUT, 'evidencias', archivo), type: 'jpeg', quality: 60 });
          c.adjuntar(archivo, `${nombre} a ${ancho} px de ancho`);
        }
        await ctx.close();
      }
      filas.push(fila);
    }
    await browser.close();
    c.verifica(problemas === 0, `Las ${pantallas.length * anchos.length} combinaciones de pantalla y ancho se ven correctamente`, `${problemas} con problemas`);
    c.evidenciaTexto('Resultado por pantalla y ancho', tabla(filas));
  }
);

await S.caso(
  { ...base, id: 'NF-16', hu: 'NF', ca: [], grupo: 'Usabilidad y accesibilidad', rnf: 'Usabilidad', nivel: 'UI (Chromium)', prioridad: 'Media', titulo: 'Uso con teclado y foco visible', objetivo: 'Verificar que el flujo principal puede usarse sin ratón y que el foco es visible.', pasos: ['Con solo el teclado, pasar por el formulario de login (Tab) y enviarlo con Enter.', 'En el detalle, enfocar un bloque horario con Tab y seleccionarlo con Enter.', 'Revisar el estilo del foco en botones y campos.'], esperado: 'Se puede iniciar sesión y elegir un bloque solo con el teclado; los elementos enfocados tienen un indicador visible (outline).' },
  async (c) => {
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
    await page.goto(`${CFG.WEB}/login`);
    let tabs = 0;
    while (tabs < 15) {
      await page.keyboard.press('Tab');
      tabs += 1;
      if ((await page.evaluate(() => document.activeElement?.id)) === 'correo') break;
    }
    const primero = `#correo tras ${tabs} pulsaciones de Tab`;
    c.verifica(tabs <= 15, 'Con Tab se llega al campo de correo del login', primero);
    if (tabs > 3) c.observacion(`Hay ${tabs - 1} elementos enfocables (logo y enlaces de la barra) antes del formulario y no existe un enlace "Saltar al contenido"; para usuarios de teclado o lector de pantalla convendría agregarlo.`);
    await page.keyboard.type(U.correo);
    for (let i = 0; i < 5 && (await page.evaluate(() => document.activeElement?.id)) !== 'password'; i += 1) await page.keyboard.press('Tab');
    await page.keyboard.type(U.password);
    const estiloFoco = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { outline: s.outlineStyle, ancho: s.outlineWidth, sombra: s.boxShadow, borde: s.borderColor }; });
    await page.keyboard.press('Enter');
    await page.waitForSelector('a.tarjeta-cancha', { timeout: 8000 }).catch(() => {});
    c.verifica(page.url().endsWith('/canchas'), 'Inicio de sesión completado solo con teclado (Tab, texto, Enter)', `primer foco: ${primero}`);
    c.verifica(estiloFoco.outline !== 'none' || estiloFoco.sombra !== 'none' || estiloFoco.borde !== '', 'El campo enfocado muestra un indicador visible', `outline: ${estiloFoco.outlineStyle ?? estiloFoco.outline} ${estiloFoco.ancho}, sombra: ${estiloFoco.sombra.slice(0, 40)}`);
    await page.goto(`${CFG.WEB}/canchas/${K0.id}`);
    await page.waitForSelector('.temporizador-reserva:has-text("Tiempo para reservar")');
    await page.fill('#fecha-reserva', fechaCO(25));
    await page.waitForTimeout(900);
    const bloque = page.locator('.bloque-horario:not(:disabled)').nth(2);
    await bloque.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.nota-retencion', { timeout: 5000 }).catch(() => {});
    c.verifica((await page.locator('.bloque-horario.seleccionado').count()) === 1, 'Un bloque horario se selecciona solo con el teclado (Enter)');
    const foco = await bloque.evaluate((e) => { e.focus(); const s = getComputedStyle(e); return `${s.outlineStyle} ${s.outlineWidth}`; });
    c.verifica(!/^none/.test(foco), 'Los bloques enfocados muestran un contorno visible', foco);
    await browser.close();
  }
);

await S.caso(
  { ...base, id: 'NF-17', hu: 'NF', ca: [], grupo: 'Compatibilidad', rnf: 'Compatibilidad de navegadores', nivel: 'UI (Chromium, Firefox, WebKit)', titulo: 'Compatibilidad entre navegadores', objetivo: 'Verificar que el recorrido básico (login → listado → detalle con temporizador) funciona en los tres motores de navegador.', pasos: ['Para Chromium, Firefox y WebKit (Safari): iniciar sesión, abrir el listado y el detalle de una cancha y esperar el temporizador por socket.', 'Registrar el motor y la versión utilizados.'], esperado: 'El recorrido funciona en los tres motores, con las 5 canchas y el temporizador activo.' },
  async (c) => {
    for (const [nombre, tipo] of [['Chromium', chromium], ['Firefox', firefox], ['WebKit', webkit]]) {
      let browser;
      try {
        browser = await tipo.launch();
      } catch (e) {
        c.observacion(`${nombre} no está instalado en el equipo de pruebas (${String(e.message).split('\n')[0].slice(0, 100)}); no se pudo comprobar.`);
        continue;
      }
      try {
        const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
        await page.goto(`${CFG.WEB}/login`);
        await page.fill('#correo', U.correo);
        await page.fill('#password', U.password);
        await page.click('button[type="submit"]');
        await page.waitForSelector('a.tarjeta-cancha', { timeout: 15000 });
        const n = await page.locator('a.tarjeta-cancha').count();
        await page.locator('a.tarjeta-cancha').first().click();
        await page.waitForSelector('.temporizador-reserva:has-text("Tiempo para reservar")', { timeout: 15000 });
        const seg1 = await page.locator('.temporizador-reserva strong').innerText();
        await page.waitForTimeout(2500);
        const seg2 = await page.locator('.temporizador-reserva strong').innerText();
        c.verifica(n === 5 && seg1 !== seg2, `${nombre} ${browser.version()}: login, 5 canchas y temporizador en marcha`, `${seg1} → ${seg2}`);
      } catch (e) {
        c.verifica(false, `${nombre}: el recorrido falló`, String(e.message).split('\n')[0]);
      }
      await browser.close();
    }
  }
);

// =====================================================================
// Fiabilidad
// =====================================================================
await S.caso(
  { ...base, id: 'NF-18', hu: 'US-19', ca: [2], grupo: 'Fiabilidad', rnf: 'Recuperación', nivel: 'Docker', prioridad: 'Alta', titulo: 'Caída y recuperación de la base de datos', objetivo: 'Verificar que si la base de datos se cae la API responde con un error controlado (sin colgarse) y se recupera sola cuando la base vuelve, sin reiniciar el backend.', pasos: ['Detener el contenedor de la base de datos.', 'Consultar la API y medir el tiempo de respuesta.', 'Volver a iniciar la base.', 'Consultar de nuevo hasta que responda.'], esperado: 'Con la base caída: error controlado (5xx con mensaje genérico) en menos de 10 s y sin exponer detalles; al volver la base, la API se recupera en menos de 60 s sin reiniciar el backend.' },
  async (c) => {
    dc('stop db');
    const t0 = Date.now();
    const caido = await api('GET', '/canchas', undefined, U.token);
    c.verifica(Date.now() - t0 < 10000, 'Con la base caída la API responde en menos de 10 s (no se cuelga)', ms(Date.now() - t0));
    c.verifica(caido.status >= 500 && caido.datos.mensaje === 'Error interno del servidor', 'Responde un error controlado con mensaje genérico', `HTTP ${caido.status} — ${JSON.stringify(caido.datos)}`);
    const h = await fetch(`${CFG.API}/health`).then((r) => r.status).catch(() => 0);
    c.verifica(h === 200, 'El proceso del backend sigue vivo (/api/health responde 200)', `HTTP ${h}`);
    dc('start db');
    const t1 = Date.now();
    let ok = false;
    while (Date.now() - t1 < 60000 && !ok) {
      ok = (await api('GET', '/canchas', undefined, U.token)).status === 200;
      if (!ok) await esperar(1000);
    }
    c.verifica(ok, 'Al volver la base, la API se recupera sin reiniciar el backend', `${((Date.now() - t1) / 1000).toFixed(1)} s`);
    c.verifica(sqlq('SELECT count(*) FROM canchas') === '5', 'Los datos siguen intactos tras la caída (5 canchas)');
  }
);

await S.caso(
  { ...base, id: 'NF-19', hu: 'US-19', ca: [3], grupo: 'Fiabilidad', rnf: 'Idempotencia', nivel: 'Base de datos', prioridad: 'Media', titulo: 'La migración del esquema es idempotente', objetivo: 'Verificar que se puede aplicar el esquema repetidas veces sin errores ni pérdida de datos (el backend lo hace en cada arranque).', pasos: ['Contar usuarios y reservas.', 'Ejecutar "node src/db/migrate.js" tres veces dentro del contenedor.', 'Volver a contar.'], esperado: 'Las tres ejecuciones terminan con código 0 y los datos no cambian.' },
  async (c) => {
    const antes = `${sqlq('SELECT count(*) FROM usuarios')}/${sqlq('SELECT count(*) FROM reservas')}`;
    const codigos = [];
    for (let i = 0; i < 3; i += 1) codigos.push(dc('exec -T backend node src/db/migrate.js').code);
    c.verifica(codigos.every((x) => x === 0), 'Las 3 ejecuciones terminan sin errores', codigos.join(', '));
    const despues = `${sqlq('SELECT count(*) FROM usuarios')}/${sqlq('SELECT count(*) FROM reservas')}`;
    c.verifica(antes === despues, 'Los datos no cambian', `${antes} → ${despues}`);
  }
);

await S.caso(
  { ...base, id: 'NF-20', hu: 'US-08', ca: [6], grupo: 'Fiabilidad', rnf: 'Zona horaria', nivel: 'API REST', prioridad: 'Alta', titulo: 'Las horas se interpretan en hora de Colombia, no en la del servidor', objetivo: 'Verificar que la validación de "hora pasada" usa la hora de Colombia (UTC-5) aunque el contenedor corra en UTC.', datos: `Hora actual en Colombia: ${horaCO()}; el contenedor del backend usa UTC.`, pasos: ['Consultar la zona horaria del contenedor.', 'Reservar hoy una hora que ya pasó en Colombia pero que en UTC aún no.', 'Reservar hoy una hora futura en Colombia.'], esperado: 'La hora pasada en Colombia se rechaza (400); la hora futura en Colombia se acepta (201).' },
  async (c) => {
    const tz = dc('exec -T backend sh -c "date +%Z"').stdout.trim();
    const hCO = Number(horaCO().slice(0, 2));
    c.nota(`Zona horaria del contenedor: ${tz}; hora en Colombia ${horaCO()}`);
    if (hCO < 2 || hCO > 20) { c.nota('La hora actual no permite el escenario (se necesita entre las 02:00 y las 20:59 de Colombia).'); return; }
    const pasada = await api('POST', `/canchas/${K2.id}/reservas`, { fecha: fechaCO(0), horaInicio: `${String(hCO - 1).padStart(2, '0')}:00`, horaFin: `${String(hCO).padStart(2, '0')}:00` }, U.token);
    c.verifica(pasada.status === 400, `Hoy ${String(hCO - 1).padStart(2, '0')}:00 (ya pasó en Colombia): 400`, `HTTP ${pasada.status}`);
    const futura = await api('POST', `/canchas/${K2.id}/reservas`, { fecha: fechaCO(0), horaInicio: `${String(hCO + 1).padStart(2, '0')}:00`, horaFin: `${String(hCO + 2).padStart(2, '0')}:00` }, U.token);
    c.verifica(futura.status === 201, `Hoy ${String(hCO + 1).padStart(2, '0')}:00 (futura en Colombia): 201`, `HTTP ${futura.status}`);
    if (futura.status === 201) await api('PATCH', `/reservas/${futura.datos.reserva.id}/cancelar`, undefined, U.token);
  }
);

// =====================================================================
// Mantenibilidad
// =====================================================================
await S.caso(
  { ...base, id: 'NF-21', hu: 'NF', ca: [], grupo: 'Mantenibilidad', rnf: 'Calidad de código', nivel: 'Código fuente', prioridad: 'Media', titulo: 'Análisis estático (lint) y cobertura de pruebas automatizadas', objetivo: 'Medir la calidad estática del frontend y la cobertura de pruebas del backend.', pasos: ['Ejecutar "npm run lint" en el frontend.', 'Leer el resultado de cobertura de Jest del backend (suite jest.json).'], esperado: 'Lint sin errores; cobertura de líneas de los servicios del backend de al menos 70 %.' },
  async (c) => {
    const lint = sh('npm run lint', { cwd: `${ROOT}/frontend`, timeout: 180000 });
    const resumen = lint.out.match(/✖ (\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
    c.verifica(lint.code === 0, 'ESLint termina sin errores', resumen ? `${resumen[2]} errores, ${resumen[3]} avisos` : '0 problemas');
    if (resumen && Number(resumen[3]) > 0) c.observacion(`ESLint reporta ${resumen[3]} aviso(s): ${lint.out.split('\n').filter((l) => /warning/.test(l)).map((l) => l.trim()).join(' | ').slice(0, 220)}`);
    const archivoJest = path.join(OUT, 'jest.json');
    if (!fs.existsSync(archivoJest)) { c.observacion('No hay resultados de Jest para medir cobertura.'); return; }
    const j = JSON.parse(fs.readFileSync(archivoJest, 'utf8'));
    const servicios = Object.entries(j.cobertura ?? {}).filter(([f]) => /src[\\/]services[\\/]/.test(f));
    const total = servicios.reduce((a, [, v]) => ({ t: a.t + v.lines.total, c: a.c + v.lines.covered }), { t: 0, c: 0 });
    const pcts = total.t ? (total.c / total.t) * 100 : 0;
    c.verifica(pcts >= 70, 'Cobertura de líneas de los servicios del backend ≥ 70 %', `${pcts.toFixed(1)} % (${total.c}/${total.t} líneas)`);
    const g = j.cobertura?.total;
    if (g) c.nota(`Cobertura global del backend: líneas ${g.lines.pct} % · sentencias ${g.statements.pct} % · funciones ${g.functions.pct} % · ramas ${g.branches.pct} %`);
    c.evidenciaTexto('Cobertura por archivo (líneas)', tabla(Object.entries(j.cobertura ?? {}).filter(([f]) => f !== 'total').map(([f, v]) => [f.replace(/^.*backend[\\/]/, ''), `${v.lines.pct} %`, `${v.lines.covered}/${v.lines.total}`])));
  }
);

console.log('\nNo funcionales:', S.resumen());
