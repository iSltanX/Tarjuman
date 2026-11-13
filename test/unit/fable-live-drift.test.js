// تدقيق Fable (FA-06): سكربتات حية يحيل إليها إجراء الصيانة كانت تنتظر محددات لم تعد في src (سكربت الدورة القديم بـ.st-card
// و.st-saved--success و.st-diag__button)، فيفشل الإجراء عند خطوة الإعدادات. الحارس: كل فئة من فئات ترجمان (tj- وlib- وst- وed-)
// داخل سلسلة محدِّد في سكربت حي غير موسوم «مستبدَل» موجودة في src؛ والمستبدَل يُذكر في رأسه ولا يُشغَّل. وكل سكربت يذكره إجراء
// الصيانة موجود وغير مستبدَل.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const walk = async (dir, pred) => (await readdir(dir, { withFileTypes: true, recursive: true }))
  .filter((e) => e.isFile() && pred(e.name))
  .map((e) => path.join(e.parentPath ?? e.path, e.name));
const SUPERSEDED = /مستبدَل/;
const head = (text) => text.split('\n').slice(0, 8).join('\n');
// سكربتات تقرأ صفحات الموقع (iSltanX/WebSiteSultan) لا الإضافة: فئاتها (tj-skip وtj-btn--primary…) في مستودع الموقع وتحرسها
// اختباراته (tests/e2e/tarjuman.spec.ts هناك)، فلا تُطلب في src.
const SITE_SCRIPTS = new Set(['test/live/aa4/site-pages.mjs']);

test('FA-06: فئات ترجمان في محدِّدات السكربتات الحية غير المستبدَلة موجودة في src', async () => {
  const src = (await Promise.all((await walk(path.join(ROOT, 'src'), (n) => /\.(?:js|css|html)$/.test(n))).map((f) => readFile(f, 'utf8')))).join('\n');
  const scripts = [...await walk(path.join(ROOT, 'test/live'), (n) => n.endsWith('.mjs')), ...await walk(path.join(ROOT, 'test/e2e/live'), (n) => n.endsWith('.mjs'))]
    .filter((f) => !f.includes(`${path.sep}harness${path.sep}`) && !SITE_SCRIPTS.has(path.relative(ROOT, f).split(path.sep).join('/')));
  const SEL = /['"`]([^'"`\n]*\.(?:tj|lib|st|ed)-[\w-]+[^'"`\n]*)['"`]/g;
  const missing = [];
  let checked = 0;
  for (const f of scripts) {
    const text = await readFile(f, 'utf8');
    if (SUPERSEDED.test(head(text))) continue;
    for (const m of text.matchAll(SEL)) {
      // :not(.x) نفي لا ينتظر شيئًا، فلا يُعدّ.
      for (const [, cls] of m[1].replace(/:not\([^)]*\)/g, '').matchAll(/\.((?:tj|lib|st|ed)-[\w-]+)/g)) {
        checked++;
        const literal = new RegExp(`(?<![\\w-])${cls}(?![\\w-])`).test(src);
        // فئة مبنية بقالب في المصدر (st-gl__field--${key}): أصلها ثم «--${».
        const built = cls.includes('--') && src.includes(`${cls.split('--')[0]}--\${`);
        if (!literal && !built) missing.push(`${path.relative(ROOT, f)}: .${cls}`);
      }
    }
  }
  assert.ok(checked > 100, `فُحص ${checked}`);
  assert.deepEqual([...new Set(missing)], []);
});

test('FA-06: كل سكربت حي يذكره إجراء الصيانة موجود وغير مستبدَل', async () => {
  const doc = await readFile(path.join(ROOT, 'docs/maintenance.md'), 'utf8');
  // كل ذكر لمسار سكربت حي، لا ما يلي «node» وحده (تدقيق V2، U-056): ذكر مستبدَل بلا أمر يضلل مثله.
  const refs = [...new Set([...doc.matchAll(/(test\/[\w/.-]+\.mjs)/g)].map((m) => m[1]))];
  assert.ok(refs.length >= 4, refs.join());
  for (const rel of refs) {
    const text = await readFile(path.join(ROOT, rel), 'utf8');
    assert.equal(SUPERSEDED.test(head(text)), false, `${rel} مستبدَل ويذكره الإجراء`);
  }
});

test('U-056: دليل الصيانة بلا خطوة نسخ تعليمات من شريط المشغّل (أُزيل في AA3)', async () => {
  const doc = await readFile(path.join(ROOT, 'docs/maintenance.md'), 'utf8');
  assert.doesNotMatch(doc, /نسخ تعليمات الترجمة|ثم «نسخ التعليمات» في كل تبويب/);
});

// ---------------------------------------------------------------- تحقق Gemini، ع-٣٢ (البند 38)
// سكربتات حية بقيت بعد حذف ما تعتمد عليه (src/pages/poc حُذف في 0c03aa8 وثلاثة سكربتات في p1 تفتحه)، وأخرى لا يشير إليها شيء.
// الحراس نصية لا استيراد (استيراد سكربت حي يشغّله): كل صفحة إضافة يذكرها سكربت حي موجودة، وكل استيراد نسبي فيه موجود، وكل
// سكربت حي يشير إليه شيء خارج المجلدات الحية (package.json أو وثيقة أو سكربت أو مصدر أو اختبار) أو سكربت حي مُشار إليه.

const LIVE_DIRS = ['test/live', 'test/e2e/live'];
const posixRel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const liveFiles = async () => (await Promise.all(LIVE_DIRS.map((d) => walk(path.join(ROOT, d), () => true)))).flat().map(posixRel).sort();
const isCode = (rel) => /\.(?:mjs|js)$/.test(rel);

test('ع-٣٢: كل صفحة إضافة (pages/<اسم>/) يذكرها سكربت حي موجودة في src/pages', async () => {
  const missing = [];
  for (const rel of (await liveFiles()).filter(isCode)) {
    if (SITE_SCRIPTS.has(rel)) continue;
    const text = await readFile(path.join(ROOT, rel), 'utf8');
    for (const [, page] of text.matchAll(/\bpages\/([a-z0-9-]+)\/(?:index\.html|[\w-]+\.(?:js|css|html))/g)) {
      if (!(await readdir(path.join(ROOT, 'src/pages', page)).then(() => true, () => false))) missing.push(`${rel}: pages/${page}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('ع-٣٢: كل استيراد نسبي في سكربت حي يشير إلى ملف موجود', async () => {
  const missing = [];
  for (const rel of (await liveFiles()).filter(isCode)) {
    // أسطر الشيفرة وحدها: سطر يبدأ بعلامة اقتباس نصٌّ يُكتب في ملف آخر (مدخل يُبنى في شجرة tj-v1 مثلًا)، لا استيراد.
    const lines = (await readFile(path.join(ROOT, rel), 'utf8')).split('\n').filter((l) => !/^\s*(?:['"`]|\/\/|\*)/.test(l));
    for (const [, spec] of lines.join('\n').matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = path.resolve(ROOT, path.dirname(rel), spec);
      if (!(await readFile(target).then(() => true, () => false))) missing.push(`${rel}: ${spec}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('ع-٣٢: لا سكربت حي ميت: كل ملف تحت المجلدات الحية يشير إليه شيء خارجها أو ملف حي مُشار إليه', async () => {
  // مجلدات لا تُعدّ إشارة: المولَّد والمحلي والعيّنات.
  const SKIP = /^(?:node_modules|\.git|\.claude|dist[\w-]*|release|test-results|audit|coverage)\/|^test\/fixtures\//;
  const TEXT = /\.(?:m?js|cjs|json|md|ya?ml|txt|html|css)$/;
  const roots = [];
  // المستوى الأعلى أولًا، فلا يُمشى node_modules ولا مخرجات البناء.
  const top = (await readdir(ROOT, { withFileTypes: true })).filter((e) => !SKIP.test(`${e.name}/`));
  const entries = (await Promise.all(top.map(async (e) => (e.isDirectory() ? readdir(path.join(ROOT, e.name), { withFileTypes: true, recursive: true }) : [e])))).flat();
  for (const e of entries) {
    const abs = path.join(e.parentPath ?? e.path ?? ROOT, e.name);
    const rel = posixRel(abs);
    if (!e.isFile() || !TEXT.test(e.name) || SKIP.test(rel) || LIVE_DIRS.some((d) => rel.startsWith(`${d}/`))) continue;
    roots.push({ rel, text: await readFile(abs, 'utf8') });
  }
  const live = await liveFiles();
  const texts = new Map(await Promise.all(live.map(async (rel) => [rel, await readFile(path.join(ROOT, rel), 'utf8')])));
  /** هل يشير النص (من الملف from) إلى الملف الحي rel: بمساره الكامل، أو باستيراد نسبي، أو بمجلده وحده، أو بآخر مقطعين منه. */
  const pointsTo = (from, text, rel) => {
    const dir = path.posix.dirname(rel);
    const relSpec = path.posix.relative(path.posix.dirname(from), rel);
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.includes(rel)
      || new RegExp(`['"\`](?:\\./)?${escape(relSpec)}['"\`]`).test(text)
      || new RegExp(`${escape(dir)}/?(?![\\w.-]|/[\\w.-])`).test(text)
      || text.includes(`${path.posix.basename(dir)}/${path.posix.basename(rel)}`);
  };
  const alive = new Set(live.filter((rel) => roots.some((r) => pointsTo(r.rel, r.text, rel))));
  for (let grew = true; grew;) {
    grew = false;
    for (const rel of live) {
      if (alive.has(rel)) continue;
      if ([...alive].some((a) => pointsTo(a, texts.get(a), rel))) {
        alive.add(rel);
        grew = true;
      }
    }
  }
  assert.ok(alive.size > 30, `${alive.size}`);
  assert.deepEqual(live.filter((rel) => !alive.has(rel)), []);
});

// ---------------------------------------------------------------- تحقق الجولة الثانية (ن-١٢)
// test/live/controls/run.mjs أُصلحت فيه مجموعة download وحدها (71729ea)، وبقي باقيه ينتظر نصوصًا عربية صلبة (بعضها لم يعد في الفهرس)
// فيسقط بلغة واجهة أخرى أو بعد تغيير نص، ويخرج بالرمز 0 دائمًا. الحارس نصي (استيراده يشغّله): لا نص عربي في تعبير مقارنة أو في
// انتظار قائمة، والنتيجة تُخرج 1 عند أي سقوط أو توقف.
const ARABIC = /[؀-ۿ]/;
/** الشيفرة بلا تعليقات السطر. */
const codeOf = (text) => text.split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/\s.*$/, '')).join('\n');

test('ن-١٢: controls/run.mjs بلا نص عربي صلب في مقارنة أو انتظار قائمة: كل متوقع من الفهرس بلغة الواجهة', async () => {
  const code = codeOf(await readFile(path.join(ROOT, 'test/live/controls/run.mjs'), 'utf8'));
  const hits = [
    ...[...code.matchAll(/\/((?:[^/\n\\]|\\.)+)\/[a-z]*\.test\(/g)].filter((m) => ARABIC.test(m[1])).map((m) => `regex ${m[0].slice(0, 40)}`),
    ...[...code.matchAll(/[!=]==\s*(['"`])([^'"`\n]*)\1/g)].filter((m) => ARABIC.test(m[2])).map((m) => `مقارنة ${m[0].slice(0, 40)}`),
    ...[...code.matchAll(/\b(?:openMenuOf|clickItem)\(([^)\n]*)\)/g)].filter((m) => ARABIC.test(m[1])).map((m) => `قائمة ${m[0].slice(0, 40)}`),
  ];
  assert.deepEqual(hits, []);
  assert.match(code, /catalogOf\(/);
  assert.match(code, /setLocale\(/);
});

test('ن-١٢: controls/run.mjs يخرج بالرمز 1 عند أي سقوط أو توقف، لا 0 دائمًا', async () => {
  const code = codeOf(await readFile(path.join(ROOT, 'test/live/controls/run.mjs'), 'utf8'));
  assert.match(code, /process\.exitCode = result\.passed \? 0 : 1/);
  // التوقف (استثناء، تحدّي الروبوت) فشل ولو نجح كل ما قبله.
  assert.match(code, /result\.passed = !result\.stopped && /);
});

// ---------------------------------------------------------------- تحقق الجولة الثانية (ح-31)
// test/live/p1/make-fixtures.mjs حُذف مع السكربتات الميتة (dc58daa) ودليل الصيانة يطلب عيّنة json3 جديدة عند تغيّر الصيغة (§٤).
// أُعيد، وهو بلا متصفح: يُشغَّل هنا في شجرة مؤقتة (يكتب في test/fixtures/json3 بجوار مساره)، فيعيد قيم عيّنة TED المحفوظة نفسها.
const runMakeFixtures = async (name, args) => {
  const { mkdtemp, cp, mkdir, rm } = await import('node:fs/promises');
  const os = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const t = await mkdtemp(path.join(os.tmpdir(), `tj-make-fixtures-${name}-`));
  await cp(path.join(ROOT, 'src'), path.join(t, 'src'), { recursive: true, filter: (p) => !p.includes(`${path.sep}fonts${path.sep}`) });
  for (const rel of ['test/live/p1/make-fixtures.mjs', 'test/live/harness/netlog.mjs']) {
    await mkdir(path.dirname(path.join(t, rel)), { recursive: true });
    await cp(path.join(ROOT, rel), path.join(t, rel));
  }
  const r = spawnSync(process.execPath, [path.join(t, 'test/live/p1/make-fixtures.mjs'), ...args(t)], { encoding: 'utf8' });
  const out = path.join(t, 'test/fixtures/json3');
  const index = await readFile(path.join(out, 'index.json'), 'utf8').then(JSON.parse, () => null);
  await rm(t, { recursive: true, force: true });
  return { r, index };
};

test('ح-31: make-fixtures.mjs يحفظ عيّنة json3 ويكتب فهرسها بالقيم التي في المستودع لعيّنة TED نفسها، بلا متصفح', async () => {
  const fixtures = path.join(ROOT, 'test/fixtures/json3');
  const ref = JSON.parse(await readFile(path.join(fixtures, 'index.json'), 'utf8')).fixtures.find((f) => f.videoId === 'iG9CE55wbtY');
  const { r, index } = await runMakeFixtures('ok', () => [path.join(fixtures, ref.file), '--id', ref.videoId, '--kind', ref.trackKind, '--name', 'manual-ted-copy',
    '--browser', 'brave', '--duration-ms', String(ref.durationMs), '--title', ref.source.title, '--channel', ref.source.channel, '--license', ref.source.license]);
  assert.equal(r.status, 0, r.stderr);
  const got = index.fixtures.find((f) => f.file === 'manual-ted-copy.json');
  assert.deepEqual({ ...got, file: ref.file, capturedAt: ref.capturedAt }, ref);
});

test('ح-31: make-fixtures.mjs يرفض جسمًا فيه رابط أو رمز، وبلا معاملاته المطلوبة خطأ استعمال، ولا يكتب شيئًا', async () => {
  const leaky = path.join(ROOT, 'test/fixtures/json3/manual-ted-iG9CE55wbtY.json');
  const { r, index } = await runMakeFixtures('leak', (t) => {
    const f = path.join(t, 'leak.json');
    // جسم بمعامل pot (يُبنى وقت التشغيل فلا يحمله الملف).
    writeFileSync(f, JSON.stringify({ events: [], u: ['https://www.youtube.com/api/timedtext?v=x&', 'pot', '=', 'A'.repeat(40)].join('') }));
    return [f, '--id', 'aaaaaaaaaaa', '--kind', 'manual', '--name', 'leak', '--duration-ms', '1000'];
  });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /نمط حساس/);
  assert.equal(index, null);
  const usage = await runMakeFixtures('usage', () => [leaky, '--kind', 'manual']);
  assert.equal(usage.r.status, 2, usage.r.stderr);
  assert.match(usage.r.stderr, /--id/);
  assert.equal(usage.index, null);
});
