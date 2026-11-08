// أهداف البناء: chromium لـChrome وBrave وEdge، والبيان فيه src/manifest.json كما هو؛
// وfirefox بأصغر طبقة فوقه، والشيفرة والملفات واحدة في الهدفين. Edge لا فرع له إلا بفرق يثبته الاختبار.
//   الطبقة: العامل الخلفي سكربت خلفية (Firefox لا يدعم background.service_worker)، وbrowser_specific_settings.gecko بالمعرّف
//   وأدنى إصدار (144: getBytesInUse، وموافقة جمع البيانات المدمجة منذ 140) وdata_collection_permissions، وبلا gecko_android (سطح المكتب وحده).
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const TARGETS = Object.freeze(['chromium', 'firefox']);

/** مجلد البناء الافتراضي لكل هدف: dist/ لعائلة Chromium كما كان. */
export const DEFAULT_OUT = Object.freeze({ chromium: 'dist', firefox: 'dist-firefox' });

/** ما يكتبه البناء في جذر مجلده. */
export const BUILD_TOP = Object.freeze(['manifest.json', 'THIRD_PARTY_NOTICES.txt', 'background', 'content', 'main-world', 'pages', 'ui', 'icons', 'dev']);
/** ملفات يضعها مدير الملفات في أي مجلد (Finder وExplorer): لا تجعل المجلد غير مملوك ولا غير فارغ. */
export const OS_JUNK = Object.freeze(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

/** هل child هو parent أو داخله؟ بمقاطع المسار لا بالنص (فـsrc/..foo داخل src). */
export function insidePath(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}

/**
 * لماذا لا يُمسح مجلد إخراج قبل البناء، أو null إن جاز (تدقيق 7a66f91، U60؛ كان البناء يمسح أي مجلد إلا الجذر وsrc، ومنه .git
 * وأشجار العمل ومجلد المستخدم). يجوز ما يملكه البناء وحده: لا جذر المستودع ولا أبًا له، ولا داخل src ولا .git، ولا رابطًا رمزيًا،
 * وهو غائب أو فارغ أو مجلد بناء سابق (بيان ترجمان في جذره، ولا شيء فيه غير BUILD_TOP).
 * @param {string} out مسار مطلق @param {{ root: string }} o جذر المستودع
 * @returns {Promise<string|null>}
 */
export async function outDirProblem(out, { root }) {
  const src = path.join(root, 'src');
  if (insidePath(root, out)) return 'جذر المستودع أو أب له';
  if (insidePath(out, src)) return 'داخل src';
  if (out.split(path.sep).includes('.git')) return 'داخل .git';
  let info;
  try {
    info = await lstat(out);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  if (info.isSymbolicLink()) return 'رابط رمزي';
  if (!info.isDirectory()) return 'ليس مجلدًا';
  const names = (await readdir(out)).filter((n) => !OS_JUNK.includes(n));
  if (!names.length) return null;
  const foreign = names.filter((n) => !BUILD_TOP.includes(n));
  if (foreign.length) return `فيه ما لا يكتبه البناء: ${foreign.slice(0, 5).join('، ')}`;
  try {
    const built = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
    const own = JSON.parse(await readFile(path.join(src, 'manifest.json'), 'utf8'));
    // الاسم تغيّر عبر الإصدارات، والاسم المختصر «ترجمان» ثابت منذ 1.1.0: فبناء سابق بأي منهما بناءُ ترجمان. وبناءات 0.2.0 و1.0.0
    // بلا short_name واسمها «ترجمان» نفسه، أي الاسم المختصر الحالي (التدقيق الموحد V2، U-067: كان dist قديم من 1.0.0 يُرفض).
    const ours = new Set([own.name, own.short_name].filter((n) => typeof n === 'string' && n));
    return ours.has(built.name) || ours.has(built.short_name) ? null : 'بيانه ليس بيان ترجمان';
  } catch {
    return 'لا بيان ترجمان في جذره';
  }
}

/**
 * إعدادات Gecko المعتمدة (قرار سلطان، store/README.md §٥). لا يُجمع شيء دون موافقة، فالمطلوب none؛ وقناة البلاغات (T2.1)
 * فئتها الاختيارية technicalAndInteraction (اسم المتصفح وإصداره والنظام في البلاغ)، تُطلب مع إذن مضيفها عند أول إرسال.
 * وصور المحفوظات تنقل معرّفات المحفوظات إلى i.ytimg.com (حكم T5 بتعريفات Mozilla، docs/site/README.md)، فتُعلن
 * browsingActivity اختيارية، ويطلبها مفتاح الصور عند تفعيله، والصور مطفأة حتى الموافقة (قرار سلطان 2026-11-04،
 * src/core/consent/thumbnails.js). فيبقى none صادقًا: لا يُجمع شيء دون موافقة.
 * والحد الأدنى 144 (تدقيق 7a66f91، U03 وU83، قرار سلطان Q08 في 2026-11-05): storage.local.getBytesInUse منذ 144 وgetKeys منذ 143،
 * و140–143 متقاعدة (ESR 140 انتهى دعمه في 2026-09-29). ويقابله minimum_chrome_version ‏130 في البيان (getKeys، قرار Q09).
 */
export const GECKO = Object.freeze({
  id: 'tarjuman@bysltan.com',
  strict_min_version: '144.0',
  data_collection_permissions: Object.freeze({ required: Object.freeze(['none']), optional: Object.freeze(['technicalAndInteraction', 'browsingActivity']) }),
});

/**
 * بيان الهدف من البيان الأساسي، دون مسّ الأصل.
 * @param {object} base src/manifest.json
 * @param {'chromium'|'firefox'} target
 */
export function targetManifest(base, target) {
  if (!TARGETS.includes(target)) throw new Error(`هدف بناء غير معروف: ${target}`);
  const m = structuredClone(base);
  if (target === 'chromium') return m;
  m.background = { scripts: [base.background.service_worker] };
  m.browser_specific_settings = { gecko: structuredClone(GECKO) };
  return m;
}
