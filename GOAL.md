# Goal

**Capture small scattered ideas in under 3 seconds on a phone, arrange them on a board, and collect links (mainly X bookmarks) and connect them to ideas.**

## What that means in practice

- Open the app → tap once → type → the note exists. No save button, no modal, no account.
- A board is a calm sheet of paper: sticky notes, dotted-outline regions ("Mon", "Tue"), connectors, a pen, and images.
- Links are first-class items: share a post from X (or Chrome) into Ideaboard, it lands in the **Inbox**, later you give it your own title/note/tags and drag it onto a board next to the ideas it belongs to.
- Everything is local: IndexedDB only, no backend, no accounts, no analytics. Export is one JSON file.

## Non-goals

- No collaboration, sync, or accounts.
- No scraping link previews in the browser (CORS-blocked) and no iframes of sites that refuse embedding.
- No native Android build. This is an installable PWA (no Java, no SDK, no NDK).

## Done looks like

- Works offline after the first load, installable from Chrome on Android, safe-area aware.
- A board can hold ~100 notes and still pan at 60 fps on a low-end phone.
- Export from this app → import into the PC app → same board, same items, same links.
