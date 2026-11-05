// M-10 / UI-01: ترتيب صفوف المحرّر في الـDOM بعد التمرير لأسفل ثم لأعلى (Tab وقارئ الشاشة يتبعان ترتيب الـDOM).
// المحرّر مركّب كاملًا بـ150 مقطعًا، والتمرير على حاوية .ed-list نفسها كما في سيناريو Codex (3000 ثم 2200).
import { mounted, log, makeCues, sampleBundle } from './harness.mjs';

const bundle = sampleBundle();
const cues = makeCues(150, { text: (i) => `مقطع ${i}` });
bundle.slots[0].track.original = cues;
bundle.slots[0].track.current = null;
bundle.slots[0].track.editedAt = null;
bundle.slots[0].track.fingerprintId = null;
bundle.slots[0].track.comparison = null;
bundle.slots[0].marks = [];
bundle.slots[0].position = null;
bundle.record.arabic = structuredClone(bundle.slots[0].track);
const { editor, env } = await mounted({ bundle });
const scroller = env.root.querySelector('.ed-list');
const spacer = scroller.querySelector('.ed-list__spacer');
const order = () => [...spacer.children].map((c) => Number(c.getAttribute('data-row')));
log('ارتفاع الصف (من التخطيط):', editor.state.layout.heights[0], '| clientHeight الوهمي = 600 (افتراضي virtual.js)');
log('البداية:', order().join(','));
for (const top of [3000, 2200]) {
  scroller.scrollTop = top;
  scroller.dispatchEvent({ type: 'scroll' });
  await env.flush();
  log(`بعد scrollTop=${top}:`, order().join(','));
}
const o = order();
const sorted = [...o].sort((a, b) => a - b);
log('الترتيب في الـDOM مطابق للترتيب البصري؟', JSON.stringify(o) === JSON.stringify(sorted));
const i29 = o.indexOf(29);
log('ما يلي الصف 29 في الـDOM:', i29 === o.length - 1 ? 'لا صف (آخر الحاوية: Tab يخرج من القائمة)' : `الصف ${o[i29 + 1]}`);
log('aria-setsize/aria-posinset على الصفوف؟', spacer.children[0].getAttribute('aria-setsize'), spacer.children[0].getAttribute('aria-posinset'));
