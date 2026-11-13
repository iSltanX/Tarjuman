// حارس الجولة الرابعة (بند سلطان): القيم التقنية اللاتينية داخل نص عربي معزولة. اسم الملف والمعرّف ورمز اللغة والاختصار والمضيف LTR
// (LRI…PDI)، واسم يكتبه المستخدم (اسم الخانة، المجلد، نص البحث) اتجاهًا (FSI…PDI). كان «نُزّل KA3zmDkEUQs.en.from-ar.asr.normal.srt»
// ينكسر في Chrome فتنقلب أجزاؤه؛ والرسم الذري في الـDOM في اختبارات الأسطح (r4-ltr.test.js لكل سطح).
//
// ثلاث طبقات:
// 1. كل قالب عربي في الفهرس فيه موضع تقني ({file} و{id} و{host} و{key} و{code}…؛ وفي الدالّة باسم معاملها) مصنَّف هنا: يُبنى بدالته
//    الحقيقية بقيمة عدائية (RUNTIME)، أو يُفحص سطر استدعائه في الشيفرة (STATIC)، أو مستثنى بسبب مكتوب (EXEMPT). قالب تقني جديد بلا
//    تصنيف يُفشل الحارس، فلا يدخل اسم ملف جملةً عربية بلا قرار.
// 2. RUNTIME: القيمة لا تظهر إلا داخل عزل، ولا شيء منها خارجه.
// 3. STATIC: كل سطر يستدعي المفتاح في src يمرر قيمته بدالة العزل بعد المفتاح في السطر نفسه (ltrInline/isolate/keyHint/…)، وفي
//    واجهات المنتج لا يُدرج fileName في قالب نصي إلا معزولًا.
// حدّه: نصي يكشف النسيان لا التمويه؛ والسطر الواحد بمفتاحين قد يمر بدالة الآخر؛ والقيمة الملصقة بنص خارج الفهرس تُختبر في سطحها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG } from '../../../src/i18n/catalog.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { downloadedLine } from '../../../src/player/controls/text.js';
import { deleteSummary, nameHintText } from '../../../src/pages/library/model.js';
import { saveMessage } from '../../../src/pages/editor/text.js';
import { describeStatus } from '../../../src/pages/popup/status.js';
import { sampleBundle } from '../../helpers/fixtures-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const LRI = String.fromCodePoint(0x2066);
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
const ARABIC = /\p{Script=Arabic}/u;
const SPAN = new RegExp(`[${LRI}${FSI}][^${LRI}${FSI}${PDI}]*${PDI}`, 'g');

/** المواضع التقنية في القوالب: ما يُدرج قيمة لاتينية لا كلامًا. */
const TECH = new Set(['file', 'folder', 'id', 'ids', 'host', 'key', 'code', 'mac', 'pc', 'path', 'url', 'ext', 'format', 'type', 'version', 'hint']);

const NAME = '-KA3zmDkEUQs.en.from-ar.asr.normal.part12of12.srt';
const VIDEO = '-KA3zmDkEUQ';
const FOLDER = 'My-Subs (v2).';

/** يبني القالب بدالته الحقيقية، والقيم التي يجب ألا تظهر إلا معزولة. */
const RUNTIME = {
  'player.controls.downloadedLine': () => [downloadedLine(NAME), [NAME]],
  'library.delete.slotItem': () => {
    const b = sampleBundle();
    b.slots[1].track = { ...b.slots[1].track, fileName: NAME };
    return [deleteSummary(b, { scope: 'slot', n: 2 }).items[0], [NAME]];
  },
  'library.nameHint.withId': () => [nameHintText({ differs: true, videoId: VIDEO }), [VIDEO]],
  'editor.save.subfolder': () => [saveMessage({ ok: true, mode: 'subfolder' }, NAME, { mode: 'subfolder', folder: FOLDER }, messageFor).text, [NAME, FOLDER]],
  'editor.save.ask': () => [saveMessage({ ok: true, mode: 'ask' }, NAME, undefined, messageFor).text, [NAME]],
  'editor.save.downloads': () => [saveMessage({ ok: true, mode: 'downloads' }, NAME, undefined, messageFor).text, [NAME]],
  'popup.status.translationIn': () => [describeStatus({
    v: 1, ok: true, watch: true, videoId: 'iG9CE55wbtY', title: 'عنوان', loading: false, english: { captured: [], saved: [] },
    arabic: { fileName: 'x.srt', cueCount: 3, edited: false, matched: true, lang: 'xx-YY' }, view: { displayOffsetMs: 0, displayMode: 'ar' },
    mounted: { overlay: 'mounted', controls: 'mounted' },
  }).line, ['xx-YY']],
  'errors.EX_UNSUPPORTED_FORMAT': () => [messageFor('EX_UNSUPPORTED_FORMAT', { format: 'srv3' }), ['srv3']],
};

/** المفتاح ودالة العزل التي يجب أن تلي المفتاح في سطر استدعائه. */
const STATIC = {
  'popup.paste.placeholder': 'pasteKeys(',
  'library.paste.placeholder': 'pasteKeys(',
  'library.dialog.unreadableNote': 'isolate(',
  'settings.thumbsSwitch.note': 'ltrInline(',
  'settings.thumbsSwitch.noteFirefox': 'ltrInline(',
  // عنوان صفحة الاختصارات (الفكرة ١٠): يُرسم عنصرًا ذريًا بـltrNodes (r5-shortcuts.test.js).
  'settings.shortcuts.openFailed': 'ltrInline(',
  'settings.shortcuts.firefox': 'ltrInline(',
  'settings.data.excluded': 'idText(',
  'settings.data.notIncluded': 'idText(',
  'editor.action.undoTitle': 'keyHint(',
  'editor.action.redoTitle': 'keyHint(',
  'editor.action.saveTitle': 'keyHint(',
  'editor.search.prevTitle': 'ltrInline(',
  'editor.search.nextTitle': 'ltrInline(',
  'editor.search.placeholder': 'keyHint(',
  // نص يكتبه المستخدم في جملة عربية: اسم الخانة ونصّا البحث والاستبدال، معزولة اتجاهًا (FSI…PDI).
  'editor.search.previewIntro': 'isolate(',
  'player.panel.statusSlotNamed': 'isolate(',
  'player.controls.replaceSlotNamed': 'isolate(',
  'library.chip.named': 'isolate(',
  'library.chipRow.base': 'isolate(',
  'library.delete.named': 'isolate(',
  'editor.resume.item': 'isolate(',
  'editor.slot.whoNamed': 'isolate(',
  'editor.ref.slotNamed': 'isolate(',
};

/** المستثنى وسببه. */
const EXEMPT = {
  'common.continuation.note': 'ملاحظة تُحفظ في سجل الترجمة (withContinuation) وتدخل النسخة الاحتياطية: لا يدخل العزل نصًا يُحفظ',
  'core.diagnostics.removedType': 'في نص تقرير التشخيص المنسوخ، لا في الواجهة',
  'library.rowAction.copyId': 'اسم وصول لزر أيقونة (aria-label) لا يُرسم',
  'settings.data.meta': 'رقم الإصدار أرقام ونقاط تُعرض LTR بلا عزل',
};

/** قوالب الفهرس العربي ومواضعها التقنية، من النصوص وأسماء معاملات الدوال. */
function technicalTemplates() {
  const out = new Map();
  const walk = (node, prefix) => {
    for (const [k, v] of Object.entries(node)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') {
        const holes = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((h) => TECH.has(h));
        if (holes.length && ARABIC.test(v)) out.set(key, holes);
      } else if (typeof v === 'function') {
        const params = /^\s*\(\s*\{([^}]*)\}/.exec(String(v))?.[1] ?? '';
        const holes = params.split(',').map((p) => p.trim().split(/[\s:=]/)[0]).filter((h) => TECH.has(h));
        if (holes.length) out.set(key, holes);
      } else if (v && typeof v === 'object') walk(v, key);
    }
  };
  walk(CATALOG.ar, '');
  return out;
}

async function sources(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await sources(p)));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('كل قالب عربي فيه موضع تقني مصنَّف: يُبنى، أو يُفحص استدعاؤه، أو مستثنى بسبب', () => {
  const found = technicalTemplates();
  // ما يعرفه الحارس من قبل (لا يُكتشف بالاسم وحده): {name} اسم ملف في «نُزّل».
  const unclassified = [...found.keys()].filter((k) => !(k in RUNTIME) && !(k in STATIC) && !(k in EXEMPT));
  assert.deepEqual(unclassified, [], 'قالب تقني جديد: اعزل قيمته وصنّفه هنا');
  // والمصنّف موجود في الفهرس (لا تصنيف لمفتاح حُذف).
  const flat = new Set();
  const walk = (node, prefix) => { for (const [k, v] of Object.entries(node)) { const key = prefix ? `${prefix}.${k}` : k; if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.one !== 'string') walk(v, key); else flat.add(key); } };
  walk(CATALOG.ar, '');
  for (const k of [...Object.keys(RUNTIME), ...Object.keys(STATIC), ...Object.keys(EXEMPT)]) assert.ok(flat.has(k), `${k}: ليس في الفهرس`);
  for (const [k, why] of Object.entries(EXEMPT)) assert.ok(ARABIC.test(why), `${k}: سبب الاستثناء`);
});

test('RUNTIME: القيمة التقنية لا تظهر إلا داخل عزل، باسم طويل أوله شرطة', () => {
  const bad = [];
  for (const [key, build] of Object.entries(RUNTIME)) {
    const [text, values] = build();
    const outside = text.replace(SPAN, '');
    const spans = text.match(SPAN) ?? [];
    for (const v of values) {
      if (outside.includes(v)) bad.push(`${key}: «${v}» خارج العزل`);
      if (!spans.some((s) => s.slice(1, -1) === v)) bad.push(`${key}: «${v}» ليس معزولًا وحده`);
    }
  }
  assert.deepEqual(bad, []);
});

test('STATIC: كل سطر يستدعي المفتاح في الشيفرة يمرر قيمته بدالة العزل', async () => {
  const files = (await sources(path.join(ROOT, 'src'))).filter((f) => !f.includes(`${path.sep}i18n${path.sep}`) && !f.includes(`${path.sep}core${path.sep}errors${path.sep}`));
  const texts = await Promise.all(files.map(async (f) => [path.relative(ROOT, f), (await readFile(f, 'utf8')).split('\n')]));
  const bad = [];
  for (const [key, helper] of Object.entries(STATIC)) {
    // نصوص المشغّل واللوحة تُستدعى بمختصر T('<الاسم>') داخل وحدتها.
    const last = key.split('.').at(-1);
    const patterns = [`'${key}'`, ...(key.startsWith('player.') ? [`T('${last}'`] : [])];
    let uses = 0;
    for (const [file, lines] of texts) {
      lines.forEach((line, i) => {
        const at = Math.max(...patterns.map((p) => line.indexOf(p)));
        if (at < 0) return;
        uses++;
        if (!line.slice(at).includes(helper)) bad.push(`${file}:${i + 1} ${key} بلا ${helper}`);
      });
    }
    if (!uses) bad.push(`${key}: لا استدعاء في الشيفرة (حُذف؟ فاحذف تصنيفه)`);
  }
  assert.deepEqual(bad, []);
});

test('واجهات المنتج: لا fileName في قالب نصي إلا معزولًا (ltrInline)، عدا اسم الوصول المذكور', async () => {
  const roots = ['pages', 'player', 'ui'].map((d) => path.join(ROOT, 'src', d));
  const files = (await Promise.all(roots.map(sources))).flat();
  // اسم وصول زر الرفع (aria-label) لا يُرسم، فلا ترتيب بصري فيه.
  const ALLOWED = ['src/player/controls/session.js: ${s.arabic.fileName}'];
  const bad = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    for (const [i, line] of (await readFile(f, 'utf8')).split('\n').entries()) {
      for (const m of line.matchAll(/\$\{([^{}]*fileName[^{}]*)\}/g)) {
        if (/^\s*(ltrInline|isolate)\(/.test(m[1])) continue;
        if (ALLOWED.includes(`${rel}: ${m[0]}`)) continue;
        bad.push(`${rel}:${i + 1} ${m[0]}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
