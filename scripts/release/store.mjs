#!/usr/bin/env node
// حزم المتاجر (جولة النشر T4، docs/store-release.md) بأمر واحد، محليًا بلا رفع ولا نشر:
//   release/store/tarjuman-<الإصدار>-chrome.zip   ← بناء chromium: Chrome Web Store (ويُثبَّت منه في Brave)
//   release/store/tarjuman-<الإصدار>-edge.zip     ← البناء نفسه بايتًا لـMicrosoft Edge Add-ons (لا فرع لـEdge بلا فرق مثبت)
//   release/store/tarjuman-<الإصدار>-firefox.zip  ← بناء firefox: Firefox Add-ons (AMO)
//   release/store/tarjuman-<الإصدار>-source.zip   ← شيفرة المصدر لمراجعي AMO لأن الحزمة مجمّعة بـesbuild، بتعليمات بناء إنجليزية
//   release/store/SHA256SUMS                      ← بصمات الحزم الأربع
//   release/store/tarjuman-<الإصدار>-store.json   ← الإصدار والالتزام والتدقيق وإعادة البناء وبصمة كل ملف
// كل حزمة متجر: البيان في جذرها، وتدقيق هدفها كاملًا (audit.mjs)، ورقم البيان يطابق package.json، ولا مسار من الجهاز ولا رمز ولا
// مفتاح. وحزمة المصدر من قائمة صريحة (لا أدلة ولا تقارير ولا اختبارات ولا node_modules)، ويُعاد منها البناء في مجلد مؤقت فيطابق
// حزمتي Firefox وChromium بايتًا، وهو ما يفعله مراجع AMO. والأرشيف حتمي (zip.mjs)، فالشجرة نفسها تعطي البصمات نفسها.
//   node scripts/release/store.mjs [--out <مجلد>]      (npm run package يبني معها حزمة التثبيت الشخصي package.mjs)
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPackage } from './audit.mjs';
import { createZip, readZip } from './zip.mjs';
import { buildEnvironment, dirtyNote, sourceState, staticCheck } from './provenance.mjs';
import { insidePath } from '../targets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
// بمقاطع المسار لا بالنص (src/..foo داخل src؛ تدقيق 7a66f91، U60).
const inside = insidePath;

/** المتاجر وهدف بناء كل منها. */
export const STORES = Object.freeze([
  { store: 'chrome', target: 'chromium' },
  { store: 'edge', target: 'chromium' },
  { store: 'firefox', target: 'firefox' },
]);

/** ما تضمّه حزمة المصدر: ما يلزم البناء وحده بمسارات صريحة، ومعه الترخيص والإشعارات. */
export const SOURCE_PATHS = Object.freeze(['src', 'scripts/build.mjs', 'scripts/targets.mjs', 'package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']);
const SOURCE_SKIP = [/(^|\/)\.[^/]+$/];
const BINARY = /\.(?:woff2|png)$/;

/** ما لا يجوز في حزمة: مسار من الجهاز، ومفتاح خاص، ورموز بصيغها المعروفة. */
export const LEAKS = Object.freeze([
  { why: 'مسار من الجهاز', re: /(?:\/(?:Users|Volumes|home|private\/tmp|private\/var)\/[A-Za-z0-9._-]+|[A-Za-z]:\\Users\\)/ },
  { why: 'مفتاح خاص', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { why: 'رمز GitHub', re: /\b(?:github_pat_[A-Za-z0-9_]{22,}|gh[pousr]_[A-Za-z0-9]{36,})\b/ },
  { why: 'مفتاح Google', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { why: 'مفتاح AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { why: 'مفتاح API', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}/ },
]);

async function walk(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, base)));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

/** @param {string} root @param {string[]} files */
export async function scanLeaks(root, files) {
  const problems = [];
  for (const f of files.filter((x) => !BINARY.test(x))) {
    const text = await readFile(path.join(root, f), 'utf8');
    for (const { why, re } of LEAKS) if (re.test(text)) problems.push(`${f}: ${why}`);
  }
  return problems;
}

/** ملفات حزمة المصدر بمساراتها في المستودع. */
export async function sourceFiles() {
  const files = [];
  for (const p of SOURCE_PATHS) {
    const abs = path.join(ROOT, p);
    const entries = await readdir(abs, { withFileTypes: true }).then(() => walk(abs).then((l) => l.map((f) => `${p}/${f}`)), () => [p]);
    files.push(...entries);
  }
  return files.filter((f) => !SOURCE_SKIP.some((re) => re.test(f))).sort();
}

/** تعليمات البناء لمراجعي AMO (بالإنجليزية بطلب الخطة)، من رقم الإصدار وإصدار Node المستعمل. */
export function sourceReadme(version) {
  return `Tarjuman ${version} — source code for Firefox Add-ons review

Tarjuman is a browser extension that works on YouTube watch pages: it exports the video's subtitle
track (in any language the user picks in YouTube's own menu) to an SRT file, which the user translates
outside the extension into a language of their choice, and shows the user's translated SRT file over
the video. This archive holds everything needed to rebuild the submitted package.

How the package is built
  scripts/build.mjs bundles each entry point with esbuild into one IIFE file. The only minification
  is syntax-level (minifySyntax): identifiers are not renamed, whitespace is kept, and there are no
  source maps. HTML, CSS, fonts and icons are copied unchanged. scripts/targets.mjs derives the
  Firefox manifest from src/manifest.json (background.scripts and browser_specific_settings.gecko).

Requirements
  Node.js 22 or later and npm, on macOS, Linux or Windows. Built with Node ${process.versions.node}.
  No network access is needed beyond installing the locked npm packages.

Steps
  npm ci
  npm run build:firefox

  The Firefox build is written to dist-firefox/ (manifest.json at its root). Its files match
  tarjuman-${version}-firefox.zip byte for byte. "npm run build" writes the Chromium build
  (Chrome, Edge, Brave) to dist/.

  npm ci also installs web-ext, used only to lint the Firefox build:
  npx web-ext lint --source-dir dist-firefox
  The other npm scripts in package.json run the project's own checks, which are not part of
  this archive.

Layout
  src/                     extension source: JavaScript ES modules with JSDoc, no framework
  src/manifest.json        base manifest (Chromium); the Firefox layer is in scripts/targets.mjs
  src/ui/fonts/            bundled fonts with their SIL OFL license files
  src/dev/, src/ui/gallery development build only (node scripts/build.mjs --dev), not in the package
  scripts/build.mjs        the build
  LICENSE                  Tarjuman's license
  THIRD_PARTY_NOTICES.txt  third-party fonts, icons and bundler helpers, with their licenses

Tarjuman by Sultan (BySultan) — https://bysltan.com
`;
}

/** يبني هدفًا في مجلد. @param {string} cwd @param {string} script @param {string[]} args */
function runBuild(cwd, script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`تعذّر البناء (${args.join(' ')}): ${r.stderr || r.stdout}`);
}

/** يقارن مجلدين ملفًا ملفًا. @returns {Promise<string[]>} الفروق */
async function diffDirs(a, b) {
  const [fa, fb] = [await walk(a), await walk(b)];
  const out = [];
  if (JSON.stringify(fa) !== JSON.stringify(fb)) out.push(`قائمتا الملفات مختلفتان (${fa.length} مقابل ${fb.length})`);
  for (const f of fa.filter((x) => fb.includes(x))) {
    if (sha256(await readFile(path.join(a, f))) !== sha256(await readFile(path.join(b, f)))) out.push(f);
  }
  return out;
}

/**
 * @param {{ out?: string, log?: (s: string) => void }} [o]
 * @returns {Promise<{ ok: boolean, problems: string[], meta: object, dir: string }>}
 */
export async function makeStorePackages({ out = path.join(ROOT, 'release', 'store'), log = () => {} } = {}) {
  const OUT = path.resolve(out);
  if (OUT === ROOT || inside(ROOT, OUT) || inside(OUT, path.join(ROOT, 'src'))) throw new Error(`مجلد إخراج غير آمن: ${OUT}`);
  const { version } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const name = `tarjuman-${version}`;
  const problems = [];
  const work = await mkdtemp(path.join(os.tmpdir(), 'tj-store-'));
  const meta = {
    name, version, ...sourceState(ROOT, ['src', 'scripts', 'package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']),
    licenseDraft: /^\[قرار\]/.test(await readFile(path.join(ROOT, 'LICENSE'), 'utf8')),
    // بيئة البناء مع البصمات (U63): بصمة كل أرشيف تتبع zlib المربوطة بـNode، وبصمات الملفات داخله لا تتبعها.
    node: process.versions.node, build: buildEnvironment(),
    reproducibility: 'files', builtAt: new Date().toISOString(), packages: {}, source: null,
  };
  try {
    // ---- الفحص الثابت على المصدر قبل البناء (U61): لا حزمة من شيفرة يمنعها ----
    const check = staticCheck(ROOT);
    log(`${check.ok ? '✓' : '✗'} check-static`);
    if (!check.ok) return { ok: false, problems: [`check-static: ${check.output.split('\n').slice(0, 6).join(' ')}`], meta, dir: OUT };

    // ---- البناءان من الجذر، وتدقيق كل هدف ----
    const built = {};
    for (const target of ['chromium', 'firefox']) {
      const dir = path.join(work, target);
      runBuild(ROOT, path.join(ROOT, 'scripts/build.mjs'), ['--target', target, '--out', dir]);
      const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
      if (manifest.version !== version) problems.push(`${target}: رقم البيان ${manifest.version} لا يطابق package.json ${version}`);
      const audit = await auditPackage(dir, { target });
      for (const c of audit.checks.filter((x) => !x.ok)) problems.push(`${target}: تدقيق ${c.id}`);
      for (const p of await scanLeaks(dir, audit.files)) problems.push(`${target}: ${p}`);
      built[target] = { dir, audit };
      log(`${audit.ok ? '✓' : '✗'} تدقيق ${target}: ${audit.checks.filter((c) => c.ok).length}/${audit.checks.length}، ${audit.files.length} ملفًا`);
    }

    // ---- حزمة المصدر، وإعادة البناء منها في مجلد آخر كما يفعل المراجع ----
    const src = await sourceFiles();
    for (const p of await scanLeaks(ROOT, src)) problems.push(`source: ${p}`);
    const readme = sourceReadme(version);
    const sourceEntries = [];
    for (const f of src) sourceEntries.push({ name: f, data: await readFile(path.join(ROOT, f)) });
    sourceEntries.push({ name: 'SOURCE-README.txt', data: Buffer.from(readme, 'utf8') });
    sourceEntries.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
    const sourceZip = createZip(sourceEntries);

    const rebuild = path.join(work, 'from-source');
    for (const e of readZip(sourceZip)) {
      await mkdir(path.dirname(path.join(rebuild, e.name)), { recursive: true });
      await writeFile(path.join(rebuild, e.name), e.data);
    }
    // اعتماديات القفل نفسها دون شبكة: رابط إلى node_modules المثبتة بـnpm ci من package-lock.json نفسه.
    await symlink(path.join(ROOT, 'node_modules'), path.join(rebuild, 'node_modules'), 'dir');
    const reproduced = {};
    for (const target of ['chromium', 'firefox']) {
      const again = path.join(work, `again-${target}`);
      runBuild(rebuild, path.join(rebuild, 'scripts/build.mjs'), ['--target', target, '--out', again]);
      const diff = await diffDirs(built[target].dir, again);
      reproduced[target] = diff.length === 0;
      if (diff.length) problems.push(`source: إعادة بناء ${target} من حزمة المصدر تختلف (${diff.slice(0, 5).join('، ')})`);
    }
    log(`${reproduced.chromium && reproduced.firefox ? '✓' : '✗'} إعادة البناء من حزمة المصدر تطابق الهدفين بايتًا`);

    if (problems.length) return { ok: false, problems, meta, dir: OUT };

    // ---- الكتابة: الحزم والبصمات والوصف ----
    await mkdir(OUT, { recursive: true });
    const zips = {};
    for (const target of ['chromium', 'firefox']) {
      const { dir, audit } = built[target];
      const entries = [];
      for (const f of audit.files) entries.push({ name: f, data: await readFile(path.join(dir, f)) });
      const buf = createZip(entries);
      const back = readZip(buf);
      if (!(back.length === entries.length && back.every((e, i) => e.name === entries[i].name && Buffer.compare(e.data, entries[i].data) === 0))) {
        problems.push(`${target}: الأرشيف لا يطابق المجلد`);
      }
      zips[target] = { buf, audit, files: entries.map((e) => ({ path: e.name, bytes: e.data.length, sha256: sha256(e.data) })) };
    }
    if (problems.length) return { ok: false, problems, meta, dir: OUT };
    const sums = [];
    for (const { store, target } of STORES) {
      const file = `${name}-${store}.zip`;
      await writeFile(path.join(OUT, file), zips[target].buf);
      sums.push(`${sha256(zips[target].buf)}  ${file}`);
      meta.packages[store] = {
        file, target, bytes: zips[target].buf.length, sha256: sha256(zips[target].buf),
        audit: { ok: zips[target].audit.ok, checks: zips[target].audit.checks.map(({ id, ok }) => ({ id, ok })) },
        files: zips[target].files,
      };
      log(`${file} · ${zips[target].buf.length} بايت`);
    }
    const sourceFile = `${name}-source.zip`;
    await writeFile(path.join(OUT, sourceFile), sourceZip);
    sums.push(`${sha256(sourceZip)}  ${sourceFile}`);
    meta.source = { file: sourceFile, bytes: sourceZip.length, sha256: sha256(sourceZip), files: sourceEntries.length, reproduced, paths: SOURCE_PATHS };
    log(`${sourceFile} · ${sourceZip.length} بايت · ${sourceEntries.length} ملفًا`);
    await writeFile(path.join(OUT, 'SHA256SUMS'), `${sums.join('\n')}\n`);
    await writeFile(path.join(OUT, `${name}-store.json`), `${JSON.stringify(meta, null, 2)}\n`);
    return { ok: true, problems, meta, dir: OUT };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const outArg = argv.indexOf('--out');
  const r = await makeStorePackages({ out: outArg > -1 ? argv[outArg + 1] : undefined, log: (s) => console.log(s) });
  if (!r.ok) {
    console.error(`\nلم تُكتب حزم المتاجر:\n- ${r.problems.join('\n- ')}`);
    process.exit(1);
  }
  const rel = path.relative(ROOT, r.dir);
  console.log(`\nحزم المتاجر ${r.meta.name} في ${rel.startsWith('..') ? r.dir : rel}/ · الالتزام ${r.meta.commit ?? 'غير معروف'}${dirtyNote(r.meta.dirty)}`);
  console.log(`البيئة: Node ${r.meta.build.node} · zlib ${r.meta.build.zlib} · ${r.meta.build.platform}-${r.meta.build.arch} (بصمات الأرشيفات تتبع zlib، وبصمات الملفات لا تتبعها)`);
  if (r.meta.licenseDraft) console.log('تنبيه: LICENSE ما زال مسودة [قرار]؛ لا تُرفع الحزم قبل اعتماده.');
}
