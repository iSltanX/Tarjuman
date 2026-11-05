// M-4: إطفاء «صور الفيديو في المحفوظات» (prefs.ui.thumbnails=false) بعد الاستعادة وبعد «مسح كل البيانات».
// عبر صفحتي الإعدادات والمحفوظات كاملتين (DOM وهمي)؛ «الطلب» هنا = عنصر img بعنوان i.ytimg.com في الصفحة (المتصفح يحمّله).
import { IDS, asFile, backup, checkbox, markText, mountLibrary, mountSettings, newStore, noPause, out, sampleBundle, section, seedBundle, settle } from './_h.mjs';

const { createBackup } = backup;

// (أ) ملف التعريف القديم: فيديوهان، والمستخدم أطفأ الصور.
const A = newStore();
await seedBundle(A.store, sampleBundle({ videoId: IDS[0] }));
await seedBundle(A.store, sampleBundle({ videoId: IDS[1] }));
await A.store.setPrefs({ ui: { thumbnails: false } });
const libA = await mountLibrary(A);
const built = await createBackup({ store: A.store, appVersion: '1.1.0', pause: noPause });
const filePrefsUi = JSON.parse(built.text).data.prefs.ui;
out('profile-A', { thumbnailsPref: libA.thumbnailsPref, ytimgRequests: libA.ytimgRequests.length, backupCarriesUi: filePrefsUi });

// (ب) ملف تعريف جديد (نسخة المتجر مثلًا) بلا أي تفضيل: الاستعادة مع «استعادة الإعدادات والقاموس» ثم دونها.
for (const restoreSettings of [true, false]) {
  const B = newStore();
  const m = await mountSettings(B);
  m.pick(asFile(built.text));
  m.answers.push((o) => { checkbox(o.content, 'استعادة الإعدادات والقاموس').checked = restoreSettings; });
  await m.settings.data.restoreFromFile();
  await settle(10);
  const libB = await mountLibrary(B);
  out(`profile-B-restoreSettings=${restoreSettings}`, { thumbnailsPref: libB.thumbnailsPref, ytimgRequests: libB.ytimgRequests });
}

// (ج) وجهة أطفأ فيها المستخدم الصور قبل الاستعادة: تبقى مطفأة (القيمة «للجهاز»).
{
  const C = newStore();
  await C.store.setPrefs({ ui: { thumbnails: false } });
  const m = await mountSettings(C);
  m.pick(asFile(built.text));
  m.answers.push((o) => { checkbox(o.content, 'استعادة الإعدادات والقاموس').checked = true; });
  await m.settings.data.restoreFromFile();
  await settle(10);
  const libC = await mountLibrary(C);
  out('profile-C-already-off', { thumbnailsPref: libC.thumbnailsPref, ytimgRequests: libC.ytimgRequests.length });
}

// (د) في (أ): «مسح كل البيانات» بكتابة «امسح»، ثم استعادة النسخة نفسها في الملف نفسه.
{
  const m = await mountSettings(A);
  const clearBtn = [...m.root.descendants()].find((e) => e.tagName === 'button' && e.textContent.includes('مسح كل البيانات'));
  let dialogBody = null;
  m.answers.push((o) => { dialogBody = o.body; o.content.querySelector('input').value = 'امسح'; });
  clearBtn.click();
  await settle(15);
  const afterClear = (await A.store.getPrefs()).ui.thumbnails;
  const libAfterClear = await mountLibrary(A);
  m.pick(asFile(built.text));
  m.answers.push((o) => { checkbox(o.content, 'استعادة الإعدادات والقاموس').checked = true; });
  await m.settings.data.restoreFromFile();
  await settle(10);
  const libAfterRestore = await mountLibrary(A);
  out('profile-A-clearAll-then-restore', {
    clearMark: markText(section(m, 'التخزين')), dialogBody,
    thumbnailsAfterClear: afterClear, ytimgAfterClear: libAfterClear.ytimgRequests.length,
    thumbnailsAfterRestore: libAfterRestore.thumbnailsPref, ytimgAfterRestore: libAfterRestore.ytimgRequests.length,
  });
}
