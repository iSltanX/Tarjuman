// تطبيع النص للثوابت: NFC وتوحيد المسافات فقط، دون تغيير الحالة أو حذف ترقيم. ومنذ 2.0.0 (AA1، حرية اللغات) بلا افتراض أن
// الكلمات تُفصل بالمسافات: حروف الصينية واليابانية والتايلاندية واللاوية والخميرية والميانمارية تُكتب متصلة، فكل حرف منها
// وحدة في الثوابت، ولا تُدرج مسافة بينها عند الوصل.

/** حرف من نص لا يفصل كلماته بالمسافات، وترقيم الكتابة الشرقية الكاملة العرض. */
const NO_SPACE_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\u3000-\u303F\uFF00-\uFF65]/u;
const NO_SPACE_END = new RegExp(`${NO_SPACE_CHAR.source}$`, 'u');
const NO_SPACE_START = new RegExp(`^${NO_SPACE_CHAR.source}`, 'u');
const NO_SPACE_SPLIT = new RegExp(`(${NO_SPACE_CHAR.source})`, 'u');
/** هل في النص حرف من نص لا يفصل بالمسافات. @param {string} text */
export const hasNoSpaceScript = (text) => NO_SPACE_CHAR.test(String(text));

/**
 * وحدات النص للثوابت: الكلمات بين المسافات، وكل حرف من نص لا يفصل بالمسافات وحدة وحده (فوصل «今日は» و«いい» بلا مسافة لا
 * يغيّر الوحدات). والنص اللاتيني والعربي كما كان قبل 2.0.0 تمامًا.
 * @param {string} text
 */
export function splitWords(text) {
  const n = String(text).normalize('NFC').trim();
  if (n === '') return [];
  const words = n.split(/\s+/u);
  if (!NO_SPACE_CHAR.test(n)) return words;
  return words.flatMap((w) => (NO_SPACE_CHAR.test(w) ? w.split(NO_SPACE_SPLIT).filter((x) => x !== '') : [w]));
}

/**
 * وصل أجزاء نص بمسافة، إلا بين حرفين من نص لا يفصل بالمسافات فبلا مسافة.
 * @param {string[]} parts
 */
export function joinWords(parts) {
  let out = '';
  for (const p of parts) {
    if (p === '') continue;
    out = out === '' ? p : `${out}${NO_SPACE_END.test(out) && NO_SPACE_START.test(p) ? '' : ' '}${p}`;
  }
  return out;
}

/** @param {string} text */
export function normalizeSpace(text) {
  return String(text).normalize('NFC').replace(/\s+/gu, ' ').trim();
}

/**
 * ينظّف نص مقطع يدوي للكتابة في SRT: يقصّ كل سطر ويوحّد المسافات داخله ويحذف الأسطر الفارغة.
 * لا يحذف أي كلمة.
 * @param {string} text
 */
export function cleanCueText(text) {
  return String(text)
    .split('\n')
    .map((l) => l.replace(/[^\S\n]+/gu, ' ').trim())
    .filter((l) => l !== '')
    .join('\n');
}

/**
 * يلفّ نصًا إلى أسطر لا تتجاوز lineChars حيث أمكن، بسطرين متوازنين إن كفيا.
 * @param {string} text نص بلا أسطر جديدة
 * @param {number} lineChars
 */
export function wrapLines(text, lineChars) {
  if (text.length <= lineChars) return text;
  if (NO_SPACE_CHAR.test(text)) return wrapUnits(text, lineChars);
  const words = text.split(' ');
  // سطران متوازنان: أقرب فاصل إلى المنتصف يُبقي السطرين ضمن الحد. طول الشطر الأول بمجموع تراكمي (تدقيق 7a66f91،
  // U77: كان يُبنى الشطران عند كل فاصل فتصير الكلفة تربيعية)، والأول بأدنى فرق يفوز كما كان.
  let bestAt = -1;
  let bestScore = Infinity;
  let aLen = -1;
  for (let i = 1; i < words.length; i++) {
    aLen += words[i - 1].length + 1;
    const bLen = text.length - aLen - 1;
    if (aLen > lineChars) break;
    if (bLen <= lineChars) {
      const score = Math.abs(aLen - bLen);
      if (score < bestScore) {
        bestScore = score;
        bestAt = aLen;
      }
    }
  }
  if (bestAt >= 0) return `${text.slice(0, bestAt)}\n${text.slice(bestAt + 1)}`;
  // وإلا لفّ جشع (كلمة أطول من الحد تأخذ سطرًا وحدها).
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line === '') line = w;
    else if (line.length + 1 + w.length <= lineChars) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line !== '') lines.push(line);
  return lines.join('\n');
}

/** هل يجوز كسر ملتصق بين الجزء السابق والتالي: التالي يبدأ بحرف أساسي من نص لا يفصل بالمسافات، والسابق ينتهي بحرف منه أو بعلامة. */
function breakableBefore(prev, next) {
  const first = String.fromCodePoint(next.codePointAt(0));
  const last = String.fromCodePoint(Array.from(prev).pop().codePointAt(0));
  return NO_SPACE_CHAR.test(first) && !/^\p{M}/u.test(first) && (NO_SPACE_CHAR.test(last) || /^\p{M}/u.test(last));
}

/**
 * لفّ نص فيه حروف لا تُفصل بالمسافات (AA1): كل حرف منها وحدة قابلة للكسر بلا مسافة، والكلمات الأخرى كما هي، بسطرين متوازنين
 * إن كفيا وإلا لفّ جشع. لا يُشطر زوج بديل لأن الوحدات محارف كاملة.
 * @param {string} text @param {number} lineChars
 */
function wrapUnits(text, lineChars) {
  const units = [];
  for (const w of text.split(' ')) {
    const parts = NO_SPACE_CHAR.test(w) ? w.split(NO_SPACE_SPLIT).filter((x) => x !== '') : [w];
    parts.forEach((p, i) => {
      // الكسر الملتصق لا يُقبل إلا بين حرفين من نص لا يفصل بالمسافات، ولا قبل علامة (حركة أو داكوتين)؛ وإلا التحم الجزء بسابقه
      // فلا يبدأ سطر بحركة يتيمة ولا يُفصل «2026» عن «年» (AV2 U-003).
      const prev = units[units.length - 1];
      if (i > 0 && !breakableBefore(prev.text, p)) prev.text += p;
      else units.push({ text: p, glue: i > 0 });
    });
  }
  const join = (list) => list.reduce((s, u) => (s === '' ? u.text : `${s}${u.glue ? '' : ' '}${u.text}`), '');
  const total = join(units);
  let best = -1;
  let bestScore = Infinity;
  for (let i = 1; i < units.length; i++) {
    const a = join(units.slice(0, i));
    if (a.length > lineChars) break;
    const b = join(units.slice(i).map((u, k) => (k === 0 ? { ...u, glue: false } : u)));
    if (b.length <= lineChars && Math.abs(a.length - b.length) < bestScore) {
      bestScore = Math.abs(a.length - b.length);
      best = i;
    }
  }
  if (best >= 0) return `${join(units.slice(0, best))}\n${join(units.slice(best).map((u, k) => (k === 0 ? { ...u, glue: false } : u)))}`;
  const lines = [];
  let line = [];
  for (const u of units) {
    const next = join([...line, u]);
    if (line.length && next.length > lineChars) {
      lines.push(join(line));
      line = [{ ...u, glue: false }];
    } else line.push(u);
  }
  if (line.length) lines.push(join(line));
  return lines.length ? lines.join('\n') : total;
}

// نهاية الجملة بعلامات اللغات المختلفة (AA1): النقطة والاستفهام والتعجب، والاستفهام العربي، والنقطة الأردية «۔» (U+06D4)، والنقطة الصينية واليابانية وعلامتاها
// كاملتا العرض، والدنده الهندية، والأرمنية والحبشية، وربما بعدها إغلاق اقتباس أو قوس بأنواعه.
export const SENTENCE_END = /[.?!؟۔。！？।॥։።]["'”’»)\]」』）]*$/u;

/**
 * هل ينتهي النص بنهاية جملة (نقطة أو علامة استفهام أو تعجب بأي لغة، وربما بعدها إغلاق اقتباس أو قوس)؟
 * @param {string} text
 */
export const endsSentence = (text) => SENTENCE_END.test(String(text).trimEnd());
