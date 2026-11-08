// نطاق أدلة الفحوص في README مجلد الإصدار (التدقيق الموحد V2، U-068): المولِّد scripts/release/v2.mjs يقرأ نتائج الفحوص
// والاختبار الحي من مجلد أدلة سُجّل على التزام سابق، وكان القالب يقول «على الالتزام نفسه» أيًّا كان التزام البناء. فصار يذكر
// التزام الأدلة، ويقارنه بالتزام البناء في ملفات المصدر المبني وحدها (مسارات حزمة المصدر)، ويقول صراحةً إن لم تغطِّ الأدلة الشيفرة.
import { execFileSync } from 'node:child_process';

/**
 * ملفات المصدر المبني التي تغيّرت بين التزام الأدلة والتزام البناء، أو null إن لم يُعرف التزام الأدلة في المستودع.
 * @param {string} root جذر المستودع @param {string} from التزام الأدلة @param {string} to التزام البناء
 * @param {string[]} paths مسارات حزمة المصدر
 * @returns {string[]|null}
 */
export function changedSince(root, from, to, paths) {
  const git = (...a) => String(execFileSync('git', a, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })).trim();
  try {
    git('rev-parse', '--verify', '--quiet', `${from}^{commit}`);
  } catch {
    return null;
  }
  const out = git('diff', '--name-only', from, to, '--', ...paths);
  return out ? out.split('\n') : [];
}

/**
 * عبارتا README: نطاق الفحوص الآلية، وتنبيه الاختبار الحي.
 * @param {{ head: string, evidenceCommit: string|null|undefined, changed: string[]|null }} o
 *   head التزام البناء كاملًا، وevidenceCommit ما سجّلته الأدلة (مختصرًا أو كاملًا)، وchanged ناتج changedSince
 * @returns {{ current: boolean, checks: string, live: string }}
 */
export function evidenceScope({ head, evidenceCommit, changed }) {
  const redo = 'فأعدها على التزام البناء قبل الرفع';
  if (!evidenceCommit) {
    return { current: false, checks: `**الأدلة لا تذكر التزامها**، فلا يُعرف أتغطي هذا البناء: ${redo}`, live: '**لا يُعرف التزام هذه الأدلة**، فأعد المتأثر منها قبل الرفع.' };
  }
  const at = `على الالتزام \`${evidenceCommit.slice(0, 7)}\``;
  if (head.startsWith(evidenceCommit)) return { current: true, checks: 'على التزام البناء نفسه', live: '' };
  if (changed === null) {
    return { current: false, checks: `${at}، **ولا يوجد في المستودع** ليُقارن بالتزام البناء: ${redo}`, live: '**سُجّلت على التزام غير معروف هنا**، فأعد المتأثر منها قبل الرفع.' };
  }
  if (!changed.length) {
    return { current: true, checks: `${at} قبل التزام البناء، وملفات المصدر المبني لم تتغير بعده`, live: 'سُجّلت قبل التزام البناء، وملفات المصدر المبني لم تتغير بعدها.' };
  }
  const files = countFiles(changed.length);
  return {
    current: false,
    checks: `${at} **لا على التزام البناء**: تغيّر بعده ${files} من ملفات المصدر المبني، ${redo}`,
    live: `**سُجّلت قبل هذا البناء**، وتغيّر بعدها ${files} من ملفات المصدر المبني، فلا تغطي هذه الشيفرة: أعد المتأثر منها قبل الرفع.`,
  };
}

/** «ملف واحد» و«ملفان» و«3 ملفات» و«11 ملفًا». */
function countFiles(n) {
  if (n === 1) return 'ملف واحد';
  if (n === 2) return 'ملفان';
  return n <= 10 ? `${n} ملفات` : `${n} ملفًا`;
}
