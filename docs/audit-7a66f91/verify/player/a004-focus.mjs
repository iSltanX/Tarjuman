// TJ-AUD-004a/b: لا حصر لـTab ولا إغلاق عند خروج التركيز، وEscape بعد الخروج يغلق دون إعادة التركيز إلى زر الشريط.
import { readFileSync } from 'node:fs';
import { TJ, imp, settleN, log } from './common.mjs';
const H = await imp('test/unit/player/controls/harness.js');

// (أ) هل في أدوات الشريط أي معالجة لـTab أو focusout يغلق القائمة؟
for (const f of ['layer.js', 'session.js', 'group.js', 'menus.js']) {
  const src = readFileSync(`${TJ}/src/player/controls/${f}`, 'utf8');
  log(`${f}: 'Tab'=${/['"]Tab['"]/.test(src)} focusout=${(src.match(/focusout/g) ?? []).length} (focusout يُستعمل لـdata-typing وحده)`);
}

// (ب) قائمة التوقيت بلوحة المفاتيح ثم «Tab» إلى عنصر يوتيوب بعدها (محاكاة انتقال التركيز)، والشريط ظاهر
const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
const { ui, env } = page;
const outside = env.doc.createElement('button');
outside.id = 'yt-below-player';
env.doc.body.appendChild(outside);
H.click(ui.btn('badge'), 0); // detail 0 = لوحة المفاتيح
await settleN(2);
const root = ui.layerHost().shadowRoot;
log('بعد الفتح بلوحة المفاتيح: المركّز داخل القائمة =', root.activeElement?.getAttribute('data-fid'), '| دور القائمة', ui.menu().getAttribute('role'));
outside.focus(); // ما يفعله Tab من آخر عنصر في القائمة (المضيف آخر أبناء المشغّل)
page.controller.set({}); // أي تحديث حالة يعيد العرض
await settleN(2);
log('بعد خروج التركيز والشريط ظاهر: القائمة مفتوحة؟', ui.menuOpen(), '| document.activeElement =', env.doc.activeElement.id);
// Escape الآن
outside.dispatchEvent({ type: 'keydown', key: 'Escape', bubbles: true });
await settleN(2);
log('بعد Escape: القائمة مفتوحة؟', ui.menuOpen(), '| التركيز عاد إلى زر الشارة؟', env.doc.activeElement === ui.groupHost(), '| document.activeElement =', env.doc.activeElement.id || env.doc.activeElement.tagName);

// (ج) المقارنة: Escape والتركيز داخل القائمة يعيده إلى الزر
H.click(ui.btn('badge'), 0);
await settleN(2);
root.activeElement.dispatchEvent({ type: 'keydown', key: 'Escape', bubbles: true });
await settleN(2);
const gRoot = ui.groupHost().shadowRoot;
log('Escape من داخل القائمة: مغلقة؟', !ui.menuOpen(), '| التركيز على زر:', gRoot.activeElement?.getAttribute('data-kind'));

// (د) خروج التركيز ثم اختفاء الشريط: تُغلق القائمة (تخفيف قائم)
H.click(ui.btn('badge'), 0);
await settleN(2);
outside.focus();
page.player.classList.add('ytp-autohide');
env.win.advance(600);
await settleN(2);
log('بعد خروج التركيز ثم اختفاء الشريط: القائمة مفتوحة؟', ui.menuOpen());
