// صفحة عيّنة RTL المحلية (P5-AC2): تعرض مكوّن العرض الحقيقي نفسه (createOverlayView، لا نسخة منه) خارج يوتيوب
// فوق «فيديو» داكن، لعيّنة النص المختلط (12 حالة) ثم لتنويعات المظهر. تُبنى بـbuild.mjs وتُلتقط لقطاتها بـshoot.mjs.
import { layoutFor } from '../../../../src/player/overlay/layout.js';
import { splitLines } from '../../../../src/player/overlay/text.js';
import { createOverlayView } from '../../../../src/player/overlay/view.js';
import { SAMPLES } from '../../../unit/player/overlay/samples.js';

const root = document.getElementById('root');
const views = [];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** إطار «مشغّل» بحجم المشغّل الحقيقي، والطبقة الحقيقية فوقه. */
function frame({ title, note, lines, en = [], width = 640, height = 360, appearance = { size: 'm', background: 'soft', position: 'bottom' }, chromeLift = 0 }) {
  const box = el('figure', 'cell');
  box.appendChild(el('figcaption', 'cap', title));
  const player = el('div', 'player');
  player.style.width = `${width}px`;
  player.style.height = `${height}px`;
  if (note) player.appendChild(el('div', 'note', note));
  box.appendChild(player);
  root.lastElementChild.appendChild(box);
  const view = createOverlayView({ doc: document, win: window });
  view.attachTo(player);
  view.setAppearance({ background: appearance.background });
  view.setLayout(layoutFor({ appearance, playerHeight: height, chromeLift }));
  view.render({ ar: lines, en });
  views.push(view);
  return view;
}

function section(title) {
  root.appendChild(el('h2', null, title));
  root.appendChild(el('div', 'grid'));
}

section('عيّنة النص المختلط (12 حالة) — الحجم المتوسط، خلفية خفيفة، مشغّل 640×360');
for (const s of SAMPLES) {
  const lines = splitLines(s.text);
  frame({
    title: `${s.id}. ${s.label}  ·  الاتجاهات: ${s.dirs.join(' / ')}`,
    lines: s.dual ? [lines[0]] : lines,
    en: s.dual ? [lines[1]] : [],
  });
}

section('المظهر — العيّنة 2 بثلاث خلفيات وثلاثة مواضع وأربعة مقاسات (480×270)');
const mixed = splitLines(SAMPLES[1].text);
for (const background of ['none', 'soft', 'solid']) {
  frame({ title: `الخلفية: ${background}`, lines: mixed, width: 480, height: 270, appearance: { size: 'm', background, position: 'bottom' } });
}
for (const position of ['bottom', 'raised', 'top']) {
  frame({ title: `الموضع: ${position}`, lines: mixed, width: 480, height: 270, appearance: { size: 'm', background: 'soft', position } });
}
for (const size of ['s', 'm', 'l', 'xl']) {
  frame({ title: `المقاس: ${size}`, lines: splitLines(SAMPLES[2].text), width: 480, height: 270, appearance: { size, background: 'soft', position: 'bottom' } });
}
frame({
  title: 'شريط التحكم ظاهر (الطبقة ترتفع فوقه)', lines: mixed, width: 480, height: 270, chromeLift: 48, note: '▬▬▬ شريط التحكم ▬▬▬',
});

window.__rtlSample = { count: views.length, peek: () => views.map((v) => v.peek()) };
document.title = 'ترجمان — عيّنة RTL';
