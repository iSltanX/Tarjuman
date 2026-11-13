// الفكرة ٣-أ (ح-39 وح-41): حين إذن يوتيوب مسحوب (siteOff، B5-أ) تبقى ملاحظة TJ_SITE_ACCESS_OFF بنصها المعتمد، وتحتها زر «امنح الإذن من
// الإعدادات» يفتح الإعدادات على قسم «التشخيص» (وفيه زر «السماح») ويُغلق النافذة. والنافذة نفسها لا تطلب إذنًا. وفي غير siteOff لا زر.
// تُحمَّل نقطة الدخول pages/popup/main.js ببيئة وهمية (c8-entry-env) مرة واحدة في هذه العملية، على تبويب مجهول العنوان بلا رد وإذن
// يوتيوب مسحوب.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { setLocale } from '../../../../src/i18n/index.js';
import { isSectionId } from '../../../../src/pages/settings/model.js';
import { SITE_ACCESS_SECTION, missAction } from '../../../../src/pages/popup/status.js';
import { notVideoNote } from '../../../../src/pages/popup/view.js';
import { createEntryEnv } from '../../../helpers/c8-entry-env.js';
import { findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const ARABIC = /[؀-ۿ]/;

test('الفكرة ٣-أ: siteOff وحده له رابط، إلى قسم «التشخيص» في الإعدادات', () => {
  assert.deepEqual(missAction('siteOff'), { label: 'امنح الإذن من الإعدادات', hash: 'diagnostics' });
  for (const miss of [null, 'stale', 'elsewhere', 'unknown']) assert.equal(missAction(miss), null, String(miss));
  assert.equal(SITE_ACCESS_SECTION, 'diagnostics');
  assert.ok(isSectionId(SITE_ACCESS_SECTION), 'قسم موجود في الإعدادات');
  setLocale('en');
  try {
    const en = missAction('siteOff');
    assert.equal(ARABIC.test(en.label), false, en.label);
    assert.equal(en.label, 'Grant permission in Settings');
  } finally {
    setLocale('ar');
  }
});

test('الفكرة ٣-أ: الملاحظة تحمل الإجراء تحت نصها إن مُرّر، وبدونه كما كانت', () => {
  const doc = newDocument();
  const plain = notVideoNote(doc, 'نص');
  assert.equal(findAll(plain, (e) => e.tagName === 'button').length, 0);
  const action = doc.createElement('button');
  action.textContent = 'زر';
  const withAction = notVideoNote(doc, 'نص', action);
  assert.ok(findAll(withAction, (e) => e.tagName === 'button')[0] === action);
  assert.equal(textOf(withAction), 'نصزر');
});

const env = createEntryEnv({
  tabs: {
    query: async () => [{ id: 7 }],
    sendMessage: async () => { throw new Error('Could not establish connection. Receiving end does not exist.'); },
  },
});
env.chrome.permissions = { asked: [], async contains(p) { this.asked.push(p); return false; } };

const restoreLoad = env.install();
try {
  await import('../../../../src/pages/popup/main.js');
  await settle(30);
  await new Promise((r) => setImmediate(r));
  await settle(30);
} finally {
  restoreLoad();
}
const linkButton = () => env.doc.querySelectorAll('button').find((b) => b.getAttribute('data-action') === 'site-access') ?? null;

test('الفكرة ٣-أ: النافذة على إذن مسحوب: نص TJ_SITE_ACCESS_OFF كما هو، وتحته زر «امنح الإذن من الإعدادات»، ولا طلب إذن', () => {
  const note = env.doc.querySelectorAll('div').find((d) => String(d.className).split(' ').includes('tj-popup__note'));
  assert.ok(note, 'الملاحظة ظاهرة');
  assert.ok(textOf(note).includes(messageFor('TJ_SITE_ACCESS_OFF')), 'النص المعتمد بلا تغيير');
  const b = linkButton();
  assert.ok(b, 'الزر ظاهر');
  assert.equal(textOf(b), 'امنح الإذن من الإعدادات');
  assert.ok(note.contains(b), 'الزر داخل الملاحظة');
  assert.deepEqual(env.chrome.permissions.asked, [{ origins: ['https://www.youtube.com/*'] }], 'سؤال contains وحده');
  assert.equal('request' in env.chrome.permissions, false);
});

test('الفكرة ٣-أ: الزر يفتح الإعدادات على «التشخيص» في تبويب جديد ويُغلق النافذة', async () => {
  const restore = env.install();
  try {
    linkButton().dispatchEvent({ type: 'click' });
    await settle(10);
  } finally {
    restore();
  }
  assert.deepEqual(env.created, [{ url: 'chrome-extension://tj/pages/settings/index.html#diagnostics' }]);
  assert.equal(env.win.closed, true);
});
