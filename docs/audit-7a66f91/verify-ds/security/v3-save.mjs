// تحقق مستقل (TJ-38 وDS-S6): validateSaveFile وisValidFolderName وdownloadTarget، وهل تصل أسماء المنتج إلى المحجوز.
// دوال خالصة، بلا متصفح ولا تنزيل.
// تشغيل: command node v3-save.mjs
import { TJ_ROOT as TJ } from '../../verify/_root.mjs';
const { validateSaveFile, downloadTarget, SAVE_LIMITS } = await import(`${TJ}/src/core/save/index.js`);
const { isValidFolderName } = await import(`${TJ}/src/core/model/prefs.js`);
const { fileName } = await import(`${TJ}/src/core/export/names.js`);
const { isVideoId } = await import(`${TJ}/src/core/model/ids.js`);

const show = (s) => [...s].map((c) => { const cp = c.codePointAt(0); return cp > 0x7e || cp < 0x20 ? `U+${cp.toString(16).toUpperCase().padStart(4, '0')}` : c; }).join('');
console.log('=== 1) validateSaveFile ===');
for (const n of ['CON.srt', 'con.txt', 'NUL.json', 'AUX.md', 'PRN.srt', 'COM1.srt', 'LPT9.txt', 'COM¹.srt', 'CONIN$.srt', 'ㅤ.srt', 'ᅟᅠ.srt', 'a️.srt', 'a​.srt', 'a‮.srt', `${'ع'.repeat(146)}.srt`, 'Y-rmzh0PI3c.ar.srt']) {
  const r = validateSaveFile({ name: n, text: 'x' });
  console.log(JSON.stringify({ name: show(n).slice(0, 40), chars: n.length, utf8Bytes: Buffer.byteLength(n), ok: r.ok, code: r.code ?? null }));
}
console.log(JSON.stringify({ maxNameChars: SAVE_LIMITS.maxNameChars }));

console.log('\n=== 2) isValidFolderName (اسم يكتبه المستخدم في الإعدادات) ===');
for (const f of ['Tarjuman', 'CON', 'con.txt', 'COM1', 'CONIN$', 'CONOUT$', 'clock$', 'COM¹', 'LPT²', 'ㅤ', 'a..b', 'a‮b', 'ترجمان']) {
  console.log(JSON.stringify({ folder: show(f), ok: isValidFolderName(f), target: isValidFolderName(f) ? downloadTarget({ mode: 'subfolder', folder: f }, 'x.srt').filename : null }));
}

console.log('\n=== 3) هل يصل اسم منتج إلى المحجوز؟ fileName يشترط معرّفًا من 11 محرفًا ===');
const tries = [];
for (const id of ['CON', 'CON.srt', 'CONxxxxxxxx', 'NULabcdefgh']) {
  try { tries.push({ id, isVideoId: isVideoId(id), name: fileName({ videoId: id, lang: 'ar' }) }); } catch (e) { tries.push({ id, isVideoId: isVideoId(id), threw: e.code ?? e.message }); }
}
console.log(JSON.stringify(tries));
console.log(JSON.stringify({ reservedBaseOfProductName: /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i.test('CONxxxxxxxx.ar.srt'.split('.')[0]) }));
