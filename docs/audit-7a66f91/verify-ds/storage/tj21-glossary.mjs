// TJ-21 (DATA-007): «استعادة الإعدادات والقاموس» تستبدل مصطلحات القاموس كلها. سيناريو DeepSeek (مصطلح أضيف بعد النسخة في الملف نفسه)
// عبر صفحة الإعدادات الحقيقية، والحالة القصوى: نسخة بقاموس فارغ، والضابط: الخيار غير مختار.
import { asFile, backup, checkbox, mountSettings, newStore, noPause, out, samplePrefs, sampleBundle, seedBundle, settle, textOf, IDS } from './_h.mjs';
const { createBackup } = backup;

for (const kase of ['term-added-after-backup', 'backup-with-empty-glossary', 'option-unchecked']) {
  const src = newStore();
  await seedBundle(src.store, sampleBundle({ videoId: IDS[0] }));
  if (kase !== 'backup-with-empty-glossary') await src.store.setPrefs(samplePrefs());
  const built = await createBackup({ store: src.store, appVersion: '1.1.0', pause: noPause });
  // سيناريو DeepSeek: المتصفح نفسه، ومصطلح محلي أضيف بعد إنشاء النسخة.
  const dst = kase === 'term-added-after-backup' ? src : newStore();
  const before = (await dst.store.getPrefs()).glossary.terms.map((t) => t.source);
  await dst.store.setPrefs({ glossary: { attach: true, terms: [...(await dst.store.getPrefs()).glossary.terms, { source: 'local-only', target: 'محلي فقط', note: null }] } });
  const m = await mountSettings(dst);
  m.pick(asFile(built.text));
  let previewText = '';
  m.answers.push((o) => { previewText = textOf(o.content); if (kase !== 'option-unchecked') checkbox(o.content, 'استعادة الإعدادات والقاموس').checked = true; });
  await m.settings.data.restoreFromFile();
  await settle(10);
  const after = (await dst.store.getPrefs()).glossary.terms.map((t) => t.source);
  out(`TJ-21 ${kase}`, {
    termsInBackup: JSON.parse(built.text).data.prefs.glossary.terms.map((t) => t.source), termsBeforeRestore: [...before, 'local-only'], termsAfter: after,
    localTermKept: after.includes('local-only'), previewMentionsTerms: /مصطلح|يُستبدل قاموسك|القاموس الحالي/.test(previewText),
    previewSnippet: previewText.match(/استعادة الإعدادات والقاموس[^]{0,80}/)?.[0] ?? null,
  });
}
