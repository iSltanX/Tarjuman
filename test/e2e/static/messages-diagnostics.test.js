// P9-AC3 (آلي): كل رسائل الأخطاء والإشعارات عربية سليمة البنية بلا رابط ولا رمز، والتشخيص بكل مصادره بعد مسار حقيقي
// (عيّنتا P1 والتصدير والاستيراد والمقارنة) ومدخلات عدائية (عناوين وتفاصيل فيها روابط وpot وملفات ارتباط) خالٍ من
// الروابط والرموز والنصوص.
//   node scripts/run-tests.mjs test/e2e/static
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOMAINS, TjError, messageFor, toErrorInfo } from '../../../src/core/errors/index.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import { createDiagnosticReport, formatDiagnosticReport } from '../../../src/core/diagnostics/report.js';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { collectDiagnostics } from '../../../src/pages/settings/diagnostics.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { videoRecord } from '../../helpers/fixtures.js';
import { arabic, click, makeState, mountPage } from '../../unit/player/controls/harness.js';

const ROOT = new URL('../../../', import.meta.url);
const POT = `pot=${'Mk'.repeat(40)}`;
const HOSTILE = `https://www.youtube.com/api/timedtext?v=iG9CE55wbtY&${POT}&signature=${'A1b2'.repeat(10)} SAPISID=abcdefghijkl`;
const clean = (text) => findSecrets(text).length === 0 && !/https?:\/\//.test(text) && !/timedtext/.test(text);

// الرسائل العربية الدالّة وعيّناتها (IM_STRAY_TEXT، ع-١٢ ب؛ وPG_LANG_ASSIGN_SKIPPED بالمثنى، تحقق مستقل §١٠): تُفحص بكل صيغة، ولا دالّة خارج هذه القائمة.
const AR_FUNCTION_SAMPLES = {
  IM_STRAY_TEXT: [{ line: 7 }, { line: 7, heading: true }],
  PG_LANG_ASSIGN_SKIPPED: [{ n: 'ترجمة واحدة', count: 1 }, { n: 'ترجمتان', count: 2 }, { n: '3 ترجمات', count: 3 }],
  // الفكرة ٤ (الإنذار المبكر): تسمّي الصيغة المرفوضة إن عُرفت، وبلا اسم كما كانت.
  EX_UNSUPPORTED_FORMAT: [{}, { format: 'srv3' }, { format: 'vtt' }],
  // الفكرة ١١ (ح-49): الملف الثنائي المستورد وإزالة سطر الأصل، والمعدود بعد حرف الجر بصيغه.
  IM_BILINGUAL: [{ count: 1, total: 1 }, { count: 2, total: 3 }, { count: 3, total: 5 }, { count: 11, total: 20 }, { count: 100, total: 150 }, { count: 3, total: 5, line: 'first' }],
  IM_NOTE_BILINGUAL_REMOVED: [{ count: 1 }, { count: 2 }, { count: 3 }, { count: 11 }, { count: 100 }, { count: 3, line: 'first' }],
};
/** كل الرموز من مجالات السجل نفسه (لا من قائمة يدوية)، ومنها مجالات الإصدار الثاني كالنسخ الاحتياطي (P15). والرسالة الدالّة
 * بكل عيّنة من AR_FUNCTION_SAMPLES، ومعها params التي مُلئت بها. */
async function catalog() {
  return DOMAINS.flatMap((d) => Object.entries(d.MESSAGES).flatMap(([code, msg]) => {
    if (typeof msg !== 'function') return [{ domain: d.name, code, text: msg, params: null }];
    assert.ok(Object.hasOwn(AR_FUNCTION_SAMPLES, code), `${code}: رسالة دالّة خارج القائمة`);
    return AR_FUNCTION_SAMPLES[code].map((params) => ({ domain: d.name, code, text: msg(params), params }));
  }));
}

// كلمات لاتينية مقصودة في الرسائل: أسماء يراها المستخدم كما هي في يوتيوب والملفات والترميز، والمتصفحات (TJ_SITE_ACCESS_OFF، B5-أ).
// وأسماء صيغ الترجمة كما في معامل fmt (srv3 وvtt) في EX_UNSUPPORTED_FORMAT (الفكرة ٤)، وWebVTT صيغة التصدير كما في حوار «تصدير…»
// (EX_TEXT_BREAKS_VTT وEX_TRACK_BREAKS_VTT، الفكرة ١١).
const LATIN_OK = new Set(['CC', 'English', 'SRT', 'UTF', 'Windows', 'HTML', 'Chrome', 'Edge', 'Brave', 'Firefox', 'srv', 'vtt', 'WebVTT']);

test('كل رمز رسالة عربية: الصيغة، وحرف عربي، ولا رابط ولا رمز، واللاتيني من القائمة المقصودة وحدها', async () => {
  const all = await catalog();
  // 137 رمزًا في الإصدار الأول (P9)؛ الحد الأدنى يكشف مجالًا أُفرغ خطأً دون أن يكسر إضافة رموز جديدة.
  assert.ok(all.length >= 130, `عدد الرموز ${all.length}`);
  assert.equal(new Set(all.map((x) => x.code)).size, all.filter((x) => !x.params || x.params === AR_FUNCTION_SAMPLES[x.code][0]).length, 'لا رمز مكرر بين المجالات');
  for (const { code, text, params } of all) {
    assert.match(code, /^[A-Z]+_[A-Z0-9_]+$/, code);
    assert.ok(text.trim().length > 0, `${code}: فارغة`);
    assert.match(text, /\p{Script=Arabic}/u, `${code}: بلا حرف عربي`);
    assert.ok(clean(text), `${code}: فيها رابط أو رمز`);
    const latin = (text.replace(/\{[a-z]+\}/gi, '').match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !LATIN_OK.has(w));
    assert.deepEqual(latin, [], `${code}: كلمات لاتينية غير مقصودة`);
    assert.equal(params ? messageFor(code, params) : messageFor(code), text, `${code}: messageFor يعيد الرسالة نفسها`);
  }
});

test('القوالب: كل {متغير} يُملأ بمعاملاته ولا يبقى قوس، والرمز المجهول يُعاد كما هو', async () => {
  const all = await catalog();
  for (const { code, text } of all) {
    const names = [...text.matchAll(/\{([a-z]+)\}/gi)].map((m) => m[1]);
    if (!names.length) continue;
    const filled = messageFor(code, Object.fromEntries(names.map((n) => [n, '7'])));
    assert.doesNotMatch(filled, /\{[a-z]+\}/i, `${code}: متغير لم يُملأ`);
  }
  assert.equal(messageFor('XX_UNKNOWN_CODE'), 'XX_UNKNOWN_CODE');
});

test('تفاصيل الأخطاء منقّاة: TjError وأي خطأ آخر لا يحملان رابطًا ولا رمزًا إلى العرض أو التشخيص', () => {
  const a = new TjError('EX_EMPTY_BODY', { detail: HOSTILE }).toJSON();
  const b = toErrorInfo(new Error(`fetch failed for ${HOSTILE}`));
  for (const info of [a, b]) {
    const text = JSON.stringify(info);
    assert.ok(clean(text), text);
    assert.ok(info.message.length > 0);
  }
  assert.equal(b.code, 'TJ_UNEXPECTED');
  assert.ok(DOMAINS.length >= 7);
});

test('تشخيص المستخرج بعد التقاط حقيقي (عيّنتا P1) ورفض فيديو آخر: أعداد ورموز فقط، بلا جسم ولا نص', async () => {
  const msgFor = async (file, videoId, trackKind) => {
    const body = await readFile(new URL(`test/fixtures/json3/${file}`, ROOT), 'utf8');
    return { source: 'tarjuman', v: 1, kind: 'timedtext', videoId, lang: 'en', trackKind, kindParam: trackKind === 'asr' ? 'asr' : null, capsAsr: true, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false };
  };
  const ex = createExtractor({ currentVideoId: () => 'iG9CE55wbtY', durationMs: () => 1203421, isLive: () => false });
  const manual = await msgFor('manual-ted-iG9CE55wbtY.json', 'iG9CE55wbtY', 'manual');
  assert.equal(ex.handleMessage(manual).accepted, true);
  ex.handleMessage({ ...(await msgFor('asr-nwc-Y9rkKtK1b44.json', 'Y9rkKtK1b44', 'asr')) });
  ex.handleMessage({ ...manual, url: HOSTILE });
  const text = JSON.stringify(ex.diagnostics());
  assert.ok(clean(text), 'لا رابط ولا رمز');
  const firstLine = JSON.parse(manual.body).events.find((e) => e.segs)?.segs.map((s) => s.utf8).join('').trim();
  assert.ok(firstLine && !text.includes(firstLine), 'لا نص ترجمة');
  assert.ok(!text.includes(manual.body.slice(0, 40)), 'لا جسم');
});

test('تقرير التشخيص من الإعدادات بعد تصدير واستيراد حقيقيين، بعنوان عدائي: لا عنوان ولا معرّف ولا اسم ملف ولا رابط', async () => {
  let t = Date.parse('2026-11-02T00:00:00.000Z');
  const store = createStore({ area: createMemoryArea({ unlimited: true }), now: () => (t += 1000) });
  const body = await readFile(new URL('test/fixtures/json3/manual-ted-iG9CE55wbtY.json', ROOT), 'utf8');
  const ex = createExtractor({ currentVideoId: () => 'iG9CE55wbtY', durationMs: () => 1203421, isLive: () => false });
  ex.handleMessage({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: 'iG9CE55wbtY', lang: 'en', trackKind: 'manual', kindParam: null, capsAsr: true, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false });
  const conv = ex.convert('en|manual', { mode: 'normal' });
  const title = `محاضرة ${HOSTILE}`;
  const built = buildExport({ videoId: 'iG9CE55wbtY', title, track: { key: 'en|manual', lang: 'en', kind: 'manual', cues: conv.cues, warnings: conv.warnings }, mode: 'normal', now: t });
  await store.updateVideo('iG9CE55wbtY', () => ({ ...videoRecord({ videoId: 'iG9CE55wbtY' }), title }));
  const saved = await store.getVideo('iG9CE55wbtY');
  assert.equal(saved.title.startsWith('محاضرة'), true, 'العنوان العدائي محفوظ فعلًا قبل التقرير');
  const report = await collectDiagnostics({ store, version: '0.2.0', nav: { userAgentData: { brands: [{ brand: 'Brave', version: '156' }] } } });
  assert.equal(JSON.parse(report).sections.library.videos, 1);
  assert.ok(clean(report), 'لا رابط ولا رمز');
  assert.ok(!report.includes('iG9CE55wbtY'), 'لا معرّف فيديو');
  assert.ok(!report.includes('محاضرة'), 'لا عنوان');
  assert.ok(!report.includes(built.files[0].name), 'لا اسم ملف');
  assert.ok(!report.includes(built.instructions.slice(0, 30)), 'لا تعليمات ترجمة');
  const generic = formatDiagnosticReport(createDiagnosticReport({ version: '0.2.0', sections: { player: { title, fileName: built.files[0].name, cues: conv.cues, detail: HOSTILE, nested: [{ text: 'نص', url: HOSTILE }] } } }));
  assert.ok(clean(generic), 'المنقّي العام يُسقط كل ذلك');
  assert.ok(!generic.includes('محاضرة') && !generic.includes(conv.cues[0].text), 'لا عنوان ولا نص');
});

test('تشخيص أدوات المشغّل بعد التحميل والنسخ والرفع: أعداد ورموز، بلا تعليمات ولا نص مقاطع ولا اسم ملف', async () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  click(page.ui.btn('download'));
  click(page.ui.btn('download'));
  click(page.ui.btn('badge'));
  const text = JSON.stringify(page.handle.diagnostics());
  assert.ok(clean(text));
  assert.ok(!text.includes('سطر 1') && !text.includes('talk.ar.srt') && !text.includes('تعليمات-سرية'), text);
});
