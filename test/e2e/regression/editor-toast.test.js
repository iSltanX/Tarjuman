// إصلاح تكامل P9 (ملاحظة W4 من لقطة w4-editor-saved): رسالة «حُفظ ✓» العابرة كانت ثابتة أعلى منتصف النافذة فتغطي
// عنوان الفيديو في رأس المحرّر. صارت داخل الرأس، مطلقة الموضع تحته عند طرفه (تحت «حفظ» في RTL). الإثبات البصري
// بقياس المستطيلين في الاختبار الحي (test/e2e/live)؛ وهنا ما يمنع رجوعها إلى الموضع القديم.
//   node scripts/run-tests.mjs test/e2e/regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../../../src/pages/editor/editor.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../../../src/pages/editor/app.js', import.meta.url), 'utf8');
/** كل قواعد المحدد في الملف مجموعة (قد يتكرر المحدد في أكثر من قاعدة). */
const rule = (sel) => {
  const re = new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'g');
  const bodies = [...css.matchAll(re)].map((m) => m[1].replace(/\s+/g, ' ').trim());
  return bodies.length ? bodies.join(' ') : null;
};

test('الرسالة العابرة داخل رأس المحرّر لا في آخر الصفحة', () => {
  assert.match(app, /headEl\.appendChild\(toastEl\);/);
  const appended = /app\.append\(([\s\S]*?)\);/.exec(app)?.[1] ?? '';
  assert.doesNotMatch(appended, /toastEl/, 'لا تُلحق بالصفحة مرة ثانية');
});

test('موضعها تحت الرأس عند طرفه، والرأس مرجع موضعها', () => {
  assert.match(rule('.ed-head') ?? '', /position: relative;/);
  const toast = rule('.ed-toast') ?? '';
  assert.match(toast, /position: absolute;/);
  assert.match(toast, /top: calc\(100% \+ 8px\);/);
  assert.match(toast, /inset-inline-end: 20px;/);
  assert.doesNotMatch(toast, /position: fixed|left: 50%/, 'لا عودة إلى منتصف أعلى النافذة');
  assert.equal(rule('.ed-toast.is-shown'), 'opacity: 1; transform: none;');
});
