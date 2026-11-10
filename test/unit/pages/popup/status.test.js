// نافذة الأيقونة (P7-AC1، وجولة الصقل): الحالات الأربع للبطاقة ومؤشر «محفوظ»، والإجراءات السريعة بلا تنقّل مكرر، ووجهة
// مدخل المحفوظات الواحد، وشرط المحرّر ببيان سببه، واستعلام الحالة من التبويب النشط (لا رد أو رد غير صالح أو مهلة = «افتح
// فيديو على يوتيوب»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeStatus, editorGate, libraryHash, queryPopupState, quickActions } from '../../../../src/pages/popup/status.js';

const queryVideoState = async (env) => (await queryPopupState(env)).reply;
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

test('فيديو بلا ترجمة محفوظة: مسار الأصل بلغته الفعلية ملتقطًا أو محفوظًا، أو لم يُلتقط', () => {
  assert.deepEqual(describeStatus(reply()), { kind: 'no-subtitle', title: 'عنوان تجريبي', englishLine: 'لم تُلتقط ترجمة الفيديو بعد', englishKind: null, englishReady: false, saved: false });
  const captured = reply({ english: { captured: [{ key: 'en|manual', kind: 'manual', cueCount: 5, ok: true }], saved: [] } });
  assert.equal(describeStatus(captured).englishLine, 'الإنجليزية ملتقطة · يدوية · 5 مقاطع');
  assert.equal(describeStatus(captured).englishKind, 'يدوية', 'نوع المسار الملتقط');
  const auto = reply({ english: { captured: [{ key: 'ja|asr', kind: 'asr', cueCount: 212, ok: true }], saved: [] } });
  assert.equal(describeStatus(auto).englishLine, 'اليابانية ملتقطة · تلقائية · 212 مقطعًا', 'بأي لغة (AA3)');
  const machine = reply({ english: { captured: [{ key: 'ar|asr|en', kind: 'asr', cueCount: 9, ok: true }], saved: [] } });
  assert.equal(describeStatus(machine).englishLine, 'العربية (ترجمة يوتيوب الآلية) ملتقطة · تلقائية · 9 مقاطع', 'موسومة (ق٢)');
  const failed = reply({ english: { captured: [{ key: 'en|asr', kind: 'asr', cueCount: 0, ok: false }], saved: [] } });
  assert.equal(describeStatus(failed).englishLine, 'لم تُلتقط ترجمة الفيديو بعد', 'مسار فاشل ليس ملتقطًا');
  const saved = reply({ english: { captured: [], saved: [{ key: 'en|manual', kind: 'manual', cueCount: 5 }] } });
  assert.equal(describeStatus(saved).englishLine, 'الإنجليزية محفوظة · يدوية · 5 مقاطع');
  assert.equal(describeStatus(saved).saved, true, 'مؤشر «محفوظ» لسجل بلا ترجمة');
  assert.equal(describeStatus(captured).saved, false, 'الملتقط وحده ليس محفوظًا');
  // مسار «من» في الرد يتقدّم (آخر ما نُزّل، ق٥).
  const two = reply({ english: { captured: [{ key: 'en|manual', kind: 'manual', cueCount: 5, ok: true }, { key: 'ja|asr', kind: 'asr', cueCount: 7, ok: true }], saved: [] }, source: { key: 'ja|asr', lang: 'ja', kind: 'asr', via: null, from: 'export' } });
  assert.ok(describeStatus(two).englishLine.startsWith('اليابانية ملتقطة'));
});

test('العنوان الغائب يعود إلى المعرّف', () => {
  assert.equal(describeStatus(reply({ title: null })).title, 'iG9CE55wbtY');
});

test('فيديو بترجمة: «ترجمة ‹لغتها› · 412 مقطعًا · الإزاحة +0.5 ث»، وغير المحددة بلا لغة، والوضع بلغة الأصل', () => {
  assert.deepEqual(describeStatus(withArabic({ arabic: { fileName: 'x.ar.srt', cueCount: 412, edited: false, matched: true, lang: 'ar' } })), {
    kind: 'has-subtitle', title: 'عنوان تجريبي', line: 'ترجمة بالعربية · 412 مقطعًا · الإزاحة \u2066+0.5\u2069 ث', edited: false, matched: true, mode: 'الترجمة وحدها', fileName: 'x.ar.srt', saved: true,
  });
  const edited = describeStatus(withArabic({ arabic: { fileName: 'x', cueCount: 1, edited: true, matched: null }, view: { displayOffsetMs: -1000, displayMode: 'dual' }, english: { captured: [], saved: [{ key: 'en|manual', kind: 'manual', cueCount: 1 }] } }));
  assert.equal(edited.line, 'ترجمة بلغة غير محددة · مقطع واحد · الإزاحة \u2066−1.0\u2069 ث', 'ترجمة حُفظت قبل 2.0.0');
  assert.equal(edited.mode, 'الترجمة فوق الإنجليزية');
  assert.equal(edited.edited, true);
  assert.equal(describeStatus(withArabic({ view: { displayOffsetMs: 0, displayMode: 'dual' } })).mode, 'الترجمة فوق الأصل', 'بلا مسار أصل معروف');
});

test('الإجراءات السريعة: «تحرير الترجمة» وحده للفيديو بترجمة (والنسخ كتلة «تعليمات الترجمة»)، ولا شيء بلا ترجمة ولا وجهة تنقّل', () => {
  assert.deepEqual(quickActions(withArabic()).map((a) => [a.id, a.label]), [['editor', 'تحرير الترجمة']]);
  assert.deepEqual(quickActions(reply()), []);
  const saved = reply({ english: { captured: [], saved: [{ key: 'en|manual', kind: 'manual', cueCount: 5 }] } });
  assert.deepEqual(quickActions(saved), []);
  assert.deepEqual(quickActions(withArabic({ loading: true })).map((a) => [a.id, a.disabledReason]), [['editor', 'جارٍ قراءة ترجمة الفيديو…']]);
  assert.deepEqual(quickActions(null), []);
  for (const r of [withArabic(), reply(), saved]) assert.equal(quickActions(r).some((a) => a.id !== 'editor' || /المحفوظات/.test(a.label)), false);
});

test('مدخل المحفوظات الواحد: يفتح على صف الفيديو المحفوظ (#v=) دون تصفية، وإلا المحفوظات كلها', () => {
  assert.equal(libraryHash(withArabic()), 'v=iG9CE55wbtY');
  assert.equal(libraryHash(reply({ english: { captured: [], saved: [{ key: 'en|manual', kind: 'manual', cueCount: 5 }] } })), 'v=iG9CE55wbtY');
  assert.equal(libraryHash(reply()), undefined, 'غير محفوظ: المحفوظات كلها');
  assert.equal(libraryHash(null), undefined);
  assert.equal(libraryHash(withArabic({ loading: true })), undefined);
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
