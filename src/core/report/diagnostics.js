// تشخيص البلاغ (جولة النشر T2.1): إصدار ترجمان والمتصفح والنظام وحزمة البناء، من الإضافة والمتصفح وحدهما في صفحة الإعدادات.
// لا شيء من يوتيوب ولا من المحفوظات ولا من الترجمات. وكل مصدر يتدهور إلى «unknown» صريحة لا إلى غياب الحقل، لأن العقد يشترط
// الحقول. والشيفرة واحدة في الهدفين: حزمة Firefox تُعرف من عنوان الصفحة (moz-extension:) لا من علم بناء.
/* global __TJ_DEV__ */
import { t } from '../../i18n/index.js';

/** runtime.PlatformOs ← قيم العقد. */
const OS = Object.freeze({ mac: 'macos', win: 'windows', linux: 'linux', cros: 'chromeos', android: 'android', openbsd: 'openbsd', fuchsia: 'fuchsia' });
/** runtime.PlatformArch ← قيم العقد (Firefox يسمّي ARM64 aarch64). */
const ARCH = Object.freeze({ arm: 'arm', arm64: 'arm64', aarch64: 'arm64', 'x86-32': 'x86', 'x86-64': 'x86_64', mips: 'mips', mips64: 'mips64' });
const PREFERRED = ['Microsoft Edge', 'Google Chrome', 'Brave', 'Opera', 'Vivaldi', 'Chromium'];

/**
 * مصادر التشخيص الحية؛ والاختبارات تمرّر مصادر بديلة.
 * @param {{ api?: typeof chrome, nav?: Navigator, loc?: Location }} [o]
 */
export function liveSources({ api = globalThis.chrome, nav = globalThis.navigator, loc = globalThis.location } = {}) {
  return {
    manifestVersion: () => api.runtime.getManifest().version,
    platformInfo: () => api.runtime.getPlatformInfo(),
    uaData: () => nav?.userAgentData,
    userAgent: () => String(nav?.userAgent ?? ''),
    // Firefox وحده: الاسم والإصدار من المتصفح نفسه.
    browserInfo: async () => (typeof api.runtime.getBrowserInfo === 'function' ? api.runtime.getBrowserInfo() : null),
    isBrave: async () => Boolean(await nav?.brave?.isBrave?.().catch(() => false)),
    target: () => (loc?.protocol === 'moz-extension:' ? 'firefox' : 'chromium'),
    // بناء التطوير وحده يضيف test: true (وسم test في القناة)؛ بناء الإنتاج يستبدل العلم نصًّا بـfalse.
    development: () => typeof __TJ_DEV__ !== 'undefined' && __TJ_DEV__ === true,
  };
}

const NONE = Object.freeze({ platformVersion: undefined, fullVersionList: undefined });

async function browserOf(s) {
  const info = await Promise.resolve().then(s.browserInfo).catch(() => null);
  if (info) return { browser: info.name, version: info.version, osVersion: 'unknown' };
  const ua = s.uaData();
  const high = await Promise.resolve().then(() => ua?.getHighEntropyValues?.(['platformVersion', 'fullVersionList']) ?? NONE).catch(() => NONE);
  const brands = high?.fullVersionList ?? ua?.brands ?? [];
  const osVersion = high?.platformVersion ?? 'unknown';
  if (await Promise.resolve().then(s.isBrave).catch(() => false)) {
    return { browser: 'Brave', version: brands.find((b) => b.brand === 'Chromium')?.version ?? 'unknown', osVersion };
  }
  const known = PREFERRED.map((name) => brands.find((b) => b.brand === name)).find(Boolean);
  if (known) return { browser: known.brand, version: known.version, osVersion };
  // بلا userAgentData (سياق غير آمن أو متصفح لا يعرّفها): وكيل المستخدم، وEdge وOpera قبل Chrome الذي يحمله كلاهما.
  const agent = s.userAgent();
  for (const [re, name] of UA_BROWSERS) {
    const m = re.exec(agent);
    if (m) return { browser: name, version: m[1], osVersion: name === 'Firefox' ? 'unknown' : osVersion };
  }
  return { browser: 'unknown', version: 'unknown', osVersion: 'unknown' };
}

/** وكيل المستخدم ← الاسم، بالترتيب (Edge وOpera يحملان «Chrome/» أيضًا). */
const UA_BROWSERS = Object.freeze([
  [/Firefox\/([\d.]+)/, 'Firefox'], [/Edg\/([\d.]+)/, 'Microsoft Edge'], [/OPR\/([\d.]+)/, 'Opera'], [/Chrome\/([\d.]+)/, 'Chrome'], [/Chromium\/([\d.]+)/, 'Chromium'],
]);

/**
 * «Microsoft Edge 156» و«Firefox 159» و«Brave 156»: اسم المتصفح ورقمه الرئيسي من كشف بلاغ المشكلة نفسه، لتقريري التشخيص
 * المنسوخين في الإعدادات والمحفوظات والنافذة (كانت دالتان أخريان تقولان «غير معروف» لـFirefox و«Chromium» لـEdge؛ تدقيق
 * 7a66f91، U53). لا سلسلة وكيل المستخدم كاملة.
 * @param {ReturnType<typeof liveSources>} [s]
 * @returns {Promise<string>}
 */
export async function browserLabel(s = liveSources()) {
  const b = await browserOf(s);
  if (b.browser === 'unknown') return t('settings.diag.unknownBrowser');
  const major = String(b.version ?? '').split('.')[0];
  return `${b.browser.replace(/^Google /, '')}${major && major !== 'unknown' ? ` ${major}` : ''}`.slice(0, 40);
}

/** @returns {Promise<import('./payload.js').Diagnostics>} */
export async function collectDiagnostics(s = liveSources()) {
  const platform = await Promise.resolve().then(s.platformInfo).catch(() => ({ os: 'unknown', arch: 'unknown' }));
  const b = await browserOf(s);
  let appVersion = 'unknown';
  try {
    appVersion = s.manifestVersion();
  } catch {
    // يبقى unknown.
  }
  return {
    appVersion,
    os: OS[platform?.os] ?? 'unknown',
    osVersion: b.osVersion,
    arch: ARCH[platform?.arch] ?? 'unknown',
    browser: b.browser,
    browserVersion: b.version,
    buildTarget: s.target(),
    test: s.development(),
  };
}
