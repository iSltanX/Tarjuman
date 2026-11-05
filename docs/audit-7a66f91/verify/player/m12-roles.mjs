// M-12 / TJ-AUD-004c: دور القائمة المنبثقة ومحتواها، وaria-haspopup لزر الرفع حين يفتح المنتقي مباشرة.
import { imp, settleN, log } from './common.mjs';
const H = await imp('test/unit/player/controls/harness.js');

const roleSummary = (menu) => {
  const roles = {};
  const tags = {};
  for (const el of menu.descendants()) {
    const r = el.getAttribute?.('role');
    if (r) roles[r] = (roles[r] ?? 0) + 1;
    if (['button', 'input', 'h2', 'label'].includes(el.tagName)) tags[el.tagName] = (tags[el.tagName] ?? 0) + 1;
  }
  return { role: menu.getAttribute('role'), label: menu.getAttribute('aria-label'), roles, tags };
};

for (const tracks of [[H.trackInfo()], [H.trackInfo(), H.trackInfo({ key: 'en|asr', kind: 'asr' })]]) {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic(), captured: tracks }) });
  H.click(page.ui.btn('download'), 0);
  await settleN(2);
  log(`download (${tracks.length} مسار) haspopup=${page.ui.btn('download').getAttribute('aria-haspopup')}:`, JSON.stringify(roleSummary(page.ui.menu())));
  H.click(page.ui.btn('download'), 0);
  H.click(page.ui.btn('upload'), 0);
  await settleN(2);
  log(`display haspopup=${page.ui.btn('upload').getAttribute('aria-haspopup')}:`, JSON.stringify(roleSummary(page.ui.menu())));
  H.click(page.ui.btn('upload'), 0);
  H.click(page.ui.btn('badge'), 0);
  await settleN(2);
  log(`timing haspopup=${page.ui.btn('badge').getAttribute('aria-haspopup')}:`, JSON.stringify(roleSummary(page.ui.menu())));
}

// بلا ترجمة: زر الرفع يعلن قائمة ويفتح منتقي الملفات
const p2 = H.mountPage({ state: H.makeState() });
let picker = 0;
p2.ui.fileInput().addEventListener('click', () => picker++);
H.click(p2.ui.btn('upload'), 0);
await settleN(2);
log('بلا ترجمة: aria-haspopup =', p2.ui.btn('upload').getAttribute('aria-haspopup'), '| aria-expanded =', p2.ui.btn('upload').getAttribute('aria-expanded'), '| فُتح المنتقي:', picker, '| قائمة مفتوحة:', p2.ui.menuOpen());
