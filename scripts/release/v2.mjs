#!/usr/bin/env node
// مجلد الإصدار المستقل (قرار سلطان ق٦ في جولة 2.0.0): يجمع حزم المتاجر المبنية (release/store) ومواد store/
// وأدلة الإصدار (مجلد --evidence داخل المستودع، مثل test-results/live/release) في مجلد واحد خارج المستودع، ولا يمس شيئًا آخر في release/:
//   packages/{chrome,edge,firefox}/        حزمة كل متجر كما تُرفع، وpackages/manual-install/{chromium,firefox}/ مفكوكة للتثبيت اليدوي
//   source/                                حزمة المصدر لمراجعي AMO، وتعليمات بنائها بالعربية
//   stores/{chrome-web-store,edge-addons,firefox-amo}/   الأيقونة أو الشعار واللقطات والترويج وlisting.md، وملاحظات مراجعي AMO
//   provenance/                            وصف الحزم (الالتزام والبيئة والتدقيق وإعادة البناء وبصمة كل ملف)، وبصمات release/store،
//                                          ونتيجة تحقق هذا السكربت
//   README.md وSHA256SUMS.txt              الشرح بالعربية من الأدلة نفسها، وبصمة كل ملف في المجلد. ويذكر التزام الأدلة، ويقول
//                                          صراحةً إن تغيّرت ملفات المصدر المبني بعده (evidence-scope.mjs، U-068)
// يرفض قبل أي كتابة إن لم يطابق وصف الحزم الالتزام الحالي بشجرة نظيفة، أو اختلفت بصمة حزمة، أو فشل فحص مواد المتاجر، أو كان مجلد
// الإخراج موجودًا. ولا يفتح متصفحًا ولا شبكة.
//   command npm run package
//   command node scripts/release/v2.mjs --out <مجلد غير موجود، مثل release/v2 في النسخة الرئيسية> --evidence <مجلد الأدلة>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './zip.mjs';
import { checkStore, parseFields } from './store-assets.mjs';
import { changedSince, evidenceScope } from './evidence-scope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const OUT = val('out') ? path.resolve(val('out')) : null;
/**
 * مجلد الأدلة نسبةً إلى جذر المستودع، مثل test-results/live/release (checks.json وhand وt3 وt8 وidentity وshots وdata وsite).
 * إلزامي: الأدلة لا تُحفظ في المستودع، فتُمرَّر من مجلد نتائج الاختبارات الحية لهذا الإصدار.
 */
const EVIDENCE = val('evidence') ? path.relative(ROOT, path.resolve(ROOT, val('evidence'))).split(path.sep).join('/') : null;
const VERSION = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
const STORE = path.join(ROOT, 'release/store');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const git = (...a) => String(execFileSync('git', a, { cwd: ROOT })).trim();
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

if (!OUT) fail('مرّر --out <مجلد غير موجود>');
if (!val('evidence')) fail('مرّر --evidence <مجلد أدلة الإصدار داخل المستودع، مثل test-results/live/release>');
if (!EVIDENCE || EVIDENCE.startsWith('..') || path.isAbsolute(EVIDENCE)) fail(`مجلد الأدلة خارج المستودع: ${val('evidence')}`);
if (!existsSync(path.join(ROOT, EVIDENCE, 'checks.json'))) fail(`لا checks.json في مجلد الأدلة ${EVIDENCE}`);
if (existsSync(OUT)) fail(`المجلد موجود: ${OUT}. لا يُكتب فوق مجلد قائم؛ اختر مسارًا جديدًا أو انقل القديم بنفسك.`);

// ---- التحقق قبل أي كتابة ----
const desc = JSON.parse(await readFile(path.join(STORE, `tarjuman-${VERSION}-store.json`), 'utf8'));
const head = git('rev-parse', 'HEAD');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const verify = [];
const ok = (id, pass, detail = null) => {
  verify.push({ id, ok: pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${id}${detail !== null ? ` — ${JSON.stringify(detail).slice(0, 200)}` : ''}`);
  return pass;
};
ok('version-matches-package-json', desc.version === VERSION, { store: desc.version, package: VERSION });
ok('built-from-head', head.startsWith(desc.commit), { built: desc.commit, head: head.slice(0, 12) });
ok('clean-tree-at-build', desc.dirty === false, { dirty: desc.dirty });
const sums = await readFile(path.join(STORE, 'SHA256SUMS'), 'utf8');
const zips = {};
for (const [key, p] of Object.entries({ ...desc.packages, source: desc.source })) {
  const buf = await readFile(path.join(STORE, p.file));
  const d = sha256(buf);
  zips[key] = buf;
  ok(`${key}-sha256`, d === p.sha256 && buf.length === p.bytes && sums.split('\n').some((l) => l.startsWith(d) && l.trim().endsWith(p.file)), { file: p.file, sha256: d.slice(0, 16) });
  if (p.audit) ok(`${key}-audit`, p.audit.ok && p.audit.checks.every((c) => c.ok), { checks: p.audit.checks.length });
}
ok('source-reproduces-both-targets', desc.source.reproduced?.chromium === true && desc.source.reproduced?.firefox === true, desc.source.reproduced);
const assets = await checkStore(ROOT);
ok('store-assets', assets.problems.length === 0, assets.problems.length ? assets.problems : assets.summary.shots);
if (verify.some((v) => !v.ok)) fail('التحقق لم يكتمل؛ لم يُكتب شيء.');

// ---- الكتابة ----
const put = async (rel, data) => {
  const f = path.join(OUT, rel);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, data);
};
const cp = async (from, rel) => {
  await mkdir(path.dirname(path.join(OUT, rel)), { recursive: true });
  await copyFile(from, path.join(OUT, rel));
};
await mkdir(OUT, { recursive: true });
const pkgName = (k) => desc.packages[k].file;
for (const k of ['chrome', 'edge', 'firefox']) await cp(path.join(STORE, pkgName(k)), `packages/${k}/${pkgName(k)}`);

/** فكّ حزمة إلى مجلد التثبيت اليدوي ومقارنة كل ملف ببصمته في وصف الحزم: لا زائد ولا ناقص ولا مختلف. */
async function unpack(key, rel) {
  const expected = new Map(desc.packages[key].files.map((f) => [f.path, f.sha256]));
  const entries = readZip(zips[key]).filter((e) => !e.name.endsWith('/'));
  let diff = 0;
  for (const e of entries) {
    if (expected.get(e.name) !== sha256(e.data)) diff++;
    await put(`${rel}/${e.name}`, e.data);
  }
  const missing = [...expected.keys()].filter((p) => !entries.some((e) => e.name === p)).length;
  const manifest = JSON.parse(String(entries.find((e) => e.name === 'manifest.json').data));
  ok(`manual-install-${key}`, diff === 0 && missing === 0 && entries.length === expected.size && manifest.version === VERSION, { files: entries.length, differ: diff, missing, version: manifest.version });
  return manifest;
}
const chromiumManifest = await unpack('chrome', 'packages/manual-install/chromium');
const firefoxManifest = await unpack('firefox', 'packages/manual-install/firefox');

await cp(path.join(STORE, desc.source.file), `source/${desc.source.file}`);
await put('source/BUILD.md', `# بناء ترجمان ${VERSION} من المصدر

حزمة المصدر \`${desc.source.file}\` لمراجعي Firefox Add-ons، لأن شيفرة الإضافة مجمّعة بـesbuild. فيها \`${desc.source.paths.join('` و`')}\`، وتعليمات بناء إنجليزية في \`SOURCE-README.txt\` داخلها. لا أدلة ولا اختبارات ولا \`node_modules\` ولا ملفات شخصية.

## الخطوات

\`\`\`bash
unzip ${desc.source.file} -d tarjuman-src
cd tarjuman-src
npm ci
npm run build              # dist/          ← Chrome وEdge وBrave
npm run build:firefox      # dist-firefox/  ← Firefox
\`\`\`

## ما يطابقه البناء

- \`dist/\` يطابق محتوى \`packages/chrome/${pkgName('chrome')}\` و\`packages/edge/${pkgName('edge')}\` ملفًا ملفًا بايتًا.
- \`dist-firefox/\` يطابق محتوى \`packages/firefox/${pkgName('firefox')}\` بايتًا.
- تحقق \`scripts/release/store.mjs\` من ذلك بإعادة البناء من هذه الحزمة نفسها في مجلد مؤقت (\`reproduced\`: ${JSON.stringify(desc.source.reproduced)}).
- بيئة البناء: Node ${desc.build.node} وzlib ${desc.build.zlib} على ${desc.build.platform}-${desc.build.arch}. بصمات الملفات لا تتبع zlib، وبصمة الأرشيف تتبعها.
`);

// ---- مواد المتاجر ----
const md = {};
for (const f of ['listing.ar.md', 'submission.md', 'reviewers.en.md']) md[f] = await readFile(path.join(ROOT, 'store', f), 'utf8');
const field = Object.fromEntries(Object.values(md).flatMap((t) => parseFields(t)).map((x) => [x.id, x.text]));
/**
 * قسم من ملف في store/ بنصه، لنسخه خارج المستودع: الروابط النسبية تصير نصها (تنكسر خارج المستودع، والنص اسم الملف غالبًا)،
 * وأرقام الأقسام تُحذف من العناوين.
 */
const section = (text, from, to) => {
  const a = text.indexOf(from);
  const b = to ? text.indexOf(to, a + from.length) : -1;
  if (a < 0) return '';
  return text.slice(a, b < 0 ? undefined : b).trim()
    .replace(/\[([^\]]+)\]\((?!https?:|#)[^)]+\)/g, '$1')
    .replace(/^(#{2,3}) [٠-٩]+\. /gm, '$1 ');
};
const block = (t) => `\`\`\`text\n${t}\n\`\`\``;
const shots = async (set) => (await readdir(path.join(ROOT, 'store/screenshots', set))).filter((n) => n.endsWith('.png')).sort();
const chromiumShots = await shots('chromium');
const firefoxShots = await shots('firefox');
for (const n of chromiumShots) {
  await cp(path.join(ROOT, 'store/screenshots/chromium', n), `stores/chrome-web-store/screenshots/${n}`);
  await cp(path.join(ROOT, 'store/screenshots/chromium', n), `stores/edge-addons/screenshots/${n}`);
}
for (const n of firefoxShots) await cp(path.join(ROOT, 'store/screenshots/firefox', n), `stores/firefox-amo/screenshots/${n}`);
for (const n of ['small-promo-440x280.png', 'marquee-1400x560.png']) {
  await cp(path.join(ROOT, 'store/promo', n), `stores/chrome-web-store/promo/${n}`);
  await cp(path.join(ROOT, 'store/promo', n), `stores/edge-addons/promo/${n}`);
}
await cp(path.join(ROOT, 'store/icons/chrome-store-icon-128.png'), 'stores/chrome-web-store/icon/chrome-store-icon-128.png');
await cp(path.join(ROOT, 'store/icons/edge-logo-300.png'), 'stores/edge-addons/logo/edge-logo-300.png');

const head2 = (store) => `# ${store} — ترجمان ${VERSION}\n\nنصوص النموذج وملفاته من \`store/\` في المستودع عند \`${head.slice(0, 12)}\`، وفحصها \`scripts/release/store-assets.mjs --check\` (كل حقل في حده، وكل صورة بمقاسها). الفئة والروابط وإفصاح البيانات بنصها في الأقسام أدناه.\n`;
const permissions = ['storage', 'unlimitedStorage', 'downloads', 'host'].map((k) => `### \`${k === 'host' ? 'https://www.youtube.com/*' : k}\`\n\n${block(field[`reviewer.permission.${k}`])}`).join('\n\n');
const common = [
  section(md['submission.md'], '## ٣. الشيفرة البعيدة', '## ٤.'),
  section(md['submission.md'], '## ٤. إفصاح البيانات', '## ٥.'),
  section(md['submission.md'], '## ٥. الروابط وبيانات التواصل', '## ٦.'),
].join('\n\n');
const category = section(md['listing.ar.md'], '## الفئة', '## كلمات البحث');

await put('stores/chrome-web-store/listing.md', `${head2('Chrome Web Store')}
| الحقل | الملف أو القيمة |
| --- | --- |
| الحزمة | \`../../packages/chrome/${pkgName('chrome')}\` |
| أيقونة المتجر | \`icon/chrome-store-icon-128.png\` (128، والرسم 96 بحشو شفاف 16) |
| لقطات الشاشة | \`screenshots/\`: ${chromiumShots.map((n) => `\`${n}\``).join('، ')} (1280×800) |
| Small promo tile | \`promo/small-promo-440x280.png\` |
| Marquee promo tile | \`promo/marquee-1400x560.png\` |
| اللغة | العربية |

## الاسم (من البيان)

${block(field['manifest.name'])}

## الملخص (من البيان)

${block(field['manifest.description'])}

## الوصف التفصيلي

${block(field['chromium.description'])}

${category}

## Single purpose

${block(field['reviewer.singlePurpose'])}

## تبرير الأذونات

${permissions}

${common}

## Test instructions

${block(field['reviewer.chrome'])}
`);

await put('stores/edge-addons/listing.md', `${head2('Microsoft Edge Add-ons')}
| الحقل | الملف أو القيمة |
| --- | --- |
| الحزمة | \`../../packages/edge/${pkgName('edge')}\` (بايتات حزمة Chrome نفسها) |
| Extension logo | \`logo/edge-logo-300.png\` (300×300) |
| Screenshots | \`screenshots/\`: ${chromiumShots.map((n) => `\`${n}\``).join('، ')} (1280×800) |
| Small / Large promotional tile | \`promo/small-promo-440x280.png\` و\`promo/marquee-1400x560.png\` |
| Availability | Public، وكل الأسواق |

## الاسم (من البيان)

${block(field['manifest.name'])}

## Description

${block(field['chromium.description'])}

${category}

## Search terms

${block(field['edge.searchTerms'])}

${common}

## Notes for certification

${block(field['reviewer.edge'])}
`);

await put('stores/firefox-amo/listing.md', `${head2('Firefox Add-ons (AMO)')}
| الحقل | الملف أو القيمة |
| --- | --- |
| ملف الإضافة | \`../../packages/firefox/${pkgName('firefox')}\` |
| شيفرة المصدر | \`../../source/${desc.source.file}\` وتعليمات بنائها \`../../source/BUILD.md\` |
| التوافق | Firefox للحاسوب وحده، ${firefoxManifest.browser_specific_settings?.gecko?.strict_min_version ?? '؟'} فأحدث (المعرّف \`${firefoxManifest.browser_specific_settings?.gecko?.id ?? '؟'}\`). لا Firefox for Android |
| Screenshots | \`screenshots/\`: ${firefoxShots.map((n) => `\`${n}\``).join('، ')} (1280×960) |
| License | All Rights Reserved، مطابقًا لـ\`LICENSE\` |
| Notes for Reviewers | \`reviewer-notes.md\` |

## الاسم (من البيان)

${block(field['manifest.name'])}

## Summary

${block(field['amo.summary'])}

## Description

${block(field['amo.description'])}

${category}

## Tags

${block(field['amo.tags'])}

## Add-on URL

${block(field['amo.slug'])}

## Release notes

${block(field['amo.releaseNotes'])}

${common}
`);
await put('stores/firefox-amo/reviewer-notes.md', `# Notes for Reviewers — Tarjuman ${VERSION}\n\nFrom \`store/reviewers.en.md\` (\`reviewer.amo\`, ${[...field['reviewer.amo']].length} of 3,000 characters).\n\n${block(field['reviewer.amo'])}\n`);

// ---- المصدر والتحقق ----
await cp(path.join(STORE, `tarjuman-${VERSION}-store.json`), `provenance/tarjuman-${VERSION}-store.json`);
await cp(path.join(STORE, 'SHA256SUMS'), 'provenance/SHA256SUMS.store');
await put('provenance/verification.json', `${JSON.stringify({ at: new Date().toISOString(), commit: head, branch, version: VERSION, manifests: { chromium: { version: chromiumManifest.version, name: chromiumManifest.name }, firefox: { version: firefoxManifest.version, gecko: firefoxManifest.browser_specific_settings?.gecko ?? null } }, checks: verify }, null, 2)}\n`);

// ---- README من القالب والأدلة ----
const readJson = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8').catch(() => 'null'));
const ev = {
  hand: await readJson(`${EVIDENCE}/hand/hand.json`),
  shots: await readJson(`${EVIDENCE}/shots/shots.json`),
  data: await readJson(`${EVIDENCE}/data/data.json`),
  site: await readJson(`${EVIDENCE}/site/site.json`),
  checks: await readJson(`${EVIDENCE}/checks.json`),
  t3: Object.fromEntries(await Promise.all(['brave', 'chrome', 'edge', 'firefox'].map(async (b) => [b, await readJson(`${EVIDENCE}/t3/${b}/t3.json`)]))),
  identity: Object.fromEntries(await Promise.all(['brave', 'chrome'].map(async (b) => [b, await readJson(`${EVIDENCE}/identity/${b}/live.json`)]))),
  t8: Object.fromEntries(await Promise.all(['brave', 'chrome', 'edge', 'firefox'].map(async (b) => [b, await readJson(`${EVIDENCE}/t8/${b}/result.json`)]))),
};
// الأدلة سُجّلت على التزام قد يسبق البناء: يُذكر التزامها، ويُقال صراحةً إن تغيّرت ملفات المصدر المبني بعده (U-068).
const evidenceCommit = ev.checks?.commit ?? null;
const scope = evidenceScope({ head, evidenceCommit, changed: evidenceCommit ? changedSince(ROOT, evidenceCommit, head, desc.source.paths) : null });
console.log(`${scope.current ? '✓' : '⚠'} أدلة ${EVIDENCE}: الفحوص ${scope.checks.replaceAll('**', '')}`);
const tally = (r) => (r?.checks ? `${r.checks.filter((c) => c.ok).length}/${r.checks.length}` : 'غير متاح');
/** «15/15 (Brave 157.1.99.55)»: اسم المتصفح ورقمه بلا سلسلة المحرّك. */
const t8 = (r) => `${tally(r)} (${String(r?.browser ?? '؟').split(' (')[0]})`;
const size = async (rel) => (await stat(path.join(OUT, rel))).size;
const kb = (n) => `${(n / 1024 / 1024).toFixed(2)} م.ب`;
const template = await readFile(path.join(ROOT, 'scripts/release/v2-readme.md'), 'utf8');
const values = {
  VERSION,
  COMMIT: head.slice(0, 12),
  BRANCH: branch,
  EVIDENCE_DIR: EVIDENCE,
  CHECKS_SCOPE: scope.checks,
  LIVE_SCOPE: scope.live,
  BUILT_AT: desc.builtAt,
  NODE: desc.build.node,
  ZLIB: desc.build.zlib,
  CHROME_ZIP: pkgName('chrome'),
  EDGE_ZIP: pkgName('edge'),
  FIREFOX_ZIP: pkgName('firefox'),
  SOURCE_ZIP: desc.source.file,
  CHROME_SIZE: kb(await size(`packages/chrome/${pkgName('chrome')}`)),
  FIREFOX_SIZE: kb(await size(`packages/firefox/${pkgName('firefox')}`)),
  SOURCE_SIZE: kb(await size(`source/${desc.source.file}`)),
  CHROME_SHA: desc.packages.chrome.sha256,
  FIREFOX_SHA: desc.packages.firefox.sha256,
  SOURCE_SHA: desc.source.sha256,
  FILES: String(desc.packages.chrome.files.length),
  CHROME_MIN: chromiumManifest.minimum_chrome_version ?? '؟',
  GECKO_MIN: firefoxManifest.browser_specific_settings?.gecko?.strict_min_version ?? '؟',
  GECKO_ID: firefoxManifest.browser_specific_settings?.gecko?.id ?? '؟',
  T8_BRAVE: t8(ev.t8.brave),
  T8_CHROME: t8(ev.t8.chrome),
  T8_EDGE: t8(ev.t8.edge),
  T8_FIREFOX: t8(ev.t8.firefox),
  DATA: tally(ev.data),
  SHOTS: tally(ev.shots),
  HAND: ev.hand?.passed ? 'ناجح' : 'غير مكتمل',
  HAND_BROWSER: ev.hand?.browser ?? '؟',
  SITE_E2E: ev.site ? `${ev.site.e2e.passed}/${ev.site.e2e.passed + ev.site.e2e.failed}` : 'غير متاح',
  CHECK_UNIT: ev.checks ? `${ev.checks.checkWave.unit.pass}/${ev.checks.checkWave.unit.tests}` : 'غير متاح',
  CHECK_INT: ev.checks ? `${ev.checks.checkWave.integration.pass}/${ev.checks.checkWave.integration.tests}` : 'غير متاح',
  T3: ['brave', 'chrome', 'edge', 'firefox'].map((b) => { const r = ev.t3[b]?.summary; return `${{ brave: 'Brave', chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox' }[b]} ${r ? `${r.passed}/${r.total}` : 'غير متاح'}`; }).join('، '),
  IDENTITY: ['brave', 'chrome'].map((b) => { const r = ev.identity[b]?.summary; return `${b === 'brave' ? 'Brave' : 'Chrome'} ${r ? `${r.passed}/${r.total}` : 'غير متاح'}`; }).join('، '),
  E2E_STATIC: ev.checks ? `${ev.checks.e2eStaticAndRegression.pass}/${ev.checks.e2eStaticAndRegression.tests}` : 'غير متاح',
};
let readme = template;
for (const [k, v] of Object.entries(values)) readme = readme.replaceAll(`{{${k}}}`, v);
if (/\{\{[A-Z_0-9]+\}\}/.test(readme)) fail(`قيمة غائبة في قالب README: ${readme.match(/\{\{[A-Z_0-9]+\}\}/)[0]}`);
await put('README.md', readme);

// ---- البصمات ----
async function walk(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(f, base)));
    else out.push(path.relative(base, f).split(path.sep).join('/'));
  }
  return out;
}
const files = (await walk(OUT)).filter((f) => f !== 'SHA256SUMS.txt').sort();
const lines = [];
for (const f of files) lines.push(`${sha256(await readFile(path.join(OUT, f)))}  ${f}`);
await put('SHA256SUMS.txt', `${lines.join('\n')}\n`);
console.log(`\nrelease/v2: ${files.length + 1} ملفًا في ${OUT} · الالتزام ${head.slice(0, 12)} · الإصدار ${VERSION}`);
