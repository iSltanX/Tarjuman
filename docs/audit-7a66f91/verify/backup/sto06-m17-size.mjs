// STO-06 وM-17: حد الحفظ (256 Mi وحدة UTF-16، save/index.js) مقابل حد القراءة (512 MiB بايت، backup/format.js).
// بحدّين مصغّرين بالنسبة نفسها (÷1024) فلا يُنشأ ملف كبير، وبأنواع نصوص مختلفة لقياس بايت/وحدة.
import { constants } from 'node:buffer';
import { IDS, backup, load, mountSettings, newStore, noPause, out, sampleBundle, section, seedBundle, settle, textOf } from './_h.mjs';

const { createBackup, readBackup } = backup;
const { validateSaveFile, SAVE_LIMITS } = await load('src/core/save/index.js');
const { BACKUP_LIMITS } = await load('src/core/backup/format.js');
const { messageFor } = await load('src/core/errors/index.js');

const DIV = 1024;
// بعد C7 (U55، Q28) حد الحفظ من الصفحات بالبايت (maxPageBytes) وهو حد القراءة؛ وقبلها بوحدات UTF-16 (maxPageChars).
const BYTES = SAVE_LIMITS.maxPageBytes !== undefined;
const saveCap = (BYTES ? SAVE_LIMITS.maxPageBytes : SAVE_LIMITS.maxPageChars) / DIV;
const saveOpts = () => (BYTES ? { maxBytes: saveCap } : { maxChars: saveCap });
const readCap = BACKUP_LIMITS.maxBytes / DIV;
out('limits', { saveUnit: BYTES ? 'bytes' : 'utf16', maxPage: BYTES ? SAVE_LIMITS.maxPageBytes : SAVE_LIMITS.maxPageChars, maxBytes: BACKUP_LIMITS.maxBytes, v8MaxStringLength: constants.MAX_STRING_LENGTH, scaled: { saveCap, readCap } });

const KINDS = {
  ascii: 'a',
  arabicLetters: 'م',            // U+0645: بايتان في UTF-8
  arabicPresentation: 'ﻣ',  // ﻣ U+FEE3: ثلاثة بايتات
  cjk: '訳',                     // U+8A33: ثلاثة بايتات
};
async function libraryOf(ch, cues, perCue) {
  const { store } = newStore();
  const b = sampleBundle({ videoId: IDS[0] });
  b.slots[1].track.original = Array.from({ length: cues }, (_, i) => ({ n: i + 1, startMs: i * 1000, endMs: i * 1000 + 800, text: ch.repeat(perCue) }));
  await seedBundle(store, b);
  return createBackup({ store, appVersion: '1.1.0', pause: noPause });
}
for (const [kind, ch] of Object.entries(KINDS)) {
  // مكتبة تقارب حد الحفظ المصغّر من تحته (≈ 95٪ منه).
  const file = await libraryOf(ch, 380, 600);
  const units = file.text.length;
  const bytes = new Blob([file.text]).size;
  const save = validateSaveFile({ name: file.name, text: file.text }, saveOpts());
  const read = await readBackup(new Blob([file.text]), { maxBytes: readCap, pause: noPause });
  out(`scaled-${kind}`, { units, bytes, bytesPerUnit: +(bytes / units).toFixed(3), passesSave: save.ok, saveCode: save.code ?? null, readOk: read.ok, readCode: read.code ?? null });
}

// الحدّان الفعليان حسابيًا: أكبر ملف يجتاز الحفظ = 256 Mi وحدة × (بايت/وحدة)؛ يتجاوز 512 MiB فقط إن زادت النسبة على 2.
const MiB = 1024 * 1024;
for (const r of [1.0, 1.42, 2.0, 2.01, 2.5, 3.0]) {
  const maxFileBytes = BYTES ? SAVE_LIMITS.maxPageBytes : SAVE_LIMITS.maxPageChars * r;
  out('full-scale', { bytesPerUnit: r, maxSavableMiB: +(maxFileBytes / MiB).toFixed(1), rejectedByReader: maxFileBytes > BACKUP_LIMITS.maxBytes });
}

// M-17 (الرسالة): مكتبة فوق حد الحفظ في صفحة الإعدادات → رمز SV_TOO_LARGE ونصه كما يظهر.
{
  const { store, area } = newStore();
  const b = sampleBundle({ videoId: IDS[0] });
  b.slots[1].track.original = Array.from({ length: 400 }, (_, i) => ({ n: i + 1, startMs: i * 1000, endMs: i * 1000 + 800, text: 'a'.repeat(800) }));
  await seedBundle(store, b);
  const m = await mountSettings({ store, area, env: { saveFile: async (f) => { const v = validateSaveFile(f, saveOpts()); return v.ok ? { ok: true, mode: 'downloads', downloadId: 1 } : { ok: false, code: v.code }; } } });
  const sec = section(m, 'البيانات');
  [...sec.descendants()].find((e) => e.tagName === 'button' && e.textContent.includes('إنشاء نسخة احتياطية')).click();
  await settle(15);
  const t = textOf(sec);
  out('sv-too-large-ui', { message: messageFor('SV_TOO_LARGE'), shown: t.includes(messageFor('SV_TOO_LARGE')), backupCodeShown: /أكبر من أن تُنسخ في ملف واحد/.test(t) });
}
