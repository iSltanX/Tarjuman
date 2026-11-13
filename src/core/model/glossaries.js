// قوائم المصطلحات لكل زوج لغتين (الفكرة ٨، ح-45 وح-47؛ عقد data-model §١٨ وstorage §١٥): بجانب القاموس العام (prefs.glossary)
// قائمة لكل زوج «من ← إلى»، و«من» قد تكون «أي لغة» ('*')، حتى 100 مصطلح لكلٍّ وحتى 20 قائمة. في مفتاح glossaries مستقل، لا حقلًا داخل
// المصطلح ولا داخل prefs: كاتب 1.1.0 يطبّع prefs قبل كل كتابة فيُسقط المصطلح كله إن حمل حقلًا لا يعرفه. ولغة المصطلح لغة قائمته
// وحدها، ولا تُستنتج من حروفه. القراءة متسامحة لكل قائمة ومصطلح، والكتابة صارمة. لا تخزين ولا DOM هنا.
import { baseLang, normalizeLang } from '../lang/index.js';
import { isSourceLang } from './ids.js';
import { GLOSSARY_LIMITS, normalizePrefs, sourceKey, validateTerm } from './prefs.js';
import { OK, eachOf, exactKeys, fail, firstFailure, isPlainObject } from './validate.js';

export const GLOSSARIES_SCHEMA = 1;
/** «من» في قائمة تصلح لأي لغة ملف إلى لغة «إلى» بعينها. */
export const ANY_SOURCE = '*';
/** lists: عدد القوائم، وterms: مصطلحات القائمة الواحدة، وهو حد القاموس العام نفسه وحد ما يُرسل مع التعليمات (الملحق أ). */
export const GLOSSARIES_LIMITS = Object.freeze({ lists: 20, terms: GLOSSARY_LIMITS.maxTerms });

/**
 * @typedef {import('./prefs.js').GlossaryTerm} GlossaryTerm
 * @typedef {{ from: string, to: string }} ListPair from: رمز لغة أو '*'
 * @typedef {{ from: string, to: string, terms: GlossaryTerm[] }} GlossaryList
 * @typedef {{ schema: 1, lists: GlossaryList[] }} Glossaries
 * @typedef {{ pair: GlossaryTerm[], general: GlossaryTerm[], total: number }} AttachedTerms
 */

/** @type {Readonly<Glossaries>} */
export const DEFAULT_GLOSSARIES = Object.freeze({ schema: GLOSSARIES_SCHEMA, lists: Object.freeze([]) });

/** مفتاح المقارنة لرمز: الصيغة المعيارية بأحرف صغيرة (pt_BR وpt-br واحد)، و'*' كما هو، وnull لغير الصالح. @param {unknown} code */
const codeKey = (code) => {
  if (code === ANY_SOURCE) return ANY_SOURCE;
  if (!isSourceLang(code)) return null;
  return (normalizeLang(code) ?? String(code)).toLowerCase();
};
/** @param {ListPair} p */
const pairKey = (p) => `${codeKey(p.from)}>${codeKey(p.to)}`;

/**
 * زوج قائمة صالح بصيغته المعيارية (pt_BR ← pt-BR)، أو null: «من» رمز أو '*'، و«إلى» رمز، ولا تطابق بينهما.
 * @param {unknown} p
 * @returns {ListPair | null}
 */
export function listPair(p) {
  if (!isPlainObject(p)) return null;
  const from = p.from === ANY_SOURCE ? ANY_SOURCE : isSourceLang(p.from) ? normalizeLang(p.from) : null;
  const to = isSourceLang(p.to) ? normalizeLang(p.to) : null;
  if (!from || !to || codeKey(from) === codeKey(to)) return null;
  return { from, to };
}

/** القائمتان لزوج واحد (بلا اعتبار لصيغة الرمز). @param {ListPair} a @param {ListPair} b */
export const sameListPair = (a, b) => pairKey(a) === pairKey(b);

/** @param {unknown} l @param {string} path */
function validateList(l, path) {
  return firstFailure([
    () => exactKeys(l, ['from', 'to', 'terms'], path),
    () => (l.from === ANY_SOURCE || isSourceLang(l.from) ? OK : fail(`${path}.from`, 'لغة غير صالحة')),
    () => (isSourceLang(l.to) ? OK : fail(`${path}.to`, 'لغة غير صالحة')),
    () => (listPair(l) ? OK : fail(path, 'زوج غير صالح أو لغتان متطابقتان')),
    () => eachOf(l.terms, `${path}.terms`, GLOSSARIES_LIMITS.terms, validateTerm),
    () => (new Set(l.terms.map((t) => sourceKey(t.source))).size === l.terms.length ? OK : fail(`${path}.terms`, 'مصطلح مكرر')),
  ]);
}

/** @param {unknown} g */
export function validateGlossaries(g) {
  const path = 'glossaries';
  return firstFailure([
    () => exactKeys(g, ['schema', 'lists'], path),
    () => (g.schema === GLOSSARIES_SCHEMA ? OK : fail(`${path}.schema`, 'إصدار غير معروف')),
    () => eachOf(g.lists, `${path}.lists`, GLOSSARIES_LIMITS.lists, validateList),
    () => (new Set(g.lists.map(pairKey)).size === g.lists.length ? OK : fail(`${path}.lists`, 'زوج مكرر')),
  ]);
}

/** مصطلحات قائمة من قيمة مخزَّنة: التالف والمكرر يسقط وحده، وأول 100. @param {unknown} raw @returns {GlossaryTerm[]} */
function cleanTerms(raw) {
  const terms = [];
  const seen = new Set();
  for (const t of Array.isArray(raw) ? raw : []) {
    if (terms.length >= GLOSSARIES_LIMITS.terms) break;
    if (!validateTerm(t).ok || seen.has(sourceKey(t.source))) continue;
    seen.add(sourceKey(t.source));
    terms.push({ source: t.source, target: t.target, note: t.note });
  }
  return terms;
}

/**
 * القوائم كاملة من أي مدخل: القائمة بلا زوج صالح أو بزوج مكرر تسقط وحدها، والمصطلح التالف أو المكرر يسقط وحده، وأول 20 قائمة.
 * الرموز تبقى كما خُزّنت إن صلحت (المقارنة بالصيغة المعيارية).
 * @param {unknown} raw
 * @returns {Glossaries}
 */
export function normalizeGlossaries(raw) {
  const lists = [];
  const pairs = new Set();
  for (const l of isPlainObject(raw) && Array.isArray(raw.lists) ? raw.lists : []) {
    if (lists.length >= GLOSSARIES_LIMITS.lists) break;
    if (!isPlainObject(l) || !listPair(l)) continue;
    const key = pairKey(l);
    if (pairs.has(key)) continue;
    pairs.add(key);
    lists.push({ from: l.from, to: l.to, terms: cleanTerms(l.terms) });
  }
  return { schema: GLOSSARIES_SCHEMA, lists };
}

/** قائمة الزوج أو null. @param {Glossaries} g @param {ListPair} pair */
export const findList = (g, pair) => g.lists.find((l) => sameListPair(l, pair)) ?? null;

/**
 * قائمة جديدة فارغة لزوج، آخرَ القوائم.
 * @param {Glossaries} g كاملة @param {unknown} pair
 * @returns {{ glossaries: Glossaries, added: boolean, reason: 'invalid' | 'duplicate' | 'limit' | null, pair: ListPair | null }}
 */
export function addList(g, pair) {
  const p = listPair(pair);
  if (!p) return { glossaries: g, added: false, reason: 'invalid', pair: null };
  const found = findList(g, p);
  if (found) return { glossaries: g, added: false, reason: 'duplicate', pair: { from: found.from, to: found.to } };
  if (g.lists.length >= GLOSSARIES_LIMITS.lists) return { glossaries: g, added: false, reason: 'limit', pair: p };
  const next = structuredClone(g);
  next.lists.push({ ...p, terms: [] });
  return { glossaries: next, added: true, reason: null, pair: p };
}

/** @param {Glossaries} g @param {ListPair} pair @returns {{ glossaries: Glossaries, removed: boolean }} */
export function removeList(g, pair) {
  const lists = g.lists.filter((l) => !sameListPair(l, pair));
  if (lists.length === g.lists.length) return { glossaries: g, removed: false };
  return { glossaries: { ...structuredClone(g), lists: structuredClone(lists) }, removed: true };
}

/**
 * مصطلح في قائمة زوج على أحدث القوائم، بالمفتاح الموحّد كما في القاموس العام (U13). القائمة التي حُذفت من صفحة أخرى «missing».
 * @param {Glossaries} g @param {ListPair} pair @param {GlossaryTerm} term
 * @returns {{ glossaries: Glossaries, added: boolean, reason: 'missing' | 'duplicate' | 'limit' | null }}
 */
export function addListTerm(g, pair, term) {
  const i = g.lists.findIndex((l) => sameListPair(l, pair));
  if (i < 0) return { glossaries: g, added: false, reason: 'missing' };
  const terms = g.lists[i].terms;
  if (terms.some((t) => sourceKey(t.source) === sourceKey(term.source))) return { glossaries: g, added: false, reason: 'duplicate' };
  if (terms.length >= GLOSSARIES_LIMITS.terms) return { glossaries: g, added: false, reason: 'limit' };
  const next = structuredClone(g);
  next.lists[i].terms.push({ source: term.source, target: term.target, note: term.note });
  return { glossaries: next, added: true, reason: null };
}

/** @param {Glossaries} g @param {ListPair} pair @param {string} key sourceKey(source) @returns {{ glossaries: Glossaries, removed: boolean }} */
export function removeListTerm(g, pair, key) {
  const i = g.lists.findIndex((l) => sameListPair(l, pair));
  if (i < 0) return { glossaries: g, removed: false };
  const terms = g.lists[i].terms.filter((t) => sourceKey(t.source) !== key);
  if (terms.length === g.lists[i].terms.length) return { glossaries: g, removed: false };
  const next = structuredClone(g);
  next.lists[i].terms = terms;
  return { glossaries: next, removed: true };
}

/**
 * درجة مطابقة قائمة لزوج التعليمات، أو null: 0 الزوج نفسه، و1 بالوسم الأساسي (pt-BR تطابق pt في الطرفين)، و2 «أي لغة ← إلى» نفسها،
 * و3 «أي لغة ← إلى» بالوسم الأساسي.
 * @param {GlossaryList} list @param {unknown} source @param {unknown} target
 */
function matchRank(list, source, target) {
  const to = codeKey(target);
  if (!to || to === ANY_SOURCE) return null;
  const toExact = codeKey(list.to) === to;
  const toBase = baseLang(list.to) === baseLang(target);
  if (list.from === ANY_SOURCE) return toExact ? 2 : toBase ? 3 : null;
  const from = codeKey(source);
  if (!from || from === ANY_SOURCE) return null;
  if (codeKey(list.from) === from && toExact) return 0;
  if (baseLang(list.from) === baseLang(source) && toBase) return 1;
  return null;
}

/**
 * المصطلحات التي تُرفق بتعليمات زوج (ح-45 وح-47)، بالترتيب: قائمة الزوج نفسه، ثم المطابقة بالوسم الأساسي، ثم «أي لغة ← إلى»، ثم القاموس
 * العام. وتعود مجموعتين لرأسين: pair ما لغتاه لغتا الزوج (القائمتان الأوليان)، فتحت رأس بلغتي الزوج؛ وgeneral «أي لغة ← إلى» والقاموس
 * العام، ولغة مصطلحاتهما غير معروفة، فتحت رأس محايد. المكرر بالمفتاح الموحّد يسقط والأسبق يبقى (قائمة الزوج تتقدّم)، والقطع عند 100
 * للمجموع، وtotal عدد المختلف قبل القطع (لسطر «يُرسل أول 100» في الإعدادات). و«أرفق القاموس» المطفأ، أو تفضيلات لا تُقرأ، لا يرفق شيئًا.
 * ولا يُخمَّن شيء من حروف المصطلح.
 * @param {unknown} prefs التفضيلات (كاملة أو كما وصلت في حدث التغيير)
 * @param {unknown} glossaries قوائم الأزواج (أو null)
 * @param {{ source?: string | null, target?: string | null }} [pair] لغة الملف واللغة المطلوبة
 * @returns {AttachedTerms}
 */
export function termsFor(prefs, glossaries, { source = null, target = null } = {}) {
  if (!isPlainObject(prefs)) return { pair: [], general: [], total: 0 };
  const p = normalizePrefs(prefs);
  if (!p.glossary.attach) return { pair: [], general: [], total: 0 };
  const lists = normalizeGlossaries(glossaries).lists
    .map((list, i) => ({ list, i, rank: matchRank(list, source, target) }))
    .filter((x) => x.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.i - b.i);
  const out = { pair: [], general: [], total: 0 };
  const seen = new Set();
  const take = (terms, into) => {
    for (const t of terms) {
      const key = sourceKey(t.source);
      if (seen.has(key)) continue;
      seen.add(key);
      out.total += 1;
      if (out.pair.length + out.general.length < GLOSSARIES_LIMITS.terms) into.push({ source: t.source, target: t.target, note: t.note });
    }
  };
  for (const x of lists) take(x.list.terms, x.rank <= 1 ? out.pair : out.general);
  take(p.glossary.terms, out.general);
  return out;
}

/** عدد المصطلحات المرفقة فعلًا (بعد القطع). @param {AttachedTerms} a */
export const attachedCount = (a) => a.pair.length + a.general.length;
