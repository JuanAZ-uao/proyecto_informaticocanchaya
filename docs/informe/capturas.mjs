// Genera las imágenes del informe que no vienen de capturas del equipo:
// diagrama de ramas, historial de Git (git log --graph) y capturas de las páginas públicas de GitHub.
//   node docs/informe/capturas.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const AQUI = import.meta.dirname;
const ROOT = path.resolve(AQUI, '../..');
const EVID = path.join(AQUI, 'evidencias');
fs.mkdirSync(EVID, { recursive: true });
const { chromium } = createRequire(path.join(ROOT, 'qa/package.json'))('playwright');
const repo = JSON.parse(fs.readFileSync(path.join(AQUI, 'datos-informe.json'), 'utf8')).repo;
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const browser = await chromium.launch();

// ---------- Diagrama de ramas (Arial, blanco y negro) ----------
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="430" viewBox="0 0 1100 430" font-family="Arial, sans-serif" font-size="16" fill="#000">
<rect width="1100" height="430" fill="#fff"/>
<defs><marker id="f" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#000"/></marker></defs>
<g stroke="#000" stroke-width="2" fill="none">
<line x1="150" y1="70" x2="1040" y2="70"/>
<line x1="150" y1="170" x2="1040" y2="170"/>
<line x1="230" y1="270" x2="470" y2="270"/>
<line x1="560" y1="270" x2="800" y2="270"/>
<line x1="470" y1="360" x2="640" y2="360"/>
<path d="M200,170 L230,270" marker-end="url(#f)"/>
<path d="M470,270 L520,170" marker-end="url(#f)"/>
<path d="M520,170 L560,270" marker-end="url(#f)"/>
<path d="M800,270 L860,170" marker-end="url(#f)"/>
<path d="M440,170 L470,360" marker-end="url(#f)"/>
<path d="M640,360 L700,170" marker-end="url(#f)"/>
<path d="M960,170 L990,70" marker-end="url(#f)"/>
</g>
<g fill="#fff" stroke="#000" stroke-width="2">
<circle cx="200" cy="170" r="9"/><circle cx="520" cy="170" r="9"/><circle cx="700" cy="170" r="9"/><circle cx="860" cy="170" r="9"/><circle cx="960" cy="170" r="9"/>
<circle cx="990" cy="70" r="9"/><circle cx="170" cy="70" r="9"/>
<circle cx="230" cy="270" r="9"/><circle cx="350" cy="270" r="9"/><circle cx="470" cy="270" r="9"/><circle cx="560" cy="270" r="9"/><circle cx="680" cy="270" r="9"/><circle cx="800" cy="270" r="9"/>
<circle cx="470" cy="360" r="9"/><circle cx="560" cy="360" r="9"/><circle cx="640" cy="360" r="9"/>
</g>
<g font-weight="bold">
<text x="20" y="75">main</text><text x="20" y="175">sprint_N</text><text x="20" y="275">feature/us-n-…</text><text x="20" y="365">fix/ · qa/</text>
</g>
<text x="620" y="55">Versión validada en el Sprint Review</text>
<text x="620" y="152">Integración del sprint (hoy: sprint_4)</text>
<text x="240" y="305">Una rama por historia</text><text x="240" y="325">(commits pequeños)</text>
<text x="660" y="395">Corrección de defectos y pruebas de QA</text>
<text x="545" y="228">Pull Request + revisión + CI</text>
</svg>`;
let page = await browser.newPage({ viewport: { width: 1100, height: 430 } });
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.screenshot({ path: path.join(EVID, 'diagrama-ramas.png') });
await page.close();

// ---------- Historial de Git ----------
const grafo = execSync('git log --oneline --graph --all -n 30 --decorate=short --format="%h %s"', { cwd: ROOT, encoding: 'utf8' })
  .split('\n').map((l) => l.replace(/\t/g, ' ').replace(/\s+/g, ' ').slice(0, 130)).join('\n');
page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.setContent(`<body style="margin:0;background:#fff"><pre style="margin:0;padding:14px 18px;font:14px/1.35 Consolas,'Courier New',monospace;color:#000;white-space:pre">$ git log --oneline --graph --all\n${esc(grafo)}</pre></body>`);
const alto = await page.evaluate(() => document.body.scrollHeight);
await page.setViewportSize({ width: 1200, height: alto });
await page.screenshot({ path: path.join(EVID, 'git-log-graph.png') });
await page.close();

// ---------- Páginas públicas de GitHub ----------
async function capturaGitHub(url, archivo, { alto = 1000, ancho = 1280 } = {}) {
  const p = await browser.newPage({ viewport: { width: ancho, height: alto } });
  try {
    await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: path.join(EVID, archivo) });
    console.log('ok', archivo);
  } catch (e) {
    console.log('no se pudo capturar', url, e.message.split('\n')[0]);
  }
  await p.close();
}
await capturaGitHub(`${repo}/branches`, 'gh-ramas.png', { alto: 1100 });
await capturaGitHub(`${repo}/pulls?q=is%3Apr+is%3Amerged`, 'gh-prs-fusionados.png', { alto: 700 });
await browser.close();
console.log('Capturas generadas en', EVID);
