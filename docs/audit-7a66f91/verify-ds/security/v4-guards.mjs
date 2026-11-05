// تحقق مستقل (T-08، وT-10): هل يكشف check-static وrelease/audit.mjs صيغًا ديناميكية؟ يعمل على نسخ في مجلد العمل وحده
// (g/src-copy وg/dist وg/dist-copy)، ولا يمس نسخة الشيفرة المعزولة. والبناء الإنتاجي هنا يُفحص أيضًا لغياب جسر الحزام (T-10).
// تشغيل: command node v4-guards.mjs
import { cpSync, rmSync, writeFileSync, appendFileSync, existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const TJ = '$SCRATCH/tj';
const G = path.join(path.dirname(new URL(import.meta.url).pathname), 'g');
rmSync(G, { recursive: true, force: true });
mkdirSync(G, { recursive: true });

const VARIANTS = {
  'ضابط: fetch بأقواس حرفية': "globalThis['fetch']('https://x.invalid');",
  'fetch بوصل نصين': "globalThis['fe' + 'tch']('/x');",
  'fetch بـReflect.get': "Reflect.get(globalThis, 'fetch')('/x');",
  'fetch بتفكيك globalThis': 'const { fetch: f } = globalThis; f(u);',
  'XMLHttpRequest بالوصل': "const X = globalThis['XMLHttp' + 'Request']; new X();",
  'sendBeacon بالوصل': "navigator['send' + 'Beacon']('/x', 'd');",
  'رابط مقسوم إلى img.src': "const u = 'ht' + 'tps:/' + '/evil.example/c'; document.createElement('img').src = u;",
  'chrome.downloads بالتفكيك ثم erase': 'const { downloads: d } = chrome; d.erase({});',
  'chrome[downloads] بالوصل': "chrome['down' + 'loads'].removeFile(1);",
  'chrome.storage بالوصل': "chrome['stor' + 'age'].local.get(null);",
  'Function عبر constructor': "(() => {}).constructor('return 1')();",
  'innerHTML بالوصل': "document.body['inner' + 'HTML'] = '<b>x</b>';",
};

console.log('=== 0) هل في src الحقيقي استعمال لهذه الصيغ؟ (بحث نصي) ===');
const PATTERNS = {
  'Reflect.get/apply': /\bReflect\s*\.\s*(?:get|apply|construct)\b/,
  'globalThis/window/self[...]': /\b(?:globalThis|window|self)\s*\[/,
  'chrome[...]': /\bchrome\s*\[/,
  'navigator[...] / document[...]': /\b(?:navigator|document)\s*\[/,
  'تفكيك chrome أو globalThis': /\b(?:const|let|var)\s*\{[^}]*\}\s*=\s*(?:chrome|globalThis|window|browser)\b/,
  'atob(': /\batob\s*\(/,
  'import( بمتغير': /\bimport\s*\(\s*[^'"`\s)]/,
  '.constructor(': /\.constructor\s*\(/,
};
const files = [];
const walk = (d) => { for (const e of readdirSync(d)) { const p = path.join(d, e); if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js)$/.test(e)) files.push(p); } };
walk(path.join(TJ, 'src'));
for (const [label, re] of Object.entries(PATTERNS)) {
  const hits = [];
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (re.test(line) && !/^\s*(?:\/\/|\*)/.test(line)) hits.push(`${path.relative(TJ, f)}:${i + 1}: ${line.trim().slice(0, 110)}`); });
  console.log(JSON.stringify({ pattern: label, hits: hits.length }));
  for (const h of hits) console.log('   ', h);
}

console.log('\n=== 1) check-static على نسخة من src مع ملف مسبار واحد لكل صيغة ===');
for (const [label, line] of Object.entries(VARIANTS)) {
  const copy = path.join(G, 'src-copy');
  rmSync(copy, { recursive: true, force: true });
  cpSync(path.join(TJ, 'src'), copy, { recursive: true });
  writeFileSync(path.join(copy, 'pages', 'popup', 'probe.js'), `${line}\n`);
  const r = spawnSync(process.execPath, [path.join(TJ, 'scripts', 'check-static.mjs'), '--src', copy], { encoding: 'utf8' });
  const msg = `${r.stderr}${r.stdout}`.split('\n').filter((l) => l.includes('probe.js')).join(' | ');
  console.log(JSON.stringify({ variant: label, detected: r.status !== 0, msg: msg.slice(0, 120) }));
}
rmSync(path.join(G, 'src-copy'), { recursive: true, force: true });
{
  const r = spawnSync(process.execPath, [path.join(TJ, 'scripts', 'check-static.mjs')], { encoding: 'utf8' });
  console.log(JSON.stringify({ checkStaticOnRealSrc: r.status === 0 ? 'ناجح' : 'فاشل', tail: `${r.stdout}${r.stderr}`.trim().split('\n').slice(-1)[0] }));
}

console.log('\n=== 2) البناء الإنتاجي (chromium وfirefox) في مجلد العمل، ثم audit.mjs على نسخة ملحق بها كل صيغة ===');
for (const target of ['chromium', 'firefox']) {
  const out = path.join(G, `dist-${target}`);
  const b = spawnSync(process.execPath, [path.join(TJ, 'scripts', 'build.mjs'), '--out', out, '--target', target], { encoding: 'utf8' });
  console.log(JSON.stringify({ target, build: b.status === 0 ? 'ناجح' : `فاشل ${b.stderr.slice(0, 200)}` }));
}
const { auditPackage } = await import(`${TJ}/scripts/release/audit.mjs`);
for (const target of ['chromium', 'firefox']) {
  const r = await auditPackage(path.join(G, `dist-${target}`), { target });
  console.log(JSON.stringify({ target, auditClean: r.ok, passed: r.checks.filter((c) => c.ok).length, total: r.checks.length }));
}
for (const [label, line] of Object.entries(VARIANTS)) {
  const copy = path.join(G, 'dist-copy');
  rmSync(copy, { recursive: true, force: true });
  cpSync(path.join(G, 'dist-chromium'), copy, { recursive: true });
  appendFileSync(path.join(copy, 'pages', 'library', 'main.js'), `\n${line}\n`);
  const r = await auditPackage(copy, { target: 'chromium' });
  console.log(JSON.stringify({ variant: label, detected: !r.ok, failed: r.checks.filter((c) => !c.ok).map((c) => c.id) }));
}
rmSync(path.join(G, 'dist-copy'), { recursive: true, force: true });

console.log('\n=== 3) T-10: جسر الحزام غائب عن الإنتاج؟ ===');
const grepDir = (dir, needle) => { const hits = []; const w = (d) => { for (const e of readdirSync(d)) { const p = path.join(d, e); if (statSync(p).isDirectory()) w(p); else if (/\.(js|json|html)$/.test(e) && readFileSync(p, 'utf8').includes(needle)) hits.push(path.relative(dir, p)); } }; w(dir); return hits; };
for (const target of ['chromium', 'firefox']) {
  const out = path.join(G, `dist-${target}`);
  const m = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  console.log(JSON.stringify({ target, devDir: existsSync(path.join(out, 'dev')), harnessString: grepDir(out, 'tarjuman-harness'), hookString: grepDir(out, '__tarjuman'), contentScripts: m.content_scripts.map((c) => c.js) }));
}
