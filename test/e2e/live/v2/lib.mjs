// ثوابت رحلة الإصدار الثاني (P15) فوق أدوات P9 (../lib.mjs): ملف تعريف ومسار إضافة لكل متصفح، يتشاركهما الجلسة اليدوية
// (بناء الإنتاج بلا أي علم تحكم) والمؤتمتة (بناء التطوير في المسار نفسه، بلا نافذة)، فيبقى المعرّف والتخزين واحدًا وتصل
// البصمة والمسار الإنجليزي من الاستخراج الحقيقي إلى بقية الرحلة. وهما ملفا P9 نفساهما: فيهما مكتبة أنشأها الإصدار الأول
// بنقرات حقيقية (TED وميدواي والطويل والبث المسجّل بترجماتها العربية)، فترقيتها هي «الترقية ببيانات حقيقية» (P15-AC2)،
// بعد نسخ ملف التعريف كله أولًا. Chrome الرسمي يتجاهل --load-extension منذ 137، فملفه chrome-manual بإضافته المحمّلة يدويًا
// مرة واحدة (P1) من extension-manual. الملفات المتغيرة كلها خارج المستودع.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, ROOT } from '../lib.mjs';

export * from '../lib.mjs';

/** مجلد العمل خارج المستودع: التنزيلات، والترجمات، وحالة الخطوات، ونسخ ملفات التعريف قبل الترقية. */
export const WORK = path.join(PROFILE_ROOT, 'p15-work');

export const V2 = {
  brave: { profile: 'brave-p9-live', ext: path.join(PROFILE_ROOT, 'ext-p9') },
  chrome: { profile: 'chrome-manual', ext: path.join(PROFILE_ROOT, 'extension-manual') },
};

/** فيديوهات الرحلة: يدوي (TED)، وتلقائي بالوضع العادي (ميدواي، 1,056 مقطعًا)، والطويل يُختار بـfind-long.mjs. */
export const VIDEOS = {
  manual: { id: 'iG9CE55wbtY', kind: 'manual', mode: 'normal', title: 'Do schools kill creativity? | Sir Ken Robinson | TED' },
  asr: { id: 'Y9rkKtK1b44', kind: 'asr', mode: 'normal', title: 'Naval Heritage | Jonathan Parshall: The Untold Story of the Battle of Midway' },
};

/** القاموس الذي تُرفقه الرحلة بالتعليمات (يُكتب من الإعدادات، ويُنسخ من الشريط ومن المحفوظات). */
export const GLOSSARY = [
  { source: 'Midway', target: 'ميدواي' },
  { source: 'aircraft carrier', target: 'حاملة طائرات' },
  { source: 'creativity', target: 'الإبداع' },
  { source: 'Naval War College', target: 'كلية الحرب البحرية', note: 'الأمريكية' },
];

/** مجلد node_modules الذي يحل منه المستودع esbuild (في worktree يُحل من النسخة الرئيسية). */
const NODE_MODULES = (() => {
  const f = fileURLToPath(import.meta.resolve('esbuild'));
  return f.slice(0, f.lastIndexOf(`${path.sep}node_modules${path.sep}`) + `${path.sep}node_modules`.length);
})();

/** حزمة tj-v1 الحقيقية: الوسم كما هو، وسكربت حزمته هو (تدقيقها الأول ونتيجتها). */
export async function buildV1(work) {
  const src = path.join(work, 'v1src');
  await rm(src, { recursive: true, force: true });
  await mkdir(src, { recursive: true });
  const tar = path.join(work, 'v1.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tar, 'tj-v1'], { cwd: ROOT });
  execFileSync('tar', ['-xf', tar, '-C', src]);
  await symlink(NODE_MODULES, path.join(src, 'node_modules'));
  const out = path.join(work, 'v1pkg');
  execFileSync(process.execPath, [path.join(src, 'scripts/release/package.mjs'), '--out', out], { cwd: src, stdio: 'ignore' });
  const manifest = JSON.parse(await readFile(path.join(src, 'src/manifest.json'), 'utf8'));
  return { dir: path.join(out, `tarjuman-${manifest.version}`), commit: String(execFileSync('git', ['rev-parse', '--short', 'tj-v1^{commit}'], { cwd: ROOT })).trim() };
}
