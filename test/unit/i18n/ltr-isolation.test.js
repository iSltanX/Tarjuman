// حارس الجولة الرابعة (بند سلطان): القيم التقنية اللاتينية داخل نص عربي معزولة. اسم الملف والمعرّف ورمز اللغة والاختصار والمضيف LTR
// (LRI…PDI)، واسم يكتبه المستخدم (اسم الخانة، المجلد، نص البحث) اتجاهًا (FSI…PDI). كان «نُزّل KA3zmDkEUQs.en.from-ar.asr.normal.srt»
// ينكسر في Chrome فتنقلب أجزاؤه؛ والرسم الذري في الـDOM في اختبارات الأسطح (r4-ltr.test.js لكل سطح).
//
// الطبقات:
// 1. التصنيف (تحقق 2.3.0، ص-١٨): كان الموضع التقني يُعرف من قائمة أسماء وحدها (TECH)، فما ليس فيها يمر بصمت، وفات بذلك قالب قائم
//    منذ 2.2.0 ({videoId} في IM_PATCH_NAME_OTHER_VIDEO). الآن كل موضع في كل قالب عربي (وفي الدالّة كل معامل مفكَّك) مصنَّف باسمه:
//    تقني (TECH)، أو غير تقني بسبب مكتوب (PLAIN)، أو ملتبس (MIXED) يُصنَّف قالبه وحده؛ واسم موضع جديد بلا تصنيف يُفشل الحارس. وكل
//    قالب فيه موضع تقني أو ملتبس مصنَّف هنا: يُبنى بدالته الحقيقية بقيمة عدائية (RUNTIME)، أو يُفحص سطر استدعائه (STATIC)، أو
//    مستثنى بسبب (EXEMPT)؛ والملتبس أيضًا غير تقني بسببه (NOT_TECH)، أو مفتوح بسبب (OPEN) لا يُخفى.
// 2. RUNTIME: القيمة لا تظهر إلا داخل عزل، ولا شيء منها خارجه.
// 3. STATIC: كل سطر يستدعي المفتاح في src يمرر قيمته بدالة العزل بعد المفتاح في السطر نفسه (ltrInline/isolate/keyHint/…)، وفي
//    واجهات المنتج لا يُدرج fileName في قالب نصي إلا معزولًا.
// 4. خارج الفهرس (ص-١٨): لا يُدرج «${…}» في قالب نصي في src إلا معزولًا، فلا يعود «‹الجزء›: …» في الرفع متعدد الأجزاء خامًا.
// حدّه: نصي يكشف النسيان لا التمويه؛ والسطر الواحد بمفتاحين قد يمر بدالة الآخر؛ والقيمة الملصقة بنص خارج الفهرس تُختبر في سطحها؛
// والاسم الموصوف «غير تقني» يُصدَّق بسببه، فوضع اسم ملف في {count} مثلًا لا يُكشف هنا.
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
import { readImport } from '../../../src/core/import/index.js';
import { roundTripText } from '../../../src/ui/track.js';
import { sampleBundle } from '../../helpers/fixtures-v2.js';
import { fileOf, readSrtFixture } from '../../fixtures/srt/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const LRI = String.fromCodePoint(0x2066);
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
const ARABIC = /\p{Script=Arabic}/u;
const SPAN = new RegExp(`[${LRI}${FSI}][^${LRI}${FSI}${PDI}]*${PDI}`, 'g');

/** المواضع التقنية: قيمة لاتينية لا كلام (اسم ملف أو مجلد، ومعرّف، ورمز لغة أو صيغة، واختصار، ومضيف ورابط، ورقم إصدار). */
const TECH = new Set(['file', 'fileName', 'folder', 'id', 'ids', 'videoId', 'host', 'key', 'code', 'lang', 'mac', 'pc', 'path', 'url', 'ext', 'format', 'type', 'version', 'hint', 'save', 'newline', 'cancel']);
/** المواضع الملتبسة: قيمتها تقنية في قالب وكلام في آخر (اسم ملف أو لغة أو خانة، ورقم أو اسم جزء)، فيُصنَّف قالبها وحده. */
const MIXED = new Set(['name', 'names', 'a', 'b', 'from', 'to', 'source', 'target', 'track', 'pair', 'what', 'label', 'desc']);
/** المواضع غير التقنية بأسبابها: لا قيمة لاتينية تنقلب فيها (الأرقام اللاتينية والأزمنة لا تنقلب داخل الجملة، والعبارة عربية). */
const PLAIN = new Map(Object.entries({
  'عدد أو رقم مقطع أو جزء، أو عدد بمعدوده (formatCount)': ['n', 'count', 'max', 'total', 'line', 'lines', 'index', 'list', 'numbers', 'nums', 'prev', 'next', 'expected', 'cur', 'done', 'todo', 'items', 'added', 'removed', 'unchanged', 'replaced', 'skipped', 'failed', 'inserted', 'moved', 'percent', 'countTarget', 'countSource', 'groups', 'videos', 'translations', 'parts', 'adds', 'addsN', 'chars', 'cps', 'edits', 'received', 'requested', 'opened', 'rest', 'matches', 'cues', 'insert', 'replace', 'slot', 'active', 'files', 'timing', 'conflicts', 'mine', 'theirs', 'grouped', 'formatted'],
  'زمن أو إزاحة أو مدة أو تاريخ (والإزاحة الموقّعة معزولة بحارس FA-05)، أو نطاق بسهم RTL (editor.range)': ['sec', 'seconds', 'step', 'delta', 'minus', 'plus', 'amount', 'offset', 'off', 'time', 'at', 'duration', 'last', 'date', 'when', 'current', 'backup', 'tenths', 'unit', 'range'],
  'حجم بوحدته (formatBytes)': ['size', 'used', 'quota', 'alts', 'previous'],
  'عبارة عربية من الفهرس، أو شرط منطقي': ['verb', 'steps', 'mode', 'kind', 'field', 'changes', 'pending', 'drafts', 'phrase', 'becomes', 'reason', 'reasons', 'word', 'whose', 'lost', 'who', 'other', 'fonts', 'page', 'many', 'again', 'all', 'few', 'known', 'editing', 'base'],
  'نص حر (عنوان، بحث واستبدال، نص مقطع، سطر شرح): عزله اتجاهًا (FSI) شأن سطحه، لا LTR': ['title', 'query', 'replacement', 'text', 'head', 'tail', 'first', 'heading'],
  'اسم علم لاتيني بكلمة واحدة (اسم خط الواجهة بين قوسين)': ['headLatin'],
}).flatMap(([why, names]) => names.map((n) => [n, why])));

const NAME = '-KA3zmDkEUQs.en.from-ar.asr.normal.part12of12.srt';
const NAME_B = '-KA3zmDkEUQs.en.from-ar.asr.normal.part13of12.srt';
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
  // تحقق 2.3.0 (ص-١٨): المعرّف في ملف الاستكمال، واسما الجزأين في الرفع متعدد الأجزاء، وأسماء ملاحظة الدمج كما يبنيها readImport.
  'errors.IM_PATCH_NAME_OTHER_VIDEO': () => [messageFor('IM_PATCH_NAME_OTHER_VIDEO', { videoId: VIDEO }), [VIDEO]],
  'errors.IM_PARTS_OVERLAP': () => [messageFor('IM_PARTS_OVERLAP', { a: NAME, b: NAME_B, from: 1, to: 4 }), [NAME, NAME_B]],
  'errors.IM_PARTS_STRAY_NUMBER': () => [messageFor('IM_PARTS_STRAY_NUMBER', { a: NAME, list: '2500', b: NAME_B }), [NAME, NAME_B]],
  'errors.IM_PARTS_GAP': () => [messageFor('IM_PARTS_GAP', { a: NAME, b: NAME_B, from: 5, to: 6 }), [NAME, NAME_B]],
  'errors.IM_NOTE_MERGED': async () => {
    const r = await readImport([fileOf(readSrtFixture('part1.ar.srt'), NAME), fileOf(readSrtFixture('part2.ar.srt'), NAME_B)]);
    return [r.notes[0], [NAME, NAME_B]];
  },
  // رمز لغة لا يعرف المتصفح اسمه في سطر الفيديو المترجم إلى لغته (ح-58).
  'common.track.roundTrip.lead': () => [roundTripText('xx-YY').lead, ['xx-YY']],
  'common.track.roundTrip.how': () => [roundTripText('xx-YY').how, ['xx-YY']],
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
  // أسماء المفاتيح تحت حقل تحرير المقطع في اللوحة (الفكرة ٦): مواضعها بغير أسماء TECH، فتُحرس هنا صراحةً.
  'player.panel.editHint': 'ltrInline(',
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
  'library.target.option': 'تسمية في ناتج targetOptions لا تُرسم: حوار الرفع يرسم chipLabel وحده (upload.js)',
  'core.export.describe.valid': 'وصف مسار الإصدار الأول (describeTrack) لا تستدعيه واجهة اليوم',
  'core.export.describe.invalid': 'وصف مسار الإصدار الأول (describeTrack) لا تستدعيه واجهة اليوم',
};

/** قوالب بموضع ملتبس قيمته فيها غير تقنية، وسببه. */
const NOT_TECH = {
  'errors.CMP_ALIGN_SHIFTED': 'رقما مقطعين',
  'core.backup.partial': 'اسم مجموعة من الفهرس (core.backup.group)',
  'player.controls.otherSummary': 'عدد اللغات بمعدوده (otherWhat)',
  'player.controls.otherInVideo': 'عدد اللغات بمعدوده (otherWhat)',
  'player.controls.previousLost': 'عبارة من الفهرس: «هذه الترجمة» أو «الترجمة N»',
  'player.controls.partRow': 'رقما مقطعين',
  'player.controls.replaceSlot': 'تسمية الخانة من الفهرس (slotLabel)',
  'popup.recentRow.open': 'عنوان الفيديو في اسم وصول زر أيقونة لا يُرسم، وتلميحه نص ثابت',
  'popup.recentRow.edit': 'عنوان الفيديو في اسم وصول زر أيقونة لا يُرسم، وتلميحه نص ثابت',
  'library.delete.allOne': 'رقم الخانة، أو library.delete.named باسمها المعزول اتجاهًا',
  'library.delete.allMany': 'أرقام الخانات، أو library.delete.named بأسمائها المعزولة اتجاهًا',
  'library.compare.countLine': 'عددان',
  'library.compare.ofCount': 'عددان',
  'library.trs.none': 'عبارة من الفهرس (library.row.sourceReady أو sourceMissing)',
  'library.upload.replaceAria': 'اسم وصول لا يُرسم، والتسمية chipLabel باسم الخانة المعزول اتجاهًا',
  'library.upload.replaceAriaActive': 'اسم وصول لا يُرسم، والتسمية chipLabel باسم الخانة المعزول اتجاهًا',
  'settings.glossary.remove': 'المصطلح في اسم وصول زر أيقونة لا يُرسم، وتلميحه settings.glossary.delete',
  'settings.glossary.removePairAria': 'اسم وصول لا يُرسم',
  'settings.data.progress': 'اسم المرحلة من الفهرس',
  'settings.report.personal.text': 'أنواع بيانات من الفهرس',
  'editor.shift.afterLater': 'عبارة النطاق من الفهرس',
  'editor.shift.afterEarlier': 'عبارة النطاق من الفهرس',
  'editor.shift.beforeLater': 'عبارة النطاق من الفهرس',
  'editor.shift.beforeEarlier': 'عبارة النطاق من الفهرس',
  'editor.toolbar.earlier': 'عبارة النطاق من الفهرس',
  'editor.toolbar.later': 'عبارة النطاق من الفهرس',
  'editor.toolbar.preview': 'عبارة النطاق من الفهرس',
  'editor.cmp.count': 'عددان',
  'editor.cmp.restoreCount': 'عددان',
  'editor.mark.set': 'اسم العلامة من الفهرس',
  'editor.marks.jumpAria': 'اسم العلامة من الفهرس',
  'editor.marks.toggled': 'اسم العلامة من الفهرس',
  'editor.complete.part': 'رقما مقطعين',
  'editor.drift.numberAria': 'تسمية من الفهرس في اسم وصول',
  'editor.drift.timeAria': 'تسمية من الفهرس في اسم وصول',
  'editor.drift.now': 'زمنان',
  'editor.structure.merge': 'رقما مقطعين',
  'editor.structure.merged': 'رقما مقطعين',
};

/**
 * مفتوح بقرار لاحق، لا يُخفى (تحقق 2.3.0، ص-١٨): اسم اللغة من languageName أو describeLang، والرمز الذي لا يعرف المتصفح اسمه يُعرض
 * خامًا بلا عزل (مثل «sat» أو «mni-Mtei»؛ ص-١٢). كلمة لاتينية بشرطات لا تنقلب داخل الجملة، لكنها خارج قاعدة العزل؛ وعزلها في
 * مصدر الأسماء نفسه يمس ما يقارن الاسم بالرمز (roundTripText). وما عُزل منه مصنَّف في RUNTIME (popup.status.translationIn وroundTrip).
 */
const OPEN = {
  'common.track.via': 'اسما لغتين، والرمز المجهول خام',
  'player.controls.dualShort': 'اسم لغة الأصل، والرمز المجهول خام',
  'player.controls.dualAria': 'اسم لغة الأصل، والرمز المجهول خام',
  'player.panel.withOriginal': 'اسم لغة الأصل، والرمز المجهول خام',
  'popup.steps.downloadFrom': 'اسم لغة «من»، والرمز المجهول خام',
  'popup.steps.copyTo': 'اسم لغة «إلى»، والرمز المجهول خام',
  'popup.status.modeDual': 'اسم لغة الأصل، والرمز المجهول خام',
  'popup.pair.machine': 'وصف المسار (trackDescription) باسمي لغتيه',
  'library.export.current': 'اسم لغة الترجمة، والرمز المجهول خام',
  'library.export.uploaded': 'اسم لغة الترجمة، والرمز المجهول خام',
  'library.export.extractedOne': 'اسم لغة الأصل، والرمز المجهول خام',
  'library.export.autoFrom': 'اسم لغة المصدر، والرمز المجهول خام',
  'library.fingerprint.track': 'اسم لغة الأصل، والرمز المجهول خام',
  'settings.glossary.removeTitle': 'زوج اللغتين (common.pair)، والرمز المجهول خام',
  'settings.langs.assignTitle': 'اسم اللغة المختارة، والرمز المجهول خام',
};

/** قوالب الفهرس العربي ومواضعها كلها، من النصوص (ما فيه حرف عربي) وأسماء معاملات الدوال المفكَّكة. */
function templateHoles() {
  const out = new Map();
  const walk = (node, prefix) => {
    for (const [k, v] of Object.entries(node)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') {
        const holes = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        if (holes.length && ARABIC.test(v)) out.set(key, holes);
      } else if (typeof v === 'function') {
        const params = /^\s*\(\s*\{([^}]*)\}/.exec(String(v))?.[1] ?? '';
        const holes = params.split(',').map((p) => p.trim().split(/[\s:=]/)[0]).filter(Boolean);
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

test('كل موضع في قالب عربي مصنَّف باسمه: تقني، أو غير تقني بسببه، أو ملتبس؛ ولا اسم في صنفين', () => {
  const names = new Set([...templateHoles().values()].flat());
  const unknown = [...names].filter((h) => !TECH.has(h) && !MIXED.has(h) && !PLAIN.has(h)).sort();
  assert.deepEqual(unknown, [], 'موضع جديد: صنّفه في TECH أو PLAIN بسببه أو MIXED');
  for (const h of TECH) assert.ok(!MIXED.has(h) && !PLAIN.has(h), `${h} في صنفين`);
  for (const h of MIXED) assert.ok(!PLAIN.has(h), `${h} في صنفين`);
  for (const [h, why] of PLAIN) assert.ok(ARABIC.test(why), `${h}: سبب`);
  // لا تصنيف لاسم زال من كل القوالب (الملتبس والمعلَّل وحدهما؛ والتقني مفردات ثابتة يُصنَّف قالبها متى ظهر).
  const unused = [...MIXED, ...PLAIN.keys()].filter((h) => !names.has(h));
  assert.deepEqual(unused, [], 'تصنيف لموضع لا قالب فيه');
});

test('كل قالب عربي فيه موضع تقني أو ملتبس مصنَّف: يُبنى، أو يُفحص استدعاؤه، أو مستثنى، أو غير تقني، أو مفتوح بسببه', () => {
  const holes = templateHoles();
  const classified = (k) => k in RUNTIME || k in STATIC || k in EXEMPT;
  const tech = [...holes].filter(([, h]) => h.some((x) => TECH.has(x))).map(([k]) => k);
  assert.deepEqual(tech.filter((k) => !classified(k)), [], 'قالب تقني جديد: اعزل قيمته وصنّفه هنا');
  const mixed = [...holes].filter(([, h]) => h.some((x) => MIXED.has(x))).map(([k]) => k);
  assert.deepEqual(mixed.filter((k) => !classified(k) && !(k in NOT_TECH) && !(k in OPEN)), [], 'قالب بموضع ملتبس: صنّف قالبه');
  // غير التقني والمفتوح لقالب فيه موضع ملتبس وحده، ولا يُصنَّف قالب مرتين.
  for (const k of [...Object.keys(NOT_TECH), ...Object.keys(OPEN)]) assert.ok(mixed.includes(k), `${k}: لا موضع ملتبس فيه`);
  const all = [...Object.keys(RUNTIME), ...Object.keys(STATIC), ...Object.keys(EXEMPT), ...Object.keys(NOT_TECH), ...Object.keys(OPEN)];
  assert.deepEqual(all.filter((k, i) => all.indexOf(k) !== i), [], 'قالب مصنَّف مرتين');
  // والمصنّف موجود في الفهرس (لا تصنيف لمفتاح حُذف).
  const flat = new Set();
  const walk = (node, prefix) => { for (const [k, v] of Object.entries(node)) { const key = prefix ? `${prefix}.${k}` : k; if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.one !== 'string') walk(v, key); else flat.add(key); } };
  walk(CATALOG.ar, '');
  for (const k of all) assert.ok(flat.has(k), `${k}: ليس في الفهرس`);
  for (const [k, why] of [...Object.entries(EXEMPT), ...Object.entries(NOT_TECH), ...Object.entries(OPEN)]) assert.ok(ARABIC.test(why), `${k}: سبب`);
});

test('RUNTIME: القيمة التقنية لا تظهر إلا داخل عزل، باسم طويل أوله شرطة', async () => {
  const bad = [];
  for (const [key, build] of Object.entries(RUNTIME)) {
    const [text, values] = await build();
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

// تحقق 2.3.0 (ص-١٨): «‹الجزء›: …» أول ملاحظة الجزء وخطئه في الرفع متعدد الأجزاء نص يُركَّب في الشيفرة لا في الفهرس، ففاته الحارس.
// والسطر المستثنى بنصه وسببه.
const GUILLEMET_ALLOWED = new Map([
  ['src/core/srt/parser.js', ['تفاصيل تشخيص (detail) من محلّل SRT الصارم لمخرجات ترجمان، لا نص واجهة', "if (lines[0] !== String(n)) throw new SrtParseError(`الترقيم «${lines[0]}» والمتوقع ${n}`, n);"]],
]);

test('خارج الفهرس: لا يُدرج «${…}» في قالب نصي إلا معزولًا (ltrInline أو isolate أو LTR)، عدا السطر المستثنى بسببه', async () => {
  const files = (await sources(path.join(ROOT, 'src'))).filter((f) => !f.includes(`${path.sep}i18n${path.sep}`));
  const bad = [];
  const used = new Set();
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    for (const [i, line] of (await readFile(f, 'utf8')).split('\n').entries()) {
      for (const m of line.matchAll(/«\$\{([^{}]*)\}»/g)) {
        // LTR دالة العزل نفسها في ملفات رسائل الأخطاء (core/errors).
        if (/^\s*(ltrInline|isolate|LTR)\(/.test(m[1])) continue;
        const allowed = GUILLEMET_ALLOWED.get(rel);
        if (allowed && allowed[1] === line.trim()) {
          used.add(rel);
          continue;
        }
        bad.push(`${rel}:${i + 1} ${m[0]}`);
      }
    }
  }
  assert.deepEqual(bad, []);
  for (const [rel, [why]] of GUILLEMET_ALLOWED) {
    assert.ok(used.has(rel), `${rel}: استثناء لسطر لم يعد موجودًا`);
    assert.ok(ARABIC.test(why), `${rel}: سبب`);
  }
});
