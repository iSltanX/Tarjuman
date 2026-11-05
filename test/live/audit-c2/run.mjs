// الاختبار الحي لمرحلة C2 من خطة إصلاح تدقيق 7a66f91 (docs/audit-7a66f91/03-plan.md و c2-design.md §١٠)، بلا نافذة، بملفات
// تعريف اختبار مؤقتة تُحذف بعده، وبلا شبكة ولا حساب (قرار سلطان Q05). يبني نسخة تطوير مؤقتة خارج المستودع ويحقن فيها صفحة
// الاختبار (test/live/audit-c2/page.js مجمّعة في tests/c2.html)، ويفتحها في تبويبين: سياقان حقيقيان يكتبان عبر العامل الخلفي.
//   stress   أزواج بسياقين بالآلاف: حفظ المحرّر مع ±، وsetPrefs مع setPrefs، و«آخر موضع» مع التفعيل، وحفظان على نسخة واحدة،
//            و± مع «مسح كل البيانات». المقبول: صفر ST_CORRUPT_RECORD وصفر ضياع صامت وصفر بقايا بعد المسح.
//   i02      200 دورة حذف واستعادة و«b» يشاهد الفيديو بمتحكم: حالته تطابق المخزَّن بعد الاستقرار.
//   latency  زمن تسليم onChanged بحزمة صغيرة وأخرى بنحو 1 م.ب.
//   restart  Chromium: إيقاف عامل الخدمة (ServiceWorker.stopAllWorkers) بين الكتابات وفي منتصف استعادة. Firefox: خمول صفحة
//            الخلفية 35 ث ثم كتابة.
//   timing   زمن ± على حزمة بنحو 2,000 مقطع، بالبناء الحالي وبالالتزام قبل C2 (--base، افتراضيًا 78ac275)، لمعيار D4.
// الاستعمال (بإذن سلطان، وبعد إعلامه):
//   command node test/live/audit-c2/run.mjs --browser chrome|firefox|brave|edge --scenarios stress,i02,latency,restart,timing --out <مجلد> [--pairs 1000]
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { PROFILE_ROOT, sleep } from '../harness/browser.mjs';
import { startBrowser } from '../stores/driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const BROWSER = arg('browser', 'chrome');
const SCENARIOS = String(arg('scenarios', 'stress,i02,latency,restart,timing')).split(',');
const PAIRS = Number(arg('pairs', '1000'));
const BASE = arg('base', '78ac275');
const OUT = path.resolve(arg('out', path.join(os.tmpdir(), 'tj-c2-live-out')));
const TMP = await mkdtemp(path.join(os.tmpdir(), 'tj-c2-live-'));
const TARGET = BROWSER === 'firefox' ? 'firefox' : 'chromium';
const profiles = [];
const result = { browser: BROWSER, startedAt: new Date().toISOString(), versions: {}, steps: {}, checks: [], notes: [] };
const check = (id, ok, detail = {}) => { result.checks.push({ id, ok: !!ok, ...detail }); console.log(`${ok ? '✓' : '✗'} ${id} ${JSON.stringify(detail).slice(0, 300)}`); };

async function step(name, fn) {
  const t0 = Date.now();
  try {
    result.steps[name] = { ok: true, value: await fn(), ms: Date.now() - t0 };
  } catch (err) {
    result.steps[name] = { ok: false, error: String(err?.stack ?? err).slice(0, 800), ms: Date.now() - t0 };
    console.log(`✗ خطوة ${name}: ${String(err?.message ?? err).slice(0, 300)}`);
  }
}

// أدوات البيانات الاختبارية (test/helpers/fixtures.js) تستورد node:fs وnode:path وnode:url لعيّنات json3 وحدها، ولا تستعملها
// sampleBundle وmakeCues: بدائل دنيا في الحزمة، وقراءة الملفات ترمي إن طُلبت.
const NODE_STUBS = {
  'node:fs': 'export const readFileSync = () => { throw new Error("no fs in page"); };',
  'node:path': 'const j = (...p) => p.join("/"); export const resolve = j; export const join = j; export const dirname = (p) => p; export default { resolve: j, join: j, dirname: (p) => p };',
  'node:url': 'export const fileURLToPath = (u) => String(u);',
};
const nodeStubs = {
  name: 'node-stubs',
  setup(b) {
    b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, namespace: 'node-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'node-stub' }, (a) => ({ contents: NODE_STUBS[a.path] ?? 'export default {};', loader: 'js' }));
  },
};

/** بناء تطوير لشجرة root، ومعه صفحة الاختبار مجمّعة من page.js في الشجرة نفسها. */
async function prepare(root, tag) {
  const out = path.join(TMP, `${tag}-${TARGET}`);
  execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs'), '--dev', '--target', TARGET, '--out', out], { cwd: root, stdio: 'ignore' });
  await mkdir(path.join(out, 'tests'), { recursive: true });
  await build({
    entryPoints: [path.join(root, 'test/live/audit-c2/page.js')], bundle: true, format: 'iife', target: 'es2022', outfile: path.join(out, 'tests/c2.js'),
    absWorkingDir: root, logLevel: 'silent', define: { __TJ_DEV__: 'false' }, plugins: [nodeStubs],
  });
  await writeFile(path.join(out, 'tests/c2.html'), '<!doctype html><meta charset="utf-8"><title>c2</title><script src="c2.js"></script>\n');
  return out;
}

/** شجرة الالتزام base (قبل C2) لقياس زمن ± بالكتابة المباشرة، ومعها page.js الحالية. */
async function baseTree() {
  const dir = path.join(TMP, 'base-src');
  await mkdir(dir, { recursive: true });
  const tar = path.join(TMP, 'base.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tar, BASE], { cwd: ROOT });
  execFileSync('tar', ['-xf', tar, '-C', dir]);
  await symlink(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  await mkdir(path.join(dir, 'test/live/audit-c2'), { recursive: true });
  await cp(path.join(ROOT, 'test/live/audit-c2/page.js'), path.join(dir, 'test/live/audit-c2/page.js'));
  return dir;
}

async function session(ext, tag) {
  const profile = `c2-${BROWSER}-${tag}-${randomUUID().slice(0, 8)}`;
  profiles.push(profile);
  const s = await startBrowser(BROWSER, { profile, ext, downloadDir: path.join(TMP, `dl-${tag}`) });
  result.versions[tag] = s.version;
  const open = async (hash) => {
    const p = await s.openExt(`tests/c2.html#${hash}`);
    for (let i = 0; i < 80; i++) {
      if (await p.eval(() => Boolean(window.__c2?.ready)).catch(() => false)) return p;
      await sleep(250);
    }
    throw new Error(`لم تجهز صفحة الاختبار ${hash}`);
  };
  return { s, open };
}

const evalIn = (page, fn, args = []) => page.eval(fn, { args, timeoutMs: 120000 });

/** يجمع نتائج دفعات (كل تقييم دون مهلة القناة). */
async function batches(a, kind, total, size = 100) {
  const sum = {};
  for (let done = 0; done < total; done += size) {
    const r = await evalIn(a, (k, n) => window.__c2.stress[k](n), [kind, Math.min(size, total - done)]);
    for (const [k, v] of Object.entries(r)) {
      if (Array.isArray(v)) sum[k] = [...(sum[k] ?? []), ...v].slice(0, 20);
      else if (typeof v === 'number') sum[k] = (sum[k] ?? 0) + v;
    }
  }
  return sum;
}

async function stressScenario(ext) {
  const { s, open } = await session(ext, 'stress');
  try {
    // «b» أولًا: آخر تبويب يُفتح هو الظاهر، والمؤقتات في التبويب الخلفي تُبطَّأ إلى ثانية على الأقل في Firefox.
    await open('b');
    const a = await open('a');
    const r = {};
    r.saveNudge = await batches(a, 'saveNudge', PAIRS);
    check('stress-save-nudge', r.saveNudge.corrupt === 0 && r.saveNudge.silent === 0 && !(r.saveNudge.errors ?? []).length, r.saveNudge);
    r.prefsPrefs = await batches(a, 'prefsPrefs', PAIRS);
    check('stress-prefs-prefs', r.prefsPrefs.silent === 0 && !(r.prefsPrefs.errors ?? []).length, r.prefsPrefs);
    r.positionActivate = await batches(a, 'positionActivate', PAIRS);
    check('stress-position-activate', r.positionActivate.corrupt === 0 && r.positionActivate.silent === 0 && !(r.positionActivate.errors ?? []).length, r.positionActivate);
    r.saveSave = await batches(a, 'saveSave', PAIRS);
    check('stress-save-save', r.saveSave.corrupt === 0 && r.saveSave.bothOk === 0 && !(r.saveSave.errors ?? []).length, r.saveSave);
    r.nudgeClear = await batches(a, 'nudgeClear', Math.min(PAIRS, 300), 50);
    check('stress-nudge-clear', r.nudgeClear.leftovers === 0 && !(r.nudgeClear.errors ?? []).length, r.nudgeClear);
    r.errors = s.errors();
    check('stress-no-extension-errors', r.errors.every((e) => e.errors.length === 0), { errors: r.errors.filter((e) => e.errors.length) });
    return r;
  } finally {
    await s.close();
  }
}

async function i02Scenario(ext) {
  const { s, open } = await session(ext, 'i02');
  try {
    // «b» أولًا: آخر تبويب يُفتح هو الظاهر، والمؤقتات في التبويب الخلفي تُبطَّأ إلى ثانية على الأقل في Firefox.
    await open('b');
    const a = await open('a');
    const r = await batches(a, 'deleteRestore', 200, 50);
    check('i02-delete-restore-watching', r.mismatches === 0, r);
    return r;
  } finally {
    await s.close();
  }
}

async function latencyScenario(ext) {
  const { s, open } = await session(ext, 'latency');
  try {
    // «b» أولًا: آخر تبويب يُفتح هو الظاهر، والمؤقتات في التبويب الخلفي تُبطَّأ إلى ثانية على الأقل في Firefox.
    await open('b');
    const a = await open('a');
    const small = await evalIn(a, (n) => window.__c2.stress.latency(n), [40]);
    const big = await evalIn(a, (n, cues) => window.__c2.stress.latency(n, { cues }), [30, 1200]);
    check('latency-onchanged', small.samples > 0 && big.samples > 0, { small, big });
    return { small, big };
  } finally {
    await s.close();
  }
}

async function restartScenario(ext) {
  const { s, open } = await session(ext, 'restart');
  try {
    // «b» أولًا: آخر تبويب يُفتح هو الظاهر، والمؤقتات في التبويب الخلفي تُبطَّأ إلى ثانية على الأقل في Firefox.
    await open('b');
    const a = await open('a');
    const out = { wakes: [], restore: null };
    await evalIn(a, () => window.__c2.run('reset', {}));
    if (s.kind === 'chromium') {
      // حالة عامل الإضافة من أحداث CDP نفسها: يثبت أنه توقف قبل الكتابة، لا أن الكتابة وجدته حيًا.
      const status = new Map();
      const transitions = [];
      a.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
        for (const v of versions) {
          if (!String(v.scriptURL).endsWith('/background/worker.js')) continue;
          if (status.get(v.versionId) !== v.runningStatus) transitions.push(v.runningStatus);
          status.set(v.versionId, v.runningStatus);
        }
      });
      await a.send('ServiceWorker.enable');
      await sleep(300);
      const running = () => [...status.values()].some((x) => x === 'running' || x === 'starting');
      for (let i = 0; i < 10; i++) {
        await a.send('ServiceWorker.stopAllWorkers');
        let stopped = false;
        for (let k = 0; k < 40 && !stopped; k++) {
          await sleep(50);
          stopped = status.size > 0 && !running();
        }
        const t0 = Date.now();
        const w = await evalIn(a, (name) => window.__c2.run('rename', { name }), [`بعد الإيقاف ${i}`]);
        out.wakes.push({ ok: w.ok, code: w.code ?? null, ms: Date.now() - t0, stoppedBefore: stopped, runningAfter: running() });
      }
      out.transitions = transitions.slice(0, 60);
      const pending = evalIn(a, (n) => window.__c2.run('restoreMany', { count: n }), [20]);
      await sleep(40);
      await a.send('ServiceWorker.stopAllWorkers');
      out.restore = await pending;
      out.after = await evalIn(a, (n) => window.__c2.run('checkMany', { count: n }), [20]);
      check('restart-wake-writes', out.wakes.every((w) => w.ok) && out.wakes.every((w) => w.stoppedBefore), { wakes: out.wakes, transitions: out.transitions });
      check('restart-mid-restore', out.restore.ok && out.after.ok && out.after.value.incomplete === 0, { restore: out.restore, after: out.after });
    } else {
      await sleep(35000);
      const t0 = Date.now();
      const w = await evalIn(a, () => window.__c2.run('rename', { name: 'بعد الخمول' }));
      out.wakes.push({ ok: w.ok, code: w.code ?? null, ms: Date.now() - t0 });
      check('restart-idle-background', w.ok, { wakes: out.wakes });
    }
    out.errors = s.errors();
    return out;
  } finally {
    await s.close();
  }
}

async function timingScenario(ext, baseExt) {
  const one = async (e, tag) => {
    const { s, open } = await session(e, tag);
    try {
      const a = await open('a');
      return await evalIn(a, (n, cues) => window.__c2.nudgeTiming(n, { cues }), [60, 2000]);
    } finally {
      await s.close();
    }
  };
  // جولتان متعاكستا الترتيب (الحالي ثم السابق، ثم السابق ثم الحالي)، فلا تحمّل الجلسة الباردة الأولى أحدهما وحده.
  const rounds = [];
  for (const order of [['current', 'base'], ['base', 'current']]) {
    const r = {};
    for (const tag of order) r[tag] = await one(tag === 'current' ? ext : baseExt, `timing-${tag}-${rounds.length}`);
    rounds.push(r);
  }
  const med = (tag) => [...rounds.map((r) => r[tag].median)].sort((x, y) => x - y)[0] * 0.5 + [...rounds.map((r) => r[tag].median)].sort((x, y) => x - y)[1] * 0.5;
  const current = med('current');
  const base = med('base');
  const limit = Math.max(base * 1.15, base + 10);
  check('timing-nudge-d4', current <= limit && rounds.every((r) => !r.current.error), { currentMedianMs: current, baseMedianMs: base, limitMs: Math.round(limit * 10) / 10, rounds });
  return { rounds, current, base };
}

/** فحص قصير للقناة بين التبويبين وللكتابة عبر العامل، بمهلات قصيرة (للتشخيص قبل الأزواج الطويلة). */
async function probeScenario(ext) {
  const { s, open } = await session(ext, 'probe');
  try {
    const b = await open('b');
    const a = await open('a');
    const race = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r({ timeout: ms }), ms))]);
    const out = {};
    out.localRead = await race(evalIn(a, () => window.__c2.run('read', {})), 15000);
    out.reset = await race(evalIn(a, () => window.__c2.run('reset', {})), 20000);
    out.readB = await race(evalIn(b, () => window.__c2.run('read', {})), 15000);
    out.remote = await race(evalIn(a, () => Promise.race([window.__c2.remote('read', {}), new Promise((r) => setTimeout(() => r({ timeout: 'channel' }), 5000))])), 15000);
    out.nudge = await race(evalIn(a, () => window.__c2.run('nudge', {})), 20000);
    out.cost = await race(evalIn(a, (n) => window.__c2.costProbe(n), [30]), 110000);
    out.errors = s.errors();
    check('probe', !out.localRead?.timeout && out.reset?.ok && out.remote?.ok, out);
    return out;
  } finally {
    await s.close();
  }
}

await mkdir(OUT, { recursive: true });
try {
  const ext = await prepare(ROOT, 'current');
  if (SCENARIOS.includes('probe')) await step('probe', () => probeScenario(ext));
  if (SCENARIOS.includes('stress')) await step('stress', () => stressScenario(ext));
  if (SCENARIOS.includes('i02')) await step('i02', () => i02Scenario(ext));
  if (SCENARIOS.includes('latency')) await step('latency', () => latencyScenario(ext));
  if (SCENARIOS.includes('restart')) await step('restart', () => restartScenario(ext));
  if (SCENARIOS.includes('timing')) {
    const baseExt = await prepare(await baseTree(), 'base');
    await step('timing', () => timingScenario(ext, baseExt));
  }
} finally {
  for (const p of profiles) await rm(path.join(PROFILE_ROOT, p), { recursive: true, force: true }).catch(() => {});
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  result.finishedAt = new Date().toISOString();
  result.profilesRemoved = profiles.length;
  await writeFile(path.join(OUT, `c2-${BROWSER}.json`), `${JSON.stringify(result, null, 2)}\n`);
  const bad = result.checks.filter((c) => !c.ok).map((c) => c.id);
  const failedSteps = Object.entries(result.steps).filter(([, v]) => v && v.ok === false).map(([k]) => k);
  console.log(`C2 حي (${BROWSER}): ${result.checks.length} فحصًا، فشل ${bad.length} [${bad.join('، ')}]، وخطوات متعطلة [${failedSteps.join('، ')}]`);
  process.exit(0);
}
