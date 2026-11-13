#!/usr/bin/env node
// يحفظ أجسام json3 حقيقية ملتقطة حيًا عينات في test/fixtures/json3/ مع فهرسها والقيم المتوقعة.
// الجسم يُحفظ كما التقطته الإضافة بعد التأكد من خلوه من الروابط والرموز؛ لا تعديل لمحتواه.
// لا يفتح متصفحًا: يقرأ جسمًا محفوظًا (رد timedtext بصيغة json3 من جلسة عادية)، ويطلبه دليل الصيانة §٤ عند تغيّر الصيغة.
// أُعيد في تحقق الجولة الثانية (ح-31) بعد حذفه مع السكربتات الميتة، ومعه رفض المعاملات الناقصة (كان يكتب null.json) و--lang.
//   node test/live/p1/make-fixtures.mjs <ملف.json> --id <videoId> --kind manual|asr --name <اسم> --duration-ms <ms>
//     [--lang en] [--browser brave] [--title "<العنوان>"] [--channel "<القناة>"] [--license "<الترخيص>"]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import { convertTrack } from '../../../src/core/convert/index.js';
import { sha256 } from '../harness/netlog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'test/fixtures/json3');
const argv = process.argv.slice(2);
const val = (k) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : null);

const trackKind = val('kind');
const durationMs = Number(val('duration-ms'));
const problems = [
  !argv[0] || argv[0].startsWith('--') ? 'مسار الجسم أولًا' : null,
  /^[\w-]{11}$/.test(val('id') ?? '') ? null : '--id معرّف فيديو من 11 محرفًا',
  trackKind === 'manual' || trackKind === 'asr' ? null : '--kind manual أو asr',
  /^[\w.-]+$/.test(val('name') ?? '') ? null : '--name اسم ملف بلا مسار',
  Number.isInteger(durationMs) && durationMs > 0 ? null : '--duration-ms مدة الفيديو بالملي ثانية',
].filter(Boolean);
if (problems.length) {
  console.error(`make-fixtures: ${problems.join('، ')}`);
  process.exit(2);
}

const body = await readFile(argv[0], 'utf8');
const leaks = findSecrets(body);
if (leaks.length) throw new Error(`العينة فيها ${leaks.length} نمط حساس؛ لم تُحفظ`);
const r = convertTrack({ body, trackKind, durationMs });
if (!r.ok) throw new Error(`التحويل فشل: ${r.code}`);

const file = `${val('name')}.json`;
await mkdir(DIR, { recursive: true });
await writeFile(path.join(DIR, file), body);
const indexPath = path.join(DIR, 'index.json');
let index;
try {
  index = JSON.parse(await readFile(indexPath, 'utf8'));
} catch {
  index = { note: 'عينات json3 حقيقية ملتقطة حيًا في P1 من استجابة مشغّل يوتيوب نفسه، بلا أي رابط أو رمز.', fixtures: [] };
}
index.fixtures = index.fixtures.filter((f) => f.file !== file);
index.fixtures.push({
  file, videoId: val('id'), trackKind, lang: val('lang') ?? 'en', browser: val('browser'), capturedAt: new Date().toISOString().slice(0, 10),
  durationMs, source: { title: val('title'), channel: val('channel'), license: val('license') },
  bodySha256: sha256(body), bodyChars: body.length,
  expected: { cues: r.report.cueCount, words: r.report.sourceWords, duplicatesRemoved: r.report.duplicatesRemoved, textEvents: r.report.stats.textEvents },
});
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(`حُفظت ${file}: ${r.report.cueCount} مقطعًا، ${r.report.sourceWords} كلمة، مكرر ${r.report.duplicatesRemoved}، اكتمال ${r.report.completeness}`);
