# Data format (v1)

One JSON file holds everything. It is plain, versioned, deterministic JSON, so a board exported here can be imported by the PC app and vice versa.

```jsonc
{
  "format": "ideaboard",
  "version": 1,
  "exportedAt": "2026-11-07T12:00:00.000Z",
  "app": "Ideaboard (Android)",
  "boards": [ /* Board */ ],
  "items": [ /* Item */ ],
  "connectors": [ /* Connector */ ],
  "strokes": [ /* Stroke */ ],
  "links": [ /* Link */ ],
  "blobs": [ /* Blob */ ],
  "settings": { /* Settings, optional on import */ }
}
```

## Conventions

- **Ids** are opaque strings (we use `crypto.randomUUID()`); they are unique across the whole file, not per board.
- **Timestamps** are integer epoch milliseconds (UTC).
- **Coordinates** are world pixels, y down. `x`/`y` is the top-left corner of an item *before* rotation; `rot` is degrees clockwise around the item centre. 1 world px = 1 CSS px at 100% zoom.
- **Colours** are names, not hex, so both apps can theme them: `yellow | pink | blue | green | purple`.
- **BOARD** — a board references its children by `boardId`, not by nesting, so items can be moved between boards by changing one field.

## Board

```jsonc
{
  "id": "b1",
  "name": "This week",
  "createdAt": 1730970000000,
  "updatedAt": 1730970000000,
  "view": { "x": 40, "y": 60, "scale": 1 }   // optional, camera restore
}
```

## Item

```jsonc
{
  "id": "i1",
  "boardId": "b1",
  "type": "note",            // note | region | image | link
  "x": 120, "y": 80, "w": 220, "h": 220,
  "rot": -2.4,               // optional, default 0
  "z": 3,                    // optional paint order, default 0
  "createdAt": 1730970000000,
  "updatedAt": 1730970000000,

  // type: "note"
  "text": "Start small",
  "color": "yellow",

  // type: "region"
  "label": "Mon",

  // type: "image"
  "blobId": "bl1",           // -> blobs[].id
  "mime": "image/webp",
  "naturalW": 1200, "naturalH": 800,

  // type: "link"
  "linkId": "l1"             // -> links[].id (title/note live on the link)
}
```

Only the fields for the item's `type` are meaningful; importers must ignore the others.

## Connector

A straight dotted line with an arrowhead, drawn between the borders of two items. It follows them when they move because only the endpoints' ids are stored.

```jsonc
{ "id": "c1", "boardId": "b1", "from": "i1", "to": "i2" }
```

## Stroke

Freehand pen ink. Points are flattened `[x0, y0, x1, y1, …]` in world coordinates.

```jsonc
{ "id": "s1", "boardId": "b1", "color": "#1B2A3D", "width": 2.5, "points": [10, 20, 14, 26] }
```

## Link

The links library lives at board level too: `boardId` is `null` while the link sits in the **Inbox**.

```jsonc
{
  "id": "l1",
  "url": "https://x.com/someone/status/123",
  "domain": "x.com",
  "title": "A guide to slow walks",   // your title, may be ""
  "note": "Good route ideas for Sunday",
  "tags": ["Outdoors", "Ideas"],
  "savedAt": 1730970000000,
  "updatedAt": 1730970000000,
  "boardId": null
}
```

## Blob

Images are exported inline so the file is self-contained. `dataBase64` is the raw file bytes, base64-encoded, without a data-URL prefix.

```jsonc
{ "id": "bl1", "mime": "image/webp", "dataBase64": "UklGR..." }
```

## Settings

```jsonc
{
  "theme": "light",            // light | dark
  "noteFont": "hand",          // hand | sans
  "bgDim": 0.82,               // 0..1 opacity of the board dot grid over a background image
  "bgBlobId": null,            // -> blobs[].id (board background image)
  "previewEnabled": false,     // sends URLs to a third-party oEmbed service when on
  "lastBackupAt": null         // epoch ms
}
```

## Compatibility rules

1. A reader checks `format === "ideaboard"`. If not, refuse with a clear message.
2. `version` is an integer. A reader that supports `N` must refuse `> N` (tell the user to update) and must accept `< N` by migrating forward.
3. Unknown extra fields are **preserved** where practical and never treated as errors.
4. Missing optional fields fall back to the defaults above (`rot: 0`, `z: 0`, `tags: []`, `note: ""`, `color: "yellow"`).
5. Import replaces the local library in this app (it is a whole-file format). The PC app may offer merge; if it does, it must re-key any id that collides.

## Why not images-as-URLs, or a zip

A single JSON file is the lowest common denominator both apps can read without extra libraries. Images inline as base64 make the file 33% bigger but keep export to one tap and one file; images are already downscaled to ≤1400 px on import, so a board with 20 photos is a few MB.
