// عينات SRT العربية لاختبارات P4 وخط الأساس المشترك بينها: 8 مقاطع إنجليزية بداية 1000ms ومدة 2000 وفاصل 500،
// وبصمتها بصيغة العقد (test/helpers). كل ملف .srt هنا تصفه README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { englishTrack, fingerprint, makeCues } from '../../helpers/fixtures.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));

export const ENGLISH_LINES = [
  'Hello and welcome to the talk.',
  'Today I want to share a story.',
  'It begins in a small village.',
  'Nobody expected what came next.',
  '[Music]',
  'But the story does not end there.',
  'Let me show you why.',
  'Thank you.',
];

/** @param {string} name اسم ملف في هذا المجلد */
export const readSrtFixture = (name) => readFileSync(path.join(DIR, name), 'utf8');

/** مقاطع المسار الإنجليزي الأساسي (أزمنة الأصل التي تُقاس بها كل العينات). */
export const baseCues = () => makeCues(ENGLISH_LINES.length, { startMs: 1000, durMs: 2000, gapMs: 500, text: (i) => ENGLISH_LINES[i - 1] });

export const baseTrack = () => englishTrack({ cues: baseCues() });

/** @param {Parameters<typeof fingerprint>[0]} [over] */
export const baseFingerprint = (over = {}) => fingerprint({ track: baseTrack(), ...over });

/** كائن File من نص أو بايتات، كما يعطيه <input type="file">. */
export const fileOf = (content, name = 'translation.ar.srt') => new File([content], name, { type: 'application/x-subrip' });
