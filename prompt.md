You are building "Ideaboard (Android)", a local-first installable web app (PWA) for phone use. Work in small, verifiable steps. Use surgical edits after files exist; do not rewrite whole files. Do not claim anything works until you have run it.

## Constraints
- Stack: Vite + TypeScript + plain HTML/CSS. pnpm only. No React/Vue/Svelte, no UI kits, no heavy libraries. Allowed small deps: `idb` (or idb-keyval), `vite-plugin-pwa`. Ask before adding anything else.
- Must run with `pnpm dev` and build with `pnpm build` on a low-end Windows PC (Celeron). Keep the bundle small.
- No Java, Android SDK, NDK or native tooling.
- Fully local: no accounts, no backend, no analytics.

## Setup (first)
1. Work in this empty repo: [path]. Write before any app code:
   - GOAL.md, README.md
   - docs/ARCHITECTURE.md, docs/DATA_FORMAT.md, docs/ROADMAP.md, docs/PWA_NOTES.md
2. Design references are in docs/design/ (PC concepts 01-08, Android concept 09, plus new Android screens). Read them. Where they disagree, use: a light theme by default, a clean sans-serif for UI, a handwriting-style font for sticky notes (system or self-hosted only, no remote font loading), small rounded corners (4-6px), dotted outlines for regions, thin underline highlights for isolated words. Dark theme follows 03-dark-board.
3. docs/DATA_FORMAT.md must match the PC app's concept: a board is items (notes, regions, images, link cards), connectors, freehand strokes. Use plain versioned JSON so boards can be exported from one app and imported into the other.

## Goal
Capture small scattered ideas in under 3 seconds on a phone, arrange them on a board, and collect links (mainly X bookmarks) and connect them to ideas.

## Features
Board (touch-first, using Pointer Events):
- Pan with one finger on empty space, pinch to zoom.
- Sticky notes: create by long-press or the "+" button, drag, resize, edit in place, a few soft colors, delete.
- Regions: dotted-outline labeled rectangles (e.g. days).
- Connectors: straight dotted lines between two items that follow when items move.
- Freehand pen with eraser and undo/redo.
- Images: add from gallery or camera, stored as blobs in IndexedDB, resized on import to keep storage small.
- Render notes/regions/images as DOM and connectors/strokes in one SVG layer. No canvas library.

Links:
- A "Link card" item: URL, domain, your own title, your note, tags, date saved. Can be placed on a board and connected to notes like any item.
- A Links library screen: list/grid, search, filter by tag, "Inbox" for unsorted.
- Web Share Target: register in the manifest so sharing a link from the X app or Chrome to Ideaboard creates a link card in the Inbox. Test the share flow and document how to verify it.
- Bulk add: paste many URLs at once (one per line) to create link cards.
- Preview (best effort, keep it honest):
  - Default: no network preview. Show domain, your title/note, and an "Open" button.
  - Optional setting, OFF by default: fetch a preview through a public link-preview/oEmbed service, with a clear label that this sends the URL to a third party. If the preview fails, fall back silently to the default card.
  - Do not scrape pages from the browser (CORS will block it) and do not embed iframes of sites that refuse embedding.
  - Document the limits in docs/PWA_NOTES.md, including that X links often cannot be previewed.

Storage and safety:
- IndexedDB for everything. Autosave on every change (debounced).
- Call navigator.storage.persist() and show whether persistence was granted.
- Export all data to one JSON file and import it back. Add a visible "Back up" reminder in settings and after every N changes.
- Handle IndexedDB errors without losing in-memory work.

PWA:
- Web manifest, icons, service worker (precache app shell), works fully offline after first load, installable from Chrome on Android.
- App must work in standalone mode with safe-area insets handled.
- Document how to deploy to GitHub Pages (HTTPS) so it can be installed on a phone, and how to test installability. Set up the GitHub Pages deployment (GitHub Actions) only after the app runs locally.

Settings: light/dark theme, font choice, background image with dim control, board background transparency effect where it makes sense on mobile.

## UI rules
- Thumb-friendly: bottom toolbar, touch targets at least 48px, no hover-only interactions.
- Minimal and calm, matching the design references. No clutter.

## Build order (stop and show me after each, with a commit)
1. Setup + docs
2. Vite + TS shell, manifest, service worker, installable "hello"
3. Board with pan/pinch-zoom
4. Sticky notes + IndexedDB storage
5. Regions + connectors
6. Freehand + images
7. Link cards, Links library, share target, bulk add
8. Export/import + persistence
9. Settings, themes, optional preview
10. GitHub Pages deployment

## Rules
- Commit after each step with a clear message.
- If something is not possible in a PWA, say so and propose the closest option. Do not fake it.
- Keep code small, typed, and readable. Prefer the platform (DOM, SVG, Pointer Events, IndexedDB) over libraries.