// تقرير التشخيص القابل للنسخ (R36، P7-AC4): الإصدار والمتصفح ورموز الأخطاء وأحجام وأعداد فقط. لا عنوان فيديو ولا
// نص ترجمة ولا اسم ملف ولا رابط ولا رمز جلسة ولا تعليمات ترجمة: كل ما هنا أعداد وأسماء إعدادات ورموز. كل قسم
// يُجمع على حدة، وفشل قسم يظهر رمزه ولا يُسقط التقرير. يمر كله بمنقّي src/core/diagnostics.
import { createDiagnosticReport, formatDiagnosticReport } from '../../core/diagnostics/report.js';
import { toErrorInfo } from '../../core/errors/index.js';

/** «Brave 1.98» أو «Chrome 156» أو «Chromium 156»: الاسم والرقم الرئيسي وحدهما (لا سلسلة وكيل المستخدم كاملة). */
export function detectBrowser(nav = globalThis.navigator) {
  const brands = nav?.userAgentData?.brands;
  if (Array.isArray(brands)) {
    const real = brands.filter((b) => b && typeof b.brand === 'string' && !/not.?a.?brand/i.test(b.brand));
    const pick = real.find((b) => /brave/i.test(b.brand)) ?? real.find((b) => /chrome$/i.test(b.brand)) ?? real.find((b) => /chromium/i.test(b.brand)) ?? real[0];
    if (pick) return `${pick.brand.replace(/^Google /, '')} ${String(pick.version).split('.')[0]}`.slice(0, 40);
  }
  const m = /(Chrome|Chromium)\/(\d+)/.exec(String(nav?.userAgent ?? ''));
  return m ? `${m[1]} ${m[2]}` : 'غير معروف';
}

/** أعداد المحفوظات من الفهرس فقط. @param {import('../../core/model/video.js').IndexEntry[]} entries */
export function librarySummary(entries) {
  return {
    videos: entries.length,
    withArabic: entries.filter((e) => e.arabic).length,
    edited: entries.filter((e) => e.arabic?.edited).length,
    mismatched: entries.filter((e) => e.arabic && e.arabic.matched === false).length,
    withEnglish: entries.filter((e) => e.english.length > 0).length,
    fingerprints: entries.reduce((s, e) => s + e.fingerprints, 0),
  };
}

/**
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, version: string, nav?: Navigator, at?: string }} o
 * @returns {Promise<string>} نص JSON منسَّق جاهز للنسخ
 */
export async function collectDiagnostics({ store, version, nav = globalThis.navigator, at }) {
  const sections = {};
  const section = async (name, fn) => {
    try {
      sections[name] = await fn();
    } catch (err) {
      sections[name] = { errorCode: toErrorInfo(err).code };
    }
  };
  await section('storage', async () => {
    const cap = await store.capacity();
    return { bytesInUse: cap.bytesInUse, quotaBytes: cap.quotaBytes, unlimited: cap.unlimited, level: cap.level, code: cap.code };
  });
  await section('library', async () => librarySummary(await store.listIndex()));
  await section('settings', async () => {
    const s = await store.getSettings();
    return {
      offsetStepMs: s.offsetStepMs, displayModeDefault: s.displayModeDefault, font: s.appearance.font, scale: s.appearance.scale,
      background: s.appearance.background, position: s.appearance.position, exportMode: s.export.modeDefault,
      splitThreshold: s.export.splitThreshold, driftMs: s.thresholds.driftMs, completeness: s.thresholds.completeness,
    };
  });
  return formatDiagnosticReport(createDiagnosticReport({ version, browser: detectBrowser(nav), ...(at ? { at } : {}), sections }));
}
