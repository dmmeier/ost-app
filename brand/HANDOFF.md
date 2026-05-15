# OST app — brand v2 (Whisper) · Handoff

This folder is the **drop-in replacement** for the repo's existing `brand/`
folder. Hand it to Claude Code in the OST repo together with the prompt
below.

## What's in here

| File | Purpose |
|---|---|
| `tokens.css` | All brand CSS variables — colours, surfaces, type, dot-pattern. Source of truth. |
| `README.md` | Full v2 spec: rationale, header treatment, navigator/drawer guidance, Tailwind config, and the migration codemod for cool Tailwind grays. |
| `HANDOFF.md` | This file. |

## What's NOT in here (intentionally)

The SVG assets (`favicon.svg`, `mark-monochrome.svg`, `mark-white.svg`,
`wordmark.svg`, `wordmark-on-dark.svg`, `apple-touch-icon.svg`),
`site.webmanifest`, and the iOS `apple-touch-icon.png` export are
**unchanged** from v1. Leave the existing ones in place — only `tokens.css`
and `README.md` need to be replaced.

---

## Prompt to paste into Claude Code

Open a fresh Claude Code session in the OST repo. Attach `tokens.css` and
`README.md` from this folder, then paste this prompt:

> Replace `brand/tokens.css` with the attached `tokens.css`. Replace
> `brand/README.md` with the attached `README.md`. Keep the existing SVG
> assets and `site.webmanifest` in `brand/` — they're unchanged.
>
> Then migrate the app from v1 cool grays to v2 warm tokens:
>
> **1. Tailwind tokens.** Extend `frontend/tailwind.config.ts` to expose
> the v2 tokens as first-class colour and font names. The README's
> *Migrating from Tailwind grays → Step 1* has the exact config block.
>
> **2. Codemod.** Run the `sed` script in the README's *Step 3* against
> `frontend/src`. Review the diff carefully. Anywhere a cool gray was
> *intentionally* neutral (code blocks, embedded charts, third-party
> widget containers), revert it — the README's *Intentional exceptions*
> subsection lists the cases. Sanity check when done:
>
>     rg "text-gray|bg-gray|border-gray|divide-gray|bg-white|ring-gray" frontend/src
>
> Expect zero hits outside intentional exceptions.
>
> **3. Theme colour metadata.** Update
> `frontend/src/app/layout.tsx`'s `metadata.themeColor` to `#f8f6f0`, and
> `frontend/public/site.webmanifest`'s `theme_color` and
> `background_color` to `#f8f6f0`. (See README *Drop-in for Next.js*.)
>
> **4. Dot pattern.** If the tree canvas uses React Flow's
> `<Background variant="dots">`, change its `color` prop to
> `var(--ost-dot)`. **Do NOT** use `var(--ost-line)` for the dot colour —
> that's what makes the canvas read khaki. The README's *Paper · The
> dot pattern matters* explains.
>
> **5. Header chrome.** The header is now light. Its background should be
> `var(--ost-canvas)` (not `#1a1a1a`) and it should use `wordmark.svg`
> (the ink-on-light lockup), not `wordmark-on-dark.svg`. The dark
> near-black header from v1 is retired.
>
> **6. Sidebar.** Remove the chevron disclosure (`▶`) from project rows in
> the navigator. The `(n)` count after the project name carries the
> expandability signal without an arrow.
>
> Don't use Newsreader below ~16px — it's a display face only. Body
> remains IBM Plex Sans, mono remains IBM Plex Mono. The full don't-list
> is at the bottom of the README.
>
> When done, run the dev server and verify: (a) header is light cream
> with a hairline divider, (b) sidebar has no chevrons and projects sit
> in subtle cards, (c) the tree canvas no longer reads khaki — dots
> register as texture, not colour, (d) no cool-gray contamination
> anywhere on screen.

---

## Quick reference — the key changes

| | v1 | v2 (Whisper) |
|---|---|---|
| Canvas / page | `#ffffff` | `#f8f6f0` |
| Elevated paper | (same as page) | `#fefdf9` |
| Ink | `#1a1a1a` | `#2c2620` |
| Muted | `#6b7280` | `#7a6f5b` |
| Line | `#e5e1d8` | `#ece6d3` |
| Dot pattern colour | (inherited from line) | `#dad2b6` (own token) |
| Top bar | near-black `#1a1a1a` | light, same surface as canvas |
| Display face | none | **Newsreader** |
| Body face | IBM Plex Sans | IBM Plex Sans (unchanged) |
| Mono face | IBM Plex Mono | IBM Plex Mono (unchanged) |
| Brand teal | `#0d9488` | `#0d9488` (unchanged) |
| Disc + tree mark | — | unchanged |

Everything that identifies the product (mark, teal, node-type colours,
Plex faces) is intact. The room just got softer.
