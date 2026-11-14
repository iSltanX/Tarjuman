// بوابة يوم النشر (تحقق 2.3.0، ص-٢ ب): scripts/release/gate.mjs تفشل ما بقي في الملفات التي تُنشر أو تُرفع ما ينتظر النشر (تاريخ
// سريان غير مثبت، وعنصر نائب ⟨…⟩، وتنبيه «لم يُنشر» للإصدار، وعنوان السجل بلا تاريخ). وكان --strict وحده لا يشغّله شيء. وليست في check
// ولا check:all ولا package، لأن الفرع قبل يوم النشر يحمل ذلك بحق، وتشغّلها CI على main وطلبات الدمج إليه.
// الاختبارات على نصوص مصنوعة ومستودع مؤقت، لا على حال المستودع: البوابة تفشل عليه قبل يوم النشر وتنجح بعده.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCLUDED, changelogProblems, inScope, placeholderProblems, privacyProblems, runGate, unpublishedProblems } from '../../../scripts/release/gate.mjs';
import { SOURCE, SOURCE_EN, TARGET, generate, withEffectiveDate } from '../../../scripts/site/privacy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
/** المصدر بلا تاريخ في سطر الرأس، أيًّا كانت حاله. @param {string} t */
const undated = (t) => t.replace(/^- \*\*تاريخ السريان:\*\* .+$/m, '- **تاريخ السريان:** ⟨تاريخ النشر⟩');
/** تاريخ لا يكونه تاريخ النشر الحقيقي، فالاختبار لا يتعلق بحال المصدر. */
const DAY = '2031-01-02';

test('العنصر النائب: ⟨…⟩ في النص يُرفض، وبين علامتي شيفرة اسمٌ يمر، ومتغيرا القالب ⟨رقم الإصدار⟩ و⟨لقطة: …⟩ يمران', () => {
  const text = [
    '- **تاريخ السريان:** ⟨تاريخ النشر⟩',
    '> عاد `⟨تاريخ النشر⟩` في AA4، و`⟨بعد T7⟩` كانت علامة',
    'كما تفعله شيفرة الإصدار ⟨رقم الإصدار⟩.',
    '**اللقطة:** ⟨لقطة: المحرّر⟩',
    '- **Version 2.3.0, released on ⟨تاريخ النشر⟩:** text, and ⟨رابط Firefox⟩.',
  ].join('\n');
  assert.deepEqual(placeholderProblems('docs/site/x.md', text), [
    'docs/site/x.md:1: عنصر نائب ينتظر النشر ⟨تاريخ النشر⟩',
    'docs/site/x.md:5: عنصر نائب ينتظر النشر ⟨تاريخ النشر⟩',
    'docs/site/x.md:5: عنصر نائب ينتظر النشر ⟨رابط Firefox⟩',
  ]);
});

test('تنبيه «لم يُنشر»: جملة فيها رقم الإصدار وعبارة «لم يُنشر/لم يُرفع» أو مقابلها الإنجليزي، لا جملة إصدار آخر ولا جملة بلا رقم', () => {
  const flagged = (line) => unpublishedProblems('f.md', line, '2.3.0');
  for (const line of [
    '## 2.3.0 — لم يُنشر بعد',
    '> **حالة الإصدار:** المنشور **2.2.0** (2026-11-11) في Chrome Web Store. و**2.3.0** في المستودع ولم يُرفع بعد: التصدير بصيغة WebVTT.',
    '> **2.3.0 (2026-11-14، لم يُنشر):** تغيّر ما تحفظه الإضافة.',
    '> **الإصدار 2.3.0 (2026-11-14، لم يُرفع):** أُضيف إلى «المميزات».',
    '> **Release status:** version **2.2.0** is published. **2.3.0** is in the repository and hasn’t been submitted yet: exporting.',
    "Version `v2.3.0` has not been published.",
    'نصوص 2.3.0 لم تُنشر في الموقع.',
  ]) assert.equal(flagged(line).length, 1, line);
  for (const line of [
    '## 2.1.2 — لم يُنشر بعد',
    '> **حالة الإصدار:** الإصدار الحالي **2.3.0** (2026-12-01): التصدير بصيغة WebVTT. ولم يُنشر ترجمان في Firefox Add-ons بعد.',
    'Version **2.3.0** is current. Tarjuman isn’t published on Firefox Add-ons yet.',
    '## 12.3.0 — لم يُنشر بعد',
    '## 2.3.0.1 — لم يُنشر بعد',
    '- **الإصدار 2.3.0، صدر في 2026-12-01:** يُحفظ على جهازك.',
    'والنص كله نحو 4,200 محرف (منذ 2.3.0، بفقرات زرّي CC). وحد الحقل الفعلي غير معروف (غير منشور، ولم يُتحقق منه في اللوحة).',
  ]) assert.deepEqual(flagged(line), [], line);
  assert.deepEqual(unpublishedProblems('CHANGELOG.md', '# سجل\n\n## 2.3.0 — لم يُنشر بعد\n', '2.3.0'), ['CHANGELOG.md:3: تنبيه «لم يُنشر» للإصدار 2.3.0: «## 2.3.0 — لم يُنشر بعد»']);
});

test('عنوان الإصدار في السجل بتاريخ صحيح «## <الإصدار> — YYYY-MM-DD»', () => {
  const log = (head) => `# سجل التغييرات\n\n${head}\n\n- بند\n\n## 2.2.0 — 2026-11-11\n`;
  assert.deepEqual(changelogProblems(log('## 2.3.0 — 2026-12-01'), '2.3.0'), []);
  assert.deepEqual(changelogProblems(log('## 1.1.0 — 2026-11-06 — أول نسخة للمتاجر'), '1.1.0'), []);
  for (const head of ['## 2.3.0 — لم يُنشر بعد', '## 2.3.0 — 2026-02-30', '## 2.3.0']) {
    assert.match(changelogProblems(log(head), '2.3.0').join('\n'), /^CHANGELOG\.md:3: عنوان الإصدار بلا تاريخ صحيح/, head);
  }
  assert.deepEqual(changelogProblems(log('## 2.2.1 — 2026-12-01'), '2.3.0'), ['CHANGELOG.md: لا عنوان للإصدار 2.3.0']);
});

test('النطاق: ما يُنشر أو يُرفع، لا شيفرة الأدوات واختباراتها وأدوات الهوية', () => {
  for (const rel of ['README.md', 'CHANGELOG.md', 'PRIVACY.md', 'docs/site/privacy.md', 'docs/user-guide.md', 'store/listing.ar.md', 'src/_locales/ar/messages.json', '.github/PULL_REQUEST_TEMPLATE.md']) {
    assert.equal(inScope(rel), true, rel);
  }
  for (const rel of ['scripts/site/privacy.mjs', 'scripts/release/v2-readme.md', 'test/unit/site/privacy.test.js', 'tools/brand/icons.mjs']) assert.equal(inScope(rel), false, rel);
  assert.deepEqual([...EXCLUDED], ['scripts/', 'test/', 'tools/']);
});

test('الخصوصية في البوابة كـ--strict --check: تفشل بلا تاريخ، وتنجح بعد --effective، وتفشل إن اختلف تاريخ النسختين أو PRIVACY.md', () => {
  const { version } = JSON.parse(read('package.json'));
  const ar = withEffectiveDate(undated(read(SOURCE)), DAY);
  const en = withEffectiveDate(undated(read(SOURCE_EN)), DAY);
  const dated = { [SOURCE]: ar, [SOURCE_EN]: en, [TARGET]: generate({ source: ar, version }).text };
  const at = (files) => (rel) => files[rel];
  assert.deepEqual(privacyProblems(at(dated), version), []);
  const pendingAr = undated(ar);
  assert.match(privacyProblems(at({ ...dated, [SOURCE]: pendingAr, [TARGET]: generate({ source: pendingAr, version }).text }), version).join('\n'), /تاريخ السريان غير مثبت/);
  assert.match(privacyProblems(at({ ...dated, [SOURCE_EN]: undated(en) }), version).join('\n'), /privacy\.en\.md: تاريخ السريان غير مثبت/);
  assert.match(privacyProblems(at({ ...dated, [TARGET]: `${dated[TARGET]}\n` }), version).join('\n'), /PRIVACY\.md: لا يطابق/);
  const decision = ar.replace('\n## جدول الأدلة', '\nنص لم يُحسم **[قرار]**\n\n## جدول الأدلة');
  assert.notEqual(decision, ar);
  assert.match(privacyProblems(at({ ...dated, [SOURCE]: decision }), version).join('\n'), /\[قرار\]/);
});

test('runGate: الفحوص الأربعة على ملفات النطاق، ويتخطى الثنائي وما خارج النطاق', () => {
  const version = '9.9.9';
  const ar = withEffectiveDate(undated(read(SOURCE)), DAY);
  const files = {
    'package.json': JSON.stringify({ version }),
    'CHANGELOG.md': `# سجل\n\n## ${version} — ${DAY}\n`,
    [SOURCE]: ar,
    [SOURCE_EN]: withEffectiveDate(undated(read(SOURCE_EN)), DAY),
    [TARGET]: generate({ source: ar, version }).text,
    'README.md': `> **حالة الإصدار:** الإصدار الحالي **${version}** (${DAY}): مزايا. ولم يُنشر ترجمان في Firefox Add-ons بعد.\n`,
    'scripts/site/x.mjs': "export const PENDING = '⟨تاريخ النشر⟩'; // 9.9.9 لم يُنشر\n",
    'test/unit/x.test.js': '// ## 9.9.9 — لم يُنشر بعد ⟨تاريخ النشر⟩\n',
    'src/icons/x.png': null,
  };
  const gate = (over = {}) => {
    const all = { ...files, ...over };
    return runGate({ files: Object.keys(all), read: (rel) => all[rel] });
  };
  const clean = gate();
  assert.deepEqual(clean.problems, []);
  assert.equal(clean.version, version);
  assert.equal(clean.scanned, 6, 'package.json والسجل والمصدران وPRIVACY.md وREADME، بلا الثنائي ولا ما خارج النطاق');
  const pending = gate({ 'README.md': `> و**${version}** في المستودع ولم يُرفع بعد: مزايا.\n`, 'docs/site/x.md': 'صدر في ⟨تاريخ النشر⟩\n' });
  assert.deepEqual(pending.problems, [
    `README.md:1: تنبيه «لم يُنشر» للإصدار ${version}: «> و**${version}** في المستودع ولم يُرفع بعد»`,
    'docs/site/x.md:1: عنصر نائب ينتظر النشر ⟨تاريخ النشر⟩',
  ]);
  assert.match(gate({ 'CHANGELOG.md': `## ${version} — لم يُنشر بعد\n` }).problems.join('\n'), /عنوان الإصدار بلا تاريخ صحيح/);
});

test('الأمر نفسه على مستودع مؤقت: يقرأ ما يتتبعه Git وحده، ويخرج 1 بما ينتظر النشر و0 بلا شيء', async () => {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tj-release-gate-')));
  try {
    for (const rel of ['scripts/release/gate.mjs', 'scripts/site/privacy.mjs']) {
      await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await cp(path.join(ROOT, rel), path.join(dir, rel));
    }
    const version = '9.9.9';
    const ar = withEffectiveDate(undated(read(SOURCE)), DAY);
    await mkdir(path.join(dir, 'docs/site'), { recursive: true });
    const write = (rel, text) => writeFile(path.join(dir, rel), text);
    await write('package.json', JSON.stringify({ version }));
    await write('CHANGELOG.md', `# سجل\n\n## ${version} — ${DAY}\n`);
    await write(SOURCE, ar);
    await write(SOURCE_EN, withEffectiveDate(undated(read(SOURCE_EN)), DAY));
    await write(TARGET, generate({ source: ar, version }).text);
    await write('README.md', `**${version}** في المستودع ولم يُرفع بعد.\n`);
    // ملف غير متتبع فيه العنصر النائب: لا يُفحص. ورابط رمزي متتبع إلى مجلد: لا يُتبع.
    await write('notes.md', 'صدر في ⟨تاريخ النشر⟩\n');
    await symlink('docs', path.join(dir, 'linked'));
    const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    git('add', 'package.json', 'CHANGELOG.md', SOURCE, SOURCE_EN, TARGET, 'README.md', 'scripts', 'linked');
    const run = () => spawnSync(process.execPath, [path.join(dir, 'scripts/release/gate.mjs')], { cwd: dir, encoding: 'utf8' });
    const failing = run();
    assert.equal(failing.status, 1, failing.stdout + failing.stderr);
    assert.match(failing.stdout, /✗ README\.md:1: تنبيه «لم يُنشر» للإصدار 9\.9\.9/);
    assert.doesNotMatch(failing.stdout, /notes\.md|linked/);
    assert.match(failing.stdout, /docs\/release-day\.md/);
    await write('README.md', `الإصدار الحالي **${version}** (${DAY}).\n`);
    const passing = run();
    assert.equal(passing.status, 0, passing.stdout + passing.stderr);
    assert.match(passing.stdout, /✓ بوابة النشر: الإصدار 9\.9\.9/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('التشغيل: release:gate أمر مستقل لا تشغّله check ولا check:all ولا package، وCI يشغّله على main وطلبات الدمج إليه وحدها', () => {
  const { scripts } = JSON.parse(read('package.json'));
  assert.equal(scripts['release:gate'], 'node scripts/release/gate.mjs');
  for (const name of ['check', 'check:quick', 'check:all', 'package']) assert.doesNotMatch(scripts[name], /gate\.mjs|release:gate/, name);
  const ci = read('.github/workflows/ci.yml');
  const runs = ci.match(/^\s+run: .*(?:release:gate|gate\.mjs).*$/gm) ?? [];
  assert.equal(runs.length, 1, 'خطوة واحدة تشغّل البوابة');
  const step = ci.split(/\n(?=      - name: )/).find((s) => s.includes(runs[0].trim()));
  assert.match(step, /^\s+if: github\.ref == 'refs\/heads\/main' \|\| github\.base_ref == 'main'$/m, 'بشرط main');
});
