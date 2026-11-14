// الجولة الحية لختام ST1 (2026-11-14، Chrome 157 وFirefox 160): مقطع بسطرين صريحين يلتفّ ثانيهما في عرض اللوحة فُتح حقل «عدّل
// النص» عليه بسطرين وتمرير داخلي، فقُصّ أول سطره، والمواصفة «حقل مكان نص الصف بنص المقطع وأسطره». فالحقل يزيد سطرًا ما دام النص
// الملتفّ أطول منه حتى ستة أسطر، ويُقاس بعد دخوله الصفحة.
// تخطيط وهمي كالمتصفح: سطر الحقل 26px وحشوته 12px، والسطر الصريح يلتفّ كل WRAP محرفًا، والقياس صفر ما دام الحقل خارج الصفحة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arCues, click, makeState, ui, watchPage } from './harness.js';

const LINE = 26;
const PAD = 12;
const WRAP = 20;
const visualLines = (text) => String(text).split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / WRAP)), 0);

/** يقيس كل textarea تُنشأ بعدها كما يقيسها المتصفح: clientHeight من rows، وscrollHeight من أسطر النص بعد الالتفاف. */
function layoutTextareas(doc) {
  const make = doc.createElement;
  doc.createElement = (tag) => {
    const node = make(tag);
    if (tag === 'textarea') {
      const rows = () => Number(node.getAttribute('rows') ?? 2);
      Object.defineProperty(node, 'clientHeight', { get: () => (node.isConnected ? rows() * LINE + PAD : 0) });
      Object.defineProperty(node, 'scrollHeight', { get: () => (node.isConnected ? Math.max(rows(), visualLines(node.value)) * LINE + PAD : 0) });
    }
    return node;
  };
}

function open(texts) {
  const cues = arCues(texts.length).map((c, i) => ({ ...c, text: texts[i] }));
  const page = watchPage({ state: makeState({ arabic: { cues }, marks: { slot: 2, items: [] } }) });
  layoutTextareas(page.doc);
  page.controller.editCueText = async () => ({ undo: async () => {} });
  page.video.silentTo(0);
  page.mount();
  return ui(page);
}

/** يفتح حقل صف i بنقرة مؤشر على «عدّل النص» في شريطه. */
function openEdit(v, i) {
  v.rows()[i].dispatchEvent({ type: 'pointerover', bubbles: true });
  click(v.q('.acts').children.find((b) => b.getAttribute('data-act') === 'edit'));
  return v.q('.edit__field');
}

const scrolls = (f) => f.scrollHeight > f.clientHeight;

test('الحقل يتسع للسطر الملتفّ: سطران صريحان يلتفّ ثانيهما ⇒ ثلاثة أسطر بلا تمرير داخلي', () => {
  const v = open(['سطر', `أول\n${'ب'.repeat(WRAP + 5)}`]);
  const f = openEdit(v, 1);
  assert.ok(f, 'الحقل مفتوح');
  assert.equal(f.getAttribute('rows'), '3');
  assert.equal(scrolls(f), false, 'لا يُقصّ شيء');
});

test('الحقل بلا التفاف بعدد أسطره الصريحة، وأقله سطران', () => {
  assert.equal(openEdit(open(['قصير']), 0).getAttribute('rows'), '2');
  assert.equal(openEdit(open(['أول\nثانٍ\nثالث']), 0).getAttribute('rows'), '3');
});

test('الكتابة تعيد القياس: يطول الحقل مع الالتفاف ويقصر حين يُحذف النص، وحدّه ستة أسطر', () => {
  const v = open(['قصير']);
  const f = openEdit(v, 0);
  const type = (text) => {
    f.value = text;
    f.dispatchEvent({ type: 'input', bubbles: true });
  };
  type('ج'.repeat(WRAP * 3 + 1));
  assert.equal(f.getAttribute('rows'), '4');
  assert.equal(scrolls(f), false);
  type('ق');
  assert.equal(f.getAttribute('rows'), '2');
  type('د'.repeat(WRAP * 10));
  assert.equal(f.getAttribute('rows'), '6', 'الحدّ');
  assert.equal(scrolls(f), true, 'وما فوقه بتمرير');
});
