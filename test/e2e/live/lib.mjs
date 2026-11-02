// أدوات الدورة الحية في P9، بملفات اختبار خارج المستودع ونوعين من الجلسات:
// - جلسة يدوية (hand.mjs): المتصفح كما يشغّله المستخدم بلا أي علم تحكم، فتبقى navigator.webdriver=false ويعيد يوتيوب
//   جسم الترجمة؛ ونقرات الاستخراج بيد سلطان. قيس في P9: منفذ التصحيح وحده (--remote-debugging-port) يجعل webdriver=true
//   في كل صفحة ولو لم يُلتحق بها، فيعود الجسم فارغًا كما تحت الأنبوب في P1. ولا تُخفى علامة الأتمتة (تحايل).
// - جلسة مؤتمتة (cycle.mjs وlist.mjs): منفذ تصحيح محلي (--remote-debugging-port=0) ونقرات وضغطات Input حقيقية لما لا
//   يحتاج جسم الترجمة: المحفوظات، والرفع، والمشاهدة، والضبط، والمحرّر، والعودة، والإعدادات، وإعادة التشغيل.
// الحافظة حافظة الجهاز (بإذن سلطان). يستعمل حزام P2 (test/live/harness) قراءةً دون تعديل.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdpConnection, wsTransport } from '../../live/harness/cdp.mjs';
import { PROFILE_ROOT, sleep } from '../../live/harness/browser.mjs';
import { attach } from '../../live/harness/extension.mjs';
import { unpackedIdOf } from '../../live/p1/ext-id.mjs';
import { findSecrets, sanitizeDeep } from '../../../src/core/diagnostics/sanitize.js';
import { parseSrtTime } from '../../../src/core/srt/time.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
/** مجلد العمل خارج المستودع: التنزيلات، والتعليمات المنسوخة، والترجمات، وحالة الخطوات. */
export const WORK = path.join(PROFILE_ROOT, 'p9-work');
export { PROFILE_ROOT, sleep };

// مسار الإضافة ثابت في الجلستين فيبقى معرّفها وتخزينها واحدًا: بناء الإنتاج للجلسة اليدوية، ثم بناء التطوير في المسار
// نفسه للمؤتمتة (يزيد عليه خطاف القياس وحده).
export const BROWSERS = {
  brave: { name: 'Brave', app: '/Applications/Brave Browser.app', profile: 'brave-p9-live', ext: path.join(PROFILE_ROOT, 'ext-p9'), flagLoad: true },
  // Chrome الرسمي يتجاهل --load-extension منذ 137: ملف chrome-manual فيه الإضافة محمّلة يدويًا مرة واحدة (P1) من هذا المجلد،
  // فيوضع فيه بناء P9 ويقرؤه Chrome عند التشغيل.
  chrome: { name: 'Chrome', app: '/Applications/Google Chrome.app', profile: 'chrome-manual', ext: path.join(PROFILE_ROOT, 'extension-manual'), flagLoad: false },
};

export const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
export const human = (min = 500, max = 1100) => sleep(min + Math.random() * (max - min));

/** عمليات المتصفح الرئيسية لملف تعريف (لا عمليات --type= الفرعية). */
export function pidsOf(profileDir) {
  const r = spawnSync('pgrep', ['-f', '--', `user-data-dir=${profileDir} `]);
  return String(r.stdout).split('\n').filter(Boolean).map(Number)
    .filter((pid) => !String(spawnSync('ps', ['-o', 'command=', '-p', String(pid)]).stdout).includes('--type='));
}

async function waitGone(profileDir, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (!pidsOf(profileDir).length) return true;
    await sleep(300);
  }
  return false;
}

async function readActivePort(profileDir, timeoutMs = 30000) {
  const file = path.join(profileDir, 'DevToolsActivePort');
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const [port, wsPath] = (await readFile(file, 'utf8')).trim().split('\n');
      if (port && wsPath) return { port: Number(port), wsPath };
    } catch {
      // لم يُكتب بعد.
    }
    await sleep(300);
  }
  throw new Error('لم يُكتب DevToolsActivePort ضمن المهلة');
}

async function connectWs(spec, profileDir, active) {
  const conn = new CdpConnection(await wsTransport(`ws://127.0.0.1:${active.port}${active.wsPath}`));
  const version = await conn.send('Browser.getVersion', {}, undefined, 15000);
  const close = async () => {
    try {
      await conn.send('Browser.close', {}, undefined, 5000);
    } catch {
      for (const pid of pidsOf(profileDir)) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // انتهت.
        }
      }
    }
    conn.close();
    return waitGone(profileDir);
  };
  return { conn, version, profileDir, spec, close, extId: unpackedIdOf(spec.ext) };
}

export async function quitProfile(profileDir) {
  for (const pid of pidsOf(profileDir)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // انتهت.
    }
  }
  return waitGone(profileDir);
}

/**
 * يشغّل المتصفح بملف الاختبار. المؤتمتة (debug=true): في الخلفية دون أن تأخذ التركيز (open -g -n) بمنفذ تصحيح محلي،
 * وأعلام منع الإبطاء للنافذة المغطاة كي يستمر العرض والتشغيل خلف نوافذ سلطان. اليدوية (debug=false): نافذة أمامية بلا
 * أي علم تحكم، ولا اتصال بها. تُغلق أولًا أي نسخة باقية من الملف نفسه.
 * والمؤتمتة بلا نافذة (headless) لا تظهر فوق نوافذ سلطان أصلًا (P15)، والمؤتمتة الأمامية (front) نافذة يُنتظر فيها سلطان
 * (حوار «اسأل عن مكان الحفظ»). ext يغيّر مسار الإضافة (ملفات P15).
 * @param {'brave' | 'chrome'} browser
 * @param {{ profile?: string, ext?: string, loadExt?: boolean, debug?: boolean, headless?: boolean, front?: boolean, urls?: string[] }} [o]
 */
export async function launchBrowser(browser, { profile, ext, loadExt, debug = true, headless = false, front = false, urls = ['about:blank'] } = {}) {
  const spec = { ...BROWSERS[browser], ...(profile ? { profile } : {}), ...(ext ? { ext } : {}) };
  const profileDir = path.join(PROFILE_ROOT, spec.profile);
  await mkdir(profileDir, { recursive: true });
  if (pidsOf(profileDir).length) await quitProfile(profileDir);
  await rm(path.join(profileDir, 'DevToolsActivePort'), { force: true });
  const args = [
    ...(debug && !front ? ['-g'] : []), '-n', '-a', spec.app, '--args',
    `--user-data-dir=${profileDir}`, ...(debug ? ['--remote-debugging-port=0'] : []),
    '--no-first-run', '--no-default-browser-check', '--lang=en-US', '--mute-audio',
    '--window-size=1400,950', '--window-position=40,40',
    ...(debug ? ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] : []),
    ...(debug && headless ? ['--headless=new'] : []),
  ];
  if (loadExt ?? spec.flagLoad) args.push(`--load-extension=${spec.ext}`);
  args.push(...urls);
  execFileSync('open', args);
  if (!debug) return { spec, profileDir, extId: unpackedIdOf(spec.ext), quit: () => quitProfile(profileDir) };
  return connectWs(spec, profileDir, await readActivePort(profileDir));
}

/** مجلد التنزيل الافتراضي لملف الاختبار بلا سؤال (Preferences والمتصفح مغلق). */
export async function setDownloadDir(profileDir, dir) {
  const file = path.join(profileDir, 'Default', 'Preferences');
  let prefs = {};
  try {
    prefs = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    await mkdir(path.dirname(file), { recursive: true });
  }
  prefs.download = { ...(prefs.download ?? {}), default_directory: dir, prompt_for_download: false, directory_upgrade: true };
  prefs.savefile = { ...(prefs.savefile ?? {}), default_directory: dir };
  await writeFile(file, JSON.stringify(prefs));
}

/** يلتحق بنسخة تعمل من خطوة سابقة. */
export async function connectBrowser(browser) {
  const spec = BROWSERS[browser];
  const profileDir = path.join(PROFILE_ROOT, spec.profile);
  if (!pidsOf(profileDir).length) throw new Error(`${spec.name} لا يعمل بملف ${spec.profile}`);
  return connectWs(spec, profileDir, await readActivePort(profileDir, 5000));
}

/** تبويب جديد يُحمَّل دون التحاق (لا جلسة CDP على الصفحة أثناء تحميلها والتقاطها). */
export async function openUnattached(conn, url) {
  const { targetId } = await conn.send('Target.createTarget', { url });
  return targetId;
}

/** التحاق بتبويب (Page وRuntime وLog) وتفعيل محاكاة التركيز: النافذة في الخلفية والحافظة تشترط مستندًا مركّزًا. */
export async function attachTab(conn, targetId) {
  const page = await attach(conn, targetId);
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return page;
}

export async function openAttached(conn, url) {
  const targetId = await openUnattached(conn, 'about:blank');
  const page = await attachTab(conn, targetId);
  if (url !== 'about:blank') await page.goto(url);
  return page;
}

export async function waitTarget(conn, match, { timeoutMs = 10000, exclude = new Set() } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const { targetInfos } = await conn.send('Target.getTargets');
    const t = targetInfos.find((x) => x.type === 'page' && !exclude.has(x.targetId) && match(x.url));
    if (t) return t;
    await sleep(200);
  }
  return null;
}

// ---- حافظة الجهاز (بإذن سلطان): تُكتب قيمة حارسة قبل كل نسخ، فلا تُقرأ قيمة قديمة على أنها المنسوخ ----
const UTF8 = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
export function setClipboard(text) {
  execFileSync('pbcopy', { input: text, env: UTF8 });
}
export function readClipboard() {
  return execFileSync('pbpaste', { env: UTF8, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}
export function sentinel() {
  const s = `tj-p9-sentinel-${Date.now()}`;
  setClipboard(s);
  return s;
}
export async function clipboardAfter(s, { timeoutMs = 5000 } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const t = readClipboard();
    if (t !== s) return t;
    await sleep(150);
  }
  return null;
}

// ---- تعليمات الترجمة المتوقعة من الملحق أ في المواصفة (مصدر مستقل عن الشيفرة) ----
const spec = await readFile(path.join(ROOT, 'docs/product-spec.md'), 'utf8');
const TEMPLATE = /```text\n([\s\S]*?)\n```/.exec(spec.slice(spec.indexOf('## ملحق أ')))[1];
export const specInstructions = (videoId, title) => TEMPLATE
  .replace('{{video_title}}', () => title ?? 'غير متوفر')
  .replace('{{video_url}}', () => `https://www.youtube.com/watch?v=${videoId}`);

// ---- الأدلة: فحوص وملاحظات ولقطات، وJSON منقّى يُرفض إن بقي فيه نمط حساس ----
export class Evidence {
  constructor(dir, name, meta = {}) {
    this.dir = dir;
    this.name = name;
    this.data = { ...meta, at: new Date().toISOString(), checks: [], notes: [], screenshots: [] };
  }

  check(id, ok, detail = null) {
    this.data.checks.push({ id, ok: !!ok, detail });
    console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 360)}` : ''}`);
    return !!ok;
  }

  note(text) {
    this.data.notes.push(text);
    console.log(`  ملاحظة: ${text}`);
  }

  async shot(page, name, { conn } = {}) {
    if (conn) await conn.send('Target.activateTarget', { targetId: page.targetId });
    await sleep(300);
    const f = path.join(this.dir, `${name}.png`);
    await page.screenshot(f);
    this.data.screenshots.push(path.relative(ROOT, f));
    return f;
  }

  get failed() {
    return this.data.checks.filter((c) => !c.ok);
  }

  async write() {
    await mkdir(this.dir, { recursive: true });
    const text = `${JSON.stringify(sanitizeDeep(this.data), null, 2)}\n`;
    const leaks = findSecrets(text);
    if (leaks.length || /https?:\/\//.test(text)) throw new Error(`الأدلة فيها نمط حساس أو رابط (${leaks.length})`);
    const f = path.join(this.dir, `${this.name}.json`);
    await writeFile(f, text);
    console.log(`\nالنتيجة: ${this.data.checks.length - this.failed.length}/${this.data.checks.length} · ${path.relative(ROOT, f)}`);
    return f;
  }
}

/** حالة الخطوات بين الأوامر (خارج المستودع): المعرّفات والبصمات وأسماء الملفات فقط. */
export async function loadState(browser) {
  try {
    return JSON.parse(await readFile(path.join(WORK, browser, 'state.json'), 'utf8'));
  } catch {
    return { videos: {} };
  }
}
export async function saveState(browser, state) {
  await mkdir(path.join(WORK, browser), { recursive: true });
  await writeFile(path.join(WORK, browser, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
}

export const clip = (s, n = 200) => String(s ?? '').replace(/https?:\/\/\S+/g, '[رابط]').slice(0, n);

/** جزء احتياطي بصرامة المحلّل الصارم، والترقيم مستمر من رقم أول مقطع فيه (لا من 1). */
export function parsePart(text) {
  if (text.charCodeAt(0) === 0xfeff || !text.endsWith('\n')) throw new Error('جزء بلا نهاية سطر أو ببداية BOM');
  const blocks = text.slice(0, -1).split('\n\n');
  const first = Number(blocks[0].split('\n')[0]);
  return blocks.map((block, i) => {
    const lines = block.split('\n');
    const [a, b] = lines[1].split(' --> ');
    if (lines[0] !== String(first + i) || parseSrtTime(a) === null || parseSrtTime(b) === null) throw new Error(`كتلة غير صالحة عند ${first + i}`);
    return { n: first + i, startMs: parseSrtTime(a), endMs: parseSrtTime(b), text: lines.slice(2).join('\n') };
  });
}
