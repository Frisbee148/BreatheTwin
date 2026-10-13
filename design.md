# DESIGN.md — Asthma Digital Twin (Night-Vision Theme, Core)

Lean version. Core colors and a few simple rules only. The full effects-heavy
system is saved as `design-full.md` for later.

**Rule from the image prompt:** green phosphor on black. If a screen reads as daylight, it has failed.

---

## 1. Principles

1. **Green on near-black.** Every surface, border and text is a shade of green.
2. **Warm colors mean "heat" only.** Yellow, orange and red appear only for caution or danger signals (high risk, poor air, low peak flow). Never decoration.
3. **Calm by default.** No flicker, no scan animation, no hover effects beyond a color change.
4. **Sharp and flat.** Square corners, 1px borders, no shadows.
5. **Never color alone.** Every warm color comes with a text label (`CAUTION`, `HIGH`).

---

## 2. Core colors

### Greens (the base)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#020A05` | Page background |
| `--panel` | `#04130A` | Cards, panels |
| `--inset` | `#061C0E` | Inputs, image placeholders |
| `--line` | `#12612F` | Borders, dividers |
| `--text-dim` | `#2FBF63` | Secondary text, inactive icons |
| `--text` | `#4CFF8A` | Primary text, buttons, links |
| `--text-hot` | `#B6FFCC` | Headings, focus, key numbers |

### Heat (status only)

| Token | Hex | Meaning (asthma context) |
|---|---|---|
| `--ok` | `#4CFF8A` | Normal, stable |
| `--caution` | `#FFE14A` | Mild: watch triggers, moderate air quality |
| `--warn` | `#FFA61F` | Elevated: rising risk |
| `--danger` | `#FF2A1A` | High: attack risk, act now |

Rules:
- Only status chips, key numbers, alerts and hotspots on the twin image use heat colors.
- Never use heat for backgrounds of large areas.
- No white, grey, blue or purple.

```css
:root{
  --bg:#020A05; --panel:#04130A; --inset:#061C0E; --line:#12612F;
  --text-dim:#2FBF63; --text:#4CFF8A; --text-hot:#B6FFCC;
  --ok:#4CFF8A; --caution:#FFE14A; --warn:#FFA61F; --danger:#FF2A1A;
}
```

```js
// tailwind.config.js (theme.extend.colors)
colors: {
  bg:'#020A05', panel:'#04130A', inset:'#061C0E', line:'#12612F',
  txt:{ dim:'#2FBF63', DEFAULT:'#4CFF8A', hot:'#B6FFCC' },
  status:{ ok:'#4CFF8A', caution:'#FFE14A', warn:'#FFA61F', danger:'#FF2A1A' },
}
```

---

## 3. Typography

- **Font:** `Inter` for everything, with the fallback `"Inter", system-ui, -apple-system, "Segoe UI", sans-serif`.
- **Load it:** `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">`
- **Weights:** 400 body, 500 labels and buttons, 600 headings and big numbers.
- **Case:** uppercase for small labels, buttons and chips. Normal case for headings, paragraphs and user-entered text so they stay readable.
- **Letter-spacing:** none on body text (`0`), slightly wide on uppercase labels (`0.08em`).
- **Numbers:** use `font-variant-numeric: tabular-nums` on metrics, tables and charts so digits line up.

| Role | Size | Notes |
|---|---|---|
| Hero / big number | 48–64px | Key metric, hero title |
| H1 | 32px | Page title |
| H2 | 22px | Section title |
| Body | 15px / 1.6 | Paragraphs |
| Label | 12px | Captions, tags, units |

Small label prefixes still add the instrument feel: `// PEAK FLOW`, `> STATUS`.

---

## 4. Surface (kept subtle)

Only one optional effect for now: a very faint static scanline texture on the page background. No grain animation, no flicker, no bloom.

```css
body{
  background:var(--bg);
  color:var(--text);
  font-family:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:15px; line-height:1.6; letter-spacing:0;
  font-variant-numeric:tabular-nums;
}
.label{ font-size:12px; font-weight:500; letter-spacing:.08em; text-transform:uppercase; }
/* optional, static */
body::before{
  content:""; position:fixed; inset:0; pointer-events:none;
  background:repeating-linear-gradient(to bottom, transparent 0 3px, rgba(0,0,0,.18) 3px 4px);
}
```

Glow is allowed only on the most important status element, as a soft text/box shadow:
`text-shadow: 0 0 6px rgba(76,255,138,.4)`.

---

## 5. Imagery

Images are generated with the thermal prompt and used as the twin's visual (body/lungs/chest view).

- Same prompt and same crop for every image so the set looks consistent.
- No text inside images. All labels and numbers are HTML on top.
- Light CSS finish so images sit in the theme:

```css
.thermal-img{ background:var(--inset); border:1px solid var(--line); }
.thermal-img img{ display:block; width:100%; object-fit:cover; filter:contrast(1.05) brightness(.95); }
```

- If an image looks like a normal daylight photo, regenerate it.
- Aspect ratios: hero `16:9`, cards `4:3`, twin view `3:4`.

---

## 6. Layout

- Max width `1200px`, centered, side padding `24px` (16px on mobile).
- Spacing steps: 8, 16, 24, 32, 48, 64.
- Section spacing: `64px` desktop, `40px` mobile.
- Left-aligned content, simple grid (1 column mobile, 2–3 columns desktop).
- Radius `0`. Border `1px solid var(--line)`. No shadows.

---

## 7. Components (core set)

**Panel / card**
Background `--panel`, 1px `--line` border, padding 24px. Title in label style with `//` prefix.

**Button**
- Primary: transparent, 1px `--text` border, `--text` color. Hover: fill `--text`, text `--bg`.
- Secondary: 1px `--line` border, `--text-dim` color. Hover: border `--text`.
- Height 44px, padding `0 24px`, uppercase.

**Status chip**
1px border, 12px uppercase text, color from the heat table, always with a word:
`NORMAL` · `CAUTION` · `ELEVATED` · `HIGH RISK`.

**Metric readout**
Label above (dim), big number (`--text-hot`), unit and trend below. The number's color follows its status.
Example metrics for asthma: `PEAK FLOW`, `AIR QUALITY (AQI)`, `POLLEN`, `HUMIDITY`, `RESPIRATORY RATE`, `RISK LEVEL`.

**Twin viewport**
Thermal image in `.thermal-img`, with small circular markers on regions of interest (chest, airways). Marker color = status color. Clicking a marker shows that region's values in a side panel. Static, no scan animation.

**Inputs**
Background `--inset`, 1px `--line` border, text `--text`. Focus: border `--text`. Error: border and message in `--danger` with the word `ERROR`.

**Nav**
Top bar, `--bg` with a 1px bottom `--line`. Links in label style. Active link `--text-hot` with underline.

**Table**
Header in `--text-dim`, rows divided by `--line`, hover row `--inset`.

**Charts**
1.5px `--text` line on `--bg`, grid in `--line`, labels `--text-dim`. A segment that crosses a threshold turns `--warn` or `--danger`. Max 2 lines per chart.

---

## 8. Motion

Minimal. 150ms color transitions on hover and focus only. Nothing loops, flashes or flickers. Respect `prefers-reduced-motion`.

---

## 9. Voice

Short, clear labels (uppercase for small labels only). Plain language for health information so patients can follow it (for example `AIR QUALITY IS POOR TODAY`). No emojis, no exclamation marks. Always show units and the time of the reading.

Include a visible note on health pages: `THIS IS A PROTOTYPE, NOT MEDICAL ADVICE.`

---

## 10. Accessibility

- `--text` on `--bg` is high contrast (about 15:1). Never use `--line` for text.
- Warm status colors always come with a word or symbol (`▲ HIGH`).
- Visible focus: 2px `--text-hot` outline, 2px offset.
- Touch targets at least 44px.
- Images get meaningful `alt` text.
- Body text can be sentence case for readability.

---

## 11. Do / Don't

**Do**
- Keep everything green on near-black.
- Use yellow, orange and red only for status.
- Keep corners square, borders thin, motion minimal.

**Don't**
- Use white, grey, blue or pastel colors.
- Use heat colors for decoration.
- Add flicker, looping animation or heavy glow (yet).
- Put text inside images.

---

## 12. Later (not now)

Parked in `design-full.md`: grain overlay, animated scan line, bloom, flicker, vignette, CRT power-on, glitch transitions, FX on/off toggle, full heat gradient.
