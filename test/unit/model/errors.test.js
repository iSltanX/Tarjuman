// فهرس الأخطاء: بادئات محجوزة لكل مجال، ولا رمز مكرر، ورسائل عربية، وتفاصيل منقّاة؛ وتقرير التشخيص.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMAINS, TjError, hasCode, messageFor, toErrorInfo } from '../../../src/core/errors/index.js';
import { createDiagnosticReport } from '../../../src/core/diagnostics/report.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';

const ARABIC = /[؀-ۿ]/;

test('كل رمز يبدأ ببادئة مجاله، ولا بادئة لمجالين، ولا رمز مكرر', () => {
  const owners = new Map();
  for (const d of DOMAINS) {
    for (const p of d.PREFIXES) {
      assert.ok(!owners.has(p), `البادئة ${p} لمجالين: ${owners.get(p)} و${d.name}`);
      owners.set(p, d.name);
    }
  }
  const seen = new Set();
  for (const d of DOMAINS) {
    for (const [code, msg] of Object.entries(d.MESSAGES)) {
      assert.match(code, /^[A-Z]+_[A-Z0-9_]+$/, code);
      assert.ok(d.PREFIXES.some((p) => code.startsWith(p)), `${code} خارج بادئات ${d.name}`);
      assert.ok(!seen.has(code), `${code} مكرر`);
      seen.add(code);
      assert.ok(ARABIC.test(msg) && msg.trim().length >= 4, `${code}: رسالة عربية`);
    }
  }
  assert.ok(seen.has('EX_WRONG_VIDEO') && seen.has('ST_CONFLICT') && seen.has('TJ_NOT_IMPLEMENTED'));
});

test('ملفات مجالات المراحل اللاحقة موجودة ببادئاتها وفارغة', () => {
  const byName = Object.fromEntries(DOMAINS.map((d) => [d.name, d]));
  assert.deepEqual(byName.import.PREFIXES, ['IM_', 'CMP_']);
  assert.deepEqual(byName.overlay.PREFIXES, ['PL_']);
  assert.deepEqual(byName.controls.PREFIXES, ['CT_']);
  assert.deepEqual(byName.pages.PREFIXES, ['PG_']);
  assert.deepEqual(byName.editor.PREFIXES, ['ED_']);
  for (const n of ['import', 'overlay', 'controls', 'pages', 'editor']) assert.deepEqual(byName[n].MESSAGES, {});
});

test('TjError: رسالة عربية بالقالب، وتفاصيل منقّاة ومقصورة', () => {
  const e = new TjError('MD_NEGATIVE_TIME', { params: { list: '1، 2' }, detail: 'see https://www.youtube.com/api/timedtext?v=x&pot=AAAAAAAAAAAAAAAAAAAAAAAA' });
  assert.match(e.message, /قبل بداية الفيديو: 1، 2\./);
  assert.equal(findSecrets(e.detail).length, 0, e.detail);
  assert.deepEqual(Object.keys(e.toJSON()), ['code', 'message', 'detail']);
  assert.equal(messageFor('XX_UNKNOWN'), 'XX_UNKNOWN');
  assert.equal(hasCode('XX_UNKNOWN'), false);
  const info = toErrorInfo(new TypeError('boom at https://example.com/a'));
  assert.equal(info.code, 'TJ_UNEXPECTED');
  assert.equal(findSecrets(info.detail).length, 0);
  assert.equal(toErrorInfo(e).code, 'MD_NEGATIVE_TIME');
});

test('تقرير التشخيص: بلا نص ترجمة ولا عنوان ولا رابط ولا رمز', () => {
  const r = createDiagnosticReport({
    version: '0.2.0',
    browser: 'Brave 1.98',
    at: '2026-11-01T12:00:00.000Z',
    sections: {
      store: { bytesInUse: 1234, videos: 3 },
      extract: { code: 'EX_EMPTY_BODY', bodyLength: 0, url: 'https://www.youtube.com/api/timedtext?pot=x', body: '{"events":[]}' },
      video: { title: 'Secret talk', cues: [{ text: 'سطر' }], text: 'سطر' },
    },
  });
  const s = JSON.stringify(r);
  assert.equal(findSecrets(s).length, 0, s);
  for (const leaked of ['Secret talk', 'سطر', 'events']) assert.equal(s.includes(leaked), false, leaked);
  assert.equal(r.sections.store.bytesInUse, 1234);
  assert.equal(r.sections.extract.code, 'EX_EMPTY_BODY');
});
