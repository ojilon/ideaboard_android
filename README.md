# Ideaboard (Android)

A local-first, installable web app (PWA) for capturing small ideas on a phone, arranging them on a board, and collecting links (mainly X bookmarks) that you connect to those ideas.

Vite + TypeScript + plain HTML/CSS. No frameworks, no backend, no accounts. ~27 KB of gzipped JS.

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # typecheck + production build into dist/
pnpm preview    # serve dist/ locally
pnpm test       # pure-logic tests (node:test)
pnpm icons      # regenerate the PNG icons from scripts/icons.mjs
```

## What it does

- **Boards** — a calm, dotted canvas. Pan with one finger, pinch to zoom, long-press empty space for a note.
- **Sticky notes** — type in place, five soft colours, drag, resize, duplicate, delete. Autosaved.
- **Regions** — dashed labelled boxes ("Mon", "Tue", …) you can move, resize, recolour, rename.
- **Connectors** — tap two items in connect mode; the dotted arrow follows them as they move.
- **Pen** — freehand ink with an eraser, undo/redo (snapshot undo covers every board edit).
- **Images** — camera or gallery, downscaled to ≤1400 px and stored as blobs in IndexedDB.
- **Links** — cards with URL, domain, your title, your note, tags and date. Inbox → board. Search, filter by tag, bulk paste, Web Share Target.
- **Backup** — one versioned JSON file (boards + items + connectors + strokes + links + images), import it back; reminder after 20 changes.
- **Settings** — light/dark, note font, background image with opacity, persistent storage, optional link previews (off by default).

## Try it on a phone

1. Deploy to GitHub Pages — the workflow in `.github/workflows/deploy.yml` builds and publishes on push to `main` (enable **Settings → Pages → Source: GitHub Actions** once). See `docs/PWA_NOTES.md`.
2. Open the HTTPS URL in Chrome on Android → **Add to Home screen**.
3. Share any link from X or Chrome to **Ideaboard** to put it in the Inbox.

## Privacy

Everything you type stays in your browser's IndexedDB. The only network requests are: loading the app (once, then cached), and — only if you switch on *Link previews* in Settings — sending a saved URL to a public oEmbed service. That switch is off by default, and X links usually have no preview (the app says so instead of pretending).

## Repo layout

| Path | What |
| --- | --- |
| `src/main.ts` | boot, theme, share-target entry, hash router |
| `src/lib/` | model, IndexedDB, store (autosave + undo), export/import, URL parsing, PWA helpers |
| `src/views/` | Boards, Board (canvas), Links, Settings screens |
| `src/components/chrome.ts` | bottom nav, banners, board thumbnails |
| `tests/` | pure-logic tests for URLs, bulk paste, dates, file validation |
| `scripts/icons.mjs` | dependency-free PNG icon renderer |
| `scripts/smoke-dom.mjs` | optional DOM smoke test (see below) |
| `docs/` | architecture, data format, roadmap, PWA notes |
| `docs/designs/` | the design references the UI follows |

## Verification

```bash
pnpm test                      # 10 logic tests
pnpm build                     # typecheck + bundle
node scripts/smoke-dom.mjs     # optional: drives the built UI in happy-dom
```

The smoke test needs two dev-only packages that are intentionally **not** dependencies:

```bash
npm i --no-save happy-dom fake-indexeddb
```

It boots the built bundle against `fake-indexeddb`, creates a board, adds a note by long-press, types, recolours, adds a region, draws and undoes a pen stroke, connects two items, pans, pinch-zooms, saves and places a link, bulk-adds links, flips the theme, and finally loads the bundle at `/share-target?…` to check the share flow. No real browser is involved, so it does not test layout, CSS, the on-screen keyboard or service-worker installation — those need a phone or Chrome DevTools.
