// TJ-29 (PIPE-07) ← U32: التقاط JSON صالح بلا أحداث نصية للمفتاح نفسه بعد التقاط سليم؛ وما يراه المستخدم في قائمة التحميل.
import { readFileSync } from 'node:fs';
import { T, TED, mod, out } from './lib.mjs';
const { createExtractor } = await mod('extract/index.js');
const { downloadMenu } = await mod('player/controls/menus.js');
const VID = 'iG9CE55wbtY';
const msg = (body, lang = 'en', trackKind = 'manual') => ({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VID, lang, trackKind, format: 'json3', status: 200, bodyLength: body.length, body });
const good = JSON.stringify(TED());
const view = (e) => ({ handle: undefined, tracks: e.tracks().map((t) => ({ key: t.key, ok: t.ok, code: t.code, cueCount: t.cueCount })), lastRejection: e.lastRejection(), diag: { accepted: e.diagnostics().accepted, rejected: e.diagnostics().rejected } });
for (const [label, bad] of [
  ['أحداث نوافذ فقط (بلا segs)', '{"wireMagic":"pb3","events":[{"tStartMs":0,"id":1,"wpWinPosId":1,"wsWinStyleId":1}]}'],
  ['events فارغة', '{"wireMagic":"pb3","events":[]}'],
  ['حدث بسطر جديد فقط', '{"events":[{"tStartMs":0,"dDurationMs":10,"segs":[{"utf8":"\\n"}]}]}'],
]) {
  const e = createExtractor({ currentVideoId: () => VID, durationMs: () => 1203421 });
  const h1 = e.handleMessage(msg(good));
  const before = view(e);
  const h2 = e.handleMessage(msg(bad));
  const after = view(e);
  out(label, { first: h1, before: before.tracks, second: h2, after });
}
// مفتاح آخر سليم يبقى ويُختار؟
{
  const e = createExtractor({ currentVideoId: () => VID, durationMs: () => 1203421 });
  e.handleMessage(msg(good, 'en'));
  e.handleMessage(msg(good, 'en-US'));
  e.handleMessage(msg('{"events":[]}', 'en'));
  out('مع مسار سليم آخر (en-US)', e.tracks().map((t) => [t.key, t.ok, t.code, t.cueCount]));
}
// ما تعرضه قائمة التحميل حين لا يبقى مسار سليم (session.js:179–180، menus.js:207–221): h بسيط يعيد شجرة نصوص.
{
  const h = (tag, p = {}) => ({ tag, text: p.text, role: p.attrs?.role, tone: p.attrs?.['data-tone'], children: (p.children ?? []).filter(Boolean) });
  const texts = (n) => (n ? [n.text, ...(n.children ?? []).flatMap(texts)].filter(Boolean) : []);
  const tree = downloadMenu(h, () => {}, { live: false, unavailable: false, captureIssue: null, invalid: [{ code: 'EX_EMPTY_BODY' }], tracks: [], why: false });
  out('قائمة التحميل بعد الاستبدال', tree.map((n) => ({ tone: n.tone, role: n.role, text: texts(n).join(' | ') })));
}
