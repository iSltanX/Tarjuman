// DS-I4 / DS-S8 (DATA-008): إنشاء النسخة الاحتياطية يُسقط الفيديو كله إن تلف تابع واحد ولو صح سجله. ولكل تابع تالف (alts، prev،
// marks، bundle): هل السجل نفسه صالح؟ وهل تُقرأ ترجمته النشطة في أي مسار؟ وهل الإنقاذ بـbundleFromRecord ممكن؟
import { load, out, settle, clockFrom } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createBackup, readBackup } = await load('src/core/backup/index.js');
const { bundleFromRecord, bundleToBackup } = await load('src/core/model/bundle.js');
const { validateVideoRecord } = await load('src/core/model/video.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const ID = 'DDDDDDDDDDD';
for (const kind of ['alts', 'prev', 'marks', 'bundle']) {
  const now = clockFrom();
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now });
  await seedBundle(store, sampleBundle({ videoId: ID, third: true }));
  area.rawSet(`${kind}:${ID}`, { schema: 1, videoId: ID, broken: true });
  await area.flush();
  const built = await createBackup({ store, appVersion: 't', now, pause: async () => {} });
  const rec = area.dump()[`video:${ID}`];
  const salvage = bundleToBackup(bundleFromRecord(rec));
  const salvageText = JSON.stringify({ ...JSON.parse(built.text), data: { ...JSON.parse(built.text).data, videos: [salvage] } });
  out(`DS-I4 ${kind} تالف`, {
    skipped: built.skipped, included: JSON.parse(built.text).data.videos.length,
    recordValid: validateVideoRecord(rec).ok, getVideo: (await settle(store.getVideo(ID))).code ?? 'ok',
    salvageActiveFile: salvage.record.arabic?.fileName ?? null, salvageLosesSlots23: salvage.alts.every((x) => x === null),
  });
  void salvageText; void readBackup;
}
