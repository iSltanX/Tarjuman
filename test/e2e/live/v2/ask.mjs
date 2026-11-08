#!/usr/bin/env node
// «اسأل عن مكان الحفظ» عند كل تنزيل (P15-AC1، بعد «مجلد فرعي» في الجلسة اليدوية): نافذة أمامية مؤتمتة بلا يوتيوب على ملف
// الرحلة نفسه. الإعدادات بضغطة حقيقية على «اسأل في كل مرة»، ثم تنزيلان من المحفوظات (الإنجليزية ثم العربية) يفتح كلٌّ منهما
// حوار الحفظ الأصلي، وسلطان يضغط «حفظ» فيه (لا يُتحكم بحوار النظام). يتحقق أن الملف وصل بمحتواه، ثم يعيد «مجلد فرعي».
//   command node test/e2e/live/v2/ask.mjs --browser brave|chrome
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseSrtStrict } from '../../../../src/core/srt/parser.js';
import { sleep } from '../../../live/harness/browser.mjs';
import { BROWSERS, Evidence, ROOT, V2, VIDEOS, WORK, launchBrowser, sha16 } from './lib.mjs';
import { FONT_READ_LOG, appVersion, byText, clickOn, extPage, listDl, navHash } from './ui.mjs';

const argv = process.argv.slice(2);
const browser = argv.includes('--browser') ? argv[argv.indexOf('--browser') + 1] : 'brave';
const { profile, ext } = V2[browser];
const DL = path.join(WORK, browser, 'downloads');
const SUB = path.join(DL, 'Tarjuman');
const VIDEO = VIDEOS.manual.id;
const ev = new Evidence(path.join(ROOT, 'test-results/live/P15', browser), 'ask', { step: 'ask', browser: `${BROWSERS[browser].name} ${appVersion(BROWSERS[browser].app) ?? '?'}`, session: 'نافذة أمامية مؤتمتة؛ «حفظ» في حوار النظام بيد سلطان' });

const b = await launchBrowser(browser, { profile, ext, debug: true, front: true });
const tracked = [];
const setMode = async (st, mode) => {
  await navHash(st, 'export');
  await st.waitFor(() => !!document.querySelector('.st-location'), { timeoutMs: 8000 });
  await clickOn(st, `document.querySelector('.st-location input[value="${mode}"]')`, mode);
  await sleep(700);
  return (await st.eval(() => chrome.storage.local.get('prefs'))).prefs?.saveLocation ?? null;
};
/** كل الملفات الجديدة في مجلد التنزيل ومجلده الفرعي (حوار الحفظ قد يقترح أيهما). */
const snapshot = async () => new Set([...(await listDl(DL)).map((n) => `/${n}`), ...(await listDl(SUB)).map((n) => `Tarjuman/${n}`)]);
async function waitSaved(beforeSet, match, timeoutMs = 240000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    for (const k of await snapshot()) if (!beforeSet.has(k) && match(k.split('/').pop())) return path.join(DL, k);
    await sleep(500);
  }
  return null;
}
try {
  await sleep(1500);
  const st = await extPage(b.conn, b.extId, 'pages/settings/index.html#export', tracked);
  const loc = await setMode(st, 'ask');
  ev.check('settings-ask-every-time', loc?.mode === 'ask', loc);

  const lib = await extPage(b.conn, b.extId, 'pages/library/index.html', tracked);
  const row = `document.querySelector('li.lib-row[data-video="${VIDEO}"]')`;
  await lib.waitFor((id) => !!document.querySelector(`li.lib-row[data-video="${id}"]`), { args: [VIDEO], timeoutMs: 10000 });
  await b.conn.send('Target.activateTarget', { targetId: lib.targetId });
  const english = (await readFile(path.join(SUB, `${VIDEO}.en.manual.normal.srt`), 'utf8').catch(() => null));
  for (const [label, item, match] of [
    ['الإنجليزية', 'الإنجليزية', (n) => n.startsWith(`${VIDEO}.en.manual.normal`) && n.endsWith('.srt')],
    ['العربية', 'العربية — النسخة الحالية', (n) => n.startsWith(VIDEO) && n.endsWith('.ar.srt')],
  ]) {
    const beforeSet = await snapshot();
    await clickOn(lib, `${row}?.querySelector('button.lib-more')`, 'المزيد');
    await clickOn(lib, byText('.tj-menu__list:not([hidden]) [role=menuitem]', item), item);
    console.log(`\n>>> حوار الحفظ مفتوح (${label}): اضغط «حفظ» في نافذة ${BROWSERS[browser].name}.`);
    const t0 = Date.now();
    const file = await waitSaved(beforeSet, match);
    const text = file ? await readFile(file, 'utf8') : null;
    let cues = null;
    try {
      cues = text ? parseSrtStrict(text).length : null;
    } catch {
      cues = null;
    }
    const where = file ? path.relative(DL, file) : null;
    ev.check(`ask-dialog-${label === 'العربية' ? 'arabic' : 'english'}-saved-by-hand`, !!file && cues > 0 && (label !== 'الإنجليزية' || text === english),
      { file: where, cues, sha: text && sha16(text), sameAsHandDownload: label === 'الإنجليزية' ? text === english : null, waitedMs: Date.now() - t0 });
    await sleep(800);
  }
  await b.conn.send('Target.activateTarget', { targetId: st.targetId });
  const back = await setMode(st, 'subfolder');
  ev.check('settings-back-to-subfolder', back?.mode === 'subfolder' && back.folder === 'Tarjuman', back);
} finally {
  const errs = tracked.flatMap((t) => t.errs.list.filter((x) => !(x.kind === 'log.security' && FONT_READ_LOG.test(x.text))).map((x) => ({ where: t.where, ...x })));
  ev.check('no-extension-errors', errs.length === 0, errs.length ? errs.slice(0, 5) : null);
  tracked.forEach((t) => t.errs.stop());
  await b.close();
}
await ev.write();
process.exit(ev.failed.length ? 1 : 0);
