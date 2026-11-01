// نافذة الأيقونة (P7-AC1): الحالات الأربع للبطاقة، وشرط المحرّر ببيان سببه، واستعلام الحالة من التبويب النشط
// (لا رد أو رد غير صالح أو مهلة = «افتح فيديو على يوتيوب»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeStatus, editorGate, queryVideoState } from '../../../../src/pages/popup/status.js';
import { videoStateRequest } from '../../../../src/core/model/messages.js';

const reply = (over = {}) => ({
  v: 1, ok: true, watch: true, videoId: 'iG9CE55wbtY', title: 'عنوان تجريبي', loading: false,
  english: { captured: [], saved: [] }, arabic: null, view: { displayOffsetMs: 0, displayMode: 'ar' },
  mounted: { overlay: 'mounted', controls: 'mounted' }, ...over,
});
const withArabic = (over = {}) => reply({ arabic: { fileName: 'x.ar.srt', cueCount: 412, edited: false, matched: true }, view: { displayOffsetMs: 500, displayMode: 'ar' }, ...over });

test('ليست صفحة فيديو: لا رد أو watch=false', () => {
  assert.deepEqual(describeStatus(null), { kind: 'not-video' });
  assert.deepEqual(describeStatus(reply({ watch: false, videoId: null, title: null })), { kind: 'not-video' });
});

test('جارٍ: الهيكل مع العنوان', () => {
  assert.deepEqual(describeStatus(reply({ loading: true })), { kind: 'loading', title: 'عنوان تجريبي' });
});

test('فيديو بلا ترجمة محفوظة: ملتقط ✓ أو محفوظ ✓ أو غير ملتقط', () => {
  assert.deepEqual(describeStatus(reply()), { kind: 'no-subtitle', title: 'عنوان تجريبي', englishLine: 'المسار الإنجليزي: غير ملتقط' });
  const captured = reply({ english: { captured: [{ key: 'en|manual', kind: 'manual', cueCount: 5, ok: true }], saved: [] } });
  assert.equal(describeStatus(captured).englishLine, 'المسار الإنجليزي: ملتقط ✓');
  const failed = reply({ english: { captured: [{ key: 'en|asr', kind: 'asr', cueCount: 0, ok: false }], saved: [] } });
  assert.equal(describeStatus(failed).englishLine, 'المسار الإنجليزي: غير ملتقط', 'مسار فاشل ليس ملتقطًا');
  const saved = reply({ english: { captured: [], saved: [{ key: 'en|manual', kind: 'manual', cueCount: 5 }] } });
  assert.equal(describeStatus(saved).englishLine, 'المسار الإنجليزي: محفوظ ✓');
});

test('العنوان الغائب يعود إلى المعرّف', () => {
  assert.equal(describeStatus(reply({ title: null })).title, 'iG9CE55wbtY');
});

test('فيديو بترجمة: «ترجمة عربية · 412 مقطعًا · الإزاحة +0.5 ث» وشارة معدّلة', () => {
  assert.deepEqual(describeStatus(withArabic()), {
    kind: 'has-subtitle', title: 'عنوان تجريبي', line: 'ترجمة عربية · 412 مقطعًا · الإزاحة +0.5 ث', edited: false,
  });
  const edited = describeStatus(withArabic({ arabic: { fileName: 'x', cueCount: 1, edited: true, matched: null }, view: { displayOffsetMs: -1000, displayMode: 'dual' } }));
  assert.equal(edited.line, 'ترجمة عربية · مقطع واحد · الإزاحة −1.0 ث');
  assert.equal(edited.edited, true);
});

test('المحرّر: مفعّل للفيديو الحالي بترجمة، وإلا معطّل بسبب ظاهر', () => {
  assert.deepEqual(editorGate(withArabic()), { enabled: true, videoId: 'iG9CE55wbtY', reason: null });
  assert.deepEqual(editorGate(reply()), { enabled: false, videoId: null, reason: 'لا ترجمة لهذا الفيديو بعد' });
  assert.equal(editorGate(null).reason, 'افتح فيديو على يوتيوب أولًا');
  assert.equal(editorGate(reply({ watch: false, videoId: null })).enabled, false);
  assert.equal(editorGate(withArabic({ loading: true })).enabled, false, 'لا فتح قبل اكتمال قراءة السجل');
  assert.equal(editorGate(withArabic({ videoId: null })).enabled, false);
});

const fakeTabs = ({ tabs = [{ id: 7 }], answer, onSend } = {}) => ({
  query: async (q) => {
    assert.deepEqual(q, { active: true, lastFocusedWindow: true });
    return tabs;
  },
  sendMessage: async (id, msg) => {
    onSend?.(id, msg);
    if (answer instanceof Error) throw answer;
    return answer;
  },
});

test('الاستعلام: يرسل طلب الحالة إلى التبويب النشط ويقبل الرد الصالح', async () => {
  const sent = [];
  const r = reply();
  assert.deepEqual(await queryVideoState({ tabs: fakeTabs({ answer: r, onSend: (id, m) => sent.push([id, m]) }) }), r);
  assert.deepEqual(sent, [[7, videoStateRequest()]]);
});

test('الاستعلام: لا تبويب أو لا مستقبل أو رد غير صالح = null', async () => {
  assert.equal(await queryVideoState({ tabs: fakeTabs({ tabs: [] }) }), null);
  assert.equal(await queryVideoState({ tabs: fakeTabs({ tabs: [{}] }) }), null);
  assert.equal(await queryVideoState({ tabs: fakeTabs({ answer: new Error('Receiving end does not exist.') }) }), null);
  assert.equal(await queryVideoState({ tabs: fakeTabs({ answer: undefined }) }), null);
  assert.equal(await queryVideoState({ tabs: fakeTabs({ answer: { v: 2, ok: true } }) }), null, 'نسخة غير معروفة');
  assert.equal(await queryVideoState({ tabs: fakeTabs({ answer: 'x' }) }), null);
});

test('الاستعلام: لا رد في المهلة = null (لا هيكل أبديًا)', async () => {
  const hang = { query: async () => [{ id: 1 }], sendMessage: () => new Promise(() => {}) };
  const t0 = Date.now();
  assert.equal(await queryVideoState({ tabs: hang, timeoutMs: 30 }), null);
  assert.ok(Date.now() - t0 < 1000);
});
