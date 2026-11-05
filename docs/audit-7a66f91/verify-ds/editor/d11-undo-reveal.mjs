// DS-S3 (اقتراح DeepSeek §9 البند 3): التراجع عن تعديل خارج الشاشة لا يكشف المقطع ولا يسمّيه.
import { ROOT, log, mounted, makeCues, sampleBundle, buttonNamed } from './harness.mjs';

const bundle = sampleBundle();
bundle.slots[0].track.original = makeCues(150, { text: (i) => `مقطع ${i}` });
bundle.slots[0].track.current = null;
bundle.slots[0].track.editedAt = null;
bundle.slots[0].track.fingerprintId = null;
bundle.slots[0].track.comparison = null;
bundle.slots[0].marks = [];
bundle.slots[0].position = null;
bundle.record.arabic = structuredClone(bundle.slots[0].track);
const m = await mounted({ bundle });
const scroller = m.env.root.querySelector('.ed-list');
const ta = m.field(0, 'text');
ta.focus();
ta.value = `${ta.value} X1`;
ta.dispatchEvent({ type: 'input' });
ta.dispatchEvent({ type: 'focusout' });
m.env.doc.body.focus();
await m.env.flush();
scroller.scrollTop = 3000;
scroller.dispatchEvent({ type: 'scroll' });
await m.env.flush();
const rendered = () => [...scroller.querySelector('.ed-list__spacer').children].map((c) => Number(c.getAttribute('data-row'))).sort((a, b) => a - b);
log('بعد التعديل والتمرير بعيدًا: scrollTop =', scroller.scrollTop, '| الصفوف المرسومة', rendered().slice(0, 3).join(','), '…');
const undo = buttonNamed(m.env.root, 'تراجع');
log('تلميح زر «تراجع» قبل الضغط:', JSON.stringify(undo.title));
undo.click();
await m.env.flush();
log('بعد «تراجع»: المقطع 1 =', JSON.stringify(m.editor.state.session.cueAt(0).text), '| scrollTop =', scroller.scrollTop, '| الصف 0 مرسوم؟', rendered().includes(0),
  '| سطر النتيجة:', JSON.stringify(m.editor.state.result?.text));
const { createEditSession } = await import(`${ROOT}/src/core/edit/session.js`);
const s = createEditSession({ cues: makeCues(3) });
s.setText(1, 'x');
log('ما تعيده session.undo():', JSON.stringify(s.undo()), '(بلا مواضع، والحدث الداخلي يحملها في indices)');
