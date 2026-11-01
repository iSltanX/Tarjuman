#!/usr/bin/env node
// يولّد جداول مختصرة من ملفات التشغيل المنقّاة (docs/evidence/P1/runs/*.json) لتُنسخ إلى live-results.md.
// التشغيل: node test/live/p1/report.mjs <ملف.json> [ملف.json …]
import { readFile } from 'node:fs/promises';

const pct = (x) => (x == null ? '—' : `${Math.round(x * 1000) / 10}%`);
const inv = (a) => (a?.invariants ? (a.invariants.every((r) => r.ok) ? '6/6' : `${a.invariants.filter((r) => r.ok).length}/6 (${a.invariants.filter((r) => !r.ok).map((r) => r.key).join('، ')})`) : a?.code || '—');

for (const file of process.argv.slice(2)) {
  const r = JSON.parse(await readFile(file, 'utf8'));
  console.log(`\n### ${r.browser} — ${r.version?.product} — ${r.startedAt} — الحساب: ${r.account}\n`);
  if (r.errors?.length) console.log(`أخطاء: ${r.errors.map((e) => `${e.step}: ${e.error}`).join(' · ')}\n`);
  const m = r.steps.measure || [];
  if (m.length) {
    console.log('| القياس | الفيديو | طلبات قبل CC | بعد CC | إعادة بعد الإيقاف/التشغيل | fmt | pot | kind | caps=asr | من الذاكرة | الحالة | البايتات |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const x of m) {
      for (const t of x.timedtext) {
        console.log(`| ${x.label} | ${x.videoId} | ${x.requestsBeforeClick} | ${x.requestsAfterOn} | ${x.toggleReRequested ? 'نعم' : 'لا'} | ${t.format} | ${t.hasPot ? 'موجود' : 'غائب'} | ${t.kindParam ?? '—'} | ${t.capsAsr ? 'نعم' : 'لا'} | ${t.fromCache ? 'نعم' : 'لا'} | ${t.status} | ${t.bodyBytes} |`);
      }
    }
  }
  const c = r.steps.capture || [];
  if (c.length) {
    console.log('\n| الالتقاط | الفيديو | المدة (ث) | النوع | الحجم | الأحداث النصية | المقاطع | الكلمات | مكرر | الثوابت | الاكتمال | الجسم = الشبكة |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const x of c) {
      const a = x.snapshot?.accepted?.find((y) => y.videoId === x.videoId);
      console.log(`| ${x.label} | ${x.videoId} | ${Math.round(x.info?.duration ?? 0)} | ${a?.trackKind ?? '—'} | ${a?.bodyLength ?? '—'} | ${a?.report?.stats?.textEvents ?? '—'} | ${a?.report?.cueCount ?? '—'} | ${a?.report?.sourceWords ?? '—'} | ${a?.report?.duplicatesRemoved ?? '—'} | ${inv(a)} | ${pct(a?.report?.completeness)} | ${x.bodyMatchesNetwork ? 'نعم' : 'لا'} |`);
    }
  }
  for (const p of r.steps.positions || []) {
    if (p.skipped) continue;
    console.log(`\nالمواضع ${p.label} (${p.videoId}، بذرة ${p.seed}): ${p.matched}/${p.total} · آخر توقيت ${p.lastEndMs}ms من ${Math.round(p.durationSec * 1000)}ms (${pct(p.completeness)})`);
    console.log(p.checks.map((k) => `${k.t}ms:${k.verdict}`).join(' · '));
  }
  const n = r.steps.nav;
  if (n) console.log(`\nالتنقل: ${n.steps.length} خطوة · التقاط خاطئ مقبول ${n.wrongAcceptedTotal} · وصل ${n.steps.filter((s) => s.arrived).length}`);
  const h = r.steps.hover;
  if (h) console.log(`التمرير: طلبات timedtext ${h.timedtext.length} · مقبول من المعاينات ${h.acceptedFromHover}`);
  const s = r.steps.special;
  if (s?.noCaptions) console.log(`بلا ترجمة: مسارات ${s.noCaptions.tracks.length} · طلبات ${s.noCaptions.timedtext.length} · مقبول ${s.noCaptions.snapshot?.accepted.length}`);
  if (s?.tlang) console.log(`tlang: القائمة ${s.tlang.menu} · طلبات بـtlang ${s.tlang.timedtext.filter((t) => t.hasTlang).length} · مرفوض ${s.tlang.snapshot?.rejected.filter((x) => x.code === 'EX_TRANSLATED_TRACK').length}`);
  if (r.steps.download) console.log(`التنزيل: ${JSON.stringify(r.steps.download)}`);
  if (r.steps.storage) console.log(`المخزن: ${JSON.stringify(r.steps.storage)}`);
  if (r.steps.experiments) console.log(`التجارب: ${JSON.stringify(r.steps.experiments)}`);
}
