// محاكاة معالج src/dev/harness-bridge.js في Node بنافذة وهمية: سكربت «في الصفحة» (العالم الرئيسي) يرسل طلبات مسمّاة
// ويقرأ الردود. البيانات اصطناعية. لا متصفح ولا شبكة. الاستعمال: command node s6-harness-bridge.mjs <جذر النسخة>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const listeners = [];
const received = [];
const win = {
  addEventListener: (k, fn) => { if (k === 'message') listeners.push(fn); },
  postMessage: (data, target) => { received.push({ data, target }); },
};
globalThis.window = win;
const cues = [1, 2, 3].map((n) => ({ n, text: `synthetic-private-cue-${n}` }));
globalThis.__tarjuman = {
  controller: { getState: () => ({ videoId: 'SYNTHETIC01', title: 'synthetic title', loading: false, captured: [], activeSlot: 1, view: 'ar',
    arabic: { cues, fileName: 'synthetic-private-name.ar.srt', edited: true }, english: null }) },
  mounted: { overlay: { state: 'on', peek: () => ({ lines: [{ text: 'synthetic-on-screen-line' }] }) }, controls: { state: 'on', peek: () => ({}) }, panel: null },
};
await import(pathToFileURL(path.join(root, 'src/dev/harness-bridge.js')));
const ask = async (op, args = [], source = win) => {
  received.length = 0;
  for (const fn of listeners) await fn({ source, origin: 'https://www.youtube.com', data: { source: 'tarjuman-harness', op, args, id: 'page-script' } });
  return received[0] ?? null;
};
const st = await ask('state');
console.log('state →', JSON.stringify(st.data.value.arabic), 'target:', st.target);
const all = [];
for (let n = 1; n <= st.data.value.arabic.count; n++) all.push((await ask('cueText', [n])).data.value);
console.log('cueText 1..count →', JSON.stringify(all));
console.log('overlay →', JSON.stringify((await ask('overlay')).data.value));
console.log('unknown op →', JSON.stringify(await ask('__proto__')));
console.log('from other source (iframe) →', JSON.stringify(await ask('cueText', [1], {})));
console.log('listeners registered:', listeners.length);
