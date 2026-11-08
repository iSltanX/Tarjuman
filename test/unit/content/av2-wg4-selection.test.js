// تدقيق V2، WG-4: U-033 وU-035. سياسة اختيار المسار الافتراضي واحدة (src/core/model/track-order.js): الأصلي قبل المترجم آليًا،
// واليدوي قبل التلقائي، ثم الأحدث التقاطًا (عقد extraction.md). تُمتحن عبر مسارات المنتج: المتحكم بالمستخرج الحقيقي، ورد النافذة،
// وقائمة التحميل في المشغّل، والزوج المحفوظ؛ لا الدالة وحدها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createController } from '../../../src/content/controller.js';
import { createStore } from '../../../src/core/store/index.js';
import { buildVideoStateReply } from '../../../src/core/model/messages.js';
import { sourceOf } from '../../../src/core/model/pair.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { englishTrack, videoRecord } from '../../helpers/fixtures.js';
import { captureMsg, makeExtractor, sample } from '../extract/helpers.js';
import { click, makeState, mountPage } from '../player/controls/harness.js';

const VID = 'AAAAAAAAAAA';
const BODY = sample('manual').body;

async function setup() {
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: null });
  const c = createController({ store: createStore({ area: createMemoryArea({ unlimited: true }) }), extractor, page: { title: () => 'عنوان', durationMs: () => null } });
  await c.start(VID);
  const capture = (t, over) => { state.t = t; return extractor.handleMessage(captureMsg({ videoId: VID, body: BODY }, over)); };
  return { c, capture };
}

/** المختار في قائمة التحميل بالمشغّل: مفتاح الراديو المحدد، وإلا (مسار واحد) لغة الصف. */
function menuDefault(c) {
  const page = mountPage({ state: makeState({ captured: c.getState().captured }) });
  click(page.ui.btn('download'));
  const radios = page.ui.menu().querySelectorAll('button.item[role="radio"]');
  return radios.find((r) => r.getAttribute('aria-checked') === 'true')?.getAttribute('data-fid')?.replace('track:', '') ?? null;
}

test('AV2 U-033: الإنجليزية ثم الإسبانية ثم الإنجليزية: المتحكم وردّ النافذة وقائمة التحميل تتبع الأحدث', async () => {
  const { c, capture } = await setup();
  capture(1000, {});
  assert.equal(c.getState().english.key, 'en|manual');
  capture(2000, { lang: 'es' });
  const reply = buildVideoStateReply(c.getState(), { overlay: 'mounted', controls: 'mounted' });
  assert.equal(c.getState().english.key, 'es|manual');
  assert.equal(reply.source.key, 'es|manual');
  assert.equal(menuDefault(c), 'es|manual');
  capture(3000, {});
  assert.equal(c.getState().english.key, 'en|manual', 'العودة إلى الإنجليزية (التقاط أحدث للمفتاح نفسه)');
  assert.equal(buildVideoStateReply(c.getState(), { overlay: 'mounted', controls: 'mounted' }).source.key, 'en|manual');
  assert.equal(menuDefault(c), 'en|manual');
});

test('AV2 U-033: الأصلي يتقدّم على المترجم آليًا ولو كان أقدم (ضابط السياسة الموحدة)', async () => {
  const { c, capture } = await setup();
  capture(1000, {});
  capture(2000, { lang: 'ar', hasTlang: true, tlang: 'ar' });
  assert.equal(c.getState().english.key, 'en|manual');
  assert.equal(menuDefault(c), 'en|manual');
});

test('AV2 U-033: المسار المحفوظ في المتحكم وsourceOf يتبعان الأحدث التقاطًا لا الأقدم إدراجًا', async () => {
  const en = englishTrack({ lang: 'en', capturedAt: '2026-11-02T11:00:00.000Z' });
  const es = englishTrack({ lang: 'es', capturedAt: '2026-11-02T11:30:00.000Z' });
  const rec = videoRecord({ arabic: false });
  rec.english = [en, es];
  rec.fingerprints = [];
  assert.equal(sourceOf(rec).lang, 'es');
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  await store.updateVideo(rec.videoId, () => rec);
  const c = createController({ store });
  await c.start(rec.videoId);
  assert.equal(c.getState().english.key, 'es|manual');
  // التعادل التام بالزمن: ترتيب التخزين.
  rec.english = [{ ...en, capturedAt: es.capturedAt }, es];
  assert.equal(sourceOf(rec).lang, 'en');
});

test('AV2 U-035: سياسة الترتيب مكتوبة في موضع واحد (لا جدول نوع ولا ترتيب via في غيره)', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../src');
  const files = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) files.push(p);
    }
  })(ROOT);
  const policy = files.filter((f) => /KIND_ORDER|KIND_RANK|Boolean\([\w.]+\.via\)\)\s*-/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(policy.map((f) => path.relative(ROOT, f)), ['core/model/track-order.js']);
});
