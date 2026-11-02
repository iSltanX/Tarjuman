// انتقال «حفظ» المحرّر فوق انتقالات النموذج (عقد البيانات §٧)، نقيّ ليُعاد على أحدث سجل داخل store.updateVideo.
// الأصل المستورد لا يُستبدل أبدًا (R27): الحفظ يكتب النسخة الحالية وحدها، والإزاحة في الخطوة نفسها إن مُرِّرت.
// وفي الإصدار الثاني الحفظ في خانة التحرير (عقد data-model §١٣) بالقاعدة نفسها، دون تغيير الترجمة النشطة.
import { TjError } from '../errors/index.js';
import { withSlotEdit, withSlotOffset, withSlotOriginalRestored } from '../model/bundle.js';
import { withArabicEdit, withOriginalRestored, withView } from '../model/transitions.js';
import { findIssues } from './issues.js';

const sameCues = (a, b) => a.length === b.length
  && a.every((c, i) => c.n === b[i].n && c.startMs === b[i].startMs && c.endMs === b[i].endMs && c.text === b[i].text);

/**
 * مقاطع مطابقة للأصل تعني «الأصل المستورد» (current = null) لا نسخة معدّلة مطابقة له. وأخطاء التوقيت ترفض
 * الحفظ هنا أيضًا، حماية ثانية خلف الواجهة.
 * @param {import('../model/video.js').VideoRecord} record
 * @param {{ cues: import('../model/cue.js').Cue[], displayOffsetMs?: number }} edit
 * @param {string} now ISO
 */
export function editTransition(record, { cues, displayOffsetMs }, now) {
  if (!record?.arabic) throw new TjError('ST_NO_RECORD');
  const { errors } = findIssues(cues);
  if (errors) throw new TjError('ED_SAVE_HAS_ERRORS', { params: { count: String(errors) }, detail: `أخطاء توقيت: ${errors}` });
  if (!sameCues(cues, record.arabic.original)) return withArabicEdit(record, { cues, displayOffsetMs }, now);
  const restored = withOriginalRestored(record, now);
  return displayOffsetMs === undefined ? restored : withView(restored, { displayOffsetMs }, now);
}

/**
 * حفظ المحرّر في خانته (الإصدار الثاني): مثل editTransition على الخانة n من الحزمة، ولا تتغير النشطة ولا غيرها.
 * @param {import('../model/slots.js').Bundle} bundle الأحدث كما يمرّره updateBundle
 * @param {1 | 2 | 3} n
 * @param {{ cues: import('../model/cue.js').Cue[], displayOffsetMs?: number }} edit
 * @param {string} now ISO
 */
export function slotEditTransition(bundle, n, { cues, displayOffsetMs }, now) {
  const track = bundle?.slots?.[n - 1]?.track;
  if (!track) throw new TjError(bundle ? 'ST_SLOT_EMPTY' : 'ST_NO_RECORD', { detail: `slot=${n}` });
  const { errors } = findIssues(cues);
  if (errors) throw new TjError('ED_SAVE_HAS_ERRORS', { params: { count: String(errors) }, detail: `أخطاء توقيت: ${errors}` });
  if (!sameCues(cues, track.original)) return withSlotEdit(bundle, n, { cues, displayOffsetMs }, now);
  const restored = withSlotOriginalRestored(bundle, n, now);
  return displayOffsetMs === undefined ? restored : withSlotOffset(restored, n, displayOffsetMs, now);
}
