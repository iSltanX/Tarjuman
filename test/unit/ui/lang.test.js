// اسم لغة الأصل المشترك (src/ui/lang.js، مراجعة الهوية L1): دالة واحدة للوحة والشريط بلا شظايا لاتينية ولا «root».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { languageName } from '../../../src/ui/lang.js';
import { languageName as panelName } from '../../../src/player/panel/text.js';
import { languageName as barName } from '../../../src/player/controls/text.js';

const ar = new Intl.DisplayNames(['ar'], { type: 'language' });

test('الرمز الفعلي باسمه العربي، والشرطة السفلية كالشرطة، واللهجة حين تُطلب', () => {
  assert.equal(languageName('en'), ar.of('en'));
  assert.equal(languageName('fr'), ar.of('fr'));
  assert.equal(languageName('en_US'), languageName('en-US'), 'en_US كـen-US لا رمزًا خامًا');
  assert.notEqual(languageName('en_US'), 'en_US');
  assert.equal(languageName('en-GB', { region: false }), ar.of('en'), 'اللغة الأساسية وحدها');
  assert.equal(languageName('en-GB'), ar.of('en-GB'), 'باللهجة');
});

test('لا شظية لاتينية ولا «root»: en-orig ← اللغة الأساسية، وund وroot ← null', () => {
  assert.equal(languageName('en-orig'), ar.of('en'));
  assert.ok(!/[A-Za-z]/.test(languageName('en-orig')));
  for (const c of ['und', 'root', 'UND', 'und-Latn']) assert.equal(languageName(c), null, c);
  assert.equal(languageName(''), null);
  assert.equal(languageName(null), null);
  assert.equal(languageName('zzzz-invalid-???'), 'zzzz-invalid-???', 'ما لا يعرفه المتصفح يبقى رمزه');
  assert.equal(languageName('en', { DisplayNames: null }), 'en', 'بلا Intl.DisplayNames ← الرمز');
});

test('اللوحة والشريط من الدالة نفسها: اللوحة بلا لهجة ونص فارغ لغير المحدد، والشريط باللهجة وnull', () => {
  assert.equal(panelName('en-GB'), ar.of('en'));
  assert.equal(barName('en-GB'), ar.of('en-GB'));
  assert.equal(panelName('und'), '');
  assert.equal(barName('und'), null);
  assert.equal(panelName('en_US'), ar.of('en'));
  assert.equal(barName('en-orig'), ar.of('en'));
});
