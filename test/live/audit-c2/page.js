// صفحة اختبار C2 الحي (تدقيق 7a66f91): تُجمَّع وتُحقن في بناء تطوير مؤقت (tests/c2.html)، فتعمل في سياق صفحة إضافة حقيقية
// بالشيفرة نفسها: createStore() بلا معاملات، أي القراءة من chrome.storage.local والكتابة عبر العامل الخلفي (بعد C2)، أو
// مباشرة (قبله، لقياس زمن ±). تبويبان منها سياقان مستقلان: «a» يدير الأزواج، و«b» ينفّذ ما يُطلب منه عبر BroadcastChannel
// لحظة وصوله، فيبدأ الفعلان معًا عبر عمليتين. لا شبكة، ولا يوتيوب.
import { createStore } from '../../../src/core/store/index.js';
import { createController } from '../../../src/content/controller.js';
import { saveSlot, writePosition } from '../../../src/pages/editor/persist.js';
import { activateSlot } from '../../../src/pages/library/actions.js';
import { bundleToBackup, syncActive } from '../../../src/core/model/bundle.js';
import { itemsFor, rawBundle, bundleReadKeys } from '../../../src/core/store/bundles.js';
import { validateVideoRecord } from '../../../src/core/model/video.js';
import { validateBundle } from '../../../src/core/model/slots.js';
import { makeCues } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const ID = 'AAAAAAAAAAA';
const role = location.hash.slice(1) || 'a';
const store = createStore();
const ch = new BroadcastChannel('tj-c2');
let ctl = null;
let seq = 0;
const waiters = new Map();
const changes = [];

const settled = (p) => Promise.resolve(p).then((value) => ({ ok: true, value }), (err) => ({ ok: false, code: err?.code ?? String(err?.message ?? err) }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : null; };

store.onChange((c) => {
  const v = c.videos[ID];
  if (v) changes.push({ at: Date.now(), rev: v.newValue?.rev ?? null });
});

async function controller() {
  if (!ctl) {
    ctl = createController({ store, page: {}, extractor: null });
    store.onChange((c) => ctl.handleStoreChange(c));
    await ctl.start(ID);
  }
  return ctl;
}

function bigBundle(cues) {
  const b = sampleBundle({ videoId: ID, third: true });
  const many = (label) => makeCues(cues, { text: (i) => `${label} ${'ع'.repeat(60)} ${i}` });
  for (const s of b.slots) {
    if (!s.track) continue;
    s.track.original = many(`خ${s.n}`);
    s.track.current = s.n === 1 ? many('معدّل') : null;
    s.marks = [];
    s.position = null;
  }
  b.record.arabic = structuredClone(b.slots[0].track);
  if (b.previous) b.previous.track.original = many('سابقة');
  return b;
}

const summary = (b) => b && {
  rev: b.record.rev, updatedAt: b.record.updatedAt, active: b.active, offsets: b.slots.map((s) => s.offsetMs), names: b.slots.map((s) => s.name),
  text0: b.slots[0].track?.current?.[0]?.text ?? b.slots[0].track?.original?.[0]?.text ?? null, filled: b.slots.map((s) => !!s.track),
  positions: b.slots.map((s) => s.position?.n ?? null), previous: b.previous ? b.previous.track.fileName : null,
};

const OPS = {
  async reset({ cues = 0 } = {}) {
    await store.clearAll();
    await seedBundle(store, cues ? bigBundle(cues) : sampleBundle({ videoId: ID, third: true }));
    if (ctl) await ctl.reload();
    return true;
  },
  async read() {
    const r = await settled(store.getBundle(ID));
    return r.ok ? { ok: true, b: summary(r.value) } : { ok: false, code: r.code };
  },
  async keys() {
    return Object.keys(await chrome.storage.local.get(null)).sort();
  },
  opened: () => store.getBundle(ID),
  async save({ text, opened }) {
    const b = opened ?? await store.getBundle(ID);
    const cues = structuredClone(b.slots[0].track.current ?? b.slots[0].track.original);
    cues[0] = { ...cues[0], text };
    await saveSlot(store, ID, b, 1, { cues, offsetChanged: false, offsetMs: b.slots[0].offsetMs }, { now: Date.now });
    return text;
  },
  async nudge() {
    const c = await controller();
    await c.nudgeOffset(1);
    const s = c.getState();
    return { error: s.error?.code ?? null, notice: s.notice?.code ?? null, step: s.settings.offsetStepMs };
  },
  prefsUi: ({ v }) => store.setPrefs({ ui: { panelOpen: v } }).then(() => v),
  prefsReview: ({ v }) => store.setPrefs({ review: { maxCps: v } }).then(() => v),
  prefs: () => store.getPrefs(),
  async position({ index }) {
    const b = await store.getBundle(ID);
    const n = b.active;
    const cue = (b.slots[n - 1].track.current ?? b.slots[n - 1].track.original)[index];
    await writePosition(store, ID, b, n, index, { now: Date.now });
    return { n, cueN: cue.n };
  },
  activate: ({ n }) => activateSlot({ store, videoId: ID, n, now: Date.now }).then(() => n),
  clear: () => store.clearAll(),
  del: () => store.deleteVideo(ID),
  restore: ({ entry }) => store.restoreVideo(entry, { replace: true }),
  entry: async () => bundleToBackup(await store.getBundle(ID)),
  async ctlState() {
    const c = await controller();
    const s = c.getState().saved;
    return s ? `${s.rev}|${s.updatedAt}` : 'none';
  },
  rename: ({ name }) => store.updateBundle(ID, (b) => ({ ...b, slots: b.slots.map((s) => (s.n === 2 ? { ...s, name } : s)) })).then(() => name),
  changesSince: ({ since }) => changes.filter((c) => c.at >= since),
  /** استعادة count فيديو كاملًا (لإيقاف العامل في منتصفها)، ثم فحصها: كل فيديو كامل أو غائب. */
  async restoreMany({ count }) {
    const statuses = [];
    for (const id of manyIds(count)) statuses.push((await store.restoreVideo(bundleToBackup(sampleBundle({ videoId: id, third: true })), { replace: true })).status);
    return statuses;
  },
  async checkMany({ count }) {
    let complete = 0;
    let missing = 0;
    let incomplete = 0;
    for (const id of manyIds(count)) {
      const r = await settled(store.getBundle(id));
      if (!r.ok) incomplete++;
      else if (!r.value) missing++;
      else if (r.value.slots.filter((x) => x.track).length === 3 && r.value.previous) complete++;
      else incomplete++;
    }
    return { complete, missing, incomplete };
  },
};

function manyIds(count) {
  return Array.from({ length: count }, (_, i) => `R${String(i).padStart(10, '0')}`);
}

const run = (op, args) => settled(Promise.resolve().then(() => OPS[op](args ?? {})));

ch.onmessage = async (e) => {
  const d = e.data;
  if (!d || d.to !== role) return;
  if (d.reply) {
    waiters.get(d.id)?.(d.r);
    waiters.delete(d.id);
    return;
  }
  const r = await run(d.op, d.args);
  ch.postMessage({ to: d.from, from: role, id: d.id, reply: true, r: JSON.parse(JSON.stringify(r)) });
};

/** يطلب من «b» عملية ويعيد نتيجتها. */
function remote(op, args) {
  const id = `${role}-${++seq}`;
  const p = new Promise((res) => waiters.set(id, res));
  ch.postMessage({ to: 'b', from: role, id, op, args });
  return p;
}

/** زوج: «b» يبدأ فعله لحظة وصول الرسالة، و«a» يبدأ فعله بعد تأخير عشوائي صغير، فيتبادلان السبق. */
async function pair(opA, argsA, opB, argsB) {
  const pb = remote(opB, argsB);
  await sleep(Math.random() * 3);
  const ra = await run(opA, argsA);
  return { ra, rb: await pb };
}

const stress = {
  /** حفظ المحرّر في «a» و± المشغّل في «b». */
  async saveNudge(count) {
    const out = { pairs: 0, corrupt: 0, silent: 0, conflicts: 0, notices: 0, errors: [] };
    await OPS.reset();
    for (let i = 0; i < count; i++) {
      const before = (await OPS.read()).b;
      const { ra, rb } = await pair('save', { text: `A${i}` }, 'nudge', {});
      const after = await OPS.read();
      out.pairs++;
      if (!after.ok) { out.corrupt++; out.errors.push(after.code); await OPS.reset(); continue; }
      if (ra.ok && after.b.text0 !== `A${i}`) out.silent++;
      if (!ra.ok) { if (ra.code === 'ST_CONFLICT') out.conflicts++; else out.errors.push(ra.code); }
      if (rb.ok && rb.value.notice === 'CT_ACTIVE_CHANGED') out.notices++;
      else if (rb.ok && !rb.value.error && after.b.offsets[0] !== before.offsets[0] + rb.value.step) out.silent++;
      if (rb.ok && rb.value.error) out.errors.push(rb.value.error);
    }
    return out;
  },
  /** setPrefs لمجموعتين من سياقين. */
  async prefsPrefs(count) {
    const out = { pairs: 0, silent: 0, errors: [] };
    for (let i = 0; i < count; i++) {
      const vA = i % 2 === 0;
      const vB = 5 + (i % 30);
      const { ra, rb } = await pair('prefsUi', { v: vA }, 'prefsReview', { v: vB });
      out.pairs++;
      if (!ra.ok) out.errors.push(ra.code);
      if (!rb.ok) out.errors.push(rb.code);
      const p = await store.getPrefs();
      if ((ra.ok && p.ui.panelOpen !== vA) || (rb.ok && p.review.maxCps !== vB)) out.silent++;
    }
    return out;
  },
  /** «آخر موضع» من المحرّر في «a» وتفعيل خانة في «b». */
  async positionActivate(count) {
    const out = { pairs: 0, corrupt: 0, silent: 0, conflicts: 0, errors: [] };
    await OPS.reset();
    for (let i = 0; i < count; i++) {
      const target = [2, 3, 1][i % 3];
      const { ra, rb } = await pair('position', { index: i % 3 }, 'activate', { n: target });
      const after = await OPS.read();
      out.pairs++;
      if (!after.ok) { out.corrupt++; out.errors.push(after.code); await OPS.reset(); continue; }
      if (rb.ok && after.b.active !== target) out.silent++;
      if (ra.ok && after.b.positions[ra.value.n - 1] === null) out.silent++;
      if (!ra.ok) { if (ra.code === 'ST_CONFLICT') out.conflicts++; else out.errors.push(ra.code); }
      if (!rb.ok) out.errors.push(rb.code);
    }
    return out;
  },
  /** حفظان على النسخة نفسها من سياقين: واحد فقط ينجح. */
  async saveSave(count) {
    const out = { pairs: 0, corrupt: 0, bothOk: 0, oneOk: 0, errors: [] };
    await OPS.reset();
    for (let i = 0; i < count; i++) {
      const opened = await store.getBundle(ID);
      const { ra, rb } = await pair('save', { text: `A${i}`, opened }, 'save', { text: `B${i}`, opened });
      const after = await OPS.read();
      out.pairs++;
      if (!after.ok) { out.corrupt++; await OPS.reset(); continue; }
      if (ra.ok && rb.ok) out.bothOk++;
      else if (ra.ok || rb.ok) {
        out.oneOk++;
        if (after.b.text0 !== (ra.ok ? `A${i}` : `B${i}`)) out.errors.push('winner-mismatch');
      }
      for (const r of [ra, rb]) if (!r.ok && r.code !== 'ST_CONFLICT') out.errors.push(r.code);
    }
    return out;
  },
  /** ± في «a» و«مسح كل البيانات» في «b»: لا يبقى بعدهما مفتاح للفيديو. */
  async nudgeClear(count) {
    const out = { pairs: 0, leftovers: 0, errors: [] };
    for (let i = 0; i < count; i++) {
      await OPS.reset();
      await controller();
      const { ra, rb } = await pair('nudge', {}, 'clear', {});
      out.pairs++;
      await sleep(5);
      const keys = (await OPS.keys()).filter((k) => k.endsWith(ID));
      if (keys.length) out.leftovers++;
      if (!rb.ok) out.errors.push(rb.code);
      if (ra.ok && ra.value.error) out.errors.push(ra.value.error);
    }
    return out;
  },
  /** I02: حذف واستعادة متتاليان و«b» يشاهد الفيديو بمتحكم: بعد الاستقرار تطابق حالته المخزَّن. */
  async deleteRestore(count) {
    const out = { cycles: 0, mismatches: 0, samples: [] };
    await OPS.reset();
    const entry = await OPS.entry();
    await remote('ctlState', {});
    for (let i = 0; i < count; i++) {
      await store.deleteVideo(ID);
      await store.restoreVideo(entry, { replace: true });
      out.cycles++;
      const stored = (await OPS.read()).b;
      const want = stored ? `${stored.rev}|${stored.updatedAt}` : 'none';
      let got = null;
      for (let k = 0; k < 20; k++) {
        await sleep(25);
        got = (await remote('ctlState', {})).value;
        if (got === want) break;
      }
      if (got !== want) { out.mismatches++; if (out.samples.length < 5) out.samples.push({ i, want, got }); }
    }
    return out;
  },
  /** زمن تسليم onChanged إلى «b» لكتابة من «a»، بحزمة صغيرة وأخرى بنحو 1 م.ب. */
  async latency(samples, { cues = 0 } = {}) {
    await OPS.reset({ cues });
    const ms = [];
    for (let i = 0; i < samples; i++) {
      const t0 = Date.now();
      await OPS.rename({ name: `n${i}` });
      let seen = null;
      for (let k = 0; k < 80 && !seen; k++) {
        const r = await remote('changesSince', { since: t0 });
        seen = r.value?.find((c) => c.rev !== null) ?? null;
        if (!seen) await sleep(5);
      }
      if (seen) ms.push(seen.at - t0);
    }
    const bytes = JSON.stringify(await chrome.storage.local.get(null)).length;
    return { samples: ms.length, median: median(ms), p95: p95(ms), bytes };
  },
};

/** تفكيك كلفة الكتابة في المتصفح (تشخيص D4): قراءة السجل الكبير، ورسالة بحجمه يرفضها الكاتب فورًا، ورسالة صغيرة. */
async function costProbe(n, { cues = 2000 } = {}) {
  await OPS.reset({ cues });
  const key = `video:${ID}`;
  const { [key]: record } = await chrome.storage.local.get(key);
  const time = async (fn) => {
    const ms = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      await fn(i);
      ms.push(performance.now() - t0);
    }
    return Math.round(median(ms) * 10) / 10;
  };
  const msg = (extra, i) => chrome.runtime.sendMessage({ type: 'tj:store', v: 1, wid: `probe-${i}-${Math.random()}`, op: 'put', videoId: 'bad id!', base: 'x', ...extra });
  return {
    getRecord: await time(() => chrome.storage.local.get(key)),
    get5: await time(() => chrome.storage.local.get([key, `bundle:${ID}`, `alts:${ID}`, `prev:${ID}`, `marks:${ID}`])),
    setRecord: await time(() => chrome.storage.local.set({ [key]: record })),
    messageBig: await time((i) => msg({ items: { [key]: record } }, i)),
    messageSmall: await time((i) => msg({ items: {} }, i)),
    validateRecord: await time(() => validateVideoRecord(record)),
    validateBundle: await time(async () => validateBundle(await store.getBundle(ID))),
    getBundleOnly: await time(() => store.getBundle(ID)),
    ...(await putCost(n)),
    chars: JSON.stringify(record).length,
  };
}

/** كتابة ± محسوبة كما يحسبها المخزن: set مباشرة من الصفحة (المسار قبل C2) مقابل put عبر العامل الخلفي (بعده). */
async function putCost(n) {
  const next = async () => {
    const raw = rawBundle(await chrome.storage.local.get(bundleReadKeys(ID)), ID);
    const b = structuredClone(await store.getBundle(ID));
    b.record = { ...b.record, view: { ...b.record.view, displayOffsetMs: (b.record.view.displayOffsetMs + 100) % 5000 }, rev: raw.record.rev + 1, updatedAt: new Date().toISOString() };
    syncActive(b);
    return { raw, items: itemsFor(b, raw) };
  };
  const pageSet = [];
  const viaWriter = [];
  for (let i = 0; i < n; i++) {
    let { items } = await next();
    let t0 = performance.now();
    await chrome.storage.local.set(items);
    pageSet.push(performance.now() - t0);
    const r = await next();
    t0 = performance.now();
    const reply = await chrome.runtime.sendMessage({ type: 'tj:store', v: 1, wid: `put-${i}-${Math.random()}`, op: 'put', videoId: ID, base: `${r.raw.record.rev}|${r.raw.record.updatedAt}`, items: r.items });
    viaWriter.push(performance.now() - t0);
    if (!reply?.ok) return { putError: reply?.code ?? 'no-reply' };
  }
  const m = (xs) => Math.round(median(xs) * 10) / 10;
  return { pageSet: m(pageSet), viaWriter: m(viaWriter) };
}

/** زمن ± في سياق واحد على حزمة كبيرة (D4): من الضغطة حتى انتهاء حفظها. */
async function nudgeTiming(n, { cues = 2000 } = {}) {
  await OPS.reset({ cues });
  const c = await controller();
  const ms = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await c.nudgeOffset(i % 2 ? -1 : 1);
    ms.push(performance.now() - t0);
  }
  const bytes = JSON.stringify(await chrome.storage.local.get(null)).length;
  return { n, median: Math.round(median(ms) * 10) / 10, p95: Math.round(p95(ms) * 10) / 10, bytes, error: c.getState().error?.code ?? null };
}

window.__c2 = { role, run, stress, nudgeTiming, costProbe, remote, ready: true };
document.title = `c2-${role}`;
