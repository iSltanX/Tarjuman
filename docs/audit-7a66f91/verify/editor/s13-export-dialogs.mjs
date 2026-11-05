// TJ-AUD-020 (جزء export-dialogs.js): سطرا «اسم الملف» والملاحظة يُضافان فارغين؟ وهل لهما role=note؟
import { ROOT, log, editorDocument, textOf, settle } from './harness.mjs';

const { openReportDialog, openStudyDialog } = await import(`${ROOT}/src/pages/editor/export-dialogs.js`);

const inspect = (label, dlg) => {
  const stack = dlg.querySelector('.tj-stack');
  const kids = [...stack.children].map((c) => `${c.tagName}${c.className ? `.${c.className.split(' ').join('.')}` : ''}${c.getAttribute('role') ? `[role=${c.getAttribute('role')}]` : ''}=${JSON.stringify(textOf(c)).slice(0, 40)}`);
  log(`${label}:`, kids.join(' | '));
  const empties = [...stack.children].filter((c) => !textOf(c) && !c.children.length);
  log(`${label}: عناصر فارغة داخل الحزمة = ${empties.length} (${empties.map((c) => `${c.tagName}.${c.className}`).join(', ')})`);
};

{
  const env = editorDocument({ videoId: 'AAAAAAAAAAA' });
  const p = openStudyDialog({ doc: env.doc, hasEnglish: true, build: () => ({ file: { name: 'AAAAAAAAAAA.ar.study.md', text: 'x' }, note: '' }) });
  await settle();
  const dlg = env.doc.querySelector('dialog[open]');
  inspect('نص دراسي (بلا ملاحظة توقيت)', dlg);
  dlg.close('cancel');
  await p;
}
{
  const env = editorDocument({ videoId: 'AAAAAAAAAAA' });
  const p = openReportDialog({ doc: env.doc, build: () => ({ count: 0, file: null }) });
  await settle();
  const dlg = env.doc.querySelector('dialog[open]');
  inspect('تقرير مراجعة (لا بنود)', dlg);
  dlg.close('cancel');
  await p;
}
