// تكامل قائمة التحميل (P12-AC4 وP12-AC8): المتحكم والتخزين الحقيقيان ووحدتا التصدير الحقيقيتان. القاموس من التفضيلات
// المخزنة يُرفق بالتعليمات المنسوخة بالنص نفسه الذي تعطيه instructions لأي سطح آخر (المحفوظات ونافذة الأيقونة)؛ والتقسيم
// الاحتياطي عند الجمل أو الصمت بأحجام أجزائه الفعلية قبل التنزيل، وضمّها يطابق الملف الكامل؛ والنسخ يسبق كل حفظ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { buildExport, instructions } from '../../../src/core/export/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { mountControls } from '../../../src/player/controls/index.js';
import { charsText } from '../../../src/player/controls/text.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, fakeExtractor, makeCues } from '../../helpers/fixtures.js';
import { addPlayer, createFakeEnv } from '../../unit/player/overlay/fake-dom.js';
import { prepareVideo } from '../../unit/player/overlay/harness.js';
import { addBar, click, inspect } from '../../unit/player/controls/harness.js';

const A = 'AAAAAAAAAAA';
// 420 جملة؛ كل خامسة تنتهي بنقطة وبعدها صمت ثانيتين، فتقع حدود الأجزاء عندها.
const EN = makeCues(420, { text: (i) => (i % 5 === 0 ? `sentence end ${i}.` : `words ${i}`) }).map((c, i, all) => {
  const shift = Math.floor(i / 5) * 2000;
  return { ...c, startMs: c.startMs + shift, endMs: c.endMs + shift, n: all[i].n };
});
const TERMS = [{ source: 'prompt', target: 'موجِّه', note: null }, { source: 'token', target: 'رمز', note: 'وحدة نص' }];

const settle = async (area) => {
  for (let i = 0; i < 5; i++) {
    await area.flush();
    await new Promise((r) => setTimeout(r, 0));
  }
};

async function openPage(area) {
  const env = createFakeEnv({ href: `https://www.youtube.com/watch?v=${A}` });
  const parts = addPlayer(env, { width: 854, height: 480 });
  prepareVideo(parts.video);
  addBar(env, parts, { width: 854 });
  const events = [];
  env.win.navigator = { clipboard: { writeText: async (t) => events.push(['copy', t]) } };
  const store = createStore({ area });
  const extractor = fakeExtractor({ videoId: A, tracks: [{ key: 'en|manual', kind: 'manual', cues: EN }] });
  const controller = createController({ store, extractor, page: { title: () => 'محاضرة تجريبية', durationMs: () => 2000000 } });
  store.onChange((ch) => controller.handleStoreChange(ch));
  const exportFlow = {
    buildExport, instructions,
    saveFile: async (file) => {
      events.push(['save', file.name, file.text]);
      return { ok: true, mode: 'downloads', downloadId: events.length };
    },
  };
  mountControls(controller, { doc: env.doc, win: env.win, exportFlow, now: () => Date.parse(NOW) });
  await controller.start(A);
  await settle(area);
  return { env, store, controller, events, ui: inspect(env, parts) };
}

test('القاموس المرفق من التفضيلات المخزنة: التعليمات المنسوخة هي instructions بالقاموس حرفيًا، وإشارته بعدده', async () => {
  const area = createMemoryArea();
  await createStore({ area }).setPrefs({ glossary: { attach: true, terms: TERMS } });
  const page = await openPage(area);
  click(page.ui.btn('download'));
  assert.equal(page.ui.menu().querySelector('.tag').textContent, '+ القاموس (2)');
  click(page.ui.field('copy'));
  await settle(area);
  const expected = instructions({ videoId: A, title: 'محاضرة تجريبية', glossary: TERMS });
  assert.deepEqual(page.events, [['copy', expected]], 'النص نفسه الذي تنسخه المحفوظات ونافذة الأيقونة');
  assert.match(expected, /موجِّه/);

  await page.store.setPrefs({ glossary: { attach: false, terms: TERMS } });
  await settle(area);
  assert.equal(page.ui.menu().querySelector('.tag'), null, 'إيقاف الإرفاق من الإعدادات يصل إلى المشغّل');
});

test('التقسيم عند الجمل أو الصمت: أحجام الأجزاء الفعلية قبل التنزيل، والنسخ قبل كل حفظ، وضمّ الأجزاء يطابق الكامل', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  click(page.ui.btn('download'));
  click(page.ui.item('خيارات احتياطية'));
  const check = page.ui.field('split');
  check.checked = true;
  check.dispatchEvent({ type: 'change', target: check });
  const rows = page.ui.menu().querySelectorAll('.row.part').map((r) => r.textContent);
  assert.equal(rows.length, 3, '420 مقطعًا بحد 200: ثلاثة أجزاء');
  const ranges = rows.map((r) => r.split(' · ')[1].split('–').map(Number));
  assert.equal(ranges[0][0], 1);
  assert.equal(ranges.at(-1)[1], 420);
  for (const [, to] of ranges.slice(0, -1)) assert.equal(to % 5, 0, `الحد ${to} عند نهاية جملة وصمت`);
  click(page.ui.item('تنزيل ونسخ التعليمات'));
  await settle(area);
  assert.deepEqual(page.events.map((e) => e[0]), ['copy', 'save', 'save', 'save'], 'النسخ أولًا ثم الأجزاء');
  const saved = page.events.filter((e) => e[0] === 'save');
  rows.forEach((r, i) => assert.ok(r.endsWith(` · ${charsText(saved[i][2].length)}`), `حجم الجزء ${i + 1} هو حجم ملفه`));
  const full = buildExport({ videoId: A, track: { key: 'en|manual', lang: 'en', kind: 'manual', cues: EN }, mode: 'normal', now: Date.parse(NOW) }).files[0].text;
  assert.equal(saved.map((e) => e[2]).join('\n'), full, 'ضمّ الأجزاء يطابق الملف الكامل');
  assert.match(page.events[0][1], /الجزء 1 \(المقاطع 1–/, 'فقرة الأجزاء في التعليمات');
  const rec = (await page.store.getBundle(A)).record;
  assert.equal(rec.fingerprints.length, 1);
  assert.equal(rec.fingerprints[0].parts.length, 3);
});
