// عينات بيانات مطابقة للعقد (docs/contracts/data-model.md) لاختبارات كل المراحل. كل ما تبنيه هنا يجتاز
// مدققات src/core/model (اختبار في test/unit/model). العينات الحقيقية من json3 الملتقط حيًا في P1.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertTrack } from '../../src/core/convert/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JSON3 = path.join(ROOT, 'test/fixtures/json3');

export const NOW = '2026-11-01T12:00:00.000Z';
export const VIDEO_ID = 'AAAAAAAAAAA';

/** فهرس عينات json3 الحقيقية. */
export const json3Index = () => JSON.parse(readFileSync(path.join(JSON3, 'index.json'), 'utf8')).fixtures;

/**
 * عينة json3 حقيقية ومقاطعها بعد تحويل P1.
 * @param {'manual' | 'asr'} kind
 */
export function realTrack(kind) {
  const f = json3Index().find((x) => x.trackKind === kind);
  const body = readFileSync(path.join(JSON3, f.file), 'utf8');
  const conv = convertTrack({ body, trackKind: kind, durationMs: f.durationMs });
  return { fixture: f, body, cues: conv.cues, conversion: conv };
}

/**
 * مقاطع اصطناعية متتالية.
 * @param {number} count
 * @param {{ startMs?: number, durMs?: number, gapMs?: number, text?: (i: number) => string }} [opts]
 */
export function makeCues(count, { startMs = 1000, durMs = 2000, gapMs = 500, text = (i) => `سطر ${i}` } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const s = startMs + i * (durMs + gapMs);
    return { n: i + 1, startMs: s, endMs: s + durMs, text: text(i + 1) };
  });
}

/** @param {{ kind?: 'manual' | 'asr', lang?: string, cues?: object[], capturedAt?: string }} [o] */
export function englishTrack({ kind = 'manual', lang = 'en', cues = makeCues(5, { text: (i) => `line ${i}` }), capturedAt = NOW } = {}) {
  return { key: `${lang}|${kind}`, lang, kind, capturedAt, source: 'capture', cues };
}

/** @param {{ videoId?: string, track?: ReturnType<typeof englishTrack>, mode?: 'normal' | 'long', id?: string, parts?: object[] | null, createdAt?: string }} [o] */
export function fingerprint({ videoId = VIDEO_ID, track = englishTrack(), mode = 'normal', id = 'fp_test000001', parts = null, createdAt = NOW } = {}) {
  return {
    id, videoId, trackKey: track.key, mode, count: track.cues.length,
    cues: track.cues.map(({ startMs, endMs }, i) => ({ n: i + 1, startMs, endMs })),
    textHash: 'fnv1a64:0123456789abcdef', fileName: `${videoId}.en.${track.kind}.${mode}.srt`, createdAt, parts,
  };
}

/** تقرير مقارنة مطابق (أو بلا بصمة إن fingerprintId=null). */
export function comparison({ fingerprintId = 'fp_test000001', count = 5 } = {}) {
  const has = fingerprintId !== null;
  return {
    fingerprintId, matched: has, countSource: has ? count : null, countTarget: count, numbering: 'same',
    missing: [], extra: [], drift: [], empty: [], noArabic: [], restoreTimingAvailable: has, driftThresholdMs: 100, notes: [],
  };
}

/**
 * سجل فيديو كامل صالح: مسار إنجليزي وبصمة وترجمة عربية.
 * @param {{ videoId?: string, rev?: number, offset?: number, mode?: 'ar' | 'dual' | 'off', arabic?: boolean, cues?: object[] }} [o]
 */
export function videoRecord({ videoId = VIDEO_ID, rev = 1, offset = 0, mode = 'ar', arabic = true, cues = makeCues(5) } = {}) {
  const track = englishTrack({ cues: cues.map((c) => ({ ...c, text: `line ${c.n}` })) });
  const fp = fingerprint({ videoId, track });
  return {
    schema: 1, videoId, title: 'عنوان تجريبي', durationMs: 60000, createdAt: NOW, updatedAt: NOW, rev,
    english: [track], fingerprints: [fp],
    arabic: arabic ? {
      fileName: `${videoId}.ar.srt`, importedAt: NOW, original: cues, current: null, editedAt: null,
      fingerprintId: fp.id, comparison: comparison({ fingerprintId: fp.id, count: cues.length }), notes: [],
    } : null,
    view: { displayOffsetMs: offset, displayMode: mode },
  };
}

/**
 * مستخرج وهمي بواجهة ExtractorAdapter (عقد interfaces §٢) لاختبار المتحكم والأدوات.
 * @param {{ tracks?: { key: string, kind: 'manual' | 'asr', lang?: string, cues: object[], ok?: boolean, code?: string | null }[] }} [o]
 */
export function fakeExtractor({ tracks = [] } = {}) {
  let list = tracks.map((t) => ({ lang: 'en', ok: true, code: null, ...t }));
  let rejection = null;
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  return {
    handleMessage: () => ({ accepted: false, code: 'EX_NO_VIDEO' }),
    setVideo() {
      list = [];
      rejection = null;
      emit();
    },
    tracks: () => list.map((t) => ({
      key: t.key, lang: t.lang, kind: t.kind, capturedAt: NOW, ok: t.ok, code: t.code, warnings: [],
      cueCount: t.ok ? t.cues.length : 0, completeness: null, lastEndMs: t.cues.at(-1)?.endMs ?? null,
    })),
    convert(key, { mode = 'normal' } = {}) {
      const t = list.find((x) => x.key === key);
      if (!t) return { ok: false, code: 'EX_NO_TRACK', key, lang: 'en', kind: 'manual', mode, cues: [], warnings: [], report: null };
      return { ok: t.ok, code: t.code, key, lang: t.lang, kind: t.kind, mode, cues: t.cues.map((c) => ({ ...c })), warnings: [], report: null };
    },
    lastRejection: () => rejection,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    diagnostics: () => ({ accepted: list.length }),
    // أدوات الاختبار
    setTracks(next) {
      list = next.map((t) => ({ lang: 'en', ok: true, code: null, ...t }));
      emit();
    },
    reject(code) {
      rejection = { code, at: 0, videoId: null };
      emit();
    },
  };
}
