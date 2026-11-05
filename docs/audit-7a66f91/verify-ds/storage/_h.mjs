// أدوات مشتركة لسكربتات التحقق: تستورد وحدات المصدر وأدوات الاختبار بمسارات مطلقة من النسخة المعزولة (7a66f91).
// لا متصفح ولا شبكة: محاكاة التخزين في الذاكرة وDOM وهمي من أدوات المشروع نفسها.
import { pathToFileURL } from 'node:url';

import { TJ_ROOT } from '../../verify/_root.mjs';
export const T = TJ_ROOT;
export const load = (rel) => import(pathToFileURL(`${T}/${rel}`).href);

export const { createStore } = await load('src/core/store/index.js');
export const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
export const { NOW, videoRecord } = await load('test/helpers/fixtures.js');
export const { samplePrefs, sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
export const { buttonNamed, findAll, newDocument, settle, textOf } = await load('test/unit/pages/library/fake-dom.js');
export const { createSettings } = await load('src/pages/settings/view.js');
export const { createLibrary } = await load('src/pages/library/view.js');
export const backup = await load('src/core/backup/index.js');
export const errors = await load('src/core/errors/index.js');

export const IDS = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC'];
export const noPause = () => Promise.resolve();
export const out = (label, obj) => console.log(JSON.stringify({ label, ...obj }));

export function newStore({ area } = {}) {
  let t = Date.parse(NOW);
  area ??= createMemoryArea({ unlimited: true });
  return { area, store: createStore({ area, now: () => (t += 1000) }) };
}

/** يركّب صفحة الإعدادات كاملة على DOM وهمي (كما في test/unit/pages/settings/v2.test.js). */
export async function mountSettings({ store, area, env = {} }) {
  await area.flush();
  const doc = newDocument();
  const calls = { saves: [], confirms: [] };
  const answers = [];
  let picked = null;
  const settings = createSettings({
    store, doc, version: '1.1.0', now: () => Date.parse('2026-11-05T10:00:00.000Z'), pause: noPause,
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    saveFile: async (file) => { calls.saves.push(file); return { ok: true, mode: 'downloads', downloadId: calls.saves.length }; },
    savedPath: async () => null,
    pickFile: async () => picked,
    confirm: async (o) => { calls.confirms.push(o); const a = answers.shift(); if (typeof a === 'function') await a(o); return a !== undefined && a !== false; },
    setTimer: () => 0, clearTimer: () => {},
    ...env,
  });
  doc.body.append(settings.root);
  await settings.load();
  return { settings, doc, calls, answers, root: settings.root, pick: (f) => { picked = f; } };
}

export const section = (m, title) => findAll(m.root, (e) => e.tagName === 'section' && textOf(e.querySelector('h2') ?? { textContent: '' }) === title)[0];
export const asFile = (text) => ({ size: Buffer.byteLength(text, 'utf8'), text: async () => text });
export const checkbox = (root, label) => findAll(root, (e) => e.tagName === 'input' && e.getAttribute('type') === 'checkbox').find((b) => textOf(b.parentNode) === label);
export const markText = (root) => findAll(root, (e) => e.classList.contains('tj-saved')).map(textOf).filter(Boolean);

/** يركّب صفحة المحفوظات ويعدّ صور i.ytimg.com فيها. */
export async function mountLibrary({ store, area }) {
  await area.flush();
  const doc = newDocument();
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW),
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }),
    clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}',
    confirm: async () => false, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id),
  });
  doc.body.append(lib.root);
  await lib.load();
  await settle(10);
  const imgs = findAll(lib.root, (e) => e.tagName === 'img').map((e) => e.getAttribute('src')).filter((s) => /i\.ytimg\.com/.test(s ?? ''));
  lib.dispose();
  return { thumbnailsPref: lib.state.prefs.ui.thumbnails, ytimgRequests: imgs };
}
