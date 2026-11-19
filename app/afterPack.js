// Sätter ikon och versionsinfo på Jarvis.exe utan wine (ren JavaScript)
const fs = require('fs'), path = require('path');
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const PE = await import('pe-library');
  const exe = path.join(ctx.appOutDir, 'Jarvis.exe');
  const ver = ctx.packager.appInfo.version;
  const pe = PE.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = PE.NtExecutableResource.from(pe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'build/icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const gid = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, ico.icons.map(i => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  const [a, b, c] = ver.split('.').map(Number);
  vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: 'Jarvis', ProductName: 'Jarvis', CompanyName: 'Mälardalens Frukt & Grönt',
    InternalName: 'Jarvis', OriginalFilename: 'Jarvis.exe', FileVersion: ver + '.0', ProductVersion: ver + '.0',
    LegalCopyright: '© 2026 Mälardalens Frukt & Grönt'
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
  console.log('  • Jarvis.exe: ikon + version ' + ver + '.0 satt');
};
