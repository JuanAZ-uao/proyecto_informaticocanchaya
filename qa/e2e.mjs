// Suite E2E: flujos completos en el navegador (Playwright + Chromium) contra el entorno Docker.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { Suite, CFG, EVID, api, sql, logsBackend, crearUsuario, canchas, esperar, fechaCO, horaCO } from './lib.mjs';

const S = new Suite('e2e', 'Pruebas End-to-End (navegador)');
const base = { tipo: 'End-to-End', nivel: 'UI (Chromium)', prioridad: 'Alta' };
const sqlq = (q) => sql(q.replace(/\s+/g, ' '));
const browser = await chromium.launch();
const erroresConsola = [];
let diaE2E = 1;
const proximoDia = () => fechaCO((diaE2E += 1));
// Entre semana el horario es de 06:00 a 22:00 y el fin de semana de 07:00 a 20:00: los casos que cuentan bloques usan un día hábil.
const proximoDiaHabil = () => {
  let fecha = proximoDia();
  while ([0, 6].includes(new Date(`${fecha}T00:00:00`).getDay())) fecha = proximoDia();
  return fecha;
};

// ---------- Helpers ----------
async function abrirSesion(usuario, { viewport = { width: 1366, height: 900 }, movil = false, init } = {}) {
  const context = await browser.newContext({ viewport, ...(movil ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', (e) => erroresConsola.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && erroresConsola.push(`console: ${m.text()}`));
  await page.goto(`${CFG.WEB}/login`);
  if (usuario) {
    await page.evaluate(([t, u]) => {
      localStorage.setItem('canchaya_token', t);
      localStorage.setItem('canchaya_usuario', u);
    }, [usuario.token, JSON.stringify(usuario.usuario)]);
  }
  return { context, page };
}

const bloque = (page, hora) => page.locator('.bloque-horario', { hasText: `${hora} -` }).first();
const claseDe = async (page, hora) => (await bloque(page, hora).getAttribute('class')) || '';
async function esperarClase(page, hora, clase, presente = true, ms = 6000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if ((await claseDe(page, hora)).includes(clase) === presente) return true;
    await page.waitForTimeout(100);
  }
  return false;
}
async function abrirCancha(page, cancha, fecha) {
  await page.goto(`${CFG.WEB}/canchas/${cancha.id}`);
  await page.waitForSelector('#fecha-reserva');
  await page.waitForSelector('.temporizador-reserva:has-text("Tiempo para reservar")');
  if (fecha) {
    await page.fill('#fecha-reserva', fecha);
    await page.waitForTimeout(1000);
  }
}
async function elegirBloque(page, hora) {
  await bloque(page, hora).click();
  await page.waitForSelector('.nota-retencion');
}
async function confirmarPorUI(page, hora) {
  await elegirBloque(page, hora);
  await page.click('button:has-text("Iniciar reserva")');
  await page.waitForSelector('.resumen-reserva');
  await page.click('button:has-text("Confirmar reserva")');
  await page.waitForSelector('.confirmacion-reserva');
}
const segundosTimer = async (page) => {
  const [m, s] = (await page.locator('.temporizador-reserva strong').first().innerText()).split(':').map(Number);
  return m * 60 + s;
};
const guardarCaptura = async (page, nombre, selector) => {
  const archivo = `${nombre}.jpg`;
  const destino = path.join(EVID, archivo);
  if (selector) await page.locator(selector).first().screenshot({ path: destino, type: 'jpeg', quality: 72 });
  else await page.screenshot({ path: destino, type: 'jpeg', quality: 72 });
  return archivo;
};

const lista = await canchas();
const [K0, K1, K2, K3, K4] = lista;

// ---------- Prueba larga en tiempo real (≈ 3 min) lanzada desde el inicio ----------
const SOLO = process.env.SOLO ? process.env.SOLO.split(',') : null;
const larga = (SOLO && !SOLO.includes('E2E-21')) ? Promise.resolve(null) : (async () => {
  const A = await crearUsuario('e2elarga');
  const B = await crearUsuario('e2eobs');
  const sa = await abrirSesion(A);
  const sb = await abrirSesion(B);
  const fecha = fechaCO(40);
  await abrirCancha(sa.page, K3, fecha);
  await abrirCancha(sb.page, K3, fecha);
  await elegirBloque(sa.page, '10:00');
  const r = { archivos: {} };
  const tLectura = Date.now();
  r.inicioSeg = await segundosTimer(sa.page);
  r.bObservaRetenida = await esperarClase(sb.page, '10:00', 'retenido');
  r.archivos.inicio = await guardarCaptura(sa.page, 'E2E-L-1', '.tarjeta-reserva');
  r.archivos.observador = await guardarCaptura(sb.page, 'E2E-L-2', '.tarjeta-reserva');
  const t0 = Date.now();
  await sa.page.waitForSelector('.temporizador-aviso', { timeout: 200000 });
  r.avisoSeg = await segundosTimer(sa.page);
  r.avisoTranscurrido = (Date.now() - t0) / 1000;
  r.avisoTexto = (await sa.page.locator('.temporizador-aviso').innerText()).trim();
  r.avisoUrgente = (await sa.page.locator('.temporizador-urgente').count()) > 0;
  r.archivos.aviso = await guardarCaptura(sa.page, 'E2E-L-3', '.tarjeta-reserva');
  await sa.page.waitForSelector('.temporizador-expirado', { timeout: 90000 });
  r.expiroTranscurrido = (Date.now() - t0) / 1000;
  r.expiroDesdeLectura = (Date.now() - tLectura) / 1000;
  r.tituloExpirado = (await sa.page.locator('.temporizador-titulo').innerText()).trim();
  r.bloquesHabilitados = await sa.page.locator('.bloque-horario:not(:disabled)').count();
  r.fechaDeshabilitada = await sa.page.locator('#fecha-reserva').isDisabled();
  r.iniciarDeshabilitado = await sa.page.locator('button:has-text("Iniciar reserva")').isDisabled();
  r.archivos.expirado = await guardarCaptura(sa.page, 'E2E-L-4', '.tarjeta-reserva');
  r.bLiberada = await esperarClase(sb.page, '10:00', 'retenido', false, 8000);
  r.archivos.observadorLibre = await guardarCaptura(sb.page, 'E2E-L-5', '.tarjeta-reserva');
  await sa.page.click('button:has-text("Reiniciar temporizador")');
  await sa.page.waitForSelector('.temporizador-reserva strong');
  await sa.page.waitForTimeout(800);
  r.reinicioSeg = await segundosTimer(sa.page);
  r.bloquesTrasReinicio = await sa.page.locator('.bloque-horario:not(:disabled)').count();
  r.archivos.reinicio = await guardarCaptura(sa.page, 'E2E-L-6', '.tarjeta-reserva');
  await sa.context.close();
  await sb.context.close();
  return r;
})();

// =====================================================================
// Autenticación (US-01, US-02, US-03)
// =====================================================================
const credenciales = { nombre: 'Laura Pérez QA', correo: `e2e.reg.${Date.now()}@qa.local`, telefono: '3105550101', password: CFG.password };

await S.caso(
  { ...base, id: 'E2E-01', hu: 'US-01', hus: ['US-01', 'US-02', 'US-04'], ca: { 'US-01': [1], 'US-02': [1], 'US-04': [1] }, grupo: 'Autenticación', titulo: 'Registro → inicio de sesión → listado de canchas', objetivo: 'Recorrer la puerta de entrada de la aplicación como un visitante nuevo.', datos: `${credenciales.nombre}, ${credenciales.correo}, teléfono ${credenciales.telefono}.`, pasos: ['Abrir /registro y completar nombre, correo, teléfono y contraseña.', 'Enviar el formulario.', 'Verificar que redirige a /login con el aviso de cuenta creada.', 'Iniciar sesión con las mismas credenciales.', 'Verificar que se llega al listado de canchas y que las fotos cargan.'], esperado: 'La cuenta se crea y redirige a /login con el mensaje "Cuenta creada correctamente. Ahora inicia sesión."; el login lleva a /canchas con 5 canchas, sus fotos cargadas y el nombre del usuario en la barra.' },
  async (c) => {
    const { context, page } = await abrirSesion(null);
    await page.goto(`${CFG.WEB}/registro`);
    await page.fill('#nombre', credenciales.nombre);
    await page.fill('#correo', credenciales.correo);
    await page.fill('#telefono', credenciales.telefono);
    await page.fill('#password', credenciales.password);
    await c.captura(page, 'Formulario de registro completado');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/login');
    c.verifica(page.url().endsWith('/login'), 'Tras registrarse redirige a la pantalla de inicio de sesión', page.url());
    c.verifica(await page.locator('.mensaje-exito:has-text("Cuenta creada correctamente")').isVisible(), 'Muestra "Cuenta creada correctamente. Ahora inicia sesión."');
    await c.captura(page, 'Pantalla de login con el aviso de cuenta creada');
    await page.fill('#correo', credenciales.correo);
    await page.fill('#password', credenciales.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('a.tarjeta-cancha');
    c.verifica(page.url().endsWith('/canchas'), 'El inicio de sesión lleva al listado de canchas', page.url());
    c.verifica((await page.locator('a.tarjeta-cancha').count()) === 5, 'El listado muestra las 5 canchas');
    await page.waitForTimeout(800);
    const fotos = await page.$$eval('a.tarjeta-cancha img', (imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length);
    c.verifica(fotos === 5, 'Las 5 fotos de las canchas cargan', `${fotos}/5`);
    c.verifica((await page.locator('.navbar-nombre').innerText()).trim() === 'Laura', 'La barra muestra el nombre del usuario ("Laura")');
    await c.captura(page, 'Listado de canchas tras iniciar sesión');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-02', hu: 'US-01', ca: [2, 3], grupo: 'Autenticación', titulo: 'Registro: validaciones y correo duplicado (casos de error)', objetivo: 'Verificar los mensajes de error del formulario de registro y que no se crean cuentas inválidas.', pasos: ['Enviar el formulario vacío.', 'Registrar con una contraseña sin números.', 'Registrar con el correo de una cuenta existente.'], esperado: 'El formulario vacío no se envía; la contraseña débil muestra el mensaje de la política; el correo duplicado muestra "El correo ya está registrado"; en los tres casos se permanece en /registro.' },
  async (c) => {
    const { context, page } = await abrirSesion(null);
    await page.goto(`${CFG.WEB}/registro`);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(600);
    c.verifica(page.url().endsWith('/registro'), 'Formulario vacío: no se envía y se permanece en /registro');
    await c.captura(page, 'Formulario vacío: validación del navegador');
    await page.fill('#nombre', 'Prueba');
    await page.fill('#correo', `debil.${Date.now()}@qa.local`);
    await page.fill('#telefono', '3000000000');
    await page.fill('#password', 'SoloLetrasAqui');
    let peticiones = 0;
    page.on('request', (r) => r.url().includes('/auth/registro') && (peticiones += 1));
    await page.click('button[type="submit"]');
    await page.waitForTimeout(800);
    const nativo = await page.$eval('#password', (i) => ({ mismatch: i.validity.patternMismatch, mensaje: i.title }));
    c.verifica(nativo.mismatch && peticiones === 0, 'Contraseña débil: el navegador bloquea el envío (no se hace ninguna petición al servidor)', `patrón no cumplido; ayuda: "${nativo.mensaje}"`);
    c.verifica(page.url().endsWith('/registro'), 'Se permanece en /registro');
    await c.captura(page, 'Contraseña que no cumple la política: el formulario no se envía');
    const existente = await crearUsuario('e2edup');
    await page.fill('#correo', existente.correo);
    await page.fill('#password', existente.password);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.mensaje-error')?.textContent.includes('ya está registrado'));
    c.verifica(page.url().endsWith('/registro'), 'Correo duplicado: permanece en /registro');
    c.verifica(/El correo ya está registrado/.test(await page.locator('.mensaje-error').first().innerText()), 'Muestra "El correo ya está registrado"');
    c.verifica(sqlq(`SELECT count(*) FROM usuarios WHERE correo='${existente.correo}'`) === '1', 'No se creó una cuenta duplicada en la base');
    await c.captura(page, 'Error por correo duplicado');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-03', hu: 'US-02', ca: [2, 3, 4], grupo: 'Autenticación', titulo: 'Login fallido, rutas protegidas, persistencia de sesión y cierre de sesión', objetivo: 'Verificar el acceso a rutas protegidas y el mensaje genérico de error.', pasos: ['Abrir /canchas sin sesión.', 'Intentar iniciar sesión con contraseña incorrecta.', 'Iniciar sesión correctamente y recargar la página.', 'Pulsar "Salir" y volver a abrir /canchas.'], esperado: 'Sin sesión se redirige a /login; la contraseña incorrecta muestra "Correo o contraseña incorrectos"; la sesión sobrevive a la recarga; tras "Salir" se vuelve a pedir login.' },
  async (c) => {
    const cuenta = await crearUsuario('e2eauth');
    const { context, page } = await abrirSesion(null);
    await page.goto(`${CFG.WEB}/canchas`);
    await page.waitForURL('**/login**');
    c.verifica(/\/login/.test(page.url()), 'Sin sesión, /canchas redirige al login', page.url());
    await page.fill('#correo', cuenta.correo);
    await page.fill('#password', 'ContraseñaIncorrecta1');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.mensaje-error');
    const msg = (await page.locator('.mensaje-error').innerText()).trim();
    c.verifica(msg === 'Correo o contraseña incorrectos', 'Credenciales incorrectas: mensaje genérico', msg);
    await c.captura(page, 'Mensaje genérico de credenciales incorrectas');
    await page.fill('#password', cuenta.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('a.tarjeta-cancha');
    await page.reload();
    await page.waitForSelector('a.tarjeta-cancha');
    c.verifica(page.url().endsWith('/canchas'), 'Tras recargar la página la sesión se mantiene');
    await page.click('button:has-text("Salir")');
    await page.waitForURL('**/login');
    await page.goto(`${CFG.WEB}/canchas`);
    await page.waitForURL('**/login**');
    c.verifica(/\/login/.test(page.url()), 'Tras "Salir", /canchas vuelve a pedir login');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-04', hu: 'US-03', ca: [1, 2, 3, 4], grupo: 'Autenticación', titulo: 'Recuperación de contraseña de punta a punta', objetivo: 'Recorrer la recuperación: solicitar, abrir el enlace, cambiar la contraseña y comprobar que el enlace no se reutiliza.', datos: 'SMTP sin configurar: el enlace se toma del log del backend (modo desarrollo).', pasos: ['Abrir /olvide-password y solicitar el enlace con un correo registrado y con uno no registrado.', 'Abrir el enlace del log.', 'Enviar contraseñas que no coinciden.', 'Definir una contraseña nueva válida.', 'Iniciar sesión con la nueva contraseña.', 'Reabrir el mismo enlace y volver a enviar.'], esperado: 'Mensaje neutro idéntico en ambos correos; "Las contraseñas no coinciden" con valores distintos; redirige a /login tras el cambio; el login con la nueva funciona; el enlace reutilizado se rechaza.' },
  async (c) => {
    const u = await crearUsuario('e2erec');
    const { context, page } = await abrirSesion(null);
    await page.goto(`${CFG.WEB}/olvide-password`);
    await page.fill('#correo', 'nadie@qa.local');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.mensaje-exito');
    const neutro1 = (await page.locator('.mensaje-exito').innerText()).trim();
    await page.fill('#correo', u.correo);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(700);
    const neutro2 = (await page.locator('.mensaje-exito').innerText()).trim();
    c.verifica(neutro1 === neutro2 && /Si el correo está registrado/.test(neutro1), 'El mensaje es neutro e idéntico para un correo registrado y uno inexistente', neutro1);
    await c.captura(page, 'Mensaje neutro tras solicitar la recuperación');
    await esperar(600);
    const enlace = [...logsBackend('5m').matchAll(/\[EMAIL\] Para: (\S+) -> (\S+)/g)].filter((m) => m[1] === u.correo).pop()?.[2];
    c.verifica(Boolean(enlace), 'El backend generó el enlace de restablecimiento para el correo registrado');
    const ruta = new URL(enlace).pathname + new URL(enlace).search;
    await page.goto(`${CFG.WEB}${ruta}`);
    await page.fill('#nuevaPassword', 'NuevaClave456');
    await page.fill('#confirmarPassword', 'OtraDistinta789');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.mensaje-error');
    c.verifica(/no coinciden/.test(await page.locator('.mensaje-error').innerText()), 'Contraseñas distintas: "Las contraseñas no coinciden"');
    await c.captura(page, 'Error: las contraseñas no coinciden');
    await page.fill('#confirmarPassword', 'NuevaClave456');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/login');
    c.verifica(page.url().endsWith('/login'), 'Tras cambiar la contraseña redirige a /login');
    await page.fill('#correo', u.correo);
    await page.fill('#password', 'NuevaClave456');
    await page.click('button[type="submit"]');
    await page.waitForSelector('a.tarjeta-cancha');
    c.verifica(true, 'Inicia sesión con la contraseña nueva y llega al listado');
    await page.click('button:has-text("Salir")');
    await page.goto(`${CFG.WEB}${ruta}`);
    await page.fill('#nuevaPassword', 'ClaveReusada123');
    await page.fill('#confirmarPassword', 'ClaveReusada123');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.mensaje-error');
    c.verifica(/inválido o ha expirado/.test(await page.locator('.mensaje-error').innerText()), 'El enlace ya usado se rechaza: "inválido o ha expirado"');
    await c.captura(page, 'Enlace reutilizado rechazado');
    await page.goto(`${CFG.WEB}/restablecer-password`);
    c.verifica(await page.locator('.mensaje-error:has-text("no es válido")').isVisible(), 'Sin token en la URL: "El enlace de recuperación no es válido. Solicita uno nuevo."');
    await context.close();
  }
);

// =====================================================================
// Catálogo (US-04, US-05, US-06, US-07)
// =====================================================================
const U1 = await crearUsuario('e2ecat');

await S.caso(
  { ...base, id: 'E2E-05', hu: 'US-06', hus: ['US-04', 'US-06'], ca: { 'US-04': [1, 2], 'US-06': [1, 2, 3] }, grupo: 'Catálogo', titulo: 'Listado, filtros y estado vacío', objetivo: 'Verificar el listado, cada filtro, el botón Limpiar y el mensaje cuando no hay resultados.', pasos: ['Abrir el listado y leer el contador.', 'Filtrar por una zona.', 'Filtrar por precio máximo bajo.', 'Filtrar por una zona inexistente.', 'Pulsar "Limpiar".'], esperado: 'El contador coincide con las tarjetas; cada filtro reduce el listado; sin coincidencias aparece "No encontramos canchas con esos filtros"; "Limpiar" restaura las 5 canchas.' },
  async (c) => {
    const { context, page } = await abrirSesion(U1);
    await page.goto(`${CFG.WEB}/canchas`);
    await page.waitForSelector('a.tarjeta-cancha');
    c.verifica(/5 canchas/.test(await page.locator('.contador').innerText()), 'El contador indica "5 canchas"');
    await c.captura(page, 'Listado completo con filtros');
    const zona = lista[0].zona;
    await page.fill('#zona', zona);
    await page.click('button:has-text("Buscar")');
    await page.waitForTimeout(800);
    const nZona = await page.locator('a.tarjeta-cancha').count();
    c.verifica(nZona >= 1 && nZona < 5, `Filtro por zona "${zona}": ${nZona} resultado(s)`);
    await c.captura(page, `Resultados filtrados por zona "${zona}"`);
    await page.click('button:has-text("Limpiar")');
    await page.waitForTimeout(800);
    c.verifica((await page.locator('a.tarjeta-cancha').count()) === 5, '"Limpiar" restaura las 5 canchas');
    const precios = lista.map((k) => k.costoHora).sort((a, b) => a - b);
    await page.fill('#precioMax', String(precios[1]));
    await page.click('button:has-text("Buscar")');
    await page.waitForTimeout(800);
    const nMax = await page.locator('a.tarjeta-cancha').count();
    c.verifica(nMax === lista.filter((k) => k.costoHora <= precios[1]).length, `Filtro precio máx. ${precios[1]}: ${nMax} resultado(s), los esperados`);
    await page.click('button:has-text("Limpiar")');
    await page.fill('#zona', 'ZonaInexistente');
    await page.click('button:has-text("Buscar")');
    await page.waitForSelector('.estado-vacio');
    c.verifica(/No encontramos canchas con esos filtros/.test(await page.locator('.estado-vacio').innerText()), 'Sin coincidencias: "No encontramos canchas con esos filtros"');
    await c.captura(page, 'Estado vacío del listado');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-06', hu: 'US-05', ca: [1], grupo: 'Catálogo', titulo: 'Detalle de la cancha: foto, descripción, servicios y horarios', objetivo: 'Verificar el contenido comercial y la información de la ficha de una cancha.', pasos: ['Desde el listado, hacer clic en una cancha.', 'Revisar la portada con foto y crédito, la descripción, los servicios y el horario semanal.'], esperado: 'La ficha muestra foto (cargada), crédito del autor, precio, descripción, servicios con íconos, horario de los 7 días con el día de hoy resaltado y la tarjeta de reserva.' },
  async (c) => {
    const { context, page } = await abrirSesion(U1);
    await page.goto(`${CFG.WEB}/canchas`);
    await page.waitForSelector('a.tarjeta-cancha');
    await page.locator('a.tarjeta-cancha').first().click();
    await page.waitForSelector('#fecha-reserva');
    await page.waitForTimeout(900);
    const foto = await page.$eval('.detalle-hero-foto', (i) => ({ ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth }));
    c.verifica(foto.ok, 'La foto de portada carga', `${foto.w} px de ancho`);
    c.verifica((await page.locator('.credito-foto').innerText()).trim().length > 5, 'Muestra el crédito del autor de la foto', (await page.locator('.credito-foto').innerText()).trim());
    c.verifica((await page.locator('.detalle-descripcion').innerText()).length > 40, 'Muestra la descripción comercial');
    c.verifica((await page.locator('.grid-servicios li').count()) >= 3, 'Lista los servicios', `${await page.locator('.grid-servicios li').count()} servicios`);
    c.verifica((await page.locator('.lista-horarios li').count()) === 7, 'Muestra el horario de los 7 días', '7 filas');
    c.verifica((await page.locator('.lista-horarios li.hoy .etiqueta-hoy').count()) === 1, 'Resalta el día de hoy con la etiqueta "Hoy"');
    c.verifica(/Desde/.test(await page.locator('.detalle-precio').innerText()) && /\$/.test(await page.locator('.detalle-precio').innerText()), 'Muestra el precio por hora');
    await c.captura(page, 'Portada y datos de la cancha');
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(400);
    await c.captura(page, 'Descripción, servicios, horario y tarjeta de reserva');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-07', hu: 'US-07', hus: ['US-07', 'US-08'], ca: { 'US-07': [1, 2, 3], 'US-08': [2, 3] }, grupo: 'Catálogo', titulo: 'Selección de fecha y bloques de 1 hora; día sin horario', objetivo: 'Verificar que se ofrecen bloques de 1 hora dentro del horario, que "Iniciar reserva" se habilita solo con un bloque libre y que un día sin horario no ofrece bloques.', datos: 'Se elimina temporalmente el horario de un día de una cancha en la base de pruebas.', pasos: ['Abrir la cancha y elegir una fecha futura.', 'Revisar los bloques y el estado del botón.', 'Seleccionar un bloque.', 'Elegir una fecha cuyo día de la semana no tiene horario.'], esperado: '16 bloques de 06:00 a 22:00; "Iniciar reserva" deshabilitado hasta elegir un bloque; en el día sin horario aparece "La cancha no tiene horarios disponibles para el día seleccionado." y ningún bloque.' },
  async (c) => {
    const { context, page } = await abrirSesion(U1);
    const fecha = proximoDiaHabil();
    await abrirCancha(page, K4, fecha);
    const bloques = await page.locator('.bloque-horario').allInnerTexts();
    c.verifica(bloques.length === 16 && bloques[0].startsWith('06:00 - 07:00') && bloques.at(-1).startsWith('21:00 - 22:00'), 'Se ofrecen 16 bloques de 1 hora, de 06:00 a 22:00', `${bloques.length} bloques`);
    c.verifica(/16/.test(await page.locator('.bloques-encabezado').innerText()), 'Indica "16 bloques libres"');
    c.verifica(await page.locator('button:has-text("Iniciar reserva")').isDisabled(), 'Sin bloque elegido, "Iniciar reserva" está deshabilitado');
    await c.captura(page, 'Bloques disponibles y botón deshabilitado', '.tarjeta-reserva');
    await bloque(page, '16:00').click();
    await page.waitForSelector('.nota-retencion');
    c.verifica(await page.locator('button:has-text("Iniciar reserva")').isEnabled(), 'Con un bloque libre elegido, "Iniciar reserva" se habilita');
    const dia = new Date(`${fecha}T00:00:00`).getDay();
    const guardado = sqlq(`SELECT hora_inicio||'|'||hora_fin FROM horarios_disponibles WHERE cancha_id='${K4.id}' AND dia_semana=${dia}`);
    sqlq(`DELETE FROM horarios_disponibles WHERE cancha_id='${K4.id}' AND dia_semana=${dia}`);
    try {
      await page.reload();
      await page.waitForSelector('.temporizador-reserva:has-text("Tiempo para reservar")');
      await page.fill('#fecha-reserva', fecha);
      await page.waitForTimeout(900);
      c.verifica(await page.locator('.estado-vacio:has-text("no tiene horarios disponibles")').isVisible(), 'Día sin horario: "La cancha no tiene horarios disponibles para el día seleccionado."');
      c.verifica((await page.locator('.bloque-horario').count()) === 0, 'No se ofrece ningún bloque');
      await c.captura(page, 'Día sin horario de atención', '.tarjeta-reserva');
    } finally {
      const [hi, hf] = guardado.split('|');
      sqlq(`INSERT INTO horarios_disponibles (cancha_id, dia_semana, hora_inicio, hora_fin) VALUES ('${K4.id}', ${dia}, '${hi}', '${hf}')`);
    }
    await context.close();
  }
);

// =====================================================================
// Flujo de reserva (US-08, US-09, US-10, US-11)
// =====================================================================
await S.caso(
  { ...base, id: 'E2E-08', hu: 'US-10', hus: ['US-10', 'US-11'], ca: { 'US-10': [1, 2, 3, 5], 'US-11': [2, 4, 8] }, grupo: 'Flujo de reserva', titulo: 'Flujo completo cronometrado: cancha → fecha y hora → confirmar', objetivo: 'Medir cuánto tarda y cuántos pasos requiere reservar una cancha de principio a fin, y verificar que no se piden datos que ya están en la sesión.', pasos: ['Iniciar el cronómetro en el listado de canchas (usuario con sesión).', 'Paso 1: hacer clic en una cancha.', 'Paso 2: elegir la fecha y hacer clic en un bloque.', 'Paso 3: "Iniciar reserva" → revisar el resumen → "Confirmar reserva".', 'Detener el cronómetro al ver la pantalla de confirmación.'], esperado: 'El flujo se completa en 3 pasos y en menos de 2 minutos (objetivo); la ficha no pide nombre ni correo; el resumen muestra cancha, fecha, horario, costo y el usuario de la sesión.' },
  async (c) => {
    const U = await crearUsuario('e2eflow');
    const { context, page } = await abrirSesion(U);
    await page.goto(`${CFG.WEB}/canchas`);
    await page.waitForSelector('a.tarjeta-cancha');
    const fecha = proximoDia();
    const clics = [];
    const t0 = Date.now();
    await page.locator('a.tarjeta-cancha', { hasText: K1.nombre }).click();
    clics.push('Clic en la cancha');
    await page.waitForSelector('#fecha-reserva');
    const t1 = Date.now();
    c.verifica(t1 - t0 < 5000, 'Paso 1: del listado al detalle con un solo clic', `${((t1 - t0) / 1000).toFixed(1)} s`);
    const camposPersonales = await page.locator('input[type="text"], input[type="email"], input[name*="nombre"], input[name*="correo"]').count();
    c.verifica(camposPersonales === 0, 'La ficha no pide nombre ni correo (sin campos de datos personales)');
    await page.waitForSelector('.temporizador-reserva:has-text("Tiempo para reservar")');
    await page.fill('#fecha-reserva', fecha);
    clics.push('Elegir fecha');
    await page.waitForTimeout(900);
    await c.captura(page, 'Paso 2: fecha y bloques disponibles', '.tarjeta-reserva');
    await bloque(page, '18:00').click();
    clics.push('Clic en el bloque');
    await page.waitForSelector('.nota-retencion');
    await page.click('button:has-text("Iniciar reserva")');
    clics.push('Clic en "Iniciar reserva"');
    await page.waitForSelector('.resumen-reserva');
    const resumen = await page.locator('.resumen-reserva').innerText();
    c.verifica(resumen.includes(K1.nombre) && /18:00 - 19:00/.test(resumen) && /\$/.test(resumen), 'El resumen muestra cancha, horario y costo', resumen.replace(/\n+/g, ' | ').slice(0, 170));
    c.verifica(resumen.includes(U.nombre) && resumen.includes(U.correo), 'El resumen toma nombre y correo de la sesión', `${U.nombre} (${U.correo})`);
    await c.captura(page, 'Paso 3: resumen antes de confirmar', '.tarjeta-reserva');
    await page.click('button:has-text("Confirmar reserva")');
    clics.push('Clic en "Confirmar reserva"');
    await page.waitForSelector('.confirmacion-reserva');
    const total = (Date.now() - t0) / 1000;
    c.verifica(total < 120, 'El flujo completo tarda menos de 2 minutos', `${total.toFixed(1)} s`);
    c.verifica(clics.length <= 5, 'Interacciones totales del usuario', `${clics.length}: ${clics.join(' → ')}`);
    c.nota('Pasos del flujo: (1) elegir la cancha, (2) elegir fecha y hora, (3) confirmar (resumen + botón). Total: 3 pasos.');
    await c.captura(page, 'Pantalla de confirmación', '.tarjeta-reserva');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-09', hu: 'US-10', ca: [4], grupo: 'Flujo de reserva', titulo: 'Retroceder conserva cancha, fecha y hora', objetivo: 'Verificar que "Cambiar horario" y recargar la página no pierden la selección.', pasos: ['Elegir fecha y bloque e ir al resumen.', 'Pulsar "Cambiar horario".', 'Recargar la página.', 'Volver a pulsar "Iniciar reserva".'], esperado: 'Tras "Cambiar horario" la fecha y el bloque siguen elegidos; tras recargar también (y se vuelve a apartar la franja); el reingreso al resumen funciona.' },
  async (c) => {
    const U = await crearUsuario('e2eback');
    const { context, page } = await abrirSesion(U);
    const fecha = proximoDia();
    await abrirCancha(page, K1, fecha);
    await elegirBloque(page, '15:00');
    await page.click('button:has-text("Iniciar reserva")');
    await page.waitForSelector('.resumen-reserva');
    await page.click('button:has-text("Cambiar horario")');
    await page.waitForSelector('.nota-retencion');
    c.verifica((await page.inputValue('#fecha-reserva')) === fecha && (await claseDe(page, '15:00')).includes('seleccionado'), 'Tras "Cambiar horario": misma fecha y bloque 15:00 elegido');
    await c.captura(page, 'Después de "Cambiar horario": la selección se conserva', '.tarjeta-reserva');
    await page.reload();
    await page.waitForSelector('.temporizador-reserva:has-text("Tiempo para reservar")');
    await page.waitForSelector('.nota-retencion');
    c.verifica((await page.inputValue('#fecha-reserva')) === fecha && (await claseDe(page, '15:00')).includes('seleccionado'), 'Tras recargar la página: se conserva la fecha y el bloque y la franja se vuelve a apartar');
    await page.click('button:has-text("Iniciar reserva")');
    await page.waitForSelector('.resumen-reserva');
    c.verifica(true, 'Se puede volver a entrar al resumen sin repetir la selección');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-10', hu: 'US-08', ca: [2, 3], grupo: 'Flujo de reserva', titulo: 'Franjas ocupadas y horas pasadas aparecen "No disponible"', objetivo: 'Verificar que las franjas ya reservadas y las horas de hoy que ya pasaron no se pueden seleccionar.', datos: `Hoy es ${fechaCO(0)} y la hora actual en Colombia es ${horaCO()}.`, pasos: ['Otro usuario reserva el bloque 11:00 de mañana (por API).', 'Abrir esa fecha y revisar el bloque 11:00 y uno libre.', 'Abrir la fecha de hoy y revisar los bloques anteriores a la hora actual.'], esperado: 'El bloque reservado se ve tachado con "No disponible" y está deshabilitado; los bloques libres se pueden elegir; hoy, los bloques cuya hora ya pasó aparecen "No disponible".' },
  async (c) => {
    const A = await crearUsuario('e2eocc');
    const B = await crearUsuario('e2eocc2');
    const fecha = proximoDia();
    const r = await api('POST', `/canchas/${K1.id}/reservas`, { fecha, horaInicio: '11:00', horaFin: '12:00' }, A.token);
    c.verifica(r.status === 201, 'Preparación: A reserva 11:00 por API', `HTTP ${r.status}`);
    const { context, page } = await abrirSesion(B);
    await abrirCancha(page, K1, fecha);
    const ocupado = bloque(page, '11:00');
    c.verifica((await ocupado.isDisabled()) && /No disponible/.test(await ocupado.innerText()), 'El bloque 11:00 aparece deshabilitado con "No disponible"');
    const totalBloques = await page.locator('.bloque-horario').count();
    c.verifica((await page.locator('.bloques-encabezado').innerText()).includes(`${totalBloques - 1} bloques libres`), `El contador descuenta el bloque ocupado: "${totalBloques - 1} bloques libres" (de ${totalBloques})`);
    c.verifica(await bloque(page, '12:00').isEnabled(), 'Un bloque libre (12:00) se puede seleccionar');
    await c.captura(page, 'Bloque 11:00 "No disponible"', '.tarjeta-reserva');
    const horaActual = Number(horaCO().slice(0, 2));
    await page.fill('#fecha-reserva', fechaCO(0));
    await page.waitForTimeout(900);
    if (horaActual >= 7 && horaActual <= 21) {
      const items = await page.locator('.bloque-horario').evaluateAll((els) => els.map((e) => ({ hora: Number(e.innerText.slice(0, 2)), deshabilitado: e.disabled, ocupado: /No disponible/.test(e.innerText) })));
      const pasados = items.filter((x) => x.hora < horaActual);
      const futuros = items.filter((x) => x.hora > horaActual);
      c.verifica(pasados.length > 0 && pasados.every((x) => x.deshabilitado && x.ocupado), `Hoy: los ${pasados.length} bloques anteriores a las ${horaActual}:00 aparecen "No disponible" y deshabilitados`);
      c.verifica(futuros.length > 0 && futuros.every((x) => !x.deshabilitado), `Hoy: los ${futuros.length} bloques posteriores a la hora actual siguen disponibles`);
      await c.captura(page, 'Fecha de hoy: horas pasadas deshabilitadas', '.tarjeta-reserva');
    } else {
      c.nota(`La hora actual (${horaCO()}) está fuera del horario de atención: no hay bloques "pasados" que comprobar hoy.`);
    }
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-11', hu: 'US-08', hus: ['US-08', 'US-09'], ca: { 'US-08': [4], 'US-09': [5] }, grupo: 'Flujo de reserva', titulo: 'La franja se ocupa antes de confirmar: mensaje amigable y poder elegir otra', objetivo: 'Verificar el comportamiento del frontend cuando el backend rechaza porque la franja ya no está disponible, tanto al entrar al resumen como al confirmar.', datos: 'Se elimina de la base la retención del usuario B para simular que la perdió (p. ej. por limpieza) y A reserva la misma franja por API.', pasos: ['B elige un bloque (queda retenido).', 'Se pierde la retención de B y A reserva ese bloque.', 'B pulsa "Iniciar reserva".', 'Repetir con otro bloque, pero esta vez B ya está en el resumen y pulsa "Confirmar reserva".', 'B elige otra franja libre y completa la reserva.'], esperado: 'En ambos casos aparece "El horario ya no está disponible" (mensaje amigable, sin error técnico ni pantalla en blanco), se refrescan las franjas, el bloque queda "No disponible" y B puede elegir otra y confirmar.' },
  async (c) => {
    const A = await crearUsuario('e2econf1');
    const B = await crearUsuario('e2econf2');
    const fecha = proximoDia();
    const { context, page } = await abrirSesion(B);
    await abrirCancha(page, K1, fecha);
    // Escenario 1: al entrar al resumen
    await elegirBloque(page, '09:00');
    sqlq(`DELETE FROM retenciones WHERE usuario_id='${B.id}'`);
    const r1 = await api('POST', `/canchas/${K1.id}/reservas`, { fecha, horaInicio: '09:00', horaFin: '10:00' }, A.token);
    c.verifica(r1.status === 201, 'Preparación: A reserva el bloque 09:00', `HTTP ${r1.status}`);
    await page.waitForTimeout(500);
    await page.click('button:has-text("Iniciar reserva")');
    await page.waitForSelector('.mensaje-error');
    const m1 = (await page.locator('.mensaje-error').first().innerText()).trim();
    c.verifica(/El horario ya no está disponible/.test(m1), 'Al entrar al resumen: muestra "El horario ya no está disponible"', m1);
    c.verifica((await bloque(page, '09:00').isDisabled()) && /No disponible/.test(await bloque(page, '09:00').innerText()), 'Las franjas se refrescan: 09:00 queda "No disponible"');
    c.verifica((await page.locator('.resumen-reserva').count()) === 0 && (await page.locator('.confirmacion-reserva').count()) === 0, 'No se muestra éxito ni resumen');
    await c.captura(page, 'Mensaje amigable al ocuparse la franja', '.tarjeta-reserva');
    // Escenario 2: al confirmar
    await elegirBloque(page, '10:00');
    await page.click('button:has-text("Iniciar reserva")');
    await page.waitForSelector('.resumen-reserva');
    sqlq(`DELETE FROM retenciones WHERE usuario_id='${B.id}'`);
    const r2 = await api('POST', `/canchas/${K1.id}/reservas`, { fecha, horaInicio: '10:00', horaFin: '11:00' }, A.token);
    c.verifica(r2.status === 201, 'Preparación: A reserva el bloque 10:00', `HTTP ${r2.status}`);
    await page.click('button:has-text("Confirmar reserva")');
    await page.waitForSelector('.mensaje-error');
    const m2 = (await page.locator('.mensaje-error').first().innerText()).trim();
    c.verifica(/El horario ya no está disponible/.test(m2) && (await page.locator('.confirmacion-reserva').count()) === 0, 'Al confirmar: muestra "El horario ya no está disponible" y no informa éxito', m2);
    c.verifica(await bloque(page, '10:00').isDisabled(), 'El bloque 10:00 queda deshabilitado');
    await c.captura(page, 'Rechazo al confirmar: mensaje claro', '.tarjeta-reserva');
    // Elegir otra franja y completar
    await confirmarPorUI(page, '12:00');
    c.verifica(/CY-[0-9A-F]{8}/.test(await page.locator('.confirmacion-reserva').innerText()), 'B elige otra franja (12:00) y completa su reserva');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-12', hu: 'US-09', hus: ['US-09', 'US-10', 'US-11'], ca: { 'US-09': [3], 'US-10': [6], 'US-11': [3, 5] }, grupo: 'Flujo de reserva', titulo: 'Doble clic, indicadores de carga y error del servidor', objetivo: 'Verificar que el botón se bloquea mientras la petición está en curso, que se ven indicadores de carga y que un error del servidor no se presenta como éxito.', datos: 'La respuesta de POST /reservas se retrasa 1,5 s con una intercepción de red; en la segunda parte se simula un 500.', pasos: ['Elegir un bloque y pulsar "Iniciar reserva" (observar el texto del botón).', 'Hacer doble clic en "Confirmar reserva" con la respuesta retrasada.', 'Contar las peticiones POST enviadas y las reservas en la base.', 'Con otra franja, simular un error 500 del servidor y confirmar.'], esperado: 'El botón cambia a "Verificando..." y "Confirmando..." y queda deshabilitado; el doble clic envía una sola petición y crea una sola reserva; ante el 500 se muestra "Error interno del servidor" y nunca la pantalla de éxito.' },
  async (c) => {
    const U = await crearUsuario('e2edbl');
    const { context, page } = await abrirSesion(U);
    const fecha = proximoDia();
    await abrirCancha(page, K1, fecha);
    await elegirBloque(page, '13:00');
    await page.route(/\/temporizador\/completar$/, async (route) => {
      await new Promise((r) => setTimeout(r, 900));
      await route.continue();
    });
    await page.click('button:has-text("Iniciar reserva")');
    await page.waitForSelector('button:has-text("Verificando...")');
    c.verifica(await page.locator('button:has-text("Verificando...")').isDisabled(), 'Al entrar al resumen: indicador "Verificando..." y botón deshabilitado');
    await page.waitForSelector('.resumen-reserva');
    await page.unroute(/\/temporizador\/completar$/);
    let posts = 0;
    await page.route(/\/canchas\/[^/]+\/reservas$/, async (route) => {
      if (route.request().method() === 'POST') {
        posts += 1;
        await new Promise((r) => setTimeout(r, 1500));
      }
      await route.continue();
    });
    await page.dblclick('button:has-text("Confirmar reserva")');
    const visto = await page.waitForSelector('button:has-text("Confirmando...")', { timeout: 1200 }).then(() => true).catch(() => false);
    c.verifica(visto && (await page.locator('button:has-text("Confirmando...")').isDisabled()), 'Durante la petición el botón muestra "Confirmando..." y queda deshabilitado');
    await c.captura(page, 'Indicador "Confirmando..." con el botón bloqueado', '.tarjeta-reserva');
    await page.waitForSelector('.confirmacion-reserva');
    await page.waitForTimeout(500);
    c.verifica(posts === 1, 'El doble clic envía una sola petición POST', `${posts} petición(es)`);
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE usuario_id='${U.id}' AND fecha='${fecha}'`) === '1', 'Existe una sola reserva en la base');
    await page.unroute(/\/canchas\/[^/]+\/reservas$/);
    await page.click('button:has-text("Hacer otra reserva")');
    await page.waitForSelector('.temporizador-reserva:has-text("Tiempo para reservar")');
    await page.fill('#fecha-reserva', fecha);
    await page.waitForTimeout(900);
    await elegirBloque(page, '14:00');
    await page.click('button:has-text("Iniciar reserva")');
    await page.waitForSelector('.resumen-reserva');
    await page.route(/\/canchas\/[^/]+\/reservas$/, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Error interno del servidor' }) })
        : route.continue()
    );
    await page.click('button:has-text("Confirmar reserva")');
    await page.waitForSelector('.mensaje-error');
    c.verifica(/Error interno del servidor/.test(await page.locator('.mensaje-error').first().innerText()), 'Ante un 500 se muestra el mensaje de error del servidor');
    c.verifica((await page.locator('.confirmacion-reserva').count()) === 0, 'Nunca se muestra la pantalla de éxito cuando el backend falla');
    await c.captura(page, 'Error del servidor: sin pantalla de éxito', '.tarjeta-reserva');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-13', hu: 'US-11', ca: [1, 2, 4, 6, 7, 8], grupo: 'Flujo de reserva', titulo: 'Pantalla de confirmación, historial y accesos directos', objetivo: 'Verificar la confirmación inmediata y su continuidad: "Ver mis reservas" y "Hacer otra reserva".', pasos: ['Completar una reserva y medir el tiempo entre el clic y la confirmación.', 'Revisar los datos de la confirmación.', 'Pulsar "Ver mis reservas".', 'Volver a la cancha y pulsar "Hacer otra reserva".'], esperado: 'La confirmación aparece en menos de 2 s con código, cancha, fecha, hora y estado; el temporizador ya no cuenta; "Ver mis reservas" lista la reserva con el mismo código y estado "Confirmada"; "Hacer otra reserva" abre un temporizador nuevo.' },
  async (c) => {
    const U = await crearUsuario('e2econfirm');
    const { context, page } = await abrirSesion(U);
    const fecha = proximoDia();
    await abrirCancha(page, K1, fecha);
    await elegirBloque(page, '16:00');
    await page.click('button:has-text("Iniciar reserva")');
    await page.waitForSelector('.resumen-reserva');
    const t0 = Date.now();
    await page.click('button:has-text("Confirmar reserva")');
    await page.waitForSelector('.confirmacion-reserva');
    const ms = Date.now() - t0;
    c.verifica(ms < 2000, 'La confirmación se muestra en menos de 2 segundos', `${ms} ms`);
    const texto = await page.locator('.confirmacion-reserva').innerText();
    const codigo = texto.match(/CY-[0-9A-F]{8}/)?.[0];
    c.verifica(Boolean(codigo), 'Muestra el código de la reserva', codigo);
    c.verifica(texto.includes(K1.nombre) && /16:00 - 17:00/.test(texto) && /confirmada/i.test(texto), 'Muestra cancha, hora y estado "Confirmada"');
    c.verifica((await page.locator('.temporizador-reserva').count()) === 0, 'El temporizador deja de mostrarse tras confirmar');
    await c.captura(page, 'Pantalla de confirmación con código', '.tarjeta-reserva');
    await page.click('a:has-text("Ver mis reservas")');
    await page.waitForSelector('.reserva-item');
    const item = await page.locator('.reserva-item').first().innerText();
    c.verifica(page.url().endsWith('/mis-reservas') && item.includes(codigo) && /Confirmada/i.test(item), '"Ver mis reservas" lista la reserva con su código y estado "Confirmada"', item.replace(/\n+/g, ' · '));
    await c.captura(page, 'Historial "Mis reservas"');
    await page.goto(`${CFG.WEB}/canchas/${K1.id}`);
    await page.waitForSelector('.temporizador-reserva');
    c.verifica(true, 'Se puede volver a la cancha y empezar otra reserva');
    await context.close();
  }
);

// =====================================================================
// Tiempo real (US-17, US-18)
// =====================================================================
await S.caso(
  { ...base, id: 'E2E-14', hu: 'US-17', ca: [2, 3, 4, 5], grupo: 'Temporizador y tiempo real', titulo: 'Cuenta regresiva mm:ss sincronizada con el servidor', objetivo: 'Verificar la cuenta regresiva visible, su formato y su avance.', pasos: ['Abrir el detalle de una cancha.', 'Leer el temporizador al inicio y 4 s después.', 'Confirmar que la barra de progreso está presente.'], esperado: 'Se muestra "Tiempo para reservar: 03:00" aproximadamente al entrar, con formato mm:ss, que decrece con el tiempo y una barra de progreso.' },
  async (c) => {
    const U = await crearUsuario('e2etimer');
    const { context, page } = await abrirSesion(U);
    await abrirCancha(page, K0, proximoDia());
    const t1 = await page.locator('.temporizador-reserva strong').innerText();
    const s1 = await segundosTimer(page);
    await page.waitForTimeout(4200);
    const s2 = await segundosTimer(page);
    c.verifica(/^\d{2}:\d{2}$/.test(t1), 'Formato mm:ss', t1);
    c.verifica(s1 >= 176 && s1 <= 180, 'Al entrar queda cerca de 03:00', `${t1}`);
    c.verifica(s1 - s2 >= 3 && s1 - s2 <= 5, 'La cuenta regresiva decrece con el tiempo', `${s1}s → ${s2}s`);
    c.verifica((await page.locator('.temporizador-barra[role="progressbar"]').count()) === 1, 'Muestra la barra de progreso');
    await c.captura(page, 'Temporizador en marcha', '.tarjeta-reserva');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-15', hu: 'US-17', ca: [3, 4], grupo: 'Temporizador y tiempo real', titulo: 'La cuenta regresiva no depende del reloj local del navegador', objetivo: 'Verificar que el tiempo mostrado se calcula con la hora del servidor y no con el reloj del equipo del usuario (el criterio pide corregir desfases).', datos: 'Se adelanta 120 s el reloj del navegador (Date.now) con un script de inicialización.', pasos: ['Abrir el navegador con el reloj local adelantado 2 minutos.', 'Entrar al detalle de una cancha.', 'Leer el temporizador y esperar a una sincronización (5 s).'], esperado: 'El temporizador debe mostrar ≈ 03:00 (hora del servidor) aunque el reloj local esté adelantado; la sincronización de 5 s debe corregir el desfase.' },
  async (c) => {
    const U = await crearUsuario('e2eskew');
    const { context, page } = await abrirSesion(U, { init: () => { const original = Date.now; Date.now = () => original.call(Date) + 120000; } });
    await abrirCancha(page, K0, proximoDia()).catch(() => {});
    await page.waitForTimeout(6500);
    const texto = await page.locator('.temporizador-reserva').first().innerText().catch(() => '(sin temporizador)');
    const seg = await segundosTimer(page).catch(() => -1);
    c.verifica(seg >= 170 && seg <= 180, 'Con el reloj local adelantado 2 min el temporizador sigue mostrando ≈ 03:00', `se muestra ${texto.replace(/\n+/g, ' ')}${seg >= 0 ? ` (${seg} s)` : ''}`);
    await c.captura(page, 'Temporizador con el reloj local adelantado 2 minutos', '.tarjeta-reserva');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-16', hu: 'US-17', ca: [9, 10], grupo: 'Temporizador y tiempo real', titulo: 'Dos pestañas del mismo usuario comparten el temporizador', objetivo: 'Verificar que abrir la cancha en otra pestaña no reinicia el tiempo y que cerrar una pestaña no cancela la sesión.', pasos: ['Abrir la cancha en la pestaña 1 y esperar 8 s.', 'Abrir la misma cancha en la pestaña 2.', 'Comparar los temporizadores.', 'Cerrar la pestaña 2 y comprobar la pestaña 1.'], esperado: 'Ambas pestañas muestran el mismo tiempo (±2 s) en lugar de 03:00 en la nueva; al cerrar una, la otra sigue contando.' },
  async (c) => {
    const U = await crearUsuario('e2etabs');
    const { context, page: p1 } = await abrirSesion(U);
    await abrirCancha(p1, K0, proximoDia());
    await p1.waitForTimeout(8000);
    const p2 = await context.newPage();
    await abrirCancha(p2, K0);
    const s1 = await segundosTimer(p1);
    const s2 = await segundosTimer(p2);
    c.verifica(Math.abs(s1 - s2) <= 2 && s2 < 176, 'La segunda pestaña muestra el mismo tiempo, no un 03:00 nuevo', `pestaña 1: ${s1} s · pestaña 2: ${s2} s`);
    await c.captura(p2, 'Segunda pestaña: tiempo compartido', '.tarjeta-reserva');
    await p2.close();
    await p1.waitForTimeout(1500);
    const s3 = await segundosTimer(p1);
    c.verifica(s3 < s1 && (await p1.locator('.temporizador-expirado').count()) === 0, 'Al cerrar una pestaña, la otra sigue contando', `${s1} s → ${s3} s`);
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-17', hu: 'US-18', ca: [1, 2, 3, 4, 5], grupo: 'Temporizador y tiempo real', titulo: 'Dos usuarios: retención, cambio de franja, confirmación y cancelación en tiempo real', objetivo: 'Verificar que lo que hace un usuario se refleja en la pantalla de otro sin recargar.', pasos: ['A y B abren la misma cancha y fecha.', 'A elige 09:00.', 'A cambia a 10:00.', 'A confirma 10:00.', 'La reserva de A se cancela.', 'B elige 09:00 y pulsa "Cancelar y liberar la franja".'], esperado: 'B ve 09:00 "En proceso de reserva" (deshabilitado); al cambiar A, B ve 09:00 libre y 10:00 en proceso; al confirmar, B ve 10:00 "No disponible"; al cancelarse, B lo ve libre; la retención de B se libera para A al cancelar.' },
  async (c) => {
    const A = await crearUsuario('e2etra');
    const B = await crearUsuario('e2etrb');
    const sa = await abrirSesion(A);
    const sb = await abrirSesion(B);
    const fecha = proximoDia();
    await abrirCancha(sa.page, K2, fecha);
    await abrirCancha(sb.page, K2, fecha);
    await elegirBloque(sa.page, '09:00');
    c.verifica(await esperarClase(sb.page, '09:00', 'retenido'), 'A elige 09:00: B lo ve "En proceso de reserva" sin recargar');
    c.verifica((await bloque(sb.page, '09:00').isDisabled()) && /En proceso de reserva/.test(await bloque(sb.page, '09:00').innerText()), 'El bloque retenido está deshabilitado y con la etiqueta "En proceso de reserva"');
    await c.captura(sb.page, 'Pantalla de B: 09:00 "En proceso de reserva"', '.tarjeta-reserva');
    await elegirBloque(sa.page, '10:00');
    c.verifica((await esperarClase(sb.page, '09:00', 'retenido', false)) && (await esperarClase(sb.page, '10:00', 'retenido')), 'A cambia a 10:00: B ve 09:00 libre y 10:00 en proceso');
    await sa.page.click('button:has-text("Iniciar reserva")');
    await sa.page.waitForSelector('.resumen-reserva');
    await sa.page.click('button:has-text("Confirmar reserva")');
    await sa.page.waitForSelector('.confirmacion-reserva');
    c.verifica(await esperarClase(sb.page, '10:00', 'ocupado'), 'A confirma: B ve 10:00 "No disponible"');
    await c.captura(sb.page, 'Pantalla de B tras confirmar A: 10:00 "No disponible"', '.tarjeta-reserva');
    const id = sqlq(`SELECT id FROM reservas WHERE usuario_id='${A.id}' AND fecha='${fecha}'`);
    await api('PATCH', `/reservas/${id}/cancelar`, undefined, A.token);
    c.verifica(await esperarClase(sb.page, '10:00', 'ocupado', false), 'Se cancela la reserva de A: B ve 10:00 libre otra vez');
    await elegirBloque(sb.page, '09:00');
    await sb.page.click('button:has-text("Iniciar reserva")');
    await sb.page.waitForSelector('.resumen-reserva');
    await sb.page.click('button:has-text("Cancelar y liberar la franja")');
    await sb.page.waitForSelector('.acciones-reserva button:has-text("Iniciar reserva")');
    c.verifica(sqlq(`SELECT count(*) FROM retenciones WHERE usuario_id='${B.id}'`) === '0', 'B cancela desde el resumen: su retención se elimina de la base');
    await sa.context.close();
    await sb.context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-18', hu: 'US-10', ca: [8], grupo: 'Flujo de reserva', titulo: 'Sesión vencida: redirige al login y al volver se retoma el flujo', objetivo: 'Verificar el manejo de una sesión (JWT) expirada o inválida en medio del flujo.', datos: 'Se invalida el token guardado en el navegador para simular su vencimiento.', pasos: ['Elegir fecha y bloque en una cancha.', 'Invalidar el token y pulsar "Iniciar reserva" (la petición recibe 401).', 'Verificar la redirección a /login con el destino.', 'Iniciar sesión de nuevo.'], esperado: 'La aplicación redirige a /login?redirect=/canchas/:id; tras iniciar sesión vuelve a la misma cancha con la fecha y el bloque que había elegido.' },
  async (c) => {
    const U = await crearUsuario('e2esess');
    const { context, page } = await abrirSesion(U);
    const fecha = proximoDia();
    await abrirCancha(page, K1, fecha);
    await elegirBloque(page, '17:00');
    await page.evaluate(() => localStorage.setItem('canchaya_token', 'token.vencido.invalido'));
    await page.click('button:has-text("Iniciar reserva")');
    await page.waitForURL('**/login**', { timeout: 8000 }).catch(() => {});
    c.verifica(/\/login\?redirect=/.test(page.url()), 'Con la sesión vencida redirige a /login con el destino a retomar', decodeURIComponent(page.url().replace(CFG.WEB, '')));
    await c.captura(page, 'Redirigido al login con ?redirect=');
    await page.fill('#correo', U.correo);
    await page.fill('#password', U.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('#fecha-reserva');
    await page.waitForSelector('.temporizador-reserva:has-text("Tiempo para reservar")');
    c.verifica(page.url().endsWith(`/canchas/${K1.id}`), 'Tras iniciar sesión vuelve a la misma cancha');
    c.verifica((await page.inputValue('#fecha-reserva')) === fecha, 'Recupera la fecha elegida', await page.inputValue('#fecha-reserva'));
    c.verifica(await esperarClase(page, '17:00', 'seleccionado'), 'Recupera el bloque elegido (17:00)');
    await c.captura(page, 'Flujo retomado tras volver a iniciar sesión', '.tarjeta-reserva');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-19', hu: 'US-10', ca: [7], grupo: 'Flujo de reserva', titulo: 'Flujo completo en celular (390 × 844) con emulación táctil', objetivo: 'Verificar que el flujo de reserva funciona en un viewport móvil y que la tarjeta de reserva queda accesible.', pasos: ['Emular un celular (390 × 844, táctil).', 'Elegir una cancha del listado.', 'Elegir fecha y bloque, ir al resumen y confirmar.', 'Revisar que no haya desbordes horizontales.'], esperado: 'El flujo se completa sin gestos especiales, la tarjeta de reserva aparece antes que la información en pantallas angostas y no hay scroll horizontal.' },
  async (c) => {
    const U = await crearUsuario('e2emov');
    const { context, page } = await abrirSesion(U, { viewport: { width: 390, height: 844 }, movil: true });
    await page.goto(`${CFG.WEB}/canchas`);
    await page.waitForSelector('a.tarjeta-cancha');
    await c.captura(page, 'Listado en celular');
    await page.locator('a.tarjeta-cancha', { hasText: K2.nombre }).tap();
    await page.waitForSelector('#fecha-reserva');
    await page.waitForSelector('.temporizador-reserva:has-text("Tiempo para reservar")');
    const posReserva = await page.$eval('.tarjeta-reserva', (e) => e.getBoundingClientRect().top + window.scrollY);
    const posInfo = await page.$eval('.bloque-info', (e) => e.getBoundingClientRect().top + window.scrollY);
    c.verifica(posReserva < posInfo, 'En pantallas angostas la tarjeta de reserva queda antes que la información', `reserva a ${Math.round(posReserva)} px, información a ${Math.round(posInfo)} px`);
    await page.fill('#fecha-reserva', proximoDia());
    await page.waitForTimeout(900);
    await bloque(page, '19:00').scrollIntoViewIfNeeded();
    await bloque(page, '19:00').tap();
    await page.waitForSelector('.nota-retencion');
    await page.locator('button:has-text("Iniciar reserva")').tap();
    await page.waitForSelector('.resumen-reserva');
    await c.captura(page, 'Resumen en celular', '.tarjeta-reserva');
    await page.locator('button:has-text("Confirmar reserva")').tap();
    await page.waitForSelector('.confirmacion-reserva');
    c.verifica(true, 'Reserva confirmada desde el celular');
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    c.verifica(desborde <= 0, 'Sin scroll horizontal', `${desborde} px`);
    await c.captura(page, 'Confirmación en celular', '.tarjeta-reserva');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-20', hu: 'US-10', hus: ['US-10', 'US-11'], ca: { 'US-10': [6], 'US-11': [3] }, grupo: 'Flujo de reserva', titulo: 'Cancha o servicio no disponible: error claro y sin pantallas en blanco', objetivo: 'Verificar que ante fallos de la API la interfaz muestra mensajes y no queda en blanco.', pasos: ['Abrir una cancha con un id inexistente.', 'Abrir el detalle con la API de disponibilidad respondiendo 500.'], esperado: 'Para una cancha inexistente se muestra "Cancha no encontrada" con enlace para volver; si falla la disponibilidad se muestra un aviso y la página sigue utilizable.' },
  async (c) => {
    const U = await crearUsuario('e2eerr');
    const { context, page } = await abrirSesion(U);
    await page.goto(`${CFG.WEB}/canchas/00000000-0000-4000-8000-000000000000`);
    await page.waitForSelector('.mensaje-error');
    c.verifica(/Cancha no encontrada/.test(await page.locator('.mensaje-error').innerText()), 'Cancha inexistente: "Cancha no encontrada"');
    c.verifica(await page.locator('a:has-text("Todas las canchas")').isVisible(), 'Ofrece volver a "Todas las canchas"');
    await c.captura(page, 'Cancha inexistente');
    await page.route(/\/disponibilidad\?/, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Error interno del servidor' }) }));
    await page.goto(`${CFG.WEB}/canchas/${K0.id}`);
    await page.waitForSelector('#fecha-reserva');
    await page.waitForSelector('.mensaje-error');
    c.verifica(/Error interno del servidor/.test(await page.locator('.tarjeta-reserva .mensaje-error').first().innerText()), 'Si falla la disponibilidad se informa en la tarjeta de reserva');
    c.verifica((await page.locator('.tarjeta-reserva').count()) === 1 && (await page.locator('h1').count()) === 1, 'La página sigue visible (no queda en blanco)');
    await c.captura(page, 'Fallo de la API de disponibilidad', '.tarjeta-reserva');
    await context.close();
  }
);

// =====================================================================
// Resultados de la prueba larga (≈ 3 min en tiempo real)
// =====================================================================
const L = await larga;
await S.caso(
  { ...base, id: 'E2E-21', hu: 'US-17', hus: ['US-17', 'US-18'], ca: { 'US-17': [7], 'US-18': [3, 7] }, prioridad: 'Alta', grupo: 'Temporizador y tiempo real', titulo: 'Aviso de 30 s, expiración real y reinicio del temporizador', objetivo: 'Dejar correr los 3 minutos completos en el navegador y verificar el aviso, el bloqueo de la selección, el mensaje de expiración y el reinicio, y su efecto sobre otro usuario.', pasos: ['A elige un bloque; B observa la misma cancha.', 'Esperar sin actuar hasta que queden 30 s.', 'Esperar a que el tiempo llegue a 0.', 'Observar la pantalla de A y la de B.', 'A pulsa "Reiniciar temporizador".'], esperado: 'Al quedar 30 s aparece el aviso visual; a los 180 s A ve "Tu tiempo expiró" con la selección deshabilitada; B ve liberarse la franja; "Reiniciar temporizador" abre una nueva sesión de 3 min con la selección habilitada.' },
  async (c) => {
    c.verifica(L.inicioSeg >= 176, 'Al inicio el temporizador marca ≈ 03:00', `${L.inicioSeg} s`);
    c.verifica(L.bObservaRetenida, 'Mientras tanto B ve la franja de A "En proceso de reserva"');
    c.verifica(L.avisoSeg <= 30 && L.avisoSeg >= 26, 'Aparece el aviso visual cuando quedan ≈ 30 s', `se mostró con ${L.avisoSeg} s restantes (${L.avisoTranscurrido.toFixed(0)} s tras elegir)`);
    c.verifica(/menos de 30 segundos/.test(L.avisoTexto) && L.avisoUrgente, 'El aviso dice "Quedan menos de 30 segundos…" y el temporizador cambia a estilo de urgencia', L.avisoTexto.slice(0, 90));
    const entreAvisoYExpiracion = L.expiroTranscurrido - L.avisoTranscurrido;
    c.verifica(entreAvisoYExpiracion >= 28 && entreAvisoYExpiracion <= 33 && Math.abs(L.expiroDesdeLectura - L.inicioSeg) <= 4, 'La expiración ocurre ≈ 30 s después del aviso y justo cuando la cuenta regresiva llega a cero', `${entreAvisoYExpiracion.toFixed(0)} s después del aviso · la cuenta marcaba ${L.inicioSeg} s y expiró ${L.expiroDesdeLectura.toFixed(0)} s después`);
    c.verifica(/Tu tiempo expiró/.test(L.tituloExpirado), 'Muestra "Tu tiempo expiró"', L.tituloExpirado);
    c.verifica(L.bloquesHabilitados === 0 && L.fechaDeshabilitada && L.iniciarDeshabilitado, 'La selección queda deshabilitada (bloques, fecha e "Iniciar reserva")', `${L.bloquesHabilitados} bloques habilitados`);
    c.verifica(L.bLiberada, 'B ve liberarse la franja de A en tiempo real al expirar');
    c.verifica(L.reinicioSeg >= 175 && L.bloquesTrasReinicio > 0, 'Tras "Reiniciar temporizador" hay una sesión nueva de 3 min y la selección vuelve a estar habilitada', `${L.reinicioSeg} s, ${L.bloquesTrasReinicio} bloques habilitados`);
    c.adjuntar(L.archivos.inicio, 'A: temporizador y franja apartada al inicio');
    c.adjuntar(L.archivos.observador, 'B: ve la franja de A "En proceso de reserva"');
    c.adjuntar(L.archivos.aviso, 'A: aviso visual cuando quedan 30 segundos');
    c.adjuntar(L.archivos.expirado, 'A: "Tu tiempo expiró" con la selección deshabilitada');
    c.adjuntar(L.archivos.observadorLibre, 'B: la franja de A vuelve a estar libre');
    c.adjuntar(L.archivos.reinicio, 'A: tras reiniciar, nueva sesión de 3 minutos');
  }
);

await S.caso(
  { ...base, id: 'E2E-22', hu: 'US-10', hus: ['US-10', 'US-11', 'US-17', 'US-18'], ca: {}, tipo: 'End-to-End', grupo: 'Transversal', prioridad: 'Media', titulo: 'Sin errores de JavaScript ni de consola en todo el recorrido', objetivo: 'Verificar que ninguna de las pruebas E2E provocó errores no controlados en el navegador.', pasos: ['Recoger los eventos "pageerror" y los errores de consola de todas las pestañas usadas en esta suite.', 'Descartar los esperados (respuestas 4xx/5xx simuladas o provocadas a propósito).'], esperado: 'Cero errores inesperados.' },
  async (c) => {
    const esperados = /status of (400|401|404|409|500)|Failed to load resource/;
    const inesperados = erroresConsola.filter((e) => !esperados.test(e));
    c.verifica(inesperados.length === 0, 'No hubo errores de JavaScript inesperados', inesperados.length ? inesperados.slice(0, 5).join(' | ') : `${erroresConsola.length} mensajes de red esperados (4xx/5xx provocados por las pruebas)`);
  }
);

// =====================================================================
// Historial de reservas (US-13) y Reservas múltiples (US-12)
// =====================================================================
await S.caso(
  { ...base, id: 'E2E-23', hu: 'US-13', hus: ['US-13', 'US-12'], ca: { 'US-13': [1, 2, 3, 4, 5, 6], 'US-12': [5] }, grupo: 'Historial', titulo: 'Pantalla "Mis reservas": pestañas, estados, filtro, paginación y estado vacío', objetivo: 'Verificar en el navegador el historial del usuario con varias reservas: próximas y pasadas, estado "Completada", filtro por estado, paginación y el mensaje cuando no hay reservas.', pasos: ['Preparar un usuario con 2 reservas futuras (una cancelada) y 12 pasadas.', 'Abrir /mis-reservas y revisar la pestaña "Próximas".', 'Cambiar a "Pasadas" y revisar los estados y la paginación.', 'Filtrar por "Cancelada".', 'Filtrar por "Completada" estando en Próximas.', 'Filtrar por "Cancelada" en Pasadas.', 'Entrar con un usuario sin reservas.'], esperado: 'Próximas muestra solo las 2 futuras con su estado; Pasadas muestra 10 por página con "Completada" y un control de página 1 de 2 que avanza a la página 2; el filtro deja solo las canceladas; el filtro "Completada" cambia solo a la pestaña Pasadas y muestra las completadas; un filtro sin resultados muestra "No hay reservas con ese estado"; el usuario sin reservas ve "Aún no tienes reservas" con el botón "Reservar una cancha".' },
  async (c) => {
    const U = await crearUsuario('e2ehist');
    const dia = proximoDia();
    const r1 = await api('POST', `/canchas/${K0.id}/reservas`, { fecha: dia, horaInicio: '08:00', horaFin: '09:00' }, U.token);
    const r2 = await api('POST', `/canchas/${K0.id}/reservas`, { fecha: dia, horaInicio: '09:00', horaFin: '10:00' }, U.token);
    await api('PATCH', `/reservas/${r2.datos.reserva.id}/cancelar`, undefined, U.token);
    for (let i = 0; i < 12; i += 1) sqlq(`INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin, estado) VALUES ('${K1.id}', '${U.id}', '${fechaCO(-(2 + i))}', '08:00', '09:00', 'confirmada')`);
    c.verifica(r1.status === 201 && r2.status === 201, 'Preparación: 2 reservas futuras creadas y 1 cancelada, más 12 pasadas');

    const { context, page } = await abrirSesion(U);
    await page.goto(`${CFG.WEB}/mis-reservas`);
    await page.waitForSelector('.reserva-item');
    const proximas = await page.locator('.reserva-item').allInnerTexts();
    c.verifica(proximas.length === 2, 'Próximas: se ven las 2 reservas futuras', `${proximas.length}`);
    c.verifica(proximas.some((t) => /Confirmada/.test(t)) && proximas.some((t) => /Cancelada/.test(t)), 'Se distinguen los estados "Confirmada" y "Cancelada"');
    c.verifica(/CY-[0-9A-F]{8}/.test(proximas[0]) && proximas[0].includes(K0.nombre), 'Cada reserva muestra el código y la cancha', proximas[0].replace(/\n+/g, ' · '));
    c.verifica((await page.locator('.contador').innerText()).startsWith('2 reservas'), 'El contador indica "2 reservas"');
    await c.captura(page, 'Mis reservas: pestaña Próximas con reserva confirmada y cancelada');

    await page.click('button[role="tab"]:has-text("Pasadas")');
    await page.waitForFunction(() => document.querySelectorAll('.reserva-item').length === 10);
    const pasadas = await page.locator('.reserva-item').allInnerTexts();
    c.verifica(pasadas.length === 10 && pasadas.every((t) => /Completada/.test(t)), 'Pasadas: 10 por página y todas "Completada"', `${pasadas.length}`);
    c.verifica(/Página 1 de 2/.test(await page.locator('.paginacion-estado').innerText()), 'La paginación indica "Página 1 de 2"');
    await c.captura(page, 'Mis reservas: pestaña Pasadas, primera página con estado Completada');
    await page.click('button:has-text("Siguiente")');
    await page.waitForFunction(() => document.querySelectorAll('.reserva-item').length === 2);
    c.verifica(/Página 2 de 2/.test(await page.locator('.paginacion-estado').innerText()) && (await page.locator('button:has-text("Siguiente")').isDisabled()), 'Segunda página: 2 reservas y "Siguiente" deshabilitado');

    await page.click('button[role="tab"]:has-text("Próximas")');
    await page.waitForSelector('.reserva-item');
    await page.selectOption('select[aria-label="Filtrar por estado"]', 'cancelada');
    await page.waitForFunction(() => document.querySelectorAll('.reserva-item').length === 1);
    c.verifica(/Cancelada/.test(await page.locator('.reserva-item').first().innerText()), 'El filtro "Cancelada" deja solo la reserva cancelada');
    // "Completada" solo existe entre las pasadas: el filtro lleva a esa pestaña en vez de mostrar una lista vacía.
    await page.selectOption('select[aria-label="Filtrar por estado"]', 'completada');
    await page.waitForFunction(() => document.querySelectorAll('.reserva-item').length === 10);
    c.verifica((await page.locator('button[role="tab"][aria-selected="true"]').innerText()).trim() === 'Pasadas' && (await page.locator('.reserva-item').allInnerTexts()).every((x) => /Completada/.test(x)), 'El filtro "Completada" cambia a la pestaña Pasadas y muestra las reservas completadas');
    await page.selectOption('select[aria-label="Filtrar por estado"]', 'cancelada');
    await page.waitForSelector('.estado-vacio');
    c.verifica(/No hay reservas con ese estado/.test(await page.locator('.estado-vacio').innerText()), 'Un filtro sin resultados muestra "No hay reservas con ese estado"');
    await c.captura(page, 'Filtro sin resultados');
    await context.close();

    const V = await crearUsuario('e2evacio');
    const sesion = await abrirSesion(V);
    await sesion.page.goto(`${CFG.WEB}/mis-reservas`);
    await sesion.page.waitForSelector('.estado-vacio');
    const vacio = await sesion.page.locator('.estado-vacio').innerText();
    c.verifica(/Aún no tienes reservas/.test(vacio) && (await sesion.page.locator('.estado-vacio a:has-text("Reservar una cancha")').count()) === 1, 'Sin reservas: "Aún no tienes reservas" y botón "Reservar una cancha"');
    await c.captura(sesion.page, 'Estado vacío de Mis reservas');
    await sesion.context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-24', hu: 'US-12', hus: ['US-12', 'US-09', 'US-11'], ca: { 'US-12': [1, 2, 5], 'US-09': [2], 'US-11': [6] }, grupo: 'Historial', titulo: 'Reservas múltiples por la interfaz: varias reservas, solape rechazado y visibles en el historial', objetivo: 'Verificar en el navegador que el mismo usuario reserva dos franjas distintas, que una tercera que se cruza con una anterior es rechazada con un mensaje claro y que las dos reservas aparecen en "Mis reservas".', pasos: ['Reservar por la interfaz la franja 12:00 de la cancha 1.', 'Reservar por la interfaz la franja 13:00 de la cancha 1 (otra reserva del mismo usuario).', 'Reservar la franja 12:00 de otra cancha en la misma fecha (se cruza).', 'Abrir "Mis reservas".'], esperado: 'Las dos primeras reservas se confirman; la tercera muestra "Ya tienes una reserva en ese horario" y no se informa éxito; "Mis reservas" lista exactamente las dos confirmadas.' },
  async (c) => {
    const U = await crearUsuario('e2emulti');
    const { context, page } = await abrirSesion(U);
    const fecha = proximoDia();
    await abrirCancha(page, K0, fecha);
    await confirmarPorUI(page, '12:00');
    const c1 = await page.locator('.confirmacion-reserva').innerText();
    c.verifica(/confirmada/i.test(c1), 'Primera reserva confirmada por la interfaz (12:00)');
    await abrirCancha(page, K0, fecha);
    await confirmarPorUI(page, '13:00');
    c.verifica(/confirmada/i.test(await page.locator('.confirmacion-reserva').innerText()), 'Segunda reserva del mismo usuario confirmada (13:00): no se cancela la anterior');

    await abrirCancha(page, K1, fecha);
    await elegirBloque(page, '12:00');
    await page.click('button:has-text("Iniciar reserva")');
    let mensaje = '';
    try {
      await page.waitForSelector('.resumen-reserva', { timeout: 6000 });
      await page.click('button:has-text("Confirmar reserva")');
      await page.waitForSelector('.alerta, [role="alert"]', { timeout: 6000 });
      mensaje = await page.locator('.alerta, [role="alert"]').first().innerText();
    } catch {
      mensaje = await page.locator('.alerta, [role="alert"]').first().innerText().catch(() => '');
    }
    c.verifica(/Ya tienes una reserva en ese horario/.test(mensaje), 'La reserva que se cruza muestra "Ya tienes una reserva en ese horario"', mensaje.replace(/\n+/g, ' '));
    c.verifica((await page.locator('.confirmacion-reserva').count()) === 0, 'No se muestra la pantalla de éxito');
    await c.captura(page, 'Reserva que se cruza: mensaje claro de rechazo');

    await page.goto(`${CFG.WEB}/mis-reservas`);
    await page.waitForSelector('.reserva-item');
    const items = await page.locator('.reserva-item').allInnerTexts();
    c.verifica(items.length === 2 && items.every((t) => /Confirmada/.test(t)), 'Mis reservas lista exactamente las 2 reservas confirmadas', `${items.length}`);
    await c.captura(page, 'Mis reservas con las dos reservas simultáneas');
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE usuario_id='${U.id}' AND estado='confirmada'`) === '2', 'En la base hay 2 reservas confirmadas del usuario');
    await context.close();
  }
);

// =====================================================================
// Documentación de la API en el navegador (PIG1-23)
// =====================================================================
await S.caso(
  { ...base, id: 'E2E-25', hu: 'PIG1-23', ca: [2, 6, 10], grupo: 'Documentación', prioridad: 'Alta', titulo: 'Swagger UI: abrir /api/docs, autorizar con el token y probar un endpoint', objetivo: 'Verificar de punta a punta, como lo haría un desarrollador, que Swagger UI carga, que el botón "Authorize" acepta el token JWT y que "Try it out" funciona contra el backend.', pasos: ['Abrir http://localhost:4300/api/docs.', 'Revisar que se listan las operaciones agrupadas por etiqueta.', 'Probar GET /api/canchas SIN autorizar.', 'Pulsar "Authorize", pegar el token del usuario y confirmar.', 'Repetir GET /api/canchas con "Try it out".'], esperado: 'La página carga con el título CanchaYa API y las 14 operaciones; sin autorizar, GET /api/canchas responde 401 "No autenticado"; tras Authorize con el token responde 200 con la lista de canchas.' },
  async (c) => {
    const U = await crearUsuario('e2edocs');
    const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
    const page = await context.newPage();
    await page.goto(`${CFG.SOCKET}/api/docs/`);
    await page.waitForSelector('.swagger-ui .opblock');
    c.verifica(/CanchaYa API/.test(await page.locator('.swagger-ui .info .title').innerText()), 'El título de la documentación es "CanchaYa API"');
    const operaciones = await page.locator('.swagger-ui .opblock').count();
    c.verifica(operaciones === 33, 'Swagger UI lista las 33 operaciones', `${operaciones}`);
    const etiquetas = await page.locator('.swagger-ui .opblock-tag').allInnerTexts();
    c.verifica(['Sistema', 'Autenticación', 'Canchas', 'Reservas', 'Temporizador', 'Socket.IO (tiempo real)'].every((e) => etiquetas.some((t) => t.includes(e))), 'Están las etiquetas, incluida "Socket.IO (tiempo real)"', etiquetas.map((t) => t.split('\n')[0]).join(' · '));
    await c.captura(page, 'Swagger UI: vista general de la documentación');

    const ejecutar = async (idOperacion) => {
      const op = page.locator(`#operations-${idOperacion}`);
      if (!(await op.locator('.opblock-body').count())) await op.locator('.opblock-summary-control').click();
      await op.locator('.opblock-body').waitFor();
      const tryOut = op.locator('button.try-out__btn');
      if ((await tryOut.innerText()).includes('Try it out')) await tryOut.click();
      await op.locator('button.execute').click();
      await op.locator('.live-responses-table .response .response-col_status').first().waitFor({ timeout: 10000 });
      return { op, estado: (await op.locator('.live-responses-table tbody .response-col_status').first().innerText()).trim().split('\n')[0], cuerpo: await op.locator('.live-responses-table tbody .microlight').first().innerText() };
    };

    const sinAuth = await ejecutar('Canchas-listarCanchas');
    c.verifica(sinAuth.estado === '401' && /No autenticado/.test(sinAuth.cuerpo), 'Sin autorizar, GET /api/canchas responde 401 "No autenticado"', `${sinAuth.estado} ${sinAuth.cuerpo.replace(/\s+/g, ' ')}`);
    await c.captura(page, 'Try it out sin autorizar: 401', '#operations-Canchas-listarCanchas');

    await page.locator('.swagger-ui .auth-wrapper button.authorize').click();
    await page.locator('.dialog-ux .auth-container input[type="text"]').fill(U.token);
    await page.locator('.dialog-ux .auth-btn-wrapper button.authorize').click();
    c.verifica((await page.locator('.dialog-ux .auth-container').innerText()).includes('Authorized'), 'El diálogo "Authorize" acepta el token (Authorized)');
    await c.captura(page, 'Diálogo Authorize con el token JWT aceptado', '.dialog-ux .modal-ux');
    await page.locator('.dialog-ux button.btn-done').click();

    const conAuth = await ejecutar('Canchas-listarCanchas');
    c.verifica(conAuth.estado === '200' && /"canchas"/.test(conAuth.cuerpo), 'Con el token, GET /api/canchas responde 200 con la lista de canchas', `${conAuth.estado}`);
    await c.captura(page, 'Try it out con el token: 200 y lista de canchas', '#operations-Canchas-listarCanchas');
    await context.close();
  }
);

// =====================================================================
// Sprint 5 — US-14 Cancelación, US-27 Perfil, US-28 Tarjeta y US-29 Verificación de código
// =====================================================================
const fechaPasadaUnica = () => `${2001 + Math.floor(Math.random() * 19)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`;
const diaLejano = () => fechaCO(100 + Math.floor(Math.random() * 3000));
const colombiaEn = (minutos) => {
  const momento = new Date(Date.now() + minutos * 60000 - 5 * 3600e3).toISOString();
  return { fecha: momento.slice(0, 10), hora: momento.slice(11, 16) };
};
const rangoDesdeAhora = (minutos) => {
  const inicio = colombiaEn(minutos);
  const fin = colombiaEn(minutos + 15);
  return { fecha: inicio.fecha, inicio: inicio.hora, fin: fin.fecha === inicio.fecha ? fin.hora : '23:59' };
};
// Inserta una reserva que empieza pronto en la primera cancha y el primer minuto libres (la restricción de solape es
// por cancha y otras pruebas pudieron reservar minutos antes). Devuelve [id, código].
function insertarProntoLibre(usuario, canchasLista, minutosBase = 60, margen = 50) {
  for (let desfase = 0; desfase < margen; desfase += 3) {
    for (const cancha of canchasLista) {
      const r = rangoDesdeAhora(minutosBase + desfase);
      try {
        return sqlq(`INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin) VALUES ('${cancha.id}', '${usuario.id}', '${r.fecha}', '${r.inicio}', '${r.fin}') RETURNING id || '|' || codigo`).split(/\r?\n/)[0].split('|');
      } catch {
        // franja ocupada en esa cancha: se prueba otra
      }
    }
  }
  throw new Error('No se encontró una franja libre para la reserva próxima');
}
const reservaApi = (usuario, cancha, fecha, hora) =>
  api('POST', `/canchas/${cancha.id}/reservas`, { fecha, horaInicio: `${hora}:00`, horaFin: `${String(Number(hora) + 1).padStart(2, '0')}:00` }, usuario.token);
const sinScrollHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const ANIO_TARJETA = new Date().getFullYear() + 3;
const seccion = (page, id) => page.locator(`section[aria-labelledby="${id}"]`);

// Un administrador: se crea la cuenta, se le asigna el rol y se vuelve a iniciar sesión para que la sesión traiga el rol.
async function crearAdministradorE2E(prefijo) {
  const cuenta = await crearUsuario(prefijo);
  sqlq(`UPDATE usuarios SET rol = 'administrador' WHERE id = '${cuenta.id}'`);
  const login = await api('POST', '/auth/login', { correo: cuenta.correo, password: cuenta.password });
  return { ...cuenta, token: login.datos.token, usuario: login.datos.usuario };
}

await S.caso(
  { ...base, id: 'E2E-26', hu: 'US-14', ca: [1, 2, 3, 5], grupo: 'Cancelación', titulo: 'Cancelar una reserva desde "Mis reservas": confirmación, aviso y regla de las 2 horas', objetivo: 'Verificar en el navegador el flujo de cancelación: diálogo de confirmación, conservar la reserva, cancelarla, aviso en pantalla, franja liberada y bloqueo cuando faltan menos de 2 horas.', pasos: ['Crear dos reservas futuras y una que empieza en 90 minutos.', 'En "Mis reservas" pulsar "Cancelar reserva" y elegir "No, conservarla".', 'Pulsar de nuevo y confirmar con "Sí, cancelar reserva".', 'Pulsar "Cancelar reserva" en la que empieza en 90 minutos.'], esperado: 'Aparece un diálogo de confirmación; conservarla no cambia nada; confirmar muestra un aviso, la reserva queda "Cancelada" sin botón y su franja vuelve a estar libre; la de 90 minutos muestra el mensaje de la restricción de 2 horas y sigue confirmada.' },
  async (c) => {
    const U = await crearUsuario('e2ecancela');
    const dia = diaLejano();
    const r1 = await reservaApi(U, K0, dia, '08');
    const r2 = await reservaApi(U, K0, dia, '09');
    const [idPronto, codigoPronto] = insertarProntoLibre(U, [K1, K2, K3, K4]);
    c.verifica(r1.status === 201 && r2.status === 201 && Boolean(idPronto), 'Preparación: 2 reservas futuras y 1 que empieza en 90 minutos');
    const codigo1 = r1.datos.reserva.codigo;

    const { context, page } = await abrirSesion(U);
    await page.goto(`${CFG.WEB}/mis-reservas`);
    await page.waitForSelector('.reserva-item');
    const item = (codigo) => page.locator('.reserva-item', { hasText: codigo });

    await item(codigo1).locator('button:has-text("Cancelar reserva")').click();
    await page.waitForSelector('[role="dialog"]');
    const dialogo = await page.locator('[role="dialog"]').innerText();
    c.verifica(/¿Cancelar esta reserva\?/.test(dialogo) && dialogo.includes(codigo1) && dialogo.includes(K0.nombre), 'Al pulsar "Cancelar reserva" se pide confirmar, mostrando cancha y código', dialogo.replace(/\n+/g, ' · ').slice(0, 120));
    await c.captura(page, 'Diálogo de confirmación antes de cancelar', '[role="dialog"]');
    await page.click('button:has-text("No, conservarla")');
    await page.waitForSelector('[role="dialog"]', { state: 'detached' });
    c.verifica(/Confirmada/.test(await item(codigo1).innerText()) && sqlq(`SELECT estado FROM reservas WHERE id='${r1.datos.reserva.id}'`) === 'confirmada', 'Elegir "No, conservarla" cierra el diálogo y no cambia la reserva');

    await item(codigo1).locator('button:has-text("Cancelar reserva")').click();
    await page.click('button:has-text("Sí, cancelar reserva")');
    await page.waitForSelector('.mensaje-exito');
    const aviso = await page.locator('.mensaje-exito').first().innerText();
    c.verifica(/cancelad/i.test(aviso), 'Se muestra un aviso en pantalla de que la reserva fue cancelada', aviso.replace(/\n+/g, ' '));
    await page.waitForFunction((cod) => [...document.querySelectorAll('.reserva-item')].find((el) => el.innerText.includes(cod))?.innerText.includes('Cancelada'), codigo1);
    c.verifica((await item(codigo1).locator('button:has-text("Cancelar reserva")').count()) === 0, 'La reserva queda "Cancelada" y ya no ofrece el botón de cancelar');
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE id='${r1.datos.reserva.id}'`) === 'cancelada', 'En la base la reserva quedó "cancelada"');
    const disp = await api('GET', `/canchas/${K0.id}/disponibilidad?fecha=${dia}`, undefined, U.token);
    c.verifica(!disp.datos.ocupados.some((o) => String(o.horaInicio).startsWith('08:00')) && disp.datos.ocupados.some((o) => String(o.horaInicio).startsWith('09:00')), 'La franja de las 08:00 quedó libre y la de las 09:00 (no cancelada) sigue ocupada');
    await c.captura(page, 'Aviso de cancelación y reserva marcada como Cancelada');

    await item(codigoPronto).locator('button:has-text("Cancelar reserva")').click();
    await item(codigoPronto).locator('.mensaje-error').waitFor();
    const bloqueo = await item(codigoPronto).locator('.mensaje-error').innerText();
    c.verifica(/2 horas/.test(bloqueo) && (await page.locator('[role="dialog"]').count()) === 0, 'Con menos de 2 horas no se abre el diálogo y se explica la restricción', bloqueo.replace(/\n+/g, ' '));
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE id='${idPronto}'`) === 'confirmada', 'La reserva de 90 minutos sigue confirmada');
    await c.captura(page, 'Cancelación bloqueada: faltan menos de 2 horas');
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-27', hu: 'US-27', ca: [1, 2, 3, 4, 5, 7], grupo: 'Perfil', titulo: 'Mi perfil: ver y editar datos, cambiar correo (con verificación) y contraseña, y vista responsive', objetivo: 'Recorrer el perfil en el navegador: datos cargados, edición válida e inválida, cambio de correo con enlace de verificación, cambio de contraseña y diseño entre 360 y 1920 px.', pasos: ['Abrir "Mi perfil" desde la barra superior.', 'Editar nombre y teléfono; probar datos inválidos.', 'Pedir cambiar el correo (uno ya usado y uno nuevo) y abrir el enlace enviado.', 'Cambiar la contraseña con la actual equivocada y luego correcta.', 'Revisar el perfil a 360 y 1920 px.'], esperado: 'El perfil trae los datos actuales; los válidos se guardan con confirmación; los inválidos muestran errores por campo; el correo cambia solo tras abrir el enlace; la contraseña exige la actual; no hay scroll horizontal en ningún ancho.' },
  async (c) => {
    const U = await crearUsuario('e2eperfil');
    const otro = await crearUsuario('e2eocupado');
    const { context, page } = await abrirSesion(U);
    await page.goto(`${CFG.WEB}/canchas`);
    await page.waitForSelector('.tarjeta-cancha, .estado-vacio, h1');
    await page.click('a.navbar-usuario');
    await page.waitForURL(`${CFG.WEB}/perfil`);
    await page.waitForFunction(() => document.querySelector('input[name="nombre"]')?.value);
    c.verifica((await page.locator('input[name="nombre"]').inputValue()) === U.nombre && (await page.locator('input[name="telefono"]').inputValue()) === '3001234567', 'Desde la barra superior se abre "Mi perfil" con nombre y teléfono actuales');
    c.verifica((await seccion(page, 'titulo-correo').innerText()).includes(U.correo), 'Muestra el correo actual');
    await c.captura(page, 'Mi perfil con los datos cargados');

    await page.fill('input[name="nombre"]', 'Laura Gómez QA');
    await page.fill('input[name="telefono"]', '3105550199');
    await page.click('button:has-text("Guardar cambios")');
    await seccion(page, 'titulo-datos').locator('.mensaje-exito').waitFor();
    c.verifica(sqlq(`SELECT nombre || '|' || telefono FROM usuarios WHERE id='${U.id}'`) === 'Laura Gómez QA|3105550199', 'Los cambios válidos se guardan y se muestra la confirmación');

    await page.fill('input[name="nombre"]', '');
    await page.fill('input[name="telefono"]', 'abc');
    await page.click('button:has-text("Guardar cambios")');
    await seccion(page, 'titulo-datos').locator('.campo-error').first().waitFor();
    const erroresCampo = await seccion(page, 'titulo-datos').locator('.campo-error').allInnerTexts();
    c.verifica(erroresCampo.length === 2, 'Nombre vacío y teléfono inválido: un mensaje de error por cada campo', erroresCampo.join(' | '));
    c.verifica(sqlq(`SELECT nombre || '|' || telefono FROM usuarios WHERE id='${U.id}'`) === 'Laura Gómez QA|3105550199', 'No se guardó nada con datos inválidos');
    await c.captura(page, 'Errores de validación por campo', '[aria-labelledby="titulo-datos"]');

    await page.fill('input[name="nuevoCorreo"]', otro.correo);
    await page.click('button:has-text("Enviar enlace de verificación")');
    await seccion(page, 'titulo-correo').locator('.campo-error, .mensaje-error').first().waitFor();
    c.verifica(/registrad|existe|uso/i.test(await seccion(page, 'titulo-correo').locator('.campo-error, .mensaje-error').first().innerText()), 'Un correo de otra cuenta se rechaza con un mensaje');
    const nuevo = `e2e.nuevo.${Date.now()}@qa.local`;
    await page.fill('input[name="nuevoCorreo"]', nuevo);
    await page.click('button:has-text("Enviar enlace de verificación")');
    await seccion(page, 'titulo-correo').locator('.perfil-pendiente').waitFor();
    c.verifica((await seccion(page, 'titulo-correo').locator('.perfil-pendiente').innerText()).includes(nuevo) && sqlq(`SELECT correo FROM usuarios WHERE id='${U.id}'`) === U.correo, 'El perfil indica el correo pendiente de verificación y el de la cuenta no cambia todavía');
    await c.captura(page, 'Cambio de correo pendiente de verificación', '[aria-labelledby="titulo-correo"]');
    await esperar(700);
    const linea = [...logsBackend('5m').matchAll(/\[EMAIL\] Para: (\S+) -> (\S+)/g)].filter((m) => m[1] === nuevo).pop();
    c.verifica(Boolean(linea) && linea[2].startsWith(`${CFG.WEB}/verificar-correo?token=`), 'El enlace de verificación se envió al correo nuevo', linea?.[2].replace(/token=.*/, 'token=…'));
    await page.goto(linea[2]);
    await page.waitForSelector('.mensaje-exito');
    c.verifica(sqlq(`SELECT correo FROM usuarios WHERE id='${U.id}'`) === nuevo, 'Al abrir el enlace el correo de la cuenta cambia al nuevo');
    await c.captura(page, 'Correo verificado');

    await page.goto(`${CFG.WEB}/perfil`);
    await page.waitForFunction(() => document.querySelector('input[name="nombre"]')?.value);
    await page.fill('input[name="passwordActual"]', 'Equivocada1');
    await page.fill('input[name="nuevaPassword"]', 'NuevaClave456');
    await page.fill('input[name="confirmar"]', 'NuevaClave456');
    await page.click('button:has-text("Cambiar contraseña")');
    await seccion(page, 'titulo-password').locator('.campo-error, .mensaje-error').first().waitFor();
    c.verifica((await api('POST', '/auth/login', { correo: nuevo, password: CFG.password })).status === 200, 'Con la contraseña actual equivocada se rechaza y la contraseña no cambia');
    await page.fill('input[name="passwordActual"]', CFG.password);
    await page.fill('input[name="nuevaPassword"]', 'NuevaClave456');
    await page.fill('input[name="confirmar"]', 'NuevaClave456');
    await page.click('button:has-text("Cambiar contraseña")');
    await seccion(page, 'titulo-password').locator('.mensaje-exito').waitFor();
    c.verifica((await api('POST', '/auth/login', { correo: nuevo, password: 'NuevaClave456' })).status === 200, 'Con la actual correcta se cambia y se puede iniciar sesión con la nueva');

    for (const [ancho, alto] of [[360, 800], [768, 900], [1920, 1080]]) {
      await page.setViewportSize({ width: ancho, height: alto });
      await page.goto(`${CFG.WEB}/perfil`);
      await page.waitForFunction(() => document.querySelector('input[name="nombre"]')?.value);
      c.verifica(await sinScrollHorizontal(page), `A ${ancho} px no hay scroll horizontal`);
      if (ancho !== 768) await c.captura(page, `Mi perfil a ${ancho} px`);
    }
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-28', hu: 'US-28', hus: ['US-28', 'US-14'], ca: { 'US-28': [1, 2, 3, 4, 5, 6], 'US-14': [2] }, grupo: 'Pagos', titulo: 'Tarjeta: guardar, pagar una reserva, pago rechazado y eliminar', objetivo: 'Recorrer en el navegador el método de pago con tarjeta: validación, tarjeta enmascarada, pago al confirmar, rechazo con reintento y eliminación sin afectar lo ya pagado.', pasos: ['En el perfil, intentar guardar una tarjeta inválida y luego una válida.', 'Reservar una cancha eligiendo esa tarjeta.', 'Reservar con una tarjeta que la pasarela rechaza y reintentar pagando en la cancha.', 'Eliminar la tarjeta y revisar "Mis reservas".'], esperado: 'La inválida muestra errores sin guardarse; la válida aparece como "Visa ···· 4242" sin número completo; el pago aprobado se ve en la confirmación; el rechazo no confirma y permite reintentar; eliminar la tarjeta no altera la reserva pagada.' },
  async (c) => {
    const U = await crearUsuario('e2etarjeta');
    const { context, page } = await abrirSesion(U);
    await page.goto(`${CFG.WEB}/perfil`);
    await page.waitForSelector('.perfil-vacio');
    c.verifica(/Aún no tienes tarjetas guardadas/.test(await seccion(page, 'titulo-tarjetas').innerText()), 'Sin tarjetas: "Aún no tienes tarjetas guardadas"');

    const formulario = seccion(page, 'titulo-tarjetas');
    await formulario.locator('input[name="numero"]').fill('4242424242424241');
    await formulario.locator('input[name="titular"]').fill('Ana Pérez');
    await formulario.locator('input[name="vencimiento"]').fill('0120');
    await formulario.locator('input[name="cvv"]').fill('12');
    await formulario.locator('button:has-text("Guardar tarjeta")').click();
    await formulario.locator('.campo-error').first().waitFor();
    const errores = await formulario.locator('.campo-error').allInnerTexts();
    c.verifica(errores.length >= 2 && !errores.join(' ').includes('4242424242424241'), 'Una tarjeta inválida muestra errores por campo sin repetir el número', errores.join(' | '));
    c.verifica(sqlq(`SELECT count(*) FROM metodos_pago WHERE usuario_id='${U.id}'`) === '0', 'No se guardó la tarjeta inválida');
    await c.captura(page, 'Tarjeta inválida: errores por campo', '[aria-labelledby="titulo-tarjetas"]');

    await formulario.locator('input[name="numero"]').fill('4242424242424242');
    await formulario.locator('input[name="vencimiento"]').fill(`12${String(ANIO_TARJETA).slice(-2)}`);
    await formulario.locator('input[name="cvv"]').fill('123');
    await formulario.locator('button:has-text("Guardar tarjeta")').click();
    await formulario.locator('.lista-tarjetas').waitFor();
    const textoTarjeta = await formulario.locator('.tarjeta-guardada').first().innerText();
    c.verifica(/Visa/.test(textoTarjeta) && textoTarjeta.includes('4242') && !textoTarjeta.includes('4242 4242 4242 4242') && !textoTarjeta.includes('4242424242424242'), 'La tarjeta se muestra enmascarada: marca y últimos 4 dígitos', textoTarjeta.replace(/\n+/g, ' · '));
    c.verifica((await formulario.locator('input[name="numero"]').inputValue()) === '' && (await formulario.locator('input[name="cvv"]').inputValue()) === '', 'El formulario se limpia: el número y el CVV no quedan en pantalla');
    const filaTarjeta = sqlq(`SELECT row_to_json(m) FROM metodos_pago m WHERE usuario_id='${U.id}'`);
    c.verifica(/"token":"tok_sim_/.test(filaTarjeta) && !filaTarjeta.includes('4242424242424242'), 'En la base solo hay token, marca y últimos 4 dígitos');
    await c.captura(page, 'Tarjeta guardada y enmascarada', '[aria-labelledby="titulo-tarjetas"]');

    const dia = diaLejano();
    await abrirCancha(page, K0, dia);
    await elegirBloque(page, '10:00');
    await page.click('button:has-text("Iniciar reserva")');
    await page.waitForSelector('.resumen-reserva');
    const opciones = await page.locator('.selector-pago').innerText();
    c.verifica(/Pagar en la cancha/.test(opciones) && /Visa ···· 4242/.test(opciones), 'Al confirmar se ofrece "Pagar en la cancha" y la tarjeta guardada', opciones.replace(/\n+/g, ' · '));
    await c.captura(page, 'Selector de método de pago en el resumen', '.selector-pago');
    await page.locator('.opcion-pago', { hasText: 'Visa ···· 4242' }).click();
    await page.click('button:has-text("Confirmar reserva")');
    await page.waitForSelector('.confirmacion-reserva');
    const confirmacion = await page.locator('.confirmacion-reserva').innerText();
    c.verifica(/Aprobado · Visa ···· 4242/.test(confirmacion), 'La confirmación muestra el pago aprobado con la tarjeta', confirmacion.replace(/\n+/g, ' · ').slice(0, 160));
    c.verifica(sqlq(`SELECT count(*) FROM pagos WHERE usuario_id='${U.id}' AND estado='aprobado'`) === '1', 'Hay un pago aprobado en la base');
    await c.captura(page, 'Confirmación con el pago aprobado');

    // Una tarjeta que la pasarela de pruebas rechaza (…0002), agregada por API para ir directo al pago.
    const rechazada = await api('POST', `/usuarios/${U.id}/metodos-pago`, { numero: '4000 0000 0000 0002', titular: 'Ana Pérez', vencimientoMes: 12, vencimientoAnio: ANIO_TARJETA, cvv: '123' }, U.token);
    await abrirCancha(page, K0, dia);
    await elegirBloque(page, '11:00');
    await page.click('button:has-text("Iniciar reserva")');
    await page.waitForSelector('.resumen-reserva');
    await page.locator('.opcion-pago', { hasText: '···· 0002' }).click();
    await page.click('button:has-text("Confirmar reserva")');
    await page.locator('.mensaje-error').first().waitFor();
    const motivo = await page.locator('.mensaje-error').first().innerText();
    c.verifica(/rechazad/i.test(motivo) && (await page.locator('.confirmacion-reserva').count()) === 0 && (await page.locator('.resumen-reserva').count()) === 1, 'El pago rechazado no confirma la reserva, informa el motivo y conserva el resumen', motivo.replace(/\n+/g, ' '));
    c.verifica(rechazada.status === 201 && sqlq(`SELECT count(*) FROM reservas WHERE usuario_id='${U.id}' AND hora_inicio='11:00'`) === '0', 'No se creó la reserva de las 11:00');
    await c.captura(page, 'Pago rechazado: motivo y opción de reintentar');
    await page.locator('.opcion-pago', { hasText: 'Pagar en la cancha' }).click();
    await page.click('button:has-text("Confirmar reserva")');
    await page.waitForSelector('.confirmacion-reserva');
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE usuario_id='${U.id}' AND hora_inicio='11:00'`) === '1', 'Al reintentar con "Pagar en la cancha" la reserva se confirma');

    await page.goto(`${CFG.WEB}/perfil`);
    await page.waitForSelector('.lista-tarjetas');
    await page.click('button[aria-label="Eliminar la tarjeta Visa terminada en 4242"]');
    await page.waitForSelector('[role="dialog"]');
    c.verifica(/¿Eliminar esta tarjeta\?/.test(await page.locator('[role="dialog"]').innerText()), 'Eliminar pide confirmación');
    await page.click('button:has-text("Sí, eliminar")');
    await page.waitForFunction(() => !document.body.innerText.includes('Visa ···· 4242'));
    c.verifica(sqlq(`SELECT count(*) FROM metodos_pago WHERE usuario_id='${U.id}' AND ultimos4='4242'`) === '0', 'Se borró la tarjeta (y su token) de la base');
    await page.goto(`${CFG.WEB}/mis-reservas`);
    await page.waitForSelector('.reserva-item');
    const pagada = await page.locator('.reserva-item', { hasText: '10:00' }).first().innerText();
    c.verifica(/Pagada · Visa ···· 4242/.test(pagada) && /Confirmada/.test(pagada), 'La reserva ya pagada sigue confirmada y conserva su pago', pagada.replace(/\n+/g, ' · ').slice(0, 160));
    await c.captura(page, 'Mis reservas: reserva pagada tras eliminar la tarjeta');

    // Al cancelar una reserva pagada, el diálogo avisa del reembolso.
    const V = await crearUsuario('e2ereembolso');
    const tj = await api('POST', `/usuarios/${V.id}/metodos-pago`, { numero: '5555 5555 5555 4444', titular: 'Luis Díaz', vencimientoMes: 12, vencimientoAnio: ANIO_TARJETA, cvv: '123' }, V.token);
    const rp = await api('POST', `/canchas/${K0.id}/reservas`, { fecha: diaLejano(), horaInicio: '14:00', horaFin: '15:00', metodoPagoId: tj.datos.metodoPago.id }, V.token);
    const sv = await abrirSesion(V);
    await sv.page.goto(`${CFG.WEB}/mis-reservas`);
    await sv.page.waitForSelector('.reserva-item');
    await sv.page.click('button:has-text("Cancelar reserva")');
    await sv.page.waitForSelector('[role="dialog"]');
    c.verifica(/reembolsaremos/i.test(await sv.page.locator('[role="dialog"]').innerText()), 'El diálogo de cancelación avisa que se reembolsará el pago');
    await sv.page.click('button:has-text("Sí, cancelar reserva")');
    await sv.page.waitForSelector('.mensaje-exito');
    c.verifica(rp.status === 201 && /reembols/i.test(await sv.page.locator('.mensaje-exito').first().innerText()) && sqlq(`SELECT estado FROM pagos WHERE reserva_id='${rp.datos.reserva.id}'`) === 'reembolsado', 'Al cancelar, el aviso informa el reembolso y el pago queda "reembolsado"');
    await c.captura(sv.page, 'Cancelación de una reserva pagada con aviso de reembolso');
    await sv.context.close();
    await context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-29', hu: 'US-29', ca: [1, 2, 3, 4, 5, 6, 7, 8], grupo: 'Administración', titulo: 'Panel de administración: verificar códigos, marcar como utilizada y auditoría', objetivo: 'Verificar en el navegador el panel del administrador: los cuatro resultados de la verificación, el marcado como utilizada, la tabla de auditoría y que un usuario normal no ve la sección.', pasos: ['Un usuario normal busca el enlace de administración y abre /admin.', 'El administrador abre el panel y verifica un código vigente, lo marca como utilizado y lo vuelve a verificar.', 'Verifica una cancelada, una vencida y un código inexistente.', 'Revisa la tabla de verificaciones y el ancho de 360 px.'], esperado: 'El usuario normal no ve la sección y /admin lo devuelve a las canchas; el administrador ve "Vigente" con cancha, fecha, horario y usuario; tras marcarla queda "No vigente" (usada); cancelada y vencida son "No vigente" con su motivo; el inexistente es "Código no encontrado"; todo queda en la tabla.' },
  async (c) => {
    const jugador = await crearUsuario('e2ejugador');
    const admin = await crearAdministradorE2E('e2eadmin');
    const dia = diaLejano();
    const vigente = (await reservaApi(jugador, K0, dia, '08')).datos.reserva;
    const cancelada = (await reservaApi(jugador, K0, dia, '09')).datos.reserva;
    await api('PATCH', `/reservas/${cancelada.id}/cancelar`, undefined, jugador.token);
    const [, codigoVencida] = sqlq(`INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin) VALUES ('${K1.id}', '${jugador.id}', '${fechaPasadaUnica()}', '10:00', '11:00') RETURNING id || '|' || codigo`).split(/\r?\n/)[0].split('|');

    const sj = await abrirSesion(jugador);
    await sj.page.goto(`${CFG.WEB}/canchas`);
    await sj.page.waitForSelector('nav[aria-label="Principal"]');
    c.verifica((await sj.page.locator('a[aria-label="Administración"]').count()) === 0, 'Un usuario normal no ve el enlace de administración');
    await sj.page.goto(`${CFG.WEB}/admin`);
    await sj.page.waitForURL(`${CFG.WEB}/canchas`);
    c.verifica((await sj.page.locator('#codigo-reserva').count()) === 0, 'Al abrir /admin lo devuelve a las canchas y no ve la sección de verificación');
    await sj.context.close();

    const { context, page } = await abrirSesion(admin);
    await page.goto(`${CFG.WEB}/canchas`);
    await page.waitForSelector('nav[aria-label="Principal"]');
    await page.click('a[aria-label="Administración"]');
    await page.waitForURL(`${CFG.WEB}/admin`);
    c.verifica(/Verificar código de reserva/.test(await page.locator('#titulo-verificar').innerText()), 'El administrador ve la sección "Verificar código de reserva" con su campo');
    await c.captura(page, 'Panel de administración');

    const verificar = async (codigo) => {
      await page.fill('#codigo-reserva', codigo);
      await page.click('button:has-text("Verificar")');
      await page.waitForSelector('.resultado-codigo');
      return page.locator('.resultado-codigo').innerText();
    };

    let texto = await verificar(vigente.codigo);
    c.verifica(/Vigente/.test(texto) && texto.includes(K0.nombre) && texto.includes(jugador.nombre) && /08:00 - 09:00/.test(texto), 'Código vigente: "Vigente" con cancha, horario y nombre del usuario', texto.replace(/\n+/g, ' · ').slice(0, 170));
    await c.captura(page, 'Resultado: Vigente', '.resultado-codigo');
    await page.click('button:has-text("Marcar como utilizada")');
    await page.waitForSelector('.mensaje-exito');
    texto = await page.locator('.resultado-codigo').innerText();
    c.verifica(/No vigente/.test(texto) && /usada/i.test(texto), 'Marcada como utilizada: pasa a "No vigente" por "usada"', texto.replace(/\n+/g, ' · ').slice(0, 120));
    c.verifica((await page.locator('button:has-text("Marcar como utilizada")').count()) === 0, 'Ya no ofrece marcarla otra vez');
    texto = await verificar(vigente.codigo);
    c.verifica(/No vigente/.test(texto) && /usada/i.test(texto), 'Verificarla otra vez ya no la da por vigente');

    texto = await verificar(cancelada.codigo);
    c.verifica(/No vigente/.test(texto) && /cancelada/i.test(texto), 'Reserva cancelada: "No vigente" por "cancelada"');
    texto = await verificar(codigoVencida);
    c.verifica(/No vigente/.test(texto) && /vencida/i.test(texto), 'Reserva vencida: "No vigente" por "vencida"');
    await c.captura(page, 'Resultado: No vigente por vencida', '.resultado-codigo');
    texto = await verificar('CY-00000000');
    c.verifica(/Código no encontrado/.test(texto) && !/Cancha|Usuario/.test(texto), 'Código inexistente: "Código no encontrado" sin datos de ninguna reserva');
    texto = await verificar("' OR 1=1 --");
    c.verifica(/Código no encontrado/.test(texto), 'Un texto con formato inválido también da "Código no encontrado"');

    await page.waitForSelector('.tabla-auditoria tbody tr');
    const filas = await page.locator('.tabla-auditoria tbody tr').allInnerTexts();
    c.verifica(filas.length >= 6 && filas.some((f) => f.includes(vigente.codigo)) && filas.some((f) => f.includes(admin.nombre)), 'La tabla de auditoría registra las verificaciones con administrador y código', `${filas.length} filas`);
    await c.captura(page, 'Tabla de auditoría de verificaciones', '.tabla-auditoria');

    await page.setViewportSize({ width: 360, height: 800 });
    await page.reload();
    await page.waitForSelector('#codigo-reserva');
    c.verifica(await sinScrollHorizontal(page), 'A 360 px el panel no tiene scroll horizontal');
    await c.captura(page, 'Panel de administración a 360 px');
    await context.close();
  }
);

const diaHabilLejano = () => {
  let fecha = diaLejano();
  while ([0, 6].includes(new Date(`${fecha}T00:00:00`).getDay())) fecha = diaLejano();
  return fecha;
};

await S.caso(
  { ...base, id: 'E2E-31', hu: 'US-15', ca: [1, 2, 3, 4, 5, 6], grupo: 'Administración', titulo: 'Gestión de canchas: crear, editar, desactivar con advertencia de reservas y reactivar', objetivo: 'Recorrer en el navegador la gestión de canchas del administrador y su efecto en el catálogo que ve un usuario.', pasos: ['Un usuario normal intenta abrir /admin/canchas.', 'El administrador intenta crear una cancha con precio 0 y con cierre anterior a la apertura, y luego con datos válidos.', 'Edita el precio de una cancha con una reserva confirmada.', 'Intenta desactivarla: el sistema advierte de la reserva y pide confirmación explícita.', 'La reactiva.'], esperado: 'El usuario normal vuelve al catálogo; los datos inválidos muestran errores y no guardan; la cancha nueva aparece en el catálogo; editar no altera la reserva; al desactivar se muestran las reservas afectadas, se exige confirmar y la cancha desaparece del catálogo y de su detalle; al reactivar vuelve.' },
  async (c) => {
    const usuario = await crearUsuario('e2ecat');
    const admin = await crearAdministradorE2E('e2eadmcat');
    const nombre = `E2E Cancha ${Date.now() % 100000}`;

    const su = await abrirSesion(usuario);
    await su.page.goto(`${CFG.WEB}/canchas`);
    await su.page.waitForSelector('nav[aria-label="Principal"]');
    await su.page.goto(`${CFG.WEB}/admin/canchas`);
    await su.page.waitForURL(`${CFG.WEB}/canchas`);
    c.verifica((await su.page.locator('a[aria-label="Administración"]').count()) === 0 && (await su.page.getByText('Gestión de canchas').count()) === 0, 'Un usuario normal no ve las opciones de gestión y vuelve al catálogo');

    const sa = await abrirSesion(admin);
    const pagina = sa.page;
    await pagina.goto(`${CFG.WEB}/admin/canchas`);
    await pagina.waitForSelector('.lista-canchas-admin');
    c.verifica((await pagina.locator('.admin-nav-enlace', { hasText: 'Gestionar canchas' }).count()) === 1, 'El administrador ve "Gestionar canchas" en el menú de administración');
    await c.captura(pagina, 'Gestión de canchas: listado con estado y reservas futuras');

    await pagina.click('button:has-text("Nueva cancha")');
    await pagina.fill('input[name="nombre"]', nombre);
    await pagina.fill('input[name="direccion"]', 'Calle 50 # 10-20, Cali');
    await pagina.fill('input[name="zona"]', 'Norte');
    await pagina.fill('input[name="costoHora"]', '0');
    await pagina.click('button:has-text("Crear cancha")');
    await pagina.locator('.formulario-cancha .campo-error').first().waitFor();
    const errorPrecio = await pagina.locator('.formulario-cancha .campo-error').allInnerTexts();
    c.verifica(errorPrecio.some((e) => /mayor que 0/.test(e)), 'Con precio 0 se muestra el error del precio y no se crea la cancha', errorPrecio.join(' | '));
    c.verifica(sqlq(`SELECT count(*) FROM canchas WHERE nombre='${nombre}'`) === '0', 'No se guardó la cancha con precio inválido');
    await c.captura(pagina, 'Error de precio en el formulario de nueva cancha', '.formulario-cancha');

    await pagina.fill('input[name="costoHora"]', '80000');
    await pagina.fill('input[aria-label="Apertura del lunes"]', '20:00');
    await pagina.fill('input[aria-label="Cierre del lunes"]', '08:00');
    await pagina.click('button:has-text("Crear cancha")');
    await pagina.locator('.horarios-cancha .campo-error').waitFor();
    c.verifica(/cierre debe ser posterior/.test(await pagina.locator('.horarios-cancha .campo-error').innerText()), 'Con el cierre antes de la apertura se explica el error del horario');
    c.verifica(sqlq(`SELECT count(*) FROM canchas WHERE nombre='${nombre}'`) === '0', 'Tampoco se guardó con el horario inválido');

    await pagina.fill('input[aria-label="Apertura del lunes"]', '08:00');
    await pagina.fill('input[aria-label="Cierre del lunes"]', '20:00');
    await pagina.click('button:has-text("Crear cancha")');
    await pagina.waitForSelector('.mensaje-exito');
    c.verifica(/se creó y ya aparece en el catálogo/.test(await pagina.locator('.mensaje-exito').first().innerText()), 'Con datos válidos la cancha se crea y se avisa');
    const fila = pagina.locator('.cancha-admin', { hasText: nombre });
    c.verifica((await fila.count()) === 1 && /Activa/.test(await fila.innerText()), 'La cancha aparece en el listado de administración como Activa');
    const idCancha = sqlq(`SELECT id FROM canchas WHERE nombre='${nombre}'`);

    await su.page.goto(`${CFG.WEB}/canchas`);
    await su.page.waitForSelector('a.tarjeta-cancha');
    c.verifica((await su.page.locator('a.tarjeta-cancha', { hasText: nombre }).count()) === 1, 'El usuario ve la cancha nueva en el catálogo');
    await c.captura(su.page, 'El catálogo del usuario muestra la cancha creada');

    const fechaReserva = diaHabilLejano();
    const reserva = await api('POST', `/canchas/${idCancha}/reservas`, { fecha: fechaReserva, horaInicio: '10:00', horaFin: '11:00' }, usuario.token);
    c.verifica(reserva.status === 201, 'Preparación: el usuario reserva una franja de la cancha nueva');

    await fila.locator('button:has-text("Editar")').click();
    await pagina.waitForSelector('input[name="costoHora"]');
    c.verifica((await pagina.locator('input[name="nombre"]').inputValue()) === nombre, 'Editar carga los datos actuales de la cancha');
    await pagina.fill('input[name="costoHora"]', '91000');
    await pagina.click('button:has-text("Guardar cambios")');
    await pagina.waitForSelector('.mensaje-exito:has-text("Las reservas ya confirmadas no se modificaron")');
    await su.page.goto(`${CFG.WEB}/canchas`);
    await su.page.waitForSelector('a.tarjeta-cancha');
    c.verifica(/91\.000/.test(await su.page.locator('a.tarjeta-cancha', { hasText: nombre }).innerText()), 'El catálogo refleja el precio nuevo ($ 91.000)');
    c.verifica(sqlq(`SELECT estado || '|' || fecha::text || '|' || hora_inicio::text FROM reservas WHERE id='${reserva.datos.reserva.id}'`) === `confirmada|${fechaReserva}|10:00:00`, 'La reserva ya confirmada no se alteró');

    await pagina.locator('.cancha-admin', { hasText: nombre }).locator('button:has-text("Desactivar")').click();
    await pagina.waitForSelector('[role="dialog"]');
    await pagina.click('button:has-text("Sí, desactivar")');
    await pagina.waitForSelector('[role="dialog"] :text("Esta cancha tiene reservas futuras")');
    const advertencia = await pagina.locator('[role="dialog"]').innerText();
    c.verifica(advertencia.includes(reserva.datos.reserva.codigo) && /1 reserva futura confirmada/.test(advertencia), 'Al desactivar, el sistema advierte de la reserva futura afectada y muestra su código', advertencia.replace(/\n+/g, ' · ').slice(0, 150));
    c.verifica(sqlq(`SELECT disponible FROM canchas WHERE id='${idCancha}'`) === 't', 'Mientras no se confirma, la cancha sigue activa');
    await c.captura(pagina, 'Advertencia de reservas futuras antes de desactivar', '[role="dialog"]');
    await pagina.click('button:has-text("Sí, desactivar de todos modos")');
    await pagina.waitForSelector('.mensaje-exito:has-text("se desactivó")');
    c.verifica(sqlq(`SELECT disponible FROM canchas WHERE id='${idCancha}'`) === 'f' && sqlq(`SELECT estado FROM reservas WHERE id='${reserva.datos.reserva.id}'`) === 'confirmada', 'Con la confirmación explícita se desactiva y la reserva se conserva confirmada');
    c.verifica(/Desactivada/.test(await pagina.locator('.cancha-admin', { hasText: nombre }).innerText()), 'El listado de administración la marca como Desactivada');
    await c.captura(pagina, 'Cancha desactivada en el listado de administración');

    await su.page.goto(`${CFG.WEB}/canchas`);
    await su.page.waitForSelector('a.tarjeta-cancha');
    c.verifica((await su.page.locator('a.tarjeta-cancha', { hasText: nombre }).count()) === 0, 'Desactivada, deja de mostrarse en el catálogo público');
    await su.page.goto(`${CFG.WEB}/canchas/${idCancha}`);
    await su.page.waitForSelector('.mensaje-error');
    c.verifica(/No encontramos esta cancha|no encontrada/i.test(await su.page.locator('.mensaje-error').first().innerText()), 'Su detalle público ya no existe');
    const bloqueada = await api('POST', `/canchas/${idCancha}/reservas`, { fecha: fechaReserva, horaInicio: '12:00', horaFin: '13:00' }, usuario.token);
    c.verifica(bloqueada.status === 409 && bloqueada.datos.codigo === 'CANCHA_NO_DISPONIBLE', 'No admite nuevas reservas: 409 CANCHA_NO_DISPONIBLE');
    await su.page.goto(`${CFG.WEB}/mis-reservas`);
    await su.page.waitForSelector('.reserva-item');
    c.verifica(/Confirmada/.test(await su.page.locator('.reserva-item', { hasText: reserva.datos.reserva.codigo }).innerText()), 'El historial del usuario conserva su reserva confirmada');

    await pagina.locator('.cancha-admin', { hasText: nombre }).locator('button:has-text("Activar")').click();
    await pagina.waitForSelector('.mensaje-exito:has-text("se reactivó")');
    await su.page.goto(`${CFG.WEB}/canchas`);
    await su.page.waitForSelector('a.tarjeta-cancha');
    c.verifica((await su.page.locator('a.tarjeta-cancha', { hasText: nombre }).count()) === 1, 'Al reactivarla vuelve al catálogo');
    await su.context.close();
    await sa.context.close();
  }
);

// La cancha de prueba se elimina (con su reserva) para dejar el catálogo como estaba, aunque el caso haya fallado a mitad.
sqlq("DELETE FROM canchas WHERE nombre LIKE 'E2E Cancha %'");

await S.caso(
  { ...base, id: 'E2E-32', hu: 'US-16', ca: [1, 2, 3, 4, 5], grupo: 'Administración', titulo: 'Cancelación administrativa: buscar, exigir motivo, bloquear con menos de 2 horas y notificar al usuario', objetivo: 'Recorrer en el navegador la cancelación de reservas por un administrador y lo que ve el usuario afectado.', pasos: ['El administrador busca por usuario la reserva de otra persona.', 'Intenta cancelar sin motivo y luego con motivo.', 'Intenta cancelar una reserva que empieza en menos de 2 horas.', 'El usuario revisa "Mis reservas".'], esperado: 'La búsqueda encuentra la reserva; sin motivo se muestra el error; con motivo la reserva pasa a "Cancelada administrativamente" y queda auditada; con menos de 2 horas se bloquea explicando la restricción; el usuario ve el estado y el motivo.' },
  async (c) => {
    const usuario = await crearUsuario('e2eafectado');
    const otro = await crearUsuario('e2epronto');
    const admin = await crearAdministradorE2E('e2eadm16');
    const dia = diaHabilLejano();
    const reserva = (await reservaApi(usuario, K0, dia, '11')).datos.reserva;
    const [idPronto, codigoPronto] = insertarProntoLibre(otro, [K1, K2, K3, K4]);
    c.verifica(Boolean(reserva?.codigo) && Boolean(idPronto), 'Preparación: una reserva futura y otra que empieza en menos de 2 horas');

    const sa = await abrirSesion(admin);
    const p = sa.page;
    await p.goto(`${CFG.WEB}/admin/reservas`);
    await p.waitForSelector('.admin-filtros');
    await p.fill('#filtro-usuario', usuario.correo);
    await p.click('button:has-text("Buscar")');
    await p.waitForSelector(`.reserva-item:has-text("${reserva.codigo}")`);
    c.verifica((await p.locator('.reserva-item').count()) === 1 && (await p.locator('.reserva-item').innerText()).includes(usuario.nombre), 'Buscar por usuario encuentra su reserva futura, con el nombre del titular');
    await c.captura(p, 'Administración de reservas: búsqueda por usuario');

    await p.click(`button[aria-label="Cancelar reserva ${reserva.codigo}"]`);
    await p.waitForSelector('[role="dialog"]');
    await p.fill('#motivo-cancelacion', '   ');
    await p.click('button:has-text("Confirmar cancelación")');
    await p.locator('[role="dialog"] .mensaje-error').waitFor();
    c.verifica(/motivo de la cancelación es obligatorio/i.test(await p.locator('[role="dialog"] .mensaje-error').innerText()) && sqlq(`SELECT estado FROM reservas WHERE id='${reserva.id}'`) === 'confirmada', 'Con un motivo en blanco se muestra el error y la reserva sigue confirmada');
    await c.captura(p, 'Motivo obligatorio al cancelar', '[role="dialog"]');
    await p.fill('#motivo-cancelacion', 'La cancha estará en mantenimiento');
    await p.click('button:has-text("Confirmar cancelación")');
    await p.waitForSelector('.mensaje-exito');
    c.verifica(/fue cancelada\. Se notificó al usuario por correo/.test(await p.locator('.mensaje-exito').first().innerText()), 'Con motivo se cancela y se informa al administrador que se notificó al usuario');
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE id='${reserva.id}'`) === 'cancelada_administrativamente', 'La reserva queda "cancelada administrativamente"');
    c.verifica(sqlq(`SELECT (administrador_id = '${admin.id}')::text || '|' || motivo FROM cancelaciones_administrativas WHERE reserva_id='${reserva.id}'`) === 'true|La cancha estará en mantenimiento', 'Queda registrada la auditoría: administrador y motivo');
    c.verifica(!(await api('GET', `/canchas/${K0.id}/disponibilidad?fecha=${dia}`, undefined, usuario.token)).datos.ocupados.some((o) => String(o.horaInicio).startsWith('11:00')), 'La franja quedó disponible');
    await c.captura(p, 'Cancelación administrativa realizada');

    await p.fill('#filtro-usuario', otro.correo);
    await p.click('button:has-text("Buscar")');
    await p.waitForSelector(`.reserva-item:has-text("${codigoPronto}")`);
    await p.click(`button[aria-label="Cancelar reserva ${codigoPronto}"]`);
    await p.waitForSelector('[role="dialog"]');
    await p.fill('#motivo-cancelacion', 'Imprevisto operativo');
    await p.click('button:has-text("Confirmar cancelación")');
    await p.locator('[role="dialog"] .mensaje-error').waitFor();
    const bloqueo = await p.locator('[role="dialog"] .mensaje-error').innerText();
    c.verifica(/2 horas/.test(bloqueo) && sqlq(`SELECT estado FROM reservas WHERE id='${idPronto}'`) === 'confirmada', 'Con menos de 2 horas se bloquea explicando la restricción y la reserva sigue confirmada', bloqueo.replace(/\n+/g, ' '));
    await c.captura(p, 'Cancelación bloqueada por faltar menos de 2 horas', '[role="dialog"]');
    await sa.context.close();

    const su = await abrirSesion(usuario);
    await su.page.goto(`${CFG.WEB}/mis-reservas`);
    await su.page.waitForSelector('.reserva-item');
    const visto = await su.page.locator('.reserva-item', { hasText: reserva.codigo }).innerText();
    c.verifica(/Cancelada administrativamente/.test(visto) && visto.includes('La cancha estará en mantenimiento') && (await su.page.locator('.reserva-item', { hasText: reserva.codigo }).locator('button:has-text("Cancelar reserva")').count()) === 0, 'El usuario ve "Cancelada administrativamente" y el motivo, sin opción de cancelar', visto.replace(/\n+/g, ' · ').slice(0, 170));
    await c.captura(su.page, 'Mis reservas: reserva cancelada administrativamente con su motivo');
    await esperar(300);
    const correo = logsBackend('5m').split('\n').find((l) => l.includes('Cancelación administrativa') && l.includes(usuario.correo));
    c.verifica(Boolean(correo) && correo.includes('La cancha estará en mantenimiento'), 'El usuario afectado recibió el correo con el motivo (registro del backend sin SMTP)');
    await su.context.close();
  }
);

await S.caso(
  { ...base, id: 'E2E-30', hu: 'US-27', hus: ['US-27', 'US-28', 'US-29', 'US-14', 'US-15', 'US-16'], ca: {}, grupo: 'Transversal', prioridad: 'Media', titulo: 'Sin errores de JavaScript inesperados en los flujos del Sprint 5', objetivo: 'Verificar que cancelación, perfil, tarjetas, gestión de canchas, cancelación administrativa y panel de administración no provocaron errores no controlados en el navegador.', pasos: ['Revisar los errores de consola y de página acumulados en E2E-26 a E2E-32.'], esperado: 'Ningún error de JavaScript inesperado; solo los mensajes de red 4xx provocados a propósito (validaciones, rechazos, 403, 404, 402).' },
  async (c) => {
    const esperados = /status of (400|401|402|403|404|409|426|429|500)|Failed to load resource/;
    const inesperados = erroresConsola.filter((e) => !esperados.test(e));
    c.verifica(inesperados.length === 0, 'No hubo errores de JavaScript inesperados', inesperados.length ? inesperados.slice(0, 5).join(' | ') : `${erroresConsola.length} mensajes de red esperados (4xx provocados por las pruebas)`);
  }
);

await browser.close();
console.log('\nE2E:', S.resumen());
