// L-15: نقرة + أو − في الشريط: هل تتغير منطقة حية أو اسم الزر المركّز؟ (والمقارنة باللوحة: .off__val aria-live)
import { imp, settleN, log } from './common.mjs';
const H = await imp('test/unit/player/controls/harness.js');

const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
const { ui } = page;
const lroot = ui.layerHost().shadowRoot;
const live = () => lroot.descendants ? [...lroot.descendants()].filter((e) => e.getAttribute?.('aria-live') || ['status', 'alert', 'log'].includes(e.getAttribute?.('role'))).map((e) => ({ cls: e.className, role: e.getAttribute('role'), live: e.getAttribute('aria-live'), text: e.textContent })) : [];
const plus = ui.btn('plus');
plus.focus();
const before = { label: plus.getAttribute('aria-label'), desc: plus.getAttribute('aria-description'), badge: ui.btn('badge').getAttribute('aria-label'), live: live() };
H.click(plus, 0);
await settleN(2);
const after = { label: plus.getAttribute('aria-label'), desc: plus.getAttribute('aria-description'), badge: ui.btn('badge').getAttribute('aria-label'), live: live() };
log('الإزاحة بعد +:', page.controller.getState().view.displayOffsetMs);
log('قبل:', JSON.stringify(before));
log('بعد:', JSON.stringify(after));
const tip = lroot.querySelector('.tip');
log('التلميح:', JSON.stringify({ role: tip.getAttribute('role'), live: tip.getAttribute('aria-live'), text: tip.textContent, hidden: tip.hasAttribute('hidden') }));
