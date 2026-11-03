// مقطّعة اختيار واحد لحوارات المحفوظات (تصميم LibraryDialogs: «حفظ في» والصيغة واللغة): radio حقيقي مخفي بصريًا داخل
// fieldset بعنوان لقارئ الشاشة (أنماط .tj-seg المشتركة)، بالواجهة نفسها التي يعيدها choiceGroup (root وvalue وset وinputs)
// فتبقى الاختبارات والمستدعون على input[type=radio]. الخيار المعطّل يبقى ظاهرًا ويذكر سببه في سطر تحت المقطّعة وفي تلميحه.
import { el } from '../../ui/components.js';

let seq = 0;

/**
 * @param {{
 *   legend: string, value?: string, onChange?: (value: string) => void, doc?: Document,
 *   options: { value: string, label: string, ariaLabel?: string, disabledReason?: string | null }[],
 * }} o
 * @returns {{ root: HTMLElement, value: () => string, set: (v: string) => void, inputs: HTMLInputElement[] }}
 */
export function segGroup({ legend, options, value = options[0]?.value, onChange, doc = document }) {
  const id = `lib-seg-${++seq}`;
  let current = value;
  const reasons = [];
  const inputs = options.map((o, i) => {
    const input = el('input', { attrs: { type: 'radio', name: id, value: o.value }, doc });
    input.checked = o.value === current;
    if (o.ariaLabel) input.setAttribute('aria-label', o.ariaLabel);
    if (o.disabledReason) {
      input.disabled = true;
      input.setAttribute('aria-disabled', 'true');
      input.setAttribute('aria-describedby', `${id}-why-${i}`);
      reasons.push(el('p', { className: 'tj-field__hint', text: o.disabledReason, attrs: { id: `${id}-why-${i}` }, doc }));
    }
    input.addEventListener('change', () => {
      if (!input.checked || current === o.value) return;
      current = o.value;
      onChange?.(o.value);
    });
    return input;
  });
  const fieldset = el('fieldset', {
    className: 'tj-seg',
    children: [
      el('legend', { className: 'tj-sr-only', text: legend, doc }),
      ...options.map((o, i) => el('label', {
        className: 'tj-seg__option', attrs: o.disabledReason ? { title: o.disabledReason } : {},
        children: [inputs[i], el('span', { className: 'tj-seg__label', text: o.label, doc })],
        doc,
      })),
    ],
    doc,
  });
  return {
    root: el('div', { className: 'lib-seg', children: [fieldset, ...reasons], doc }),
    inputs,
    value: () => current,
    set(v) {
      current = v;
      inputs.forEach((input, i) => { input.checked = options[i].value === v; });
    },
  };
}
