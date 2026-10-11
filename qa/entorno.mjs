// Registra las versiones y el equipo usados en la ejecución de las pruebas (entorno.json).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium, firefox, webkit } from 'playwright';
import { sh, dc, sql, ROOT, OUT, CFG } from './lib.mjs';

const requireLocal = createRequire(import.meta.url);
const primera = (t) => String(t).trim().split('\n')[0].trim();

const versiones = {};
for (const [nombre, tipo] of [['Chromium', chromium], ['Firefox', firefox], ['WebKit', webkit]]) {
  try {
    const b = await tipo.launch();
    versiones[nombre] = b.version();
    await b.close();
  } catch {
    versiones[nombre] = 'no disponible';
  }
}

const dockerV = primera(sh('docker version --format "{{.Server.Version}}"').stdout);
const composeV = primera(sh('docker compose version --short').stdout);
const pg = primera(sql('select version()')).replace(/ on .*/, '');
const nginx = primera(dc('exec -T frontend nginx -v').out).replace('nginx version: ', '');
const nodeCont = primera(dc('exec -T backend node --version').stdout);
const rama = primera(sh('git branch --show-current', { cwd: ROOT }).stdout);
const commit = primera(sh('git rev-parse --short HEAD', { cwd: ROOT }).stdout);
const sucio = sh('git status --porcelain', { cwd: ROOT }).stdout.trim().split('\n').filter(Boolean).length;
const jestV = JSON.parse(fs.readFileSync(`${ROOT}/backend/node_modules/jest/package.json`, 'utf8')).version;
const pw = JSON.parse(fs.readFileSync(requireLocal.resolve('playwright/package.json'), 'utf8')).version;
const axe = JSON.parse(fs.readFileSync(requireLocal.resolve('axe-core/package.json'), 'utf8')).version;
const sio = JSON.parse(fs.readFileSync(`${ROOT}/backend/node_modules/socket.io/package.json`, 'utf8')).version;
const react = JSON.parse(fs.readFileSync(`${ROOT}/frontend/node_modules/react/package.json`, 'utf8')).version;

const entorno = {
  fecha: new Date().toISOString(),
  equipo: { so: `${os.type()} ${os.release()} (${os.arch()})`, cpu: os.cpus()[0].model.trim(), nucleos: os.cpus().length, memoriaGB: Math.round(os.totalmem() / 1073741824), zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone },
  repositorio: { rama, commit, archivosSinCommit: sucio },
  versiones: { 'Node.js (ejecutor de pruebas)': process.version, 'Node.js (contenedor del backend)': nodeCont, Docker: dockerV, 'Docker Compose': composeV, PostgreSQL: pg, nginx, 'Socket.IO (servidor)': sio, React: react, Jest: jestV, Playwright: pw, 'axe-core': axe, Chromium: versiones.Chromium, Firefox: versiones.Firefox, WebKit: versiones.WebKit },
  urls: { api: CFG.API, frontend: CFG.WEB, proyectoDocker: CFG.proyecto },
};
fs.writeFileSync(path.join(OUT, 'entorno.json'), JSON.stringify(entorno, null, 2));
console.log(JSON.stringify(entorno, null, 2));
