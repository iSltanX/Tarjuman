# الأصول بالإنجليزية — `bysltan.com/tarjuman/en/brand`

> النسخة الإنجليزية من `brand.md`، بعلامات بنيته العربية، ونصها من لوحة «07 النصوص المقترحة» كما اعتمده سلطان. هذان السطران لا يُنشران.

## الرأس

- **مسار الصفحة:** Tarjuman · Brand
- **العنوان (`h1`):** Brand — Tarjuman
- **المقدمة:** Tarjuman starts with the letter Taa: its two dots are pen dots, and its body is an open book. One ink: no second color beyond shades of plum, and every status carries its own color plus a word or an icon. The rule: deep plum acts, bright plum points, and paper carries the reading. The shape tools are three (“the pen cut”): sharp corners and cut ends in icons, the pen dot as a status mark, and the page edge as a line under headers. The translation over the video stays outside the identity.
- **فهرس «في هذه الصفحة»:** Logo · Color · Typography and fonts · Icons and symbols

## Logo — `#logo`

### Versions

**Primary** from 32 px up and in all materials. **Small** from 24 to 31 px: the ends sit 1m lower and the fold is wider, with the same dots. **Pixel** 16 and 20 in the icon only, drawn on the pixel grid.

### Usage — `#usage`

- **Colors:** deep plum `#682455` on paper as the default. One color, black on white or white on black. Reversed in paper on the logo tile. In dark mode, night paper `#F3E2EC` on plum night. In two colors, the dots in bright plum `#A5397E`, from 48 px up and in marketing materials only.
- **Clear space:** its unit `x` is the width of one dot (35% of the mark’s width): no text, edge or element inside it.
- **Minimum size:** the mark from 24 px as a vector, and 16 and 20 as pixel drawings in the icon only.
- **Don’t:** rotate, stretch or squash it, draw the dots as upright diamonds (the old mark), let them touch the body, outline it, add gradients, shadows or gloss, or use colors outside the identity.

### Wordmark and lockups — `#lockups`

- **In static materials** (the site, the store and README): Cairo converted to paths, “ترجمان” and Tarjuman with equal weight, and pen dots from the mark. Lockups: horizontal bilingual, Arabic (mark to the right of the name), Latin (mark to the left, never flipped), and vertical.
- **In the interface:** the small mark at 24, and the name as live text in Cairo 800 at 18 in ink, in the interface language, with the mark first and an 8 px gap.

### Extension icon and store assets — `#icon`

Deep plum `#762E61` in both modes, with a corner of 22% of its side, and the mark in paper `#FEF8FC` at 68% of its width with a 16% margin on each side. No edge, shadow or glow.

## Color — `#color`

| Role | Light | Dark |
| --- | --- | --- |
| Background, card, sunken, neutral button `--tj-bg` / `--tj-surface` / `--tj-surface-2` / `--tj-surface-3` (`--tj-control`) | `#F9F5F8` / `#FEFDFE` / `#F2EAEF` / `#E9E0E6` | `#150C12` / `#20151D` / `#2C1F28` / `#372932` |
| Ink, secondary, muted `--tj-text` / `--tj-text-2` / `--tj-muted` | `#2D1626` / `#5B4653` / `#705D69` | `#F4EBF1` / `#C7B9C2` / `#A4939D` |
| Borders `--tj-border` / `-strong` / `-input` | `#E4DBE0` / `#D2C7CE` / `#91818B` | `#392B34` / `#4A3A44` / `#816E7A` |
| Primary action (deep plum acts) `--tj-brand` / `-hover` / `-pressed` / `-ink` | `#682455` / `#581847` / `#460D38` / `#FFFFFF` | `#F3E2EC` / `#FBF2F8` / `#DDCBD6` / `#150C12` |
| Bright plum (points) `--tj-accent` / `-text` / `-fill` / `-soft` | `#A5397E` / `#8B2868` / `#932C6E` / `#FEE5F2` | `#E791C2` / `#F3AAD3` / `#E791C2` / `#432135` |
| Selected `--tj-selected` / `-ink` | `#682455` / `#FFFFFF` | `#F3E2EC` / `#150C12` |
| Current section and selected row `--tj-selected-soft` / `-soft-ink` (`--tj-selected-section`) | `#FBE8F4` / `#682455` | `#382030` / `#F0C5E1` |
| Current moment `--tj-current` / `--tj-current-ink` / `--tj-mark` | `#FEE5F2` / `#8B2868` / `#A5397E` | `#432135` / `#F3AAD3` / `#E791C2` |
| Focus `--tj-focus` | `#A5397E` | `#E791C2` |
| Status colors `--tj-success` / `warning` / `danger` / `info` (`-bg`) | `#246E3A` / `#97570D` / `#B63132` / `#2A669F` | `#7CCD8E` / `#EBB25F` / `#F28885` / `#85B6E9` |
| Logo `--tj-logo-glyph` / `-word` / `-tile` / `-on-tile` | `#682455` / `#2D1626` / `#762E61` / `#FEF8FC` | `#F3E2EC` / `#F4EBF1` / `#762E61` / `#FEF8FC` |

- **Deep plum** for the one primary action in each area and for the selected state, with white text; **its light tint** for the current section and the selected row.
- **Bright plum** for the moment, focus and switches only: the current segment, the 2 px keyboard focus ring, and the focused field.
- **Status colors** each with its own identity, and always with a word or an icon.

## Typography and fonts — `#type`

| Role | Font |
| --- | --- |
| Product name and page title | Cairo 800 |
| Headings | Cairo 700 |
| Text, fields, buttons and menus | Almarai 400/700 |
| Times, IDs and technical data only | `ui-monospace` |

## Icons and symbols — `#icons`

- **Icons, “the pen cut”:** one set on a 20 grid with a 1.75 stroke, cut ends and sharp corners, and solid pen dots for points. Directional icons flip in RTL; time and media icons don’t.
- **The pen dot:** a slanted diamond at the pen’s angle, a status mark in its color, always with its word, never decoration on its own.
- **The page edge:** a hairline under headers.
