// Playwright REPL driver for ReqArch Suite (macOS)
// Usage: node .claude/skills/run-app/driver.mjs
import { _electron as electron } from 'playwright-core';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '../../..');
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

let app = null;
let page = null;

const ts = () => new Date().toISOString().slice(11, 23);
function hook(w, label) {
  w.on('close', () => console.log(`[${ts()}] [PAGE CLOSED] ${label}`));
  w.on('crash', () => console.log(`[${ts()}] [PAGE CRASHED] ${label}`));
  w.on('load', () => console.log(`[${ts()}] [PAGE LOAD] ${label} ${w.url()}`));
  w.on('framenavigated', (f) => console.log(`[${ts()}] [NAVIGATED] ${label} ${f.url()}`));
  w.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      console.log(`[${ts()}] [console.${m.type()}] ${m.text().slice(0, 300)}`);
  });
  w.on('pageerror', (e) => console.log(`[${ts()}] [pageerror] ${String(e).slice(0, 300)}`));
}

const COMMANDS = {
  async launch() {
    if (app) return console.log('already launched');
    app = await electron.launch({
      executablePath: electronBin,
      args: [APP_DIR],
      env: { ...process.env },
      timeout: 30_000,
    });
    await new Promise(r => setTimeout(r, 5_000));
    const proc = app.process();
    proc.stderr?.on('data', (d) => console.log(`[${ts()}] [app-stderr]`, String(d).trim().slice(0, 500)));
    proc.stdout?.on('data', (d) => console.log(`[${ts()}] [app-stdout]`, String(d).trim().slice(0, 500)));
    proc.on('exit', (code, sig) => console.log(`[${ts()}] [app-exit]`, code, sig));
    app.on('window', (w) => {
      console.log(`[${ts()}] [NEW WINDOW]`, w.url());
      hook(w, 'late');
      if (!w.url().startsWith('devtools://')) page = w; // re-point at recreated window
    });
    page = app.windows().find(w => !w.url().startsWith('devtools://'))
        ?? await app.firstWindow();
    for (const w of app.windows()) hook(w, w.url().startsWith('devtools://') ? 'devtools' : 'main');
    console.log('launched.', app.windows().length, 'windows:');
    for (const w of app.windows()) console.log(' ', w.url());
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK';
    }, sel);
    console.log('click', sel, '->', r);
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate(t => {
      const els = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')];
      const el = els.find(e => e.textContent?.trim() === t)
              ?? els.find(e => e.textContent?.includes(t));
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK: ' + el.tagName;
    }, text);
    console.log('click-text', JSON.stringify(text), '->', r);
  },

  async type(text)  { if (page) await page.keyboard.type(text, { delay: 30 }); },
  async press(key)  { if (page) await page.keyboard.press(key); },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.waitForSelector(sel, { timeout: 10_000 }); console.log('found:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },

  // Intentional: developer-only REPL for inspecting renderer state via Playwright.
  // Not user-facing; expressions come from the agent/developer driving the session.
  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(
      s => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null));
  },

  async resize(arg) {
    if (!app) return console.log('ERROR: launch first');
    const [w, h] = (arg || '1400x900').split('x').map(Number);
    const info = await app.evaluate(({ BrowserWindow, screen }, { w, h }) => {
      const win = BrowserWindow.getAllWindows().find(x => !x.webContents.getURL().startsWith('devtools://'));
      const area = screen.getPrimaryDisplay().workAreaSize;
      if (win) {
        win.webContents.closeDevTools();
        win.setResizable(true);
        win.useContentSize = true;
        win.setContentSize(w, h);
      }
      return { area, bounds: win ? win.getBounds() : null, contentSize: win ? win.getContentSize() : null };
    }, { w, h });
    await new Promise(r => setTimeout(r, 300));
    console.log('resized to', w, h, JSON.stringify(info));
  },

  // real OS-level input via Playwright — needed for drag interactions (React Flow)
  async mouse(arg) {
    if (!page) return console.log('ERROR: launch first');
    const [action, x, y] = arg.split(/\s+/);
    const px = Number(x), py = Number(y);
    if (action === 'move') await page.mouse.move(px, py, { steps: 10 });
    else if (action === 'down') await page.mouse.down();
    else if (action === 'up') await page.mouse.up();
    else if (action === 'drag') { // drag CURRENT→x,y: usage: mouse drag 500 300
      await page.mouse.down(); await page.mouse.move(px, py, { steps: 15 }); await page.mouse.up();
    }
    else return console.log('unknown mouse action:', action);
    console.log('mouse', action, px, py, 'OK');
  },

  async windows() {
    if (!app) return console.log('ERROR: launch first');
    for (const w of app.windows()) console.log(' ', w.url());
    const wcs = await app.evaluate(({ webContents }) =>
      webContents.getAllWebContents().map(w => ({ id: w.id, type: w.getType(), url: w.getURL() })));
    console.log('webContents:');
    for (const w of wcs) console.log(` [${w.id}] ${w.type}: ${w.url}`);
  },

  async quit() { if (app) await app.close().catch(()=>{}); app = null; page = null; },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

rl.on('line', async line => {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  if (!cmd) return rl.prompt();
  const fn = COMMANDS[cmd];
  if (!fn) { console.log('unknown:', cmd, '- try: help'); return rl.prompt(); }
  try { await fn(rest.join(' ')); } catch (e) { console.log('ERROR:', e.message); }
  if (cmd === 'quit') { rl.close(); process.exit(0); }
  rl.prompt();
});
rl.on('close', async () => { await COMMANDS.quit(); process.exit(0); });

console.log('ReqArch driver — "help" for commands, "launch" to start');
rl.prompt();
