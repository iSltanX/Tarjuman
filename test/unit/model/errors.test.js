// فهرس الأخطاء: بادئات محجوزة لكل مجال، ولا رمز مكرر، ورسائل عربية، وتفاصيل منقّاة؛ وتقرير التشخيص.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMAINS, TjError, hasCode, messageFor, toErrorInfo } from '../../../src/core/errors/index.js';
import { createDiagnosticReport } from '../../../src/core/diagnostics/report.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';

const ARABIC = /[؀-ۿ]/;
// الرسائل العربية الدالّة وعيّناتها (IM_STRAY_TEXT، ع-١٢ ب؛ وPG_LANG_ASSIGN_SKIPPED بالمثنى، تحقق مستقل §١٠): تُفحص بكل صيغة، ولا دالّة خارج هذه القائمة.
const AR_FUNCTION_SAMPLES = {
  IM_STRAY_TEXT: [{ line: 7 }, { line: 7, heading: true }],
  PG_LANG_ASSIGN_SKIPPED: [{ n: 'ترجمة واحدة', count: 1 }, { n: 'ترجمتان', count: 2 }, { n: '3 ترجمات', count: 3 }],
  // الفكرة ٤ (الإنذار المبكر): تسمّي الصيغة المرفوضة إن عُرفت، وبلا اسم كما كانت.
  EX_UNSUPPORTED_FORMAT: [{}, { format: 'srv3' }, { format: 'vtt' }],
  // الفكرة ١١ (ح-49): الملف الثنائي المستورد وإزالة سطر الأصل، والمعدود بعد حرف الجر بصيغه.
  IM_BILINGUAL: [{ count: 1, total: 1 }, { count: 2, total: 3 }, { count: 3, total: 5 }, { count: 11, total: 20 }, { count: 100, total: 150 }, { count: 3, total: 5, line: 'first' }],
  IM_NOTE_BILINGUAL_REMOVED: [{ count: 1 }, { count: 2 }, { count: 3 }, { count: 11 }, { count: 100 }, { count: 3, line: 'first' }],
  // تحقق 2.3.0 (ص-١٨): اسما الجزأين ومعرّف الفيديو معزولة LTR داخل الجملة العربية.
  IM_PARTS_OVERLAP: [{ a: '1', b: '2', from: 3, to: 4 }],
  IM_PARTS_STRAY_NUMBER: [{ a: '1', list: '2500', b: '2' }],
  IM_PARTS_GAP: [{ a: '1', b: '2', from: 5, to: 6 }],
  IM_PATCH_NAME_OTHER_VIDEO: [{ videoId: '-0123456789' }],
};

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
      if (typeof msg === 'function') assert.ok(Object.hasOwn(AR_FUNCTION_SAMPLES, code), `${code}: رسالة دالّة خارج القائمة`);
      for (const text of typeof msg === 'function' ? AR_FUNCTION_SAMPLES[code].map((p) => msg(p)) : [msg]) {
        assert.ok(ARABIC.test(text) && text.trim().length >= 4, `${code}: رسالة عربية`);
      }
    }
  }
  assert.ok(seen.has('EX_WRONG_VIDEO') && seen.has('ST_CONFLICT') && seen.has('TJ_NO_VIDEO'));
});

test('ملفات مجالات المراحل اللاحقة موجودة ببادئاتها ورسائلها مجمَّدة (تملؤها مرحلة المجال في ملفها)', () => {
  const byName = Object.fromEntries(DOMAINS.map((d) => [d.name, d]));
  assert.deepEqual(byName.import.PREFIXES, ['IM_', 'CMP_']);
  assert.deepEqual(byName.overlay.PREFIXES, ['PL_']);
  assert.deepEqual(byName.controls.PREFIXES, ['CT_']);
  assert.deepEqual(byName.pages.PREFIXES, ['PG_']);
  assert.deepEqual(byName.editor.PREFIXES, ['ED_']);
  for (const n of ['import', 'overlay', 'controls', 'pages', 'editor']) assert.ok(Object.isFrozen(byName[n].MESSAGES), n);
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
