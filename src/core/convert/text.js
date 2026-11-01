// تطبيع النص للثوابت: NFC وتوحيد المسافات فقط، دون تغيير الحالة أو حذف ترقيم.

/** @param {string} text */
export function splitWords(text) {
  const n = String(text).normalize('NFC').trim();
  return n === '' ? [] : n.split(/\s+/u);
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
  const words = text.split(' ');
  // سطران متوازنان: أقرب فاصل إلى المنتصف يُبقي السطرين ضمن الحد.
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    if (a.length <= lineChars && b.length <= lineChars) {
      const score = Math.abs(a.length - b.length);
      if (best === null || score < best.score) best = { score, text: `${a}\n${b}` };
    }
  }
  if (best) return best.text;
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
