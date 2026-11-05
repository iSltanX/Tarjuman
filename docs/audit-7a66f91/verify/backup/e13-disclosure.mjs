// E-13: إفصاح عمليات البيانات — نص «مسح كل البيانات»، و«استعادة الإعدادات والقاموس» تستبدل مصطلحات القاموس كلها بلا عدّ.
import { IDS, asFile, backup, checkbox, mountSettings, newStore, noPause, out, sampleBundle, samplePrefs, section, seedBundle, settle, textOf } from './_h.mjs';

const { createBackup } = backup;
const src = newStore();
await seedBundle(src.store, sampleBundle({ videoId: IDS[0] }));
await src.store.setPrefs(samplePrefs()); // 3 مصطلحات: prompt وtoken وfine-tuning، ومجلد فرعي
const built = await createBackup({ store: src.store, appVersion: '1.1.0', pause: noPause });

const dst = newStore();
await dst.store.setPrefs({ glossary: { attach: true, terms: [{ source: 'agent', target: 'وكيل', note: null }, { source: 'embedding', target: 'تضمين', note: null }] }, saveLocation: { mode: 'ask', folder: 'Tarjuman' } });
const m = await mountSettings(dst);
// نص المسح في الحوار وتحت الزر.
const storageText = textOf(section(m, 'التخزين'));
m.pick(asFile(built.text));
let previewText = '';
m.answers.push((o) => { previewText = textOf(o.content); checkbox(o.content, 'استعادة الإعدادات والقاموس').checked = true; });
await m.settings.data.restoreFromFile();
await settle(10);
const after = await dst.store.getPrefs();
out('E-13', {
  clearNote: storageText.match(/يحذف كل[^.]*\./)?.[0] ?? null,
  clearNoteMentions: { glossary: /القاموس|مصطلح/.test(storageText), saveLocation: /مكان الحفظ/.test(storageText), uiSwitches: /الواجهة|الصور/.test(storageText) },
  previewMentionsGlossaryCount: /مصطلح/.test(previewText), previewSettingsLabel: previewText.includes('استعادة الإعدادات والقاموس'),
  localTermsBefore: ['agent', 'embedding'], termsAfter: after.glossary.terms.map((t) => t.source), saveModeAfter: after.saveLocation.mode,
});
