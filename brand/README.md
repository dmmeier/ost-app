# OST app — Brand assets · v2 (Whisper)

This folder supersedes `brand/`. It documents the **Paper · Whisper**
direction: lightly-warmed surfaces, a light unified header, and a serif
display face for titles. The mark, wordmark form, teal accent, and
node-type palette are **unchanged** — this is a refinement of the *room*
the brand lives in, not the brand itself.

> *Whisper note.* The v2 spec initially used a more saturated cream
> (`#f5f0e6`) for the canvas. At full-screen scale that read khaki, so the
> canvas tone has been re-tuned: lighter and less saturated, still warm.
> All hexes below reflect the current values.

---

## What's new in v2

| | v1 | v2 (Whisper) |
|---|---|---|
| Page / canvas | `#ffffff` pure white | `#f8f6f0` Whisper |
| Elevated paper (cards, fields) | (same as page) | `#fefdf9` |
| Ink (body text) | `#1a1a1a` cool near-black | `#2c2620` warm dark brown |
| Muted (secondary text) | `#6b7280` cool gray | `#7a6f5b` warm taupe |
| Faint (placeholder) | (none) | `#9a8d75` |
| Line / hairline | `#e5e1d8` | `#ece6d3` |
| Dot-pattern color | (inherited from line) | `#dad2b6` (own value, fainter than line) |
| Top bar | `#1a1a1a` near-black slab | **light, same surface as the canvas** |
| Display face | (none — Plex throughout) | **Newsreader** serif for titles |
| Body face | IBM Plex Sans | IBM Plex Sans (unchanged) |
| Mono face | IBM Plex Mono | IBM Plex Mono (unchanged) |
| Brand teal `#0d9488` | — | **unchanged** |
| Disc + tree mark | — | **unchanged** |
| Node-type colors | — | **unchanged** |

The biggest practical change is the top bar: the v1 brief was firm about a
near-black anchor. v2 lets the header join the rest of the surface so the
app reads as one continuous, quiet plane — closer in spirit to the
understated design tools the product is trying to feel like.

---

## At a glance

| File | Purpose |
|---|---|
| `tokens.css` | CSS variables — single source of truth |
| `favicon.svg` *(from v1)* | Primary favicon — teal disc + white tree |
| `mark-monochrome.svg` *(from v1)* | Flat teal tree (no disc) — masks, inline use |
| `mark-white.svg` *(from v1)* | Flat white tree — placement on dark/teal surfaces (rare in v2) |
| `wordmark.svg` *(from v1)* | Disc + "OST app" lockup, ink on light backgrounds — **now the primary lockup** |
| `wordmark-on-dark.svg` *(from v1)* | Same on dark — for occasional dark dialogs / marketing only |
| `apple-touch-icon.svg` *(from v1)* | iOS home-screen icon — convert to PNG before shipping |
| `site.webmanifest` *(from v1)* | PWA manifest |

The SVG assets are **identical to v1**. Carry them forward as-is.

---

## Color system

### Brand

| Token | Value | Use |
|---|---|---|
| `--ost-teal` | `#0d9488` | Primary accent — disc, active tab, links, "Send" pill, active-tree marker |
| `--ost-teal-deep` | `#0b7a70` | Hover / pressed |
| `--ost-teal-soft` | `#86c5be` | Inactive tree-glyph icon, soft chip outline |
| `--ost-teal-tint` | `#e6f4f3` | Subtle teal-tinted backgrounds |

### Paper — the surface palette

A two-surface system. The **canvas** is the page; **paper** is what rests on
it (cards, fields, drawer tabs). The two are very close in value but
intentionally different so panels read as discrete objects.

A **two-tier surface system**. The chrome (sidebar, chat panel, header,
drawer tabs) and the elevated cards both sit on the **paper** value;
together they form the upper surface. The **canvas** sits one tier below
— a recessed cream "workspace" framed by the chrome and inhabited by the
cards. Visually: the cream is the *page being worked on*; everything
around it is *paper holding the page in place*.

| Token | Value | Role |
|---|---|---|
| `--ost-canvas` | `#f8f6f0` | The recessed working surface — tree canvas, drawer body |
| `--ost-paper` | `#fefdf9` | Chrome and elevated cards — sidebar, chat, header, drawer tabs, cards on canvas |
| `--ost-sidebar` | `#fefdf9` | Alias of `--ost-paper`; preserved as a separate name in case the chrome ever needs to diverge |
| `--ost-dot` | `#dad2b6` | Canvas dot-pattern color — fainter than line on purpose |

**The dot pattern matters.** If you're using `<Background variant="dots">`
from React Flow (or a CSS `radial-gradient` background), bind it to
`--ost-dot`, **not** `--ost-line`. Using `--ost-line` saturates the canvas
because every dot picks up the warm border tone — at canvas scale it
reads textured-khaki rather than tinted-paper. `--ost-dot` is sat-shifted
and lightness-shifted so the dots register as texture without colouring
the page.

```tsx
// ReactFlow
<Background variant="dots" color="var(--ost-dot)" gap={14} size={1.5} />
```

**Inverted variant.** For dense form views (the detail drawer is the main
candidate), swap which surface holds the cream. The page becomes light and
the fields become cream, so each field reads as a tactile block sitting on
the page. Apply with `data-paper="inverted"` on the region root — tokens.css
re-binds the two values for that subtree.

```html
<section data-paper="inverted">…drawer contents…</section>
```

### Ink

| Token | Value | Use |
|---|---|---|
| `--ost-ink` | `#2c2620` | Body text, primary content, headings |
| `--ost-muted` | `#7a6f5b` | Secondary text, field labels, timestamps |
| `--ost-faint` | `#9a8d75` | Placeholder text, tertiary copy |
| `--ost-line` | `#ece6d3` | Hairline borders, table separators |
| `--ost-chip` | `#f1ece0` | Count chips, hover fills, embedded mono inputs |
| `--ost-row-active` | `#f1ebdf` | Active row background in sidebar/lists |

The warmer ink (`#2c2620` vs v1's `#1a1a1a`) is critical — pure cool ink
fights the warm paper and reads as a foreign object on the page. Keep the
warmth coordinated.

### Node-type palette (unchanged)

Used on the tree canvas. These are per-tree defaults that the user can
override; they are **not** rebrand candidates.

| Token | Value | Type |
|---|---|---|
| `--ost-node-outcome` | `#93c5fd` | Outcome |
| `--ost-node-opportunity` | `#fdba74` | Opportunity |
| `--ost-node-child` | `#fcd34d` | Child Opportunity |
| `--ost-node-solution` | `#6ee7b7` | Solution |
| `--ost-node-experiment` | `#c4b5fd` | Experiment |

---

## Type

A three-face system. **Newsreader** is new in v2 and carries the display
voice; the existing IBM Plex faces continue to do the heavy lifting for UI.

| Token | Face | Use |
|---|---|---|
| `--ost-font-display` | **Newsreader** | Section titles, drawer-tab page titles, node names in detail view, sidebar "Projects" header |
| `--ost-font-sans` | IBM Plex Sans | Body, navigation, form controls, buttons, chips, breadcrumbs |
| `--ost-font-mono` | IBM Plex Mono | Field labels (UPPERCASE), timestamps, IDs, commit hashes, count badges |

**Why Newsreader?** A modern editorial serif. Variable optical sizing
(`opsz`) means it reads warmly at headline sizes without becoming a
collector's serif. It pairs naturally with Plex (both are humanist) and
distinguishes the product from the wall of geometric-sans tools.

**Imports.**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**Sizes (UI defaults — not exhaustive).**

| Role | Face | Size | Weight | Tracking |
|---|---|---|---|---|
| Drawer page title | Display | 30 / 1.12 | 500 | −0.012em |
| Section title | Display | 18 / 1.15 | 500 | −0.012em |
| Sidebar "Projects" | Display | 18 / 1.15 | 500 | −0.012em |
| Body | Sans | 13 / 1.55 | 400 | 0 |
| UI labels | Sans | 13 / 1.3 | 500 | −0.005em |
| Section sub-label | Mono UPPERCASE | 10.5 | 500 | 0.16em |
| Timestamps, IDs | Mono | 11 | 400 | 0 |

---

## Header treatment (v2 · light)

The v1 spec called for a `#1a1a1a` near-black bar. v2 lets the header sit
on the same surface as the rest of the app.

| Property | Value |
|---|---|
| Background | `var(--ost-canvas)` or `var(--ost-sidebar)` (matches whichever chrome surface) |
| Bottom border | `1px solid var(--ost-line)` — hairline divider only |
| Height | 56–64px (unchanged) |
| Wordmark | `wordmark.svg` (disc + ink "OST" + muted "app") — **the light lockup** |
| Breadcrumb — current page | `var(--ost-ink)` |
| Breadcrumb — parent crumbs | `var(--ost-muted)` |
| Breadcrumb separator (`›`) | `#c8bea5` (line color, slightly more saturated) |
| Right-side actions | `var(--ost-ink)` text; hover bg `var(--ost-chip)`; radius `8px` |
| "Chat" pill | `var(--ost-teal)` bg / white text — unchanged |
| Focus ring | `2px solid var(--ost-teal)` |

**CSS.**

```css
.app-header {
  background: var(--ost-canvas);
  border-bottom: 1px solid var(--ost-line);
  color: var(--ost-ink);
}
.app-header .breadcrumb-current { color: var(--ost-ink); }
.app-header .breadcrumb-parent  { color: var(--ost-muted); }
.app-header .breadcrumb-sep     { color: #c8bea5; }
.app-header .header-action      { color: var(--ost-ink); border-radius: 8px; padding: 6px 10px; }
.app-header .header-action:hover { background: var(--ost-chip); }
.app-header .header-action:focus-visible { outline: 2px solid var(--ost-teal); outline-offset: 2px; }
```

**Why this works.**
The brand is anchored by the teal disc, not by chrome contrast. On cream,
the disc is more legible — not less — because the teal pops harder against
warm cream than against any near-black. The continuous surface makes the
canvas feel like the working surface and the header like the index card on
top of it, rather than a slab pressed onto the document.

**Don't.**
- Don't switch back to a near-black header for "more contrast" — the teal
  reads strongly on cream and you'll lose the calm.
- Don't tint the header a different cream than the rest — match exactly.
- Don't add a drop shadow under the header. A hairline is enough.
- Don't bring the brand teal into the header background. Reserve teal for
  accents (Chat pill, active tab, links).

---

## Mark-vs-glyph hierarchy *(unchanged from v1, included for completeness)*

Three forms of the mark; they are **not interchangeable**.

| Form | File | Means | Use it for |
|---|---|---|---|
| **Disc + white tree** | `favicon.svg` | "This is the OST product" | Browser favicon, top-bar wordmark, app icon, OS dock, OG image, login splash |
| **Flat teal tree** | `mark-monochrome.svg` | "This is a tree (instance)" | Sidebar tree-row icons, breadcrumbs referencing a tree, empty states, inline references |
| **Flat white tree** | `mark-white.svg` | "This is a tree on a dark surface" | Dark-mode contexts, solid-teal surfaces |

The disc appears **once per screen** (the product wordmark, top-left).
Every other "tree" reference inside the app uses the flat glyph.

---

## Drawer tabs (Detail / Context / History / Activity)

Tabs share the chrome with the rest of the app. The active tab uses the
teal pill on cream — high enough contrast to scan in a tab strip without
shouting.

```css
.tab-strip       { background: var(--ost-sidebar); border-bottom: 1px solid var(--ost-line); padding: 12px 24px 0; }
.tab             { padding: 7px 14px 9px; color: var(--ost-muted); font: 400 13px var(--ost-font-sans); border-radius: 8px; }
.tab[aria-selected="true"] { background: var(--ost-teal); color: #fff; font-weight: 500; }
```

The drawer content area is a strong candidate for `data-paper="inverted"` —
fields and cards read as physical blocks on the page, which suits dense
form UI better than the default figure/ground.

---

## Sidebar / project navigator

Projects are boxed cards with **no chevron disclosure**. The `(n)` count
after the project name carries the same information without an arrow that
rotates.

```css
.project           { background: transparent; border: 1px solid var(--ost-line); border-radius: 8px; padding: 8px 10px; }
.project[aria-expanded="true"] { background: var(--ost-paper); }
.project-name      { font: 600 13px var(--ost-font-sans); color: var(--ost-ink); letter-spacing: -0.005em; }
.project-count     { color: var(--ost-muted); font-weight: 400; font-size: 12px; }
```

---

## Migrating from Tailwind grays

The most common mistake after a v1→v2 swap is leaving cool Tailwind grays
(`text-gray-500`, `bg-white`, `border-gray-200`, etc.) on warm cream
surfaces. Visually this reads as a temperature clash — cool foreign objects
sitting on warm paper. Per element it's subtle; over a whole screen it
quietly drains the calm out of the palette.

**Step 1 — make the tokens first-class Tailwind colors.** Extend
`tailwind.config.ts` so `text-muted`, `bg-paper`, `border-line` etc. work
without the `[var(...)]` escape hatch:

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand
        teal:       'var(--ost-teal)',
        'teal-deep':'var(--ost-teal-deep)',
        'teal-soft':'var(--ost-teal-soft)',
        'teal-tint':'var(--ost-teal-tint)',
        // Paper
        canvas:     'var(--ost-canvas)',
        paper:      'var(--ost-paper)',
        sidebar:    'var(--ost-sidebar)',
        dot:        'var(--ost-dot)',
        // Ink
        ink:        'var(--ost-ink)',
        muted:      'var(--ost-muted)',
        faint:      'var(--ost-faint)',
        line:       'var(--ost-line)',
        chip:       'var(--ost-chip)',
        'row-active': 'var(--ost-row-active)',
      },
      fontFamily: {
        display: ['var(--ost-font-display)'],
        sans:    ['var(--ost-font-sans)'],
        mono:    ['var(--ost-font-mono)'],
      },
    },
  },
} satisfies Config;
```

**Step 2 — find and replace.** Map every cool gray onto a warm token:

| Tailwind class | Replace with | Notes |
|---|---|---|
| `text-black`, `text-gray-900` / `-800` / `-700` | `text-ink` | body & headings |
| `text-gray-600`, `text-gray-500` | `text-muted` | labels, timestamps, secondary |
| `text-gray-400` | `text-faint` | placeholder, very faint copy |
| `text-gray-300` | `text-faint opacity-70` | rare |
| `bg-white` | `bg-paper` | cards, fields, panels |
| `bg-gray-50` | `bg-canvas` | page background |
| `bg-gray-100` | `bg-chip` | hover fills, soft tints |
| `bg-gray-200` (as fill) | `bg-line` | rare; usually a divider, not a fill |
| `bg-black` | (keep — only for intentional dark regions) | should be rare in v2 |
| `border-gray-100` | `border-line` | very faint divider |
| `border-gray-200` | `border-line` | standard hairline |
| `border-gray-300` | `border-line` | tighten if needed; line tokens are warm |
| `divide-gray-200` | `divide-line` | tables, lists |
| `placeholder-gray-400` / `-500` | `placeholder-muted` | inputs |
| `placeholder-gray-300` | `placeholder-faint` | inputs |
| `ring-gray-*` | `ring-teal` | focus rings should always use the brand accent |
| `hover:bg-gray-50` | `hover:bg-chip` | row & item hover |
| `hover:bg-gray-100` | `hover:bg-chip` | same |

**Find these patterns:**

```bash
# Sanity check before the refactor — count what's left to do:
rg -c "text-gray|bg-gray|border-gray|divide-gray|ring-gray|placeholder-gray|bg-white|text-black|bg-black" src
```

**Step 3 — codemod (optional).** For a one-pass replace, this
`sed` script handles ~90% of the mechanical cases. Run it once, review
the diff carefully, then hand-fix the long tail (anywhere the *intent* of
a neutral gray was special — e.g. status indicators, marketing screenshots —
revert it after the codemod).

```bash
# Run from the repo root. Adjust the path glob as needed.
fd -e tsx -e ts -e jsx -e js . src | xargs sed -i '' \
  -e 's/\btext-black\b/text-ink/g' \
  -e 's/\btext-gray-900\b/text-ink/g' \
  -e 's/\btext-gray-800\b/text-ink/g' \
  -e 's/\btext-gray-700\b/text-ink/g' \
  -e 's/\btext-gray-600\b/text-muted/g' \
  -e 's/\btext-gray-500\b/text-muted/g' \
  -e 's/\btext-gray-400\b/text-faint/g' \
  -e 's/\bbg-white\b/bg-paper/g' \
  -e 's/\bbg-gray-50\b/bg-canvas/g' \
  -e 's/\bbg-gray-100\b/bg-chip/g' \
  -e 's/\bborder-gray-100\b/border-line/g' \
  -e 's/\bborder-gray-200\b/border-line/g' \
  -e 's/\bborder-gray-300\b/border-line/g' \
  -e 's/\bdivide-gray-200\b/divide-line/g' \
  -e 's/\bplaceholder-gray-400\b/placeholder-muted/g' \
  -e 's/\bplaceholder-gray-500\b/placeholder-muted/g' \
  -e 's/\bplaceholder-gray-300\b/placeholder-faint/g' \
  -e 's/\bring-gray-300\b/ring-teal/g' \
  -e 's/\bring-gray-400\b/ring-teal/g' \
  -e 's/\bhover:bg-gray-50\b/hover:bg-chip/g' \
  -e 's/\bhover:bg-gray-100\b/hover:bg-chip/g'
```

**Step 4 — guardrail.** Once migrated, add a lint rule so cool grays
can't sneak back in. The simplest is an ESLint custom rule on the
`className` attribute that bans the patterns; alternatively a CI grep:

```bash
# .github/workflows/check-warm-tokens.yml — fail if any cool gray reappears
- run: |
    if rg -q "text-gray|bg-gray|border-gray|divide-gray|bg-white" src; then
      echo "Cool Tailwind grays found. Use warm tokens instead."
      rg -n "text-gray|bg-gray|border-gray|divide-gray|bg-white" src
      exit 1
    fi
```

**Intentional exceptions.** Not every neutral is wrong:
- Pure black/white inside a screenshot or marketing image — leave alone.
- Status indicators on data (e.g. a tooltip showing a dump of JSON, code
  blocks) — `bg-gray-900 text-gray-100` for a code-block tone is legitimate
  because it's standing in for a terminal, not for the app surface.
- Third-party widgets (charts, embeds) that need a neutral surrounding —
  isolate them in a container that explicitly opts out of paper.

For those cases, name the intent: add a `--ost-code-bg`, `--ost-code-ink`
token (or similar) and use it, rather than reaching back to raw Tailwind
grays.

---

## Drop-in for Next.js (App Router)

```ts
// frontend/src/app/layout.tsx
import './styles/brand-tokens.css';

export const metadata = {
  title: 'OST app',
  description: 'Opportunity Solution Trees',
  themeColor: '#f8f6f0',          // ← was #0d9488; now matches the page
  icons:    { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
  manifest: '/site.webmanifest',
};
```

Update `site.webmanifest` to match:

```json
{
  "name": "OST app",
  "short_name": "OST",
  "theme_color": "#f8f6f0",
  "background_color": "#f8f6f0"
}
```

---

## Spec sheet

| Token | Value |
|---|---|
| Brand teal | `#0d9488` |
| Brand teal deep | `#0b7a70` |
| Brand teal soft | `#86c5be` |
| Canvas (page) | `#f8f6f0` |
| Paper (elevated) | `#fefdf9` |
| Sidebar | `#fefdf9` |
| Dot pattern | `#dad2b6` |
| Ink | `#2c2620` |
| Muted | `#7a6f5b` |
| Faint | `#9a8d75` |
| Line | `#ece6d3` |
| Chip | `#f1ece0` |
| Display face | Newsreader |
| Body face | IBM Plex Sans |
| Mono face | IBM Plex Mono |
| Wordmark weight | 600 |
| Wordmark tracking | −0.02em |
| Mark canvas | 64 × 64 viewBox |
| Mark stroke | 3.5 |

---

## Don'ts

- **Don't** modify the mark — disc, node sizes, stroke weight (3.5) are tuned for 16px legibility.
- **Don't** change the brand teal `#0d9488`. If contrast is short on a surface, place the mark on a neutral container.
- **Don't** invert the paper relationship globally (light page becomes the rule). Inverted is **per region** and lives behind `data-paper="inverted"`.
- **Don't** reintroduce a near-black slab header. If you need a dark surface (modal, code preview), use a dark *region* inside the app — not a piece of chrome.
- **Don't** use Newsreader for body. It's a display face — drop it below ~16px and the eye fights it.
- **Don't** use IBM Plex Mono for prose. Reserve for labels, timestamps, IDs, hashes.
- **Don't** typeset "OST app" by hand. Use `wordmark.svg`.

---

## Provenance

v2 emerged from the *Paper* exploration. v1's near-black-anchor reasoning
("the teal disc sings on near-black") was sound for the contrast model but
fought the calm-tool feel the product was reaching for. v2 lets the room go
quiet and trusts the teal to carry the brand on its own, which it does.
