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
      resultados.push({ estados: [a.status, b.status].sort().join('/'), filas, perdedor: [a, b].find((x) => x.status === 409) });
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
    const estados = [a.status, b.status].sort();
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
    c.verifica(ev && !JSON.stringify(ev.datos).includes(u1.id) && Object.keys(ev.datos).sort().join() === 'canchaId,fecha,horaFin,horaInicio', 'El aviso solo trae la franja: no revela quién la retiene', JSON.stringify(ev?.datos));
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

const r = S.resumen();
console.log('\nFuncionales:', r);
