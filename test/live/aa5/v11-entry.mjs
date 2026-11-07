// مدخل يُجمَّع (IIFE) ويُحقن في صفحة من حزمة 1.1.0 المنشورة أثناء اختبار المحافظة على البيانات (AA5، ق٦): تخزين 1.1.0 ونسخته
// الاحتياطية من اللقطة المجمّدة نفسها (test/fixtures/v1.1، من main@594e804)، تكتب على chrome.storage.local الحقيقي للإضافة المحمّلة
// عبر عاملها الخلفي، فالبيانات يكتبها 1.1.0 بشيفرته. والعيّنات من مساعدات الاختبار (حزمة بثلاث ترجمات وسابقة وعلامات، وتفضيلات بقاموس).
// للاختبار وحده.
import { createStore } from '../../fixtures/v1.1/src/core/store/index.js';
import { createBackup } from '../../fixtures/v1.1/src/core/backup/create.js';
import { sampleBundle, samplePrefs } from '../../helpers/fixtures-v2.js';

globalThis.__v11 = { createStore, createBackup, sampleBundle, samplePrefs };
