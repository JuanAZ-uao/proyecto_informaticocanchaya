// Análisis de calidad con SonarQube (US-21): levanta un SonarQube Community local en Docker, genera la
// cobertura del backend, ejecuta sonar-scanner con la configuración versionada del repositorio
// (sonar-project.properties) y guarda el Quality Gate, las métricas y los hallazgos en
// resultados/sonar-<n>.json, con capturas del tablero.
//   node sonar.mjs 1        → primer análisis (línea base)
//   node sonar.mjs 2        → segundo análisis (tras corregir hallazgos)
//   node sonar.mjs --bajar  → elimina el contenedor de SonarQube
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { sh, ROOT, OUT, EVID, esperar } from './lib.mjs';

const CONTENEDOR = 'canchaya-sonarqube';
const PUERTO = 9000;
const URL_SONAR = `http://localhost:${PUERTO}`;
const CLAVE_PROYECTO = 'canchaya';
const CLAVE_ADMIN = 'CanchaYa-Qa-2026-x';
const arg = process.argv[2] ?? '1';

// El argumento forma parte de nombres de archivo (sonar-<arg>.json): solo se admite una etiqueta simple.
if (arg !== '--bajar' && !/^[\w.-]{1,20}$/.test(arg)) {
  console.error('Uso: node sonar.mjs <etiqueta: letras, números, punto o guion> | --bajar');
  process.exit(1);
}

if (arg === '--bajar') {
  sh(`docker rm -f ${CONTENEDOR}`);
  console.log('SonarQube eliminado.');
  process.exit(0);
}

const basic = (clave) => `Basic ${Buffer.from(`admin:${clave}`).toString('base64')}`;
let autorizacion = basic(CLAVE_ADMIN);
// Docker Desktop corta a veces una conexión local; se reintenta antes de rendirse.
async function pedir(url, opciones) {
  for (let intento = 0; ; intento += 1) {
    try {
      return await fetch(url, opciones);
    } catch (error) {
      if (intento >= 5) throw error;
      await esperar(1500);
    }
  }
}

async function api(ruta, { metodo = 'GET', cuerpo, auth = autorizacion } = {}) {
  const res = await pedir(`${URL_SONAR}${ruta}`, {
    method: metodo,
    headers: { Authorization: auth, ...(cuerpo ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: cuerpo ? new URLSearchParams(cuerpo).toString() : undefined,
  });
  const texto = await res.text();
  let datos;
  try { datos = JSON.parse(texto); } catch { datos = texto; }
  return { status: res.status, datos };
}

// ---------- 1. SonarQube ----------
async function asegurarSonarQube() {
  const existe = sh(`docker ps -a --filter name=^${CONTENEDOR}$ --format "{{.Status}}"`).stdout.trim();
  if (!existe) {
    console.log('Creando el contenedor de SonarQube Community…');
    const r = sh(`docker run -d --name ${CONTENEDOR} -p ${PUERTO}:9000 -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true sonarqube:community`);
    if (r.code !== 0) throw new Error(`No se pudo iniciar SonarQube: ${r.out}`);
  } else if (!/^Up/.test(existe)) {
    sh(`docker start ${CONTENEDOR}`);
  }
  for (let i = 0; i < 180; i += 1) {
    const estado = await fetch(`${URL_SONAR}/api/system/status`).then((r) => r.json()).catch(() => null);
    if (estado?.status === 'UP') return estado;
    if (i % 10 === 0) console.log(`  esperando a SonarQube… (${estado?.status ?? 'sin respuesta'})`);
    await esperar(5000);
  }
  throw new Error('SonarQube no llegó a estado UP');
}

async function prepararCredenciales() {
  // Primer arranque: admin/admin debe cambiarse. Si ya se cambió, la clave nueva funciona.
  const prueba = await api('/api/authentication/validate', { auth: basic(CLAVE_ADMIN) });
  if (prueba.datos?.valid === true) return;
  const cambio = await api('/api/users/change_password', { metodo: 'POST', cuerpo: { login: 'admin', previousPassword: 'admin', password: CLAVE_ADMIN }, auth: basic('admin') });
  if (![200, 204].includes(cambio.status)) throw new Error(`No se pudo cambiar la contraseña del administrador: ${cambio.status} ${JSON.stringify(cambio.datos)}`);
}

async function generarToken() {
  await api('/api/user_tokens/revoke', { metodo: 'POST', cuerpo: { name: 'qa-scanner' } });
  const r = await api('/api/user_tokens/generate', { metodo: 'POST', cuerpo: { name: 'qa-scanner', type: 'GLOBAL_ANALYSIS_TOKEN' } });
  if (!r.datos?.token) throw new Error(`No se pudo generar el token: ${JSON.stringify(r.datos)}`);
  return r.datos.token;
}

// ---------- 2. Cobertura del backend (igual que el job de backend del pipeline) ----------
async function generarCobertura() {
  const NOMBRE = 'canchaya-qa-sonar-pg';
  sh(`docker rm -f ${NOMBRE}`);
  const run = sh(`docker run -d --rm --name ${NOMBRE} -e POSTGRES_DB=canchaya_test -e POSTGRES_USER=canchaya -e POSTGRES_PASSWORD=canchaya -p 5435:5432 postgres:16-alpine`);
  if (run.code !== 0) throw new Error(`No se pudo iniciar Postgres: ${run.out}`);
  // La imagen de Postgres arranca un servidor temporal para inicializarse y luego lo reinicia:
  // se espera a que acepte consultas de verdad, de forma sostenida, antes de usarlo.
  let estables = 0;
  for (let i = 0; i < 60 && estables < 3; i += 1) {
    estables = sh(`docker exec ${NOMBRE} psql -U canchaya -d canchaya_test -tAc "select 1"`).code === 0 ? estables + 1 : 0;
    await esperar(1000);
  }
  const PG = { usuario: 'canchaya', clave: 'canchaya', puerto: 5435, base: 'canchaya_test' };
  const env = { DATABASE_URL: `postgresql://${PG.usuario}:${PG.clave}@localhost:${PG.puerto}/${PG.base}`, JWT_SECRET: 'secreto-solo-para-ci' };
  sh('npm run migrate', { cwd: `${ROOT}/backend`, env });
  fs.rmSync(`${ROOT}/backend/coverage`, { recursive: true, force: true });
  const r = sh('npx jest --runInBand --forceExit --coverage --ci --json --outputFile=sonar-jest.json', { cwd: `${ROOT}/backend`, env, timeout: 400000 });
  sh(`docker stop ${NOMBRE}`);
  const bruto = JSON.parse(fs.readFileSync(`${ROOT}/backend/sonar-jest.json`, 'utf8'));
  fs.rmSync(`${ROOT}/backend/sonar-jest.json`, { force: true });
  if (!fs.existsSync(`${ROOT}/backend/coverage/lcov.info`)) throw new Error(`Jest no generó lcov.info (código ${r.code})`);
  // Mismos pasos que el job quality-gate del pipeline.
  const p = sh('node scripts/ci/prefijar-lcov.mjs backend/coverage/lcov.info backend/coverage/lcov.sonar.info backend/', { cwd: ROOT });
  if (p.code !== 0) throw new Error(`prefijar-lcov falló: ${p.out}`);
  fs.mkdirSync(`${ROOT}/frontend/coverage`, { recursive: true });
  fs.writeFileSync(`${ROOT}/frontend/coverage/lcov.sonar.info`, 'TN:\nend_of_record\n');
  return { pruebas: bruto.numTotalTests, aprobadas: bruto.numPassedTests, suites: bruto.numTotalTestSuites };
}

// ---------- 3. Scanner ----------
function ejecutarScanner(token) {
  fs.rmSync(`${ROOT}/.scannerwork`, { recursive: true, force: true });
  const cmd = `docker run --rm --add-host=host.docker.internal:host-gateway -e SONAR_HOST_URL=http://host.docker.internal:${PUERTO} -e SONAR_TOKEN=${token} -v "${ROOT}:/usr/src" sonarsource/sonar-scanner-cli -Dsonar.scm.disabled=true -Dsonar.qualitygate.wait=true -Dsonar.qualitygate.timeout=300`;
  const t0 = Date.now();
  const r = sh(cmd, { timeout: 900000, env: { MSYS_NO_PATHCONV: '1' } });
  return { codigo: r.code, duracionMs: Date.now() - t0, salida: r.out };
}

// ---------- 4. Resultados ----------
const METRICAS = ['ncloc', 'lines', 'files', 'functions', 'statements', 'classes', 'bugs', 'vulnerabilities', 'code_smells', 'security_hotspots', 'security_hotspots_reviewed', 'coverage', 'line_coverage', 'branch_coverage', 'lines_to_cover', 'uncovered_lines', 'duplicated_lines_density', 'duplicated_blocks', 'duplicated_lines', 'complexity', 'cognitive_complexity', 'reliability_rating', 'security_rating', 'security_review_rating', 'sqale_rating', 'sqale_index', 'sqale_debt_ratio', 'reliability_remediation_effort', 'security_remediation_effort', 'alert_status'];

async function paginar(ruta, campo) {
  const todos = [];
  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const r = await api(`${ruta}${ruta.includes('?') ? '&' : '?'}ps=500&p=${pagina}`);
    todos.push(...(r.datos[campo] ?? []));
    if (todos.length >= (r.datos.paging?.total ?? r.datos.total ?? 0)) break;
  }
  return todos;
}

async function recolectar(token) {
  const version = (await api('/api/server/version')).datos;
  const gate = (await api(`/api/qualitygates/project_status?projectKey=${CLAVE_PROYECTO}`)).datos.projectStatus;
  const medidas = (await api(`/api/measures/component?component=${CLAVE_PROYECTO}&metricKeys=${METRICAS.join(',')}`)).datos.component?.measures ?? [];
  const issues = await paginar(`/api/issues/search?componentKeys=${CLAVE_PROYECTO}&resolved=false&additionalFields=_all`, 'issues');
  const hotspots = await paginar(`/api/hotspots/search?projectKey=${CLAVE_PROYECTO}`, 'hotspots');
  const archivos = await paginar(`/api/measures/component_tree?component=${CLAVE_PROYECTO}&qualifiers=FIL&metricKeys=ncloc,coverage,bugs,vulnerabilities,code_smells,duplicated_lines_density,complexity&s=metric&metricSort=ncloc&metricSortFilter=withMeasuresOnly&asc=false`, 'components');
  const gates = (await api('/api/qualitygates/list')).datos;
  const analisis = (await api(`/api/project_analyses/search?project=${CLAVE_PROYECTO}&ps=5`)).datos.analyses ?? [];
  const reglas = {};
  for (const clave of [...new Set(issues.map((i) => i.rule))]) {
    const r = (await api(`/api/rules/show?key=${encodeURIComponent(clave)}`)).datos.rule;
    if (r) reglas[clave] = { nombre: r.name, severidad: r.severity, tipo: r.type, lenguaje: r.langName };
  }
  return { version, gate, medidas, issues, hotspots, archivos, gateAplicado: gates.default ?? null, analisis, reglas };
}

async function capturas(etiqueta) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const lista = [];
  try {
    await page.goto(`${URL_SONAR}/sessions/new`);
    await page.fill('input[name="login"]', 'admin');
    await page.fill('input[name="password"]', CLAVE_ADMIN);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/projects|\/$|\/dashboard/, { timeout: 30000 }).catch(() => {});
    const destinos = [
      ['tablero', `/dashboard?id=${CLAVE_PROYECTO}`, 'Tablero del proyecto: Quality Gate y métricas'],
      ['issues', `/project/issues?id=${CLAVE_PROYECTO}&resolved=false`, 'Hallazgos (issues) abiertos'],
      ['hotspots', `/security_hotspots?id=${CLAVE_PROYECTO}`, 'Puntos críticos de seguridad (security hotspots)'],
      ['cobertura', `/component_measures?id=${CLAVE_PROYECTO}&metric=coverage&view=list`, 'Cobertura de pruebas por archivo'],
      ['codigo', `/code?id=${CLAVE_PROYECTO}`, 'Estructura del código analizado'],
    ];
    for (const [nombre, ruta, leyenda] of destinos) {
      await page.goto(`${URL_SONAR}${ruta}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await esperar(2500);
      const archivo = `SONAR-${etiqueta}-${nombre}.jpg`;
      await page.screenshot({ path: path.join(EVID, archivo), type: 'jpeg', quality: 78 });
      lista.push({ archivo, leyenda });
    }
  } catch (error) {
    console.log(`(capturas incompletas: ${error.message.split('\n')[0]})`);
  }
  await browser.close();
  return lista;
}

// ---------- Ejecución ----------
const inicio = new Date().toISOString();
const estado = await asegurarSonarQube();
console.log(`SonarQube ${String(estado.version ?? '').replace(/[\r\n\t]+/g, ' ')} en ${URL_SONAR}`);
await prepararCredenciales();
const token = await generarToken();
console.log('Generando la cobertura del backend…');
const jest = await generarCobertura();
console.log(`Jest: ${jest.aprobadas}/${jest.pruebas} pruebas`);
console.log('Ejecutando sonar-scanner…');
const scanner = ejecutarScanner(token);
console.log(`Scanner terminó con código ${scanner.codigo} en ${(scanner.duracionMs / 1000).toFixed(0)} s`);
fs.writeFileSync(path.join(OUT, `sonar-${arg}-scanner.log`), scanner.salida.replace(token, '***'));

// Espera a que el servidor termine de procesar el análisis.
for (let i = 0; i < 60; i += 1) {
  const act = (await api(`/api/ce/activity?component=${CLAVE_PROYECTO}&ps=1`)).datos.tasks?.[0];
  if (act && ['SUCCESS', 'FAILED', 'CANCELED'].includes(act.status)) break;
  await esperar(3000);
}

const datos = await recolectar(token);
const evidencias = await capturas(arg);
const resultado = { etiqueta: arg, inicio, fin: new Date().toISOString(), servidor: estado.version, scanner: { codigo: scanner.codigo, duracionMs: scanner.duracionMs }, jest, ...datos, evidencias };
fs.writeFileSync(path.join(OUT, `sonar-${arg}.json`), JSON.stringify(resultado, null, 2));
const medida = (k) => datos.medidas.find((m) => m.metric === k)?.value ?? '—';
console.log(`Quality Gate: ${datos.gate.status} · bugs ${medida('bugs')} · vulnerabilidades ${medida('vulnerabilities')} · code smells ${medida('code_smells')} · hotspots ${medida('security_hotspots')} · cobertura ${medida('coverage')} % · duplicación ${medida('duplicated_lines_density')} %`);
console.log(`Issues abiertos: ${datos.issues.length}`);
