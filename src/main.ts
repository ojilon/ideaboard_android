import './style.css';
import { extractUrl, textWithoutUrl } from './lib/parse';
import { initInstallPrompt } from './lib/pwa';
import { store } from './lib/store';
import { el, toast } from './lib/ui';
import { onRouteChange, parseRoute, type Route } from './router';
import { renderBoardView } from './views/board';
import { renderBoardsView } from './views/boards';
import { renderLinksView } from './views/links';
import { renderSettingsView } from './views/settings';

const BASE = import.meta.env.BASE_URL;
const appElement = document.getElementById('app');
if (!appElement) throw new Error('#app is missing');
const app: HTMLElement = appElement;

let cleanup: (() => void) | null = null;
let pendingStartNote = false;
let lastTheme: string | null = null;

function applyTheme(): void {
  const theme = store.settings.theme;
  if (theme === lastTheme) return;
  lastTheme = theme;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#1b1d1f' : '#faf9f6');
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', theme === 'dark' ? 'dark' : 'light');
}

function render(): void {
  cleanup?.();
  cleanup = null;

  const route: Route = parseRoute(location.hash);
  let view: { element: HTMLElement; cleanup: () => void };

  switch (route.name) {
    case 'board': {
      const startNote = pendingStartNote;
      pendingStartNote = false;
      view = renderBoardView(route.id, { startNote });
      break;
    }
    case 'links':
      view = renderLinksView({ filter: route.filter, tag: route.tag });
      break;
    case 'settings':
      view = renderSettingsView();
      break;
    default:
      view = renderBoardsView();
  }

  app.replaceChildren(view.element);
  cleanup = view.cleanup;
}

/** A shared URL from X / Chrome arrives as ?url=&text=&title= on /share-target. */
function handleShare(params: URLSearchParams): void {
  const url = extractUrl(params.get('url'), params.get('text'), params.get('title'));
  if (!url) {
    toast('That share contained no link');
    return;
  }
  const rawTitle = (params.get('title') ?? '').replace(/\s+/g, ' ').trim();
  const title = rawTitle && rawTitle.length <= 120 && !/\bon\s+X\b/i.test(rawTitle) ? rawTitle : '';
  const note = textWithoutUrl(params.get('text'));
  const existing = [...store.links.values()].find((link) => link.url === url);
  if (existing) {
    toast('That link is already saved');
    return;
  }
  store.createLink({ url, title, note });
  toast('Saved to Inbox');
}

function openNewNote(): void {
  const boards = [...store.boards.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const board = boards[0] ?? store.createBoard('New board');
  pendingStartNote = true;
  history.replaceState(null, '', `${BASE}#/board/${board.id}`);
}

/** Handles query-based entry points, then cleans the URL so reloads are normal. */
function handleEntryPoints(): void {
  const params = new URLSearchParams(location.search);
  const path = location.pathname.replace(/\/+$/, '');
  const isShare = /\/share-target$/.test(path) || params.has('share-target');
  const action = params.get('action');
  if (!isShare && !action) return;

  if (isShare) {
    handleShare(params);
    history.replaceState(null, '', `${BASE}#/links`);
    return;
  }
  if (action === 'inbox') {
    history.replaceState(null, '', `${BASE}#/links`);
    return;
  }
  if (action === 'new-note') {
    history.replaceState(null, '', `${BASE}#/boards`);
    openNewNote();
    return;
  }
  history.replaceState(null, '', `${BASE}#/boards`);
}

async function boot(): Promise<void> {
  initInstallPrompt();
  app.append(
    el('div', { class: 'screen' }, [
      el('div', { class: 'content', style: { display: 'grid', placeItems: 'center' } }, [
        el('p', { class: 'small', text: 'Opening Ideaboard…' }),
      ]),
    ]),
  );

  await store.init();
  applyTheme();
  store.subscribe(applyTheme);

  if (!location.hash && !location.search) {
    history.replaceState(null, '', `${BASE}#/boards`);
  }
  handleEntryPoints();
  render();
  onRouteChange(render);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void store.saveNow();
  });
  window.addEventListener('pagehide', () => void store.saveNow());

  // Persistence is requestable by user gesture in Settings; ask quietly here too.
  if (navigator.storage) void store.refreshPersistence();
}

void boot().catch((error: unknown) => {
  console.error(error);
  app.replaceChildren(
    el('div', { class: 'screen' }, [
      el('div', { class: 'content' }, [
        el('h1', { text: 'Ideaboard could not start' }),
        el('p', { class: 'small', text: String(error) }),
        el('p', { class: 'small', text: 'Try reloading. Your data is stored by the browser, not by this page.' }),
      ]),
    ]),
  );
});
