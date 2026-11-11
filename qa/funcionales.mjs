// Suite de pruebas funcionales: API REST y Socket.IO contra el entorno Docker aislado.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Suite, CFG, ROOT, api, sql, dc, logsBackend, crearUsuario, canchas, conectar, emitir, eventosDe, esperarEvento, cerrar, esperar, fechaCO, fechaUnica, sh } from './lib.mjs';

const requireBackend = createRequire(`${ROOT}/backend/package.json`);
const jwt = requireBackend('jsonwebtoken');

const S = new Suite('funcionales', 'Pruebas funcionales (API REST y Socket.IO)');
const t = (ms) => `${Math.round(ms)} ms`;
const cerca = (a, b, tol) => Math.abs(a - b) <= tol;
const base = { tipo: 'Funcional', nivel: 'API REST', prioridad: 'Alta' };
const franja = (hora = 10) => ({ fecha: fechaUnica(), horaInicio: `${String(hora).padStart(2, '0')}:00`, horaFin: `${String(hora + 1).padStart(2, '0')}:00` });
const sqlq = (q) => sql(q.replace(/\s+/g, ' '));

// ---------- Datos compartidos ----------
const [ANA, BETO, CARLA] = await Promise.all([crearUsuario('ana'), crearUsuario('beto'), crearUsuario('carla')]);
const lista = await canchas(ANA.token);
const K0 = lista[0];
const K1 = lista[1];
const K2 = lista[2];
const reservar = (usuario, cancha, f) => api('POST', `/canchas/${cancha.id}/reservas`, f, usuario.token);
const disponibilidad = (usuario, cancha, fecha) => api('GET', `/canchas/${cancha.id}/disponibilidad?fecha=${fecha}`, undefined, usuario.token);
const completar = (usuario, cancha, f) => api('POST', `/canchas/${cancha.id}/temporizador/completar`, f, usuario.token);
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

// ---------- Prueba larga (3 min reales): se lanza ahora y se evalúa al final ----------
const larga = (async () => {
  const A = await crearUsuario('largaa');
  const B = await crearUsuario('largab');
  const f = franja(10);
  const a = await conectar(A.token, K2.id);
  const b = await conectar(B.token, K2.id);
  const ret = await emitir(a, 'retencion:solicitar', f);
  const expiresAt = a.expiresAt;
  const evExp = await esperarEvento(a, 'temporizador:expirado', () => true, expiresAt - Date.now() + 20000);
  const evLib = await esperarEvento(b, 'disponibilidad:liberada', (x) => x.horaInicio === f.horaInicio && x.fecha === f.fecha, 12000);
  const comp = await completar(A, K2, f);
  const retDespues = await emitir(a, 'retencion:solicitar', f);
  const filas = {
    sesion: sqlq(`SELECT count(*) FROM sesiones_reserva WHERE usuario_id='${A.id}'`),
    retencion: sqlq(`SELECT count(*) FROM retenciones WHERE usuario_id='${A.id}'`),
  };
  const sync = eventosDe(a, 'temporizador:sync').length;
  cerrar(a, b);
  return { f, ret, expiresAt, tExp: evExp?.t, tLib: evLib?.t, comp, retDespues, filas, sync };
})();

// =====================================================================
// US-01 Registro
// =====================================================================
await S.caso(
  { ...base, id: 'F-01-01', hu: 'US-01', ca: [1], grupo: 'US-01', titulo: 'Registro con datos válidos', objetivo: 'Verificar que un visitante puede crear su cuenta y que la respuesta no expone datos sensibles.', datos: 'nombre, correo único, teléfono 3001234567 y contraseña "Password123!".', pasos: ['POST /api/auth/registro con los 4 datos válidos.', 'Revisar el código de estado y el cuerpo.'], esperado: '201 Created con mensaje "Cuenta creada correctamente" y el usuario (id, nombre, correo) sin contraseña ni hash.' },
  async (c) => {
    const correo = `reg.${Date.now()}@qa.local`;
    const r = await api('POST', '/auth/registro', { nombre: 'Registro QA', correo, telefono: '3001234567', password: CFG.password });
    c.verifica(r.status === 201, 'Responde 201 Created', `HTTP ${r.status}`);
    c.verifica(r.datos.mensaje === 'Cuenta creada correctamente', 'Mensaje de confirmación correcto', r.datos.mensaje);
    c.verifica(r.datos.usuario?.id && r.datos.usuario.correo === correo, 'Devuelve el usuario con id y correo');
    c.verifica(!JSON.stringify(r.datos).match(/password|hash/i), 'La respuesta no contiene contraseña ni hash');
  }
);

await S.caso(
  { ...base, id: 'F-01-02', hu: 'US-01', ca: [2], grupo: 'US-01', prioridad: 'Alta', titulo: 'Registro con correo ya existente (caso de error)', objetivo: 'Verificar que no se crea una cuenta duplicada.', datos: 'Correo de un usuario ya registrado.', pasos: ['Registrar un usuario.', 'Intentar registrar otro con el mismo correo.', 'Contar los usuarios con ese correo en la base.'], esperado: '409 Conflict con el mensaje "El correo ya está registrado"; solo existe 1 fila con ese correo.' },
  async (c) => {
    const u = await crearUsuario('dup');
    const r = await api('POST', '/auth/registro', { nombre: 'Otro', correo: u.correo, telefono: '3000000000', password: CFG.password });
    c.verifica(r.status === 409, 'Responde 409 Conflict', `HTTP ${r.status}`);
    c.verifica(r.datos.mensaje === 'El correo ya está registrado', 'Mensaje claro', r.datos.mensaje);
    c.verifica(sqlq(`SELECT count(*) FROM usuarios WHERE correo='${u.correo}'`) === '1', 'No se creó una cuenta duplicada (1 fila en la base)');
  }
);

await S.caso(
  { ...base, id: 'F-01-03', hu: 'US-01', ca: [3], grupo: 'US-01', titulo: 'Validaciones del registro (campos vacíos y contraseña débil)', objetivo: 'Verificar que el backend valida siempre los datos aunque el frontend ya lo haga.', pasos: ['POST con todos los campos vacíos.', 'POST con contraseña de 5 caracteres.', 'POST con contraseña solo de letras.', 'POST con correo mal formado.'], esperado: 'Cada intento responde 400 con "Error de validación" y la lista de campos con su mensaje; no se crea ningún usuario.' },
  async (c) => {
    const casos = [
      ['Campos vacíos', { nombre: '', correo: '', telefono: '', password: '' }, ['nombre', 'correo', 'telefono', 'password']],
      ['Contraseña corta', { nombre: 'X', correo: `v1.${Date.now()}@qa.local`, telefono: '300', password: 'Ab1' }, ['password']],
      ['Contraseña sin número', { nombre: 'X', correo: `v2.${Date.now()}@qa.local`, telefono: '300', password: 'SoloLetras' }, ['password']],
      ['Correo inválido', { nombre: 'X', correo: 'no-es-correo', telefono: '300', password: CFG.password }, ['correo']],
    ];
    for (const [nombre, cuerpo, campos] of casos) {
      const r = await api('POST', '/auth/registro', cuerpo);
      const reportados = (r.datos.errores ?? []).map((e) => e.campo);
      c.verifica(r.status === 400 && campos.every((x) => reportados.includes(x)), `${nombre}: 400 y errores en [${campos.join(', ')}]`, `HTTP ${r.status}, campos ${reportados.join(', ')}`);
    }
    c.verifica(sqlq("SELECT count(*) FROM usuarios WHERE correo LIKE 'v1.%@qa.local' OR correo LIKE 'v2.%@qa.local'") === '0', 'Ninguno de los intentos inválidos creó un usuario');
  }
);

await S.caso(
  { ...base, id: 'F-01-04', hu: 'US-01', ca: [4], grupo: 'US-01', titulo: 'La contraseña se almacena cifrada con bcrypt (RNF-03)', objetivo: 'Verificar directamente en la base de datos que no se guarda la contraseña en texto plano.', pasos: ['Registrar un usuario.', 'Consultar password_hash en la tabla usuarios.'], esperado: 'El valor es un hash bcrypt ($2a/$2b, 60 caracteres) distinto de la contraseña ingresada.' },
  async (c) => {
    const u = await crearUsuario('hash');
    const h = sqlq(`SELECT password_hash FROM usuarios WHERE correo='${u.correo}'`);
    c.verifica(/^\$2[aby]\$10\$/.test(h) && h.length === 60, 'password_hash es un hash bcrypt (prefijo $2?$10$, 60 caracteres)', `${h.slice(0, 7)}… (${h.length} caracteres)`);
    c.verifica(h !== CFG.password && !h.includes(CFG.password), 'No contiene la contraseña en texto plano');
  }
);

// =====================================================================
// US-02 Inicio de sesión
// =====================================================================
await S.caso(
  { ...base, id: 'F-02-01', hu: 'US-02', ca: [1], grupo: 'US-02', titulo: 'Inicio de sesión con credenciales correctas', objetivo: 'Verificar que se emite un JWT válido y se devuelven los datos del usuario.', pasos: ['POST /api/auth/login con correo y contraseña correctos.', 'Decodificar el token.'], esperado: '200 con token JWT (sub = id del usuario, con expiración) y usuario {id, nombre, correo}.' },
  async (c) => {
    const r = await api('POST', '/auth/login', { correo: ANA.correo, password: ANA.password });
    c.verifica(r.status === 200 && typeof r.datos.token === 'string', 'Responde 200 con token', `HTTP ${r.status}`);
    const payload = jwt.decode(r.datos.token);
    c.verifica(payload.sub === ANA.id && payload.exp > payload.iat, 'El token identifica al usuario (sub) y tiene expiración', `exp − iat = ${(payload.exp - payload.iat) / 3600} h`);
    c.verifica(r.datos.usuario.correo === ANA.correo && !('passwordHash' in r.datos.usuario), 'Devuelve el usuario sin datos sensibles');
  }
);

await S.caso(
  { ...base, id: 'F-02-02', hu: 'US-02', ca: [2], grupo: 'US-02', titulo: 'Credenciales incorrectas: mensaje genérico (caso de error)', objetivo: 'Verificar que el mensaje no revela si el correo existe o si falló la contraseña.', pasos: ['Login con contraseña incorrecta de un correo existente.', 'Login con un correo que no existe.', 'Comparar ambas respuestas.'], esperado: 'Ambas responden 401 con exactamente el mismo mensaje "Correo o contraseña incorrectos".' },
  async (c) => {
    const a = await api('POST', '/auth/login', { correo: ANA.correo, password: 'Incorrecta123' });
    const b = await api('POST', '/auth/login', { correo: 'noexiste@qa.local', password: 'Incorrecta123' });
    c.verifica(a.status === 401 && b.status === 401, 'Ambos casos responden 401', `${a.status} / ${b.status}`);
    c.verifica(a.datos.mensaje === 'Correo o contraseña incorrectos' && a.datos.mensaje === b.datos.mensaje, 'El mensaje es genérico e idéntico en ambos casos', a.datos.mensaje);
    c.verifica(!a.datos.token && !b.datos.token, 'No se emite token');
  }
);

await S.caso(
  { ...base, id: 'F-02-03', hu: 'US-02', ca: [3, 4], grupo: 'US-02', titulo: 'Acceso a rutas protegidas con y sin token', objetivo: 'Verificar que el token válido da acceso y que la ausencia o invalidez de token se rechaza con 401.', pasos: ['GET /api/canchas con token válido.', 'GET /api/canchas sin token.', 'GET /api/canchas con token alterado.', 'GET /api/canchas con un esquema de autorización distinto de Bearer.'], esperado: '200 con token válido; 401 en los otros tres casos, con mensaje claro.' },
  async (c) => {
    const ok = await api('GET', '/canchas', undefined, ANA.token);
    c.verifica(ok.status === 200, 'Con token válido: 200', `HTTP ${ok.status}`);
    const sin = await api('GET', '/canchas');
    c.verifica(sin.status === 401 && sin.datos.mensaje === 'No autenticado', 'Sin token: 401 "No autenticado"', `HTTP ${sin.status}`);
    const mal = await api('GET', '/canchas', undefined, `${ANA.token.slice(0, -4)}XXXX`);
    c.verifica(mal.status === 401, 'Token alterado: 401', `HTTP ${mal.status} — ${mal.datos.mensaje}`);
    const basic = await api('GET', '/canchas', undefined, undefined, { Authorization: 'Basic abc123' });
    c.verifica(basic.status === 401, 'Esquema distinto de Bearer: 401', `HTTP ${basic.status}`);
  }
);

// =====================================================================
// US-03 Recuperación de contraseña
// =====================================================================
const obtenerEnlaceDeLogs = (correo) => {
  const logs = logsBackend('15m');
  const m = [...logs.matchAll(/\[EMAIL\] Para: (\S+) -> (\S+)/g)].filter((x) => x[1] === correo).pop();
  return m ? m[2] : null;
};

await S.caso(
  { ...base, id: 'F-03-01', hu: 'US-03', ca: [1, 4], grupo: 'US-03', titulo: 'Solicitud de recuperación: mensaje neutro y envío del enlace', objetivo: 'Verificar que se genera el enlace para un correo registrado y que la respuesta no revela si el correo existe.', datos: 'Un correo registrado y otro no registrado. SMTP no configurado: el enlace se imprime en el log del servidor (modo desarrollo).', pasos: ['POST /api/auth/olvide-password con un correo registrado.', 'POST con un correo no registrado.', 'Comparar las respuestas.', 'Buscar el enlace en el log del backend.'], esperado: '200 con el mismo mensaje neutro en ambos casos; solo el correo registrado genera un enlace con token en el log.' },
  async (c) => {
    const u = await crearUsuario('rec');
    const a = await api('POST', '/auth/olvide-password', { correo: u.correo });
    const b = await api('POST', '/auth/olvide-password', { correo: 'fantasma@qa.local' });
    c.verifica(a.status === 200 && b.status === 200, 'Ambas solicitudes responden 200', `${a.status} / ${b.status}`);
    c.verifica(a.datos.mensaje === b.datos.mensaje, 'El mensaje es idéntico (neutro)', a.datos.mensaje);
    await esperar(500);
    const enlace = obtenerEnlaceDeLogs(u.correo);
    c.verifica(/\/restablecer-password\?token=[0-9a-f]{20,}/.test(enlace ?? ''), 'Se generó el enlace de restablecimiento con token', enlace?.replace(/token=.*/, 'token=…'));
    c.verifica(obtenerEnlaceDeLogs('fantasma@qa.local') === null, 'Para el correo no registrado no se generó ningún enlace');
    const fila = sqlq(`SELECT count(*) FROM password_reset_tokens WHERE usuario_id='${u.id}' AND used_at IS NULL`);
    c.verifica(fila === '1', 'Se guardó un único token pendiente (almacenado como hash)', `${fila} token(s)`);
    const guardado = sqlq(`SELECT token_hash FROM password_reset_tokens WHERE usuario_id='${u.id}'`);
    c.verifica(!enlace?.includes(guardado), 'El token en la base está hasheado: no coincide con el del enlace');
  }
);

await S.caso(
  { ...base, id: 'F-03-02', hu: 'US-03', ca: [2, 3], grupo: 'US-03', titulo: 'Restablecer la contraseña y reutilización del enlace', objetivo: 'Verificar el cambio de contraseña con el token, que la contraseña antigua deja de servir y que el enlace no se puede reutilizar.', pasos: ['Solicitar la recuperación y tomar el token del log.', 'POST /api/auth/restablecer-password con una contraseña débil.', 'POST con una contraseña válida.', 'Iniciar sesión con la contraseña nueva y con la antigua.', 'Reutilizar el mismo token.', 'Usar un token inventado.'], esperado: '400 con la contraseña débil; 200 con la válida; login OK solo con la nueva; 400 al reutilizar el enlace y con un token inventado.' },
  async (c) => {
    const u = await crearUsuario('rec2');
    await api('POST', '/auth/olvide-password', { correo: u.correo });
    await esperar(500);
    const token = obtenerEnlaceDeLogs(u.correo)?.split('token=')[1];
    c.verifica(Boolean(token), 'Se obtuvo el token del enlace');
    const debil = await api('POST', '/auth/restablecer-password', { token, nuevaPassword: 'abc' });
    c.verifica(debil.status === 400, 'Contraseña débil: 400', `HTTP ${debil.status}`);
    const ok = await api('POST', '/auth/restablecer-password', { token, nuevaPassword: 'NuevaClave456' });
    c.verifica(ok.status === 200 && ok.datos.mensaje === 'Contraseña actualizada correctamente', 'Contraseña válida: 200 "Contraseña actualizada correctamente"', `HTTP ${ok.status}`);
    const conNueva = await api('POST', '/auth/login', { correo: u.correo, password: 'NuevaClave456' });
    const conVieja = await api('POST', '/auth/login', { correo: u.correo, password: u.password });
    c.verifica(conNueva.status === 200, 'Inicia sesión con la contraseña nueva', `HTTP ${conNueva.status}`);
    c.verifica(conVieja.status === 401, 'La contraseña anterior ya no sirve', `HTTP ${conVieja.status}`);
    const reuso = await api('POST', '/auth/restablecer-password', { token, nuevaPassword: 'OtraClave789' });
    c.verifica(reuso.status === 400 && /inválido o ha expirado/.test(reuso.datos.mensaje), 'El enlace usado se rechaza: 400 "inválido o ha expirado"', reuso.datos.mensaje);
    const falso = await api('POST', '/auth/restablecer-password', { token: 'inventado123', nuevaPassword: 'OtraClave789' });
    c.verifica(falso.status === 400, 'Un token inventado se rechaza: 400', `HTTP ${falso.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-03-03', hu: 'US-03', ca: [3], grupo: 'US-03', titulo: 'Un enlace nuevo invalida el anterior; enlace vencido', objetivo: 'Verificar que solo el último enlace de recuperación es válido y que un enlace vencido se rechaza.', pasos: ['Solicitar la recuperación dos veces y tomar ambos tokens.', 'Intentar usar el primero.', 'Forzar el vencimiento del segundo en la base.', 'Intentar usar el segundo.'], esperado: 'El primer token se rechaza (400); el segundo, ya vencido, también se rechaza (400).' },
  async (c) => {
    const u = await crearUsuario('rec3');
    await api('POST', '/auth/olvide-password', { correo: u.correo });
    await esperar(400);
    const t1 = obtenerEnlaceDeLogs(u.correo).split('token=')[1];
    await api('POST', '/auth/olvide-password', { correo: u.correo });
    await esperar(400);
    const t2 = obtenerEnlaceDeLogs(u.correo).split('token=')[1];
    c.verifica(t1 !== t2, 'Cada solicitud genera un token distinto');
    const r1 = await api('POST', '/auth/restablecer-password', { token: t1, nuevaPassword: 'NuevaClave456' });
    c.verifica(r1.status === 400, 'El primer enlace quedó invalidado: 400', `HTTP ${r1.status}`);
    sqlq(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE usuario_id='${u.id}' AND used_at IS NULL`);
    const r2 = await api('POST', '/auth/restablecer-password', { token: t2, nuevaPassword: 'NuevaClave456' });
    c.verifica(r2.status === 400, 'El enlace vencido se rechaza: 400', `HTTP ${r2.status}`);
  }
);

// =====================================================================
// US-04..US-07 Catálogo
// =====================================================================
await S.caso(
  { ...base, id: 'F-04-01', hu: 'US-04', ca: [1], grupo: 'US-04', titulo: 'Listado de canchas con nombre y dirección', objetivo: 'Verificar el listado para un usuario autenticado y su contenido.', pasos: ['GET /api/canchas con token.', 'Revisar los campos de cada cancha.'], esperado: '200 con las 5 canchas de ejemplo; cada una con id, nombre, dirección, zona, costoHora, tipo y foto.' },
  async (c) => {
    const r = await api('GET', '/canchas', undefined, ANA.token);
    c.verifica(r.status === 200 && r.datos.canchas.length === 5, 'Responde 200 con 5 canchas', `HTTP ${r.status}, ${r.datos.canchas?.length} canchas`);
    const completo = r.datos.canchas.every((k) => k.id && k.nombre && k.direccion && k.zona && k.costoHora > 0 && k.tipo && k.imagenUrl);
    c.verifica(completo, 'Cada cancha trae id, nombre, dirección, zona, costo, tipo y foto');
    c.nota(`Canchas: ${r.datos.canchas.map((k) => k.nombre).join(', ')}`);
  }
);

await S.caso(
  { ...base, id: 'F-04-02', hu: 'US-04', ca: [1], grupo: 'US-04', titulo: 'El listado exige autenticación', objetivo: 'Verificar que sin token no se puede ver el catálogo.', pasos: ['GET /api/canchas sin token.'], esperado: '401 "No autenticado".' },
  async (c) => {
    const r = await api('GET', '/canchas');
    c.verifica(r.status === 401, 'Responde 401', `HTTP ${r.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-05-01', hu: 'US-05', ca: [1], grupo: 'US-05', titulo: 'Detalle de cancha con horarios por día', objetivo: 'Verificar el contenido del detalle.', pasos: ['GET /api/canchas/:id para una cancha.', 'Revisar los campos y los horarios.'], esperado: '200 con nombre, dirección, zona, costo, descripción, servicios y horarios por día (diaSemana 0-6, horaInicio < horaFin).' },
  async (c) => {
    const r = await api('GET', `/canchas/${K0.id}`, undefined, ANA.token);
    const k = r.datos.cancha;
    c.verifica(r.status === 200 && k.nombre === K0.nombre, 'Responde 200 con la cancha pedida', k?.nombre);
    c.verifica(k.direccion && k.zona && Number(k.costoHora) > 0 && k.descripcion && k.servicios?.length > 0, 'Incluye dirección, zona, costo, descripción y servicios');
    c.verifica(k.horarios.length === 7, 'Tiene horario para los 7 días de la semana', `${k.horarios.length} registros`);
    c.verifica(k.horarios.every((h) => h.horaInicio < h.horaFin && h.diaSemana >= 0 && h.diaSemana <= 6), 'Todos los horarios son coherentes (inicio < fin)', k.horarios[0].horaInicio + '–' + k.horarios[0].horaFin);
  }
);

await S.caso(
  { ...base, id: 'F-05-02', hu: 'US-05', ca: [2, 3], grupo: 'US-05', titulo: 'Detalle: sin token, id inválido y cancha inexistente (casos de error)', objetivo: 'Verificar el manejo de errores del detalle.', pasos: ['GET sin token.', 'GET con id "abc".', 'GET con un UUID válido que no existe.'], esperado: '401, 400 y 404 respectivamente, con mensajes claros.' },
  async (c) => {
    const a = await api('GET', `/canchas/${K0.id}`);
    c.verifica(a.status === 401, 'Sin token: 401', `HTTP ${a.status}`);
    const b = await api('GET', '/canchas/abc', undefined, ANA.token);
    c.verifica(b.status === 400, 'Id inválido: 400', `HTTP ${b.status} — ${b.datos.errores?.[0]?.mensaje}`);
    const d = await api('GET', `/canchas/${UUID_INEXISTENTE}`, undefined, ANA.token);
    c.verifica(d.status === 404 && d.datos.mensaje === 'Cancha no encontrada', 'Cancha inexistente: 404 "Cancha no encontrada"', `HTTP ${d.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-06-01', hu: 'US-06', ca: [1, 2, 3], grupo: 'US-06', titulo: 'Filtros por zona y por precio', objetivo: 'Verificar que cada filtro, solo o combinado, reduce el listado correctamente y que un filtro sin coincidencias devuelve una lista vacía.', pasos: ['Listar sin filtros y tomar una zona y los precios.', 'Filtrar por zona.', 'Filtrar por precioMin y precioMax.', 'Combinar zona y precio.', 'Filtrar por una zona que no existe.'], esperado: 'Cada filtro devuelve solo las canchas que lo cumplen; sin coincidencias → 200 con lista vacía.' },
  async (c) => {
    const todas = (await api('GET', '/canchas', undefined, ANA.token)).datos.canchas;
    const zona = todas[0].zona;
    const porZona = (await api('GET', `/canchas?zona=${encodeURIComponent(zona)}`, undefined, ANA.token)).datos.canchas;
    c.verifica(porZona.length >= 1 && porZona.every((k) => k.zona.toLowerCase().includes(zona.toLowerCase())), `Filtro por zona "${zona}": ${porZona.length} resultado(s), todos de esa zona`);
    const precios = todas.map((k) => k.costoHora).sort((a, b) => a - b);
    const mediana = precios[2];
    const min = (await api('GET', `/canchas?precioMin=${mediana}`, undefined, ANA.token)).datos.canchas;
    c.verifica(min.length > 0 && min.every((k) => k.costoHora >= mediana), `precioMin=${mediana}: ${min.length} resultado(s), todos con costo ≥ ${mediana}`);
    const max = (await api('GET', `/canchas?precioMax=${mediana}`, undefined, ANA.token)).datos.canchas;
    c.verifica(max.length > 0 && max.every((k) => k.costoHora <= mediana), `precioMax=${mediana}: ${max.length} resultado(s), todos con costo ≤ ${mediana}`);
    const rango = (await api('GET', `/canchas?precioMin=${precios[0]}&precioMax=${precios[0]}`, undefined, ANA.token)).datos.canchas;
    c.verifica(rango.length >= 1 && rango.every((k) => k.costoHora === precios[0]), `Rango exacto ${precios[0]}–${precios[0]}: ${rango.length} resultado(s)`);
    const nada = await api('GET', '/canchas?zona=ZonaQueNoExiste', undefined, ANA.token);
    c.verifica(nada.status === 200 && nada.datos.canchas.length === 0, 'Zona inexistente: 200 con lista vacía', `HTTP ${nada.status}, ${nada.datos.canchas?.length} resultados`);
  }
);

await S.caso(
  { ...base, id: 'F-06-02', hu: 'US-06', ca: [4], grupo: 'US-06', titulo: 'Valores de filtro inválidos (casos de error)', objetivo: 'Verificar que los filtros mal formados se rechazan con 400.', pasos: ['precioMin=-5.', 'precioMax=abc.', 'fecha=31-12-2026 (formato incorrecto).', 'zona vacía.'], esperado: 'Cada petición responde 400 con el campo y el motivo.' },
  async (c) => {
    for (const [q, campo] of [['precioMin=-5', 'precioMin'], ['precioMax=abc', 'precioMax'], ['fecha=31-12-2026', 'fecha'], ['zona=%20', 'zona']]) {
      const r = await api('GET', `/canchas?${q}`, undefined, ANA.token);
      c.verifica(r.status === 400 && r.datos.errores?.some((e) => e.campo === campo), `${q} → 400 con error en "${campo}"`, `HTTP ${r.status}`);
    }
  }
);

await S.caso(
  { ...base, id: 'F-06-03', hu: 'US-06', hus: ['US-06', 'US-07'], ca: { 'US-06': [1], 'US-07': [3] }, grupo: 'US-06', titulo: 'Filtro por fecha: solo canchas con horario ese día', objetivo: 'Verificar que filtrar por fecha considera el horario de atención del día de la semana.', pasos: ['Quitar el horario de un día en una cancha (en la base de pruebas).', 'Filtrar por una fecha que cae en ese día de la semana.', 'Restaurar el horario.'], esperado: 'La cancha sin horario ese día no aparece; las demás sí.' },
  async (c) => {
    const fecha = '2102-04-14';
    const dia = new Date(`${fecha}T00:00:00`).getDay();
    const antes = (await api('GET', `/canchas?fecha=${fecha}`, undefined, ANA.token)).datos.canchas.map((k) => k.id);
    c.verifica(antes.length === 5, 'Con horario completo aparecen las 5 canchas', `${antes.length} canchas`);
    const respaldo = sqlq(`SELECT hora_inicio||'|'||hora_fin FROM horarios_disponibles WHERE cancha_id='${K0.id}' AND dia_semana=${dia}`);
    sqlq(`DELETE FROM horarios_disponibles WHERE cancha_id='${K0.id}' AND dia_semana=${dia}`);
    const durante = (await api('GET', `/canchas?fecha=${fecha}`, undefined, ANA.token)).datos.canchas.map((k) => k.id);
    const det = await api('GET', `/canchas/${K0.id}`, undefined, ANA.token);
    const [hi, hf] = respaldo.split('|');
    sqlq(`INSERT INTO horarios_disponibles (cancha_id, dia_semana, hora_inicio, hora_fin) VALUES ('${K0.id}', ${dia}, '${hi}', '${hf}')`);
    c.verifica(!durante.includes(K0.id) && durante.length === 4, 'Sin horario ese día, la cancha no se lista; las otras 4 sí', `${durante.length} canchas`);
    c.verifica(!det.datos.cancha.horarios.some((h) => h.diaSemana === dia), 'El detalle tampoco ofrece horario ese día (no hay bloques que reservar)');
    const despues = (await api('GET', `/canchas?fecha=${fecha}`, undefined, ANA.token)).datos.canchas.length;
    c.verifica(despues === 5, 'Tras restaurar el horario vuelven las 5 canchas', `${despues} canchas`);
  }
);

// =====================================================================
// US-08 Validación de disponibilidad
// =====================================================================
await S.caso(
  { ...base, id: 'F-08-01', hu: 'US-08', ca: [1], grupo: 'US-08', titulo: 'Consulta de disponibilidad por cancha y fecha', objetivo: 'Verificar que GET /api/canchas/{id}/disponibilidad devuelve las franjas ocupadas de la fecha.', pasos: ['Consultar la disponibilidad de una fecha sin reservas.', 'Crear una reserva 10:00–11:00.', 'Consultar de nuevo.', 'Consultar otra fecha.'], esperado: 'Antes: lista vacía. Después: la franja 10:00–11:00 aparece como ocupada. Otra fecha: sigue vacía.' },
  async (c) => {
    const f = franja(10);
    const antes = await disponibilidad(ANA, K0, f.fecha);
    c.verifica(antes.status === 200 && antes.datos.ocupados.length === 0, 'Fecha sin reservas: 200 y lista de ocupados vacía', `HTTP ${antes.status}`);
    await reservar(ANA, K0, f);
    const despues = await disponibilidad(BETO, K0, f.fecha);
    c.verifica(despues.datos.ocupados.length === 1 && despues.datos.ocupados[0].horaInicio.startsWith('10:00') && despues.datos.ocupados[0].horaFin.startsWith('11:00'), 'Otro usuario ve la franja 10:00–11:00 como ocupada', JSON.stringify(despues.datos.ocupados));
    const otra = await disponibilidad(ANA, K0, fechaUnica());
    c.verifica(otra.datos.ocupados.length === 0, 'Otra fecha sigue libre');
    const otraCancha = await disponibilidad(ANA, K1, f.fecha);
    c.verifica(otraCancha.datos.ocupados.length === 0, 'La misma fecha en otra cancha sigue libre');
  }
);

await S.caso(
  { ...base, id: 'F-08-02', hu: 'US-08', ca: [4], grupo: 'US-08', titulo: 'Reservar una franja ya ocupada: 409 con mensaje exacto (caso de error)', objetivo: 'Verificar el rechazo cuando la franja se ocupó entre la selección y la confirmación.', pasos: ['El usuario A reserva una franja.', 'El usuario B intenta reservar la misma franja.'], esperado: '409 Conflict con el mensaje "El horario ya no está disponible"; no se crea una segunda reserva.' },
  async (c) => {
    const f = franja(11);
    const a = await reservar(ANA, K0, f);
    const b = await reservar(BETO, K0, f);
    c.verifica(a.status === 201, 'A obtiene 201', `HTTP ${a.status}`);
    c.verifica(b.status === 409, 'B recibe 409 Conflict', `HTTP ${b.status}`);
    c.verifica(b.datos.mensaje === 'El horario ya no está disponible', 'El mensaje es exactamente "El horario ya no está disponible"', b.datos.mensaje);
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE cancha_id='${K0.id}' AND fecha='${f.fecha}'`) === '1', 'En la base hay una sola reserva para la franja');
  }
);

await S.caso(
  { ...base, id: 'F-08-03', hu: 'US-08', hus: ['US-08', 'US-09'], ca: { 'US-08': [5], 'US-09': [4] }, grupo: 'US-08', titulo: 'Cancelar una reserva libera la franja', objetivo: 'Verificar que la franja vuelve a estar disponible y que se puede reservar sin violar la restricción única.', pasos: ['A reserva una franja.', 'A cancela la reserva (PATCH /api/reservas/:id/cancelar).', 'Consultar la disponibilidad.', 'B reserva la misma franja.'], esperado: 'Cancelar responde 200 con estado "cancelada"; la franja deja de aparecer ocupada; B obtiene 201; en la base quedan 1 cancelada y 1 confirmada.' },
  async (c) => {
    const f = franja(12);
    const a = await reservar(ANA, K0, f);
    const id = a.datos.reserva.id;
    const cancel = await api('PATCH', `/reservas/${id}/cancelar`, undefined, ANA.token);
    c.verifica(cancel.status === 200 && cancel.datos.reserva.estado === 'cancelada', 'Cancelar responde 200 con estado "cancelada"', `HTTP ${cancel.status}`);
    const disp = await disponibilidad(BETO, K0, f.fecha);
    c.verifica(disp.datos.ocupados.length === 0, 'La franja vuelve a aparecer disponible');
    const b = await reservar(BETO, K0, f);
    c.verifica(b.status === 201, 'B puede reservar la misma franja (201)', `HTTP ${b.status}`);
    c.verifica(sqlq(`SELECT string_agg(estado, ',' ORDER BY estado) FROM reservas WHERE cancha_id='${K0.id}' AND fecha='${f.fecha}'`) === 'cancelada,confirmada', 'La base conserva la cancelada y la nueva confirmada (sin violar el índice único)');
  }
);

await S.caso(
  { ...base, id: 'F-08-04', hu: 'US-08', ca: [6], grupo: 'US-08', titulo: 'No se aceptan fechas ni horas pasadas (caso de error)', objetivo: 'Verificar que el backend rechaza reservas en el pasado, aunque el frontend ya lo impida.', pasos: ['Reservar con una fecha de ayer.', 'Reservar hoy a las 00:00 (hora ya pasada).', 'Reservar con una fecha muy antigua.'], esperado: 'Las tres peticiones responden 400 con "No se pueden reservar fechas u horas pasadas".' },
  async (c) => {
    for (const [nombre, f] of [['Fecha de ayer', { fecha: fechaCO(-1), horaInicio: '23:00', horaFin: '23:59' }], ['Hoy a las 00:00', { fecha: fechaCO(0), horaInicio: '00:00', horaFin: '01:00' }], ['Fecha de 2020', { fecha: '2020-01-01', horaInicio: '10:00', horaFin: '11:00' }]]) {
      const r = await reservar(ANA, K0, f);
      c.verifica(r.status === 400 && /fechas u horas pasadas/.test(r.datos.mensaje), `${nombre}: 400 "No se pueden reservar fechas u horas pasadas"`, `HTTP ${r.status}`);
    }
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE fecha < current_date`) === '0', 'No se guardó ninguna reserva en el pasado');
  }
);

await S.caso(
  { ...base, id: 'F-08-05', hu: 'US-08', hus: ['US-08', 'US-11'], ca: { 'US-08': [7], 'US-11': [9] }, grupo: 'US-08', titulo: 'Solo usuarios autenticados: sin token o token inválido → 401', objetivo: 'Verificar la autenticación en todos los endpoints del motor de reservas, incluidos tokens vencidos y firmados con otro secreto.', pasos: ['Llamar a disponibilidad, crear reserva, historial, cancelar y completar panel sin token.', 'Repetir con un token vencido.', 'Repetir con un token firmado con otro secreto.', 'Repetir con un token "alg: none".'], esperado: '401 en todos los casos.' },
  async (c) => {
    const f = franja(9);
    const vencido = jwt.sign({ sub: ANA.id }, CFG.jwtSecret, { expiresIn: -60 });
    const otroSecreto = jwt.sign({ sub: ANA.id }, 'otro-secreto-cualquiera');
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const sinFirma = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: ANA.id })}.`;
    const endpoints = [
      ['GET', `/canchas/${K0.id}/disponibilidad?fecha=${f.fecha}`],
      ['POST', `/canchas/${K0.id}/reservas`, f],
      ['GET', '/reservas/mias'],
      ['PATCH', `/reservas/${UUID_INEXISTENTE}/cancelar`],
      ['POST', `/canchas/${K0.id}/temporizador/completar`, f],
    ];
    for (const [nombre, token] of [['sin token', undefined], ['token vencido', vencido], ['firmado con otro secreto', otroSecreto], ['alg:none', sinFirma]]) {
      const codigos = [];
      for (const [m, ruta, cuerpo] of endpoints) codigos.push((await api(m, ruta, cuerpo, token)).status);
      c.verifica(codigos.every((x) => x === 401), `${nombre}: los 5 endpoints responden 401`, codigos.join(', '));
    }
  }
);

await S.caso(
  { ...base, id: 'F-08-06', hu: 'US-08', ca: [8], grupo: 'US-08', titulo: 'Validación en el backend de los datos de la reserva (casos de error)', objetivo: 'Verificar que el backend valida todo por sí mismo, sin depender del frontend.', pasos: ['horaFin igual a horaInicio y horaFin anterior.', 'Formato de hora inválido ("25:00", "9:00").', 'Fecha con formato inválido.', 'Cuerpo vacío.', 'Cancha con id mal formado y cancha inexistente.'], esperado: '400 con el detalle del campo en cada caso de datos; 404 "Cancha no encontrada" para el UUID inexistente.' },
  async (c) => {
    const f = franja(14);
    const casos = [
      ['horaFin = horaInicio', { ...f, horaFin: f.horaInicio }, 'horaFin debe ser posterior'],
      ['horaFin < horaInicio', { ...f, horaInicio: '15:00', horaFin: '14:00' }, 'horaFin debe ser posterior'],
      ['hora 25:00', { ...f, horaInicio: '25:00' }, 'horaInicio'],
      ['hora sin cero inicial', { ...f, horaInicio: '9:00' }, 'horaInicio'],
      ['fecha inválida', { ...f, fecha: 'mañana' }, 'fecha'],
      ['cuerpo vacío', {}, 'obligatoria'],
    ];
    for (const [nombre, cuerpo, texto] of casos) {
      const r = await reservar(ANA, K0, cuerpo);
      const detalle = `${r.datos.mensaje ?? ''} ${JSON.stringify(r.datos.errores ?? '')}`;
      c.verifica(r.status === 400 && detalle.includes(texto), `${nombre}: 400`, `HTTP ${r.status}`);
    }
    const mal = await api('POST', '/canchas/xyz/reservas', f, ANA.token);
    c.verifica(mal.status === 400, 'Id de cancha mal formado: 400', `HTTP ${mal.status}`);
    const inex = await api('POST', `/canchas/${UUID_INEXISTENTE}/reservas`, f, ANA.token);
    c.verifica(inex.status === 404 && inex.datos.mensaje === 'Cancha no encontrada', 'Cancha inexistente: 404 "Cancha no encontrada"', `HTTP ${inex.status}`);
    const sinFecha = await api('GET', `/canchas/${K0.id}/disponibilidad`, undefined, ANA.token);
    c.verifica(sinFecha.status === 400, 'Disponibilidad sin fecha: 400', `HTTP ${sinFecha.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-08-07', hu: 'US-08', ca: [8], grupo: 'US-08', titulo: 'Reserva fuera del horario de atención de la cancha', objetivo: 'Verificar que el backend rechaza reservas en horas en las que la cancha no atiende (no solo el frontend, que solo ofrece bloques dentro del horario).', datos: 'Reserva solicitada: 03:00–04:00, fuera del horario registrado de la cancha (07:00–20:00).', pasos: ['Consultar el horario de la cancha.', 'Enviar una reserva a las 03:00–04:00 directamente a la API.'], esperado: 'El backend debe rechazarla (400 o 409) porque la cancha no atiende a esa hora.' },
  async (c) => {
    const det = (await api('GET', `/canchas/${K0.id}`, undefined, ANA.token)).datos.cancha;
    c.nota(`Horario registrado: ${det.horarios[0].horaInicio.slice(0, 5)}–${det.horarios[0].horaFin.slice(0, 5)}`);
    const f = { fecha: fechaUnica(), horaInicio: '03:00', horaFin: '04:00' };
    const r = await reservar(ANA, K0, f);
    c.verifica([400, 409].includes(r.status), 'La reserva fuera de horario se rechaza (400/409)', `HTTP ${r.status}${r.status === 201 ? ' — la API la aceptó y la guardó' : ''}`);
    c.verifica(r.datos.codigo === 'FUERA_DE_HORARIO', 'El error trae el código FUERA_DE_HORARIO y un mensaje claro', `${r.datos.codigo} — ${r.datos.mensaje}`);
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE cancha_id='${K0.id}' AND fecha='${f.fecha}'`) === '0', 'No se guardó ninguna reserva');
  }
);

await S.caso(
  { ...base, id: 'F-08-08', hu: 'US-09', hus: ['US-08', 'US-09'], ca: { 'US-08': [8], 'US-09': [1, 2] }, grupo: 'US-08', titulo: 'Franjas solapadas en la misma cancha', objetivo: 'Verificar que no se puede reservar una franja que se traslapa con otra ya confirmada (p. ej. 10:30–11:30 sobre 10:00–11:00, o un bloque de 2 horas), ni por la API ni directamente en la base de datos.', datos: 'Reserva existente 10:00–11:00; intentos 10:30–11:30 y 10:00–12:00; INSERT directo en SQL de 10:30–11:30.', pasos: ['Reservar 10:00–11:00.', 'Intentar reservar 10:30–11:30.', 'Intentar reservar 10:00–12:00.', 'Intentar insertar directamente en la base una reserva confirmada 10:30–11:30.'], esperado: 'Los dos intentos por la API se rechazan (400 o 409); el INSERT directo falla por la restricción de exclusión (ex_reservas_sin_solape); queda una sola reserva.' },
  async (c) => {
    const fecha = fechaUnica();
    const a = await reservar(ANA, K0, { fecha, horaInicio: '10:00', horaFin: '11:00' });
    c.verifica(a.status === 201, 'Reserva base 10:00–11:00 creada', `HTTP ${a.status}`);
    const b = await reservar(BETO, K0, { fecha, horaInicio: '10:30', horaFin: '11:30' });
    c.verifica([400, 409].includes(b.status), '10:30–11:30 (solapada) se rechaza', `HTTP ${b.status} — ${b.datos.codigo ?? ''} ${b.datos.mensaje ?? ''}`);
    const d = await reservar(CARLA, K0, { fecha, horaInicio: '10:00', horaFin: '12:00' });
    c.verifica([400, 409].includes(d.status), '10:00–12:00 (bloque de 2 horas que contiene a la reserva) se rechaza', `HTTP ${d.status} — ${d.datos.codigo ?? ''}`);
    let error = '';
    try { sqlq(`INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin, estado) VALUES ('${K0.id}','${BETO.id}','${fecha}','10:30','11:30','confirmada')`); } catch (e) { error = e.message; }
    c.verifica(/ex_reservas_sin_solape/.test(error), 'La base de datos rechaza el solape aunque se inserte directamente (restricción de exclusión)', error.split('\n')[0].replace('psql falló: ', '').slice(0, 140));
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE cancha_id='${K0.id}' AND fecha='${fecha}' AND estado='confirmada'`) === '1', 'Queda una sola reserva confirmada para esa cancha y fecha');
  }
);

await S.caso(
  { ...base, id: 'F-08-09', hu: 'US-08', ca: [5], grupo: 'US-08', titulo: 'Cancelación: reserva ajena, inexistente y ya cancelada (casos de error)', objetivo: 'Verificar las reglas de autorización y estado al cancelar.', pasos: ['B intenta cancelar la reserva de A.', 'Cancelar un id inexistente.', 'Cancelar con un id mal formado.', 'A cancela su reserva dos veces.'], esperado: '403 al cancelar una reserva ajena; 404 si no existe; 400 con id mal formado; 409 al cancelar una ya cancelada.' },
  async (c) => {
    const f = franja(13);
    const a = await reservar(ANA, K0, f);
    const id = a.datos.reserva.id;
    const ajena = await api('PATCH', `/reservas/${id}/cancelar`, undefined, BETO.token);
    c.verifica(ajena.status === 403, 'Cancelar una reserva ajena: 403', `HTTP ${ajena.status} — ${ajena.datos.mensaje}`);
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE id='${id}'`) === 'confirmada', 'La reserva ajena sigue confirmada');
    const inex = await api('PATCH', `/reservas/${UUID_INEXISTENTE}/cancelar`, undefined, ANA.token);
    c.verifica(inex.status === 404, 'Reserva inexistente: 404', `HTTP ${inex.status}`);
    const mal = await api('PATCH', '/reservas/abc/cancelar', undefined, ANA.token);
    c.verifica(mal.status === 400, 'Id mal formado: 400', `HTTP ${mal.status}`);
    const ok = await api('PATCH', `/reservas/${id}/cancelar`, undefined, ANA.token);
    const otra = await api('PATCH', `/reservas/${id}/cancelar`, undefined, ANA.token);
    c.verifica(ok.status === 200, 'La primera cancelación del dueño: 200', `HTTP ${ok.status}`);
    c.verifica(otra.status === 409, 'Cancelar de nuevo: 409 "ya estaba cancelada"', `HTTP ${otra.status} — ${otra.datos.mensaje}`);
  }
);

// =====================================================================
// US-09 Bloqueo de reserva duplicada
// =====================================================================
await S.caso(
  { ...base, id: 'F-09-01', hu: 'US-09', ca: [1], grupo: 'US-09', nivel: 'Base de datos', titulo: 'Restricción única parcial en la base de datos', objetivo: 'Verificar que el bloqueo existe en PostgreSQL y no depende solo del código de la aplicación.', pasos: ['Crear una reserva por la API.', 'Insertar directamente en la base (SQL) una segunda reserva confirmada para la misma cancha/fecha/hora.', 'Insertar directamente una reserva en estado "cancelada" para la misma franja.'], esperado: 'El INSERT confirmado falla con "unique constraint uq_reservas_confirmada_cancha_fecha_hora"; el INSERT cancelado sí se permite (índice parcial).' },
  async (c) => {
    const f = franja(15);
    await reservar(ANA, K0, f);
    const ins = (estado) => `INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin, estado) VALUES ('${K0.id}','${BETO.id}','${f.fecha}','${f.horaInicio}','${f.horaFin}','${estado}')`;
    let error = '';
    try { sqlq(ins('confirmada')); } catch (e) { error = e.message; }
    c.verifica(/uq_reservas_confirmada_cancha_fecha_hora/.test(error), 'El INSERT duplicado confirmado lo rechaza la base de datos', error.split('\n')[0].replace('psql falló: ', '').slice(0, 150));
    let permitido = true;
    try { sqlq(ins('cancelada')); } catch { permitido = false; }
    c.verifica(permitido, 'Un INSERT en estado "cancelada" sí se permite (el índice es parcial)');
    c.evidenciaTexto('Definición del índice', sqlq("SELECT indexdef FROM pg_indexes WHERE indexname='uq_reservas_confirmada_cancha_fecha_hora'"));
  }
);

await S.caso(
  { ...base, id: 'F-09-02', hu: 'US-09', ca: [2, 5], grupo: 'US-09', titulo: 'Dos usuarios reservan la misma franja al mismo tiempo', objetivo: 'Verificar con dos peticiones realmente simultáneas que solo se crea una reserva y la otra recibe un mensaje claro.', pasos: ['Enviar dos POST /reservas en paralelo (Promise.all) de usuarios distintos para la misma franja.', 'Revisar los códigos y mensajes.', 'Contar las filas en la base.'], esperado: 'Un 201 y un 409 con "El horario ya no está disponible", sin textos técnicos; una sola fila en la base. Se repite 5 veces con franjas distintas.' },
  async (c) => {
    let resultados = [];
    for (let i = 0; i < 5; i += 1) {
      const f = franja(8 + i);
      const [a, b] = await Promise.all([reservar(ANA, K1, f), reservar(BETO, K1, f)]);
      const filas = sqlq(`SELECT count(*) FROM reservas WHERE cancha_id='${K1.id}' AND fecha='${f.fecha}' AND hora_inicio='${f.horaInicio}'`);
      resultados.push({ estados: [a.status, b.status].sort((x, y) => x - y).join('/'), filas, perdedor: [a, b].find((x) => x.status === 409) });
    }
    c.verifica(resultados.every((r) => r.estados === '201/409'), 'Las 5 repeticiones dan exactamente un 201 y un 409', resultados.map((r) => r.estados).join(' · '));
    c.verifica(resultados.every((r) => r.filas === '1'), 'En cada repetición hay una sola fila en la base', resultados.map((r) => r.filas).join(' · '));
    c.verifica(resultados.every((r) => r.perdedor.datos.mensaje === 'El horario ya no está disponible'), 'El rechazado recibe el mensaje claro "El horario ya no está disponible"');
    const crudo = JSON.stringify(resultados[0].perdedor.datos);
    c.verifica(!/duplicate|constraint|23505|SQL|stack/i.test(crudo), 'El mensaje no contiene errores técnicos de la base', crudo);
  }
);

await S.caso(
  { ...base, id: 'F-09-03', hu: 'US-09', hus: ['US-09', 'US-11'], ca: { 'US-09': [3], 'US-11': [5] }, grupo: 'US-09', titulo: 'Reenvío / doble clic del mismo usuario', objetivo: 'Verificar que un mismo usuario no puede reservar dos veces la misma franja, ni en paralelo ni en secuencia.', pasos: ['El mismo usuario envía 2 POST idénticos en paralelo.', 'Luego un tercero en secuencia.'], esperado: 'Una sola reserva creada (201); los demás envíos responden 409; una sola fila en la base.' },
  async (c) => {
    const f = franja(16);
    const [a, b] = await Promise.all([reservar(CARLA, K1, f), reservar(CARLA, K1, f)]);
    const c3 = await reservar(CARLA, K1, f);
    const estados = [a.status, b.status].sort((x, y) => x - y);
    c.verifica(estados[0] === 201 && estados[1] === 409, 'Dos envíos en paralelo: un 201 y un 409', estados.join('/'));
    c.verifica(c3.status === 409, 'Un tercer envío posterior: 409', `HTTP ${c3.status}`);
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE cancha_id='${K1.id}' AND fecha='${f.fecha}' AND hora_inicio='${f.horaInicio}'`) === '1', 'Una sola reserva en la base');
  }
);

await S.caso(
  { ...base, id: 'F-09-04', hu: 'US-09', ca: [2, 6], grupo: 'US-09', nivel: 'API REST (concurrencia)', titulo: '25 usuarios compiten por la misma franja', objetivo: 'Verificar que la restricción resiste una competencia amplia: solo una reserva y sin registros huérfanos.', datos: '25 usuarios nuevos; misma cancha, fecha y hora.', pasos: ['Crear 25 usuarios.', 'Enviar las 25 reservas a la vez.', 'Contar respuestas y filas en la base.'], esperado: 'Exactamente 1 respuesta 201 y 24 respuestas 409; 1 sola fila para la franja y ninguna fila parcial.' },
  async (c) => {
    const usuarios = await Promise.all(Array.from({ length: 25 }, (_, i) => crearUsuario(`mass${i}`)));
    const f = franja(17);
    const respuestas = await Promise.all(usuarios.map((u) => reservar(u, K1, f)));
    const creadas = respuestas.filter((r) => r.status === 201).length;
    const conflictos = respuestas.filter((r) => r.status === 409).length;
    c.verifica(creadas === 1, '1 petición creó la reserva (201)', `${creadas}`);
    c.verifica(conflictos === 24, '24 peticiones recibieron 409', `${conflictos}`);
    c.verifica(respuestas.length === creadas + conflictos, 'Ninguna petición terminó en error 5xx ni sin respuesta', `${respuestas.map((r) => r.status).filter((s) => s >= 500).length} errores 5xx`);
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE cancha_id='${K1.id}' AND fecha='${f.fecha}' AND hora_inicio='${f.horaInicio}'`) === '1', 'Una sola fila en la base para la franja');
    c.verifica(sqlq("SELECT count(*) FROM reservas r LEFT JOIN usuarios u ON u.id=r.usuario_id WHERE u.id IS NULL") === '0', 'No hay reservas huérfanas (todas tienen usuario)');
  }
);

await S.caso(
  { ...base, id: 'F-09-05', hu: 'US-09', ca: [6], grupo: 'US-09', titulo: 'Un intento duplicado no deja registros parciales', objetivo: 'Verificar la atomicidad de la creación: tras un rechazo, la base queda igual que antes.', pasos: ['Contar las filas de reservas.', 'Reservar una franja y repetirla 5 veces con usuarios distintos.', 'Contar de nuevo.'], esperado: 'El total de filas crece solo en 1 (la reserva ganadora).' },
  async (c) => {
    const f = franja(18);
    const antes = Number(sqlq('SELECT count(*) FROM reservas'));
    await reservar(ANA, K1, f);
    for (const u of [BETO, CARLA, BETO, CARLA, BETO]) await reservar(u, K1, f);
    const despues = Number(sqlq('SELECT count(*) FROM reservas'));
    c.verifica(despues - antes === 1, 'El total de filas aumentó exactamente en 1', `${antes} → ${despues}`);
    c.verifica(sqlq("SELECT count(*) FROM reservas WHERE estado NOT IN ('confirmada','cancelada')") === '0', 'Ninguna fila quedó en un estado intermedio');
  }
);

// =====================================================================
// US-10 / US-11
// =====================================================================
await S.caso(
  { ...base, id: 'F-10-01', hu: 'US-10', ca: [3], grupo: 'US-10', titulo: 'Los datos del usuario se toman de la sesión', objetivo: 'Verificar que la reserva no pide nombre ni correo y que no se puede reservar a nombre de otro usuario.', pasos: ['Reservar enviando solo cancha, fecha y hora.', 'Reservar enviando además un usuarioId ajeno en el cuerpo.'], esperado: 'La reserva queda asociada al usuario del token; el usuarioId del cuerpo se ignora.' },
  async (c) => {
    const f = franja(9);
    const r = await reservar(ANA, K2, f);
    c.verifica(r.status === 201 && r.datos.reserva.usuarioId === ANA.id, 'Se crea con solo cancha, fecha y hora, asociada al usuario del token', `HTTP ${r.status}`);
    const f2 = franja(9);
    const r2 = await reservar(ANA, K2, { ...f2, usuarioId: BETO.id, nombre: 'Falso', correo: 'falso@x.com' });
    c.verifica(r2.status === 201 && r2.datos.reserva.usuarioId === ANA.id, 'Un usuarioId enviado en el cuerpo se ignora: la reserva es de quien tiene el token', `dueño ${r2.datos.reserva.usuarioId === ANA.id ? 'ANA (correcto)' : 'otro usuario'}`);
    c.verifica(sqlq(`SELECT usuario_id FROM reservas WHERE id='${r2.datos.reserva.id}'`) === ANA.id, 'Confirmado en la base de datos');
  }
);

await S.caso(
  { ...base, id: 'F-11-01', hu: 'US-11', ca: [1], grupo: 'US-11', titulo: 'Confirmar: 201 con identificador, cancha, fecha, hora y estado', objetivo: 'Verificar el contrato de la respuesta de confirmación.', pasos: ['POST /api/canchas/:id/reservas con datos válidos.', 'Revisar el cuerpo.', 'Consultar el estado guardado en la base.'], esperado: '201 con reserva {id, codigo CY-XXXXXXXX, cancha{id,nombre,direccion}, fecha, horaInicio, horaFin, estado "confirmada"}; en la base estado = confirmada.' },
  async (c) => {
    const f = franja(10);
    const r = await reservar(ANA, K2, f);
    const rv = r.datos.reserva;
    c.verifica(r.status === 201, 'Responde 201 Created', `HTTP ${r.status}`);
    c.verifica(/^[0-9a-f-]{36}$/.test(rv.id) && /^CY-[0-9A-F]{8}$/.test(rv.codigo), 'Incluye identificador (UUID) y código legible CY-XXXXXXXX', `${rv.id.slice(0, 8)}… / ${rv.codigo}`);
    c.verifica(rv.cancha?.id === K2.id && rv.cancha.nombre === K2.nombre && rv.cancha.direccion, 'Incluye la cancha (id, nombre y dirección)', rv.cancha?.nombre);
    c.verifica(rv.fecha === f.fecha && rv.horaInicio === '10:00:00' && rv.horaFin === '11:00:00', 'Incluye fecha y hora', `${rv.fecha} ${rv.horaInicio}–${rv.horaFin}`);
    c.verifica(rv.estado === 'confirmada', 'Estado "confirmada"', rv.estado);
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE id='${rv.id}'`) === 'confirmada', 'En la base de datos el estado guardado es "confirmada"');
  }
);

await S.caso(
  { ...base, id: 'F-11-02', hu: 'US-11', ca: [3], grupo: 'US-11', titulo: 'Si falla la reserva no se informa éxito (casos de error)', objetivo: 'Verificar que cada fallo responde con un error claro y sin el objeto "reserva" que el frontend interpretaría como éxito.', pasos: ['Provocar un 409 (franja ocupada), un 400 (hora pasada), un 404 (cancha inexistente) y un 401.', 'Revisar el cuerpo de cada respuesta.'], esperado: 'Ninguna respuesta de error incluye "reserva"; todas traen "mensaje" claro sin detalles técnicos.' },
  async (c) => {
    const f = franja(11);
    await reservar(ANA, K2, f);
    const casos = [
      ['409 franja ocupada', await reservar(BETO, K2, f), 409],
      ['400 hora pasada', await reservar(ANA, K2, { fecha: '2020-01-01', horaInicio: '10:00', horaFin: '11:00' }), 400],
      ['404 cancha inexistente', await api('POST', `/canchas/${UUID_INEXISTENTE}/reservas`, f, ANA.token), 404],
      ['401 sin token', await api('POST', `/canchas/${K2.id}/reservas`, f), 401],
    ];
    for (const [nombre, r, esperado] of casos) {
      c.verifica(r.status === esperado && !('reserva' in r.datos) && typeof r.datos.mensaje === 'string' && !/stack|SQL|constraint/i.test(r.datos.mensaje), `${nombre}: ${r.status}, sin "reserva" y con mensaje claro`, r.datos.mensaje);
    }
  }
);

await S.caso(
  { ...base, id: 'F-11-03', hu: 'US-11', ca: [4], grupo: 'US-11', nivel: 'API REST (rendimiento)', titulo: 'Tiempo de respuesta de la confirmación (< 2 s)', objetivo: 'Medir el tiempo que tarda el backend en confirmar una reserva en condiciones normales.', pasos: ['Crear 15 reservas en secuencia, midiendo cada respuesta.', 'Calcular promedio, mediana, p95 y máximo.'], esperado: 'Todas las confirmaciones responden en menos de 2000 ms (objetivo del criterio); p95 por debajo de 1000 ms.' },
  async (c) => {
    const tiempos = [];
    const u = await crearUsuario('perf');
    for (let i = 0; i < 15; i += 1) {
      const r = await reservar(u, K2, { fecha: fechaUnica(), horaInicio: '12:00', horaFin: '13:00' });
      tiempos.push(r.ms);
      if (r.status !== 201) throw new Error(`Reserva ${i + 1}: HTTP ${r.status}`);
    }
    tiempos.sort((a, b) => a - b);
    const prom = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
    const p95 = tiempos[Math.ceil(tiempos.length * 0.95) - 1];
    c.verifica(tiempos[tiempos.length - 1] < 2000, 'El máximo es menor a 2000 ms', t(tiempos[tiempos.length - 1]));
    c.verifica(p95 < 1000, 'El p95 es menor a 1000 ms', t(p95));
    c.nota(`15 confirmaciones · promedio ${t(prom)} · mediana ${t(tiempos[7])} · mínimo ${t(tiempos[0])} · máximo ${t(tiempos.at(-1))}`);
  }
);

await S.caso(
  { ...base, id: 'F-11-04', hu: 'US-11', ca: [6], grupo: 'US-11', titulo: 'La reserva aparece de inmediato en el historial con estado "confirmada"', objetivo: 'Verificar GET /api/reservas/mias justo después de confirmar, y que cada usuario solo ve las suyas.', pasos: ['A crea dos reservas en fechas distintas.', 'GET /api/reservas/mias de A inmediatamente.', 'GET /api/reservas/mias de B (sin reservas).', 'A cancela una y consulta de nuevo.'], esperado: 'A ve ambas, ordenadas de la más reciente a la más antigua, con código, cancha, fecha, hora y estado; B ve lista vacía; la cancelada aparece como "cancelada".' },
  async (c) => {
    const u = await crearUsuario('hist');
    const otro = await crearUsuario('hist2');
    const f1 = { fecha: '2100-02-01', horaInicio: '10:00', horaFin: '11:00' };
    const f2 = { fecha: '2100-03-01', horaInicio: '15:00', horaFin: '16:00' };
    const r1 = await reservar(u, K0, f1);
    const r2 = await reservar(u, K0, f2);
    const mias = await api('GET', '/reservas/mias', undefined, u.token);
    c.verifica(mias.status === 200 && mias.datos.reservas.length === 2, 'El historial muestra las 2 reservas de inmediato', `${mias.datos.reservas?.length} reservas`);
    c.verifica(mias.datos.reservas[0].fecha === f2.fecha && mias.datos.reservas[1].fecha === f1.fecha, 'Orden: la más reciente primero');
    const x = mias.datos.reservas[0];
    c.verifica(x.estado === 'confirmada' && x.codigo === r2.datos.reserva.codigo && x.cancha.nombre === K0.nombre, 'Cada ítem trae código, cancha y estado "confirmada"', `${x.codigo} · ${x.cancha.nombre}`);
    const ajeno = await api('GET', '/reservas/mias', undefined, otro.token);
    c.verifica(ajeno.datos.reservas.length === 0, 'Otro usuario NO ve estas reservas (aislamiento entre usuarios)');
    await api('PATCH', `/reservas/${r1.datos.reserva.id}/cancelar`, undefined, u.token);
    const despues = await api('GET', '/reservas/mias', undefined, u.token);
    c.verifica(despues.datos.reservas.find((r) => r.id === r1.datos.reserva.id).estado === 'cancelada', 'La reserva cancelada aparece con estado "cancelada"');
  }
);

await S.caso(
  { ...base, id: 'F-11-05', hu: 'US-11', ca: [10], grupo: 'US-11', titulo: 'Correo de confirmación: se envía sin bloquear la reserva', objetivo: 'Verificar el envío del correo con el resumen (en modo desarrollo, sin SMTP) y que su fallo no impide confirmar.', datos: 'SMTP sin configurar en el entorno Docker: el servicio imprime el correo simulado en el log.', pasos: ['Confirmar una reserva.', 'Buscar en el log del backend el correo de confirmación.', 'Revisar que traiga el código, la cancha, la fecha y la hora.'], esperado: 'Aparece "[EMAIL] … Confirmación de reserva" con el mismo resumen. (El caso de fallo del correo se verifica con la prueba unitaria "si el correo falla, la reserva igual queda confirmada".)', notaQA: 'No se probó el envío contra un servidor SMTP real porque no hay credenciales configuradas; solo el modo simulado y la prueba unitaria del fallo.' },
  async (c) => {
    const u = await crearUsuario('mail');
    const f = franja(13);
    const r = await reservar(u, K2, f);
    await esperar(800);
    const linea = logsBackend('5m').split('\n').find((l) => l.includes('Confirmación de reserva') && l.includes(r.datos.reserva.codigo));
    c.verifica(r.status === 201, 'La reserva se confirmó (201)', `HTTP ${r.status}`);
    c.verifica(Boolean(linea), 'El log contiene el correo de confirmación de esa reserva', linea?.replace(/^\S+\s+\|\s*/, '').slice(0, 200));
    c.verifica(linea?.includes(u.correo) && linea.includes(K2.nombre) && linea.includes(f.fecha) && linea.includes('13:00'), 'El resumen incluye destinatario, cancha, fecha y hora');
    c.observacion('El envío real por SMTP no se ejecutó (sin credenciales); queda cubierto solo en modo simulado.');
  }
);

await S.caso(
  { ...base, id: 'F-11-06', hu: 'US-11', hus: ['US-11', 'US-17'], ca: { 'US-11': [7], 'US-17': [6] }, nivel: 'API REST + Socket.IO', grupo: 'US-11', titulo: 'Al confirmar, el temporizador se completa y deja de contar', objetivo: 'Verificar que confirmar la reserva detiene la sincronización del temporizador y marca la sesión como completada.', pasos: ['Conectar el socket del usuario (inicia el temporizador).', 'Confirmar la reserva por REST.', 'Esperar 7 s observando los eventos temporizador:sync.', 'Consultar la sesión en la base.'], esperado: 'Después de confirmar no llegan más eventos temporizador:sync y la sesión queda en estado "completado".' },
  async (c) => {
    const u = await crearUsuario('timerres');
    const s = await conectar(u.token, K2.id);
    c.verifica(s.ok, 'El socket se conecta y recibe temporizador:inicio');
    await esperar(5500);
    c.verifica(eventosDe(s, 'temporizador:sync').length >= 1, 'Mientras corre, llegan eventos temporizador:sync');
    const r = await reservar(u, K2, franja(14));
    const tConfirmar = Date.now();
    c.verifica(r.status === 201, 'La reserva se confirma', `HTTP ${r.status}`);
    await esperar(7000);
    const despues = eventosDe(s, 'temporizador:sync').filter((e) => e.t > tConfirmar + 300);
    c.verifica(despues.length === 0, 'No llega ningún temporizador:sync tras confirmar (7 s de observación)', `${despues.length} eventos`);
    c.verifica(sqlq(`SELECT estado FROM sesiones_reserva WHERE usuario_id='${u.id}' AND cancha_id='${K2.id}'`) === 'completado', 'La sesión quedó "completado" en la base');
    cerrar(s);
  }
);

// =====================================================================
// US-17 Temporizador por socket
// =====================================================================
await S.caso(
  { ...base, id: 'F-17-01', hu: 'US-17', ca: [1], nivel: 'Socket.IO', grupo: 'US-17', titulo: 'El servidor rechaza conexiones sin token válido (caso de error)', objetivo: 'Verificar la autenticación del socket.', pasos: ['Conectar sin token.', 'Conectar con un token inválido.', 'Conectar con un token vencido.', 'Conectar con un token de otro secreto.', 'Conectar con token válido.'], esperado: 'Las 4 primeras conexiones fallan con "No autenticado" o "Token inválido o expirado"; la última se acepta.' },
  async (c) => {
    const sin = await conectar(null, K0.id);
    c.verifica(!sin.ok && sin.error === 'No autenticado', 'Sin token: rechazado con "No autenticado"', sin.error);
    const mal = await conectar('basura', K0.id);
    c.verifica(!mal.ok && mal.error === 'Token inválido o expirado', 'Token inválido: rechazado con "Token inválido o expirado"', mal.error);
    const venc = await conectar(jwt.sign({ sub: ANA.id }, CFG.jwtSecret, { expiresIn: -60 }), K0.id);
    c.verifica(!venc.ok && venc.error === 'Token inválido o expirado', 'Token vencido: rechazado', venc.error);
    const otro = await conectar(jwt.sign({ sub: ANA.id }, 'otro-secreto'), K0.id);
    c.verifica(!otro.ok && otro.error === 'Token inválido o expirado', 'Token firmado con otro secreto: rechazado', otro.error);
    const ok = await conectar(ANA.token, K0.id);
    c.verifica(ok.ok, 'Con token válido: conexión aceptada');
    cerrar(sin, mal, venc, otro, ok);
  }
);

await S.caso(
  { ...base, id: 'F-17-02', hu: 'US-17', ca: [2], nivel: 'Socket.IO', grupo: 'US-17', titulo: 'Al conectar se inicia un temporizador de 180 s con expiresAt', objetivo: 'Verificar el evento de inicio y la duración de la sesión.', pasos: ['Conectar con token válido.', 'Leer temporizador:inicio.', 'Comparar expiresAt con la hora actual.', 'Sin canchaId, conectar de nuevo.'], esperado: 'temporizador:inicio con expiresAt ≈ ahora + 180 s y estado "activo". Sin canchaId: evento temporizador:error y desconexión.' },
  async (c) => {
    const u = await crearUsuario('t17');
    const t0 = Date.now();
    const s = await conectar(u.token, K0.id);
    const restante = (s.expiresAt - Date.now()) / 1000;
    c.verifica(s.ok && s.estado === 'activo', 'Recibe temporizador:inicio con estado "activo"');
    c.verifica(restante > 177 && restante <= 180.5, 'expiresAt corresponde a 180 s desde el inicio', `${restante.toFixed(1)} s restantes (${t(Date.now() - t0)} tras conectar)`);
    c.verifica(sqlq(`SELECT count(*) FROM sesiones_reserva WHERE usuario_id='${u.id}' AND cancha_id='${K0.id}' AND estado='activo'`) === '1', 'La sesión se guardó en la base (1 fila activa)');
    const sin = await conectar(u.token, null, { esperarInicio: false, timeout: 3000 });
    const err = await esperarEvento(sin, 'temporizador:error', () => true, 3000);
    c.verifica(err?.datos?.mensaje === 'Falta el id de la cancha', 'Sin canchaId: error "Falta el id de la cancha"', err?.datos?.mensaje);
    await esperar(300);
    c.verifica(sin.socket.disconnected, 'Sin canchaId: el servidor cierra la conexión');
    cerrar(s, sin);
  }
);

await S.caso(
  { ...base, id: 'F-17-03', hu: 'US-17', ca: [4], nivel: 'Socket.IO', grupo: 'US-17', titulo: 'Sincronización periódica cada 5 s', objetivo: 'Verificar que el servidor envía temporizador:sync con el mismo expiresAt cada 5 segundos.', pasos: ['Conectar y observar 17 s.', 'Medir el intervalo entre eventos temporizador:sync.'], esperado: 'Al menos 3 eventos separados por 5 s (±0,5 s), todos con el mismo expiresAt del inicio.' },
  async (c) => {
    const u = await crearUsuario('t17s');
    const s = await conectar(u.token, K0.id);
    await esperar(17000);
    const syncs = eventosDe(s, 'temporizador:sync');
    c.verifica(syncs.length >= 3, 'Llegan al menos 3 eventos en 17 s', `${syncs.length} eventos`);
    const gaps = syncs.slice(1).map((e, i) => (e.t - syncs[i].t) / 1000);
    c.verifica(gaps.every((g) => g > 4.5 && g < 5.5), 'El intervalo entre eventos es de 5 s', gaps.map((g) => g.toFixed(2)).join(', ') + ' s');
    c.verifica(syncs.every((e) => e.datos.expiresAt === s.expiresAt), 'Todos llevan el mismo expiresAt del servidor (sin desfases)');
    cerrar(s);
  }
);

await S.caso(
  { ...base, id: 'F-17-04', hu: 'US-17', ca: [5, 6], nivel: 'API REST + Socket.IO', grupo: 'US-17', titulo: 'Entrar al panel "Iniciar reserva" detiene el temporizador', objetivo: 'Verificar que, dentro del tiempo, completar el panel marca la sesión como completada y detiene la sincronización.', pasos: ['Conectar el socket.', 'POST /api/canchas/:id/temporizador/completar con la franja elegida.', 'Observar 7 s los eventos.', 'Repetir la llamada (reingreso al panel).'], esperado: '200 {estado:"completado"}; no llegan más temporizador:sync; la sesión queda "completado" en la base; el reingreso también responde 200.' },
  async (c) => {
    const u = await crearUsuario('t17c');
    const s = await conectar(u.token, K0.id);
    const f = franja(10);
    const r = await completar(u, K0, f);
    const t1 = Date.now();
    c.verifica(r.status === 200 && r.datos.estado === 'completado', 'Responde 200 con estado "completado"', `HTTP ${r.status} ${JSON.stringify(r.datos)}`);
    await esperar(7000);
    c.verifica(eventosDe(s, 'temporizador:sync').filter((e) => e.t > t1 + 300).length === 0, 'El temporizador deja de sincronizar (7 s sin eventos)');
    c.verifica(sqlq(`SELECT estado FROM sesiones_reserva WHERE usuario_id='${u.id}' AND cancha_id='${K0.id}'`) === 'completado', 'La sesión quedó "completado" en la base');
    const otra = await completar(u, K0, f);
    c.verifica(otra.status === 200, 'Reingresar al panel (Cambiar horario → Iniciar reserva) sigue respondiendo 200', `HTTP ${otra.status}`);
    cerrar(s);
  }
);

await S.caso(
  { ...base, id: 'F-17-05', hu: 'US-17', ca: [8], grupo: 'US-17', titulo: 'El backend rechaza el panel si no hay sesión vigente (caso de error)', objetivo: 'Verificar que la validación del tiempo ocurre en el servidor aunque el frontend no la haga.', pasos: ['Un usuario sin sesión de temporizador (nunca abrió el socket) llama a /temporizador/completar.'], esperado: '409 con "Tu tiempo para reservar expiró…" y código SESION_EXPIRADA.' },
  async (c) => {
    const u = await crearUsuario('t17n');
    const r = await completar(u, K0, franja(10));
    c.verifica(r.status === 409 && /expiró/.test(r.datos.mensaje), 'Responde 409 con el mensaje de sesión expirada', `HTTP ${r.status} — ${r.datos.mensaje}`);
    c.verifica(r.datos.codigo === 'SESION_EXPIRADA', 'Incluye el código SESION_EXPIRADA', r.datos.codigo);
  }
);

await S.caso(
  { ...base, id: 'F-17-07', hu: 'US-17', ca: [9], nivel: 'Socket.IO', grupo: 'US-17', titulo: 'Una sola sesión por usuario y cancha (varias pestañas)', objetivo: 'Verificar que abrir otra pestaña retoma el mismo expiresAt y que otra cancha tiene su propia sesión.', pasos: ['Abrir el socket del usuario en una cancha.', 'Esperar 3 s y abrir una segunda conexión del mismo usuario en la misma cancha.', 'Abrir una tercera en otra cancha.', 'Contar filas en sesiones_reserva.'], esperado: 'Las dos primeras comparten el mismo expiresAt; la de otra cancha tiene uno distinto; hay 2 filas de sesión.' },
  async (c) => {
    const u = await crearUsuario('t17m');
    const a = await conectar(u.token, K0.id);
    await esperar(3000);
    const b = await conectar(u.token, K0.id);
    c.verifica(a.expiresAt === b.expiresAt, 'La segunda pestaña recibe el mismo expiresAt', `${a.expiresAt} = ${b.expiresAt}`);
    const d = await conectar(u.token, K1.id);
    c.verifica(d.expiresAt > a.expiresAt, 'En otra cancha la sesión es independiente (otro expiresAt)', `+${((d.expiresAt - a.expiresAt) / 1000).toFixed(1)} s`);
    c.verifica(sqlq(`SELECT count(*) FROM sesiones_reserva WHERE usuario_id='${u.id}'`) === '2', 'Hay exactamente 2 sesiones (una por cancha)');
    cerrar(a, b, d);
  }
);

await S.caso(
  { ...base, id: 'F-17-08', hu: 'US-17', ca: [10], nivel: 'Socket.IO', grupo: 'US-17', titulo: 'Al salir de la cancha se cancela el temporizador (tras un lapso de gracia de 10 s)', objetivo: 'Verificar que cerrar todos los sockets cancela la sesión, que cerrar solo una pestaña no la afecta y que el servidor espera un lapso de gracia (10 s) antes de cancelar para tolerar caídas breves de red.', pasos: ['Abrir dos pestañas (sockets) del usuario.', 'Cerrar una: la sesión debe seguir.', 'Cerrar la otra: la sesión sigue durante el lapso de gracia y luego se cancela.', 'Volver a entrar.'], esperado: 'Con una pestaña abierta la sesión sigue; al cerrar la última, durante los primeros segundos aún existe (gracia) y pasados ~10 s se elimina de la base; al volver a entrar se crea una sesión nueva de 180 s.' },
  async (c) => {
    const u = await crearUsuario('t17x');
    const a = await conectar(u.token, K0.id);
    const b = await conectar(u.token, K0.id);
    a.socket.disconnect();
    await esperar(700);
    c.verifica(sqlq(`SELECT count(*) FROM sesiones_reserva WHERE usuario_id='${u.id}'`) === '1', 'Al cerrar una de dos pestañas la sesión sigue activa');
    b.socket.disconnect();
    await esperar(1500);
    c.verifica(sqlq(`SELECT count(*) FROM sesiones_reserva WHERE usuario_id='${u.id}'`) === '1', 'Al cerrar la última pestaña la sesión se conserva durante el lapso de gracia');
    await esperar(11000);
    c.verifica(sqlq(`SELECT count(*) FROM sesiones_reserva WHERE usuario_id='${u.id}'`) === '0', 'Pasado el lapso de gracia (≈ 10 s) la sesión se elimina', '12,5 s después de salir');
    const r = await completar(u, K0, franja(10));
    c.verifica(r.status === 409, 'Ya no se puede entrar al panel sin sesión (409)', `HTTP ${r.status}`);
    const d = await conectar(u.token, K0.id);
    const restante = (d.expiresAt - Date.now()) / 1000;
    c.verifica(restante > 177, 'Al volver a entrar se crea una sesión nueva de 180 s', `${restante.toFixed(1)} s`);
    cerrar(d);
  }
);

await S.caso(
  { ...base, id: 'F-17-09', hu: 'US-17', ca: [10, 11], nivel: 'Socket.IO', grupo: 'US-17', titulo: 'Reconexión dentro de la ventana de 3 minutos recupera el tiempo restante', objetivo: 'Verificar que, si el socket se corta y se reconecta pocos segundos después, el cliente recupera el tiempo restante de la MISMA sesión en vez de empezar una nueva.', datos: 'Corte simulado cerrando el transporte; reconexión 2 s después.', pasos: ['Conectar y registrar expiresAt.', 'Cortar la conexión (pérdida de red simulada).', 'Reconectar 2 s después con el mismo token.', 'Comparar el expiresAt recibido.'], esperado: 'El expiresAt recibido al reconectar es el mismo que antes del corte (se recupera el tiempo restante).' },
  async (c) => {
    const u = await crearUsuario('t17r');
    const s = await conectar(u.token, K0.id);
    const antes = s.expiresAt;
    s.socket.io.engine.close();
    await esperar(2000);
    const s2 = await conectar(u.token, K0.id);
    c.verifica(s2.expiresAt === antes, 'Al reconectar se recupera el mismo expiresAt', `antes ${new Date(antes).toISOString().slice(11, 23)} · después ${new Date(s2.expiresAt).toISOString().slice(11, 23)} (diferencia ${((s2.expiresAt - antes) / 1000).toFixed(1)} s)`);
    await esperar(11000);
    c.verifica(sqlq(`SELECT count(*) FROM sesiones_reserva WHERE usuario_id='${u.id}' AND estado='activo'`) === '1', 'Pasado el lapso de gracia la sesión sigue activa porque el usuario volvió (no se canceló)');
    cerrar(s, s2);
  }
);

await S.caso(
  { ...base, id: 'F-17-11', hu: 'US-17', ca: [3, 4], nivel: 'Socket.IO', grupo: 'US-17', titulo: 'Los eventos del temporizador incluyen la hora del servidor', objetivo: 'Verificar que temporizador:inicio y temporizador:sync informan la hora actual del servidor (ahora), de modo que el cliente pueda calcular la cuenta regresiva sin depender de su reloj.', pasos: ['Conectar el socket.', 'Leer temporizador:inicio y el primer temporizador:sync.', 'Comparar el campo "ahora" con la hora actual.'], esperado: 'Ambos eventos traen "ahora" (milisegundos) con una diferencia menor a 2 s respecto de la hora actual del equipo de pruebas.' },
  async (c) => {
    const u = await crearUsuario('t17h');
    const s = await conectar(u.token, K0.id);
    const inicio = eventosDe(s, 'temporizador:inicio')[0];
    c.verifica(typeof inicio.datos.ahora === 'number' && Math.abs(inicio.datos.ahora - inicio.t) < 2000, 'temporizador:inicio incluye "ahora"', `diferencia ${inicio.datos.ahora - inicio.t} ms`);
    const sync = await esperarEvento(s, 'temporizador:sync', () => true, 7000);
    c.verifica(sync && typeof sync.datos.ahora === 'number' && Math.abs(sync.datos.ahora - sync.t) < 2000, 'temporizador:sync incluye "ahora"', sync ? `diferencia ${sync.datos.ahora - sync.t} ms` : 'no llegó');
    const ack = await emitir(s, 'temporizador:reiniciar', null);
    c.verifica(typeof ack.ahora === 'number', 'El ack de temporizador:reiniciar también incluye "ahora"');
    cerrar(s);
  }
);

await S.caso(
  { ...base, id: 'F-17-10', hu: 'US-17', ca: [7], nivel: 'Socket.IO', grupo: 'US-17', titulo: 'Reiniciar el temporizador', objetivo: 'Verificar temporizador:reiniciar: nueva sesión de 180 s para todas las pestañas del usuario.', pasos: ['Abrir dos pestañas.', 'Emitir temporizador:reiniciar desde una, tras 4 s.', 'Revisar ack y eventos.'], esperado: 'El ack trae un nuevo expiresAt (≈ +180 s desde el reinicio) y ambas pestañas reciben temporizador:inicio con ese valor.' },
  async (c) => {
    const u = await crearUsuario('t17z');
    const a = await conectar(u.token, K0.id);
    const b = await conectar(u.token, K0.id);
    await esperar(4000);
    const ack = await emitir(a, 'temporizador:reiniciar', null);
    c.verifica(ack.expiresAt > a.expiresAt + 3000, 'El ack trae un expiresAt posterior al original', `+${((ack.expiresAt - a.expiresAt) / 1000).toFixed(1)} s`);
    const evA = await esperarEvento(a, 'temporizador:inicio', (d) => d.expiresAt === ack.expiresAt, 2000);
    const evB = await esperarEvento(b, 'temporizador:inicio', (d) => d.expiresAt === ack.expiresAt, 2000);
    c.verifica(Boolean(evA) && Boolean(evB), 'Ambas pestañas reciben el nuevo temporizador:inicio');
    c.verifica(sqlq(`SELECT count(*) FROM sesiones_reserva WHERE usuario_id='${u.id}'`) === '1', 'Sigue habiendo una sola sesión');
    cerrar(a, b);
  }
);

// =====================================================================
// US-18 Retención y tiempo real
// =====================================================================
const tresClientes = async (prefijo, cancha) => {
  const [u1, u2] = await Promise.all([crearUsuario(`${prefijo}a`), crearUsuario(`${prefijo}b`)]);
  const [a, b] = [await conectar(u1.token, cancha.id), await conectar(u2.token, cancha.id)];
  return { u1, u2, a, b };
};

await S.caso(
  { ...base, id: 'F-18-01', hu: 'US-18', ca: [1, 2], nivel: 'Socket.IO', grupo: 'US-18', titulo: 'Retener una franja: confirmación al dueño y aviso en tiempo real a los demás', objetivo: 'Verificar retencion:solicitar y los eventos que reciben el dueño y los demás usuarios de la cancha.', pasos: ['A y B abren la misma cancha.', 'A emite retencion:solicitar con la franja elegida.', 'Revisar el ack y los eventos de A y de B.', 'Consultar la tabla retenciones.'], esperado: 'A recibe ack {ok:true} y retencion:confirmada con expiresAt = vencimiento de su sesión. B recibe disponibilidad:retenida con la franja (sin identificar a A). A no recibe disponibilidad:retenida de su propia retención. Hay 1 fila en retenciones.' },
  async (c) => {
    const { u1, a, b } = await tresClientes('r1', K2);
    const f = franja(10);
    const ack = await emitir(a, 'retencion:solicitar', f);
    c.verifica(ack.ok === true && ack.retencion.horaInicio === '10:00', 'A recibe el ack {ok:true} con la retención', JSON.stringify(ack).slice(0, 140));
    c.verifica(ack.retencion.expiresAt === a.expiresAt, 'La retención dura lo que le queda a la sesión (expiresAt de la sesión)');
    const conf = await esperarEvento(a, 'retencion:confirmada', (d) => d.fecha === f.fecha);
    c.verifica(Boolean(conf), 'A recibe el evento retencion:confirmada');
    const ev = await esperarEvento(b, 'disponibilidad:retenida', (d) => d.fecha === f.fecha && d.horaInicio === '10:00');
    c.verifica(Boolean(ev), 'B recibe disponibilidad:retenida sin recargar', ev ? `${t(ev.t - conf.t)} después` : 'no llegó');
    c.verifica(ev && !JSON.stringify(ev.datos).includes(u1.id) && Object.keys(ev.datos).sort((x, y) => x.localeCompare(y)).join() === 'canchaId,fecha,horaFin,horaInicio', 'El aviso solo trae la franja: no revela quién la retiene', JSON.stringify(ev?.datos));
    c.verifica(eventosDe(a, 'disponibilidad:retenida').length === 0, 'A no recibe el aviso de su propia retención');
    c.verifica(sqlq(`SELECT count(*) FROM retenciones WHERE usuario_id='${u1.id}' AND fecha='${f.fecha}'`) === '1', 'Hay 1 fila en la tabla retenciones');
    cerrar(a, b);
  }
);

await S.caso(
  { ...base, id: 'F-18-02', hu: 'US-18', ca: [1, 2], nivel: 'Socket.IO', grupo: 'US-18', titulo: 'Retener una franja ya retenida por otro: FRANJA_RETENIDA (caso de error)', objetivo: 'Verificar que la franja retenida por un usuario no puede ser tomada por otro y que el error es claro.', pasos: ['A retiene una franja.', 'B intenta retener la misma.', 'B intenta retener una franja distinta.', 'Consultar retenciones.'], esperado: 'B recibe {ok:false, error:{codigo:"FRANJA_RETENIDA", mensaje}}; con otra franja sí puede; en la base la franja tiene un único dueño.' },
  async (c) => {
    const { u1, u2, a, b } = await tresClientes('r2', K2);
    const f = franja(11);
    await emitir(a, 'retencion:solicitar', f);
    const rb = await emitir(b, 'retencion:solicitar', f);
    c.verifica(rb.ok === false && rb.error.codigo === 'FRANJA_RETENIDA', 'B recibe FRANJA_RETENIDA', JSON.stringify(rb.error));
    c.verifica(/está reservando esta franja/.test(rb.error.mensaje), 'El mensaje es comprensible para el usuario', rb.error.mensaje);
    const otra = await emitir(b, 'retencion:solicitar', { ...f, horaInicio: '12:00', horaFin: '13:00' });
    c.verifica(otra.ok === true, 'B sí puede retener otra franja libre');
    c.verifica(sqlq(`SELECT usuario_id FROM retenciones WHERE fecha='${f.fecha}' AND hora_inicio='11:00' AND cancha_id='${K2.id}'`) === u1.id, 'La franja 11:00 sigue siendo de A en la base');
    void u2;
    cerrar(a, b);
  }
);

await S.caso(
  { ...base, id: 'F-18-03', hu: 'US-18', ca: [3, 5], nivel: 'Socket.IO', grupo: 'US-18', titulo: 'Una sola franja por usuario y cancha: al cambiar, se libera la anterior', objetivo: 'Verificar la regla de una retención por usuario y cancha y el aviso de liberación a los demás.', pasos: ['A retiene la franja 10:00.', 'A retiene la franja 11:00.', 'Revisar los eventos de B.', 'Consultar retenciones del usuario A.'], esperado: 'B recibe disponibilidad:liberada (10:00) y disponibilidad:retenida (11:00); A conserva una sola fila en la base (11:00).' },
  async (c) => {
    const { u1, a, b } = await tresClientes('r3', K2);
    const f = franja(10);
    await emitir(a, 'retencion:solicitar', f);
    await esperarEvento(b, 'disponibilidad:retenida', (d) => d.horaInicio === '10:00' && d.fecha === f.fecha);
    await emitir(a, 'retencion:solicitar', { ...f, horaInicio: '11:00', horaFin: '12:00' });
    const lib = await esperarEvento(b, 'disponibilidad:liberada', (d) => d.horaInicio === '10:00' && d.fecha === f.fecha);
    const ret = await esperarEvento(b, 'disponibilidad:retenida', (d) => d.horaInicio === '11:00' && d.fecha === f.fecha);
    c.verifica(Boolean(lib), 'B recibe disponibilidad:liberada de la franja anterior (10:00)');
    c.verifica(Boolean(ret), 'B recibe disponibilidad:retenida de la nueva franja (11:00)');
    c.verifica(sqlq(`SELECT count(*) FROM retenciones WHERE usuario_id='${u1.id}' AND cancha_id='${K2.id}'`) === '1', 'A conserva una sola fila de retención', sqlq(`SELECT hora_inicio FROM retenciones WHERE usuario_id='${u1.id}'`));
    const mismo = await emitir(a, 'retencion:solicitar', { ...f, horaInicio: '11:00', horaFin: '12:00' });
    c.verifica(mismo.ok === true, 'Volver a retener la misma franja (p. ej. al reconectar) responde ok');
    await esperar(500);
    c.verifica(eventosDe(b, 'disponibilidad:retenida', (d) => d.horaInicio === '11:00').length === 1, 'Y no genera avisos duplicados a B');
    cerrar(a, b);
  }
);

await S.caso(
  { ...base, id: 'F-18-04', hu: 'US-18', ca: [3], nivel: 'Socket.IO', grupo: 'US-18', titulo: 'Liberar la retención: botón "Cancelar", cambio de fecha o salida de la cancha', objetivo: 'Verificar los motivos de liberación activados por el usuario.', pasos: ['A retiene una franja y emite retencion:liberar.', 'A retiene otra y cierra su conexión (sale de la cancha).', 'Revisar los avisos a B y la tabla retenciones.'], esperado: 'Con retencion:liberar B recibe disponibilidad:liberada de inmediato; al salir de la cancha la recibe tras el lapso de gracia (≈ 10 s); en ambos casos la fila desaparece de retenciones.' },
  async (c) => {
    const { u1, a, b } = await tresClientes('r4', K2);
    const f = franja(10);
    await emitir(a, 'retencion:solicitar', f);
    await esperarEvento(b, 'disponibilidad:retenida', (d) => d.horaInicio === '10:00' && d.fecha === f.fecha);
    const ack = await emitir(a, 'retencion:liberar', null);
    c.verifica(ack.ok === true, 'retencion:liberar responde {ok:true}');
    c.verifica(Boolean(await esperarEvento(b, 'disponibilidad:liberada', (d) => d.horaInicio === '10:00' && d.fecha === f.fecha)), 'Por "cancelar": B recibe disponibilidad:liberada');
    c.verifica(sqlq(`SELECT count(*) FROM retenciones WHERE usuario_id='${u1.id}'`) === '0', 'La fila desapareció de la tabla retenciones');
    const f2 = { ...f, horaInicio: '14:00', horaFin: '15:00' };
    await emitir(a, 'retencion:solicitar', f2);
    await esperarEvento(b, 'disponibilidad:retenida', (d) => d.horaInicio === '14:00' && d.fecha === f.fecha);
    a.socket.disconnect();
    c.verifica(Boolean(await esperarEvento(b, 'disponibilidad:liberada', (d) => d.horaInicio === '14:00' && d.fecha === f.fecha, 16000)), 'Por "salir de la cancha": B recibe disponibilidad:liberada (tras el lapso de gracia de 10 s)');
    c.verifica(sqlq(`SELECT count(*) FROM retenciones WHERE usuario_id='${u1.id}'`) === '0', 'La retención se eliminó al salir');
    cerrar(b);
  }
);

await S.caso(
  { ...base, id: 'F-18-05', hu: 'US-18', hus: ['US-18', 'US-09', 'US-11'], ca: { 'US-18': [4], 'US-09': [1], 'US-11': [1] }, nivel: 'API REST + Socket.IO', grupo: 'US-18', titulo: 'Al confirmar, la retención se convierte en reserva definitiva', objetivo: 'Verificar el paso de retención a reserva, consistente con la restricción única de US-09.', pasos: ['A retiene una franja y entra al panel (completar).', 'A confirma la reserva por REST.', 'Revisar el aviso a B y las tablas retenciones y reservas.', 'B intenta reservar la misma franja.'], esperado: 'B recibe disponibilidad:reservada (no liberada); la fila de retenciones desaparece; reservas tiene 1 fila "confirmada"; B recibe 409.' },
  async (c) => {
    const { u1, u2, a, b } = await tresClientes('r5', K2);
    const f = franja(10);
    await emitir(a, 'retencion:solicitar', f);
    const comp = await completar(u1, K2, f);
    c.verifica(comp.status === 200, 'A entra al panel de confirmación (200)', `HTTP ${comp.status}`);
    const vence = Number(sqlq(`SELECT extract(epoch from expires_at)*1000 FROM retenciones WHERE usuario_id='${u1.id}'`));
    c.verifica(cerca(vence - Date.now(), 10 * 60 * 1000, 15000), 'Al entrar al panel la retención se extiende ~10 minutos para poder confirmar', `${((vence - Date.now()) / 60000).toFixed(1)} min`);
    const r = await reservar(u1, K2, f);
    c.verifica(r.status === 201, 'A confirma la reserva (201)', `HTTP ${r.status}`);
    const res = await esperarEvento(b, 'disponibilidad:reservada', (d) => d.horaInicio === '10:00' && d.fecha === f.fecha);
    c.verifica(Boolean(res), 'B recibe disponibilidad:reservada en tiempo real');
    c.verifica(eventosDe(b, 'disponibilidad:liberada', (d) => d.horaInicio === '10:00').length === 0, 'B NO recibe "liberada" para esa franja (pasó directamente a reservada)');
    c.verifica(sqlq(`SELECT count(*) FROM retenciones WHERE usuario_id='${u1.id}'`) === '0', 'La fila de retenciones desapareció');
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE usuario_id='${u1.id}' AND fecha='${f.fecha}'`) === 'confirmada', 'La reserva quedó "confirmada" en la base');
    const rb = await reservar(u2, K2, f);
    c.verifica(rb.status === 409, 'B no puede reservar la franja ya reservada (409)', `HTTP ${rb.status}`);
    const ret = await emitir(b, 'retencion:solicitar', f);
    c.verifica(ret.ok === false && ret.error.codigo === 'FRANJA_OCUPADA', 'B tampoco puede retenerla: FRANJA_OCUPADA', JSON.stringify(ret.error));
    cerrar(a, b);
  }
);

await S.caso(
  { ...base, id: 'F-18-06', hu: 'US-18', hus: ['US-18', 'US-09'], ca: { 'US-18': [2, 4], 'US-09': [2] }, nivel: 'API REST + Socket.IO', grupo: 'US-18', titulo: 'Reservar una franja retenida por otro usuario (caso de error) y vista REST de retenidos', objetivo: 'Verificar que el servidor protege la retención incluso por la vía REST y que la disponibilidad informa las franjas retenidas de otros.', pasos: ['A retiene una franja.', 'B intenta reservarla por POST /reservas y por /temporizador/completar.', 'Consultar /disponibilidad como B y como A.'], esperado: 'B recibe 409 FRANJA_RETENIDA en ambos; no se crea reserva; /disponibilidad de B incluye la franja en "retenidos", la de A no.' },
  async (c) => {
    const { u1, u2, a, b } = await tresClientes('r6', K2);
    const f = franja(10);
    await emitir(a, 'retencion:solicitar', f);
    const rb = await reservar(u2, K2, f);
    c.verifica(rb.status === 409 && rb.datos.codigo === 'FRANJA_RETENIDA', 'POST /reservas de B: 409 FRANJA_RETENIDA', `HTTP ${rb.status} ${rb.datos.codigo}`);
    const cb = await completar(u2, K2, f);
    c.verifica(cb.status === 409 && cb.datos.codigo === 'FRANJA_RETENIDA', 'POST /temporizador/completar de B: 409 FRANJA_RETENIDA', `HTTP ${cb.status} ${cb.datos.codigo}`);
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE fecha='${f.fecha}'`) === '0', 'No se creó ninguna reserva');
    const dispB = await disponibilidad(u2, K2, f.fecha);
    c.verifica(dispB.datos.retenidos.length === 1 && dispB.datos.retenidos[0].horaInicio === '10:00', 'La disponibilidad de B lista la franja como retenida', JSON.stringify(dispB.datos.retenidos));
    const dispA = await disponibilidad(u1, K2, f.fecha);
    c.verifica(dispA.datos.retenidos.length === 0, 'La disponibilidad de A (la dueña) no la lista como retenida por otro');
    c.verifica((await completar(u1, K2, f)).status === 200 && (await reservar(u1, K2, f)).status === 201, 'A, que la retiene, sí puede continuar y reservar');
    cerrar(a, b);
  }
);

await S.caso(
  { ...base, id: 'F-18-07', hu: 'US-18', ca: [3], nivel: 'API REST + Socket.IO', grupo: 'US-18', titulo: 'Cancelar una reserva avisa en tiempo real que la franja quedó libre', objetivo: 'Verificar que al cancelar una reserva los demás usuarios reciben disponibilidad:liberada.', pasos: ['A confirma una reserva; B está viendo la cancha.', 'A cancela la reserva por REST.', 'Revisar los eventos de B.'], esperado: 'B recibe disponibilidad:reservada al confirmar y disponibilidad:liberada al cancelar.' },
  async (c) => {
    const { u1, a, b } = await tresClientes('r7', K2);
    const f = franja(10);
    const r = await reservar(u1, K2, f);
    c.verifica(Boolean(await esperarEvento(b, 'disponibilidad:reservada', (d) => d.horaInicio === '10:00' && d.fecha === f.fecha)), 'B recibe disponibilidad:reservada');
    await api('PATCH', `/reservas/${r.datos.reserva.id}/cancelar`, undefined, u1.token);
    c.verifica(Boolean(await esperarEvento(b, 'disponibilidad:liberada', (d) => d.horaInicio === '10:00' && d.fecha === f.fecha)), 'B recibe disponibilidad:liberada al cancelar');
    cerrar(a, b);
  }
);

await S.caso(
  { ...base, id: 'F-18-08', hu: 'US-18', ca: [1], nivel: 'Socket.IO', grupo: 'US-18', titulo: 'Errores de retencion:solicitar (casos de error)', objetivo: 'Verificar los códigos de error documentados para solicitudes inválidas.', pasos: ['Solicitar con payload vacío.', 'Solicitar con horaFin anterior a horaInicio.', 'Solicitar una hora pasada.', 'Solicitar una franja ya reservada.'], esperado: 'Respuestas {ok:false, error:{codigo}}: DATOS_INVALIDOS, DATOS_INVALIDOS, HORA_PASADA y FRANJA_OCUPADA.' },
  async (c) => {
    const u = await crearUsuario('r8');
    const s = await conectar(u.token, K2.id);
    const r1 = await emitir(s, 'retencion:solicitar', null);
    c.verifica(r1.ok === false && r1.error.codigo === 'DATOS_INVALIDOS', 'Payload vacío → DATOS_INVALIDOS', JSON.stringify(r1.error));
    const r2 = await emitir(s, 'retencion:solicitar', { fecha: fechaUnica(), horaInicio: '12:00', horaFin: '11:00' });
    c.verifica(r2.ok === false && r2.error.codigo === 'DATOS_INVALIDOS', 'horaFin anterior a horaInicio → DATOS_INVALIDOS', JSON.stringify(r2.error));
    const r3 = await emitir(s, 'retencion:solicitar', { fecha: '2020-01-01', horaInicio: '10:00', horaFin: '11:00' });
    c.verifica(r3.ok === false && r3.error.codigo === 'HORA_PASADA', 'Hora pasada → HORA_PASADA', JSON.stringify(r3.error));
    const f = franja(10);
    await reservar(ANA, K2, f);
    const r4 = await emitir(s, 'retencion:solicitar', f);
    c.verifica(r4.ok === false && r4.error.codigo === 'FRANJA_OCUPADA', 'Franja ya reservada → FRANJA_OCUPADA', JSON.stringify(r4.error));
    cerrar(s);
  }
);

await S.caso(
  { ...base, id: 'F-18-09', hu: 'US-18', ca: [2, 4], nivel: 'Socket.IO (concurrencia)', grupo: 'US-18', titulo: 'Diez usuarios retienen la misma franja a la vez', objetivo: 'Verificar que la retención es atómica: solo uno la obtiene.', pasos: ['Conectar 10 usuarios a la cancha.', 'Todos emiten retencion:solicitar para la misma franja simultáneamente.', 'Contar respuestas y filas.'], esperado: '1 respuesta ok y 9 con FRANJA_RETENIDA; 1 fila en retenciones; los 9 perdedores reciben exactamente un aviso disponibilidad:retenida.' },
  async (c) => {
    const usuarios = await Promise.all(Array.from({ length: 10 }, (_, i) => crearUsuario(`rc${i}`)));
    const clientes = await Promise.all(usuarios.map((u) => conectar(u.token, K2.id)));
    const f = franja(10);
    const respuestas = await Promise.all(clientes.map((cl) => emitir(cl, 'retencion:solicitar', f)));
    const ok = respuestas.filter((r) => r.ok).length;
    const rech = respuestas.filter((r) => r.error?.codigo === 'FRANJA_RETENIDA').length;
    c.verifica(ok === 1 && rech === 9, '1 aceptada y 9 rechazadas con FRANJA_RETENIDA', `${ok} ok · ${rech} rechazadas`);
    c.verifica(sqlq(`SELECT count(*) FROM retenciones WHERE fecha='${f.fecha}' AND cancha_id='${K2.id}'`) === '1', 'Una sola fila en retenciones');
    await esperar(800);
    const ganador = clientes[respuestas.findIndex((r) => r.ok)];
    const perdedores = clientes.filter((cl) => cl !== ganador);
    const conteos = perdedores.map((cl) => eventosDe(cl, 'disponibilidad:retenida', (d) => d.fecha === f.fecha).length);
    c.verifica(conteos.every((n) => n === 1), 'Los 9 perdedores reciben exactamente 1 aviso (sin pérdidas ni duplicados)', conteos.join(''));
    cerrar(clientes);
  }
);

// =====================================================================
// Documentación de eventos (US-18 CA9)
// =====================================================================
await S.caso(
  { ...base, id: 'F-18-10', hu: 'US-18', ca: [9], nivel: 'Documentación', grupo: 'US-18', titulo: 'Los eventos del socket y sus errores están documentados', objetivo: 'Verificar que todos los eventos y códigos de error que usa el código aparecen en docs/api/eventos-socket.md.', pasos: ['Extraer los nombres de eventos y los códigos de error del código fuente.', 'Buscar cada uno en el documento.'], esperado: 'Todos los eventos (temporizador:*, retencion:*, disponibilidad:*) y códigos de error están documentados, con payload.' },
  async (c) => {
    const doc = fs.readFileSync(`${ROOT}/docs/api/eventos-socket.md`, 'utf8');
    const codigoSocket = fs.readFileSync(`${ROOT}/backend/src/sockets/temporizadorSocket.js`, 'utf8');
    const eventos = [...new Set([...codigoSocket.matchAll(/'((?:temporizador|retencion|disponibilidad):[a-z]+)'/g)].map((m) => m[1]))];
    c.verifica(eventos.length >= 10, 'Se identificaron los eventos usados por el código', `${eventos.length}: ${eventos.join(', ')}`);
    const faltan = eventos.filter((e) => !doc.includes(`\`${e}\``));
    c.verifica(faltan.length === 0, 'Todos los eventos aparecen documentados', faltan.length ? `faltan: ${faltan.join(', ')}` : 'ninguno falta');
    const codigos = [...new Set([...fs.readFileSync(`${ROOT}/backend/src/services/retencionService.js`, 'utf8').matchAll(/'([A-Z_]{6,})'/g)].map((m) => m[1]))];
    const faltanCodigos = codigos.filter((e) => !doc.includes(e));
    c.verifica(faltanCodigos.length === 0, 'Todos los códigos de error aparecen documentados', codigos.join(', '));
    c.verifica(/## Eventos que emite el cliente/.test(doc) && /## Eventos que emite el servidor/.test(doc) && /## Códigos de error/.test(doc), 'El documento tiene secciones de eventos del cliente, del servidor y de errores');
  }
);

// =====================================================================
// Resultados de la prueba larga (3 min reales) y reinicio del servidor
// =====================================================================
const L = await larga;
await S.caso(
  { ...base, id: 'F-17-06', hu: 'US-17', hus: ['US-17'], ca: [7, 8], nivel: 'Socket.IO + API (tiempo real: 180 s)', prioridad: 'Alta', grupo: 'US-17', titulo: 'Expiración real a los 180 s: evento, rechazo del panel y limpieza', objetivo: 'Dejar correr los 3 minutos completos y verificar el evento de expiración, el rechazo del backend y la limpieza de la sesión.', pasos: ['Conectar y retener una franja.', 'Esperar 180 s reales sin hacer nada.', 'Verificar el evento temporizador:expirado.', 'Intentar entrar al panel (POST /temporizador/completar).', 'Consultar la base.'], esperado: 'El servidor emite temporizador:expirado en expiresAt (±2 s); el panel responde 409 SESION_EXPIRADA; la sesión se borra de la base.' },
  async (c) => {
    c.verifica(L.tExp && cerca(L.tExp, L.expiresAt, 2000), 'temporizador:expirado llega a la hora indicada por expiresAt (±2 s)', L.tExp ? `desfase ${((L.tExp - L.expiresAt) / 1000).toFixed(2)} s` : 'no llegó');
    c.verifica(L.comp.status === 409 && L.comp.datos.codigo === 'SESION_EXPIRADA', 'Entrar al panel tras expirar: 409 SESION_EXPIRADA', `HTTP ${L.comp.status} — ${L.comp.datos.mensaje}`);
    c.verifica(L.filas.sesion === '0', 'La sesión se eliminó de la base', `${L.filas.sesion} filas`);
    c.verifica(L.sync >= 30, 'Durante los 180 s se recibieron sincronizaciones periódicas', `${L.sync} eventos temporizador:sync`);
    c.verifica(L.retDespues.ok === false && L.retDespues.error.codigo === 'SESION_EXPIRADA', 'Retener una franja con la sesión vencida: SESION_EXPIRADA', JSON.stringify(L.retDespues.error));
  }
);

await S.caso(
  { ...base, id: 'F-18-11', hu: 'US-18', ca: [3], nivel: 'Socket.IO (tiempo real: 180 s)', grupo: 'US-18', titulo: 'La retención se libera cuando expira el temporizador', objetivo: 'Verificar la liberación automática y el aviso a los demás al vencer la sesión.', pasos: ['A retiene una franja; B observa.', 'Esperar 180 s.', 'Revisar el aviso a B y la tabla retenciones.'], esperado: 'B recibe disponibilidad:liberada al expirar la sesión de A; la fila de retenciones desaparece.' },
  async (c) => {
    c.verifica(Boolean(L.tLib), 'B recibió disponibilidad:liberada de la franja de A', L.tLib ? `${((L.tLib - L.expiresAt) / 1000).toFixed(2)} s después del vencimiento` : 'no llegó');
    c.verifica(L.filas.retencion === '0', 'La retención se eliminó de la base', `${L.filas.retencion} filas`);
  }
);

await S.caso(
  { ...base, id: 'F-18-12', hu: 'US-18', hus: ['US-18', 'US-17'], ca: { 'US-18': [6], 'US-17': [11] }, nivel: 'Socket.IO + Docker', prioridad: 'Alta', grupo: 'US-18', titulo: 'Persistencia: sesión y retención sobreviven al reinicio del servidor', objetivo: 'Verificar que reiniciar el contenedor del backend con clientes conectados no pierde las sesiones ni las retenciones.', pasos: ['A conecta, retiene una franja y se registra su expiresAt.', 'Reiniciar el backend ("docker compose restart backend") sin cerrar los sockets de los clientes.', 'Consultar la base y la API.', 'A reconecta; B intenta retener la misma franja.', 'Observar la sincronización del temporizador restaurado y entrar al panel.'], esperado: 'Sesión y retención siguen en la base; A recibe el MISMO expiresAt al reconectar; la franja sigue retenida para B (FRANJA_RETENIDA); el temporizador sigue sincronizando y A puede continuar.' },
  async (c) => {
    const { u1, u2, a, b } = await tresClientes('p1', K2);
    const f = franja(10);
    const ack = await emitir(a, 'retencion:solicitar', f);
    c.verifica(ack.ok, 'A retiene la franja antes del reinicio');
    const expAntes = a.expiresAt;
    const filasAntes = [sqlq(`SELECT count(*) FROM sesiones_reserva WHERE usuario_id='${u1.id}'`), sqlq(`SELECT count(*) FROM retenciones WHERE usuario_id='${u1.id}'`)];
    c.verifica(filasAntes.join() === '1,1', 'Antes del reinicio: 1 sesión y 1 retención en la base', filasAntes.join(' y '));

    const t0 = Date.now();
    dc('restart backend');
    let sano = false;
    while (Date.now() - t0 < 60000 && !sano) {
      sano = await fetch(`${CFG.API}/health`).then((r) => r.status === 200).catch(() => false);
      if (!sano) await esperar(500);
    }
    c.verifica(sano, 'El backend vuelve a responder tras el reinicio', `${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const logs = logsBackend('2m');
    c.verifica(/Sesiones de reserva restauradas: [1-9]/.test(logs), 'Al arrancar, el servidor restaura las sesiones guardadas', (logs.match(/Sesiones de reserva restauradas: \d+/g) ?? []).pop());

    const filasDespues = [sqlq(`SELECT count(*) FROM sesiones_reserva WHERE usuario_id='${u1.id}' AND estado='activo'`), sqlq(`SELECT count(*) FROM retenciones WHERE usuario_id='${u1.id}'`)];
    c.verifica(filasDespues.join() === '1,1', 'Después del reinicio la sesión y la retención siguen en la base', filasDespues.join(' y '));
    const dispB = await disponibilidad(u2, K2, f.fecha);
    c.verifica(dispB.datos.retenidos.some((x) => x.horaInicio === '10:00'), 'La API sigue informando la franja como retenida para los demás');

    const a2 = await conectar(u1.token, K2.id);
    c.verifica(a2.ok && a2.expiresAt === expAntes, 'A reconecta y recibe el MISMO expiresAt (recupera el tiempo restante)', `diferencia ${a2.expiresAt - expAntes} ms`);
    const b2 = await conectar(u2.token, K2.id);
    const rb = await emitir(b2, 'retencion:solicitar', f);
    c.verifica(rb.ok === false && rb.error.codigo === 'FRANJA_RETENIDA', 'B sigue sin poder retener la franja de A: FRANJA_RETENIDA', JSON.stringify(rb.error));
    const sync = await esperarEvento(a2, 'temporizador:sync', () => true, 7000);
    c.verifica(sync?.datos.expiresAt === expAntes, 'El temporizador restaurado sigue sincronizando con el mismo expiresAt');
    const comp = await completar(u1, K2, f);
    c.verifica(comp.status === 200, 'A puede continuar al panel de confirmación (200)', `HTTP ${comp.status}`);
    cerrar(a, b, a2, b2);
  }
);

// =====================================================================
// US-12 Reservas múltiples
// =====================================================================
const conReservas = async (usuario, items) => {
  const out = [];
  for (const [cancha, f] of items) out.push(await reservar(usuario, cancha, f));
  return out;
};

await S.caso(
  { ...base, id: 'F-12-01', hu: 'US-12', ca: [1, 5], grupo: 'US-12', titulo: 'Un usuario tiene varias reservas activas a la vez', objetivo: 'Verificar que un mismo usuario puede reservar en canchas, fechas y horas distintas sin cancelar las anteriores y que todas quedan visibles.', pasos: ['Crear un usuario nuevo.', 'Reservar 3 franjas distintas (2 canchas, 2 fechas).', 'Consultar GET /api/reservas/mias y GET /api/reservas.'], esperado: 'Las 3 reservas responden 201; las 3 aparecen como "confirmada" en ambos listados; en la base hay 3 filas confirmadas del usuario.' },
  async (c) => {
    const u = await crearUsuario('multi');
    const dia1 = fechaUnica();
    const dia2 = fechaUnica();
    const rs = await conReservas(u, [[K0, { fecha: dia1, horaInicio: '08:00', horaFin: '09:00' }], [K1, { fecha: dia1, horaInicio: '09:00', horaFin: '10:00' }], [K0, { fecha: dia2, horaInicio: '08:00', horaFin: '09:00' }]]);
    c.verifica(rs.every((r) => r.status === 201), 'Las 3 reservas responden 201', rs.map((r) => r.status).join(', '));
    const mias = await api('GET', '/reservas/mias', undefined, u.token);
    c.verifica(mias.datos.reservas?.length === 3 && mias.datos.reservas.every((r) => r.estado === 'confirmada'), 'GET /reservas/mias lista las 3 como "confirmada"', `${mias.datos.reservas?.length} reservas`);
    const hist = await api('GET', '/reservas?limite=50', undefined, u.token);
    c.verifica(hist.status === 200 && hist.datos.paginacion?.total === 3, 'GET /reservas (historial) informa total = 3', JSON.stringify(hist.datos.paginacion));
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE usuario_id='${u.id}' AND estado='confirmada'`) === '3', 'En la base hay 3 reservas confirmadas del usuario');
  }
);

await S.caso(
  { ...base, id: 'F-12-02', hu: 'US-12', hus: ['US-12', 'US-09'], ca: { 'US-12': [2], 'US-09': [2] }, grupo: 'US-12', titulo: 'No se permiten dos reservas del mismo usuario que se solapen (caso de error)', objetivo: 'Verificar que el solape se rechaza aunque sea en otra cancha, que bloques contiguos sí se permiten y que otro usuario no se ve afectado.', pasos: ['El usuario reserva K0 de 10:00 a 11:00.', 'Intenta reservar K1 de 10:00 a 11:00 (mismo horario, otra cancha).', 'Reserva K1 de 11:00 a 12:00 (contiguo).', 'Otro usuario reserva K1 de 10:00 a 11:00.'], esperado: 'El segundo intento responde 409 "Ya tienes una reserva en ese horario" (codigo RESERVA_SOLAPADA) y no se crea la fila; el bloque contiguo responde 201; el otro usuario obtiene 201.' },
  async (c) => {
    const u = await crearUsuario('solape');
    const otro = await crearUsuario('solape2');
    const dia = fechaUnica();
    const r1 = await reservar(u, K0, { fecha: dia, horaInicio: '10:00', horaFin: '11:00' });
    c.verifica(r1.status === 201, 'Primera reserva: 201', `HTTP ${r1.status}`);
    const r2 = await reservar(u, K1, { fecha: dia, horaInicio: '10:00', horaFin: '11:00' });
    c.verifica(r2.status === 409 && r2.datos.mensaje === 'Ya tienes una reserva en ese horario', 'Mismo horario en otra cancha: 409 con mensaje claro', `HTTP ${r2.status} ${r2.datos.mensaje}`);
    c.verifica(r2.datos.codigo === 'RESERVA_SOLAPADA', 'El error trae el codigo RESERVA_SOLAPADA', r2.datos.codigo);
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE usuario_id='${u.id}'`) === '1', 'No se creó una segunda fila');
    const r3 = await reservar(u, K1, { fecha: dia, horaInicio: '11:00', horaFin: '12:00' });
    c.verifica(r3.status === 201, 'Bloque contiguo (11:00-12:00) en otra cancha: 201', `HTTP ${r3.status}`);
    const r4 = await reservar(otro, K1, { fecha: dia, horaInicio: '10:00', horaFin: '11:00' });
    c.verifica(r4.status === 201, 'Otro usuario sí puede reservar K1 10:00-11:00: 201', `HTTP ${r4.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-12-03', hu: 'US-12', ca: [4], grupo: 'US-12', titulo: 'Cancelar una reserva no afecta a las demás', objetivo: 'Verificar que cancelar una de varias reservas deja intactas las otras.', pasos: ['El usuario crea 3 reservas.', 'Cancela la del medio.', 'Consulta GET /api/reservas/mias.'], esperado: 'La cancelación responde 200; en el listado quedan 2 "confirmada" y 1 "cancelada"; la franja cancelada vuelve a poder reservarse.' },
  async (c) => {
    const u = await crearUsuario('cancela');
    const dia = fechaUnica();
    const rs = await conReservas(u, [[K0, { fecha: dia, horaInicio: '08:00', horaFin: '09:00' }], [K0, { fecha: dia, horaInicio: '09:00', horaFin: '10:00' }], [K0, { fecha: dia, horaInicio: '10:00', horaFin: '11:00' }]]);
    const medio = rs[1].datos.reserva.id;
    const cancel = await api('PATCH', `/reservas/${medio}/cancelar`, undefined, u.token);
    c.verifica(cancel.status === 200 && cancel.datos.reserva.estado === 'cancelada', 'Cancelar la reserva del medio: 200 "cancelada"', `HTTP ${cancel.status}`);
    const mias = await api('GET', '/reservas/mias', undefined, u.token);
    const estados = mias.datos.reservas.map((r) => r.estado).sort((x, y) => x.localeCompare(y)).join(',');
    c.verifica(estados === 'cancelada,confirmada,confirmada', 'Quedan 2 confirmadas y 1 cancelada', estados);
    const otra = await crearUsuario('cancela2');
    const re = await reservar(otra, K0, { fecha: dia, horaInicio: '09:00', horaFin: '10:00' });
    c.verifica(re.status === 201, 'La franja cancelada vuelve a estar disponible para otro usuario: 201', `HTTP ${re.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-12-04', hu: 'US-12', ca: [3], grupo: 'US-12', titulo: 'Límite máximo de reservas activas por usuario (caso de error)', objetivo: 'Verificar el tope configurable de reservas simultáneas con un backend adicional configurado con un máximo de 3.', pasos: ['Levantar un segundo backend contra la misma base con MAX_RESERVAS_ACTIVAS_USUARIO=3.', 'El usuario crea 3 reservas en horas distintas.', 'Intenta una cuarta.', 'Cancela una y reintenta.'], esperado: 'Las 3 primeras responden 201; la cuarta 409 con codigo LIMITE_RESERVAS_ALCANZADO y el mensaje "Ya tienes 3 reservas activas…"; tras cancelar una, la cuarta se acepta.' },
  async (c) => {
    const u = await crearUsuario('limite');
    sh('docker rm -f qa-backend-limite');
    const run = dc('run -d --no-deps --name qa-backend-limite -e MAX_RESERVAS_ACTIVAS_USUARIO=3 -e PORT=4001 -p 4301:4001 backend sh -c "exec node src/server.js"');
    c.verifica(run.code === 0, 'Segundo backend con límite 3 iniciado', run.out.trim().split('\n').pop().slice(0, 80));
    try {
      let listo = false;
      for (let i = 0; i < 40 && !listo; i += 1) {
        listo = await fetch('http://localhost:4301/api/health').then((r) => r.status === 200).catch(() => false);
        if (!listo) await esperar(500);
      }
      c.verifica(listo, 'El segundo backend responde');
      const dia = fechaUnica();
      const llamar = (hora, ruta = `/canchas/${K0.id}/reservas`, metodo = 'POST') =>
        fetch(`http://localhost:4301/api${ruta}`, {
          method: metodo,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
          body: metodo === 'POST' ? JSON.stringify({ fecha: dia, horaInicio: `${hora}:00`, horaFin: `${String(Number(hora) + 1).padStart(2, '0')}:00` }) : undefined,
        }).then(async (r) => ({ status: r.status, datos: await r.json() }));
      const tres = [await llamar('08'), await llamar('09'), await llamar('10')];
      c.verifica(tres.every((r) => r.status === 201), 'Las 3 primeras: 201', tres.map((r) => r.status).join(', '));
      const cuarta = await llamar('11');
      c.verifica(cuarta.status === 409 && cuarta.datos.codigo === 'LIMITE_RESERVAS_ALCANZADO', 'La cuarta: 409 LIMITE_RESERVAS_ALCANZADO', `HTTP ${cuarta.status} ${cuarta.datos.codigo}`);
      c.verifica(/3 reservas activas/.test(cuarta.datos.mensaje), 'El mensaje explica el límite', cuarta.datos.mensaje);
      c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE usuario_id='${u.id}'`) === '3', 'No se creó la cuarta fila');
      await llamar(null, `/reservas/${tres[0].datos.reserva.id}/cancelar`, 'PATCH');
      const quinta = await llamar('11');
      c.verifica(quinta.status === 201, 'Tras cancelar una, la cuarta se acepta: 201', `HTTP ${quinta.status}`);
    } finally {
      sh('docker rm -f qa-backend-limite');
    }
  }
);

// =====================================================================
// US-13 Historial de reservas
// =====================================================================
const insertarPasada = (usuario, cancha, dias, hora, estado = 'confirmada') =>
  sql(`INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin, estado) VALUES ('${cancha.id}', '${usuario.id}', '${fechaCO(-dias)}', '${hora}:00', '${String(Number(hora) + 1).padStart(2, '0')}:00', '${estado}')`);

await S.caso(
  { ...base, id: 'F-13-01', hu: 'US-13', ca: [1, 2], grupo: 'US-13', titulo: 'Historial: solo las reservas propias, próximas de la más cercana a la más lejana', objetivo: 'Verificar el contenido y el orden del listado por defecto y que no se filtran reservas de otros usuarios.', pasos: ['Crear 3 reservas futuras en orden desordenado para el usuario A y 1 para B.', 'GET /api/reservas del usuario A (periodo por defecto).', 'GET /api/reservas del usuario B.'], esperado: 'A ve solo sus 3 reservas, de la fecha más cercana a la más lejana, con id, codigo, canchaNombre, canchaDireccion, fecha, horaInicio, horaFin y estado; B ve solo la suya.' },
  async (c) => {
    const A = await crearUsuario('hist');
    const B = await crearUsuario('hist2');
    const [d1, d2, d3] = [fechaUnica(), fechaUnica(), fechaUnica()].sort((x, y) => x.localeCompare(y));
    await conReservas(A, [[K0, { fecha: d3, horaInicio: '08:00', horaFin: '09:00' }], [K1, { fecha: d1, horaInicio: '08:00', horaFin: '09:00' }], [K0, { fecha: d2, horaInicio: '08:00', horaFin: '09:00' }]]);
    await reservar(B, K2, { fecha: d1, horaInicio: '08:00', horaFin: '09:00' });
    const r = await api('GET', '/reservas', undefined, A.token);
    c.verifica(r.status === 200 && r.datos.reservas.length === 3, 'A recibe 200 con sus 3 reservas', `HTTP ${r.status}, ${r.datos.reservas?.length}`);
    c.verifica(JSON.stringify(r.datos.reservas.map((x) => x.fecha)) === JSON.stringify([d1, d2, d3]), 'Orden: de la más cercana a la más lejana', r.datos.reservas.map((x) => x.fecha).join(' < '));
    const x = r.datos.reservas[0];
    c.verifica(x.id && /^CY-[0-9A-F]{8}$/.test(x.codigo) && x.canchaNombre && x.canchaDireccion && x.horaInicio === '08:00' && x.horaFin === '09:00' && x.estado === 'confirmada', 'Cada reserva trae id, código, cancha, dirección, hora (HH:mm) y estado', JSON.stringify(x));
    const rb = await api('GET', '/reservas', undefined, B.token);
    c.verifica(rb.datos.reservas.length === 1 && rb.datos.reservas[0].canchaId === K2.id, 'B ve solo la suya', `${rb.datos.reservas.length}`);
    c.evidenciaTexto('Respuesta de GET /api/reservas (usuario A)', JSON.stringify(r.datos, null, 1));
  }
);

await S.caso(
  { ...base, id: 'F-13-02', hu: 'US-13', ca: [2, 3, 4], grupo: 'US-13', titulo: 'Historial: pasadas, estado "completada" y filtro por estado', objetivo: 'Verificar la separación próximas/pasadas, que una confirmada ya jugada se muestra "completada" y el filtro por estado.', pasos: ['Insertar reservas pasadas: una confirmada y una cancelada. Crear una futura confirmada y una futura cancelada.', 'GET /api/reservas?periodo=pasadas.', 'GET con estado=completada, cancelada y confirmada.'], esperado: 'Pasadas: la más reciente primero, la confirmada como "completada" y la cancelada como "cancelada"; el filtro devuelve solo ese estado; las próximas no incluyen las pasadas.' },
  async (c) => {
    const u = await crearUsuario('pasadas');
    insertarPasada(u, K0, 3, '08');
    insertarPasada(u, K0, 10, '09', 'cancelada');
    const dia = fechaUnica();
    const f = await reservar(u, K1, { fecha: dia, horaInicio: '08:00', horaFin: '09:00' });
    const g = await reservar(u, K1, { fecha: dia, horaInicio: '09:00', horaFin: '10:00' });
    await api('PATCH', `/reservas/${g.datos.reserva.id}/cancelar`, undefined, u.token);
    c.verifica(f.status === 201, 'Preparación: la reserva futura se creó (201)');
    const pas = await api('GET', '/reservas?periodo=pasadas', undefined, u.token);
    c.verifica(pas.datos.reservas.length === 2, 'Pasadas: 2 reservas', `${pas.datos.reservas?.length}`);
    c.verifica(pas.datos.reservas[0].estado === 'completada', 'La confirmada ya jugada se muestra "completada" y va primero (la más reciente)', pas.datos.reservas.map((x) => `${x.fecha} ${x.estado}`).join(' · '));
    c.verifica(pas.datos.reservas[1].estado === 'cancelada', 'La cancelada se muestra "cancelada"');
    const prox = await api('GET', '/reservas?periodo=proximas', undefined, u.token);
    c.verifica(prox.datos.reservas.length === 2 && prox.datos.reservas.every((x) => x.fecha === dia), 'Próximas: solo las 2 futuras (no incluye las pasadas)', `${prox.datos.reservas.length}`);
    for (const [periodo, estado, esperado] of [['pasadas', 'completada', 1], ['pasadas', 'cancelada', 1], ['proximas', 'confirmada', 1], ['proximas', 'cancelada', 1], ['proximas', 'completada', 0]]) {
      const r = await api('GET', `/reservas?periodo=${periodo}&estado=${estado}`, undefined, u.token);
      c.verifica(r.datos.reservas.length === esperado && r.datos.reservas.every((x) => x.estado === estado), `Filtro ${periodo} + ${estado}: ${esperado} resultado(s)`, `${r.datos.reservas?.length}`);
    }
  }
);

await S.caso(
  { ...base, id: 'F-13-03', hu: 'US-13', ca: [5], grupo: 'US-13', titulo: 'Historial: paginación', objetivo: 'Verificar el tamaño de página por defecto, el desplazamiento, el total y el límite máximo.', pasos: ['Insertar 12 reservas pasadas para un usuario.', 'GET periodo=pasadas (página 1 y 2).', 'GET con limite=5&pagina=3.', 'GET con limite=500.'], esperado: 'Página 1: 10 reservas, total 12, totalPaginas 2; página 2: 2 reservas; limite=5 pagina=3: 2 reservas; limite=500 responde 400.' },
  async (c) => {
    const u = await crearUsuario('pagina');
    for (let i = 0; i < 12; i += 1) insertarPasada(u, lista[3], 40 + i, '08');
    const p1 = await api('GET', '/reservas?periodo=pasadas', undefined, u.token);
    c.verifica(p1.datos.reservas.length === 10 && JSON.stringify(p1.datos.paginacion) === JSON.stringify({ pagina: 1, limite: 10, total: 12, totalPaginas: 2 }), 'Página 1: 10 reservas y paginación {1, 10, 12, 2}', JSON.stringify(p1.datos.paginacion));
    const p2 = await api('GET', '/reservas?periodo=pasadas&pagina=2', undefined, u.token);
    c.verifica(p2.datos.reservas.length === 2 && p2.datos.paginacion.pagina === 2, 'Página 2: 2 reservas', `${p2.datos.reservas.length}`);
    const ids = new Set([...p1.datos.reservas, ...p2.datos.reservas].map((x) => x.id));
    c.verifica(ids.size === 12, 'Las dos páginas no repiten reservas (12 distintas)', `${ids.size}`);
    const p3 = await api('GET', '/reservas?periodo=pasadas&limite=5&pagina=3', undefined, u.token);
    c.verifica(p3.datos.reservas.length === 2 && p3.datos.paginacion.totalPaginas === 3, 'limite=5 pagina=3: 2 reservas, 3 páginas', JSON.stringify(p3.datos.paginacion));
    const mal = await api('GET', '/reservas?limite=500', undefined, u.token);
    c.verifica(mal.status === 400, 'limite=500 se rechaza con 400', `HTTP ${mal.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-13-04', hu: 'US-13', ca: [6, 7], grupo: 'US-13', titulo: 'Historial: usuario sin reservas, sin token y parámetros inválidos (casos de error)', objetivo: 'Verificar el estado vacío y el rechazo de peticiones no autenticadas o con parámetros incorrectos.', pasos: ['GET /api/reservas de un usuario sin reservas.', 'GET sin token y con token inválido.', 'GET con periodo, estado, pagina y limite inválidos.'], esperado: 'Vacío: 200 con reservas [] y total 0, totalPaginas 1; sin token 401; parámetros inválidos 400 con el campo señalado.' },
  async (c) => {
    const u = await crearUsuario('vacio');
    const v = await api('GET', '/reservas', undefined, u.token);
    c.verifica(v.status === 200 && v.datos.reservas.length === 0 && v.datos.paginacion.total === 0 && v.datos.paginacion.totalPaginas === 1, 'Sin reservas: 200, lista vacía, total 0 y 1 página', JSON.stringify(v.datos));
    const s1 = await api('GET', '/reservas');
    const s2 = await api('GET', '/reservas', undefined, 'token.invalido.x');
    c.verifica(s1.status === 401 && s2.status === 401, 'Sin token o con token inválido: 401', `${s1.status} / ${s2.status}`);
    for (const [q, campo] of [['periodo=futuro', 'periodo'], ['estado=rara', 'estado'], ['pagina=0', 'pagina'], ['limite=0', 'limite'], ['pagina=abc', 'pagina']]) {
      const r = await api('GET', `/reservas?${q}`, undefined, u.token);
      c.verifica(r.status === 400 && r.datos.errores?.some((e) => e.campo === campo), `${q}: 400 señalando "${campo}"`, `HTTP ${r.status}`);
    }
  }
);

// =====================================================================
// Sprint 5 — US-14 Cancelación, US-27 Perfil, US-28 Tarjeta y US-29 Verificación de código
// =====================================================================
const ANIO_TARJETA = new Date().getFullYear() + 3;
const tarjeta = (extra = {}) => ({ numero: '4242 4242 4242 4242', titular: 'Ana Pérez', vencimientoMes: 12, vencimientoAnio: ANIO_TARJETA, cvv: '123', ...extra });
const horaSiguiente = (hora) => `${String(Number(hora) + 1).padStart(2, '0')}:00`;
const reservarHora = (usuario, cancha, fecha, hora, metodoPagoId) =>
  api('POST', `/canchas/${cancha.id}/reservas`, { fecha, horaInicio: `${hora}:00`, horaFin: horaSiguiente(hora), ...(metodoPagoId ? { metodoPagoId } : {}) }, usuario.token);
const guardarTarjeta = (usuario, extra) => api('POST', `/usuarios/${usuario.id}/metodos-pago`, tarjeta(extra), usuario.token);
const cancelarReserva = (usuario, id) => api('PATCH', `/reservas/${id}/cancelar`, undefined, usuario.token);
const verificarCodigo = (admin, codigo) => api('POST', '/admin/reservas/verificar', { codigo }, admin.token);
const usarCodigo = (admin, codigo) => api('POST', `/admin/reservas/${codigo}/usar`, undefined, admin.token);

// Fecha y hora de Colombia dentro de `minutos` minutos, para crear reservas que empiezan pronto.
const colombiaEn = (minutos) => {
  const momento = new Date(Date.now() + minutos * 60000 - 5 * 3600e3).toISOString();
  return { fecha: momento.slice(0, 10), hora: momento.slice(11, 16) };
};
const rangoDesdeAhora = (minutos) => {
  const inicio = colombiaEn(minutos);
  const fin = colombiaEn(minutos + 15);
  return { fecha: inicio.fecha, inicio: inicio.hora, fin: fin.fecha === inicio.fecha ? fin.hora : '23:59' };
};
const fechaPasadaUnica = () => `${2001 + Math.floor(Math.random() * 19)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`;
const insertarReservaSql = (usuario, cancha, fecha, inicio, fin, estado = 'confirmada') =>
  sqlq(`INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin, estado) VALUES ('${cancha.id}', '${usuario.id}', '${fecha}', '${inicio}', '${fin}', '${estado}') RETURNING id || '|' || codigo`).split(/\r?\n/)[0].split('|');

// Inserta una reserva que empieza pronto en la primera cancha y el primer minuto libres: así no choca con las que
// crearon otras pruebas minutos antes (la restricción de solape es por cancha).
function insertarProntoLibre(usuario, canchasLista, minutosBase = 60, margen = 50) {
  for (let desfase = 0; desfase < margen; desfase += 3) {
    for (const cancha of canchasLista) {
      const r = rangoDesdeAhora(minutosBase + desfase);
      try {
        return insertarReservaSql(usuario, cancha, r.fecha, r.inicio, r.fin);
      } catch {
        // franja ocupada en esa cancha: se prueba otra
      }
    }
  }
  throw new Error('No se encontró una franja libre para la reserva próxima');
}

async function crearAdministrador(prefijo = 'admin') {
  const admin = await crearUsuario(prefijo);
  sqlq(`UPDATE usuarios SET rol = 'administrador' WHERE id = '${admin.id}'`);
  return admin;
}

// Backend adicional contra la misma base, con otra configuración (se elimina al terminar).
async function conBackendAdicional({ nombre, puerto, env: variables }, fn) {
  sh(`docker rm -f ${nombre}`);
  const banderas = Object.entries(variables).map(([k, v]) => `-e ${k}=${v}`).join(' ');
  const run = dc(`run -d --no-deps --name ${nombre} ${banderas} -e PORT=4001 -p ${puerto}:4001 backend sh -c "exec node src/server.js"`);
  try {
    let listo = false;
    for (let i = 0; i < 40 && !listo; i += 1) {
      listo = await fetch(`http://localhost:${puerto}/api/health`).then((r) => r.status === 200).catch(() => false);
      if (!listo) await esperar(500);
    }
    return await fn({ iniciado: run.code === 0, listo, url: `http://localhost:${puerto}/api` });
  } finally {
    sh(`docker rm -f ${nombre}`);
  }
}
const llamarEn = async (url, metodo, ruta, token, cuerpo, cabeceras = {}) => {
  const res = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: { ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...cabeceras },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: res.status, datos: await res.json().catch(() => ({})) };
};

// ---------------------------------------------------------------------
// US-14 Cancelación de reserva propia
// ---------------------------------------------------------------------
await S.caso(
  { ...base, id: 'F-14-01', hu: 'US-14', ca: [2], grupo: 'US-14', titulo: 'Cancelar con más de 2 horas: estado "cancelada" y la franja queda disponible de inmediato', objetivo: 'Verificar que cancelar una reserva propia con anticipación cambia su estado y libera la franja para otros usuarios.', pasos: ['Crear una reserva futura.', 'PATCH /api/reservas/:id/cancelar con el dueño.', 'Consultar el estado en la base y la disponibilidad de esa fecha.', 'Otro usuario reserva la misma franja.'], esperado: '200 con reserva.estado "cancelada"; en la base estado = cancelada; la franja ya no figura como ocupada y otro usuario puede reservarla (201).' },
  async (c) => {
    const dueno = await crearUsuario('cancela');
    const otro = await crearUsuario('cancela2');
    const f = franja(10);
    const creada = await reservar(dueno, K0, f);
    c.verifica(creada.status === 201, 'Preparación: la reserva se crea (201)', `HTTP ${creada.status}`);
    const id = creada.datos.reserva.id;
    const antes = await disponibilidad(otro, K0, f.fecha);
    c.verifica(antes.datos.ocupados.some((o) => String(o.horaInicio).startsWith('10:00')), 'Antes de cancelar, la franja figura como ocupada');
    const r = await cancelarReserva(dueno, id);
    c.verifica(r.status === 200 && r.datos.reserva.estado === 'cancelada', 'Cancelar responde 200 con estado "cancelada"', `HTTP ${r.status} ${r.datos.reserva?.estado}`);
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE id='${id}'`) === 'cancelada', 'En la base la reserva quedó "cancelada"');
    const despues = await disponibilidad(otro, K0, f.fecha);
    c.verifica(!despues.datos.ocupados.some((o) => String(o.horaInicio).startsWith('10:00')), 'La franja ya no figura como ocupada (liberada de inmediato)');
    const re = await reservar(otro, K0, f);
    c.verifica(re.status === 201, 'Otro usuario reserva la misma franja: 201', `HTTP ${re.status}`);
    c.evidenciaTexto('Respuesta de PATCH /api/reservas/:id/cancelar', JSON.stringify(r.datos, null, 1));
  }
);

await S.caso(
  { ...base, id: 'F-14-02', hu: 'US-14', ca: [3], grupo: 'US-14', titulo: 'Menos de 2 horas: la cancelación se bloquea y se explica la restricción (caso de error)', objetivo: 'Verificar la regla de las 2 horas de anticipación, en el borde y en el historial.', pasos: ['Insertar una reserva que empieza en 90 minutos y otra que empieza en 180 minutos.', 'Cancelar la de 90 minutos.', 'Consultar el historial (puedeCancelar).', 'Cancelar la de 180 minutos.'], esperado: 'La de 90 min: 409 CANCELACION_FUERA_DE_PLAZO con mensaje que menciona 2 horas, sigue confirmada, el historial indica puedeCancelar=false. La de 180 min: 200.' },
  async (c) => {
    const u = await crearUsuario('plazo');
    const [idPronto] = insertarProntoLibre(u, [K1, K2, K0]);
    const [idLejos] = insertarProntoLibre(u, [K0, K1, K2], 150, 60);
    const r = await cancelarReserva(u, idPronto);
    c.verifica(r.status === 409 && r.datos.codigo === 'CANCELACION_FUERA_DE_PLAZO', 'Con 90 min de anticipación: 409 CANCELACION_FUERA_DE_PLAZO', `HTTP ${r.status} ${r.datos.codigo}`);
    c.verifica(/2 horas/.test(r.datos.mensaje), 'El mensaje explica la restricción de 2 horas', r.datos.mensaje);
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE id='${idPronto}'`) === 'confirmada', 'La reserva sigue confirmada');
    const h = await api('GET', '/reservas?periodo=proximas&limite=50', undefined, u.token);
    const porId = Object.fromEntries(h.datos.reservas.map((x) => [x.id, x]));
    c.verifica(porId[idPronto]?.puedeCancelar === false && porId[idLejos]?.puedeCancelar === true, 'El historial indica puedeCancelar=false (90 min) y true (180 min)', `${porId[idPronto]?.puedeCancelar} / ${porId[idLejos]?.puedeCancelar}`);
    const ok = await cancelarReserva(u, idLejos);
    c.verifica(ok.status === 200, 'Con 180 min de anticipación sí se cancela: 200', `HTTP ${ok.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-14-03', hu: 'US-14', ca: [4], grupo: 'US-14', titulo: 'Cancelar la reserva de otro usuario: 403 y sin cambios (caso de error)', objetivo: 'Verificar la propiedad de la reserva y los demás errores de la cancelación.', pasos: ['A crea una reserva.', 'B intenta cancelarla.', 'Cancelar sin token, con id inválido y con id inexistente.', 'A la cancela dos veces.'], esperado: 'B: 403 y la reserva sigue confirmada; sin token 401; id inválido 400; inexistente 404; la segunda cancelación de A responde 409.' },
  async (c) => {
    const A = await crearUsuario('propia');
    const B = await crearUsuario('ajena');
    const creada = await reservar(A, K0, franja(11));
    const id = creada.datos.reserva.id;
    const r = await cancelarReserva(B, id);
    c.verifica(r.status === 403, 'B recibe 403', `HTTP ${r.status}`);
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE id='${id}'`) === 'confirmada', 'La reserva de A no fue modificada');
    c.verifica((await api('PATCH', `/reservas/${id}/cancelar`)).status === 401, 'Sin token: 401');
    c.verifica((await cancelarReserva(A, 'no-es-uuid')).status === 400, 'Identificador inválido: 400');
    c.verifica((await cancelarReserva(A, UUID_INEXISTENTE)).status === 404, 'Reserva inexistente: 404');
    c.verifica((await cancelarReserva(A, id)).status === 200, 'A la cancela: 200');
    const dos = await cancelarReserva(A, id);
    c.verifica(dos.status === 409, 'Cancelarla otra vez: 409', `HTTP ${dos.status} ${dos.datos.mensaje}`);
  }
);

await S.caso(
  { ...base, id: 'F-14-04', hu: 'US-14', ca: [5], grupo: 'US-14', titulo: 'Al cancelar se envía el correo con el detalle de la reserva cancelada', objetivo: 'Verificar la notificación por correo (sin SMTP el entorno la deja en el log del backend) y que un fallo del correo no impide cancelar.', pasos: ['Crear y cancelar una reserva.', 'Buscar en los logs del backend el correo de cancelación.'], esperado: 'El log contiene el correo del usuario, el código, la cancha y el horario de la reserva cancelada.' },
  async (c) => {
    const u = await crearUsuario('correo');
    const creada = await reservar(u, K0, franja(12));
    const { codigo, cancha } = creada.datos.reserva;
    const r = await cancelarReserva(u, creada.datos.reserva.id);
    c.verifica(r.status === 200, 'La cancelación responde 200', `HTTP ${r.status}`);
    await esperar(800);
    const linea = logsBackend('5m').split('\n').find((l) => l.includes('Cancelación de reserva') && l.includes(u.correo));
    c.verifica(Boolean(linea), 'El backend registró el correo de cancelación para el usuario');
    c.verifica(linea?.includes(codigo) && linea.includes(cancha.nombre) && /12:00 - 13:00/.test(linea), 'El correo incluye código, cancha y horario', linea?.split('): ')[1]);
    c.evidenciaTexto('Línea del log (correo de cancelación)', linea ?? '(no encontrada)');
  }
);

await S.caso(
  { ...base, id: 'F-14-05', hu: 'US-14', hus: ['US-14', 'US-28'], ca: { 'US-14': [2], 'US-28': [4] }, grupo: 'US-14', titulo: 'Cancelar una reserva pagada con tarjeta reembolsa el pago', objetivo: 'Verificar el reembolso total automático al cancelar y que una reserva sin pago se cancela sin reembolso.', pasos: ['Guardar una tarjeta y reservar pagando con ella.', 'Cancelar la reserva.', 'Revisar el reembolso en la respuesta y en la tabla pagos.', 'Cancelar una reserva sin pago.'], esperado: 'La respuesta trae reembolso {estado "reembolsado", monto, marca, ultimos4}; el pago pasa a "reembolsado" con referencia ref_sim_; la reserva sin pago devuelve reembolso null.' },
  async (c) => {
    const u = await crearUsuario('reembolso');
    const tj = await guardarTarjeta(u);
    const pagada = await reservarHora(u, K0, fechaUnica(), '13', tj.datos.metodoPago.id);
    c.verifica(pagada.status === 201 && pagada.datos.reserva.pago?.estado === 'aprobado', 'Reserva pagada con la tarjeta: pago aprobado', `HTTP ${pagada.status}`);
    const r = await cancelarReserva(u, pagada.datos.reserva.id);
    c.verifica(r.status === 200 && r.datos.reembolso?.estado === 'reembolsado' && r.datos.reembolso.marca === 'Visa' && r.datos.reembolso.ultimos4 === '4242', 'La respuesta informa el reembolso a la Visa ••4242', JSON.stringify(r.datos.reembolso));
    const fila = sqlq(`SELECT estado || '|' || reembolso_referencia FROM pagos WHERE reserva_id='${pagada.datos.reserva.id}'`);
    c.verifica(/^reembolsado\|ref_sim_/.test(fila), 'En la tabla pagos queda "reembolsado" con referencia', fila);
    const sinPago = await reservarHora(u, K1, fechaUnica(), '14');
    const rs = await cancelarReserva(u, sinPago.datos.reserva.id);
    c.verifica(rs.status === 200 && rs.datos.reembolso === null, 'Una reserva sin pago se cancela sin reembolso', `HTTP ${rs.status}`);
  }
);

// ---------------------------------------------------------------------
// US-27 Perfil de usuario
// ---------------------------------------------------------------------
await S.caso(
  { ...base, id: 'F-27-01', hu: 'US-27', ca: [1], grupo: 'US-27', titulo: 'Mi perfil: datos actuales cargados y sin datos sensibles', objetivo: 'Verificar que el usuario ve su nombre, correo y teléfono, y que la respuesta no expone la contraseña.', pasos: ['Crear un usuario.', 'GET /api/usuarios/:id con su token.'], esperado: '200 con nombre, correo, teléfono y rol "usuario" correctos; sin contraseña ni hash.' },
  async (c) => {
    const u = await crearUsuario('perfil');
    const r = await api('GET', `/usuarios/${u.id}`, undefined, u.token);
    c.verifica(r.status === 200, 'Responde 200', `HTTP ${r.status}`);
    c.verifica(r.datos.usuario.nombre === u.nombre && r.datos.usuario.correo === u.correo && r.datos.usuario.telefono === '3001234567', 'Trae nombre, correo y teléfono actuales', JSON.stringify(r.datos.usuario));
    c.verifica(r.datos.usuario.rol === 'usuario' && r.datos.usuario.correoPendiente === null, 'Rol "usuario" y sin correo pendiente');
    c.verifica(!JSON.stringify(r.datos).match(/password|hash/i), 'No contiene contraseña ni hash');
    c.evidenciaTexto('Respuesta de GET /api/usuarios/:id', JSON.stringify(r.datos, null, 1));
  }
);

await S.caso(
  { ...base, id: 'F-27-02', hu: 'US-27', ca: [2], grupo: 'US-27', titulo: 'Editar nombre y teléfono válidos: se persisten', objetivo: 'Verificar la edición del perfil y la normalización del teléfono.', pasos: ['PATCH /api/usuarios/:id con nombre y teléfono válidos.', 'Consultar la base y volver a pedir el perfil.'], esperado: '200 con el mensaje de confirmación y los datos nuevos; la base y el GET posterior los reflejan.' },
  async (c) => {
    const u = await crearUsuario('editar');
    const r = await api('PATCH', `/usuarios/${u.id}`, { nombre: 'Ana María Pérez', telefono: '+57 310 999 8888' }, u.token);
    c.verifica(r.status === 200 && r.datos.usuario.nombre === 'Ana María Pérez' && r.datos.usuario.telefono === '+573109998888', 'Responde 200 con los datos nuevos (teléfono normalizado)', `HTTP ${r.status} ${JSON.stringify(r.datos.usuario)}`);
    c.verifica(Boolean(r.datos.mensaje), 'Incluye un mensaje de confirmación', r.datos.mensaje);
    c.verifica(sqlq(`SELECT nombre || '|' || telefono FROM usuarios WHERE id='${u.id}'`) === 'Ana María Pérez|+573109998888', 'Los cambios quedaron guardados en la base');
    const g = await api('GET', `/usuarios/${u.id}`, undefined, u.token);
    c.verifica(g.datos.usuario.nombre === 'Ana María Pérez', 'El perfil posterior muestra el nombre nuevo');
  }
);

await S.caso(
  { ...base, id: 'F-27-03', hu: 'US-27', ca: [3], grupo: 'US-27', titulo: 'Teléfono inválido o campo obligatorio vacío: errores por campo y sin guardar (caso de error)', objetivo: 'Verificar la validación del perfil.', pasos: ['PATCH con nombre vacío y teléfono "abc".', 'PATCH solo con teléfono inválido.', 'Consultar la base.'], esperado: '400 con la lista de errores por campo (nombre y telefono); la base conserva los datos originales.' },
  async (c) => {
    const u = await crearUsuario('invalido');
    const a = await api('PATCH', `/usuarios/${u.id}`, { nombre: '', telefono: 'abc' }, u.token);
    c.verifica(a.status === 400 && a.datos.errores.map((e) => e.campo).sort().join() === 'nombre,telefono', 'Nombre vacío y teléfono "abc": 400 con errores en nombre y telefono', `HTTP ${a.status} ${a.datos.errores?.map((e) => e.campo)}`);
    const b = await api('PATCH', `/usuarios/${u.id}`, { nombre: 'Nombre Válido', telefono: '12' }, u.token);
    c.verifica(b.status === 400 && b.datos.errores.map((e) => e.campo).join() === 'telefono', 'Solo el teléfono es inválido: el error señala "telefono"', `HTTP ${b.status}`);
    c.verifica(sqlq(`SELECT nombre || '|' || telefono FROM usuarios WHERE id='${u.id}'`) === `${u.nombre}|3001234567`, 'No se guardó nada: la base conserva los datos originales');
    c.evidenciaTexto('Respuesta 400 con errores por campo', JSON.stringify(a.datos, null, 1));
  }
);

await S.caso(
  { ...base, id: 'F-27-04', hu: 'US-27', ca: [4], grupo: 'US-27', titulo: 'Cambio de correo: se verifica el nuevo correo antes de aplicarse y no admite duplicados', objetivo: 'Verificar el flujo de cambio de correo con enlace de un solo uso.', pasos: ['Pedir cambiar a un correo ya registrado.', 'Pedir cambiar a un correo nuevo.', 'Comprobar que el correo no cambió y que hay un pendiente.', 'Abrir el enlace enviado al correo nuevo.', 'Reutilizar el enlace; probar un token inventado.', 'Iniciar sesión con el correo nuevo y con el anterior.'], esperado: 'Duplicado: 409. Solicitud: 202 y el correo sigue igual hasta verificar; en la base solo está el hash del token. Verificar: 200 y el correo cambia; el enlace no sirve dos veces ni inventado; el login funciona solo con el correo nuevo.' },
  async (c) => {
    const u = await crearUsuario('correo-nuevo');
    const otro = await crearUsuario('correo-ocupado');
    const dup = await api('POST', `/usuarios/${u.id}/correo`, { nuevoCorreo: otro.correo }, u.token);
    c.verifica(dup.status === 409, 'Un correo de otra cuenta se rechaza: 409', `HTTP ${dup.status}`);
    const nuevo = `nuevo.${Date.now()}@qa.local`;
    const sol = await api('POST', `/usuarios/${u.id}/correo`, { nuevoCorreo: nuevo }, u.token, { Origin: CFG.WEB });
    c.verifica(sol.status === 202, 'Solicitar el cambio: 202', `HTTP ${sol.status}`);
    c.verifica(sqlq(`SELECT correo FROM usuarios WHERE id='${u.id}'`) === u.correo, 'Mientras no se verifique, el correo de la cuenta NO cambia');
    const perfil = await api('GET', `/usuarios/${u.id}`, undefined, u.token);
    c.verifica(perfil.datos.usuario.correoPendiente === nuevo, 'El perfil muestra el correo pendiente de verificación', perfil.datos.usuario.correoPendiente);
    await esperar(600);
    const enlace = obtenerEnlaceDeLogs(nuevo);
    c.verifica(Boolean(enlace) && enlace.startsWith(`${CFG.WEB}/verificar-correo?token=`), 'El enlace se envía al correo NUEVO y apunta al frontend', enlace?.replace(/token=.*/, 'token=…'));
    const token = new URL(enlace).searchParams.get('token');
    c.verifica(sqlq(`SELECT token_hash FROM cambios_correo WHERE usuario_id='${u.id}' AND used_at IS NULL`) !== token, 'En la base se guarda solo el hash del token, no el token');
    const ok = await api('POST', '/auth/verificar-correo', { token });
    c.verifica(ok.status === 200 && ok.datos.correo === nuevo, 'Abrir el enlace aplica el cambio: 200', `HTTP ${ok.status}`);
    c.verifica(sqlq(`SELECT correo FROM usuarios WHERE id='${u.id}'`) === nuevo, 'Ahora el correo de la cuenta es el nuevo');
    c.verifica((await api('POST', '/auth/verificar-correo', { token })).status === 400, 'El enlace no se puede reutilizar: 400');
    c.verifica((await api('POST', '/auth/verificar-correo', { token: 'inventado' })).status === 400, 'Un token inventado: 400');
    const conNuevo = await api('POST', '/auth/login', { correo: nuevo, password: CFG.password });
    const conViejo = await api('POST', '/auth/login', { correo: u.correo, password: CFG.password });
    c.verifica(conNuevo.status === 200 && conViejo.status === 401, 'El login funciona con el correo nuevo y ya no con el anterior', `${conNuevo.status} / ${conViejo.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-27-05', hu: 'US-27', ca: [5], grupo: 'US-27', titulo: 'Cambio de contraseña: exige la actual y una nueva que cumpla las reglas', objetivo: 'Verificar el cambio de contraseña y sus rechazos.', pasos: ['PATCH /password con la actual incorrecta.', 'PATCH con una nueva débil.', 'PATCH con datos correctos.', 'Iniciar sesión con la nueva y con la anterior.'], esperado: 'Actual incorrecta: 400 PASSWORD_ACTUAL_INCORRECTA; débil: 400; correcta: 200; login con la nueva 200 y con la anterior 401.' },
  async (c) => {
    const u = await crearUsuario('clave');
    const mala = await api('PATCH', `/usuarios/${u.id}/password`, { passwordActual: 'Equivocada1', nuevaPassword: 'NuevaClave456' }, u.token);
    c.verifica(mala.status === 400 && mala.datos.codigo === 'PASSWORD_ACTUAL_INCORRECTA', 'Contraseña actual incorrecta: 400 PASSWORD_ACTUAL_INCORRECTA', `HTTP ${mala.status} ${mala.datos.codigo}`);
    const debil = await api('PATCH', `/usuarios/${u.id}/password`, { passwordActual: CFG.password, nuevaPassword: 'corta' }, u.token);
    c.verifica(debil.status === 400, 'Nueva contraseña que incumple las reglas: 400', `HTTP ${debil.status}`);
    const sinActual = await api('PATCH', `/usuarios/${u.id}/password`, { nuevaPassword: 'NuevaClave456' }, u.token);
    c.verifica(sinActual.status === 400, 'Sin la contraseña actual: 400', `HTTP ${sinActual.status}`);
    const ok = await api('PATCH', `/usuarios/${u.id}/password`, { passwordActual: CFG.password, nuevaPassword: 'NuevaClave456' }, u.token);
    c.verifica(ok.status === 200, 'Con la actual y una nueva válida: 200', `HTTP ${ok.status}`);
    const hash = sqlq(`SELECT password_hash FROM usuarios WHERE id='${u.id}'`);
    c.verifica(/^\$2[aby]\$/.test(hash), 'La nueva contraseña queda cifrada con bcrypt');
    const a = await api('POST', '/auth/login', { correo: u.correo, password: 'NuevaClave456' });
    const b = await api('POST', '/auth/login', { correo: u.correo, password: CFG.password });
    c.verifica(a.status === 200 && b.status === 401, 'Login con la nueva 200 y con la anterior 401', `${a.status} / ${b.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-27-06', hu: 'US-27', ca: [6], grupo: 'US-27', titulo: 'Solo el propietario ve y edita su perfil: lo de otro usuario responde 403 (caso de error)', objetivo: 'Verificar la propiedad del perfil en todas sus rutas y que no se filtran datos.', pasos: ['A intenta GET, PATCH, cambio de contraseña y de correo sobre el perfil de B.', 'Repetir sin token.', 'Consultar la base.'], esperado: '403 en las cuatro rutas, sin datos de B en la respuesta y sin cambios en la base; sin token 401.' },
  async (c) => {
    const A = await crearUsuario('intruso');
    const B = await crearUsuario('victima');
    const intentos = [
      ['GET', `/usuarios/${B.id}`, undefined],
      ['PATCH', `/usuarios/${B.id}`, { nombre: 'Hackeado', telefono: '3009999999' }],
      ['PATCH', `/usuarios/${B.id}/password`, { passwordActual: CFG.password, nuevaPassword: 'Hackeada123' }],
      ['POST', `/usuarios/${B.id}/correo`, { nuevoCorreo: 'hack@qa.local' }],
    ];
    for (const [metodo, ruta, cuerpo] of intentos) {
      const r = await api(metodo, ruta, cuerpo, A.token);
      c.verifica(r.status === 403 && !JSON.stringify(r.datos).includes(B.correo), `${metodo} ${ruta.replace(B.id, ':id')} → 403 sin datos ajenos`, `HTTP ${r.status}`);
    }
    c.verifica(sqlq(`SELECT nombre || '|' || correo FROM usuarios WHERE id='${B.id}'`) === `${B.nombre}|${B.correo}`, 'El perfil de B no se modificó');
    c.verifica((await api('POST', '/auth/login', { correo: B.correo, password: CFG.password })).status === 200, 'B sigue entrando con su contraseña original');
    c.verifica((await api('GET', `/usuarios/${B.id}`)).status === 401, 'Sin token: 401');
  }
);

await S.caso(
  { ...base, id: 'F-27-07', hu: 'US-27', ca: [5], grupo: 'US-27', prioridad: 'Media', titulo: 'Freno a los intentos fallidos de cambio de contraseña (429)', objetivo: 'Verificar que no se puede adivinar la contraseña actual con intentos repetidos.', pasos: ['Enviar 10 intentos con la contraseña actual incorrecta.', 'Enviar un 11.º intento, esta vez con la contraseña correcta.'], esperado: 'Los 10 primeros responden 400; el 11.º responde 429 DEMASIADOS_INTENTOS aunque la clave sea correcta.' },
  async (c) => {
    const u = await crearUsuario('freno');
    const estados = [];
    for (let i = 0; i < 10; i += 1) estados.push((await api('PATCH', `/usuarios/${u.id}/password`, { passwordActual: 'Equivocada1', nuevaPassword: 'NuevaClave456' }, u.token)).status);
    c.verifica(estados.every((s) => s === 400), 'Los 10 intentos fallidos responden 400', estados.join(','));
    const bloqueado = await api('PATCH', `/usuarios/${u.id}/password`, { passwordActual: CFG.password, nuevaPassword: 'NuevaClave456' }, u.token);
    c.verifica(bloqueado.status === 429 && bloqueado.datos.codigo === 'DEMASIADOS_INTENTOS', 'El intento 11 queda bloqueado: 429 DEMASIADOS_INTENTOS', `HTTP ${bloqueado.status} ${bloqueado.datos.codigo}`);
  }
);

// ---------------------------------------------------------------------
// US-28 Método de pago con tarjeta
// ---------------------------------------------------------------------
await S.caso(
  { ...base, id: 'F-28-01', hu: 'US-28', ca: [1, 3], grupo: 'US-28', titulo: 'Agregar tarjeta válida: se muestra enmascarada y solo se guarda el token', objetivo: 'Verificar el registro de una tarjeta, su enmascarado y que la base nunca guarda el número completo ni el CVV.', pasos: ['POST /api/usuarios/:id/metodos-pago con una Visa de prueba válida.', 'GET del listado.', 'Inspeccionar la fila guardada en metodos_pago.'], esperado: '201 con marca "Visa", últimos 4 "4242" y vencimiento; la fila tiene token tok_sim_… y no contiene el número completo ni existe columna cvv; la API nunca devuelve el token.' },
  async (c) => {
    const u = await crearUsuario('tarjeta');
    const r = await guardarTarjeta(u);
    c.verifica(r.status === 201 && r.datos.metodoPago.marca === 'Visa' && r.datos.metodoPago.ultimos4 === '4242' && r.datos.metodoPago.vencimiento === `12/${String(ANIO_TARJETA).slice(-2)}`, 'Responde 201 con tarjeta enmascarada (Visa ••4242)', JSON.stringify(r.datos.metodoPago));
    c.verifica(!JSON.stringify(r.datos).includes('tok_sim') && !JSON.stringify(r.datos).includes('4242424242424242'), 'La respuesta no expone el token ni el número completo');
    const fila = sqlq(`SELECT row_to_json(m) FROM metodos_pago m WHERE id='${r.datos.metodoPago.id}'`);
    c.verifica(/"token":"tok_sim_/.test(fila), 'Se guardó el token de la pasarela', fila.match(/"token":"[^"]{0,24}/)?.[0]);
    c.verifica(!fila.includes('4242424242424242') && !fila.includes('4242 4242 4242 4242') && !/cvv/i.test(fila), 'La fila NO contiene el número completo ni el CVV');
    const cols = sqlq(`SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name='metodos_pago'`);
    c.verifica(!/cvv|numero/.test(cols), 'La tabla ni siquiera tiene columnas para el CVV o el número', cols);
    const lista = await api('GET', `/usuarios/${u.id}/metodos-pago`, undefined, u.token);
    c.verifica(lista.status === 200 && lista.datos.metodosPago.length === 1 && !JSON.stringify(lista.datos).includes('tok_sim'), 'El listado muestra la tarjeta enmascarada y sin token');
    c.evidenciaTexto('Fila guardada en metodos_pago', fila);
  }
);

await S.caso(
  { ...base, id: 'F-28-02', hu: 'US-28', ca: [2], grupo: 'US-28', titulo: 'Tarjeta inválida (Luhn, vencida, CVV): se rechaza sin exponer datos (caso de error)', objetivo: 'Verificar las validaciones de la tarjeta y que ningún dato sensible aparece en el error.', pasos: ['Enviar un número que no pasa Luhn.', 'Enviar una tarjeta vencida.', 'Enviar un CVV de longitud incorrecta.', 'Enviar un cuerpo vacío.'], esperado: '400 con el campo erróneo (numero, vencimientoAnio, cvv); la respuesta no repite el número ni el CVV; no se guarda ninguna fila.' },
  async (c) => {
    const u = await crearUsuario('tarjeta-mala');
    const casos = [
      ['número que no pasa Luhn', { numero: '4242 4242 4242 4241' }, 'numero', '4241'],
      ['tarjeta vencida', { vencimientoMes: 1, vencimientoAnio: 2020 }, 'vencimientoAnio', null],
      ['CVV incorrecto', { cvv: '12' }, 'cvv', null],
    ];
    for (const [nombre, extra, campo, fragmento] of casos) {
      const r = await guardarTarjeta(u, extra);
      const texto = JSON.stringify(r.datos);
      c.verifica(r.status === 400 && r.datos.errores?.some((e) => e.campo === campo), `${nombre}: 400 señalando "${campo}"`, `HTTP ${r.status}`);
      c.verifica(!texto.includes('"123"') && !(fragmento && texto.includes(fragmento)), `${nombre}: el error no repite datos sensibles`);
    }
    const vacio = await api('POST', `/usuarios/${u.id}/metodos-pago`, {}, u.token);
    c.verifica(vacio.status === 400, 'Cuerpo vacío: 400', `HTTP ${vacio.status}`);
    c.verifica(sqlq(`SELECT count(*) FROM metodos_pago WHERE usuario_id='${u.id}'`) === '0', 'No se guardó ninguna tarjeta');
  }
);

await S.caso(
  { ...base, id: 'F-28-03', hu: 'US-28', ca: [4], grupo: 'US-28', titulo: 'Reservar pagando con la tarjeta guardada: el cobro se procesa por la pasarela', objetivo: 'Verificar el pago opcional al confirmar una reserva y que sin tarjeta la reserva también se confirma.', pasos: ['Guardar una tarjeta.', 'Reservar enviando metodoPagoId.', 'Revisar la tabla pagos y el historial.', 'Reservar sin metodoPagoId.'], esperado: '201 con reserva.pago {aprobado, monto = costo de la cancha, COP, Visa, 4242}; una fila en pagos; el historial muestra el pago; sin tarjeta 201 con pago null.' },
  async (c) => {
    const u = await crearUsuario('paga');
    const tj = (await guardarTarjeta(u)).datos.metodoPago;
    const r = await reservarHora(u, K0, fechaUnica(), '15', tj.id);
    const costo = Number(sqlq(`SELECT costo_hora FROM canchas WHERE id='${K0.id}'`));
    c.verifica(r.status === 201 && r.datos.reserva.estado === 'confirmada', 'La reserva se confirma: 201', `HTTP ${r.status}`);
    c.verifica(r.datos.reserva.pago?.estado === 'aprobado' && r.datos.reserva.pago.monto === costo && r.datos.reserva.pago.moneda === 'COP' && r.datos.reserva.pago.marca === 'Visa', 'El pago aparece aprobado por el costo de la cancha', JSON.stringify(r.datos.reserva.pago));
    c.verifica(sqlq(`SELECT count(*) FROM pagos WHERE reserva_id='${r.datos.reserva.id}' AND estado='aprobado'`) === '1', 'Hay exactamente un pago aprobado en la base');
    const h = await api('GET', '/reservas?limite=50', undefined, u.token);
    c.verifica(h.datos.reservas.find((x) => x.id === r.datos.reserva.id)?.pago?.ultimos4 === '4242', 'El historial muestra el pago de la reserva');
    const sin = await reservarHora(u, K1, fechaUnica(), '15');
    c.verifica(sin.status === 201 && sin.datos.reserva.pago === null, 'Sin método de pago la reserva se confirma igual (pago opcional)', `HTTP ${sin.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-28-04', hu: 'US-28', ca: [6], grupo: 'US-28', titulo: 'Pago rechazado: la reserva NO se confirma y se informa el motivo (caso de error)', objetivo: 'Verificar el rechazo del cobro (tarjeta rechazada y fondos insuficientes) y que la franja sigue libre.', pasos: ['Guardar la tarjeta de prueba rechazada (…0002) y reservar con ella.', 'Repetir con la de fondos insuficientes (…9995).', 'Consultar la base y reservar la misma franja sin pagar.'], esperado: '402 PAGO_RECHAZADO con el motivo en el mensaje; no queda reserva ni pago aprobado; la franja se puede reservar después.' },
  async (c) => {
    const u = await crearUsuario('rechazo');
    const f = franja(16);
    for (const [numero, motivo] of [['4000 0000 0000 0002', /rechazada/i], ['4000 0000 0000 9995', /fondos insuficientes/i]]) {
      const tj = (await guardarTarjeta(u, { numero })).datos.metodoPago;
      const r = await api('POST', `/canchas/${K0.id}/reservas`, { ...f, metodoPagoId: tj.id }, u.token);
      c.verifica(r.status === 402 && r.datos.codigo === 'PAGO_RECHAZADO' && motivo.test(r.datos.mensaje), `Tarjeta …${numero.slice(-4)}: 402 PAGO_RECHAZADO con el motivo`, `HTTP ${r.status} ${r.datos.mensaje}`);
    }
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE usuario_id='${u.id}'`) === '0', 'No quedó ninguna reserva confirmada');
    c.verifica(sqlq(`SELECT count(*) FROM pagos WHERE usuario_id='${u.id}' AND estado='aprobado'`) === '0', 'No quedó ningún pago aprobado');
    const sin = await reservar(u, K0, f);
    c.verifica(sin.status === 201, 'La franja quedó libre: se puede reservar sin pagar (201)', `HTTP ${sin.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-28-05', hu: 'US-28', ca: [5], grupo: 'US-28', titulo: 'Eliminar la tarjeta: se borra el token y las reservas pagadas no se afectan', objetivo: 'Verificar la baja de la tarjeta y que el historial de pagos se conserva.', pasos: ['Guardar una tarjeta y pagar una reserva con ella.', 'DELETE de la tarjeta.', 'Revisar el listado, la tabla metodos_pago y la reserva pagada.', 'Intentar pagar con la tarjeta eliminada.'], esperado: '200; la fila (y su token) desaparece de metodos_pago y del listado; la reserva sigue confirmada y su pago aprobado con marca y últimos 4; pagar con la tarjeta eliminada responde 404.' },
  async (c) => {
    const u = await crearUsuario('baja');
    const tj = (await guardarTarjeta(u, { numero: '3782 822463 10005', cvv: '1234' })).datos.metodoPago;
    const pagada = await reservarHora(u, K0, fechaUnica(), '17', tj.id);
    c.verifica(pagada.status === 201 && pagada.datos.reserva.pago.marca === 'American Express', 'Reserva pagada con una American Express', `HTTP ${pagada.status}`);
    const del = await api('DELETE', `/usuarios/${u.id}/metodos-pago/${tj.id}`, undefined, u.token);
    c.verifica(del.status === 200, 'Eliminar la tarjeta: 200', `HTTP ${del.status}`);
    c.verifica(sqlq(`SELECT count(*) FROM metodos_pago WHERE id='${tj.id}'`) === '0', 'La fila con el token se borró de la base');
    const lista = await api('GET', `/usuarios/${u.id}/metodos-pago`, undefined, u.token);
    c.verifica(lista.datos.metodosPago.length === 0, 'Ya no aparece como opción de pago');
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE id='${pagada.datos.reserva.id}'`) === 'confirmada', 'La reserva ya pagada sigue confirmada');
    c.verifica(sqlq(`SELECT estado || '|' || marca || '|' || ultimos4 FROM pagos WHERE reserva_id='${pagada.datos.reserva.id}'`) === 'aprobado|American Express|0005', 'Su pago se conserva (aprobado, American Express ••0005)');
    const otra = await reservarHora(u, K1, fechaUnica(), '17', tj.id);
    c.verifica(otra.status === 404, 'Pagar con la tarjeta eliminada: 404', `HTTP ${otra.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-28-06', hu: 'US-28', ca: [7], grupo: 'US-28', titulo: 'Solo el propietario ve y gestiona sus métodos de pago (caso de error)', objetivo: 'Verificar que las tarjetas de un usuario no son visibles ni usables por otro.', pasos: ['B intenta ver, agregar y eliminar tarjetas de A.', 'B intenta pagar una reserva con la tarjeta de A.', 'Peticiones sin token.'], esperado: 'Ver y agregar sobre otro usuario: 403; eliminar la tarjeta de A desde la cuenta de B: 404 y la tarjeta sigue existiendo; pagar con la tarjeta ajena: 404 sin reserva; sin token 401.' },
  async (c) => {
    const A = await crearUsuario('duena');
    const B = await crearUsuario('curioso');
    const tj = (await guardarTarjeta(A, { numero: '5555 5555 5555 4444' })).datos.metodoPago;
    c.verifica((await api('GET', `/usuarios/${A.id}/metodos-pago`, undefined, B.token)).status === 403, 'Ver las tarjetas de A: 403');
    c.verifica((await api('POST', `/usuarios/${A.id}/metodos-pago`, tarjeta(), B.token)).status === 403, 'Agregar una tarjeta a la cuenta de A: 403');
    c.verifica((await api('DELETE', `/usuarios/${B.id}/metodos-pago/${tj.id}`, undefined, B.token)).status === 404, 'Eliminar la tarjeta de A usando la cuenta de B: 404');
    c.verifica(sqlq(`SELECT count(*) FROM metodos_pago WHERE id='${tj.id}'`) === '1', 'La tarjeta de A sigue existiendo');
    const pago = await reservarHora(B, K0, fechaUnica(), '18', tj.id);
    c.verifica(pago.status === 404, 'Pagar con la tarjeta de A: 404', `HTTP ${pago.status}`);
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE usuario_id='${B.id}'`) === '0', 'No se creó ninguna reserva ni cobro');
    c.verifica((await api('GET', `/usuarios/${A.id}/metodos-pago`)).status === 401, 'Sin token: 401');
  }
);

await S.caso(
  { ...base, id: 'F-28-08', hu: 'US-28', ca: [1], grupo: 'US-28', prioridad: 'Media', titulo: 'Máximo de 5 tarjetas guardadas por usuario (caso de error)', objetivo: 'Verificar el tope de tarjetas por cuenta y que eliminar una libera el cupo.', pasos: ['Guardar 5 tarjetas distintas.', 'Intentar guardar una sexta.', 'Eliminar una y volver a intentar.'], esperado: 'Las 5 primeras responden 201; la sexta 409 LIMITE_TARJETAS sin guardarse; tras eliminar una, la nueva se acepta.' },
  async (c) => {
    const u = await crearUsuario('maxtarjetas');
    const numeros = ['4242 4242 4242 4242', '5555 5555 5555 4444', '3782 822463 10005', '6011 1111 1111 1117', '4012 8888 8888 1881'];
    const guardadas = [];
    for (const numero of numeros) guardadas.push(await guardarTarjeta(u, { numero, cvv: numero.startsWith('3782') ? '1234' : '123' }));
    c.verifica(guardadas.every((r) => r.status === 201), 'Las 5 primeras tarjetas se guardan: 201', guardadas.map((r) => r.status).join(', '));
    const sexta = await guardarTarjeta(u, { numero: '4000 0566 5566 5556' });
    c.verifica(sexta.status === 409 && sexta.datos.codigo === 'LIMITE_TARJETAS', 'La sexta: 409 LIMITE_TARJETAS', `HTTP ${sexta.status} ${sexta.datos.codigo}`);
    c.verifica(sqlq(`SELECT count(*) FROM metodos_pago WHERE usuario_id='${u.id}'`) === '5', 'En la base siguen 5 tarjetas');
    await api('DELETE', `/usuarios/${u.id}/metodos-pago/${guardadas[0].datos.metodoPago.id}`, undefined, u.token);
    const otra = await guardarTarjeta(u, { numero: '4000 0566 5566 5556' });
    c.verifica(otra.status === 201, 'Tras eliminar una, la nueva se acepta: 201', `HTTP ${otra.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-28-07', hu: 'US-28', ca: [7], grupo: 'US-28', prioridad: 'Alta', titulo: 'HTTPS obligatorio en las rutas de tarjetas (426 si la conexión no es segura)', objetivo: 'Verificar la exigencia de HTTPS con EXIGIR_HTTPS_PAGOS=true, detrás de un proxy de confianza y sin él.', pasos: ['Levantar un backend con EXIGIR_HTTPS_PAGOS=true y TRUST_PROXY=true y otro con TRUST_PROXY=false.', 'Pedir las rutas de tarjetas por HTTP simple.', 'Repetir con la cabecera X-Forwarded-Proto: https.'], esperado: 'Por HTTP: 426 HTTPS_REQUERIDO en GET, POST y DELETE sin procesar la tarjeta. Con proxy de confianza y X-Forwarded-Proto https: se acepta (201/200). Sin TRUST_PROXY la cabecera se ignora y sigue el 426.' },
  async (c) => {
    const u = await crearUsuario('https');
    const ruta = `/usuarios/${u.id}/metodos-pago`;
    await conBackendAdicional({ nombre: 'qa-backend-https', puerto: 4303, env: { EXIGIR_HTTPS_PAGOS: 'true', TRUST_PROXY: 'true' } }, async (b) => {
      c.verifica(b.iniciado && b.listo, 'Backend con HTTPS obligatorio y proxy de confianza iniciado');
      const get = await llamarEn(b.url, 'GET', ruta, u.token);
      const post = await llamarEn(b.url, 'POST', ruta, u.token, tarjeta());
      const del = await llamarEn(b.url, 'DELETE', `${ruta}/${UUID_INEXISTENTE}`, u.token);
      c.verifica([get, post, del].every((r) => r.status === 426 && r.datos.codigo === 'HTTPS_REQUERIDO'), 'Por HTTP simple, GET/POST/DELETE responden 426 HTTPS_REQUERIDO', [get, post, del].map((r) => r.status).join(', '));
      c.verifica(sqlq(`SELECT count(*) FROM metodos_pago WHERE usuario_id='${u.id}'`) === '0', 'La tarjeta enviada por HTTP no se procesó ni se guardó');
      const seguro = { 'X-Forwarded-Proto': 'https' };
      const ok = await llamarEn(b.url, 'POST', ruta, u.token, tarjeta(), seguro);
      c.verifica(ok.status === 201, 'Con X-Forwarded-Proto: https de un proxy de confianza, se acepta: 201', `HTTP ${ok.status}`);
      c.verifica((await llamarEn(b.url, 'GET', ruta, u.token, undefined, seguro)).status === 200, 'Y el listado responde 200');
    });
    await conBackendAdicional({ nombre: 'qa-backend-https2', puerto: 4304, env: { EXIGIR_HTTPS_PAGOS: 'true', TRUST_PROXY: 'false' } }, async (b) => {
      c.verifica(b.iniciado && b.listo, 'Backend con HTTPS obligatorio SIN proxy de confianza iniciado');
      const falsa = await llamarEn(b.url, 'GET', ruta, u.token, undefined, { 'X-Forwarded-Proto': 'https' });
      c.verifica(falsa.status === 426, 'Sin TRUST_PROXY la cabecera X-Forwarded-Proto se ignora (no se puede falsificar): 426', `HTTP ${falsa.status}`);
    });
  }
);

// ---------------------------------------------------------------------
// US-29 Verificación de código de reserva (administrador)
// ---------------------------------------------------------------------
const ADMIN = await crearAdministrador('admin-qa');

await S.caso(
  { ...base, id: 'F-29-01', hu: 'US-29', ca: [6], grupo: 'US-29', titulo: 'Cada reserva genera un código único que el usuario ve al reservar y en su historial', objetivo: 'Verificar el formato y la unicidad del código y que es el mismo en la confirmación y en el historial.', pasos: ['Crear varias reservas (usuarios distintos).', 'Comparar el código de la confirmación con el del historial.', 'Revisar el índice único en la base.'], esperado: 'Códigos con formato CY-XXXXXXXX, todos distintos, iguales en confirmación e historial; existe un índice único sobre reservas.codigo.' },
  async (c) => {
    const u = await crearUsuario('codigo');
    const creadas = [];
    for (const h of ['08', '09', '10']) creadas.push((await reservarHora(u, K0, fechaUnica(), h)).datos.reserva);
    const codigos = creadas.map((x) => x.codigo);
    c.verifica(codigos.every((x) => /^CY-[0-9A-F]{8}$/.test(x)), 'Todos tienen el formato CY-XXXXXXXX', codigos.join(', '));
    c.verifica(new Set(codigos).size === codigos.length, 'Son todos distintos');
    const h = await api('GET', '/reservas?limite=50', undefined, u.token);
    c.verifica(creadas.every((x) => h.datos.reservas.find((y) => y.id === x.id)?.codigo === x.codigo), 'El historial muestra el mismo código que la confirmación');
    const indice = sqlq(`SELECT indexdef FROM pg_indexes WHERE indexname='uq_reservas_codigo'`);
    c.verifica(/UNIQUE/.test(indice), 'Existe el índice único uq_reservas_codigo en la base', indice.slice(0, 90));
  }
);

await S.caso(
  { ...base, id: 'F-29-02', hu: 'US-29', ca: [1, 2], grupo: 'US-29', titulo: 'Código de una reserva confirmada y no vencida: "Vigente" con cancha, fecha, horario y usuario', objetivo: 'Verificar la consulta del administrador de una reserva vigente (acepta minúsculas) y que no filtra datos de contacto.', pasos: ['Crear una reserva futura.', 'POST /api/admin/reservas/verificar con el código (también en minúsculas).'], esperado: '200 con estado "vigente", motivo null y la reserva con código, cancha, fecha, horario y nombre del usuario; sin correo ni teléfono.' },
  async (c) => {
    const u = await crearUsuario('vigente');
    const f = franja(9);
    const { reserva } = (await reservar(u, K0, f)).datos;
    const r = await verificarCodigo(ADMIN, reserva.codigo.toLowerCase());
    c.verifica(r.status === 200 && r.datos.estado === 'vigente' && r.datos.motivo === null, 'Estado "vigente" sin motivo', `HTTP ${r.status} ${r.datos.estado}`);
    const x = r.datos.reserva;
    c.verifica(x.codigo === reserva.codigo && x.cancha.nombre === K0.nombre && x.fecha === f.fecha && x.horaInicio === '09:00' && x.usuario.nombre === u.nombre, 'Muestra cancha, fecha, horario y nombre del usuario', JSON.stringify(x));
    c.verifica(!JSON.stringify(r.datos).includes(u.correo) && !JSON.stringify(r.datos).includes('3001234567'), 'No expone el correo ni el teléfono del usuario');
    c.evidenciaTexto('Respuesta de POST /api/admin/reservas/verificar', JSON.stringify(r.datos, null, 1));
  }
);

await S.caso(
  { ...base, id: 'F-29-03', hu: 'US-29', ca: [3], grupo: 'US-29', titulo: 'Reserva cancelada, vencida o usada: "No vigente" con el motivo', objetivo: 'Verificar los tres motivos de no vigencia.', pasos: ['Cancelar una reserva y verificar su código.', 'Insertar una reserva de una fecha pasada y verificar su código.', 'Marcar una reserva como utilizada y verificar su código.'], esperado: 'estado "no_vigente" con motivo "cancelada", "vencida" y "usada" respectivamente.' },
  async (c) => {
    const u = await crearUsuario('novigente');
    const cancelada = (await reservar(u, K0, franja(11))).datos.reserva;
    await cancelarReserva(u, cancelada.id);
    const r1 = await verificarCodigo(ADMIN, cancelada.codigo);
    c.verifica(r1.datos.estado === 'no_vigente' && r1.datos.motivo === 'cancelada', 'Cancelada → no_vigente por "cancelada"', `${r1.datos.estado}/${r1.datos.motivo}`);
    const [, codigoVencida] = insertarReservaSql(u, K1, fechaPasadaUnica(), '10:00', '11:00');
    const r2 = await verificarCodigo(ADMIN, codigoVencida);
    c.verifica(r2.datos.estado === 'no_vigente' && r2.datos.motivo === 'vencida', 'Vencida → no_vigente por "vencida"', `${r2.datos.estado}/${r2.datos.motivo}`);
    const usada = (await reservar(u, K2, franja(12))).datos.reserva;
    await usarCodigo(ADMIN, usada.codigo);
    const r3 = await verificarCodigo(ADMIN, usada.codigo);
    c.verifica(r3.datos.estado === 'no_vigente' && r3.datos.motivo === 'usada', 'Utilizada → no_vigente por "usada"', `${r3.datos.estado}/${r3.datos.motivo}`);
  }
);

await S.caso(
  { ...base, id: 'F-29-04', hu: 'US-29', ca: [4], grupo: 'US-29', titulo: 'Código inexistente o con formato inválido: "Código no encontrado" sin revelar nada (caso de error)', objetivo: 'Verificar que todo código desconocido recibe la misma respuesta neutra, incluidos intentos de inyección.', pasos: ['Verificar CY-00000000, CY-ZZZZZZZZ, "abc", un intento de inyección SQL y un código corto.', 'Verificar sin el campo código.'], esperado: '404 con {mensaje: "Código no encontrado", codigo: "CODIGO_NO_ENCONTRADO"} idéntico en todos los casos.' },
  async (c) => {
    for (const codigo of ['CY-00000000', 'CY-ZZZZZZZZ', 'abc', "' OR 1=1 --", 'CY-1234']) {
      const r = await verificarCodigo(ADMIN, codigo);
      c.verifica(r.status === 404 && r.datos.mensaje === 'Código no encontrado' && r.datos.codigo === 'CODIGO_NO_ENCONTRADO' && Object.keys(r.datos).length === 2, `"${codigo}" → 404 "Código no encontrado"`, `HTTP ${r.status}`);
    }
    const sin = await api('POST', '/admin/reservas/verificar', {}, ADMIN.token);
    c.verifica(sin.status === 400 || sin.status === 404, 'Sin el campo código la petición se rechaza', `HTTP ${sin.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-29-05', hu: 'US-29', ca: [5], grupo: 'US-29', titulo: 'Marcar como utilizada: el código no vuelve a validarse como vigente', objetivo: 'Verificar que una reserva vigente se puede usar una sola vez, incluso con dos administradores a la vez.', pasos: ['Verificar una reserva vigente.', 'Marcarla como utilizada.', 'Verificarla otra vez e intentar marcarla de nuevo.', 'Dos marcados simultáneos sobre otra reserva.'], esperado: 'Primero "vigente"; al marcar 200 y luego "no_vigente/usada"; marcar otra vez 409 RESERVA_NO_VIGENTE; con dos simultáneos exactamente uno obtiene 200 y el otro 409.' },
  async (c) => {
    const u = await crearUsuario('usar');
    const { reserva } = (await reservar(u, K0, franja(13))).datos;
    c.verifica((await verificarCodigo(ADMIN, reserva.codigo)).datos.estado === 'vigente', 'Antes de usarla: "vigente"');
    const m = await usarCodigo(ADMIN, reserva.codigo);
    c.verifica(m.status === 200 && m.datos.motivo === 'usada', 'Marcarla como utilizada: 200', `HTTP ${m.status}`);
    const v = await verificarCodigo(ADMIN, reserva.codigo);
    c.verifica(v.datos.estado === 'no_vigente' && v.datos.motivo === 'usada', 'Después: "no_vigente" por "usada"');
    const otra = await usarCodigo(ADMIN, reserva.codigo);
    c.verifica(otra.status === 409 && otra.datos.codigo === 'RESERVA_NO_VIGENTE', 'Marcarla otra vez: 409 RESERVA_NO_VIGENTE', `HTTP ${otra.status}`);
    const { reserva: r2 } = (await reservar(u, K1, franja(13))).datos;
    const [a, b] = await Promise.all([usarCodigo(ADMIN, r2.codigo), usarCodigo(ADMIN, r2.codigo)]);
    c.verifica([a.status, b.status].sort().join() === '200,409', 'Dos marcados simultáneos: solo uno lo logra (200 y 409)', `${a.status}, ${b.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-29-06', hu: 'US-29', ca: [7], grupo: 'US-29', titulo: 'Solo los administradores usan la verificación; un usuario normal recibe 403 (caso de error)', objetivo: 'Verificar el control de rol, que el rol se lee de la base y que el registro público no crea administradores.', pasos: ['Un usuario sin rol llama a las tres rutas del panel.', 'Repetir sin token.', 'Quitar el rol a un administrador y volver a llamar.', 'Registrarse enviando rol "administrador".'], esperado: '403 en verificar, usar y verificaciones (la reserva no se modifica); sin token 401; un administrador degradado pierde el acceso de inmediato; el registro siempre crea rol "usuario".' },
  async (c) => {
    const u = await crearUsuario('normal');
    const { reserva } = (await reservar(u, K0, franja(14))).datos;
    const r1 = await verificarCodigo(u, reserva.codigo);
    const r2 = await usarCodigo(u, reserva.codigo);
    const r3 = await api('GET', '/admin/verificaciones', undefined, u.token);
    c.verifica([r1, r2, r3].every((r) => r.status === 403), 'Verificar, usar y listar verificaciones: 403', [r1, r2, r3].map((r) => r.status).join(', '));
    c.verifica(sqlq(`SELECT usada_at IS NULL FROM reservas WHERE id='${reserva.id}'`) === 't', 'La reserva no fue marcada como utilizada');
    c.verifica((await api('GET', '/admin/verificaciones')).status === 401, 'Sin token: 401');
    const temporal = await crearAdministrador('admin-temporal');
    c.verifica((await api('GET', '/admin/verificaciones', undefined, temporal.token)).status === 200, 'Un administrador entra al panel: 200');
    sqlq(`UPDATE usuarios SET rol = 'usuario' WHERE id = '${temporal.id}'`);
    c.verifica((await api('GET', '/admin/verificaciones', undefined, temporal.token)).status === 403, 'Al perder el rol, el mismo token queda sin acceso al instante: 403');
    const correo = `intruso.${Date.now()}@qa.local`;
    const reg = await api('POST', '/auth/registro', { nombre: 'Intruso QA', correo, telefono: '3001234567', password: CFG.password, rol: 'administrador' });
    c.verifica(reg.status === 201 && sqlq(`SELECT rol FROM usuarios WHERE correo='${correo}'`) === 'usuario', 'El registro público ignora el rol enviado: la cuenta es "usuario"');
  }
);

await S.caso(
  { ...base, id: 'F-29-07', hu: 'US-29', ca: [8], grupo: 'US-29', titulo: 'Cada verificación queda registrada para auditoría', objetivo: 'Verificar el registro de administrador, código, resultado y fecha, y su consulta.', pasos: ['Verificar un código vigente, marcarlo como usado y verificar uno inexistente.', 'Consultar la tabla verificaciones_reserva.', 'GET /api/admin/verificaciones.'], esperado: 'Tres registros con resultados vigente, marcada_usada y no_encontrado, con el administrador y la fecha; el listado devuelve primero el más reciente.' },
  async (c) => {
    const admin = await crearAdministrador('auditor');
    const u = await crearUsuario('auditada');
    const { reserva } = (await reservar(u, K0, franja(15))).datos;
    await verificarCodigo(admin, reserva.codigo);
    await usarCodigo(admin, reserva.codigo);
    await verificarCodigo(admin, 'CY-FFFFFFFF');
    const filas = sqlq(`SELECT string_agg(resultado, ',' ORDER BY created_at) FROM verificaciones_reserva WHERE administrador_id='${admin.id}'`);
    c.verifica(filas === 'vigente,marcada_usada,no_encontrado', 'La base registra vigente, marcada_usada y no_encontrado', filas);
    c.verifica(sqlq(`SELECT count(*) FROM verificaciones_reserva WHERE administrador_id='${admin.id}' AND created_at IS NOT NULL AND codigo IS NOT NULL`) === '3', 'Cada registro tiene administrador, código y fecha/hora');
    const lista = await api('GET', '/admin/verificaciones?limite=10', undefined, admin.token);
    c.verifica(lista.status === 200 && lista.datos.verificaciones[0].codigo === 'CY-FFFFFFFF' && lista.datos.verificaciones[0].resultado === 'no_encontrado' && lista.datos.verificaciones[0].administrador === admin.nombre, 'El listado muestra primero la más reciente con el nombre del administrador', JSON.stringify(lista.datos.verificaciones[0]));
    c.evidenciaTexto('Respuesta de GET /api/admin/verificaciones', JSON.stringify(lista.datos.verificaciones.slice(0, 3), null, 1));
  }
);

// ---------------------------------------------------------------------
// US-15 Gestión de canchas (administrador)
// ---------------------------------------------------------------------
const ADMIN_CANCHAS = await crearAdministrador('admin-canchas');
const horariosPrueba = [
  { diaSemana: 0, horaInicio: '07:00', horaFin: '20:00' },
  { diaSemana: 1, horaInicio: '06:00', horaFin: '22:00' },
  { diaSemana: 2, horaInicio: '06:00', horaFin: '22:00' },
  { diaSemana: 3, horaInicio: '06:00', horaFin: '22:00' },
  { diaSemana: 4, horaInicio: '06:00', horaFin: '22:00' },
  { diaSemana: 5, horaInicio: '06:00', horaFin: '22:00' },
  { diaSemana: 6, horaInicio: '07:00', horaFin: '20:00' },
];
const datosCancha = (extra = {}) => ({
  nombre: `Cancha QA ${Date.now()}.${Math.floor(Math.random() * 1e6)}`,
  direccion: 'Calle 5 # 10-20, Cali',
  zona: 'Zona QA',
  costoHora: 85000,
  tipo: 'Fútbol 7',
  descripcion: 'Cancha creada por la prueba',
  servicios: ['Parqueadero'],
  horarios: horariosPrueba,
  ...extra,
});
const crearCanchaQA = (extra) => api('POST', '/admin/canchas', datosCancha(extra), ADMIN_CANCHAS.token);
const catalogoIds = async (usuario) => (await api('GET', '/canchas', undefined, usuario.token)).datos.canchas.map((x) => x.id);

await S.caso(
  { ...base, id: 'F-15-01', hu: 'US-15', ca: [1], grupo: 'US-15', titulo: 'Crear una cancha con datos válidos: aparece en el catálogo público', objetivo: 'Verificar la creación de una cancha con su horario y que el catálogo la muestra.', pasos: ['POST /api/admin/canchas con nombre, dirección, precio y horarios válidos.', 'GET /api/canchas y GET /api/canchas/:id como un usuario normal.'], esperado: '201 con la cancha activa y sus horarios; aparece en el catálogo y su detalle trae los 7 horarios.' },
  async (c) => {
    const u = await crearUsuario('cat15');
    const datos = datosCancha();
    const r = await api('POST', '/admin/canchas', datos, ADMIN_CANCHAS.token);
    c.verifica(r.status === 201 && r.datos.cancha.disponible === true && r.datos.cancha.nombre === datos.nombre, 'Responde 201 con la cancha activa', `HTTP ${r.status}`);
    c.verifica(r.datos.cancha.horarios.length === 7 && r.datos.cancha.costoHora === 85000, 'Devuelve sus 7 horarios y el precio', `${r.datos.cancha.horarios?.length} horarios`);
    c.verifica((await catalogoIds(u)).includes(r.datos.cancha.id), 'Aparece en el catálogo público (GET /api/canchas)');
    const det = await api('GET', `/canchas/${r.datos.cancha.id}`, undefined, u.token);
    c.verifica(det.status === 200 && det.datos.cancha.horarios.length === 7 && det.datos.cancha.costoHora === 85000, 'Su detalle público trae precio y horarios');
    c.verifica(sqlq(`SELECT disponible::text || '|' || count(h.id) FROM canchas c JOIN horarios_disponibles h ON h.cancha_id = c.id WHERE c.id = '${r.datos.cancha.id}' GROUP BY c.disponible`) === 'true|7', 'En la base queda activa con 7 horarios');
    const reservable = await reservar(u, { id: r.datos.cancha.id }, { fecha: fechaUnica(), horaInicio: '10:00', horaFin: '11:00' });
    c.verifica(reservable.status === 201, 'Se puede reservar en la cancha nueva (201)', `HTTP ${reservable.status}`);
  }
);

await S.caso(
  { ...base, id: 'F-15-02', hu: 'US-15', ca: [2], grupo: 'US-15', titulo: 'Editar una cancha: el catálogo refleja los cambios y las reservas confirmadas no se alteran', objetivo: 'Verificar la edición de datos y horarios con una reserva ya confirmada.', pasos: ['Crear una cancha y una reserva confirmada.', 'PUT /api/admin/canchas/:id cambiando nombre, precio y horario (la reserva queda fuera del nuevo horario).', 'Consultar el catálogo y la reserva.'], esperado: '200; el catálogo muestra el nombre y el precio nuevos; la reserva sigue confirmada con la misma fecha y hora y cuenta como reserva futura.' },
  async (c) => {
    const u = await crearUsuario('edit15');
    const creada = (await crearCanchaQA()).datos.cancha;
    const f = { fecha: fechaUnica(), horaInicio: '09:00', horaFin: '10:00' };
    const reserva = await reservar(u, creada, f);
    c.verifica(reserva.status === 201, 'Preparación: reserva confirmada de las 09:00', `HTTP ${reserva.status}`);
    const cambios = datosCancha({ nombre: `${creada.nombre} editada`, costoHora: 99000, horarios: [{ diaSemana: 1, horaInicio: '14:00', horaFin: '18:00' }] });
    const r = await api('PUT', `/admin/canchas/${creada.id}`, cambios, ADMIN_CANCHAS.token);
    c.verifica(r.status === 200 && r.datos.cancha.nombre === cambios.nombre && r.datos.cancha.costoHora === 99000, 'Responde 200 con los datos nuevos', `HTTP ${r.status}`);
    c.verifica(r.datos.cancha.horarios.length === 1 && r.datos.cancha.horarios[0].horaInicio === '14:00', 'El horario se reemplazó por el nuevo');
    const enCatalogo = (await api('GET', '/canchas', undefined, u.token)).datos.canchas.find((x) => x.id === creada.id);
    c.verifica(enCatalogo?.nombre === cambios.nombre && enCatalogo.costoHora === 99000, 'El catálogo refleja el nombre y el precio nuevos');
    c.verifica(sqlq(`SELECT estado || '|' || fecha::text || '|' || hora_inicio::text FROM reservas WHERE id='${reserva.datos.reserva.id}'`) === `confirmada|${f.fecha}|09:00:00`, 'La reserva ya confirmada no se alteró (estado, fecha y hora)');
    const admin = (await api('GET', '/admin/canchas', undefined, ADMIN_CANCHAS.token)).datos.canchas.find((x) => x.id === creada.id);
    c.verifica(admin?.reservasFuturas === 1, 'El panel cuenta 1 reserva futura en la cancha', `${admin?.reservasFuturas}`);
    c.verifica((await api('PUT', `/admin/canchas/${UUID_INEXISTENTE}`, datosCancha(), ADMIN_CANCHAS.token)).status === 404, 'Editar una cancha inexistente: 404');
  }
);

await S.caso(
  { ...base, id: 'F-15-03', hu: 'US-15', ca: [3], grupo: 'US-15', titulo: 'Desactivar una cancha: sale del listado, no admite reservas y conserva el historial', objetivo: 'Verificar la desactivación lógica y la reactivación.', pasos: ['Crear una cancha sin reservas y desactivarla.', 'Consultar el catálogo, el detalle y reservar.', 'Reactivarla.'], esperado: 'Desactivar: 200; deja de estar en el catálogo, su detalle es 404 y reservar responde 409 CANCHA_NO_DISPONIBLE; el administrador la sigue viendo; al activarla todo vuelve a funcionar.' },
  async (c) => {
    const u = await crearUsuario('desact15');
    const creada = (await crearCanchaQA()).datos.cancha;
    const d = await api('PATCH', `/admin/canchas/${creada.id}/desactivar`, {}, ADMIN_CANCHAS.token);
    c.verifica(d.status === 200 && d.datos.cancha.disponible === false && d.datos.reservasAfectadas === 0, 'Sin reservas futuras se desactiva de inmediato: 200', `HTTP ${d.status}`);
    c.verifica(!(await catalogoIds(u)).includes(creada.id), 'Deja de mostrarse en el listado público');
    c.verifica((await api('GET', `/canchas/${creada.id}`, undefined, u.token)).status === 404, 'Su detalle público responde 404');
    const r = await reservar(u, creada, { fecha: fechaUnica(), horaInicio: '10:00', horaFin: '11:00' });
    c.verifica(r.status === 409 && r.datos.codigo === 'CANCHA_NO_DISPONIBLE', 'No admite nuevas reservas: 409 CANCHA_NO_DISPONIBLE', `HTTP ${r.status} ${r.datos.codigo}`);
    c.verifica(sqlq(`SELECT count(*) FROM canchas WHERE id='${creada.id}'`) === '1', 'La cancha no se borra de la base (desactivación lógica)');
    const lista = (await api('GET', '/admin/canchas', undefined, ADMIN_CANCHAS.token)).datos.canchas.find((x) => x.id === creada.id);
    c.verifica(lista?.disponible === false, 'El administrador la sigue viendo, marcada como desactivada');
    c.verifica((await api('PATCH', `/admin/canchas/${creada.id}/desactivar`, {}, ADMIN_CANCHAS.token)).status === 409, 'Desactivarla otra vez: 409');
    const a = await api('PATCH', `/admin/canchas/${creada.id}/activar`, undefined, ADMIN_CANCHAS.token);
    c.verifica(a.status === 200 && (await catalogoIds(u)).includes(creada.id), 'Al reactivarla vuelve al catálogo');
    c.verifica((await reservar(u, creada, { fecha: fechaUnica(), horaInicio: '10:00', horaFin: '11:00' })).status === 201, 'Y vuelve a admitir reservas (201)');
  }
);

await S.caso(
  { ...base, id: 'F-15-04', hu: 'US-15', ca: [3, 4], grupo: 'US-15', titulo: 'Desactivar con reservas futuras: advertencia y confirmación explícita', objetivo: 'Verificar que el sistema advierte de las reservas afectadas, no desactiva sin confirmar y conserva las reservas.', pasos: ['Crear una cancha con 2 reservas futuras de usuarios distintos.', 'PATCH desactivar sin confirmar.', 'PATCH desactivar con confirmar=true.', 'Revisar las reservas y el historial.'], esperado: 'Sin confirmar: 409 CONFIRMACION_REQUERIDA con 2 reservas afectadas y su detalle, cancha aún activa. Con confirmar: 200, desactivada, las 2 reservas siguen confirmadas y visibles para sus usuarios.' },
  async (c) => {
    const A = await crearUsuario('afec1');
    const B = await crearUsuario('afec2');
    const creada = (await crearCanchaQA()).datos.cancha;
    const ra = await reservar(A, creada, { fecha: fechaUnica(), horaInicio: '08:00', horaFin: '09:00' });
    const rb = await reservar(B, creada, { fecha: fechaUnica(), horaInicio: '09:00', horaFin: '10:00' });
    c.verifica(ra.status === 201 && rb.status === 201, 'Preparación: 2 reservas futuras');
    const aviso = await api('PATCH', `/admin/canchas/${creada.id}/desactivar`, {}, ADMIN_CANCHAS.token);
    c.verifica(aviso.status === 409 && aviso.datos.codigo === 'CONFIRMACION_REQUERIDA' && aviso.datos.reservasAfectadas === 2, 'Sin confirmar: 409 CONFIRMACION_REQUERIDA con 2 reservas afectadas', `HTTP ${aviso.status} ${aviso.datos.reservasAfectadas}`);
    const codigos = aviso.datos.reservas?.map((x) => x.codigo).sort().join(',');
    c.verifica(codigos === [ra.datos.reserva.codigo, rb.datos.reserva.codigo].sort().join(',') && aviso.datos.reservas.every((x) => x.usuarioNombre && x.fecha && x.horaInicio), 'La advertencia lista cada reserva afectada con su código, usuario, fecha y hora', codigos);
    c.verifica(sqlq(`SELECT disponible FROM canchas WHERE id='${creada.id}'`) === 't', 'La cancha sigue activa mientras no se confirma');
    c.verifica((await api('PATCH', `/admin/canchas/${creada.id}/desactivar`, { confirmar: false }, ADMIN_CANCHAS.token)).status === 409, 'confirmar=false tampoco desactiva');
    const ok = await api('PATCH', `/admin/canchas/${creada.id}/desactivar`, { confirmar: true }, ADMIN_CANCHAS.token);
    c.verifica(ok.status === 200 && ok.datos.reservasAfectadas === 2 && ok.datos.cancha.disponible === false, 'Con confirmación explícita se desactiva: 200', `HTTP ${ok.status}`);
    c.verifica(sqlq(`SELECT count(*) FROM reservas WHERE cancha_id='${creada.id}' AND estado='confirmada'`) === '2', 'Las 2 reservas se conservan confirmadas');
    const h = await api('GET', '/reservas?limite=50', undefined, A.token);
    c.verifica(h.datos.reservas.some((x) => x.id === ra.datos.reserva.id && x.estado === 'confirmada'), 'El historial del usuario las conserva');
    c.evidenciaTexto('Respuesta 409 de la advertencia', JSON.stringify(aviso.datos, null, 1));
  }
);

await S.caso(
  { ...base, id: 'F-15-05', hu: 'US-15', ca: [5], grupo: 'US-15', titulo: 'Un usuario sin rol de administrador recibe 403 en la gestión de canchas (caso de error)', objetivo: 'Verificar el control de rol en las 6 rutas y que no se crea ni cambia nada.', pasos: ['Con un usuario normal: GET, POST, PUT, desactivar y activar.', 'Repetir sin token.'], esperado: '403 con un usuario normal y 401 sin sesión en todas las rutas; la base no cambia.' },
  async (c) => {
    const u = await crearUsuario('noadmin15');
    const creada = (await crearCanchaQA()).datos.cancha;
    const antes = sqlq('SELECT count(*) FROM canchas');
    const rutas = [
      ['GET', '/admin/canchas', undefined],
      ['GET', `/admin/canchas/${creada.id}`, undefined],
      ['POST', '/admin/canchas', datosCancha({ nombre: 'No debe existir QA' })],
      ['PUT', `/admin/canchas/${creada.id}`, datosCancha({ nombre: 'Hackeada' })],
      ['PATCH', `/admin/canchas/${creada.id}/desactivar`, { confirmar: true }],
      ['PATCH', `/admin/canchas/${creada.id}/activar`, undefined],
    ];
    for (const [metodo, ruta, cuerpo] of rutas) {
      const normal = await api(metodo, ruta, cuerpo, u.token);
      const sinToken = await api(metodo, ruta, cuerpo);
      c.verifica(normal.status === 403 && sinToken.status === 401, `${metodo} ${ruta.replace(creada.id, ':id')}: 403 con usuario normal y 401 sin sesión`, `${normal.status} / ${sinToken.status}`);
    }
    c.verifica(sqlq('SELECT count(*) FROM canchas') === antes && sqlq(`SELECT nombre || '|' || disponible FROM canchas WHERE id='${creada.id}'`) === `${creada.nombre}|true`, 'No se creó ni modificó ninguna cancha');
    c.verifica(sqlq("SELECT count(*) FROM canchas WHERE nombre='No debe existir QA'") === '0', 'La cancha del intento no existe');
  }
);

await S.caso(
  { ...base, id: 'F-15-06', hu: 'US-15', ca: [6], grupo: 'US-15', titulo: 'Validaciones de la cancha: campos obligatorios y rangos, con mensajes por campo (caso de error)', objetivo: 'Verificar precio > 0, cierre posterior a la apertura, horarios y datos obligatorios.', pasos: ['POST con precio 0 y negativo, nombre y dirección vacíos, tipo inválido.', 'POST con cierre anterior o igual a la apertura, hora inválida, día repetido y sin horarios.', 'PUT con datos inválidos.'], esperado: '400 en todos con el campo señalado (costoHora, nombre, direccion, tipo, horarios); no se guarda nada.' },
  async (c) => {
    const antes = sqlq('SELECT count(*) FROM canchas');
    const casos = [
      ['precio 0', { costoHora: 0 }, 'costoHora'],
      ['precio negativo', { costoHora: -1000 }, 'costoHora'],
      ['precio no numérico', { costoHora: 'gratis' }, 'costoHora'],
      ['nombre vacío', { nombre: '   ' }, 'nombre'],
      ['dirección vacía', { direccion: '' }, 'direccion'],
      ['tipo desconocido', { tipo: 'Fútbol 3' }, 'tipo'],
      ['cierre anterior a la apertura', { horarios: [{ diaSemana: 1, horaInicio: '20:00', horaFin: '08:00' }] }, 'horarios'],
      ['cierre igual a la apertura', { horarios: [{ diaSemana: 1, horaInicio: '10:00', horaFin: '10:00' }] }, 'horarios'],
      ['hora con formato inválido', { horarios: [{ diaSemana: 1, horaInicio: '25:61', horaFin: '26:00' }] }, 'horarios'],
      ['día repetido', { horarios: [{ diaSemana: 2, horaInicio: '08:00', horaFin: '10:00' }, { diaSemana: 2, horaInicio: '12:00', horaFin: '14:00' }] }, 'horarios'],
      ['sin horarios', { horarios: [] }, 'horarios'],
    ];
    for (const [nombre, extra, campo] of casos) {
      const r = await api('POST', '/admin/canchas', datosCancha(extra), ADMIN_CANCHAS.token);
      c.verifica(r.status === 400 && r.datos.errores?.some((e) => e.campo === campo && e.mensaje), `${nombre}: 400 señalando "${campo}"`, `HTTP ${r.status} ${r.datos.errores?.map((e) => e.mensaje).join(' | ')}`);
    }
    const vacio = await api('POST', '/admin/canchas', {}, ADMIN_CANCHAS.token);
    c.verifica(vacio.status === 400 && ['nombre', 'direccion', 'costoHora', 'horarios'].every((k) => vacio.datos.errores.some((e) => e.campo === k)), 'Cuerpo vacío: señala todos los campos obligatorios');
    const creada = (await crearCanchaQA()).datos.cancha;
    const edit = await api('PUT', `/admin/canchas/${creada.id}`, datosCancha({ costoHora: -5 }), ADMIN_CANCHAS.token);
    c.verifica(edit.status === 400 && sqlq(`SELECT costo_hora::int FROM canchas WHERE id='${creada.id}'`) === '85000', 'Editar con datos inválidos: 400 y la cancha no cambia');
    c.verifica(Number(sqlq('SELECT count(*) FROM canchas')) === Number(antes) + 1, 'Solo se creó la cancha válida de la preparación');
  }
);

// Las canchas de prueba de US-15 se eliminan (con sus reservas): el catálogo debe quedar como estaba para las demás pruebas.
sqlq("DELETE FROM canchas WHERE nombre LIKE 'Cancha QA %'");

// ---------------------------------------------------------------------
// US-16 Cancelación administrativa
// ---------------------------------------------------------------------
const ADMIN_16 = await crearAdministrador('admin-16');
const cancelarAdmin = (id, motivo) => api('PATCH', `/admin/reservas/${id}/cancelar`, motivo === undefined ? {} : { motivo }, ADMIN_16.token);

await S.caso(
  { ...base, id: 'F-16-01', hu: 'US-16', ca: [1], grupo: 'US-16', titulo: 'Buscar reservas futuras por cancha, fecha o usuario', objetivo: 'Verificar la búsqueda de reservas del administrador y que solo trae las futuras.', pasos: ['Crear reservas de dos usuarios en dos canchas y una reserva pasada.', 'GET /api/admin/reservas con filtros de cancha, fecha y usuario (nombre y correo).', 'Probar parámetros inválidos y un usuario normal.'], esperado: 'Cada filtro devuelve solo lo que corresponde, sin reservas pasadas; parámetros inválidos 400; usuario normal 403.' },
  async (c) => {
    const A = await crearUsuario('busca16a');
    const B = await crearUsuario('busca16b');
    const dia = fechaUnica();
    const ra = await reservar(A, K0, { fecha: dia, horaInicio: '08:00', horaFin: '09:00' });
    const rb = await reservar(B, K1, { fecha: dia, horaInicio: '08:00', horaFin: '09:00' });
    insertarReservaSql(A, K2, fechaPasadaUnica(), '10:00', '11:00');
    c.verifica(ra.status === 201 && rb.status === 201, 'Preparación: 2 reservas futuras y 1 pasada');
    const ids = (r) => r.datos.reservas.map((x) => x.id);
    const porCancha = await api('GET', `/admin/reservas?canchaId=${K1.id}&fecha=${dia}`, undefined, ADMIN_16.token);
    c.verifica(porCancha.status === 200 && ids(porCancha).includes(rb.datos.reserva.id) && !ids(porCancha).includes(ra.datos.reserva.id), 'Filtro por cancha y fecha: solo la de esa cancha', `${porCancha.datos.reservas?.length} resultados`);
    const porNombre = await api('GET', `/admin/reservas?usuario=${encodeURIComponent(A.nombre)}`, undefined, ADMIN_16.token);
    c.verifica(ids(porNombre).includes(ra.datos.reserva.id) && !ids(porNombre).includes(rb.datos.reserva.id), 'Filtro por usuario (nombre): solo sus reservas');
    const porCorreo = await api('GET', `/admin/reservas?usuario=${encodeURIComponent(B.correo)}&fecha=${dia}`, undefined, ADMIN_16.token);
    c.verifica(ids(porCorreo).join() === rb.datos.reserva.id, 'Filtro por correo y fecha: solo esa reserva');
    const x = porCancha.datos.reservas.find((y) => y.id === rb.datos.reserva.id);
    c.verifica(x.usuarioNombre === B.nombre && x.canchaNombre === K1.nombre && /^CY-/.test(x.codigo), 'Cada reserva trae el usuario titular, la cancha y el código', JSON.stringify(x).slice(0, 140));
    c.verifica(!(await api('GET', `/admin/reservas?fecha=2000-01-01`, undefined, ADMIN_16.token)).datos.reservas.length, 'Las reservas pasadas no aparecen');
    c.verifica((await api('GET', '/admin/reservas?canchaId=xx&limite=999', undefined, ADMIN_16.token)).status === 400, 'Parámetros inválidos: 400');
    c.verifica((await api('GET', '/admin/reservas', undefined, A.token)).status === 403, 'Un usuario normal: 403');
  }
);

await S.caso(
  { ...base, id: 'F-16-02', hu: 'US-16', ca: [2, 5], grupo: 'US-16', titulo: 'Cancelar con motivo y más de 2 horas: "Cancelada administrativamente", franja libre y auditoría', objetivo: 'Verificar la cancelación administrativa completa y su registro de auditoría.', pasos: ['Crear una reserva futura.', 'PATCH /api/admin/reservas/:id/cancelar con motivo.', 'Revisar estado, disponibilidad, historial del usuario y la tabla de auditoría.'], esperado: '200 con estado cancelada_administrativamente; la franja queda libre; el usuario ve el motivo en su historial; cancelaciones_administrativas guarda administrador, motivo y fecha.' },
  async (c) => {
    const u = await crearUsuario('cancelada16');
    const otro = await crearUsuario('otro16');
    const f = { fecha: fechaUnica(), horaInicio: '11:00', horaFin: '12:00' };
    const creada = await reservar(u, K0, f);
    const id = creada.datos.reserva.id;
    const r = await cancelarAdmin(id, 'La cancha estará en mantenimiento');
    c.verifica(r.status === 200 && r.datos.reserva.estado === 'cancelada_administrativamente', 'Responde 200 con estado "cancelada_administrativamente"', `HTTP ${r.status} ${r.datos.reserva?.estado}`);
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE id='${id}'`) === 'cancelada_administrativamente', 'En la base la reserva quedó cancelada administrativamente');
    c.verifica(!(await disponibilidad(otro, K0, f.fecha)).datos.ocupados.some((o) => String(o.horaInicio).startsWith('11:00')), 'La franja quedó libre');
    c.verifica((await reservar(otro, K0, f)).status === 201, 'Otro usuario puede reservarla (201)');
    const h = await api('GET', '/reservas?limite=50', undefined, u.token);
    const visto = h.datos.reservas.find((x) => x.id === id);
    c.verifica(visto?.estado === 'cancelada_administrativamente' && visto.motivoCancelacion === 'La cancha estará en mantenimiento' && visto.puedeCancelar === false, 'El usuario ve el estado y el motivo en su historial', JSON.stringify({ e: visto?.estado, m: visto?.motivoCancelacion }));
    const fila = sqlq(`SELECT (administrador_id = '${ADMIN_16.id}')::text || '|' || motivo || '|' || (created_at IS NOT NULL)::text FROM cancelaciones_administrativas WHERE reserva_id='${id}'`);
    c.verifica(fila === 'true|La cancha estará en mantenimiento|true', 'Queda registrada la cancelación: administrador, motivo y fecha', fila);
    c.verifica((await cancelarReserva(u, id)).status === 409 && (await cancelarAdmin(id, 'otra vez')).status === 409, 'No se puede cancelar de nuevo (409), ni por el usuario ni por el administrador');
    c.evidenciaTexto('Fila de auditoría', sqlq(`SELECT row_to_json(c) FROM cancelaciones_administrativas c WHERE reserva_id='${id}'`));
  }
);

await S.caso(
  { ...base, id: 'F-16-03', hu: 'US-16', ca: [2, 3], grupo: 'US-16', titulo: 'Motivo obligatorio y bloqueo con menos de 2 horas (caso de error)', objetivo: 'Verificar el motivo obligatorio y la regla de las 2 horas de anticipación.', pasos: ['Cancelar sin motivo, con motivo vacío y con motivo demasiado largo.', 'Cancelar una reserva que empieza en 90 minutos.', 'Cancelar una reserva inexistente y con id inválido.'], esperado: 'Sin motivo (o vacío, o de más de 500 caracteres): 400 con el error del campo motivo y la reserva sigue confirmada; con menos de 2 horas: 409 CANCELACION_FUERA_DE_PLAZO y nada cambia; inexistente 404; id inválido 400.' },
  async (c) => {
    const u = await crearUsuario('plazo16');
    const creada = await reservar(u, K0, franja(13));
    const id = creada.datos.reserva.id;
    for (const [nombre, motivo] of [['sin motivo', undefined], ['motivo vacío', '   '], ['motivo de 501 caracteres', 'x'.repeat(501)]]) {
      const r = await cancelarAdmin(id, motivo);
      c.verifica(r.status === 400 && r.datos.errores?.some((e) => e.campo === 'motivo' && e.mensaje), `${nombre}: 400 con el error del campo "motivo"`, `HTTP ${r.status} ${r.datos.errores?.map((e) => e.mensaje).join(' | ')}`);
    }
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE id='${id}'`) === 'confirmada' && sqlq(`SELECT count(*) FROM cancelaciones_administrativas WHERE reserva_id='${id}'`) === '0', 'La reserva sigue confirmada y no hay registro de auditoría');
    const [idPronto] = insertarProntoLibre(u, [K1, K2, K0]);
    const fuera = await cancelarAdmin(idPronto, 'Imprevisto operativo');
    c.verifica(fuera.status === 409 && fuera.datos.codigo === 'CANCELACION_FUERA_DE_PLAZO' && /2 horas/.test(fuera.datos.mensaje), 'Con menos de 2 horas: 409 CANCELACION_FUERA_DE_PLAZO que explica la restricción', `HTTP ${fuera.status} ${fuera.datos.mensaje}`);
    c.verifica(sqlq(`SELECT estado FROM reservas WHERE id='${idPronto}'`) === 'confirmada', 'La reserva de 90 minutos sigue confirmada');
    c.verifica((await cancelarAdmin(UUID_INEXISTENTE, 'x')).status === 404, 'Reserva inexistente: 404');
    c.verifica((await cancelarAdmin('no-es-uuid', 'x')).status === 400, 'Identificador inválido: 400');
    c.verifica((await api('PATCH', `/admin/reservas/${id}/cancelar`, { motivo: 'x' }, u.token)).status === 403, 'Un usuario normal no puede cancelar de forma administrativa: 403');
  }
);

await S.caso(
  { ...base, id: 'F-16-04', hu: 'US-16', ca: [4], grupo: 'US-16', titulo: 'El usuario afectado recibe un correo con el motivo', objetivo: 'Verificar la notificación por correo (sin SMTP queda en el log del backend), el escape del HTML del motivo y que un motivo con HTML no se inyecta.', pasos: ['Cancelar una reserva con un motivo.', 'Buscar en los logs del backend el correo de cancelación administrativa.'], esperado: 'El log contiene el correo del usuario, el código y el motivo.' },
  async (c) => {
    const u = await crearUsuario('correo16');
    const creada = await reservar(u, K0, franja(14));
    const r = await cancelarAdmin(creada.datos.reserva.id, 'Torneo privado ese día');
    c.verifica(r.status === 200, 'La cancelación responde 200', `HTTP ${r.status}`);
    await esperar(800);
    const linea = logsBackend('5m').split('\n').find((l) => l.includes('Cancelación administrativa') && l.includes(u.correo));
    c.verifica(Boolean(linea), 'El backend registró el correo de cancelación administrativa para el usuario');
    c.verifica(linea?.includes(creada.datos.reserva.codigo) && linea.includes('Torneo privado ese día'), 'El correo incluye el código y el motivo', linea?.split('): ')[1]);
  }
);

await S.caso(
  { ...base, id: 'F-16-05', hu: 'US-16', hus: ['US-16', 'US-28'], ca: { 'US-16': [2], 'US-28': [4] }, grupo: 'US-16', titulo: 'Cancelar como administrador una reserva pagada con tarjeta reembolsa el pago', objetivo: 'Verificar que el usuario no pierde su dinero cuando es el administrador quien cancela.', pasos: ['El usuario guarda una tarjeta y reserva pagando.', 'El administrador cancela la reserva con motivo.', 'Revisar la tabla de pagos.'], esperado: 'El pago queda "reembolsado" con referencia ref_sim_, junto con la cancelación administrativa.' },
  async (c) => {
    const u = await crearUsuario('paga16');
    const tj = (await guardarTarjeta(u)).datos.metodoPago;
    const pagada = await reservarHora(u, K0, fechaUnica(), '15', tj.id);
    c.verifica(pagada.status === 201 && pagada.datos.reserva.pago?.estado === 'aprobado', 'Preparación: reserva pagada');
    const r = await cancelarAdmin(pagada.datos.reserva.id, 'Cancha cerrada por lluvia');
    c.verifica(r.status === 200, 'El administrador la cancela: 200', `HTTP ${r.status}`);
    const fila = sqlq(`SELECT estado || '|' || coalesce(reembolso_referencia, '') FROM pagos WHERE reserva_id='${pagada.datos.reserva.id}'`);
    c.verifica(/^reembolsado\|ref_sim_/.test(fila), 'El pago quedó reembolsado', fila);
  }
);


// =====================================================================
// PIG1-23 Documentación técnica de la API (OpenAPI / Swagger)
// =====================================================================
const baseDoc = { ...base, nivel: 'API REST' };
let especApi;

await S.caso(
  { ...baseDoc, id: 'F-DOC-01', hu: 'PIG1-23', ca: [1, 2, 6], grupo: 'PIG1-23', titulo: 'Swagger UI y la especificación se publican en /api/docs', objetivo: 'Verificar que la documentación está disponible en el backend, que la especificación es OpenAPI 3.x y que declara la autenticación Bearer JWT.', pasos: ['GET /api/docs/ (Swagger UI).', 'GET /api/docs/openapi.json y /api/docs/openapi.yaml.', 'Revisar el esquema de seguridad y los servidores.'], esperado: 'Swagger UI responde 200 con HTML; la especificación JSON es openapi 3.x con el esquema bearerAuth (http, bearer, JWT) y el servidor actual como primer servidor; el YAML se puede descargar.' },
  async (c) => {
    const ui = await fetch(`${CFG.SOCKET}/api/docs/`);
    const html = await ui.text();
    c.verifica(ui.status === 200 && /swagger-ui/.test(html), 'GET /api/docs/ sirve Swagger UI (200, HTML)', `HTTP ${ui.status}`);
    const json = await fetch(`${CFG.SOCKET}/api/docs/openapi.json`);
    especApi = await json.json();
    c.verifica(json.status === 200 && /^3\./.test(especApi.openapi), 'La especificación JSON es OpenAPI 3.x', especApi.openapi);
    c.verifica(especApi.components.securitySchemes?.bearerAuth?.scheme === 'bearer' && especApi.components.securitySchemes.bearerAuth.bearerFormat === 'JWT', 'Declara la autenticación Bearer JWT (bearerAuth)');
    c.verifica(especApi.servers[0].url === CFG.SOCKET, 'El primer servidor es el servidor actual (Try it out apunta al backend correcto)', especApi.servers[0].url);
    const yaml = await fetch(`${CFG.SOCKET}/api/docs/openapi.yaml`);
    c.verifica(yaml.status === 200 && /^openapi: 3\./m.test(await yaml.text()), 'El YAML versionado se puede descargar');
    c.verifica(fs.existsSync(`${ROOT}/backend/openapi/openapi.yaml`), 'El archivo backend/openapi/openapi.yaml existe en el repositorio');
  }
);

await S.caso(
  { ...baseDoc, id: 'F-DOC-02', hu: 'PIG1-23', ca: [3, 4, 5, 7, 8], grupo: 'PIG1-23', titulo: 'Cobertura y contenido de la documentación (≥ 90 %)', objetivo: 'Calcular endpoints implementados contra documentados y comprobar que cada operación documenta respuestas, ejemplos, modelos reutilizados y los casos del motor de reservas.', pasos: ['Ejecutar "npm run docs:cobertura" (lee las rutas reales de Express).', 'Revisar en la especificación cada operación: descripción, respuestas y ejemplos.', 'Revisar components/schemas y los ejemplos de error del motor de reservas.', 'Buscar los eventos de Socket.IO en la documentación.'], esperado: 'Cobertura ≥ 90 % (se espera 100 %, 14/14); cada operación con descripción, 2xx y ejemplos; modelos Usuario, Cancha, Reserva y Error definidos una vez; 409 con duplicada, solapada, límite y retenida; los 11 eventos de socket descritos.' },
  async (c) => {
    const cob = sh('npm run docs:cobertura', { cwd: `${ROOT}/backend` });
    const m = cob.out.match(/Cobertura: ([\d.]+) %/);
    const implementados = cob.out.match(/implementados: (\d{1,6})/);
    const documentados = cob.out.match(/documentados:\s{1,10}(\d{1,6})/);
    const n = implementados && documentados ? [null, implementados[1], documentados[1]] : null;
    c.verifica(cob.code === 0 && m && Number(m[1]) >= 90, 'La cobertura de endpoints es ≥ 90 %', m ? `${m[1]} % (${n?.[2]} de ${n?.[1]})` : `código ${cob.code}`);
    c.evidenciaTexto('Endpoints implementados contra documentados', cob.out.trim());
    const ops = Object.entries(especApi.paths).flatMap(([ruta, o]) => ['get', 'post', 'patch', 'put', 'delete'].filter((mm) => o[mm]).map((mm) => ({ ruta, mm, op: o[mm] })));
    c.verifica(ops.every((o) => o.op.description && o.op.summary && Object.keys(o.op.responses).some((k) => /^2/.test(k))), `Las ${ops.length} operaciones tienen resumen, descripción y respuesta exitosa`);
    const protegidas = ops.filter((o) => o.op.security);
    c.verifica(protegidas.every((o) => o.op.responses['401']), `Las ${protegidas.length} operaciones protegidas documentan el 401`);
    c.verifica(ops.filter((o) => o.op.requestBody).every((o) => o.op.responses['400'] && (o.op.requestBody.content['application/json'].example || o.op.requestBody.content['application/json'].examples)), 'Las operaciones con cuerpo tienen ejemplo y documentan el 400');
    const codigos = new Set(ops.flatMap((o) => Object.keys(o.op.responses)));
    c.verifica(['200', '201', '400', '401', '403', '404', '409', '500'].every((k) => codigos.has(k)), 'Se documentan los códigos 200, 201, 400, 401, 403, 404, 409 y 500', [...codigos].sort().join(', '));
    c.verifica(['Usuario', 'Cancha', 'Reserva', 'Error'].every((k) => especApi.components.schemas[k]), 'Los modelos Usuario, Cancha, Reserva y Error están en components/schemas', Object.keys(especApi.components.schemas).join(', '));
    const e409 = Object.keys(especApi.paths['/api/canchas/{id}/reservas'].post.responses['409'].content['application/json'].examples);
    c.verifica(['duplicada', 'retenida', 'solapada', 'limite'].every((k) => e409.includes(k)), 'POST reservas documenta el 409: duplicada (US-09), retenida (US-18), solapada y límite (US-12)', e409.join(', '));
    c.verifica(Boolean(especApi.paths['/api/canchas/{id}/disponibilidad'] && especApi.paths['/api/reservas'] && especApi.paths['/api/canchas/{id}/reservas'].post), 'Están los endpoints de disponibilidad (US-08), confirmación (US-11) e historial (US-13)');
    const tag = especApi.tags.find((t) => /Socket/.test(t.name))?.description ?? '';
    const eventos = ['retencion:solicitar', 'retencion:liberar', 'temporizador:reiniciar', 'temporizador:inicio', 'temporizador:sync', 'temporizador:expirado', 'temporizador:error', 'retencion:confirmada', 'disponibilidad:retenida', 'disponibilidad:liberada', 'disponibilidad:reservada'];
    c.verifica(eventos.every((e) => tag.includes(`\`${e}\``)), 'Los 11 eventos de Socket.IO están documentados (nombre, dirección, payload y errores)', `${eventos.filter((e) => tag.includes(`\`${e}\``)).length}/11`);
    c.verifica(/Códigos de error/.test(tag) && /FRANJA_RETENIDA/.test(tag), 'Se documentan los códigos de error de los eventos');
  }
);

await S.caso(
  { ...baseDoc, id: 'F-DOC-03', hu: 'PIG1-23', ca: [9, 10, 11], grupo: 'PIG1-23', titulo: 'Validación con Spectral y ejemplos de "Try it out" contra el backend', objetivo: 'Validar la especificación con Spectral, ejecutar los ejemplos de la documentación contra el backend real y comprobar que el README enlaza y explica la actualización.', pasos: ['Ejecutar "npm run docs:lint" (Spectral).', 'Llamar a cada endpoint de lectura documentado con el token del usuario y verificar que el código es uno de los documentados.', 'Probar el flujo reserva → repetición → cancelación con los cuerpos de ejemplo.', 'Revisar el README.'], esperado: 'Spectral sin errores ni advertencias; todos los códigos de respuesta obtenidos están documentados; el flujo con los ejemplos funciona; el README enlaza /api/docs y explica cómo actualizar.' },
  async (c) => {
    const lint = sh('npm run docs:lint', { cwd: `${ROOT}/backend`, timeout: 180000 });
    c.verifica(lint.code === 0 && /No results with a severity of 'warn' or higher/.test(lint.out), 'Spectral valida la especificación sin errores ni advertencias', lint.out.trim().split('\n').pop());
    c.evidenciaTexto('Salida de Spectral', lint.out.trim());
    const u = await crearUsuario('docs');
    const documentado = (ruta, metodo, status) => Boolean(especApi.paths[ruta][metodo].responses[String(status)]);
    const k = (await canchas(u.token))[0];
    const fecha = fechaUnica();
    const lecturas = [
      ['/api/health', '/health'], ['/api/canchas', '/canchas'], ['/api/canchas/{id}', `/canchas/${k.id}`],
      ['/api/canchas/{id}/disponibilidad', `/canchas/${k.id}/disponibilidad?fecha=${fecha}`], ['/api/canchas/{id}/reservas', `/canchas/${k.id}/reservas?fecha=${fecha}`],
      ['/api/reservas', '/reservas'], ['/api/reservas/mias', '/reservas/mias'],
    ];
    for (const [ruta, url] of lecturas) {
      const r = await api('GET', url, undefined, u.token);
      c.verifica(r.status === 200 && documentado(ruta, 'get', r.status), `GET ${ruta}: 200 documentado`, `HTTP ${r.status}`);
    }
    const ej = especApi.paths['/api/canchas/{id}/reservas'].post.requestBody.content['application/json'].example;
    const crea = await api('POST', `/canchas/${k.id}/reservas`, { ...ej, fecha }, u.token);
    c.verifica(crea.status === 201 && documentado('/api/canchas/{id}/reservas', 'post', 201), 'POST reservas con el cuerpo de ejemplo: 201 documentado', `HTTP ${crea.status}`);
    const dup = await api('POST', `/canchas/${k.id}/reservas`, { ...ej, fecha }, u.token);
    c.verifica(dup.status === 409 && documentado('/api/canchas/{id}/reservas', 'post', 409), 'Repetir el ejemplo: 409 documentado', `HTTP ${dup.status} ${dup.datos.mensaje}`);
    const can = await api('PATCH', `/reservas/${crea.datos.reserva.id}/cancelar`, undefined, u.token);
    c.verifica(can.status === 200 && documentado('/api/reservas/{id}/cancelar', 'patch', 200), 'PATCH cancelar: 200 documentado', `HTTP ${can.status}`);
    const sinToken = await api('GET', '/canchas');
    c.verifica(sinToken.status === 401 && documentado('/api/canchas', 'get', 401), 'Sin token: 401 documentado', `HTTP ${sinToken.status}`);
    const readme = fs.readFileSync(`${ROOT}/README.md`, 'utf8');
    c.verifica(/\/api\/docs/.test(readme) && /Cómo actualizar la documentación/.test(readme) && /backend\/openapi\/openapi\.yaml/.test(readme), 'El README enlaza /api/docs y explica cómo actualizar la documentación');
  }
);

// =====================================================================
// PIG1-24 Pipeline CI/CD, manual de usuario y documentación final
// =====================================================================
const leerDoc = (ruta) => fs.readFileSync(`${ROOT}/${ruta}`, 'utf8');
const existeArchivo = (ruta) => fs.existsSync(`${ROOT}/${ruta}`);

await S.caso(
  { ...baseDoc, id: 'F-DOC-04', hu: 'PIG1-24', ca: [1, 2, 3], grupo: 'PIG1-24', titulo: 'Manual de usuario, documentación técnica final y evidencias existen, están enlazados y sus enlaces funcionan', objetivo: 'Verificar que los tres documentos de la entrega final existen, que el README los enlaza y que todos sus enlaces internos apuntan a archivos reales.', pasos: ['Comprobar que existen docs/manual-usuario.md, docs/documentacion-tecnica-final.md y docs/evidencias-pipeline-cicd.md.', 'Comprobar que el README los enlaza.', 'Revisar los enlaces relativos y las imágenes de cada documento.'], esperado: 'Los tres existen, el README los enlaza y ningún enlace relativo apunta a un archivo inexistente.' },
  async (c) => {
    const docs = ['docs/manual-usuario.md', 'docs/documentacion-tecnica-final.md', 'docs/evidencias-pipeline-cicd.md'];
    const readme = leerDoc('README.md');
    for (const d of docs) {
      c.verifica(existeArchivo(d) && leerDoc(d).length > 500, `Existe ${d} y tiene contenido`);
      c.verifica(readme.includes(`(${d})`), `El README enlaza ${d}`);
    }
    for (const d of [...docs, 'README.md']) {
      const carpeta = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '';
      const enlaces = [...leerDoc(d).matchAll(/!?\[[^\]]*\]\((?!https?:|#|mailto:)([^)\s#]+)(?:#[^)]*)?\)/g)].map((m) => decodeURIComponent(m[1]));
      const rotos = enlaces.filter((e) => !fs.existsSync(`${ROOT}/${carpeta ? `${carpeta}/` : ''}${e}`.replace(/\/\.\//g, '/')) && !fs.existsSync(`${ROOT}/${e}`));
      c.verifica(rotos.length === 0, `${d}: ${enlaces.length} enlaces internos, ninguno roto`, rotos.join(', '));
    }
  }
);

await S.caso(
  { ...baseDoc, id: 'F-DOC-05', hu: 'PIG1-24', ca: [2], grupo: 'PIG1-24', titulo: 'El manual de usuario describe las pantallas y botones reales de la aplicación', objetivo: 'Verificar que cada botón, menú y mensaje que nombra el manual existe en la interfaz y que las funciones del Sprint 5 (incluida la gestión de canchas) están explicadas.', pasos: ['Extraer del manual los textos en negrita (botones y opciones).', 'Buscar cada uno en el código del frontend.', 'Comprobar que cubre las funciones de cada historia.'], esperado: 'Todos los textos en negrita del manual existen en el frontend, y el manual cubre reservar, cancelar, perfil, tarjetas, verificar códigos, cancelar como administrador y gestionar canchas.' },
  async (c) => {
    const manual = leerDoc('docs/manual-usuario.md');
    const fuentes = sh('git ls-files --cached --others --exclude-standard frontend/src', { cwd: ROOT }).stdout.split(/\r?\n/).filter((f) => /\.(jsx|js)$/.test(f)).map((f) => fs.readFileSync(`${ROOT}/${f}`, 'utf8')).join('\n');
    const negritas = [...new Set([...manual.matchAll(/\*\*([^*]{3,60})\*\*/g)].map((m) => m[1].replace(/[:.]$/, '').trim()))];
    // textos que no son botones de la interfaz (encabezados de ayuda, nombres de campos o conceptos)
    const conceptos = /^(Versión|Aplicación|Dirección local|Pagar en la cancha|Código no encontrado|Verificar|Nueva cancha|Crear cancha|Editar|Desactivar|Activar|Guardar cambios)/;
    const faltan = negritas.filter((t) => !fuentes.includes(t) && !conceptos.test(t));
    c.verifica(negritas.length >= 15, `El manual nombra ${negritas.length} botones y opciones en negrita`);
    c.verifica(faltan.length === 0, 'Todos existen en el código del frontend', faltan.join(' | '));
    for (const t of ['Nueva cancha', 'Crear cancha', 'Guardar cambios', 'Desactivar', 'Activar', 'Sí, desactivar de todos modos', 'Gestionar canchas', 'Marcar como utilizada', 'Cancelar reserva', 'Confirmar reserva', 'Iniciar reserva']) {
      c.verifica(manual.includes(t) && fuentes.includes(t), `"${t}" está en el manual y en la interfaz`);
    }
    for (const [tema, patron] of [['reservar', /Buscar una cancha y reservar/], ['cancelar reservas', /Consultar y cancelar reservas/], ['perfil y tarjetas', /Actualizar el perfil y las tarjetas/], ['verificar códigos', /Verificar el código de una reserva/], ['cancelación administrativa', /Cancelar una reserva como administrador/], ['gestión de canchas', /Gestionar las canchas del catálogo/]]) {
      c.verifica(patron.test(manual), `El manual explica ${tema}`);
    }
    c.verifica(!/no está disponible en esta interfaz/i.test(manual), 'El manual ya no dice que la gestión de canchas no está disponible');
  }
);

await S.caso(
  { ...baseDoc, id: 'F-DOC-06', hu: 'PIG1-24', ca: [1, 3], grupo: 'PIG1-24', titulo: 'La documentación técnica y el pipeline son coherentes con el código', objetivo: 'Verificar que las variables, comandos y endpoints de la documentación técnica existen de verdad y que el workflow despliega desde la rama correcta.', pasos: ['Comprobar las variables de entorno del documento en backend/.env.example y en el código.', 'Comprobar los scripts de npm y los endpoints de gestión de canchas mencionados.', 'Revisar ramas, secretos y jobs del workflow.'], esperado: 'Todo lo que el documento menciona existe; el workflow despliega solo en push a sprint_5 y nunca en pull_request.' },
  async (c) => {
    const tecnica = leerDoc('docs/documentacion-tecnica-final.md');
    const entorno = leerDoc('backend/.env.example') + leerDoc('.env.example') + leerDoc('backend/src/config/env.js');
    const variables = ['JWT_SECRET', 'POSTGRES_PASSWORD', 'DATABASE_URL', 'CORS_ORIGIN', 'SMTP_HOST', 'PASARELA_PAGO', 'EXIGIR_HTTPS_PAGOS', 'TRUST_PROXY', 'HORAS_MIN_CANCELACION', 'MAX_RESERVAS_ACTIVAS_USUARIO'];
    const sinDefinir = variables.filter((v) => !tecnica.includes(v) || !entorno.includes(v));
    c.verifica(sinDefinir.length === 0, `Las ${variables.length} variables del documento existen en la configuración`, sinDefinir.join(', '));
    const scripts = JSON.parse(leerDoc('backend/package.json')).scripts;
    const comandos = [...tecnica.matchAll(/npm run ([a-z:-]+)/g)].map((m) => m[1]).filter((n) => !['dev', 'build', 'lint'].includes(n));
    const inexistentes = [...new Set(comandos)].filter((n) => !scripts[n]);
    c.verifica(inexistentes.length === 0, `Los comandos npm del documento existen en backend/package.json (${new Set(comandos).size})`, inexistentes.join(', '));
    const rutas = [...tecnica.matchAll(/`(GET|POST|PUT|PATCH) (\/api\/admin\/canchas[^`]*)`/g)].map((m) => [m[1].toLowerCase(), m[2].replace(/\{id\}/g, '{id}')]);
    const openapi = createRequire(import.meta.url)('js-yaml').load(leerDoc('backend/openapi/openapi.yaml'));
    const sinDocumentar = rutas.filter(([metodo, ruta]) => !openapi.paths[ruta]?.[metodo]);
    c.verifica(rutas.length >= 6 && sinDocumentar.length === 0, `Los ${rutas.length} endpoints de gestión de canchas del documento están en la especificación OpenAPI`, sinDocumentar.join(', '));
    const flujo = leerDoc('.github/workflows/ci-cd.yml');
    c.verifica(/github\.event_name == 'push' && github\.ref == 'refs\/heads\/sprint_5'/.test(flujo) && !/pull_request[^\n]*deploy/i.test(flujo), 'El despliegue solo corre en push a sprint_5 (nunca en pull_request)');
    c.verifica(['JWT_SECRET', 'POSTGRES_PASSWORD'].every((s) => flujo.includes(`secrets.${s}`)), 'Los secretos se leen de GitHub (secrets), no están en el repositorio');
    c.verifica(/Pipeline-CI\/\*\*/.test(flujo) && /"US-\*\*"/.test(flujo), 'El workflow también corre en las ramas de las historias y de la entrega final');
    const evidencias = leerDoc('docs/evidencias-pipeline-cicd.md');
    const imagenes = [...evidencias.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    c.verifica(imagenes.length >= 2 && imagenes.every((i) => fs.existsSync(`${ROOT}/docs/${i}`) || fs.existsSync(`${ROOT}/${i}`)), `Las ${imagenes.length} capturas de evidencia del pipeline existen`);
  }
);

const r = S.resumen();
console.log('\nFuncionales:', r);
