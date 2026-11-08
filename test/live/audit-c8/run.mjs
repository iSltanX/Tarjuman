// الاختبار الحي لمرحلة C8 من خطة إصلاح تدقيق 7a66f91 (أدوات البناء والاختبار والوثائق)، بلا
// نافذة، بملف تعريف اختبار مؤقت يُحذف بعده، وبلا بلاغ ولا حساب (قرار سلطان Q05). يبني نسخة تطوير مؤقتة خارج المستودع، ويقيس:
//   bridge    جسر الحزام على يوتيوب الحقيقي (U65): برمز الجلسة الذي كتبه البناء يجيب (ping وstate)، وبلا رمز أو برمز خاطئ من
//             العالم الرئيسي للصفحة لا رد أصلًا. وفي Firefox يفتح الجسر برمزه صفحة الإضافة (عملية open).
//   warnings  تحذيرات التثبيت في عائلة Chromium بـchrome.management.getPermissionWarningsByManifest (DS-D-05): البيان المعتمد
//             بـunlimitedStorage يساوي البيان نفسه بدونه، وtabs ضابط يضيف تحذيرًا. وفي Firefox لا واجهة لذلك.
// الاستعمال (بعد إعلام سلطان):
//   command node test/live/audit-c8/run.mjs --browser chrome|firefox|brave|edge --out <مجلد النتائج>
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, sleep } from '../harness/browser.mjs';
import { bridge, startBrowser } from '../stores/driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const BROWSER = arg('browser', 'chrome');
const OUT = path.resolve(arg('out', path.join(os.tmpdir(), 'tj-c8-live-out')));
const TMP = await mkdtemp(path.join(os.tmpdir(), 'tj-c8-live-'));
const TARGET = BROWSER === 'firefox' ? 'firefox' : 'chromium';
const WATCH = 'https://www.youtube.com/watch?v=iG9CE55wbtY';
const profile = `c8-${BROWSER}-${randomUUID().slice(0, 8)}`;
const result = { browser: BROWSER, startedAt: new Date().toISOString(), version: null, checks: [], measures: {}, notes: [] };
const check = (id, ok, detail = {}) => { result.checks.push({ id, ok: !!ok, ...detail }); console.log(`${ok ? '✓' : '✗'} ${id} ${JSON.stringify(detail).slice(0, 300)}`); };
const note = (n) => { result.notes.push(n); console.log(`• ${n}`); };

/** ينتظر حتى يجيب الجسر برمزه (بعد تحميل سكربت المحتوى). */
async function waitBridge(page, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await bridge(page, 'ping', [], 3000).catch(() => null);
    if (r?.ok && r.value === true) return r;
    await sleep(500);
  }
  return null;
}

let s;
try {
  const ext = path.join(TMP, `ext-${TARGET}`);
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--target', TARGET, '--out', ext], { cwd: ROOT, stdio: 'ignore' });
  const token = (await readFile(path.join(ext, 'dev', 'harness-token.txt'), 'utf8')).trim();
  check('dev-build-token', /^[0-9a-f]{32}$/.test(token), { length: token.length });

  s = await startBrowser(BROWSER, { profile, ext, downloadDir: path.join(TMP, 'dl'), headless: true });
  result.version = s.version;
  check('install', !!s.extensionId, { version: s.version });

  // ---- bridge (U65) ----
  const yt = await s.youtube(WATCH);
  check('page-token-from-build', yt.harnessToken === token);
  const ok = await waitBridge(yt);
  check('bridge-answers-with-session-token', !!ok, { reply: ok ? { ok: ok.ok, value: ok.value } : null });
  const st = await bridge(yt, 'state', [], 8000);
  check('bridge-state-with-token', st?.ok === true && typeof st.value === 'object', { videoId: st?.value?.videoId ?? null, mounted: st?.value?.mounted ?? null });
  for (const [label, t] of [['none', null], ['wrong', 'f'.repeat(32)], ['empty', '']]) {
    yt.harnessToken = t;
    const r = await bridge(yt, 'state', [], 3000);
    const r2 = await bridge(yt, 'cueText', [1], 3000);
    check(`bridge-silent-token-${label}`, r?.error === 'timeout' && r2?.error === 'timeout', { state: r, cueText: r2 });
  }
  yt.harnessToken = token;
  const again = await bridge(yt, 'ping', [], 3000);
  check('bridge-answers-again-with-token', again?.ok === true && again.value === true);
  if (s.kind === 'firefox') {
    const base = await s.learnBase(yt);
    const page = await s.extPage('pages/settings/index.html').catch((err) => { note(`extPage: ${err.message}`); return null; });
    check('firefox-open-via-bridge-with-token', !!base && !!page, { base: base ? new URL(base).protocol : null });
  }

  // ---- warnings (DS-D-05) ----
  if (s.kind === 'chromium') {
    const page = await s.extPage('pages/settings/index.html');
    const manifest = JSON.parse(await readFile(path.join(ROOT, 'src/manifest.json'), 'utf8'));
    const w = await page.eval(async (m) => {
      const ask = (perms) => chrome.management.getPermissionWarningsByManifest(JSON.stringify({ ...m, permissions: perms }));
      return {
        approved: await ask(m.permissions),
        withoutUnlimited: await ask(m.permissions.filter((p) => p !== 'unlimitedStorage')),
        storageOnly: await ask(['storage']),
        withTabs: await ask([...m.permissions, 'tabs']),
      };
    }, { args: [manifest] });
    result.measures.warnings = w;
    check('unlimitedStorage-adds-no-warning', JSON.stringify(w.approved) === JSON.stringify(w.withoutUnlimited), { approved: w.approved, withoutUnlimited: w.withoutUnlimited });
    check('tabs-control-adds-warning', w.withTabs.length > w.approved.length, { withTabs: w.withTabs.length, approved: w.approved.length });
  } else {
    note('Firefox: لا getPermissionWarningsByManifest؛ ومخطط بيانه يضع unlimitedStorage في PermissionNoPrompt (docs/contracts/storage.md)');
  }

  const errs = s.errors().flatMap((e) => e.errors);
  check('no-extension-errors', errs.length === 0, { errors: errs.slice(0, 5) });
} catch (err) {
  check('run-completed', false, { error: String(err?.stack ?? err).slice(0, 600) });
} finally {
  if (s) await s.close().catch(() => {});
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  await rm(path.join(PROFILE_ROOT, profile), { recursive: true, force: true }).catch(() => {});
}

const pass = result.checks.filter((c) => c.ok).length;
result.summary = `${pass}/${result.checks.length}`;
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, `${BROWSER}.json`), `${JSON.stringify(result, null, 2)}\n`);
console.log(`\n${BROWSER} (${result.version}): ${result.summary}`);
process.exit(pass === result.checks.length ? 0 : 1);
