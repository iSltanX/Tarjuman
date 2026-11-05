// S5 / TJ-AUD-006 / L-23: اسم المتصفح في تقريري النسخ (الإعدادات ونافذة الأيقونة) مقابل تشخيص البلاغ. وP-5: withoutIds
// تُسقط المعرّف بالمفتاح وحده، فقيمة حرة فيها معرّف صالح تبقى (مع البحث عن مسار حقيقي يكتبها).
import { TJ_ROOT as T } from '../_root.mjs';
// بعد C7 (U53): الكاشفان غير متزامنين ومن قناة البلاغ نفسها؛ ونافذة الأيقونة تستعمل browserLabel من core/report، فيُقرأ منه إن غاب
// من status.js (الشيفرة السابقة تُقرأ كما كانت).
const { detectBrowser } = await import(`${T}/src/pages/settings/diagnostics.js`);
const popup = await import(`${T}/src/pages/popup/status.js`);
const core = await import(`${T}/src/core/report/diagnostics.js`);
const { pageReport } = popup;
const { collectDiagnostics } = core;
const browserLabel = popup.browserLabel ?? ((nav) => core.browserLabel(core.liveSources({ nav, api: {} })));

const NAVS = {
  'Firefox 159 (سطح المكتب)': { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:159.0) Gecko/20100101 Firefox/159.0' },
  'Edge 156': { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0', userAgentData: { brands: [{ brand: 'Not.A/Brand', version: '99' }, { brand: 'Chromium', version: '156' }, { brand: 'Microsoft Edge', version: '156' }] } },
  'Chrome 156': { userAgent: 'Mozilla/5.0 ... Chrome/156.0.0.0', userAgentData: { brands: [{ brand: 'Not.A/Brand', version: '99' }, { brand: 'Chromium', version: '156' }, { brand: 'Google Chrome', version: '156' }] } },
  'Brave 156': { userAgent: 'Mozilla/5.0 ... Chrome/156.0.0.0', userAgentData: { brands: [{ brand: 'Not.A/Brand', version: '99' }, { brand: 'Chromium', version: '156' }, { brand: 'Brave', version: '156' }] } },
};
for (const [name, nav] of Object.entries(NAVS)) {
  const report = await collectDiagnostics({
    manifestVersion: () => '1.1.0', platformInfo: async () => ({ os: 'linux', arch: 'x86-64' }), uaData: () => nav.userAgentData,
    userAgent: () => nav.userAgent, browserInfo: async () => (name.startsWith('Firefox') ? { name: 'Firefox', version: '159.0' } : null),
    isBrave: async () => name.startsWith('Brave'), target: () => (name.startsWith('Firefox') ? 'firefox' : 'chromium'), development: () => false,
  });
  console.log(`${name}: الإعدادات/المحفوظات detectBrowser = «${await detectBrowser(nav, {})}» | النافذة browserLabel = «${await browserLabel(nav)}» | البلاغ = «${report.browser} ${report.browserVersion}»`);
}

// P-5: قيمة حرة بمعرّف صالح في حقل detail تمر من pageReport
const ID = 'dQw4w9WgXcQ';
const out = pageReport({
  reply: null, version: '1.1.0', browser: 'x', at: '2026-11-05T00:00:00Z',
  sections: { controller: { videoId: ID, lastListenerError: { code: 'X', message: 'm', detail: `boom ${ID}` } }, mounted: { overlay: { lastDetail: `TypeError: ${ID}` } } },
});
console.log('P-5) المفتاح videoId مستبعد =', !out.includes(`"videoId": "${ID}"`), '| المعرّف ما زال في قيم حرة =', out.split(ID).length - 1, 'مرة');
