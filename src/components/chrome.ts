import { backUpNow } from '../lib/backup';
import { NOTE_DEFAULT_SIZE } from '../lib/model';
import { CHANGES_BEFORE_REMINDER, store } from '../lib/store';
import { el, icon, type IconName } from '../lib/ui';
import { canInstall, onInstallChange, promptInstall } from '../lib/pwa';

export type NavSection = 'boards' | 'links' | 'settings';

function navLink(href: string, iconName: IconName, label: string, active: boolean): HTMLAnchorElement {
  return el(
    'a',
    { attrs: { href, 'aria-current': active ? 'page' : null } },
    [icon(iconName), el('span', { text: label })],
  );
}

export function bottomNav(active: NavSection): HTMLElement {
  return el('nav', { class: 'bottomnav', attrs: { 'aria-label': 'Main' } }, [
    navLink('#/boards', 'boards', 'Boards', active === 'boards'),
    navLink('#/links', 'link', 'Links', active === 'links'),
    navLink('#/settings', 'settings', 'Settings', active === 'settings'),
  ]);
}

/**
 * Storage problems and "time to back up" reminders. Subscribes to the store, so
 * it also works while the user is typing.
 */
export function banners(): { element: HTMLElement; cleanup: () => void } {
  const wrap = el('div');
  const render = () => {
    const next: HTMLElement[] = [];
    if (store.dbError) {
      const retry = el('button', { attrs: { type: 'button' }, text: 'Retry' });
      retry.addEventListener('click', () => void store.saveNow());
      next.push(
        el('div', { class: 'banner warn' }, [el('span', { class: 'grow', text: store.dbError }), retry]),
      );
    }
    if (store.changesSinceBackup >= CHANGES_BEFORE_REMINDER) {
      const button = el('button', { attrs: { type: 'button' }, text: 'Back up' });
      button.addEventListener('click', () => {
        void backUpNow();
      });
      next.push(
        el('div', { class: 'banner' }, [
          el('span', {
            class: 'grow',
            text: `${store.changesSinceBackup} changes since your last backup.`,
          }),
          button,
        ]),
      );
    }
    wrap.replaceChildren(...next);
  };
  const off = store.subscribe(render);
  render();
  return { element: wrap, cleanup: off };
}

export function installCard(): { element: HTMLElement; cleanup: () => void } {
  const wrap = el('div');
  const render = () => {
    if (!canInstall()) {
      wrap.replaceChildren();
      return;
    }
    const button = el('button', { class: 'btn', attrs: { type: 'button' }, text: 'Install' });
    button.addEventListener('click', () => void promptInstall());
    wrap.replaceChildren(
      el('div', { class: 'install-card' }, [
        icon('download'),
        el('div', { class: 'txt' }, [
          el('strong', { text: 'Add Ideaboard to your home screen' }),
          el('span', { text: 'Opens full screen and works offline.' }),
        ]),
        button,
      ]),
    );
  };
  const off = onInstallChange(render);
  render();
  return { element: wrap, cleanup: off };
}

/** A tiny, cheap rendering of a board: coloured blocks at their relative positions. */
export function boardThumb(boardId: string): HTMLElement {
  const thumb = el('div', { class: 'board-thumb' });
  const items = [...store.items.values()].filter((item) => item.boardId === boardId).slice(0, 8);
  if (!items.length) return thumb;

  const minX = Math.min(...items.map((i) => i.x));
  const minY = Math.min(...items.map((i) => i.y));
  const maxX = Math.max(...items.map((i) => i.x + i.w));
  const maxY = Math.max(...items.map((i) => i.y + i.h));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  for (const item of items) {
    if (item.type === 'region') {
      thumb.append(
        el('div', {
          class: 'mini-note',
          style: {
            left: `${((item.x - minX) / width) * 100}%`,
            top: `${((item.y - minY) / height) * 100}%`,
            width: `${(item.w / width) * 100}%`,
            height: `${(item.h / height) * 100}%`,
            background: 'transparent',
            border: '1px dashed var(--region-color)',
            boxShadow: 'none',
          },
        }),
      );
      continue;
    }
    const color =
      item.type === 'note'
        ? `var(--note-${item.color})`
        : item.type === 'image'
          ? 'var(--field)'
          : 'var(--bg-elev)';
    thumb.append(
      el('div', {
        class: 'mini-note',
        style: {
          left: `${((item.x - minX) / width) * 100}%`,
          top: `${((item.y - minY) / height) * 100}%`,
          width: `${(Math.max(item.w, NOTE_DEFAULT_SIZE.w / 2) / width) * 100}%`,
          height: `${(item.h / height) * 100}%`,
          background: color,
          border: item.type === 'link' ? '1px solid var(--line-strong)' : 'none',
        },
      }),
    );
  }
  return thumb;
}
