# PWA notes

## Install on Android

1. Serve the build over **HTTPS** (GitHub Pages does this). `localhost` also counts as secure for testing.
2. Open the URL in Chrome → the in-app prompt appears, or menu → **Add to Home screen / Install app**.
3. Launch it from the home screen: it opens in `standalone` mode (no URL bar), with the safe-area insets handled by `env(safe-area-inset-*)` padding.

Checklist that makes it installable:

- [x] Web manifest linked from `index.html` (`display: standalone`, `start_url`, `scope`, `theme_color`, `background_color`)
- [x] 192 px and 512 px icons, plus a 512 px `maskable` icon and a 180 px `apple-touch-icon`
- [x] A service worker controlling the start URL (registered automatically)
- [x] HTTPS

To verify: Chrome DevTools → *Application* → *Manifest* (no errors) → *Service Workers* (activated) → *Cache Storage* (app shell precached). On the phone: DevTools remote debugging via USB, or just airplane-mode the device and relaunch — it must still open and show your boards.

## Offline

`vite-plugin-pwa` precaches the app shell (HTML, JS, CSS, icons) and serves it cache-first. IndexedDB is local anyway, so after the first successful load the app is fully functional offline, including creating notes and links. Images are local blobs, so they work offline too.

Updating: `registerType: 'autoUpdate'` — a new deploy is picked up on the next launch; nothing is lost because all state is in IndexedDB, not in the bundle.

## Web Share Target (share a link from X / Chrome)

`manifest.share_target` registers Ideaboard as a share destination for text and links:

```jsonc
"share_target": {
  "action": "/share-target",       // base-prefixed at build time
  "method": "GET",
  "params": { "title": "title", "text": "text", "url": "url" }
}
```

The first URL found in `url` or `text` becomes a link card in the **Inbox**; the text (without the URL) becomes the link's note.

**How to verify on a phone**

1. Install the app from HTTPS (share targets only exist for installed/known PWAs; on Chrome the app must be installed for it to show in the share sheet).
2. Open X (or any app) → *Share* → **Ideaboard**. Or in Chrome: menu → *Share…* → *Ideaboard*.
3. The app opens, shows a "Saved to Inbox" toast, and the link is at the top of **Links → Inbox**.
4. Repeat while offline: it still works (the shell is cached and the navigation is handled by the service worker's `navigateFallback`).

**Limits**

- GET share target only passes URL-encoded text; very long shares are truncated by the OS share sheet. Not an issue for links.
- Navigation fallback must be enabled (`navigateFallback: 'index.html'`) or `/share-target` 404s offline. For GitHub Pages there is also `public/404.html`, which forwards the query string to the app on a first visit (before the service worker exists).
- The share sheet entry only appears once Chrome has seen the manifest; if it is missing, reinstall the app.

## Link previews — what is honest and what is not

- **Default (off):** no network at all. A link card shows domain, your title, your note, tags and an **Open** button.
- **Optional (Settings → Link previews):** when on, the app calls `https://noembed.com/embed?url=…` (a public, CORS-enabled oEmbed proxy). *(Not available: the sandbox has no outbound access, but the code path is real.)* The UI states clearly that the URL leaves the device. Failures fall back silently to the default card.
- **No page scraping.** That requires CORS, and public sites do not allow it.
- **X/Twitter previews usually fail.** X stopped serving oEmbed without auth for most cases, and its pages are not readable cross-origin. Expect the default card for X links — that is why the design leans on *your* title and note.
- **No iframes.** Many sites send `X-Frame-Options: DENY` / CSP `frame-ancestors`, so an embedded preview would be a broken grey box.
- Anything else (fetching the HTML, parsing OG tags) is not possible from a static PWA without a server. The closest honest option is the optional oEmbed call above.

## Deploy to GitHub Pages

`.github/workflows/deploy.yml` runs on every push to `main` (or manually):

```bash
pnpm install --frozen-lockfile
pnpm build          # with VITE_BASE=/<repo>/ so assets and the manifest resolve
# uploads dist/ as the Pages artifact
```

One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then open `https://<user>.github.io/<repo>/` on the phone in Chrome and install it.

Local build with the right base path:

```bash
VITE_BASE=/ideaboard_android/ pnpm build && pnpm preview
```

Notes:

- `404.html` is a copy of the app used by GitHub Pages for unknown paths (deep links, `/share-target`). It forwards `?query` and `#hash` to the app root and then the service worker takes over.
- If you use a custom domain or a user site (`<user>.github.io`), build with the default base `/` instead.
- GitHub Pages always serves HTTPS, which is required for the service worker and installability.
