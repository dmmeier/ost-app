# OST app — Brand assets

This folder contains the favicon, wordmark, and brand tokens for the **OST app** (Opportunity Solution Trees). It is designed for direct drop-in to the repo by Claude Code.

---

## At a glance

| File | Purpose |
|---|---|
| `favicon.svg` | Primary favicon — teal disc + white tree |
| `mark-monochrome.svg` | Flat teal tree (no disc) — for masks, dark-mode UI, single-color contexts |
| `mark-white.svg` | Flat white tree (no disc) — for placement on solid teal/dark surfaces |
| `wordmark.svg` | Disc + "OST app" lockup, ink on light backgrounds |
| `wordmark-on-dark.svg` | Disc + "OST app" lockup, white on dark backgrounds |
| `apple-touch-icon.svg` | iOS home-screen icon (rounded square, 180×180 source) — convert to PNG before shipping |
| `site.webmanifest` | PWA manifest with name, theme color, icon refs |
| `tokens.css` | CSS variables for color + type — single source of truth |

---

## Design rationale

- **Mark:** simplified opportunity-solution-tree — root node, three child nodes, three connecting branches. Reverse-out white on a teal disc.
- **Why not the existing `icon.svg`?** That icon is a literal tree diagram with thin strokes. It looks great at 96px and turns into a green smudge at 16px (the actual favicon size). The new mark thickens strokes and enlarges nodes so it survives 16px while keeping the same visual language.
- **Color:** anchored on the existing brand teal `#0d9488` (teal-600). No color shift — this is a refinement, not a rebrand.
- **Type:** IBM Plex Sans for the wordmark (humanist sans, friendly, with a technical heritage that fits a product tool). Weight 600, letter-spacing −0.02em.

---

## ⚠️ Mark-vs-glyph hierarchy (read this before placing icons in the UI)

There are three forms of the mark and they are **not interchangeable**. Misusing them dilutes the brand.

| Form | File | Means | Use it for |
|---|---|---|---|
| **Disc + white tree** | `favicon.svg` | "This is the OST product" | Browser favicon, top-bar wordmark, app icon, OS dock, OG image, login splash |
| **Flat teal tree** | `mark-monochrome.svg` | "This is a tree (instance)" | Sidebar tree-row icons, breadcrumbs referencing a tree, empty states, inline references |
| **Flat white tree** | `mark-white.svg` | "This is a tree, on a dark/teal surface" | Same as flat teal, but on dark mode or solid teal backgrounds |

**The rule:** the **disc form appears once per screen** (the product wordmark in the top-left). Every other "tree" reference inside the app — sidebar items, breadcrumbs, empty states, anywhere the UI is talking about *a* tree rather than *the* product — uses the **flat glyph**.

**Concretely:**
- ✅ Top header wordmark → disc form (`wordmark.svg`)
- ✅ Browser tab → disc form (`favicon.svg`)
- ✅ Sidebar row "Customer Retention Strategy" → flat teal glyph (`mark-monochrome.svg`)
- ✅ Empty state "Select or create a tree" → flat teal glyph
- ❌ Do **not** put the disc-form next to every tree in the sidebar. The disc is the product, not a tree instance.
- ❌ Do **not** use the flat glyph as a favicon — it lacks a contained shape and reads weakly at 16px.

---

## File-by-file usage

### `favicon.svg` — primary favicon
**Use when:** the browser/OS needs a small square mark — browser tabs, bookmarks, history lists, share previews where no other size is available.

**Where to place:** `frontend/public/favicon.svg` (or wherever Next.js serves your existing icon — likely replacing or sitting alongside `frontend/src/app/icon.svg`).

**Wire up in HTML head:**
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

For Next.js App Router you can also drop it as `frontend/src/app/icon.svg` — Next will auto-generate the `<link>` tag. If keeping the old `icon.svg` for any reason, this file should win precedence.

**Do not** scale the disc proportions — it's designed as a 64×64 viewBox with a perfectly inscribed circle. SVG handles all sizes from a single file.

---

### `mark-monochrome.svg` — flat teal mark
**Use when:** referencing *a tree instance* — sidebar tree-row icons, breadcrumbs that name a tree, empty states ("Select or create a tree"), inline mentions, decorative section dividers, watermark behind tree visualizations.

**This is the icon to use next to every tree row in the sidebar.** Not the disc.

**Do not** use this as a favicon — it lacks a contained shape and looks weak at small sizes.

---

### `mark-white.svg` — flat white mark
**Use when:** placing the tree on a solid teal, dark, or photographic background where you want the mark to read as part of the surface (no disc enclosure). Examples: dark-mode top bar, hero section over a teal panel, login screen splash.

---

### `wordmark.svg` — full lockup (light)
**Use when:** introducing the product name alongside the mark — marketing site header, README hero, login screen, "About" dialogs, email signatures.

**Do not** recreate the lockup by hand-typesetting the disc next to "OST app" — the spacing in this file is tuned. If you need different proportions, scale this SVG; don't rebuild it.

**Minimum width:** 120px. Below that, use `favicon.svg` alone.

---

### `wordmark-on-dark.svg` — full lockup (dark)
**Use when:** the same as `wordmark.svg`, but on dark backgrounds (>50% gray, near-black, dark mode).

The disc itself stays teal — only the text color flips. This is intentional: the teal disc is the brand anchor and shouldn't invert.

---

### `apple-touch-icon.svg` — iOS home-screen
**Use when:** users save the web app to their iOS home screen.

This is a **rounded-square** version (40px corner radius on a 180×180 canvas) because iOS expects a squircle, not a circle, and applies its own mask. The disc is replaced by a teal rounded-square; the tree glyph is enlarged to fit the new canvas.

**Important:** iOS prefers PNG for `apple-touch-icon`. Export this SVG to a 180×180 PNG before shipping:
```bash
# Using rsvg-convert (or any SVG→PNG tool)
rsvg-convert -w 180 -h 180 apple-touch-icon.svg -o apple-touch-icon.png
```

Then in HTML:
```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

---

### `site.webmanifest` — PWA manifest
**Use when:** the app is installable as a PWA, or you want richer metadata for browsers and OS integrations.

Wire up in HTML head:
```html
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#0d9488" />
```

Adjust `start_url`, `name`, and `description` if your routing or product naming differs.

---

### `tokens.css` — brand CSS variables
**Use when:** you want a single source of truth for brand colors and type. Import once at the root of your styles and reference the variables everywhere.

```css
@import './brand/tokens.css';

.cta-button {
  background: var(--ost-teal);
  color: var(--ost-paper);
  font-family: var(--ost-font-sans);
}
```

If the project already has design tokens (Tailwind config, CSS Modules, theme object), **map these into that system** rather than duplicating. The values that matter: `#0d9488` for teal, IBM Plex Sans for the wordmark.

---

## Top-bar treatment

The app's top bar (wordmark + breadcrumbs + right-side actions) sits on a **near-black** background. This gives the product a slick, modern pro-tool feel and lets the teal disc in the wordmark visually anchor every screen. The tree canvas below stays light, so the dark bar reads as architecture rather than decoration.

**Spec:**

| Property | Value |
|---|---|
| Background | `#1a1a1a` (`var(--ost-ink)`) — near-black, not pure `#000` |
| Bottom border | none (the value contrast against the canvas is enough); optional `1px solid rgba(255,255,255,0.06)` for subtle definition |
| Height | 56–64px (keep current — don't change) |
| Wordmark | `wordmark-on-dark.svg` (disc stays teal, "OST" white, "app" light gray) |
| Breadcrumb — current page | `#ffffff` |
| Breadcrumb — parent crumbs | `#9ca3af` (`var(--ost-muted)`) |
| Breadcrumb separator (`›`) | `#4b5563` |
| Right-side actions (Settings, etc.) | `#ffffff` text/icons |
| Right-side hover state | background `rgba(255, 255, 255, 0.08)`, radius `8px` |
| Active "Chat" pill | teal `#0d9488` background, white text — keep as-is, contrast against black is great |
| Focus ring | `2px solid #5eead4` (teal-300) for visibility on dark |

**CSS:**

```css
.app-header {
  background: var(--ost-ink);            /* #1a1a1a */
  color: #ffffff;
  /* optional hairline: */
  /* border-bottom: 1px solid rgba(255, 255, 255, 0.06); */
}

.app-header .breadcrumb-current { color: #ffffff; }
.app-header .breadcrumb-parent  { color: var(--ost-muted); }   /* #6b7280 also acceptable; #9ca3af reads better on black */
.app-header .breadcrumb-sep     { color: #4b5563; }

.app-header .header-action {
  color: #ffffff;
  border-radius: 8px;
  padding: 6px 10px;
}
.app-header .header-action:hover {
  background: rgba(255, 255, 255, 0.08);
}
.app-header .header-action:focus-visible {
  outline: 2px solid #5eead4;
  outline-offset: 2px;
}
```

**Why this works:**
- The teal disc on near-black is the most visually striking placement of the brand — it sings.
- A dark architectural bar makes the white canvas read clearly as the working surface.
- Future-proofs dark mode: the header already lives there.
- Near-black (`#1a1a1a`) softens the slickness so the product still feels approachable, not corporate.

**Don't:**
- Don't use pure `#000` — it's harsher and less modern than `#1a1a1a`. Linear, Notion, and most modern pro tools use a near-black for exactly this reason.
- Don't use the teal `#0d9488` as the header background — it would compete with the node-type color legend immediately below, and the disc would dissolve.
- Don't apply the dark treatment to the project sidebar — keep that surface white/paper. Only the top horizontal bar is dark.
- Don't add gradients, glows, or inner shadows. Flat near-black, full stop.
- Don't swap the wordmark for the light-mode variant — use `wordmark-on-dark.svg` so the text colors are correct.

---

Drop this into the root layout (`frontend/src/app/layout.tsx` or equivalent):

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#0d9488" />
```

For Next.js App Router, `metadata` export equivalent:

```ts
export const metadata = {
  title: 'OST app',
  description: 'Opportunity Solution Trees',
  themeColor: '#0d9488',
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};
```

---

## What to install where

Suggested mapping into the existing repo (adjust to your conventions):

```
frontend/public/
  ├── favicon.svg                ← from brand/favicon.svg
  ├── apple-touch-icon.png       ← exported from brand/apple-touch-icon.svg (180×180)
  └── site.webmanifest           ← from brand/site.webmanifest

frontend/src/app/
  └── icon.svg                   ← REPLACE with brand/favicon.svg contents
                                   (Next.js auto-generates the <link> tag from this)

frontend/src/styles/
  ├── brand-tokens.css           ← from brand/tokens.css
  └── (import in your global stylesheet)

frontend/src/components/brand/
  ├── Wordmark.tsx               ← inline brand/wordmark.svg
  └── Mark.tsx                   ← inline brand/mark-monochrome.svg or mark-white.svg
```

For the React components, inline the SVG content rather than `<img src>` — this lets you control color via `currentColor` if you want and avoids an extra request.

---

## Don'ts

- **Don't** modify the proportions of the mark — disc radius, node sizes, stroke weight (3.5) are tuned for legibility down to 16px.
- **Don't** rotate, skew, or apply effects (drop shadows, gradients, glows) to the mark or wordmark.
- **Don't** change the teal `#0d9488`. If a different surface needs more contrast, place the mark on a neutral container — don't recolor the disc itself.
- **Don't** stretch the wordmark — scale uniformly only.
- **Don't** typeset "OST app" by hand to recreate the wordmark. Use `wordmark.svg`.
- **Don't** use `mark-monochrome.svg` or `mark-white.svg` as a favicon — they lack the contained disc shape.

---

## Spec sheet

| Token | Value |
|---|---|
| Brand color | `#0d9488` (teal-600) |
| Brand color, deep | `#0b7a70` |
| Brand color, tint | `#e6f4f3` |
| Ink | `#1a1a1a` |
| Muted | `#6b7280` |
| Wordmark face | IBM Plex Sans |
| Wordmark weight | 600 (regular for "app") |
| Wordmark tracking | −0.02em |
| Mark canvas | 64 × 64 viewBox |
| Mark stroke | 3.5 |
| Apple-touch corner radius | 40 / 180 ≈ 22% |

---

## Provenance

These assets supersede `frontend/src/app/icon.svg` (the original literal tree diagram). The original may be kept for backward compatibility or removed; either is fine. The new mark is a deliberate refinement — same teal, same tree metaphor, simplified for small-size legibility.
