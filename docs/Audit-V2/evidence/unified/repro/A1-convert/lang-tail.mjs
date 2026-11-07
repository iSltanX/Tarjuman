// A1 — التحقق من Gemini F-15: (أ) sameBaseLang مقابل === ، (ب) normalizeLang للوسوم المركبة، (ج) TARJUMAN_TAIL.
// الاستعمال: command node lang-tail.mjs <جذر الشيفرة>
// لا متصفح ولا شبكة ولا كتابة. كل حالة تطبع «الفعلي» و«المتوقع».
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة وسيطًا أول');
const { normalizeLang, sameBaseLang, langFromFileName } = await import(`${R}/src/core/lang/index.js`);
const { pairState } = await import(`${R}/src/pages/popup/status.js`);
const { buildExport, fileName } = await import(`${R}/src/core/export/index.js`);
const { buildPatchPackage } = await import(`${R}/src/core/export/patch.js`);
const { videoIdFromName, classTransitions } = await import(`${R}/src/core/import/review.js`);
const { VIDEO_ID, englishTrack } = await import(`${R}/test/helpers/fixtures.js`);

const out = (title, actual, expected, note) => {
  console.log(`\n## ${title}`);
  console.log('الفعلي:', JSON.stringify(actual));
  console.log('المتوقع:', JSON.stringify(expected));
  if (note) console.log('ملاحظة:', note);
};

// ---- (أ) من يستعمل sameBaseLang في شيفرة المنتج؟ وماذا تفعل النافذة فعلًا؟ ----
{
  const users = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js') && /\bsameBaseLang\b/.test(readFileSync(p, 'utf8'))) users.push(path.relative(R, p));
    }
  };
  walk(path.join(R, 'src'));
  out('أ-١. ملفات src التي تذكر sameBaseLang', users, 'إن صح ادعاء Gemini: src/pages/popup/status.js بين المستعملين',
    'التعريف وحده في src/core/lang/index.js؛ لا مستدعي في المنتج.');

  const reply = { watch: true, loading: false, videoId: VIDEO_ID, title: 'T', source: { lang: 'ar-EG', via: null } };
  const rows = [['ar-EG', 'ar'], ['iw', 'he'], ['en', 'en-GB'], ['ar', 'ar']].map(([from, to]) => {
    const p = pairState({ reply: { ...reply, source: { lang: from, via: null } }, pair: { from, to } });
    return { from, to, popupReady: p.ready, reason: p.reason, sameBaseLang: sameBaseLang(from, to) };
  });
  out('أ-٢. pairState في النافذة (المنطق الذي يمنع النسخ)', rows,
    'إن صح الادعاء: popupReady=false حيث sameBaseLang=true', 'النافذة تقارن from === to حرفيًا (status.js:383)، كالتصدير والاستكمال والمحرّر والمحفوظات.');

  const track = englishTrack({ lang: 'ar-EG', cues: [{ n: 1, startMs: 0, endMs: 1000, text: 'أهلاً بيكم' }] });
  track.key = 'ar-EG|manual';
  const exp = buildExport({ videoId: VIDEO_ID, title: 'T', track, mode: 'normal', target: 'ar', now: 0 });
  const patch = buildPatchPackage({ videoId: VIDEO_ID, fingerprint: exp.fingerprint, englishTracks: [track], numbers: [1], target: 'ar' });
  out('أ-٣. التصدير والاستكمال بزوج ar-EG ← ar', { exportInstructionsFirstLine: exp.instructions.split('\n')[0], patchHasInstructions: Boolean(patch.ok && patch.instructions) },
    'سلوك متسق مع النافذة (كلها تسمح، فلا تعارض)');
}

// ---- (ب) normalizeLang للوسوم المركبة القديمة ----
{
  const codes = ['zh-hakka', 'zh-min-nan', 'zh-xiang', 'zh-guoyu', 'no-bok', 'art-lojban', 'sh', 'hak', 'hak-TW', 'yue-HK', 'zh-Hant', 'zh-HK', 'es-419', 'fil', 'iw', 'pt-BR'];
  const rows = Object.fromEntries(codes.map((c) => [c, { normalizeLang: normalizeLang(c), canonical: (() => { try { return Intl.getCanonicalLocales(c)[0]; } catch { return null; } })() }]));
  out('ب-١. normalizeLang', rows, 'لا يُسقط وسمًا يميّز اللغة (zh-hakka لا يصير zh)');
  out('ب-٢. أين يصل الرمز إلى normalizeLang؟ اسم ملف مرفوع', { 'v.zh-hakka.srt': langFromFileName('v.zh-hakka.srt'), 'v.hak.srt': langFromFileName('v.hak.srt') },
    'v.zh-hakka.srt → hak أو null، لا zh', 'رموز مسارات يوتيوب لا تمر بـnormalizeLang (message.js يتحقق بالنمط فقط).');
}

// ---- (ج) TARJUMAN_TAIL وقرينة اسم الملف ----
{
  const id = 'abcdeFGHIJ1'; // تبدّلان فقط في الأصناف: لا يُعدّ عشوائيًا (≥6) فيعتمد على نمط الذيل
  const names = {
    'ar (ثنائي)': fileName({ videoId: id, lang: 'ar', kind: 'manual', mode: 'normal' }),
    'zh-Hant': fileName({ videoId: id, lang: 'zh-Hant', kind: 'manual', mode: 'normal' }),
    'fil (ثلاثي)': fileName({ videoId: id, lang: 'fil', kind: 'manual', mode: 'normal' }),
    'yue (ثلاثي)': fileName({ videoId: id, lang: 'yue', kind: 'asr', mode: 'normal' }),
    'es-419 (رقمي)': fileName({ videoId: id, lang: 'es-419', kind: 'manual', mode: 'normal' }),
    'مترجم آليًا .from-en': fileName({ videoId: id, lang: 'es', via: 'en', kind: 'asr', mode: 'normal' }),
    'ما يعيده النموذج للمترجم آليًا': `${id}.ar.from-en.asr.normal.srt`,
  };
  const rows = Object.entries(names).map(([k, n]) => ({ case: k, name: n, hint: videoIdFromName(n, { videoId: 'ZZZZZZZZZZZ', knownVideoIds: [] }) }));
  out('ج-١. قرينة الاسم لفيديو آخر غير معروف (classTransitions=' + classTransitions(id) + ')', rows,
    'قرينة {videoId: abcdeFGHIJ1, differs: true} لكل أسماء ترجمان');

  // كم معرّفًا حقيقي الشكل يقل تبدّله عن 6 فيعتمد على الذيل؟ (عشوائي ببذرة ثابتة)
  const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  let below = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const t = Array.from({ length: 11 }, () => ALPH[Math.floor(rnd() * 64)]).join('');
    if (classTransitions(t) < 6) below++;
  }
  out('ج-٢. نسبة المعرّفات العشوائية التي تبدّل أصنافها أقل من 6', { below, of: N, ratio: Math.round((below / N) * 1000) / 1000 },
    'معلومة: هذه وحدها تعتمد على TARJUMAN_TAIL حين لا يكون الفيديو الحالي ولا في المحفوظات');
}
