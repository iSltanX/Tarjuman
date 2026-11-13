// تكامل قائمة التحميل (P12-AC4 وP12-AC8، وAA3): المتحكم والتخزين الحقيقيان ووحدتا التصدير الحقيقيتان. التقسيم الاحتياطي عند الجمل
// أو الصمت بأحجام أجزائه الفعلية قبل التنزيل، وضمّها يطابق الملف الكامل؛ والتنزيل لا ينسخ. ونسخ التعليمات انتقل إلى نافذة الإضافة
// (AA3): رد حالة الفيديو من المتحكم الحقيقي يحمل أجزاء آخر تنزيل، فتُبنى منه تعليمات النافذة بفقرة الأجزاء والقاموس المخزّن.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { buildExport, instructions } from '../../../src/core/export/index.js';
import { buildVideoStateReply } from '../../../src/core/model/messages.js';
import { createStore } from '../../../src/core/store/index.js';
import { attachedGlossary, copyArgs } from '../../../src/pages/popup/status.js';
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

test('لا نسخ في المشغّل (AA3): القائمة بلا زر نسخ ولا إشارة قاموس، وتعليمات النافذة من الرد بالقاموس المخزّن حرفيًا', async () => {
  const area = createMemoryArea();
  await createStore({ area }).setPrefs({ glossary: { attach: true, terms: TERMS } });
  const page = await openPage(area);
  click(page.ui.btn('download'));
  assert.ok(page.ui.menu().querySelector('.tag') === null, 'لا إشارة قاموس في المشغّل');
  assert.ok(page.ui.field('copy') === null, 'لا زر نسخ');
  // سطر التعليمات بعد تنزيل ناجح وحده (ح-61).
  assert.ok(page.ui.field('instructionsNote') === null, 'لا سطر قبل التنزيل');
  const reply = buildVideoStateReply(page.controller.getState(), { overlay: 'mounted', controls: 'mounted' });
  assert.deepEqual(reply.source, { key: 'en|manual', lang: 'en', kind: 'manual', via: null, from: 'captured' }, '«من» من المسار الملتقط (ق٥)');
  const glossary = attachedGlossary(await page.store.getPrefs());
  const text = instructions(copyArgs({ reply, pair: { from: reply.source.lang, to: 'ar' }, glossary }));
  assert.equal(text, instructions({ videoId: A, title: 'محاضرة تجريبية', glossary: TERMS, source: 'en', target: 'ar' }), 'النص نفسه الذي تنسخه المحفوظات');
  assert.match(text, /موجِّه/);
  assert.deepEqual(page.events, [], 'لا حافظة ولا حفظ');
});

test('التقسيم عند الجمل أو الصمت: أحجام الأجزاء الفعلية قبل التنزيل، والتنزيل بلا نسخ، وضمّ الأجزاء يطابق الكامل، وفقرة الأجزاء في تعليمات النافذة', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  click(page.ui.btn('download'));
  // الملف أطول من حد الإعدادات، والقسم مطوي حتى يُفتح (ح-61).
  if (page.ui.item('تقسيم الملفات الطويلة').getAttribute('aria-expanded') !== 'true') click(page.ui.item('تقسيم الملفات الطويلة'));
  const check = page.ui.field('split');
  check.checked = true;
  check.dispatchEvent({ type: 'change', target: check });
  const rows = page.ui.menu().querySelectorAll('.row.part').map((r) => r.textContent);
  assert.equal(rows.length, 3, '420 مقطعًا بحد 200: ثلاثة أجزاء');
  const ranges = rows.map((r) => r.split(' · ')[1].replace('المقاطع ', '').split('–').map(Number));
  assert.equal(ranges[0][0], 1);
  assert.equal(ranges.at(-1)[1], 420);
  for (const [, to] of ranges.slice(0, -1)) assert.equal(to % 5, 0, `الحد ${to} عند نهاية جملة وصمت`);
  click(page.ui.item('تنزيل الملف'));
  await settle(area);
  assert.deepEqual(page.events.map((e) => e[0]), ['save', 'save', 'save'], 'التنزيل يحفظ الأجزاء ولا ينسخ');
  assert.equal(page.ui.field('instructionsNote').textContent, 'التالي: انسخ التعليمات من نافذة الإضافة.', 'الخطوة التالية بعد التنزيل (ح-61)');
  const saved = page.events.filter((e) => e[0] === 'save');
  rows.forEach((r, i) => assert.ok(r.endsWith(` · ${charsText(saved[i][2].length)}`), `حجم الجزء ${i + 1} هو حجم ملفه`));
  const full = buildExport({ videoId: A, track: { key: 'en|manual', lang: 'en', kind: 'manual', cues: EN }, mode: 'normal', now: Date.parse(NOW) }).files[0].text;
  assert.equal(saved.map((e) => e[2]).join('\n'), full, 'ضمّ الأجزاء يطابق الملف الكامل');
  const rec = (await page.store.getBundle(A)).record;
  assert.equal(rec.fingerprints.length, 1);
  assert.equal(rec.fingerprints[0].parts.length, 3);
  // نافذة الإضافة: آخر تنزيل مقسّم بلغة «من» نفسها، ففقرة الأجزاء في التعليمات المنسوخة (لا تُفقد وظيفة التقسيم الاحتياطي).
  const reply = buildVideoStateReply(page.controller.getState(), { overlay: 'mounted', controls: 'mounted' });
  assert.equal(reply.lastExport.parts.length, 3);
  assert.match(instructions(copyArgs({ reply, pair: { from: 'en', to: 'ar' }, glossary: null })), /الجزء 1 \(المقاطع 1–/, 'فقرة الأجزاء في تعليمات النافذة');
});
