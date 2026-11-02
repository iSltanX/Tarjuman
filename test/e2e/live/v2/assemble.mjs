#!/usr/bin/env node
// تجميع ترجمة النموذج الخارجي (P15، كعيّنتي P9): النموذج يكتب النص وحده سطرًا لكل مقطع «N|النص» (و« // » فاصل سطرين داخل
// المقطع)، والأرقام وسطور التوقيت تُنسخ من الملف الإنجليزي المرفق حرفيًا. يرفض نقصًا أو تكرارًا أو رقمًا خارج الأصل أو نصًا
// فارغًا، فلا يُصنع ملف «سليم» من ناتج ناقص. الأجزاء تُقرأ بترتيب أسمائها.
//   command node test/e2e/live/v2/assemble.mjs <الملف الإنجليزي> <ملف عربي ناتج> <جزء1> [<جزء2> …]
import { readFile, writeFile } from 'node:fs/promises';
import { parseSrtStrict } from '../../../../src/core/srt/parser.js';
import { formatSrtTime } from '../../../../src/core/srt/time.js';

export function assemble(englishText, lines) {
  const en = parseSrtStrict(englishText);
  const byN = new Map();
  for (const [i, raw] of lines.entries()) {
    if (!raw.trim()) continue;
    const m = /^(\d+)\|(.*)$/.exec(raw);
    if (!m) throw new Error(`سطر ${i + 1} بلا «N|»`);
    const n = Number(m[1]);
    const text = m[2].split(' // ').map((x) => x.trim()).filter(Boolean).join('\n');
    if (byN.has(n)) throw new Error(`المقطع ${n} مكرر`);
    if (!text) throw new Error(`المقطع ${n} فارغ`);
    byN.set(n, text);
  }
  const missing = en.filter((c) => !byN.has(c.n)).map((c) => c.n);
  const extra = [...byN.keys()].filter((n) => !en.some((c) => c.n === n));
  if (missing.length || extra.length) throw new Error(`ناقص ${missing.slice(0, 10).join(',')} · زائد ${extra.slice(0, 10).join(',')}`);
  return en.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${byN.get(c.n)}\n`).join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [enFile, out, ...parts] = process.argv.slice(2);
  const lines = (await Promise.all(parts.sort().map((p) => readFile(p, 'utf8')))).join('\n').split('\n');
  const text = assemble(await readFile(enFile, 'utf8'), lines);
  await writeFile(out, text);
  console.log(`${out}: ${parseSrtStrict(text).length} مقطعًا`);
}
