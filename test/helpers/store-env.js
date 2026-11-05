// بيئة الكاتب الواحد للاختبار (تدقيق 7a66f91، C2، DS-T-02): مساحة واحدة، وعامل خلفي واحد بكاتبه، وسياقات بأسماء ترسل إليه
// بالناقل الحقيقي (messageTransport) عبر runtime وهمي. والخطافات تحاكي ما يقع في المتصفح بين السياق والعامل:
//   hold(op)          يوقف الطلب التالي من هذه العملية قبل وصوله إلى الكاتب حتى release().
//   failBefore(op)    القناة تفشل قبل الوصول (عامل لم يبدأ بعد أو «Receiving end does not exist»).
//   dropReply(op)     الكاتب يطبّق والرد يضيع (المنفذ أُغلق قبل الرد) والعامل حي.
//   restartAfter(op)  الكاتب يطبّق ثم يتوقف العامل قبل الرد، فيبدأ كاتب جديد بذاكرة فارغة.
//   down(n)           العامل لا يستجيب لـn محاولة متتالية.
import { createStore, createWriter, messageTransport } from '../../src/core/store/index.js';
import { createMemoryArea } from './chrome-storage.js';

export function storeEnv({ area = createMemoryArea({ unlimited: true }) } = {}) {
  let writer = createWriter({ area });
  const hooks = [];
  const sent = [];
  let downFor = 0;
  const once = (kind, op, extra = {}) => {
    const h = { kind, op, ...extra };
    hooks.push(h);
    return h;
  };
  const take = (op) => {
    const i = hooks.findIndex((h) => h.op === op);
    return i < 0 ? null : hooks.splice(i, 1)[0];
  };
  const runtime = {
    async sendMessage(msg) {
      const req = JSON.parse(JSON.stringify(msg));
      sent.push(req);
      if (downFor > 0) {
        downFor--;
        throw new Error('Could not establish connection. Receiving end does not exist.');
      }
      const h = take(req.op);
      if (h?.kind === 'failBefore') throw new Error('Could not establish connection. Receiving end does not exist.');
      if (h?.kind === 'hold') {
        h.arrived();
        await h.gate;
      }
      const reply = JSON.parse(JSON.stringify(await writer.handle(req)));
      if (h?.kind === 'dropReply') throw new Error('The message port closed before a response was received.');
      if (h?.kind === 'restartAfter') {
        writer = createWriter({ area });
        throw new Error('The message port closed before a response was received.');
      }
      return reply;
    },
  };
  const transport = messageTransport(runtime, { delays: [0, 0, 0], sleep: () => Promise.resolve() });
  let t = Date.parse('2026-11-05T10:00:00.000Z');
  const now = () => (t += 1000);
  return {
    area, runtime, sent, now,
    /** سياق جديد (تبويب أو صفحة) بمخزنه، يكتب عبر العامل. */
    context: () => createStore({ area, now, transport }),
    get writer() {
      return writer;
    },
    restartWriter() {
      writer = createWriter({ area });
    },
    hold(op) {
      let release;
      let arrived;
      const reached = new Promise((r) => { arrived = r; });
      const gate = new Promise((r) => { release = r; });
      once('hold', op, { gate, arrived });
      return { reached, release: () => release() };
    },
    failBefore: (op) => once('failBefore', op),
    dropReply: (op) => once('dropReply', op),
    restartAfter: (op) => once('restartAfter', op),
    down(n) {
      downFor = n;
    },
  };
}
