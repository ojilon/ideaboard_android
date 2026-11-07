# Ideaboard (Android)

A local-first, installable web app (PWA) for capturing small ideas on a phone, arranging them on a board, and collecting links (mainly X bookmarks) that you connect to those ideas.

Vite + TypeScript + plain HTML/CSS. No frameworks, no backend, no accounts.

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # typecheck + production build into dist/
pnpm preview    # serve dist/ locally
pnpm test       # pure-logic tests (node:test)
```

## What is in here

| Path | What |
| --- | --- |
| `src/` | App source (board, links, settings, storage) |
| `docs/ARCHITECTURE.md` | How the app is put together |
| `docs/DATA_FORMAT.md` | The versioned JSON format used for export/import |
| `docs/ROADMAP.md` | Build order and what is done |
| `docs/PWA_NOTES.md` | Install, offline, share target, preview limits, deploy |
| `docs/designs/` | Design references the UI follows |

## Try it on a phone

1. Deploy to GitHub Pages (see `docs/PWA_NOTES.md`).
2. Open the HTTPS URL in Chrome on Android → menu → **Add to Home screen**.
3. Share any link from X or Chrome to **Ideaboard** to put it in the Inbox.

## Privacy

Everything you type stays in your browser's IndexedDB. The only network requests are: loading the app (once), and — only if you switch on *Link previews* in Settings — sending a URL to a public oEmbed service. That switch is off by default.
