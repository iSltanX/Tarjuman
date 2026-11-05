// PLY-05: exportStudy الحقيقي من المحفوظات بإزاحة 0 ثم +2s وبـ−2s، والمحرّر يستعمل studyTiming+buildStudyText نفسيهما.
const T = '$SCRATCH/tj';
const { exportStudy } = await import(`${T}/src/pages/library/actions.js`);
const { videoRecord } = await import(`${T}/test/helpers/fixtures.js`);
const cues = [
  { n: 1, startMs: 1000, endMs: 2000, text: 'عربي ١.' },
  { n: 2, startMs: 5000, endMs: 6000, text: 'عربي ٢.' },
  { n: 3, startMs: 9000, endMs: 10000, text: 'عربي ٣.' },
];
for (const offset of [0, 2000, -2000, 3000]) {
  const rec = videoRecord({ cues, offset });
  rec.english[0].cues = cues.map((c) => ({ ...c, text: `EN${c.n}` }));
  const store = { getVideo: async () => structuredClone(rec) };
  let file;
  const r = await exportStudy({ store, videoId: rec.videoId, format: 'txt', bilingual: true, save: async (f) => { file = f; return { ok: true }; } });
  const body = file.text.split('\n').slice(3).filter(Boolean);
  console.log(`offset=${offset}`, JSON.stringify(body), 'clamped=', JSON.stringify(r.clamped));
}
