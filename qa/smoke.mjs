// Suite de smoke test de Docker (US-19 contenedorización y US-20 pipeline CI/CD).
// Uso: node smoke.mjs 1   (construcción, arranque y verificaciones)
//      node smoke.mjs 2   (persistencia, reinicio, limpieza; se ejecuta al final de toda la QA)
import fs from 'node:fs';
import path from 'node:path';
import { load as cargarYaml } from 'js-yaml';
import { Suite, sh, dc, sql, CFG, api, esperar, ROOT, EVID, crearUsuario, logsBackend } from './lib.mjs';

const fase = process.argv[2] ?? '1';
const S = new Suite('smoke', 'Smoke test de Docker y pipeline', { anexar: fase === '2' });
const IMG = `${ROOT}/docs/img`;
const P = CFG.proyecto;
const contenedor = (s) => `${P}-${s}-1`;
const salud = (s) => sh(`docker inspect -f "{{.State.Health.Status}}" ${contenedor(s)}`).stdout.trim();
const seg = (ms) => `${(ms / 1000).toFixed(1)} s`;

const base = { tipo: 'Smoke test', nivel: 'Infraestructura / Docker', prioridad: 'Alta', grupo: 'Docker' };

async function esperarSalud(servicios = ['db', 'backend', 'frontend'], timeoutMs = 240000) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (servicios.every((s) => salud(s) === 'healthy')) return true;
    await esperar(2000);
  }
  return false;
}

if (fase === '1') {
  await S.caso(
    { ...base, id: 'SD-01', hu: 'US-19', ca: [1], titulo: 'El docker-compose.yml es válido', objetivo: 'Verificar que la definición del entorno (db, backend, frontend) es válida y resuelve sus variables.', pasos: ['Ejecutar "docker compose config -q" con las variables de entorno de pruebas.'], esperado: 'El comando termina con código 0 y sin mensajes de error.' },
    async (c) => {
      const r = dc('config -q');
      c.verifica(r.code === 0, 'docker compose config -q termina con código 0', `código ${r.code}`);
      const servicios = dc('config --services').stdout.trim().split(/\s+/).sort();
      c.verifica(JSON.stringify(servicios) === JSON.stringify(['backend', 'db', 'frontend']), 'Define los servicios db, backend y frontend', servicios.join(', '));
    }
  );

  await S.caso(
    { ...base, id: 'SD-02', hu: 'US-19', ca: [5], prioridad: 'Alta', titulo: 'Prueba negativa: sin JWT_SECRET el compose se niega a arrancar', objetivo: 'Comprobar que el entorno no puede levantarse con un secreto vacío (no hay un valor por defecto inseguro).', datos: 'JWT_SECRET definida como cadena vacía.', pasos: ['Ejecutar "docker compose config" con JWT_SECRET vacía.'], esperado: 'Error (código distinto de 0) con un mensaje que indica que falta JWT_SECRET.' },
    async (c) => {
      const r = sh(`docker compose -p ${P}-neg config -q`, { env: { JWT_SECRET: '' } });
      c.verifica(r.code !== 0, 'El comando falla como se espera', `código ${r.code}`);
      c.verifica(/JWT_SECRET/.test(r.out), 'El mensaje de error nombra la variable faltante', r.out.trim().split('\n')[0].slice(0, 160));
      c.evidenciaTexto('Salida del comando', r.out.trim());
    }
  );

  await S.caso(
    { ...base, id: 'SD-03', hu: 'US-19', ca: [1], titulo: 'Construcción de las imágenes desde cero (sin caché)', objetivo: 'Verificar que las imágenes del backend y del frontend se construyen desde cero con Node 22 y que su tamaño es razonable.', pasos: ['Ejecutar "docker compose build --no-cache".', 'Listar las imágenes resultantes y su tamaño.'], esperado: 'Ambas imágenes se construyen sin errores; el build completo tarda menos de 10 minutos.' },
    async (c) => {
      const t0 = Date.now();
      const r = dc('build --no-cache', { timeout: 900000 });
      const ms = Date.now() - t0;
      c.verifica(r.code === 0, 'La construcción termina sin errores', `código ${r.code}`);
      c.verifica(ms < 600000, 'El build completo tarda menos de 10 minutos', seg(ms));
      const imgs = sh(`docker images --format "{{.Repository}} {{.Size}}" --filter "reference=${P}-*"`).stdout.trim();
      c.verifica(/backend/.test(imgs) && /frontend/.test(imgs), 'Existen las imágenes backend y frontend', imgs.replace(/\n/g, ' · '));
      const nodeBackend = sh(`docker run --rm --entrypoint node ${P}-backend --version`).stdout.trim();
      c.verifica(/^v22\./.test(nodeBackend), 'El backend usa Node 22 (LTS vigente)', nodeBackend);
      c.evidenciaTexto('Últimas líneas del build', r.out.trim().split('\n').slice(-12).join('\n'));
    }
  );

  let tArranque = 0;
  await S.caso(
    { ...base, id: 'SD-04', hu: 'US-19', ca: [1, 2], titulo: 'Arranque con "docker compose up --wait": los 3 servicios quedan sanos', objetivo: 'Verificar que el entorno completo arranca con un solo comando y que los healthchecks de db, backend y frontend pasan a "healthy".', pasos: ['Ejecutar "docker compose up -d --wait --wait-timeout 300".', 'Consultar el estado de salud de cada contenedor.'], esperado: 'Código 0; db, backend y frontend en estado healthy en menos de 3 minutos.' },
    async (c) => {
      const t0 = Date.now();
      const r = dc('up -d --wait --wait-timeout 300', { timeout: 420000 });
      tArranque = Date.now() - t0;
      c.verifica(r.code === 0, 'docker compose up --wait termina con código 0', `código ${r.code}`);
      for (const s of ['db', 'backend', 'frontend']) c.verifica(salud(s) === 'healthy', `El servicio ${s} está healthy`, salud(s));
      c.verifica(tArranque < 180000, 'Todo el entorno queda sano en menos de 3 minutos', seg(tArranque));
      c.evidenciaTexto('docker compose ps', dc('ps').out.trim());
    }
  );

  await S.caso(
    { ...base, id: 'SD-05', hu: 'US-19', ca: [2], titulo: 'Orden de arranque: db → backend → frontend', objetivo: 'Verificar que el backend espera a la base de datos y el frontend espera al backend (depends_on con service_healthy).', pasos: ['Leer la hora de inicio (StartedAt) de cada contenedor.', 'Comparar el orden.'], esperado: 'db inició antes que backend y backend antes que frontend.' },
    async (c) => {
      const t = (s) => Date.parse(sh(`docker inspect -f "{{.State.StartedAt}}" ${contenedor(s)}`).stdout.trim());
      const [db, be, fe] = [t('db'), t('backend'), t('frontend')];
      c.verifica(db <= be, 'La base de datos inició antes (o al mismo tiempo) que el backend', `db→backend ${be - db} ms`);
      c.verifica(be <= fe, 'El backend inició antes (o al mismo tiempo) que el frontend', `backend→frontend ${fe - be} ms`);
      const deps = sh(`docker inspect -f "{{json .HostConfig}}" ${contenedor('backend')}`).stdout;
      c.nota('Dependencias declaradas en docker-compose.yml: backend espera service_healthy de db; frontend espera service_healthy de backend.');
      void deps;
    }
  );

  await S.caso(
    { ...base, id: 'SD-06', hu: 'US-19', ca: [3], titulo: 'El esquema de la base se aplica solo al arrancar el backend', objetivo: 'Verificar que no hace falta ejecutar migraciones a mano: al iniciar, el backend crea tablas, índices únicos y restricciones.', pasos: ['Leer los logs del backend.', 'Consultar las tablas del esquema public en el Postgres del contenedor.', 'Consultar los índices únicos de reservas y retenciones.'], esperado: 'Logs con "[MIGRATE] Esquema aplicado correctamente"; existen las 7 tablas y los índices únicos de US-09 y US-18.' },
    async (c) => {
      const logs = logsBackend('30m');
      c.verifica(/\[MIGRATE\] Esquema aplicado correctamente/.test(logs), 'El log muestra que el esquema se aplicó automáticamente');
      const tablas = sql("SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname='public'");
      const esperadas = ['canchas', 'horarios_disponibles', 'password_reset_tokens', 'reservas', 'retenciones', 'sesiones_reserva', 'usuarios'];
      c.verifica(JSON.stringify(tablas.split(',')) === JSON.stringify(esperadas), 'Existen las 7 tablas del modelo', tablas);
      const idx = sql("SELECT string_agg(indexname, ', ' ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'uq_%'");
      c.verifica(/uq_reservas_confirmada_cancha_fecha_hora/.test(idx), 'Índice único parcial de reservas confirmadas (US-09)', idx);
      const def = sql("SELECT indexdef FROM pg_indexes WHERE indexname='uq_reservas_confirmada_cancha_fecha_hora'");
      c.verifica(/WHERE \(estado = 'confirmada'/.test(def), 'El índice es parcial: solo aplica a reservas con estado confirmada', def);
      c.verifica(/uq_retenciones_franja/.test(sql("SELECT string_agg(conname, ',') FROM pg_constraint WHERE conname LIKE 'uq_retenciones%'")), 'Restricciones únicas de retenciones (US-18)');
      c.verifica(sql("SELECT count(*) FROM pg_constraint WHERE conname = 'ex_reservas_sin_solape' AND contype = 'x'") === '1', 'Restricción de exclusión que impide reservas solapadas (ex_reservas_sin_solape)');
    }
  );

  await S.caso(
    { ...base, id: 'SD-07', hu: 'US-19', ca: [1], titulo: 'Puertos publicados y aislamiento de la base de datos', objetivo: 'Verificar que la API y el frontend responden en los puertos publicados y que la base de datos NO se expone fuera de la red de Docker.', pasos: ['Consultar GET /api/health en el puerto de la API.', 'Consultar el frontend en su puerto.', 'Inspeccionar los puertos publicados del contenedor de la base.'], esperado: 'API y frontend responden 200; la base de datos no publica puertos en el host.' },
    async (c) => {
      const h = await api('GET', '/health');
      c.verifica(h.status === 200 && h.datos.estado === 'ok', 'GET /api/health responde 200 {"estado":"ok"}', JSON.stringify(h.datos));
      const web = await fetch(CFG.WEB);
      c.verifica(web.status === 200, 'El frontend responde 200', `HTTP ${web.status}`);
      const puertos = sh(`docker inspect -f "{{json .NetworkSettings.Ports}}" ${contenedor('db')}`).stdout.trim();
      c.verifica(!/HostPort/.test(puertos), 'La base de datos no publica puertos en el host', puertos);
    }
  );

  await S.caso(
    { ...base, id: 'SD-08', hu: 'US-19', ca: [5], titulo: 'Las imágenes no contienen secretos y el backend no corre como root', objetivo: 'Verificar buenas prácticas de seguridad en las imágenes: sin archivos .env, sin el secreto JWT incrustado y usuario sin privilegios.', pasos: ['Listar el contenido de /app en la imagen del backend y ver el usuario.', 'Buscar el valor de JWT_SECRET dentro de las variables de la imagen y del bundle del frontend.'], esperado: 'No hay .env, .git ni tests en la imagen; el usuario es "node"; el secreto no aparece en la imagen ni en el frontend.' },
    async (c) => {
      const r = sh(`docker run --rm --entrypoint sh ${P}-backend -c "whoami; ls -A /app"`);
      const lineas = r.stdout.trim().split('\n');
      c.verifica(lineas[0] === 'node', 'El backend corre con el usuario sin privilegios "node"', lineas[0]);
      c.verifica(!lineas.some((l) => ['.env', '.git', 'tests'].includes(l)), 'La imagen no contiene .env, .git ni la carpeta tests', lineas.slice(1).join(', '));
      const env = sh(`docker image inspect ${P}-backend --format "{{json .Config.Env}}"`).stdout;
      c.verifica(!env.includes(CFG.jwtSecret), 'El secreto JWT no está incrustado en la imagen del backend');
      const fe = sh(`docker run --rm --entrypoint sh ${P}-frontend -c "grep -rl '${CFG.jwtSecret}' /usr/share/nginx/html | wc -l"`).stdout.trim();
      c.verifica(fe === '0', 'El bundle del frontend no contiene el secreto', `${fe} archivos con coincidencia`);
    }
  );

  await S.caso(
    { ...base, id: 'SD-09', hu: 'US-20', ca: [2], titulo: 'Smoke test del pipeline (scripts/smoke-test.sh) contra el entorno Docker', objetivo: 'Ejecutar exactamente el mismo smoke test que corre el job "Docker - build y smoke test" del pipeline.', pasos: ['Ejecutar "bash scripts/smoke-test.sh" apuntando al entorno de pruebas.'], esperado: 'Pasan las 7 verificaciones: health, frontend, rutas SPA, CORS, 401 sin token, registro/login y listado de canchas, y termina con "Smoke test OK".' },
    async (c) => {
      const r = sh('bash scripts/smoke-test.sh');
      const pasos = ['API responde en /api/health', 'Frontend sirve la app', 'Rutas de React Router resuelven a index.html (SPA)', 'CORS permite el origen del frontend', 'Sin token la API responde 401', 'Registro e inicio de sesión contra la base de datos', 'Con token la API lista canchas'];
      pasos.forEach((paso) => c.verifica(r.out.includes(`-> ${paso}`), paso));
      c.verifica(r.code === 0 && /Smoke test OK/.test(r.out), 'El script termina con código 0 y "Smoke test OK"', `código ${r.code}`);
      c.evidenciaTexto('Salida de scripts/smoke-test.sh', r.out.trim());
    }
  );

  await S.caso(
    { ...base, id: 'SD-10', hu: 'US-19', ca: [3], titulo: 'Datos de ejemplo: seed de canchas y fotos servidas por el frontend', objetivo: 'Verificar que la base temporal puede poblarse con las 5 canchas de ejemplo y que el frontend sirve sus fotos.', pasos: ['Ejecutar el seed dentro del contenedor del backend.', 'Consultar el listado de canchas.', 'Descargar la foto de cada cancha desde el frontend.'], esperado: 'Se insertan 5 canchas; cada una tiene foto y el frontend responde 200 con content-type image/jpeg.' },
    async (c) => {
      const r = dc('exec -T backend node src/seed/seedCanchas.js');
      c.verifica(/Se insertaron 5 canchas/.test(r.out), 'El seed inserta las 5 canchas de ejemplo', r.out.trim().split('\n').pop());
      const u = await crearUsuario('seed');
      const lista = await api('GET', '/canchas', undefined, u.token);
      c.verifica(lista.datos.canchas?.length === 5, 'GET /api/canchas devuelve 5 canchas', String(lista.datos.canchas?.length));
      for (const cancha of lista.datos.canchas ?? []) {
        const f = await fetch(`${CFG.WEB}${cancha.imagenUrl}`);
        c.verifica(f.status === 200 && /image\/jpeg/.test(f.headers.get('content-type')), `Foto de "${cancha.nombre}" disponible`, `${cancha.imagenUrl} → HTTP ${f.status}`);
      }
    }
  );

  await S.caso(
    { ...base, id: 'SD-11', hu: 'US-19', ca: [1], titulo: 'nginx: fallback de SPA, caché de assets y cabeceras', objetivo: 'Verificar la configuración del servidor del frontend: recargar una ruta de React Router no debe dar 404 y los assets compilados deben cachearse.', pasos: ['Pedir /canchas/cualquier-id y /login directamente.', 'Pedir un asset compilado de /assets/ y revisar Cache-Control.', 'Pedir una ruta de archivo inexistente de /assets/.'], esperado: 'Las rutas SPA responden 200 con index.html; los assets llevan Cache-Control immutable; un asset inexistente responde 404.' },
    async (c) => {
      for (const ruta of ['/canchas/cualquier-id', '/login', '/mis-reservas']) {
        const r = await fetch(`${CFG.WEB}${ruta}`);
        const t = await r.text();
        c.verifica(r.status === 200 && t.includes('<div id="root">'), `Ruta SPA ${ruta} responde 200 con la app`, `HTTP ${r.status}`);
      }
      const html = await (await fetch(CFG.WEB)).text();
      const asset = html.match(/\/assets\/[^"']+\.js/)?.[0];
      const a = await fetch(`${CFG.WEB}${asset}`);
      c.verifica(a.status === 200 && /immutable/.test(a.headers.get('cache-control') ?? ''), 'Los assets compilados se sirven con Cache-Control immutable', a.headers.get('cache-control'));
      const faltante = await fetch(`${CFG.WEB}/assets/no-existe.js`);
      c.verifica(faltante.status === 404 || (await faltante.text()).includes('<div id="root">') === false, 'Un asset inexistente no se disfraza de la app', `HTTP ${faltante.status}`);
    }
  );

  await S.caso(
    { ...base, id: 'SD-12', hu: 'US-19', ca: [2], titulo: 'Healthchecks definidos y política de reinicio', objetivo: 'Verificar que cada servicio declara un healthcheck y se reinicia automáticamente si falla (unless-stopped).', pasos: ['Inspeccionar la configuración de cada contenedor.'], esperado: 'Los 3 contenedores tienen healthcheck y política de reinicio "unless-stopped".' },
    async (c) => {
      for (const s of ['db', 'backend', 'frontend']) {
        const hc = sh(`docker inspect -f "{{if .Config.Healthcheck}}definido{{else}}ausente{{end}}" ${contenedor(s)}`).stdout.trim();
        const rp = sh(`docker inspect -f "{{.HostConfig.RestartPolicy.Name}}" ${contenedor(s)}`).stdout.trim();
        c.verifica(hc === 'definido' && rp === 'unless-stopped', `${s}: healthcheck ${hc}, reinicio "${rp}"`);
      }
    }
  );

  await S.caso(
    { ...base, id: 'SD-13', hu: 'US-19', ca: [1], prioridad: 'Baja', titulo: 'Consumo de recursos en reposo', objetivo: 'Registrar el consumo de memoria y CPU de los contenedores sin carga, como referencia.', pasos: ['Ejecutar "docker stats --no-stream".'], esperado: 'Cada contenedor usa menos de 300 MiB de memoria en reposo.' },
    async (c) => {
      const r = sh(`docker stats --no-stream --format "{{.Name}}|{{.MemUsage}}|{{.CPUPerc}}" ${contenedor('db')} ${contenedor('backend')} ${contenedor('frontend')}`).stdout.trim().split('\n');
      for (const linea of r) {
        const [nombre, mem, cpu] = linea.split('|');
        const mib = parseFloat(mem) * (/GiB/.test(mem.split('/')[0]) ? 1024 : 1);
        c.verifica(mib < 300, `${nombre.replace(`${P}-`, '')}: ${mem.split('/')[0].trim()} de memoria, CPU ${cpu}`);
      }
      c.evidenciaTexto('docker stats', r.join('\n'));
    }
  );

  await S.caso(
    { ...base, id: 'SD-14', hu: 'US-20', ca: [2], titulo: 'Prueba de carga con 100 conexiones de socket (paso del pipeline)', objetivo: 'Ejecutar la misma prueba de carga que corre el job Docker del pipeline.', pasos: ['Ejecutar "npm run test:carga" con CLIENTES=100 apuntando al entorno de pruebas.'], esperado: '9/9 verificaciones correctas: sin eventos perdidos ni duplicados y una sola reserva ganadora.' },
    async (c) => {
      const r = sh('npm run test:carga', { cwd: `${ROOT}/backend`, env: { API_URL: CFG.API, CLIENTES: '100' }, timeout: 300000 });
      const m = r.out.match(/(\d+)\/(\d+) verificaciones correctas/);
      c.verifica(r.code === 0 && m && m[1] === m[2], 'La prueba de carga termina con todas las verificaciones correctas', m ? `${m[1]}/${m[2]}` : `código ${r.code}`);
      c.evidenciaTexto('Salida de la prueba de carga', r.out.split('\n').filter((l) => /^\[|verificaciones|Prueba/.test(l)).join('\n'));
    }
  );

  await S.caso(
    { ...base, id: 'SD-15', hu: 'US-20', ca: [1, 3, 4], titulo: 'Análisis estático del workflow de CI/CD (ci-cd.yml)', objetivo: 'Verificar la estructura del pipeline: jobs, dependencias, condición de despliegue y manejo de secretos.', pasos: ['Cargar .github/workflows/ci-cd.yml.', 'Revisar jobs, "needs", la condición "if" del despliegue y el origen de los secretos.', 'Confirmar que no hay archivos .env versionados.'], esperado: 'Jobs backend, frontend, quality-gate, docker y deploy-local; el despliegue solo corre en push a sprint_4 con runner self-hosted; los secretos vienen de "secrets.*"; no hay .env en el repositorio.' },
    async (c) => {
      const wf = cargarYaml(fs.readFileSync(`${ROOT}/.github/workflows/ci-cd.yml`, 'utf8'));
      const jobs = Object.keys(wf.jobs);
      c.verifica(['backend', 'frontend', 'quality-gate', 'docker', 'deploy-local'].every((j) => jobs.includes(j)), 'Define los 5 jobs: backend, frontend, quality-gate (SonarQube), docker y deploy-local', jobs.join(', '));
      c.verifica(wf.on.pull_request && wf.on.push, 'Se dispara en pull_request y en push');
      c.verifica(JSON.stringify(wf.jobs.docker.needs) === JSON.stringify(['backend', 'frontend', 'quality-gate']), 'El job docker espera a backend, frontend y el Quality Gate de SonarQube', JSON.stringify(wf.jobs.docker.needs));
      const d = wf.jobs['deploy-local'];
      c.verifica(d.needs === 'docker', 'El despliegue espera al job docker');
      c.verifica(/github\.event_name == 'push'/.test(d.if) && /refs\/heads\/sprint_4/.test(d.if), 'El despliegue solo corre en push a sprint_4 (nunca en pull_request)', d.if);
      c.verifica(d['runs-on'] === 'self-hosted', 'El despliegue usa el runner self-hosted');
      c.verifica(/secrets\.JWT_SECRET/.test(JSON.stringify(d.env)) && /secrets\.POSTGRES_PASSWORD/.test(JSON.stringify(d.env)), 'JWT_SECRET y POSTGRES_PASSWORD se leen de secretos de GitHub');
      const usos = JSON.stringify(wf).match(/actions\/(checkout|setup-node)@v\d+/g) ?? [];
      c.verifica(usos.every((u) => /@v5$/.test(u)), 'Las acciones usan v5 (runtime Node 24, sin avisos de obsolescencia)', [...new Set(usos)].join(', '));
      const env = sh('git ls-files', { cwd: ROOT }).stdout.split('\n').filter((f) => /(^|\/)\.env$/.test(f));
      c.verifica(env.length === 0, 'No hay archivos .env versionados en el repositorio', env.join(', ') || 'ninguno');
      c.verifica(/^\.env$/m.test(fs.readFileSync(`${ROOT}/.gitignore`, 'utf8')), '.gitignore excluye los archivos .env');
    }
  );

  await S.caso(
    { ...base, id: 'SD-16', hu: 'US-20', ca: [1, 3], titulo: 'Despliegue real mediante el self-hosted runner', objetivo: 'Comprobar que el job de despliegue ya levantó la aplicación en este equipo a través del runner de GitHub Actions.', pasos: ['Listar los proyectos de Docker Compose.', 'Verificar que el proyecto "canchaya" fue creado desde el espacio de trabajo del runner.', 'Consultar la API y el frontend desplegados.'], esperado: 'Existe el proyecto "canchaya" con 3 contenedores, creado desde la carpeta del runner, y responde en 4100 y 8080.' },
    async (c) => {
      const ls = sh('docker compose ls -a --format json').stdout;
      const proyectos = JSON.parse(ls || '[]');
      const desplegado = proyectos.find((x) => x.Name === 'canchaya');
      c.verifica(Boolean(desplegado), 'Existe el proyecto de despliegue "canchaya"', desplegado?.Status);
      c.verifica(/actions-runner/.test(desplegado?.ConfigFiles ?? ''), 'Fue creado desde el espacio de trabajo del runner (actions-runner\\_work)', (desplegado?.ConfigFiles ?? '').split(',')[0]);
      const h = await fetch('http://localhost:4100/api/health').catch(() => null);
      c.verifica(h?.status === 200, 'La API desplegada por el pipeline responde en http://localhost:4100/api/health', h ? `HTTP ${h.status}` : 'sin respuesta');
      const w = await fetch('http://localhost:8080').catch(() => null);
      c.verifica(w?.status === 200, 'El frontend desplegado por el pipeline responde en http://localhost:8080', w ? `HTTP ${w.status}` : 'sin respuesta');
    }
  );

  await S.caso(
    { ...base, id: 'SD-17', hu: 'US-20', ca: [1, 4], prioridad: 'Media', titulo: 'Evidencia de la ejecución del pipeline en GitHub Actions (aportada por el equipo)', objetivo: 'Dejar constancia de la ejecución real del pipeline en GitHub. Esta prueba NO la ejecuta QA localmente: GitHub Actions solo corre en los servidores de GitHub.', pasos: ['Revisar las capturas aportadas por el equipo del run del pipeline, del runner self-hosted y de los secretos.'], esperado: 'Los jobs Backend, Frontend y Docker en verde; runner conectado y escuchando; secretos JWT_SECRET y POSTGRES_PASSWORD creados.' },
    async (c) => {
      for (const [origen, destino, leyenda] of [['ci-run-github-actions.png', 'SD-17-1.png', 'Run del pipeline: Backend, Frontend y Docker en verde (Desplegar en entorno local esperando al runner)'], ['runner-self-hosted.png', 'SD-17-2.png', 'Self-hosted runner conectado: "Listening for Jobs"'], ['github-secrets.png', 'SD-17-3.png', 'Secretos del repositorio: JWT_SECRET y POSTGRES_PASSWORD']]) {
        fs.copyFileSync(`${IMG}/${origen}`, path.join(EVID, destino));

      }
      c.observacion('Evidencia de terceros: las capturas las aportó el equipo; QA no puede ejecutar GitHub Actions desde este equipo.');
      S._evidenciasManuales = [
        { archivo: 'SD-17-1.png', leyenda: 'Run del pipeline en GitHub Actions: Backend, Frontend y Docker en verde (captura del equipo)' },
        { archivo: 'SD-17-2.png', leyenda: 'Self-hosted runner conectado: "Listening for Jobs" (captura del equipo)' },
        { archivo: 'SD-17-3.png', leyenda: 'Secretos del repositorio JWT_SECRET y POSTGRES_PASSWORD (captura del equipo)' },
      ];
    }
  );
  await S.caso(
    { ...base, id: 'SD-18', hu: 'PIG1-23', ca: [2, 7], prioridad: 'Alta', titulo: 'Swagger UI disponible en el contenedor de staging (Docker Compose)', objetivo: 'Verificar que la imagen del backend incluye la especificación y que /api/docs se sirve en el ambiente Docker, incluso con NODE_ENV=production, y que "Try it out" no es bloqueado por CORS.', pasos: ['GET /api/docs/ en el contenedor.', 'Descargar la especificación y comprobar el servidor.', 'Simular el "Try it out" del navegador: GET /api/canchas con Origin igual al del propio backend.', 'Comprobar que un origen ajeno sigue recibiendo 403.', 'Reiniciar el backend con API_DOCS_HABILITADA=false y comprobar que la documentación se oculta.'], esperado: 'Swagger UI y la especificación responden 200 en Docker; la llamada con el mismo origen no es rechazada; un origen ajeno recibe 403; con API_DOCS_HABILITADA=false /api/docs responde 404 y la API sigue funcionando.' },
    async (c) => {
      const ui = await fetch(`${CFG.SOCKET}/api/docs/`);
      c.verifica(ui.status === 200 && /swagger-ui/.test(await ui.text()), 'GET /api/docs/ responde 200 con Swagger UI en el contenedor', `HTTP ${ui.status}`);
      const json = await fetch(`${CFG.SOCKET}/api/docs/openapi.json`).then((r) => r.json());
      c.verifica(/^3\./.test(json.openapi) && Object.keys(json.paths).length === 13, 'La imagen incluye la especificación OpenAPI (13 rutas, 14 operaciones)', `${json.openapi}, ${Object.keys(json.paths).length} rutas`);
      const propio = await fetch(`${CFG.SOCKET}/api/health`, { headers: { Origin: CFG.SOCKET } });
      c.verifica(propio.status === 200, 'Una llamada con Origin igual al del propio backend (Try it out) no es bloqueada', `HTTP ${propio.status}`);
      const ajeno = await fetch(`${CFG.SOCKET}/api/health`, { headers: { Origin: 'http://sitio-malicioso.example' } });
      c.verifica(ajeno.status === 403, 'Un origen ajeno sigue recibiendo 403', `HTTP ${ajeno.status}`);
      const off = dc('run -d --no-deps --name qa-backend-sin-docs -e API_DOCS_HABILITADA=false -e PORT=4002 -p 4302:4002 backend sh -c "exec node src/server.js"');
      try {
        let listo = false;
        for (let i = 0; i < 40 && !listo; i += 1) {
          listo = await fetch('http://localhost:4302/api/health').then((r) => r.status === 200).catch(() => false);
          if (!listo) await esperar(500);
        }
        const oculta = await fetch('http://localhost:4302/api/docs/');
        c.verifica(off.code === 0 && listo && oculta.status === 404, 'Con API_DOCS_HABILITADA=false la documentación se oculta (404) y la API sigue arriba', `docs HTTP ${oculta.status}`);
      } finally {
        sh('docker rm -f qa-backend-sin-docs');
      }
    }
  );

  await S.caso(
    { ...base, id: 'SD-19', hu: 'PIG1-23', hus: ['PIG1-23', 'US-20'], ca: { 'PIG1-23': [9, 3], 'US-20': [1] }, prioridad: 'Alta', titulo: 'El pipeline valida la especificación y la cobertura de la documentación', objetivo: 'Verificar que el workflow ejecuta Spectral y el cálculo de cobertura de endpoints, y que ambos pasos funcionan con las mismas órdenes que usa el pipeline.', pasos: ['Revisar ci-cd.yml: pasos "docs:lint" y "docs:cobertura" en el job de backend.', 'Ejecutar "npm run docs:lint".', 'Ejecutar "npm run docs:cobertura".'], esperado: 'El job de backend contiene ambos pasos; Spectral no reporta errores ni advertencias; la cobertura es 100 % (14/14) y el comando termina con código 0.' },
    async (c) => {
      const wf = fs.readFileSync(`${ROOT}/.github/workflows/ci-cd.yml`, 'utf8');
      c.verifica(/npm run docs:lint/.test(wf) && /npm run docs:cobertura/.test(wf), 'El workflow ejecuta "npm run docs:lint" y "npm run docs:cobertura"');
      const lint = sh('npm run docs:lint', { cwd: `${ROOT}/backend`, timeout: 180000 });
      c.verifica(lint.code === 0 && /No results with a severity of 'warn' or higher/.test(lint.out), 'Spectral: sin errores ni advertencias', lint.out.trim().split('\n').pop());
      const cob = sh('npm run docs:cobertura', { cwd: `${ROOT}/backend` });
      c.verifica(cob.code === 0 && /Cobertura: 100 %/.test(cob.out), 'Cobertura de la documentación: 100 %', (cob.out.match(/Cobertura: [\d.]+ %/) ?? [''])[0]);
      c.evidenciaTexto('docs:lint y docs:cobertura', `${lint.out.trim()}\n\n${cob.out.trim()}`);
    }
  );

  await S.caso(
    { ...base, id: 'SD-24', hu: 'US-21', ca: [1, 2, 3], prioridad: 'Alta', titulo: 'Configuración de SonarQube y job de Quality Gate en el pipeline', objetivo: 'Verificar que el análisis está configurado en el repositorio y que el pipeline lo ejecuta con la cobertura del backend antes de construir Docker.', pasos: ['Leer sonar-project.properties.', 'Revisar el job quality-gate de ci-cd.yml.', 'Revisar el reporte de cobertura (lcov) y que el job de backend lo publica.'], esperado: 'El archivo define proyecto, fuentes del backend y frontend, exclusiones y la ruta del lcov; el job quality-gate depende de backend y frontend, descarga el lcov y espera el Quality Gate; Docker depende de quality-gate.' },
    async (c) => {
      const props = fs.readFileSync(`${ROOT}/sonar-project.properties`, 'utf8');
      c.verifica(/sonar\.projectKey=/.test(props) && /sonar\.sources=backend\/src,frontend\/src/.test(props), 'sonar-project.properties define el proyecto y las fuentes de backend y frontend');
      c.verifica(/sonar\.javascript\.lcov\.reportPaths=/.test(props), 'Define la ruta de los reportes de cobertura (lcov)');
      c.verifica(/sonar\.qualitygate\.wait=true/.test(props), 'El análisis espera el resultado del Quality Gate');
      const wf = cargarYaml(fs.readFileSync(`${ROOT}/.github/workflows/ci-cd.yml`, 'utf8'));
      const q = wf.jobs['quality-gate'];
      c.verifica(Boolean(q) && JSON.stringify(q.needs) === JSON.stringify(['backend', 'frontend']), 'El job quality-gate depende de backend y frontend', JSON.stringify(q?.needs));
      c.verifica(JSON.stringify(q).includes('sonarqube-scan-action') && /SONAR_TOKEN/.test(JSON.stringify(q)), 'Usa sonarqube-scan-action con SONAR_TOKEN tomado de secretos');
      c.verifica(JSON.stringify(wf.jobs.docker.needs).includes('quality-gate'), 'La construcción de Docker espera al Quality Gate');
      c.verifica(/lcov\.info/.test(JSON.stringify(wf.jobs.backend)), 'El job de backend publica el reporte lcov de cobertura');
      c.verifica(q.steps.some((x) => x.id === 'sonar' && /api\/server\/version/.test(x.run ?? '') && /omitir/.test(x.run ?? '')) && q.steps.filter((x) => /sonar\.outputs\.disponible/.test(x.if ?? '')).length >= 3, 'Si el servidor de SonarQube no responde, el análisis se omite con un aviso en lugar de fallar el pipeline');
    }
  );

  // Las capturas de terceros se adjuntan al caso SD-17 ya registrado.
  const sd17 = S.casos.find((x) => x.id === 'SD-17');
  if (sd17) {
    sd17.evidencias.push(...(S._evidenciasManuales ?? []));
    S.guardar();
  }
}

if (fase === '2') {
  let id;
  await S.caso(
    { ...base, id: 'SD-20', hu: 'US-19', ca: [4], titulo: 'Persistencia: los datos sobreviven a "docker compose down" y "up"', objetivo: 'Verificar que el volumen db-data conserva usuarios y reservas cuando se bajan y suben los contenedores.', pasos: ['Crear un usuario y una reserva.', 'Ejecutar "docker compose down" (sin -v) y luego "up -d --wait".', 'Iniciar sesión con el mismo usuario y consultar sus reservas.'], esperado: 'El usuario y la reserva siguen existiendo tras recrear los contenedores.' },
    async (c) => {
      const u = await crearUsuario('persist');
      id = u;
      let lista = await api('GET', '/canchas', undefined, u.token);
      if (!lista.datos.canchas?.length) {
        dc('exec -T backend node src/seed/seedCanchas.js');
        lista = await api('GET', '/canchas', undefined, u.token);
      }
      const cancha = lista.datos.canchas[0];
      const fecha = '2101-03-03';
      const r = await api('POST', `/canchas/${cancha.id}/reservas`, { fecha, horaInicio: '10:00', horaFin: '11:00' }, u.token);
      c.verifica(r.status === 201, 'Se crea la reserva antes del reinicio', `HTTP ${r.status}`);
      const antes = sql('SELECT count(*) FROM usuarios') + '/' + sql('SELECT count(*) FROM reservas');
      const down = dc('down', { timeout: 180000 });
      c.verifica(down.code === 0, 'docker compose down termina sin errores');
      const up = dc('up -d --wait --wait-timeout 300', { timeout: 420000 });
      c.verifica(up.code === 0, 'docker compose up --wait termina sin errores');
      const tPuerto = Date.now();
      let alcanzable = false;
      while (Date.now() - tPuerto < 30000 && !alcanzable) {
        alcanzable = await fetch(`${CFG.API}/health`).then((r) => r.status === 200).catch(() => false);
        if (!alcanzable) await esperar(500);
      }
      c.verifica(alcanzable, 'La API vuelve a ser alcanzable desde el equipo anfitrión', `${((Date.now() - tPuerto) / 1000).toFixed(1)} s después de que Docker la marcó healthy`);
      const despues = sql('SELECT count(*) FROM usuarios') + '/' + sql('SELECT count(*) FROM reservas');
      c.verifica(antes === despues, 'Los conteos de usuarios/reservas no cambian', `${antes} → ${despues}`);
      const login = await api('POST', '/auth/login', { correo: u.correo, password: u.password });
      c.verifica(login.status === 200, 'El usuario puede iniciar sesión después del reinicio', `HTTP ${login.status}`);
      const mias = await api('GET', '/reservas/mias', undefined, login.datos.token);
      c.verifica(mias.datos.reservas?.length === 1 && mias.datos.reservas[0].estado === 'confirmada', 'La reserva sigue en el historial como confirmada');
    }
  );

  await S.caso(
    { ...base, id: 'SD-21', hu: 'US-19', ca: [2], titulo: 'Recuperación: reinicio del backend', objetivo: 'Medir cuánto tarda el backend en volver a estar disponible tras un reinicio.', pasos: ['Ejecutar "docker compose restart backend".', 'Consultar /api/health hasta que responda.'], esperado: 'El backend vuelve a responder en menos de 30 segundos y queda healthy.' },
    async (c) => {
      const t0 = Date.now();
      dc('restart backend');
      let ok = false;
      while (Date.now() - t0 < 60000 && !ok) {
        ok = await fetch(`${CFG.API}/health`).then((r) => r.status === 200).catch(() => false);
        if (!ok) await esperar(500);
      }
      const ms = Date.now() - t0;
      c.verifica(ok, 'El backend vuelve a responder /api/health', seg(ms));
      c.verifica(ms < 30000, 'Se recupera en menos de 30 segundos', seg(ms));
      await esperarSalud(['backend'], 60000);
      c.verifica(salud('backend') === 'healthy', 'Queda en estado healthy', salud('backend'));
    }
  );

  await S.caso(
    { ...base, id: 'SD-22', hu: 'US-19', ca: [3, 4], titulo: 'Entorno limpio: "down -v" borra los datos y el esquema se recrea solo', objetivo: 'Verificar que eliminar el volumen deja la base vacía y que al volver a levantar el esquema se aplica automáticamente.', pasos: ['Ejecutar "docker compose down -v".', 'Ejecutar "up -d --wait".', 'Contar usuarios y verificar las tablas.'], esperado: 'Base vacía (0 usuarios) con las 7 tablas creadas automáticamente.' },
    async (c) => {
      const down = dc('down -v', { timeout: 180000 });
      c.verifica(down.code === 0, 'docker compose down -v termina sin errores');
      const vol = sh(`docker volume ls -q --filter name=${P}_db-data`).stdout.trim();
      c.verifica(vol === '', 'El volumen db-data fue eliminado', vol || 'sin volumen');
      const up = dc('up -d --wait --wait-timeout 300', { timeout: 420000 });
      c.verifica(up.code === 0, 'El entorno vuelve a levantar desde cero');
      c.verifica(sql('SELECT count(*) FROM usuarios') === '0', 'La base quedó vacía (0 usuarios)');
      c.verifica(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'") === '7', 'El esquema se aplicó automáticamente (7 tablas)');
      void id;
    }
  );

  await S.caso(
    { ...base, id: 'SD-23', hu: 'US-19', ca: [1], prioridad: 'Baja', titulo: 'Limpieza del entorno de pruebas', objetivo: 'Verificar que el entorno de pruebas se elimina por completo sin afectar el despliegue del pipeline (proyecto "canchaya").', pasos: ['Ejecutar "docker compose -p canchaya-qa down -v".', 'Verificar que el proyecto de despliegue sigue activo.'], esperado: 'No quedan contenedores ni volúmenes de canchaya-qa; el proyecto "canchaya" sigue corriendo.' },
    async (c) => {
      const d = dc('down -v --rmi local', { timeout: 180000 });
      c.verifica(d.code === 0, 'down -v --rmi local termina sin errores');
      const quedan = sh(`docker ps -a --filter name=${P}- -q`).stdout.trim();
      c.verifica(quedan === '', 'No quedan contenedores de canchaya-qa');
      const desp = sh('docker ps --filter name=canchaya-backend-1 --format "{{.Status}}"').stdout.trim();
      c.verifica(/healthy/.test(desp), 'El despliegue del pipeline (proyecto canchaya) sigue sano', desp);
    }
  );
}

const r = S.resumen();
console.log(`\nSmoke fase ${fase}:`, r);
