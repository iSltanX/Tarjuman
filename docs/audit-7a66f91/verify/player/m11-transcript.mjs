// M-11 / TJ-AUD-015 / E-2 / CDX-N1: محطات Tab في لوحة النص، واسم الوصول، والتتبّع مع التركيز، والبناء التزامني للصفوف.
import { readFileSync } from 'node:fs';
import { TJ, imp, settleN, log } from './common.mjs';
const P = await imp('test/unit/player/panel/harness.js');
const { createTranscript } = await imp('src/player/panel/transcript.js');
const { createFakeEnv } = await imp('test/unit/player/overlay/fake-dom.js');
const { makeCues } = await imp('test/helpers/fixtures.js');

// (1) محطات Tab واسم الوصول
const page = P.watchPage({ state: P.makeState({ arabic: { cues: P.arCues(2000), edited: false, fileName: 'x.srt', comparison: null } }) });
page.mount();
await settleN(3);
const u = P.ui(page);
const rows = u.rows();
const timeBtns = u.qa('.t');
const tabbable = timeBtns.filter((b) => b.tagName === 'button' && b.getAttribute('tabindex') !== '-1');
log('الصفوف:', rows.length, '| أزرار الزمن في ترتيب Tab:', tabbable.length, '| أي roving tabindex؟', timeBtns.some((b) => b.hasAttribute('tabindex')));
const r5 = rows[5];
log('الصف 5: دوره', r5.getAttribute('role'), '| زره:', JSON.stringify({ tag: r5.children[0].tagName, label: r5.children[0].getAttribute('aria-label'), describedby: r5.children[0].getAttribute('aria-describedby') }), '| نص الصف (ليس في الاسم):', r5.children[1].textContent);
const footBtns = u.q('.foot').querySelectorAll('button');
log('أزرار التذييل بعد القائمة في ترتيب DOM:', footBtns.length, '| رابط تخطٍّ إلى التذييل؟', u.qa('a').length > 0 || !!u.q('[data-skip]'));

// (2) التتبّع لا يتوقف بالتركيز داخل القائمة
const list = u.list;
P.layoutList(list, { rowH: 50, viewH: 400 });
page.video.tickTo(2.0);
await settleN(2);
const before = list.scrolls.length;
P.key(timeBtns[600], 'Tab');
timeBtns[600].focus();
list.scrollTop = 600 * 50 - 100; // تمرير المتصفح إلى العنصر المركّز (ليس عجلة ولا مفتاح تمرير)
page.video.tickTo(4.0);
await settleN(2);
log('التتبّع ما زال مفعّلًا بعد التركيز:', u.switchEl.getAttribute('aria-checked'), '| تمريرات برمجية بعد تغيّر المقطع:', JSON.stringify(list.scrolls.slice(before)), '| الصف المركّز أعلاه عند', 600 * 50, 'وscrollTop الآن', list.scrollTop);
const followSrc = readFileSync(`${TJ}/src/player/panel/follow.js`, 'utf8');
log('مستمعو follow.js:', [...followSrc.matchAll(/addEventListener\('(\w+)'/g)].map((m) => m[1]).join(','), '| focusin؟', followSrc.includes('focusin'));

// (3) البناء التزامني: نداء sync واحد يبني كل الصفوف بلا إطار رسم بين الدفعات
const env = createFakeEnv();
let appends = 0;
for (const n of [2400, 8000]) {
  const tr = createTranscript({ doc: env.doc, onSeek: () => {} });
  const orig = tr.list.append.bind(tr.list);
  tr.list.append = (...nodes) => { appends++; return orig(...nodes); };
  const cues = makeCues(n, { text: (i) => `سطر عربي طويل نسبيًا رقم ${i} فيه كلمات عدة` });
  let rafAsked = 0;
  env.win.requestAnimationFrame = () => ++rafAsked;
  appends = 0;
  const t0 = performance.now();
  const out = tr.sync({ cues, originalCues: cues, offsetMs: 0 });
  const ms = performance.now() - t0;
  log(`sync(${n}): rebuilt=${out.rebuilt} الصفوف=${tr.size} نداءات append=${appends} طلبات إطار=${rafAsked} الزمن في Node بالـDOM الوهمي≈${ms.toFixed(1)}ms`);
}
const trSrc = readFileSync(`${TJ}/src/player/panel/transcript.js`, 'utf8').split('\n');
log('transcript.js:110-111 =>', trSrc[109].trim(), '||', trSrc[110].trim());
