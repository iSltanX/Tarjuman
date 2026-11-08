// نسخة معدّلة (after-fix، «تأكيد لا يوقف التشغيل») من برنامج Codex الأصلي evidence/subtitle-repro.mjs (حزمة Codex على 5b9a584).
// لماذا: الأصل يتوقف عند أول assert يسقط، فلا تُقيَّم بقية تأكيداته (وبعضها لمسائل أخرى). هذه النسخة تسجّل كل تأكيد: «بقي»
// (ما زال صحيحًا، فالعيب الذي يثبته باقٍ) أو «سقط» (لم يعد صحيحًا، فانعكس)، وتكمل، ثم تطبع السجل عند الخروج.
// ما تغيّر (آليًا، ولا شيء غيره):
//   ١. سطر «import assert from 'node:assert/strict'» صار مُسجِّلًا بالواجهة نفسها (assert.equal وassert.ok…).
//   ٢. الاستيراد الثابت من ../source/ صار استيرادًا ديناميكيًا من جذر الشيفرة الممرَّر وسيطًا أول (R)، بالمسارات نفسها.
// الحالات والقيم والتأكيدات وترتيبها كما في الأصل حرفيًا. وقبل الإصلاح كانت كل التأكيدات «باقية» (خروج 0 في original-reruns).
// الاستعمال: command node codex-subtitle-repro-soft.mjs <جذر الشيفرة>
// إعادة إنتاج آمنة: لا متصفح ولا شبكة ولا كتابة في المصدر. مرّر مسار نسخة الالتزام المدقق وسيطًا أولًا.
import __strict from 'node:assert/strict';
import { resolve as __resolve } from 'node:path';
const R = __resolve(process.argv[2] ?? '.');
const __log = [];
let __cur = null;
function __softCall(name, args) {
  const frames = new Error().stack.split('\n').filter((s) => s.includes(import.meta.url));
  const lines = frames.map((s) => /:(\d+):\d+\)?$/.exec(s)).filter(Boolean).map((m) => Number(m[1]));
  const line = lines.find((n) => n > __end()) ?? null;
  try { (name ? __strict[name] : __strict)(...args); __log.push({ case: __cur, line, ok: true }); }
  catch (e) { __log.push({ case: __cur, line, ok: false, msg: String(e.message).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6).join(' ') }); }
}
const assert = new Proxy(function () {}, { apply: (_, __, a) => __softCall(null, a), get: (_, k) => (...a) => __softCall(k, a) });
process.on('exit', () => {
  const src = (__log.length ? __SRC() : []);
  console.log('\n=== سجل التأكيدات (بقي = التأكيد ما زال صحيحًا فالعيب باقٍ؛ سقط = لم يعد صحيحًا) ===');
  for (const r of __log) console.log(`${r.case ? '[' + r.case + '] ' : ''}سطر ${r.line}: ${(src[r.line - 1] ?? '').trim().slice(0, 160)}\n    ⇐ ${r.ok ? 'بقي' : 'سقط: ' + r.msg.slice(0, 300)}`);
  console.log(`المجموع: ${__log.length} تأكيدًا، بقي ${__log.filter((r) => r.ok).length}، وسقط ${__log.filter((r) => !r.ok).length}`);
});
function __SRC() { return __readSelf(); }
import { readFileSync as __rf } from 'node:fs';
import { fileURLToPath as __fu } from 'node:url';
function __readSelf() { return __rf(__fu(import.meta.url), 'utf8').split('\n'); }
function __end() { return __readSelf().findIndex((l) => l.includes('__END_PRELUDE__')) + 1; }
// __END_PRELUDE__ (نهاية المُسجِّل؛ ما بعده الأصل)
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root=path.resolve(process.argv[2] ?? fileURLToPath(new URL('../source/', import.meta.url)));
const mod=(rel)=>import(pathToFileURL(path.join(root,rel)).href);
const {convertTrack}=await mod('src/core/convert/index.js');
const {createExtractor}=await mod('src/extract/index.js');
const {createController}=await mod('src/content/controller.js');
const {createStore}=await mod('src/core/store/index.js');
const {createMemoryArea}=await mod('test/helpers/chrome-storage.js');
const {buildVideoStateReply}=await mod('src/core/model/messages.js');
const {buildExport}=await mod('src/core/export/index.js');
const {englishTrack,videoRecord,makeCues,NOW}=await mod('test/helpers/fixtures.js');
const {bundleFromRecord,withSlotLang}=await mod('src/core/model/bundle.js');
const {compare}=await mod('src/core/compare/compare.js');
const {trackComparison}=await mod('src/core/compare/current.js');
const {readFor}=await mod('src/player/controls/flows.js');
const importFlow=await mod('src/core/import/index.js');
const output={};

// ١: قطع ASR يابانية متصلة نصيًا، كل قطعة تحمل توقيتها.
{
 const segments=[{utf8:'今日',tOffsetMs:0,acAsrConf:0},{utf8:'は',tOffsetMs:1800,acAsrConf:0},{utf8:'いい',tOffsetMs:3600,acAsrConf:0},{utf8:'天気',tOffsetMs:5400,acAsrConf:0}];
 const body=JSON.stringify({events:[{tStartMs:1000,dDurationMs:6000,segs:segments}]});
 const result=convertTrack({body,trackKind:'asr',durationMs:7000});
 assert.equal(result.ok,true);
 assert.equal(result.cues.at(-1).endMs,2500);
 assert.equal(result.invariants.results.every(x=>x.ok),true);
 output.asrTiming={description:'أربعة أزمنة للقطع تُختزل إلى توقيت القطعة الأولى؛ النهاية قبل بدء آخر قطعة بـ3900ms',inputAbsoluteSegmentTimes:segments.map(s=>1000+s.tOffsetMs),outputCues:result.cues,allInvariantsPassed:true};
}

// ٢: إعادة فحص لغة ترجمة محفوظة؛ وكذلك لغة مقترحة عند رفع ملف بلا رمز لغة.
{
 const cues=makeCues(3,{text:i=>i===3?'Still untranslated':'ترجمة عربية كاملة'});
 const record=videoRecord({cues});record.arabic.lang=null;
 record.arabic.comparison=compare(cues,record.fingerprints[0],{target:null});
 const changed=withSlotLang(bundleFromRecord(record),1,'ar',NOW);
 const displayed=trackComparison(changed.record.arabic,changed.record.fingerprints).noArabic;
 const expected=compare(cues,record.fingerprints[0],{target:'ar'}).noArabic;
 assert.deepEqual(displayed,[]);assert.deepEqual(expected,[3]);
 const srt=cues.map(c=>`${c.n}\n00:00:${String(Math.floor(c.startMs/1000)).padStart(2,'0')},${String(c.startMs%1000).padStart(3,'0')} --> 00:00:${String(Math.floor(c.endMs/1000)).padStart(2,'0')},${String(c.endMs%1000).padStart(3,'0')}\n${c.text}\n`).join('\n');
 const file=new File([srt],'subtitle.srt');
 const controller={getState:()=>({videoId:record.videoId,saved:record})};
 const read=await readFor({controller,importFlow,files:file,fallbackLang:'ar'});
 assert.equal(read.ok,true);assert.equal(read.input.lang,'ar');
 assert.deepEqual(read.preview.noArabic,[3]);assert.deepEqual(read.input.comparison.noArabic,[]);
 output.languageReport={description:'الفحص المخزّن لا يطابق لغة الترجمة المعينة لاحقًا أو المقترحة أثناء الرفع',afterAssigningArabic:displayed,expectedForArabic:expected,upload:{inferredLanguage:read.input.lang,preview:read.preview.noArabic,persistedComparison:read.input.comparison.noArabic}};
}

// ٣: تكرار تنزيل مسار محفوظ أقدم لا يحدّث لغة «من» المستنتجة من آخر بصمة.
{
 const rec=videoRecord({arabic:false});const id=rec.videoId;
 const en=rec.english[0];const es=englishTrack({lang:'es',capturedAt:'2026-11-02T12:00:00Z'});
 const enExport=buildExport({videoId:id,track:en,mode:'normal',now:Date.parse('2026-11-02T12:00:00Z')});
 const esExport=buildExport({videoId:id,track:es,mode:'normal',now:Date.parse('2026-11-02T13:00:00Z')});
 rec.english=[en,es];rec.fingerprints=[enExport.fingerprint,esExport.fingerprint];
 const store=createStore({area:createMemoryArea({unlimited:true})});await store.updateVideo(id,()=>rec);
 const controller=createController({store});await controller.start(id);
 const state=()=>buildVideoStateReply(controller.getState(),{overlay:'mounted',controls:'mounted'});
 const before=state().source;
 const next=buildExport({videoId:id,track:en,mode:'normal',now:Date.parse('2026-11-02T14:00:00Z')});
 const result=await controller.recordSavedExport({trackKey:en.key,fingerprint:next.fingerprint});
 assert.equal(result.stored,false);assert.equal(state().source.lang,'es');
 output.savedReexport={description:'استدعاء ما بعد نجاح تنزيل الإنجليزية المحفوظة يترك مصدر التعليمات بالإسبانية',before,builtFilename:next.files[0].name,recordResult:result,after:state().source,expectedSourceLanguage:'en'};
}

// ٤: مسار يوتيوب المترجم آليًا هو الوحيد؛ يُختار من غير اختيار داخل ترجمان.
{
 const id='AAAAAAAAAAA';
 const body=JSON.stringify({events:[{tStartMs:0,dDurationMs:2000,segs:[{utf8:'ترجمة آلية'}]}]});
 const extractor=createExtractor({currentVideoId:()=>id,durationMs:()=>2000});
 const controller=createController({store:createStore({area:createMemoryArea({unlimited:true})}),extractor});
 await controller.start(id);
 const accepted=extractor.handleMessage({source:'tarjuman',v:1,kind:'timedtext',videoId:id,lang:'en',trackKind:'manual',hasTlang:true,tlang:'ar',format:'json3',status:200,bodyLength:body.length,body});
 assert.equal(accepted.accepted,true);
 const source=buildVideoStateReply(controller.getState(),{overlay:'mounted',controls:'mounted'}).source;
 assert.equal(source.key,'ar|manual|en');
 output.machineDefault={description:'المسار المترجم آليًا يُعيّن تلقائيًا مصدرًا قبل اختيار صريح داخل ترجمان',selected:source};
}
console.log(JSON.stringify(output,null,2));
