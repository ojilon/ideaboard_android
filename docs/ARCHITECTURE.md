# Architecture

## Shape

Single-page app, no framework. `index.html` loads `src/main.ts`, which boots the store and renders a view into `#app`.

```
main.ts          boot: DB, settings, theme, share-target, router
lib/db.ts        IndexedDB wrapper (idb), one store per entity
lib/model.ts     types for the data format
lib/store.ts     in-memory state + debounced autosave + undo/redo
lib/parse.ts     pure helpers (URLs, bulk paste, relative dates)
router.ts        tiny hash router (#/boards, #/board/:id, #/links, #/settings)
views/*.ts       one file per screen; each returns an element
board/gestures.ts  pointer-map → pan / pinch-zoom / drag / long-press
board/render.ts    item DOM + SVG connectors/ink + view transform
components/*.ts  sheet, toast, icons, confirm
```

Views are plain functions that build DOM (`el()` helper) and attach listeners. There is no virtual DOM: a view re-renders only itself, and the board patches elements in place (positions, text) instead of rebuilding, so gestures never fight with rendering.

## Board rendering

```
.board
├── header (title, back, menu)
├── .stage                     ← pointer target, dot grid background
│   ├── .world                 ← CSS transform: translate(px) scale(s)
│   │   └── .item × n          ← notes, regions, images, link cards (DOM)
│   └── svg.overlay            ← screen-fixed SVG
│       ├── g#links            ← connectors, transform mirrors .world
│       └── g#ink              ← freehand strokes, transform mirrors .world
```

Why the SVG is screen-fixed: a scaled SVG root with negative coordinates is fragile across browsers. Instead the stage holds a normal SVG and we set the same `translate/scale` on a `<g>`; stroke widths use `vector-effect="non-scaling-stroke"` so lines stay 2px on screen at any zoom. Dot grid is a CSS `radial-gradient` whose size and position follow the view transform.

Notes/regions/images/links are DOM because they hold selectable text, inputs, and images — cheap to hit-test and good for accessibility. Connectors and pen strokes are one SVG layer because they are just paths and would be pointless as DOM.

## Coordinates

World space is CSS pixels, y down, 1× = 100% zoom. An item's `x/y` is its top-left corner *before* rotation; `rot` is degrees around the item centre. `view = {x, y, scale}` maps world → screen: `screen = world * scale + {x, y}`. New items are placed at the centre of the visible viewport, so they always land where you are looking.

## Gestures (Pointer Events)

`gestures.ts` keeps a `Map<pointerId, {x, y}>`:

- 1 pointer down on empty space → pan; if it does not move for 500 ms → long-press (new note at that point).
- 1 pointer down on an item → drag it; short tap without movement → edit (notes) or open (links); 500 ms without movement → item sheet.
- 2 pointers → pinch: scale around the midpoint and pan by the midpoint delta. An in-progress item drag is cancelled.
- Pen / eraser tools take over the pointer stream entirely.

`touch-action: none` on the stage is what makes this work on Android; every interactive element is ≥ 48px.

## Storage

IndexedDB via `idb`, database `ideaboard`, version 1:

| store | key | index |
| --- | --- | --- |
| `boards` | id | — |
| `items` | id | `boardId` |
| `connectors` | id | `boardId` |
| `strokes` | id | `boardId` |
| `links` | id | `boardId`, `savedAt` |
| `blobs` | id | — (images as `Blob`) |
| `meta` | key | — (settings, change counter, last backup) |

The store keeps every entity in a `Map` in memory. Mutations update the map and mark the entity dirty; a 400 ms debounce writes dirty entities in one transaction. If a write throws, the app keeps the in-memory state, shows a persistent banner, and retries on the next change — in-memory work is never dropped.

Undo/redo is snapshot-based per board (items + connectors + strokes, capped at 40 steps). Boards are small, snapshots are cheap, and one code path covers notes, regions, images, connectors and pen strokes.

## Theme and type

CSS custom properties on `:root`, flipped by `html[data-theme="dark"]`. Light is the default and follows `10-dark-theme-board.png` for dark. UI text uses the system sans stack; notes use a handwriting stack (`cursive`, plus whatever the phone has). No remote fonts — nothing is fetched for typography.
