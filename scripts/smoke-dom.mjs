/**
 * DOM smoke test — runs the built app in happy-dom + fake-indexeddb and drives
 * the real UI (pointer events, IndexedDB, routing, share target).
 *
 *   pnpm build
 *   npm i --no-save happy-dom fake-indexeddb
 *   node scripts/smoke-dom.mjs
 *
 * It is not part of `pnpm test` because those two packages are dev-only and
 * deliberately not dependencies of the app.
 */
import { Window } from 'happy-dom';
import * as fidb from 'fake-indexeddb';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist/assets`;
const bundleName = readdirSync(dist).find((name) => name.startsWith('index-') && name.endsWith('.js'));
if (!bundleName) throw new Error('No bundle found. Run `pnpm build` first.');
const bundle = `${dist}/${bundleName}`;

const errors = [];
process.on('unhandledRejection', (error) => errors.push(error));

function installGlobals(window) {
  const names = [
    'window', 'document', 'location', 'history', 'screen', 'localStorage', 'sessionStorage',
    'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLSelectElement',
    'HTMLAnchorElement', 'HTMLImageElement', 'HTMLCanvasElement', 'HTMLDivElement', 'HTMLTemplateElement',
    'Element', 'Node', 'DocumentFragment', 'Text', 'SVGElement', 'SVGSVGElement', 'SVGPathElement',
    'Event', 'CustomEvent', 'KeyboardEvent', 'PointerEvent', 'MouseEvent', 'WheelEvent', 'HashChangeEvent',
    'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver',
    'FileReader', 'File', 'Blob', 'DOMException', 'matchMedia', 'DOMParser', 'Document',
  ];
  for (const name of names) {
    try {
      if (window[name] !== undefined) globalThis[name] = window[name];
    } catch {
      /* read-only global (navigator) — the app only feature-detects it */
    }
  }
  globalThis.indexedDB = fidb.indexedDB;
  globalThis.IDBKeyRange = fidb.IDBKeyRange;
  for (const name of ['IDBRequest', 'IDBOpenDBRequest', 'IDBTransaction', 'IDBDatabase', 'IDBIndex', 'IDBObjectStore', 'IDBCursor']) {
    if (fidb[name]) globalThis[name] = fidb[name];
  }
  window.indexedDB = fidb.indexedDB;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.visualViewport = undefined;
  if (!globalThis.HashChangeEvent) {
    globalThis.HashChangeEvent = class HashChangeEvent extends window.Event {};
  }
}

function makeWindow(url) {
  const window = new Window({ url, width: 412, height: 915 });
  installGlobals(window);
  const app = window.document.createElement('div');
  app.id = 'app';
  window.document.body.append(app);
  window.addEventListener('error', (event) => errors.push(event));
  return window;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function click(node, options = {}) {
  if (!node) throw new Error('click() on a missing element');
  node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, ...options }));
}

function pointer(node, type, { id = 1, x = 0, y = 0, pointerType = 'touch' } = {}) {
  const Ctor = window.PointerEvent ?? window.MouseEvent;
  node.dispatchEvent(
    new Ctor(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: id,
      pointerType,
      isPrimary: true,
      button: 0,
    }),
  );
}

function tap(node, x = 10, y = 10) {
  pointer(node, 'pointerdown', { x, y });
  pointer(node, 'pointerup', { x, y });
}

function text(selector) {
  return (document.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/* ---------------------------------------------------------------- phase 1: boards */

let window = makeWindow('https://example.com/ideaboard/');
await import(bundle);
await sleep(400);

console.log('--- boot ---');
console.log('text:', text('#app').slice(0, 90));
assert.ok(document.querySelector('.bottomnav'), 'bottom nav rendered');
assert.ok(text('#app').includes('Your ideas, in one place'), 'boards empty state');

click(document.querySelector('.fab'));
await sleep(300);
assert.match(window.location.hash, /#\/board\//, 'navigated into a board');
assert.ok(document.querySelector('.toolbar'), 'board toolbar');
assert.ok(text('.board-empty').includes('Long-press'), 'empty board hint');
console.log('ok: create board');

const stage = document.querySelector('.stage');
pointer(stage, 'pointerdown', { x: 200, y: 300 });
await sleep(650);
pointer(stage, 'pointerup', { x: 200, y: 300 });
await sleep(150);
const textarea = document.querySelector('.item.note textarea');
assert.ok(textarea, 'long-press created a note and started editing');
textarea.value = 'Start small';
textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
click(document.querySelector('.colorbar .swatch-btn[aria-label="pink note"]'));
assert.ok(document.querySelector('.item.note').classList.contains('note-pink'), 'note colour applied');
click(document.querySelector('.colorbar .btn'));
await sleep(400);
assert.ok(text('.item.note').includes('Start small'), 'note text committed');
console.log('ok: note (long-press, typing, colour)');

const tools = [...document.querySelectorAll('.toolbar .tool')];
click(tools[2]);
await sleep(200);
assert.ok(document.querySelector('.item.region'), 'region created');
click(document.querySelector('.sheet-actions .btn'));
await sleep(150);
console.log('ok: region');

click(tools[0]);
await sleep(100);
pointer(stage, 'pointerdown', { x: 120, y: 500 });
pointer(stage, 'pointermove', { x: 160, y: 540 });
pointer(stage, 'pointermove', { x: 220, y: 560 });
pointer(stage, 'pointerup', { x: 220, y: 560 });
await sleep(300);
assert.ok(document.querySelectorAll('.ink-path').length >= 1, 'pen stroke rendered');
click(document.querySelector('.contextbar .icon-btn[aria-label="Undo"]'));
await sleep(200);
assert.equal(document.querySelectorAll('.ink-path').length, 0, 'undo removed the stroke');
console.log('ok: pen + undo');

click(tools[4]);
await sleep(80);
tap(document.querySelector('.item.note'));
await sleep(80);
tap(document.querySelector('.item.region'));
await sleep(200);
assert.ok(document.querySelector('.connector-path'), 'connector drawn');
console.log('ok: connector');

const beforePan = document.querySelector('.world').style.transform;
pointer(stage, 'pointerdown', { x: 300, y: 400 });
pointer(stage, 'pointermove', { x: 340, y: 380 });
pointer(stage, 'pointerup', { x: 340, y: 380 });
await sleep(100);
assert.notEqual(document.querySelector('.world').style.transform, beforePan, 'pan moves the world');

pointer(stage, 'pointerdown', { id: 1, x: 200, y: 400 });
pointer(stage, 'pointerdown', { id: 2, x: 260, y: 400 });
pointer(stage, 'pointermove', { id: 2, x: 320, y: 400 });
await sleep(50);
const zoomed = document.querySelector('.world').style.transform;
pointer(stage, 'pointerup', { id: 2, x: 320, y: 400 });
pointer(stage, 'pointerup', { id: 1, x: 200, y: 400 });
await sleep(100);
const scale = Number(zoomed.match(/scale\(([\d.]+)\)/)?.[1] ?? 0);
assert.ok(scale > 1.2, `pinch zoomed in (scale ${scale})`);
console.log('ok: pan + pinch zoom');

/* ----------------------------------------------------------------- phase 2: links */

window.location.hash = '#/links';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await sleep(250);
assert.ok(text('#app').includes('Inbox'), 'links view');
click(document.querySelector('.fab'));
await sleep(150);
const urlInput = document.querySelector('.sheet input[type="url"]');
urlInput.value = 'https://x.com/maya/status/123';
click(document.querySelector('.sheet-actions .btn'));
await sleep(250);
assert.ok(text('.link-item').includes('x.com'), 'link card in inbox');

click(document.querySelector('.link-item'));
await sleep(150);
const boardSelect = document.querySelector('.sheet select');
assert.ok(boardSelect.options.length >= 2, 'board select offers the board');
boardSelect.value = boardSelect.options[1].value;
boardSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
await sleep(200);
click(document.querySelector('.sheet-actions .btn'));
await sleep(150);
console.log('ok: link added + placed on a board');

click(document.querySelector('.icon-btn[aria-label="Links menu"]'));
await sleep(100);
click([...document.querySelectorAll('.menu button')].find((b) => b.textContent.includes('Bulk add')));
await sleep(120);
const bulkArea = document.querySelector('.sheet textarea');
bulkArea.value = 'https://a.example.com/one\nhttps://b.example.com/two\nnonsense\nhttps://a.example.com/one';
bulkArea.dispatchEvent(new window.Event('input', { bubbles: true }));
click(document.querySelector('.sheet-actions .btn'));
await sleep(200);
assert.equal(document.querySelectorAll('.link-item').length, 2, 'bulk add two unique links');
console.log('ok: bulk add');

/* --------------------------------------------------------------- phase 3: settings */

window.location.hash = '#/settings';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await sleep(250);
assert.ok(text('#app').includes('Theme'), 'settings view');
click([...document.querySelectorAll('.segmented button')].find((b) => b.textContent.includes('Dark')));
await sleep(50);
assert.equal(document.documentElement.dataset.theme, 'dark', 'dark theme applied');
console.log('ok: settings + theme');

window.location.hash = '#/boards';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await sleep(250);
const boardCard = document.querySelector('.board-card');
assert.ok(boardCard.querySelector('.mini-note'), 'board thumbnail shows items');
click(boardCard);
await sleep(300);
assert.ok(document.querySelectorAll('.item').length >= 3, 'items still there after navigation');

await sleep(900);
const db = await new Promise((resolve, reject) => {
  const request = fidb.indexedDB.open('ideaboard');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const count = (name) =>
  new Promise((resolve) => {
    const request = db.transaction(name).objectStore(name).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(-1);
  });
const counts = {};
for (const name of ['boards', 'items', 'connectors', 'strokes', 'links']) counts[name] = await count(name);
console.log('stored:', JSON.stringify(counts));
assert.ok(counts.boards >= 1 && counts.items >= 3 && counts.connectors >= 1 && counts.links >= 3, 'saved to IndexedDB');
console.log('ok: IndexedDB persistence');

/* ----------------------------------------------------------- phase 4: share target */

// A fresh window: same fake IndexedDB, so the inbox already has the links above.
const knownLinks = (await count('links'));
window = makeWindow(
  'https://example.com/share-target?url=https%3A%2F%2Fx.com%2Fmaya%2Fstatus%2F44%3Fs%3D20&text=Maya%20on%20X%3A%20%22start%20small%22%20https%3A%2F%2Ft.co%2Fabc&title=Maya%20on%20X',
);
await import(`${bundle}?share-target`);
await sleep(700);
assert.equal(window.location.hash, '#/links', 'share lands on the links view');
const sharedCards = document.querySelectorAll('.link-item');
assert.ok(sharedCards.length >= 1, 'shared link appears in the inbox');
assert.ok(sharedCards[0].textContent.includes('x.com'), 'shared domain shown');
assert.equal(await count('links'), knownLinks + 1, 'exactly one link was added');
assert.ok(!window.location.search.includes('url='), 'query string cleaned up');
console.log('ok: web share target');
console.log('card:', sharedCards[0].textContent.replace(/\s+/g, ' ').trim());

console.log('\nerrors captured:', errors.length ? errors.map(String).join('\n') : 'none');
assert.equal(errors.length, 0, 'no runtime errors');
console.log('\nSMOKE TEST PASSED');
