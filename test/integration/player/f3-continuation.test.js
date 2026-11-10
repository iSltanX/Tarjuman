// ف3 (2026-11-10) في المشغّل فوق المتحكم والتخزين والاستيراد الحقيقيين: الجزء الأول ثم الثاني يُقترح فيه «إكمال 1» مختارًا،
// و«حفظ» يُكمل الترجمة نفسها (8 مقاطع مطابقة للأصل) بنسخة حالية وملاحظة، والأصل المرفوع باقٍ. وترجمة كاملة ثانية: الافتراضي
// «جديدة» كما كان. وتغيّر الخانة بين القراءة والحفظ يرفض الإكمال بلا كتابة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { trackComparison } from '../../../src/core/compare/index.js';
import { readImport, reviewIncoming } from '../../../src/core/import/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { mountControls } from '../../../src/player/controls/index.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, englishTrack, fakeExtractor, fingerprint, makeCues } from '../../helpers/fixtures.js';
import { addPlayer, createFakeEnv } from '../../unit/player/overlay/fake-dom.js';
import { prepareVideo } from '../../unit/player/overlay/harness.js';
import { addBar, chooseFiles, click, inspect } from '../../unit/player/controls/harness.js';

const A = 'AAAAAAAAAAA';
const EN = makeCues(8, { text: (i) => `line ${i}` });
const AR = makeCues(8, { text: (i) => `سطر ${i}` });
const clock = (start = Date.parse(NOW)) => {
  let t = start;
  return () => (t += 1000);
};
const settle = async (area) => {
  for (let i = 0; i < 5; i++) {
    await area.flush();
    await new Promise((r) => setTimeout(r, 0));
  }
};
const srtFile = (cues, name) => new File([writeSrt(cues)], name, { type: 'application/x-subrip' });
const ts = (ms) => new Date(ms).toISOString().slice(11, 23).replace('.', ',');
/** ملف بأرقام مقاطعه كما هي (writeSrt يرقّم من 1)، كما يعيده النموذج: الجزء الثاني يبدأ بالمقطع 5. */
const numbered = (cues, name) => new File([cues.map((c) => `${c.n}\n${ts(c.startMs)} --> ${ts(c.endMs)}\n${c.text}\n`).join('\n')], name, { type: 'application/x-subrip' });

async function openPage(area) {
  const env = createFakeEnv({ href: `https://www.youtube.com/watch?v=${A}` });
  env.win.URL = URL;
  env.win.Blob = Blob;
  const parts = addPlayer(env, { width: 854, height: 480 });
  prepareVideo(parts.video);
  addBar(env, parts, { width: 854 });
  const store = createStore({ area, now: clock() });
  const extractor = fakeExtractor({ videoId: A, tracks: [{ key: 'en|manual', kind: 'manual', cues: EN }] });
  const controller = createController({ store, extractor, page: { title: () => 'محاضرة', durationMs: () => 30000 }, now: clock() });
  store.onChange((ch) => controller.handleStoreChange(ch));
  const importFlow = { readImport, reviewIncoming, knownVideos: async () => [] };
  mountControls(controller, { doc: env.doc, win: env.win, importFlow, now: () => Date.parse(NOW) });
  await controller.start(A);
  // تنزيل الأصل: البصمة التي تُقارن بها الترجمة وتُكمل.
  await controller.recordExport({ trackKey: 'en|manual', fingerprint: fingerprint({ videoId: A, track: englishTrack({ cues: EN }), id: 'fp_part000001' }) });
  await settle(area);
  return { env, ...parts, store, controller, ui: inspect(env, parts) };
}

async function pick(page, area, file) {
  if (page.controller.getState().arabic) {
    if (!page.ui.menuOpen()) click(page.ui.btn('upload'));
    click(page.ui.item('رفع ترجمة…') ?? page.ui.item('استبدال…'));
  } else {
    click(page.ui.btn('upload'));
  }
  chooseFiles(page.ui, [file]);
  await settle(area);
}
const checked = (page) => page.ui.menu().querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('data-fid') ?? null;

test('الجزء الأول ثم الثاني: «إكمال 1» مختار بسطره، و«حفظ» يُكمل الترجمة نفسها مطابقة للأصل بملاحظة', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  await pick(page, area, srtFile(AR.slice(0, 4), 'part1.ar.srt'));
  assert.equal(page.controller.getState().arabic.cues.length, 4, 'أول رفع مباشرة');
  await pick(page, area, numbered(AR.slice(4), 'part2.ar.srt'));
  assert.equal(checked(page), 'target:complete', 'الإكمال مختار');
  assert.match(page.ui.menu().querySelector('[data-fid="completeLine"]').textContent, /تتمة للترجمة 1: يضيف 4 مقاطع في مواضعها\. وتكتمل بعده\./);
  assert.ok(page.ui.menu().querySelector('[data-fid="target:2"]'), '«جديدة» باقية');
  assert.equal(page.ui.menu().querySelector('[data-fid="uploadLang"]'), null, 'لا لغة ملف للإكمال');
  click(page.ui.item('حفظ'));
  await settle(area);
  const b = await page.store.getBundle(A);
  assert.equal(b.slots[1].track, null, 'لا ترجمة ثانية');
  const t1 = b.slots[0].track;
  assert.equal(t1.original.length, 4, 'الأصل المرفوع باقٍ');
  assert.deepEqual(t1.current.map((c) => c.text), AR.map((c) => c.text), 'النسخة الحالية 8 مقاطع');
  assert.equal(trackComparison(t1, b.record.fingerprints).matched, true, 'مطابق للأصل');
  assert.match(t1.notes.at(-1), /أُكملت بالملف «part2\.ar\.srt»: 4 مقاطع/);
});

test('ترجمة كاملة ثانية للفيديو نفسه: الافتراضي «جديدة» ولا خيار إكمال', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  await pick(page, area, srtFile(AR.slice(0, 5), 'part1.ar.srt'));
  await pick(page, area, srtFile(AR, 'full.ar.srt'));
  assert.equal(page.ui.menu().querySelector('[data-fid="target:complete"]'), null);
  assert.equal(checked(page), 'target:2');
});

test('تغيّرت الخانة بين القراءة والحفظ: يُرفض الإكمال بلا كتابة، والتأكيد مفتوح بسببه', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  await pick(page, area, srtFile(AR.slice(0, 4), 'part1.ar.srt'));
  await pick(page, area, numbered(AR.slice(4), 'part2.ar.srt'));
  assert.equal(checked(page), 'target:complete');
  // تبويب آخر يحرّر الخانة قبل «حفظ».
  await page.store.updateBundle(A, (b) => {
    const t = b.slots[0].track;
    t.current = t.original.map((c) => ({ ...c, text: `${c.text} معدّل` }));
    t.editedAt = NOW;
    if (b.active === 1) b.record.arabic = structuredClone(t);
    return b;
  });
  await settle(area);
  const before = JSON.stringify(area.dump());
  click(page.ui.item('حفظ'));
  await settle(area);
  assert.equal(JSON.stringify(area.dump()), before, 'لم يُكتب شيء');
  assert.match(page.ui.menu()?.textContent ?? '', /تغيّر هذا السجل|أعد فتحه/);
});
