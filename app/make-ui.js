// Bygger ui/-mappen + manifest.json för publicering på GitHub. Användning: node make-ui.js 2.1.1 "Vad som är nytt" [minShell]
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [ver, note = '', minShell = '2.1.0'] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(ver || '')) { console.error('ange version, t.ex. 2.1.1'); process.exit(1); }
const out = process.env.UI_OUT || path.join(__dirname, 'ui');
const files = ['index.html', 'popup.html', 'build/icon.png'];
fs.rmSync(out, { recursive: true, force: true });
const man = { version: ver, minShell, note, files: {} };
for (const f of files) {
  const buf = fs.readFileSync(path.join(__dirname, f));
  fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
  fs.writeFileSync(path.join(out, f), buf);
  man.files[f] = crypto.createHash('sha256').update(buf).digest('hex');
}
// Motor (exe) som Jarvis kan byta till själv: ../shell/Jarvis-<version>-portable.exe
const shellVer = require('./package.json').version;
const exe = path.join(__dirname, '..', 'shell', 'Jarvis-' + shellVer + '-portable.exe');
if (fs.existsSync(exe)) man.shell = { version: shellVer, url: 'https://raw.githubusercontent.com/576F3154/jarvis/main/shell/Jarvis-' + shellVer + '-portable.exe',
  sha256: crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex'), note: note };
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(man, null, 1));
console.log('ui ' + ver + ' klar i ' + out);
