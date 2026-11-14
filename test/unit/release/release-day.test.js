// قائمة يوم النشر (تحقق 2.3.0، ص-١١ وص-٢ ج): كانت الخطوات مبعثرة بين docs/site/README.md وdocs/site/privacy.md وstore/README.md
// وتقارير الجولات، ولا قائمة واحدة لها. صارت في docs/release-day.md بالترتيب: التاريخ، ثم البوابة، ثم الدفع وCI، ثم الدمج، ثم الموقع، ثم
// الرفع، ومعها حال الإصدار السابق في Edge Add-ons وAMO قبل الرفع، والرقم فيها متغيّر. والمواضع القديمة تحيل إليها بلا حذف.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inScope, placeholderProblems, unpublishedProblems } from '../../../scripts/release/gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const DOC = 'docs/release-day.md';
/** أقسام الوثيقة بعناوينها «## …». */
const sections = () => read(DOC).split(/\n(?=## )/).slice(1);
const section = (re) => sections().find((s) => re.test(s.split('\n')[0]));

test('القائمة في جدول الوثائق في CLAUDE.md وفهرس docs/README.md، وتحيل إليها المواضع التي حملت الخطوات', () => {
  assert.ok(existsSync(path.join(ROOT, DOC)), DOC);
  assert.match(read('CLAUDE.md'), /^\| \[`docs\/release-day\.md`\]\(docs\/release-day\.md\) \| .+ \|$/m);
  assert.match(read('docs/README.md'), /^\| \[`release-day\.md`\]\(release-day\.md\) \| .+ \|$/m);
  assert.match(read('docs/site/README.md'), /\[`docs\/release-day\.md`\]\(\.\.\/release-day\.md\)/);
  assert.match(read('docs/site/privacy.md'), /^> \*\*2\.3\.0 \(.+`docs\/release-day\.md`/m);
  assert.equal(read('store/README.md').match(/\]\(\.\.\/docs\/release-day\.md\)/g)?.length, 2, 'store/README.md §٥ و§٧');
});

test('الخطوات بالترتيب: التاريخ، ثم البوابة، ثم الدفع وCI، ثم الدمج، ثم الموقع، ثم الرفع، ثم ما بعد القبول', () => {
  const headings = sections().map((s) => s.split('\n')[0]);
  const order = [/^## ١\. .*تثبيت التاريخ/, /^## ٢\. البوابة/, /^## ٣\. دفع الفرع وانتظار CI/, /^## ٤\. الدمج/, /^## ٥\. نشر الموقع/, /^## ٦\. الرفع/, /^## ٧\. بعد قبول/];
  assert.equal(headings.length, order.length, headings.join('\n'));
  order.forEach((re, i) => assert.match(headings[i], re, `الخطوة ${i + 1}`));
});

test('أوامرها موجودة، والتثبيت بـ--effective، والبوابة قبل الدمج وقبل الرفع، وحال الإصدار السابق في Edge وAMO قبل الرفع', () => {
  const doc = read(DOC);
  const { scripts } = JSON.parse(read('package.json'));
  const npm = [...doc.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
  assert.ok(npm.includes('release:gate') && npm.includes('check:all') && npm.includes('package'));
  for (const name of npm) assert.ok(scripts[name], `npm run ${name}`);
  for (const m of doc.matchAll(/`((?:scripts|test|docs|store)\/[^`\s]+?\.(?:mjs|js|md|json|yml))`/g)) assert.ok(existsSync(path.join(ROOT, m[1])), m[1]);
  assert.match(section(/تثبيت التاريخ/), /^ {3}node scripts\/site\/privacy\.mjs --effective <التاريخ>$/m);
  assert.match(section(/البوابة/), /^npm run release:gate$/m);
  const upload = section(/الرفع/);
  const previous = upload.indexOf('حال `<السابق>` في Edge Add-ons وAMO');
  const gate = upload.indexOf('npm run release:gate');
  const zip = upload.indexOf('-chrome.zip');
  assert.ok(previous > -1 && gate > previous && zip > gate, 'حال السابق، ثم البوابة، ثم الرفع');
});

test('القائمة نفسها لا تحمل ما تمنعه البوابة، والرقم فيها متغيّر لا رقم الإصدار الحاضر', () => {
  const doc = read(DOC);
  const { version } = JSON.parse(read('package.json'));
  assert.equal(inScope(DOC), true);
  assert.deepEqual([...placeholderProblems(DOC, doc), ...unpublishedProblems(DOC, doc, version)], []);
  for (const v of ['<الإصدار>', '<السابق>', '<التاريخ>']) assert.ok(doc.includes(v), v);
  assert.equal(doc.includes(version), false, `لا ${version} حرفيًا`);
});
