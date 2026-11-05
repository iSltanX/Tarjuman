// L-17: إخفاق إغلاق اللوحة/«متابعة النص الأصلي» صامت. L-27: النقر بعد تحديد نص داخل الصف يقفز بالفيديو.
// L-14: لا lang في أسطح المشغّل. CL-X2: سطر الحالة flex مع text-overflow.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { TJ, imp, settleN, log } from './common.mjs';
const P = await imp('test/unit/player/panel/harness.js');

// L-17
for (const what of ['close', 'dual']) {
  const p = P.watchPage({ controllerOpts: { prefsFail: true }, state: P.makeState({ english: P.english() }) });
  p.mount();
  await settleN(3);
  const u = P.ui(p);
  if (what === 'close') P.click(u.q('.head').querySelectorAll('button').at(-1));
  else P.click(u.segs()[1]);
  await settleN(5);
  const d = p.handle.diagnostics().session;
  const visibleAlerts = u.qa('[role="alert"]').filter((e) => !e.hasAttribute('hidden') && !e.parentNode?.hasAttribute?.('hidden'));
  log(`L-17 (${what}) مع فشل updatePrefs: الوضع=${u.host.getAttribute('data-mode')} | تنبيهات ظاهرة=${visibleAlerts.length} | رسالة=${!u.q('.toast').hasAttribute('hidden')} | التشخيص actionFailures=${d.actionFailures} lastCode=${d.lastCode}`);
}

// L-27: النقر على نص الصف (لا على الزمن) يقفز؛ ولا فحص لتحديد نص
const p2 = P.watchPage();
p2.mount();
await settleN(3);
const u2 = P.ui(p2);
const ar = u2.rows()[2].querySelector('.ar');
p2.video.writes.length = 0;
P.click(ar);
await settleN(2);
log('L-27: النقر على .ar في الصف 2 كتب currentTime =', JSON.stringify(p2.video.writes));
const trSrc = readFileSync(`${TJ}/src/player/panel/transcript.js`, 'utf8');
log('L-27: هل يفحص المستمع getSelection أو isCollapsed؟', /getSelection|isCollapsed|selection/i.test(trSrc));
const css = (await imp('src/player/panel/styles.js')).panelCss();
log('L-27: user-select في الورقة؟', /user-select/.test(css), '| .row cursor:', /\.row \{[^}]*cursor: pointer/.test(css));

// L-14: lang في src/player كله
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : [`${d}/${f}`]));
const hits = walk(`${TJ}/src/player`).filter((f) => f.endsWith('.js')).flatMap((f) => readFileSync(f, 'utf8').split('\n').map((l, i) => [f.replace(`${TJ}/`, ''), i + 1, l]).filter(([, , l]) => /['"]lang['"]\s*[:,]|setAttribute\(\s*['"]lang|\.lang\s*=|\blang=/.test(l)));
log('L-14: إسناد سمة lang في src/player:', hits.length, JSON.stringify(hits.map(([f, n]) => `${f}:${n}`)));

// CL-X2
const status = css.match(/\.status \{[^}]*\}/)[0];
log('CL-X2:', status);
const sv = readFileSync(`${TJ}/src/player/panel/view.js`, 'utf8').split('\n');
log('CL-X2: أبناء .status (view.js:283-286):', sv.slice(282, 286).map((l) => l.trim()).join(' '));
