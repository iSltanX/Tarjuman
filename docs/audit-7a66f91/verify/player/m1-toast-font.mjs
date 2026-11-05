// M-1: أين يُعرَّف --fs في ورقة طبقة الأدوات، وأين يُستعمل، وهل .toast داخل .layer في الشجرة؟ (تحليل ساكن + تركيب وهمي)
import { TJ, imp, settleN, log } from './common.mjs';
const csstree = (await import(`${TJ}/node_modules/css-tree/lib/index.js`)).default ?? (await import(`${TJ}/node_modules/css-tree/lib/index.js`));
const { layerCss } = await imp('src/player/controls/styles.js');
const H = await imp('test/unit/player/controls/harness.js');

const ast = csstree.parse(layerCss());
const defines = [];
const uses = [];
csstree.walk(ast, {
  visit: 'Rule',
  enter(rule) {
    const sel = csstree.generate(rule.prelude);
    rule.block.children.forEach((d) => {
      if (d.type !== 'Declaration') return;
      const val = csstree.generate(d.value);
      if (d.property === '--fs') defines.push(`${sel} { --fs: ${val.trim()} }`);
      if (/var\(--fs\)/.test(val)) uses.push(`${sel} { ${d.property}: ${val.trim()} }`);
    });
  },
});
log('تعريفات --fs:', JSON.stringify(defines, null, 1));
log('استعمالات var(--fs):', JSON.stringify(uses, null, 1));
const hostRule = layerCss().match(/:host \{ all: initial;[^}]*\}/)?.[0];
log(':host:', hostRule);

// الشجرة الفعلية بعد تركيب الأدوات ورسالة عابرة واحدة
const page = H.mountPage({ state: H.makeState({ arabic: H.arabic(), notice: { code: 'ST_RESTORED', tone: 'info', at: 1 } }) });
await settleN(3);
const root = page.ui.layerHost().shadowRoot;
const toast = root.querySelector('.toast');
const chain = [];
for (let n = toast; n; n = n.parentNode) chain.push(n.tagName + (n.className ? `.${n.className.replace(/ /g, '.')}` : ''));
log('سلسلة آباء .toast داخل الجذر:', chain.join(' <- '));
log('أبناء الجذر المظلل:', root.children.map((c) => c.className || c.tagName).join(' , '));
log('هل .toasts داخل .layer؟', root.querySelector('.layer').contains(root.querySelector('.toasts')));
log('نص الرسالة:', toast?.textContent);
