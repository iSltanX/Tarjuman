// L-12 (تداخل عميق ← RangeError)، وL-13 (محارف تجاوز الاتجاه في اسم الملف والعنوان)، وL-24 (معاينة بلا سبب ومفاتيح داخلية).
// الملفات مصنوعة يدويًا ثم تُعاد بصمتها وأعدادها بأدوات الصيغة نفسها (format.js)، فتجتاز فحص السلامة.
import { IDS, asFile, backup, errors, load, mountSettings, newStore, noPause, out, sampleBundle, section, seedBundle, settle, textOf } from './_h.mjs';

const { createBackup, readBackup } = backup;
const { messageFor } = errors;
const { sha256Hex, countData } = await load('src/core/backup/format.js');
const { displayName } = await load('src/core/import/files.js');

/** يعيد كتابة data في ملف نسخة ويحدّث counts وintegrity. */
async function rewrite(text, mutate) {
  const file = JSON.parse(text);
  mutate(file.data);
  file.counts = countData(file.data);
  file.integrity.hash = await sha256Hex(JSON.stringify(file.data));
  return JSON.stringify(file);
}
const src = newStore();
await seedBundle(src.store, sampleBundle({ videoId: IDS[0] }));
await seedBundle(src.store, sampleBundle({ videoId: IDS[1] }));
const built = await createBackup({ store: src.store, appVersion: '1.1.0', pause: noPause });

// ---- L-12: data.settings متداخلة بعمق d. الملف يُبنى نصًا (JSON.stringify نفسه يفيض بها).
for (const depth of [1000, 5000, 20000, 200000]) {
  const file = JSON.parse(built.text);
  const marker = '"__DEEP__"';
  file.data.settings = '__DEEP__';
  const nested = '{"a":'.repeat(depth) + '1' + '}'.repeat(depth);
  const text = JSON.stringify(file).replace(marker, nested);
  let parsedOk = true;
  try { JSON.parse(text); } catch (e) { parsedOk = `${e.name}`; }
  let result;
  try {
    const r = await readBackup(text, { pause: noPause });
    result = { returned: r.ok ? 'ok' : r.code };
  } catch (e) {
    const frame = (e.stack ?? '').split('\n').find((l) => l.includes('/src/core/backup/')) ?? '';
    result = { threw: `${e.name}: ${e.message}`, at: frame.trim().replace(/^.*\/src\//, 'src/') };
  }
  out(`L-12 depth=${depth}`, { jsonParse: parsedOk, ...result });
}
// عبر الواجهة: ما يراه المستخدم.
{
  const file = JSON.parse(built.text);
  file.data.settings = '__DEEP__';
  const text = JSON.stringify(file).replace('"__DEEP__"', '{"a":'.repeat(200000) + '1' + '}'.repeat(200000));
  const B = newStore();
  const m = await mountSettings(B);
  m.pick(asFile(text));
  await m.settings.data.restoreFromFile();
  await settle(5);
  const t = textOf(section(m, 'البيانات'));
  out('L-12 ui', { shownUnexpected: t.includes(messageFor('TJ_UNEXPECTED')), shownNotBackup: t.includes(messageFor('BK_NOT_BACKUP')), text: t.slice(0, 160) });
}

// ---- L-13: U+202E في اسم ملف الترجمة النشطة وفي عنوان الفيديو.
{
  const RLO = '‮';
  const text = await rewrite(built.text, (d) => {
    d.videos[0].record.title = `محاضرة ${RLO}gpj.exe`;
    d.videos[0].record.arabic.fileName = `invoice${RLO}trs.exe`;
  });
  const r = await readBackup(text, { pause: noPause });
  const B = newStore();
  const m = await mountSettings(B);
  m.pick(asFile(text));
  m.answers.push(true);
  await m.settings.data.restoreFromFile();
  await settle(10);
  const rec = await B.store.getVideo(IDS[0]);
  out('L-13', {
    readOk: r.ok, invalid: r.invalid?.length,
    storedTitleHasRLO: rec?.title.includes(RLO), storedFileNameHasRLO: rec?.arabic.fileName.includes(RLO),
    importDisplayNameStrips: !displayName({ name: `invoice${RLO}trs.exe` }).includes(RLO),
  });
}

// ---- L-24 (أ): كل الفيديوهات تالفة ولا إعدادات: «لا شيء يمكن استعادته» وحده؟
{
  const text = await rewrite(built.text, (d) => {
    d.settings = null;
    d.prefs = null;
    for (const v of d.videos) v.record.rev = 'x';
  });
  const r = await readBackup(text, { pause: noPause });
  const B = newStore();
  const m = await mountSettings(B);
  m.pick(asFile(text));
  await m.settings.data.restoreFromFile();
  await settle(5);
  const t = textOf(section(m, 'البيانات'));
  out('L-24a all-invalid', {
    readOk: r.ok, valid: r.videos?.length, invalid: r.invalid?.map((x) => `${x.code}:${x.detail}`),
    confirmsOpened: m.calls.confirms.length,
    shownNothing: t.includes(messageFor('BK_NOTHING')), mentionsReason: /تالفة|تعذّرت قراءة|BK_VIDEO_INVALID|rev/.test(t),
  });
}
// ---- L-24 (ب): مجموعة إعدادات تالفة ومصطلح تالف: نص التحذير في المعاينة.
{
  const text = await rewrite(built.text, (d) => {
    d.settings.appearance = { font: 'nope' };
    d.prefs.glossary.terms = [{ source: 'ok', target: 'حسن', note: null }, { source: '', target: 'x', note: null }];
  });
  const B = newStore();
  const m = await mountSettings(B);
  m.pick(asFile(text));
  let warning = null;
  m.answers.push((o) => { warning = textOf(o.content).match(/بعض الإعدادات[^\n]*?(?=جديدة|$)/)?.[0] ?? null; return false; });
  await m.settings.data.restoreFromFile();
  out('L-24b warning', { warning });
}
