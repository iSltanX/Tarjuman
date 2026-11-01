// معرّف الإضافة غير المعبأة من مسارها المطلق (كما يحسبه Chromium): sha256 ← أول 32 رقمًا ست عشريًا ← a…p.
import { createHash } from 'node:crypto';
import path from 'node:path';

export function unpackedIdOf(dir) {
  return createHash('sha256').update(path.resolve(dir)).digest('hex').slice(0, 32)
    .split('').map((h) => String.fromCharCode(97 + parseInt(h, 16))).join('');
}
