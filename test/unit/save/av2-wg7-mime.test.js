// AV2 U-045: رجوع Blob يحمل نوع الامتداد لا SRT دائمًا (.json وبقية SAVE_TYPES).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_TYPES, saveFile } from '../../../src/core/save/index.js';
import { SRT_MIME, download } from '../../../src/core/export/download.js';

function sink() {
  const saved = [];
  const win = {
    URL: { createObjectURL: (b) => b, revokeObjectURL() {} },
    Blob: class { constructor(parts, opts) { this.type = opts?.type; } },
    setTimeout() {},
  };
  const doc = {
    body: { append() {} },
    createElement: () => ({ style: {}, click() { saved.push({ name: this.download, type: this.href.type }); }, remove() {} }),
    defaultView: win,
  };
  return { doc, saved };
}

test('AV2 U-045: رجوع Blob يعطي نوع كل امتداد من SAVE_TYPES (بلا واجهة تنزيلات ولا رسائل)', async () => {
  for (const [ext, mime] of Object.entries(SAVE_TYPES)) {
    const { doc, saved } = sink();
    const r = await saveFile({ name: `x.${ext}`, text: 'a' }, { api: {}, doc });
    assert.equal(r.mode, 'blob');
    assert.equal(saved[0].type, mime, ext);
  }
});

test('AV2 U-045: رجوع Blob بعد فشل التنزيل في صفحة الإضافة يحمل نوع .json', async () => {
  const { doc, saved } = sink();
  const api = { downloads: { download: async () => { throw new Error('blocked'); }, search: async () => [] } };
  const store = { getPrefs: async () => ({ saveLocation: { mode: 'downloads' } }), setLastSave: async () => {} };
  const r = await saveFile({ name: 'x.json', text: '{}' }, { api, store, doc });
  assert.equal(r.mode, 'blob');
  assert.equal(saved[0].type, SAVE_TYPES.json);
});

test('AV2 U-045: download() يستعمل file.mime وإلا SRT_MIME', () => {
  const a = sink();
  download({ name: 'a.json', text: '{}', mime: 'application/json' }, { doc: a.doc });
  assert.equal(a.saved[0].type, 'application/json');
  const b = sink();
  download({ name: 'a.srt', text: '1' }, { doc: b.doc });
  assert.equal(b.saved[0].type, SRT_MIME);
});
