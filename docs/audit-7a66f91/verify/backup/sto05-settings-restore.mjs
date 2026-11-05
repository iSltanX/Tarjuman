// STO-05 وTJ-AUD-024b: استعادة «الإعدادات والقاموس» كتابتان منفصلتان (setSettings ثم setPrefs) في runRestore.
// عبر صفحة الإعدادات كاملة (DOM وهمي): فشل setPrefs مرة واحدة بعد نجاح setSettings، ثم تغيير المستخدم للخطوة، ثم «أعد المحاولة».
import { IDS, asFile, backup, buttonNamed, checkbox, errors, mountSettings, newStore, noPause, out, sampleBundle, samplePrefs, section, seedBundle, settle, textOf } from './_h.mjs';

const { createBackup } = backup;
const { TjError, messageFor } = errors;

// المصدر: فيديو واحد، وخطوة 1000، وقاموس بثلاثة مصطلحات ومكان حفظ فرعي.
const src = newStore();
await seedBundle(src.store, sampleBundle({ videoId: IDS[0] }));
await src.store.setSettings({ offsetStepMs: 1000 });
await src.store.setPrefs(samplePrefs());
const built = await createBackup({ store: src.store, appVersion: '1.1.0', pause: noPause });

// الوجهة: افتراضية (خطوة 500، بلا مصطلحات). setPrefs يفشل مرة واحدة فقط.
const dst = newStore();
const calls = { setSettings: 0, setPrefs: 0 };
let failPrefs = true;
const faulty = Object.create(dst.store);
faulty.setSettings = (p) => { calls.setSettings += 1; return dst.store.setSettings(p); };
faulty.setPrefs = (p) => {
  calls.setPrefs += 1;
  if (failPrefs) { failPrefs = false; return Promise.reject(new TjError('ST_WRITE_FAILED')); }
  return dst.store.setPrefs(p);
};
const before = { step: (await dst.store.getSettings()).offsetStepMs, terms: (await dst.store.getPrefs()).glossary.terms.length };
const m = await mountSettings({ store: faulty, area: dst.area });
m.pick(asFile(built.text));
m.answers.push((o) => { checkbox(o.content, 'استعادة الإعدادات والقاموس').checked = true; });
await m.settings.data.restoreFromFile();
await settle(10);
const sec = section(m, 'البيانات');
const firstText = textOf(sec);
const afterFirst = { step: (await dst.store.getSettings()).offsetStepMs, terms: (await dst.store.getPrefs()).glossary.terms.length, saveMode: (await dst.store.getPrefs()).saveLocation.mode };
out('first-run', {
  before, afterFirst,
  shownPartial: firstText.includes(messageFor('BK_RESTORE_PARTIAL')),
  shownSettingsFailedMsg: firstText.includes(messageFor('BK_RESTORE_SETTINGS_FAILED')),
  settingsFailedMsg: messageFor('BK_RESTORE_SETTINGS_FAILED'),
  reportLine: (firstText.match(/أضيف \d+ · تُخطّي \d+ · استُبدل \d+ · تعذّر \d+/) ?? [null])[0],
  retryButton: !!buttonNamed(sec, 'أعد المحاولة'),
  calls: { ...calls },
});

// المستخدم يغيّر الخطوة إلى 900 بعد التقرير (من هذه الصفحة أو تبويب آخر)، ثم يضغط «أعد المحاولة».
await dst.store.setSettings({ offsetStepMs: 900 });
const userStep = (await dst.store.getSettings()).offsetStepMs;
buttonNamed(sec, 'أعد المحاولة').click();
await settle(15);
const secondText = textOf(sec);
const afterRetry = { step: (await dst.store.getSettings()).offsetStepMs, terms: (await dst.store.getPrefs()).glossary.terms.length };
out('retry', {
  userStep, afterRetry,
  settingsRetried: calls.setSettings === 2 && calls.setPrefs === 2,
  shownDone: secondText.includes(messageFor('BK_RESTORE_DONE')),
  shownRestoredLine: secondText.includes('استُعيدت الإعدادات والقاموس.'),
  calls: { ...calls },
});
m.settings.dispose?.();
