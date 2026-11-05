// يقرأ بيانات @mdn/browser-compat-data المحلية (قراءة فقط) ويطبع أدنى إصدار لكل ميزة.
import { readFileSync } from 'node:fs';
const p = process.argv[2];
const bcd = JSON.parse(readFileSync(p, 'utf8'));
const pkg = JSON.parse(readFileSync(p.replace(/data\.json$/, 'package.json'), 'utf8'));
console.log('@mdn/browser-compat-data', pkg.version, '__meta', JSON.stringify(bcd.__meta ?? null));
const get = (path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), bcd);
const v = (s, b) => { const x = s?.[b]; if (!x) return '—'; const arr = Array.isArray(x) ? x : [x]; return arr.map((e) => `${e.version_added}${e.flags ? '(flag)' : ''}${e.partial_implementation ? '(partial)' : ''}${e.notes ? ' notes=' + JSON.stringify(e.notes) : ''}`).join(' | '); };
const feats = [
  'webextensions.api.storage.StorageArea.getBytesInUse',
  'webextensions.api.storage.local.getBytesInUse',
  'webextensions.api.storage.local.getKeys',
  'webextensions.api.storage.StorageArea.getKeys',
  'webextensions.api.storage.local.QUOTA_BYTES',
  'webextensions.manifest.content_scripts.world',
  'webextensions.manifest.content_scripts.world.MAIN',
  'webextensions.manifest.optional_host_permissions',
  'webextensions.manifest.web_accessible_resources.use_dynamic_url',
  'webextensions.manifest.background.service_worker',
  'webextensions.manifest.background.scripts',
  'webextensions.api.downloads.download',
  'webextensions.api.downloads.download.conflictAction',
  'webextensions.api.downloads.download.saveAs',
  'webextensions.api.downloads.search',
  'webextensions.api.runtime.getBrowserInfo',
  'webextensions.manifest.browser_specific_settings.gecko.data_collection_permissions',
  'webextensions.api.permissions.Permissions.data_collection',
  'webextensions.manifest.background.persistent',
  'css.properties.scrollbar-color',
  'css.properties.scrollbar-width',
  'css.types.color.color-mix',
  'css.selectors.has',
  'css.properties.backdrop-filter',
  'api.HTMLElement.cancel_event',
  'api.HTMLInputElement.cancel_event',
  'api.structuredClone',
  'javascript.builtins.Intl.DisplayNames',
  'javascript.builtins.Object.hasOwn',
  'javascript.builtins.Array.at',
  'api.Document.adoptedStyleSheets',
  'api.CSSStyleSheet.replaceSync',
];
for (const f of feats) {
  const n = get(f);
  if (!n) { console.log(f, ': غير موجود في البيانات'); continue; }
  const s = n.__compat?.support;
  console.log(f, '| chrome', v(s, 'chrome'), '| edge', v(s, 'edge'), '| firefox', v(s, 'firefox'));
}
// إصدارات Firefox وحالة الإصدار في بيانات المتصفحات
const ff = bcd.browsers.firefox.releases;
for (const k of ['128', '140', '141', '142', '143', '144', '153', '159']) console.log('firefox', k, JSON.stringify(ff[k] ?? null));
const ch = bcd.browsers.chrome.releases;
for (const k of ['111', '130', '156', '157']) console.log('chrome', k, JSON.stringify(ch[k] ?? null));
