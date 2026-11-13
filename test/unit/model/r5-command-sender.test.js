// الفكرة ١٠، المسار (ب) (ح-55): سكربت المحتوى يقبل tj:command من العامل الخلفي للإضافة نفسها وحده (isBackgroundSender)، لا من صفحاتها
// (النافذة والإعدادات والمحفوظات) ولا من غيرها. وعلى نمط gemini-sender.test.js: أضداد قريبة تكاد تطابق في كل شيء ولا تطابق، فتفشل بها
// طفرات ترخي المسند (startsWith بدل المساواة، أو إسقاط شرط التبويب أو الهوية).
//   Chromium: عامل الخدمة background/worker.js كما في البيان. Firefox: صفحة الخلفية التي يولّدها من background.scripts
//   (_generated_background_page.html). ولم يثبت حيًا عنوان المرسِل في Firefox بعد (القيود).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBackgroundSender } from '../../../src/core/model/messages.js';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const chromium = { id: ID, getURL: (p) => `chrome-extension://${ID}/${p}` };
const FX_UUID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const firefox = { id: 'tarjuman@bysltan.com', getURL: (p) => `moz-extension://${FX_UUID}/${p}` };

test('isBackgroundSender: عامل Chromium وصفحة خلفية Firefox للإضافة نفسها', () => {
  assert.equal(isBackgroundSender({ id: ID, url: `chrome-extension://${ID}/background/worker.js`, origin: `chrome-extension://${ID}` }, chromium), true);
  assert.equal(isBackgroundSender({ id: 'tarjuman@bysltan.com', url: `moz-extension://${FX_UUID}/_generated_background_page.html` }, firefox), true);
});

test('isBackgroundSender: صفحات الإضافة نفسها (النافذة والإعدادات والمحفوظات والمحرّر) ليست العامل', () => {
  for (const p of ['pages/popup/index.html', 'pages/settings/index.html#display', 'pages/library/index.html', 'pages/editor/index.html?v=AAAAAAAAAAA', 'ui/gallery/index.html']) {
    assert.equal(isBackgroundSender({ id: ID, url: chromium.getURL(p) }, chromium), false, p);
    assert.equal(isBackgroundSender({ id: 'tarjuman@bysltan.com', url: firefox.getURL(p) }, firefox), false, `firefox ${p}`);
  }
});

test('isBackgroundSender: أضداد قريبة من عنوان العامل (لاحقة، واستعلام، وجزء، ومسار آخر، وبروتوكول آخر، وإضافة أخرى)', () => {
  for (const url of [
    `chrome-extension://${ID}/background/worker.js.evil`,
    `chrome-extension://${ID}/background/worker.js?x=1`,
    `chrome-extension://${ID}/background/worker.js#x`,
    `chrome-extension://${ID}/background/other.js`,
    `chrome-extension://${ID}/pages/background/worker.js`,
    `chrome-extension://${ID}evil/background/worker.js`,
    `chrome-extension://otherextensionidotherextensionid/background/worker.js`,
    `moz-extension://${ID}/background/worker.js`,
    `https://www.youtube.com/background/worker.js`,
    `chrome-extension://${ID}/_generated_background_page.html.x`,
  ]) assert.equal(isBackgroundSender({ id: ID, url }, chromium), false, url);
  assert.equal(isBackgroundSender({ id: 'otherextensionidotherextensionid', url: chromium.getURL('background/worker.js') }, chromium), false, 'هوية أخرى بعنوان العامل');
});

test('isBackgroundSender: كل شرط ينقص وحده (تبويب، وعنوان، وهوية، ومرسِل)', () => {
  const worker = chromium.getURL('background/worker.js');
  assert.equal(isBackgroundSender({ id: ID, url: worker, tab: { id: 3 } }, chromium), false, 'مرسِل في تبويب ليس العامل');
  assert.equal(isBackgroundSender({ id: ID }, chromium), false, 'بلا عنوان');
  assert.equal(isBackgroundSender({ id: ID, url: new URL(worker) }, chromium), false, 'عنوان ليس نصًا');
  assert.equal(isBackgroundSender({ url: worker }, chromium), false, 'بلا هوية');
  assert.equal(isBackgroundSender(null, chromium), false);
  assert.equal(isBackgroundSender(undefined, chromium), false);
  // سكربت محتوى ترجمان نفسه على يوتيوب (يحمل tab وعنوان الصفحة).
  assert.equal(isBackgroundSender({ id: ID, tab: { id: 3 }, url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' }, chromium), false);
});
