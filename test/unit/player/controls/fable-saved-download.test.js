// تدقيق Fable (FA-17 = B2 في التقرير السابق، بقرار سلطان 2026-11-07 «بند لتنزيل المحفوظ»): العودة إلى فيديو له مسار إنجليزي
// محفوظ من تنزيل سابق، بلا التقاط في هذه الزيارة، كانت قائمة «تحميل الأصل» فيه تطلب تفعيل CC وحده ولا تعرض تنزيلًا، مع أن
// المحفوظات تصدّر المسار نفسه. صارت القائمة تعرض المسار المحفوظ و«تنزيل المحفوظ» (الوضع العادي، بلا تقسيم، كما في المحفوظات)
// (وتعليمات الترجمة من نافذة الإضافة منذ AA3)، وتبقى إرشادات CC بعدها لمن يريد التقاطًا جديدًا؛ والبصمة تُحفظ بلا تكرار.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../../src/content/controller.js';
import { createStore } from '../../../../src/core/store/index.js';
import { buildExport } from '../../../../src/core/export/index.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID, fakeExtractor } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { EN_CUES, click, makeState, mountPage, settle, trackInfo } from './harness.js';

const savedEnglish = { key: 'en|manual', lang: 'en', kind: 'manual', cues: EN_CUES, source: 'saved' };
const named = (name) => `نُزّل ${String.fromCodePoint(0x2066)}${name}${String.fromCodePoint(0x2069)}`;

test('FA-17: مسار محفوظ بلا التقاط: القائمة تعرضه بـ«محفوظ» و«تنزيل المحفوظ» وسطر التعليمات من النافذة، وإرشاد CC بعده', () => {
  const page = mountPage({ state: makeState({ english: savedEnglish }) });
  click(page.ui.btn('download'));
  const text = page.ui.menuText();
  assert.match(text, /الإنجليزية · يدوية · 5 مقاطع · محفوظ/);
  assert.match(text, /لم تُلتقط الترجمة في هذه الزيارة؛ يُنزَّل المسار المحفوظ من تنزيلك السابق\./);
  assert.ok(page.ui.item('تنزيل المحفوظ'), 'زر التنزيل');
  assert.ok(page.ui.item('نسخ التعليمات') === null, 'لا نسخ في المشغّل (AA3)');
  assert.match(text, /تعليمات الترجمة \(من ← إلى\) من نافذة الإضافة/);
  assert.match(text, /فعّل الترجمة \(CC\) واختر English، ثم افتح هذه القائمة\./, 'إرشاد CC باقٍ للالتقاط الجديد');
  assert.ok(text.indexOf('تنزيل المحفوظ') < text.indexOf('فعّل الترجمة'), 'المحفوظ أولًا');
  assert.equal(page.ui.btn('download').getAttribute('aria-description'), 'المسار المحفوظ جاهز');
});

test('FA-17: «تنزيل المحفوظ» يبني المسار المحفوظ بالوضع العادي بلا تقسيم ويحفظ الملف ثم البصمة بلا تكرار', async () => {
  const page = mountPage({ state: makeState({ english: savedEnglish }) });
  click(page.ui.btn('download'));
  click(page.ui.item('تنزيل المحفوظ'));
  await settle();
  const spec = page.flows.built.at(-1);
  assert.deepEqual([spec.mode, spec.split, spec.track.key, spec.track.cues.length], ['normal', null, 'en|manual', 5]);
  assert.deepEqual(page.flows.downloads.map((d) => d.name), [`${VIDEO_ID}.en.manual.normal.srt`]);
  const rec = page.controller.calls.find((c) => c[0] === 'recordSavedExport');
  assert.ok(rec, 'بصمة التنزيل');
  assert.equal(rec[1].trackKey, 'en|manual');
  assert.equal(page.controller.calls.some((c) => c[0] === 'convertCaptured' || c[0] === 'recordExport'), false, 'لا يُطلب التقاط');
  assert.ok(page.ui.menuText().includes(named(`${VIDEO_ID}.en.manual.normal.srt`)));
});

test('FA-17: مع التقاط حي تبقى القائمة المعتادة (الملتقط أولًا) بلا قسم المحفوظ', () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo()], english: { ...savedEnglish, source: 'captured' } }) });
  click(page.ui.btn('download'));
  assert.equal(page.ui.menuText().includes('محفوظ'), false);
  assert.ok(page.ui.item('تنزيل الملف'));
  assert.ok(page.ui.item('تنزيل المحفوظ') === null);
});

test('FA-17: recordSavedExport في المتحكم الحقيقي يحفظ بصمة جديدة مرة واحدة، ولا يكرر بصمة التصدير نفسه', async () => {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse(NOW);
  const now = () => (t += 1000);
  const seed = createStore({ area, now });
  const bundle = sampleBundle();
  // مسار محفوظ بلا بصمة لتصديره العادي (مثل نسخة احتياطية قديمة أو بصمة سقطت بالحد).
  bundle.record.fingerprints = bundle.record.fingerprints.filter((f) => f.trackKey !== bundle.record.english[0].key || f.mode !== 'normal' || f.parts !== null);
  await seedBundle(seed, bundle);
  await area.flush();
  const store = createStore({ area, now });
  const c = createController({ store, extractor: fakeExtractor(), page: { title: () => 'عنوان', durationMs: () => 90000 }, now });
  await c.start(VIDEO_ID);
  const s = c.getState();
  assert.equal(s.english.source, 'saved');
  const built = buildExport({ videoId: VIDEO_ID, title: s.title, track: { key: s.english.key, lang: s.english.lang, kind: s.english.kind, cues: s.english.cues }, mode: 'normal', split: null, now: now() });
  const before = (await store.getVideo(VIDEO_ID)).fingerprints.length;
  assert.deepEqual(await c.recordSavedExport({ trackKey: s.english.key, fingerprint: built.fingerprint }), { stored: true });
  assert.equal((await store.getVideo(VIDEO_ID)).fingerprints.length, before + 1);
  const again = buildExport({ videoId: VIDEO_ID, title: s.title, track: { key: s.english.key, lang: s.english.lang, kind: s.english.kind, cues: s.english.cues }, mode: 'normal', split: null, now: now() });
  assert.deepEqual(await c.recordSavedExport({ trackKey: s.english.key, fingerprint: again.fingerprint }), { stored: false }, 'التصدير نفسه لا يكرر بصمته');
  assert.equal((await store.getVideo(VIDEO_ID)).fingerprints.length, before + 1);
  await assert.rejects(c.recordSavedExport({ trackKey: 'en|asr', fingerprint: built.fingerprint }), (e) => e.code === 'EX_NO_TRACK');
});
