// أدوات مشتركة لسكربتات التحقق من بنود DeepSeek (مجال pipeline). كلها تستورد الوحدات الحقيقية من النسخة المعزولة.
import { readFileSync } from 'node:fs';
export const T = '$SCRATCH/tj';
export const mod = (p) => import(`${T}/src/${p}`);
export const fixture = (p) => readFileSync(`${T}/test/fixtures/${p}`, 'utf8');
export const TED = () => JSON.parse(fixture('json3/manual-ted-iG9CE55wbtY.json'));
export const ASR = () => JSON.parse(fixture('json3/asr-nwc-Y9rkKtK1b44.json'));
export const TED_DUR = 1203421;
export const ASR_DUR = 3000000;
/** كائن شبيه بـFile. */
export function fileOf(content, name = 'translation.ar.srt') {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), text: async () => new TextDecoder().decode(bytes) };
}
export const out = (k, v) => console.log(`${k} :: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
export const tryIt = (fn) => { try { return { ok: true, value: fn() }; } catch (e) { return { threw: `${e.constructor.name}${e.code ? `(${e.code})` : ''}: ${String(e.message).slice(0, 120)}` }; } };
export const tryAsync = async (fn) => { try { return { ok: true, value: await fn() }; } catch (e) { return { threw: `${e.constructor.name}${e.code ? `(${e.code})` : ''}: ${String(e.message).slice(0, 120)}` }; } };
