const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, net } = require('electron');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DEFAULT_HOTKEY = 'CommandOrControl+Space';
let hotkey = '';
let win, popup, tray, quitting = false, popupItems = [];

app.setName('Jarvis');
// Samma datamapp som "Kom ihåg", så alla befintliga påminnelser följer med automatiskt
app.setPath('userData', path.join(app.getPath('appData'), 'Kom ihåg'));
app.setAppUserModelId('se.mfg.jarvis');
const dataFile = () => path.join(app.getPath('userData'), 'data.json');
// Portabel exe packas upp i en temp-mapp; autostart ska peka på själva exe-filen
const exePath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

// Stäng gamla "Kom ihåg" (de delar datafil med oss) och andra Jarvis-versioner, och ta bort
// gamla "Kom ihåg" från autostart så att den inte startar bredvid Jarvis.
function retireOldApps() {
  if (process.platform !== 'win32') return;
  const ver = app.getVersion() + '.0';
  const cmd =
    "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne " + process.pid + " -and $_.Path -and ($_.ProcessName -like 'Kom ih*g' -or ($_.ProcessName -eq 'Jarvis' -and ([version]((Get-Item $_.Path).VersionInfo.FileVersion)) -lt [version]'" + ver + "')) } | Stop-Process -Force -ErrorAction SilentlyContinue; " +
    "$k='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; $p=Get-ItemProperty $k -ErrorAction SilentlyContinue; " +
    "if ($p) { $p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' -and ([string]$_.Value -like '*Kom ih*g*' -or [string]$_.Value -like '*KomIhag*') } | ForEach-Object { Remove-ItemProperty $k -Name $_.Name -ErrorAction SilentlyContinue } }";
  try { require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout: 15000, windowsHide: true }); } catch {}
}
let gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  retireOldApps();
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  gotLock = app.requestSingleInstanceLock();
}
if (!gotLock) app.quit();
app.on('second-instance', () => showWin());

function showWin(focusInput) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
  if (focusInput) win.webContents.send('quick-add');
}


/* ---------- Uppdaterare: nytt utseende/funktioner hämtas från GitHub utan ny nedladdning ----------
   ui/manifest.json i repot: { version, minShell, note, files: { "index.html": "<sha256>", ... } }
   Filerna laddas ner till %APPDATA%\Kom ihåg\ui\<version>\, kontrolleras mot sha256 och används sedan.
   Går något fel används den inbyggda versionen. Själva motorn (main.js/preload) uppdateras inte här. */
const UPDATE_BASE = process.env.JARVIS_UPDATE_BASE || 'https://raw.githubusercontent.com/576F3154/jarvis/main/ui/';
const BUNDLED_UI = '2.4.0';
const SAFE_NAME = /^(?!.*\.\.)[a-z0-9_\-]+(\/[a-z0-9_\-]+)*\.(html|css|js|png|svg|json|mp3|wav)$/i;
const uiRoot = () => path.join(app.getPath('userData'), 'ui');
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
let ui = { version: BUNDLED_UI, dir: __dirname };
function resolveUi() {
  ui = { version: BUNDLED_UI, dir: __dirname };
  try {
    const cur = JSON.parse(fs.readFileSync(path.join(uiRoot(), 'current.json'), 'utf8'));
    const dir = path.join(uiRoot(), cur.version);
    const ok = cmpVer(cur.version, BUNDLED_UI) > 0 && cmpVer(app.getVersion(), cur.minShell || '0') >= 0 &&
      Object.keys(cur.files || {}).every(f => SAFE_NAME.test(f) && fs.existsSync(path.join(dir, f))) && fs.existsSync(path.join(dir, 'index.html'));
    if (ok) ui = { version: cur.version, dir, note: cur.note || '' };
  } catch {}
  return ui;
}
const uiFile = (name) => path.join(fs.existsSync(path.join(ui.dir, name)) ? ui.dir : __dirname, name);
async function getBuf(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
  try { const r = await net.fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal: ctrl.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return Buffer.from(await r.arrayBuffer()); }
  finally { clearTimeout(t); }
}
let checking = false, lastCheck = { at: 0, result: '' };
async function checkUpdate(manual) {
  if (checking) return { status: 'busy' };
  checking = true;
  try {
    const m = JSON.parse((await getBuf(UPDATE_BASE + 'manifest.json')).toString('utf8'));
    if (!m || !m.version || !m.files || typeof m.files !== 'object') throw new Error('ogiltigt manifest');
    // Ny motor (exe)? Hämtas bredvid nuvarande exe, kontrolleras och startas sedan i stället för den här.
    const sh = m.shell;
    if (sh && sh.version && cmpVer(sh.version, app.getVersion()) > 0 && /^[a-f0-9]{64}$/.test(sh.sha256 || '') &&
        /^https:\/\/(github\.com|raw\.githubusercontent\.com|objects\.githubusercontent\.com)\//.test(sh.url || '') && process.env.PORTABLE_EXECUTABLE_FILE) {
      const target = await fetchShell(sh);
      lastCheck = { at: Date.now(), result: 'shell-ready' };
      win && win.webContents.send('shell-ready', { version: sh.version, note: sh.note || m.note || '' });
      return { status: 'shell-ready', version: sh.version, target };
    }
    if (cmpVer(m.version, ui.version) <= 0) { lastCheck = { at: Date.now(), result: 'latest' }; return { status: 'latest', version: ui.version }; }
    if (cmpVer(app.getVersion(), m.minShell || '0') < 0) { lastCheck = { at: Date.now(), result: 'needs-download' }; return { status: 'needs-download', version: m.version, note: m.note || '' }; }
    const names = Object.keys(m.files);
    if (!names.includes('index.html') || !names.every(n => SAFE_NAME.test(n) && /^[a-f0-9]{64}$/.test(m.files[n]))) throw new Error('ogiltiga filnamn');
    const tmp = path.join(uiRoot(), m.version + '.tmp'), dest = path.join(uiRoot(), m.version);
    fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
    for (const n of names) {
      const buf = await getBuf(UPDATE_BASE + n);
      if (crypto.createHash('sha256').update(buf).digest('hex') !== m.files[n]) throw new Error('kontrollsumma stämmer inte för ' + n);
      fs.mkdirSync(path.dirname(path.join(tmp, n)), { recursive: true }); fs.writeFileSync(path.join(tmp, n), buf);
    }
    fs.rmSync(dest, { recursive: true, force: true }); fs.renameSync(tmp, dest);
    fs.writeFileSync(path.join(uiRoot(), 'current.json'), JSON.stringify({ version: m.version, minShell: m.minShell || '0', note: m.note || '', files: m.files }, null, 1));
    // städa gamla versioner (behåll den nya och den som körs nu)
    for (const d of fs.readdirSync(uiRoot())) if (d !== m.version && d !== path.basename(ui.dir) && d !== 'current.json') fs.rmSync(path.join(uiRoot(), d), { recursive: true, force: true });
    lastCheck = { at: Date.now(), result: 'ready' };
    win && win.webContents.send('update-ready', { version: m.version, note: m.note || '' });
    return { status: 'ready', version: m.version, note: m.note || '' };
  } catch (e) {
    lastCheck = { at: Date.now(), result: 'error' };
    return { status: 'error', error: String(e && e.message || e) };
  } finally { checking = false; }
}
let pendingShell = null;
async function fetchShell(sh) {
  const dir = path.dirname(process.env.PORTABLE_EXECUTABLE_FILE);
  const target = path.join(dir, 'Jarvis-' + sh.version + '-portable.exe');
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  if (fs.existsSync(target) && sha(target) === sh.sha256) { pendingShell = target; return target; }
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15 * 60 * 1000);
  try {
    const r = await net.fetch(sh.url, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (crypto.createHash('sha256').update(buf).digest('hex') !== sh.sha256) throw new Error('kontrollsumman för nya motorn stämmer inte');
    fs.writeFileSync(target + '.part', buf); fs.renameSync(target + '.part', target);
    try { fs.chmodSync(target, 0o755); } catch {}
  } finally { clearTimeout(t); }
  pendingShell = target; return target;
}
function applyShell() {
  if (!pendingShell || !fs.existsSync(pendingShell)) return false;
  const old = exePath();
  try { if (app.getLoginItemSettings({ path: old }).openAtLogin) { app.setLoginItemSettings({ openAtLogin: false, path: old }); app.setLoginItemSettings({ openAtLogin: true, path: pendingShell }); } } catch {}
  // Stäng bara om den nya motorn verkligen startade; annars fortsätter den här att köra
  let child;
  try { child = require('child_process').spawn(pendingShell, ['--replaced=' + old], { detached: true, stdio: 'ignore', cwd: path.dirname(pendingShell) }); }
  catch { return false; }
  child.once('error', () => { try { if (app.getLoginItemSettings({ path: pendingShell }).openAtLogin) { app.setLoginItemSettings({ openAtLogin: false, path: pendingShell }); app.setLoginItemSettings({ openAtLogin: true, path: old }); } } catch {} pendingShell = null; win && win.webContents.send('shell-failed'); });
  child.once('spawn', () => {
    child.unref();
    quitting = true; try { globalShortcut.unregisterAll(); app.releaseSingleInstanceLock(); } catch {}
    setTimeout(() => app.quit(), 300);
  });
  return true;
}
ipcMain.on('apply-shell', () => applyShell());
// Efter motorbyte: ta bort den gamla exe-filen när den har stängt
function cleanupReplaced() {
  const arg = process.argv.find(a => a.startsWith('--replaced=')); if (!arg) return;
  const old = arg.slice(11);
  if (!old || path.resolve(old) === path.resolve(exePath()) || !/^(Jarvis-[\d.]+-portable|KomIhag-[\d.]+-portable)\.exe$/i.test(path.basename(old))) return;
  let n = 0; const tryDel = () => { try { fs.unlinkSync(old); } catch { if (++n < 6) setTimeout(tryDel, 5000); } };
  setTimeout(tryDel, 6000);
}

/* ---------- Snabbkommando (ändras från inställningarna) ---------- */
const hotkeyLabel = (a) => String(a || '').replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl').replace('Space', 'Mellanslag').replace(/\+/g, '+');
function onHotkey() { if (win.isVisible() && win.isFocused()) { win.hide(); return; } showWin(true); }
function registerHotkey(acc) {
  const prev = hotkey; let ok = false;
  try { if (prev) globalShortcut.unregister(prev); } catch {}
  try { ok = globalShortcut.register(acc, onHotkey); } catch { ok = false; }
  if (ok) hotkey = acc; else if (prev) { try { globalShortcut.register(prev, onHotkey); } catch {} }
  buildTrayMenu();
  return ok;
}
ipcMain.handle('get-hotkey', () => ({ hotkey, label: hotkeyLabel(hotkey) }));
ipcMain.handle('set-hotkey', (_e, acc) => {
  acc = String(acc || '');
  if (!/^(CommandOrControl|Control|Alt|Shift|Super)(\+(CommandOrControl|Control|Alt|Shift|Super))*\+([A-Z0-9]|F\d{1,2}|Space|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Plus|Minus|Period|Comma)$/.test(acc)) return { ok: false, hotkey, label: hotkeyLabel(hotkey) };
  const ok = registerHotkey(acc);
  return { ok, hotkey, label: hotkeyLabel(hotkey) };
});

function applyUpdate() {
  const before = ui.version; resolveUi();
  if (popup && !popup.isDestroyed()) popup.close();
  if (win) win.loadFile(uiFile('index.html'), { query: { updated: ui.version !== before ? ui.version : '' } });
}
ipcMain.handle('check-update', () => checkUpdate(true));
ipcMain.on('apply-update', () => applyUpdate());
ipcMain.handle('versions', () => ({ ui: ui.version, shell: app.getVersion(), note: ui.note || '', lastCheck, portable: !!process.env.PORTABLE_EXECUTABLE_FILE }));

const icon = () => path.join(__dirname, 'build/icon.png');

function createWindow() {
  win = new BrowserWindow({
    width: 600, height: 860, minWidth: 400, minHeight: 480,
    title: 'Jarvis', icon: icon(), autoHideMenuBar: true, backgroundColor: '#05090f',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false }
  });
  win.loadFile(uiFile('index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) e.preventDefault(); });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

/* ---------- Popup: eget fönster överst på skärmen ---------- */
const POP_W = 420;
function placePopup(h) {
  if (!popup) return;
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const height = Math.min(Math.max(h || 220, 160), wa.height - 32);
  popup.setResizable(true);
  popup.setBounds({ x: wa.x + wa.width - POP_W - 18, y: wa.y + wa.height - height - 18, width: POP_W, height });
  popup.setResizable(false);
}
function ensurePopup() {
  if (popup && !popup.isDestroyed()) return popup;
  popup = new BrowserWindow({
    width: POP_W, height: 240, frame: false, transparent: true, resizable: false, movable: true,
    alwaysOnTop: true, skipTaskbar: true, show: false, focusable: true, hasShadow: false,
    minimizable: false, maximizable: false, fullscreenable: false, title: 'Jarvis',
    webPreferences: { preload: path.join(__dirname, 'popup-preload.js'), backgroundThrottling: false }
  });
  popup.setAlwaysOnTop(true, 'screen-saver');
  popup.setVisibleOnAllWorkspaces(true);
  popup.loadFile(uiFile('popup.html'));
  popup.webContents.on('did-finish-load', () => popup && popup.webContents.send('items', popupItems));
  popup.on('closed', () => { popup = null; });
  placePopup(240);
  return popup;
}
function updatePopup(items) {
  popupItems = Array.isArray(items) ? items.slice(0, 8) : [];
  if (!popupItems.length) { if (popup) popup.close(); return; }
  const fresh = !popup || popup.isDestroyed();
  const p = ensurePopup();
  if (!fresh) p.webContents.send('items', popupItems);
  if (!p.isVisible()) { p.showInactive(); }
  p.moveTop();
}
ipcMain.on('popup', (_e, items) => updatePopup(items));
ipcMain.on('popup-size', (_e, h) => { placePopup(Number(h) || 220); });
ipcMain.on('popup-action', (_e, a) => {
  if (!a || typeof a.id !== 'string') return;
  if (a.act === 'open') showWin();
  win && win.webContents.send('popup-action', { id: a.id, act: String(a.act), mins: Number(a.mins) || 0 });
});
ipcMain.on('popup-dismiss', () => { popupItems = []; if (popup) popup.close(); win && win.webContents.send('popup-dismissed'); });

/* ---------- Tray ---------- */
function createTray() {
  tray = new Tray(nativeImage.createFromPath(icon()).resize({ width: 16, height: 16 }));
  tray.setToolTip('Jarvis');
  tray.on('click', () => showWin());
  buildTrayMenu();
}
function buildTrayMenu() {
  if (!tray) return;
  const autostart = () => app.getLoginItemSettings({ path: exePath() }).openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Visa Jarvis', click: () => showWin() },
    { label: 'Ny påminnelse' + (hotkey ? '  (' + hotkeyLabel(hotkey) + ')' : ''), click: () => showWin(true) },
    { label: 'Sök efter uppdatering', click: () => { showWin(); win.webContents.send('check-update-now'); } },
    { type: 'separator' },
    { label: 'Starta med Windows', type: 'checkbox', checked: autostart(),
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, path: exePath() }) },
    { type: 'separator' },
    { label: 'Avsluta', click: () => { quitting = true; app.quit(); } }
  ]));
}

app.whenReady().then(() => {
  resolveUi();
  setTimeout(retireOldApps, 1500); // städar bort gamla Kom ihåg även om den inte höll låset
  createWindow();
  createTray();
  let saved = ''; try { saved = (JSON.parse(fs.readFileSync(dataFile(), 'utf8')).settings || {}).hotkey || ''; } catch {}
  if (!(saved && registerHotkey(saved)) && !registerHotkey(DEFAULT_HOTKEY)) registerHotkey('CommandOrControl+Shift+Space');
  cleanupReplaced();
  try { lastWritten = fs.readFileSync(dataFile(), 'utf8'); } catch {}
  watchData();
  setTimeout(() => checkUpdate(), 20000);
  setInterval(() => checkUpdate(), 60 * 60 * 1000);
});
/* Ändringar i data.json utifrån (t.ex. Claude via Remote Control) laddas in direkt */
function watchData() {
  const dir = path.dirname(dataFile()); let t = null;
  try {
    fs.watch(dir, (_ev, name) => {
      if (name && name !== 'data.json') return;
      clearTimeout(t);
      t = setTimeout(() => {
        let txt = ''; try { txt = fs.readFileSync(dataFile(), 'utf8'); } catch { return; }
        if (!txt || txt === lastWritten) return;
        let d; try { d = JSON.parse(txt); } catch { return; }
        if (!d || !Array.isArray(d.items)) return;
        lastWritten = txt;
        win && win.webContents.send('data-changed', d);
      }, 400);
    });
  } catch {}
}
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());

/* ---------- Lagring & övrigt ---------- */
ipcMain.handle('load', () => { try { return JSON.parse(fs.readFileSync(dataFile(), 'utf8')); } catch { return null; } });
let lastWritten = '';
ipcMain.handle('save', (_e, data) => {
  const f = dataFile(), json = JSON.stringify(data, null, 1);
  lastWritten = json;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  try { if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak'); } catch {}
  fs.writeFileSync(f + '.tmp', json); fs.renameSync(f + '.tmp', f);
  return true;
});
ipcMain.on('show', () => showWin());
ipcMain.on('hide', () => win.hide());
ipcMain.on('flash', () => { if (!win.isFocused()) win.flashFrame(true); });
ipcMain.on('badge', (_e, n) => {
  tray && tray.setToolTip(n ? `Jarvis – ${n} att göra nu` : 'Jarvis');
  win && win.setTitle(n ? `(${n}) Jarvis` : 'Jarvis');
});
ipcMain.handle('get-autostart', () => app.getLoginItemSettings({ path: exePath() }).openAtLogin);
ipcMain.on('set-autostart', (_e, on) => app.setLoginItemSettings({ openAtLogin: !!on, path: exePath() }));
