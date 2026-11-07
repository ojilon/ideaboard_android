# Roadmap

Each step is committed separately and is runnable on its own.

| # | Step | Status |
| --- | --- | --- |
| 1 | Setup + docs | done |
| 2 | Vite + TS shell, manifest, service worker, installable "hello" | done |
| 3 | Board with pan / pinch-zoom | done |
| 4 | Sticky notes + IndexedDB storage | done |
| 5 | Regions + connectors | done |
| 6 | Freehand pen (eraser, undo/redo) + images | done |
| 7 | Link cards, Links library, share target, bulk add | done |
| 8 | Export / import + persistence + backup reminders | done |
| 9 | Settings, themes, optional link preview | done |
| 10 | GitHub Pages deployment | done |

## After v1

- Optional: board background image per board (today it is one background for all boards, from Settings).
- Optional: "move to board" from the Inbox list without opening the link.
- Optional: two-finger long-press to select several notes and drag them together.
- Optional: a small "recently deleted" bin (needs a `deletedAt` field → format v2).

## Deliberately not doing

- Cloud sync or accounts: the whole point is local-only.
- Server-side link unfurling: needs a backend. The optional oEmbed preview is the honest limit.
- Canvas/WebGL board: DOM + SVG is enough at this scale and much easier to keep accessible.
