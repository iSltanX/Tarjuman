// أدوات مشتركة لاختبارات P3: رسائل التقاط بأجسام العينتين الحقيقيتين، وبيئة مستخرج قابلة للتحكم.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExtractor } from '../../../src/extract/index.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/json3');
const INDEX = JSON.parse(readFileSync(path.join(DIR, 'index.json'), 'utf8')).fixtures;

/** @param {'manual' | 'asr'} kind العينة الحقيقية: جسمها ومعلوماتها */
export function sample(kind) {
  const fixture = INDEX.find((f) => f.trackKind === kind);
  return { fixture, body: readFileSync(path.join(DIR, fixture.file), 'utf8') };
}

/**
 * رسالة MAIN → ISOLATED كما يرسلها capture.js (حقولها في عقد الاستخراج).
 * @param {{ videoId: string, body: string, trackKind?: 'manual' | 'asr' }} base
 * @param {object} [over]
 */
export function captureMsg({ videoId, body, trackKind = 'manual' }, over = {}) {
  return {
    source: 'tarjuman', v: 1, kind: 'timedtext', videoId, lang: 'en', trackKind, kindParam: trackKind === 'asr' ? 'asr' : null,
    capsAsr: true, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200,
    bodyLength: body.length, body, truncated: false, ...over,
  };
}

/**
 * مستخرج ببيئة قابلة للتحكم: الفيديو المعروض والمدة والبث والزمن.
 * @param {{ videoId: string, durationMs?: number | null }} init
 */
export function makeExtractor({ videoId, durationMs = null }) {
  const state = { videoId, durationMs, live: false, t: 1000 };
  const extractor = createExtractor({
    currentVideoId: () => state.videoId,
    durationMs: () => state.durationMs,
    isLive: () => state.live,
    now: () => state.t,
  });
  return { extractor, state };
}
