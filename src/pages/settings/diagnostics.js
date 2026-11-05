// تقرير التشخيص القابل للنسخ (R36، P7-AC4): الإصدار والمتصفح ورموز الأخطاء وأحجام وأعداد فقط. لا عنوان فيديو ولا
// نص ترجمة ولا اسم ملف ولا رابط ولا رمز جلسة ولا تعليمات ترجمة: كل ما هنا أعداد وأسماء إعدادات ورموز. كل قسم
// يُجمع على حدة، وفشل قسم يظهر رمزه ولا يُسقط التقرير. يمر كله بمنقّي src/core/diagnostics.
import { createDiagnosticReport, formatDiagnosticReport } from '../../core/diagnostics/report.js';
import { toErrorInfo } from '../../core/errors/index.js';
import { browserLabel, liveSources } from '../../core/report/diagnostics.js';

/**
 * «Microsoft Edge 156» أو «Firefox 159» أو «Brave 156»: الاسم والرقم الرئيسي وحدهما، بكشف قناة البلاغ نفسه (U53).
 * @param {Navigator} [nav] @param {typeof chrome} [api]
 * @returns {Promise<string>}
 */
export const detectBrowser = (nav = globalThis.navigator, api = globalThis.chrome) => browserLabel({ ...liveSources({ nav, api }), platformInfo: async () => null });

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
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, version: string, nav?: Navigator, api?: typeof chrome, at?: string }} o
 * @returns {Promise<string>} نص JSON منسَّق جاهز للنسخ
 */
export async function collectDiagnostics({ store, version, nav = globalThis.navigator, api = globalThis.chrome, at }) {
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
  return formatDiagnosticReport(createDiagnosticReport({ version, browser: await detectBrowser(nav, api), ...(at ? { at } : {}), sections }));
}
