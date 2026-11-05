// TJ-AUD-022: (أ) ربط حقلَي splitSize وstepInput برسالة الخطأ؛ (ب) أسماء الملفات بلا عزل اتجاه؛ (ج) editor/search.js:82؛ (د) editor/text.js:125.
import { readFileSync } from 'node:fs';
import { TJ, imp, settleN, log } from './common.mjs';
const H = await imp('test/unit/player/controls/harness.js');
const P = await imp('test/unit/player/panel/harness.js');
const { downloadedLine } = await imp('src/player/controls/text.js');
const { saveMessage, refOptionLabel } = await imp('src/pages/editor/text.js');

// (أ-1) splitSize في قائمة التحميل بخطأ ظاهر
const page = H.mountPage({ state: H.makeState({ arabic: H.arabic(), captured: [H.trackInfo()] }) });
H.click(page.ui.btn('download'), 0);
await settleN(2);
H.click(page.ui.item('خيارات احتياطية'), 0);
await settleN(2);
const split = page.ui.field('split');
split.checked = true;
split.dispatchEvent({ type: 'change', bubbles: true, target: split });
await settleN(2);
const size = page.ui.field('splitSize');
size.value = '7';
size.dispatchEvent({ type: 'input', bubbles: true });
H.click(page.ui.item('تنزيل الملف'), 0);
await settleN(4);
const sizeNow = page.ui.field('splitSize');
const err = page.ui.menu().querySelectorAll('div').find((d) => d.className === 'field-error');
log('(أ-1) splitSize:', JSON.stringify({ invalid: sizeNow.getAttribute('aria-invalid'), describedby: sizeNow.getAttribute('aria-describedby'), label: sizeNow.getAttribute('aria-label'), errId: err?.getAttribute('id') ?? null, errText: err?.textContent }));
const lab = page.ui.menu().querySelectorAll('label').find((l) => l.textContent === 'مقاطع لكل جزء');
log('(أ-1) <label> مرئي مرتبط بـfor؟', lab?.getAttribute('for') ?? null, '| مقابل حقل الإزاحة: aria-describedby="tj-offset-error" (menus.js:424)');

// (أ-2) stepInput في تذييل اللوحة
const pp = P.watchPage();
pp.mount();
await settleN(3);
const u = P.ui(pp);
const stepSegs = u.q('.foot').querySelectorAll('[role="radio"]');
P.click(stepSegs.find((b) => b.getAttribute('data-v') === 'custom'));
await settleN(2);
const step = u.q('input.num');
step.value = '0.05';
step.dispatchEvent({ type: 'change', target: step });
await settleN(3);
const stepErr = u.q('.foot').querySelectorAll('div').find((d) => d.className === 'field-error');
log('(أ-2) stepInput:', JSON.stringify({ invalid: step.getAttribute('aria-invalid'), describedby: step.getAttribute('aria-describedby'), errHidden: stepErr.hasAttribute('hidden'), errId: stepErr.getAttribute('id'), errText: stepErr.textContent }));

// (ب) أسماء الملفات: معرّف يبدأ بشرطة أو شرطة سفلية
const name = '-xyz1234567.en.manual.normal.srt';
const line = downloadedLine(name);
log('(ب) downloadedLine:', JSON.stringify(line), '| فيه LRI/PDI؟', /[⁦⁩]/.test(line));
const msg = saveMessage({ ok: true, mode: 'subfolder' }, name, { mode: 'subfolder', folder: 'Tarjuman' }, (c) => c);
log('(ب) saveMessage:', JSON.stringify(msg.text), '| فيه LRI/PDI؟', /[⁦⁩]/.test(msg.text));
const fail = saveMessage({ ok: false, code: 'SV_FAILED' }, name, undefined, () => 'تعذّر الحفظ.');
log('(ب) saveMessage (فشل):', JSON.stringify(fail.text));
const css = (await imp('src/player/controls/styles.js')).layerCss();
log('(ب) CSS سطر النتيجة:', css.match(/\.line \{[^}]*\}/)[0].slice(0, 80), '…', css.match(/\.line__text \{[^}]*\}/)[0]);

// (ج) editor/search.js:82 و(د) editor/text.js:125
const s = readFileSync(`${TJ}/src/pages/editor/search.js`, 'utf8').split('\n');
log('(ج) search.js:82:', s[81].trim(), '| اللوحة التي يفتحها: role=', /role: 'group', 'aria-label': 'خيارات البحث'/.test(s.join('\n')) ? 'group' : '?');
log('(د) refOptionLabel(3, "Draft-2 (v)"):', JSON.stringify(refOptionLabel(3, 'Draft-2 (v)')), '| فيه عزل؟', /[⁦-⁩]/.test(refOptionLabel(3, 'x')));
