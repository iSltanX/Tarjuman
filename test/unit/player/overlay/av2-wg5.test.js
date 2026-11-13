// التدقيق الموحد V2، WG-5: طبقة الترجمة تعيد رسم السطر الظاهر عند تغيّر لغة الخانة (U-030).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverlayView } from '../../../../src/player/overlay/view.js';
import { addPlayer, createFakeEnv } from './fake-dom.js';

test('AV2 U-030: setTranslationLang من ar إلى fr يحدّث lang وdir للسطر الظاهر نفسه بلا مقطع تالٍ', () => {
  const env = createFakeEnv();
  const parts = addPlayer(env);
  const view = createOverlayView(env);
  view.attachTo(parts.player);
  const stage = view.host.shadowRoot.children.find((x) => x.className.includes('stage'));
  const line = () => `${stage.children[0].getAttribute('lang')}|${stage.children[0].getAttribute('dir')}`;
  view.setTranslationLang('ar');
  view.render({ ar: ['مرحبًا بكم'], en: [] });
  assert.equal(line(), 'ar|rtl');
  view.setTranslationLang('fr');
  assert.equal(line(), 'fr|ltr', 'لغة تُكتب من اليسار تحسم ولو كان النص عربيًا (AA1)');
  view.setTranslationLang('ar');
  view.render({ ar: ['Bonjour à tous'], en: [] });
  assert.equal(line(), 'ar|ltr', 'القرار ١٨: سطر بلا حروف تُكتب من اليمين في خانة عربية LTR');
  view.setTranslationLang('fr');
  view.setTranslationLang('ar');
  view.render({ ar: ['مرحبًا'], en: [] });
  assert.equal(line(), 'ar|rtl');
  view.setTranslationLang('ar');
  assert.equal(line(), 'ar|rtl', 'لغة لم تتغير: لا شيء');
});

test('AV2 U-030: بلا سطر ظاهر لا رسم عند تغيّر اللغة، والأسطر التالية بلغتها', () => {
  const env = createFakeEnv();
  const parts = addPlayer(env);
  const view = createOverlayView(env);
  view.attachTo(parts.player);
  const stage = view.host.shadowRoot.children.find((x) => x.className.includes('stage'));
  view.setTranslationLang('fr');
  assert.ok(stage.hasAttribute('data-empty'));
  view.render({ ar: ['Merci'], en: [] });
  assert.equal(stage.children[0].getAttribute('lang'), 'fr');
});
