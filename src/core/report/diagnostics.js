// تشخيص البلاغ (جولة النشر T2.1): إصدار ترجمان والمتصفح والنظام وحزمة البناء، من الإضافة والمتصفح وحدهما في صفحة الإعدادات.
// لا شيء من يوتيوب ولا من المحفوظات ولا من الترجمات. وكل مصدر يتدهور إلى «unknown» صريحة لا إلى غياب الحقل، لأن العقد يشترط
// الحقول. والشيفرة واحدة في الهدفين: حزمة Firefox تُعرف من عنوان الصفحة (moz-extension:) لا من علم بناء.
/* global __TJ_DEV__ */

/** runtime.PlatformOs ← قيم العقد. */
const OS = Object.freeze({ mac: 'macos', win: 'windows', linux: 'linux', cros: 'chromeos', android: 'android', openbsd: 'openbsd', fuchsia: 'fuchsia' });
/** runtime.PlatformArch ← قيم العقد (Firefox يسمّي ARM64 aarch64). */
const ARCH = Object.freeze({ arm: 'arm', arm64: 'arm64', aarch64: 'arm64', 'x86-32': 'x86', 'x86-64': 'x86_64', mips: 'mips', mips64: 'mips64' });
// Brave ليس هنا: علامته في userAgentData تحمل إصدار Chromium لا إصداره هو (انظر browserOf).
const PREFERRED = ['Microsoft Edge', 'Google Chrome', 'Opera', 'Vivaldi', 'Chromium'];

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
  // Brave لا يكشف إصداره هو (1.x) لصفحات الإضافة: علامتا «Brave» و«Chromium» عنده بإصدار Chromium، مخفّضًا غالبًا إلى
  // ‎156.0.0.0. فلا يُعرض إصدار Chromium على أنه إصدار Brave (المراجعة المستقلة 2026-11-04؛ أدلة T3: «Brave 156.0.0.0» والمتصفح
  // 1.98.63): الإصدار unknown صريحة، وإصدار Chromium في حقله المسمّى chromiumVersion.
  const brave = await Promise.resolve().then(s.isBrave).catch(() => false) || brands.some((b) => b.brand === 'Brave');
  if (brave) return { browser: 'Brave', version: 'unknown', chromiumVersion: brands.find((b) => b.brand === 'Chromium')?.version ?? 'unknown', osVersion };
  const known = PREFERRED.map((name) => brands.find((b) => b.brand === name)).find(Boolean);
  if (known) return { browser: known.brand, version: known.version, osVersion };
  const m = /Firefox\/([\d.]+)/.exec(s.userAgent());
  return m ? { browser: 'Firefox', version: m[1], osVersion: 'unknown' } : { browser: 'unknown', version: 'unknown', osVersion: 'unknown' };
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
    ...(b.chromiumVersion === undefined ? {} : { chromiumVersion: b.chromiumVersion }),
    buildTarget: s.target(),
    test: s.development(),
  };
}
