// تحقق Gemini، ع-٣١ (البند 38): مسندات هوية المرسِل ومضيف طلب الترجمة كانت تُختبر بأضداد بعيدة (موقع غريب، وإضافة أخرى)، فنجت
// طفرات تُرخيها: startsWith إلى includes في isOwnContentScript (N08) وisExtensionPage (N09)، و(^|\.)youtube\.com$ إلى youtube\.com$ في
// readTimedtextParams (M25). هنا أضداد قريبة: تكاد تطابق في كل شيء ولا تطابق، فتفشل بها الطفرات الثلاث.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExtensionPage, isOwnContentScript } from '../../../src/core/model/messages.js';
import { readTimedtextParams } from '../../../src/extract/timedtext-params.js';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const runtime = { id: ID, getURL: (p) => `chrome-extension://${ID}/${p}` };
const TAB = { id: 7 };
const WATCH = 'https://www.youtube.com/watch?v=AAAAAAAAAAA';

test('isOwnContentScript: سكربت ترجمان في تبويب على www.youtube.com وحده', () => {
  assert.equal(isOwnContentScript({ id: ID, tab: TAB, url: WATCH }, runtime), true);
  assert.equal(isOwnContentScript({ id: ID, tab: TAB, url: 'https://www.youtube.com/' }, runtime), true);
});

test('isOwnContentScript: أضداد قريبة من الصواب (مضيف يحوي youtube.com، ورابط يوتيوب في الاستعلام أو المسار، وبروتوكول أو نطاق فرعي آخر)', () => {
  for (const url of [
    'https://www.youtube.com.evil.example/watch?v=AAAAAAAAAAA',
    'https://evil.example/?u=https://www.youtube.com/',
    'https://evil.example/https://www.youtube.com/watch',
    'https://notyoutube.com/watch?v=AAAAAAAAAAA',
    'http://www.youtube.com/watch?v=AAAAAAAAAAA',
    'https://m.youtube.com/watch?v=AAAAAAAAAAA',
    'https://www.youtube.co/watch?v=AAAAAAAAAAA',
    `chrome-extension://${ID}/pages/popup/index.html?from=https://www.youtube.com/`,
  ]) assert.equal(isOwnContentScript({ id: ID, tab: TAB, url }, runtime), false, url);
});

test('isOwnContentScript: الهوية والتبويب والعنوان شروط كلها (كل واحد ينقص وحده)', () => {
  assert.equal(isOwnContentScript({ id: 'otherextensionidotherextensionid', tab: TAB, url: WATCH }, runtime), false, 'إضافة أخرى');
  assert.equal(isOwnContentScript({ id: ID, url: WATCH }, runtime), false, 'بلا تبويب');
  assert.equal(isOwnContentScript({ id: ID, tab: TAB }, runtime), false, 'بلا عنوان');
  assert.equal(isOwnContentScript({ id: ID, tab: TAB, url: new URL(WATCH) }, runtime), false, 'عنوان ليس نصًا');
  assert.equal(isOwnContentScript(null, runtime), false);
});

test('isExtensionPage: صفحة من الإضافة نفسها وحدها', () => {
  assert.equal(isExtensionPage({ id: ID, url: runtime.getURL('pages/popup/index.html') }, runtime), true);
  assert.equal(isExtensionPage({ id: ID, url: runtime.getURL('pages/library/index.html?v=AAAAAAAAAAA') }, runtime), true);
});

test('isExtensionPage: أضداد قريبة من الصواب (عنوان الإضافة داخل عنوان آخر، أو بادئة بلا فاصل)', () => {
  for (const url of [
    `chrome-extension://otherextensionidotherextensionid/x.html?chrome-extension://${ID}/`,
    `https://evil.example/chrome-extension://${ID}/pages/popup/index.html`,
    `${WATCH}#chrome-extension://${ID}/`,
    `chrome-extension://${ID}evil/pages/popup/index.html`,
    `chrome-extension://${ID}`,
    `moz-extension://${ID}/pages/popup/index.html`,
  ]) assert.equal(isExtensionPage({ id: ID, url }, runtime), false, url);
  assert.equal(isExtensionPage({ id: 'otherextensionidotherextensionid', url: runtime.getURL('pages/popup/index.html') }, runtime), false, 'إضافة أخرى بعنوان صفحتنا');
  assert.equal(isExtensionPage({ id: ID }, runtime), false, 'بلا عنوان');
});

test('readTimedtextParams: youtube.com ونطاقاته الفرعية وحدها، لا مضيف ينتهي بالاسم ولا يحويه', () => {
  const q = '/api/timedtext?v=AAAAAAAAAAA&lang=en&fmt=json3';
  for (const host of ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'www.youtube.com:443']) {
    assert.equal(readTimedtextParams(`https://${host}${q}`)?.videoId, 'AAAAAAAAAAA', host);
  }
  for (const host of ['notyoutube.com', 'evil-youtube.com', 'www.notyoutube.com', 'www.youtube.com.evil.example', 'youtube.co', 'youtube.com.evil.example']) {
    assert.equal(readTimedtextParams(`https://${host}${q}`), null, host);
  }
});
