// مدخل يُجمَّع (IIFE) ويُحقن في صفحة من حزمة tj-v1 أثناء جولة الرجوع الحية: تخزين الإصدار الأول وانتقالاته من اللقطة
// المجمّدة نفسها (test/fixtures/v1)، تعمل على chrome.storage.local الحقيقي للإضافة المحمّلة. للاختبار وحده.
import { createStore } from '../../fixtures/v1/src/core/store/index.js';
import * as transitions from '../../fixtures/v1/src/core/model/transitions.js';
import { validateVideoRecord } from '../../fixtures/v1/src/core/model/video.js';

globalThis.__v1 = { createStore, transitions, validateVideoRecord };
