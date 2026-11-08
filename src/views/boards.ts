import { boardThumb, banners, bottomNav, installCard } from '../components/chrome';
import type { Board, Item } from '../lib/model';
import { relativeTime } from '../lib/parse';
import { store, uid } from '../lib/store';
import { confirmSheet, el, haptic, icon, iconButton, openMenu, promptSheet, toast } from '../lib/ui';
import { navigate } from '../router';
import { boardIllustration } from './board';

export function renderBoardsView(): { element: HTMLElement; cleanup: () => void } {
  const screen = el('div', { class: 'screen' });
  const title = el('h1', { text: 'Boards' });
  const searchToggle = iconButton('search', 'Search boards', () => toggleSearch());
  const topbar = el('header', { class: 'topbar' }, [title, searchToggle]);

  const searchRow = el('div', { class: 'links-search', style: { display: 'none' } }, [
    icon('search'),
  ]);
  const searchInput = el('input', {
    class: 'input',
    attrs: { type: 'search', placeholder: 'Search boards', 'aria-label': 'Search boards', enterkeyhint: 'search' },
  });
  searchRow.append(searchInput);

  const listWrap = el('div');
  const bannerParts = banners();
  const install = installCard();

  const content = el('div', { class: 'content has-fab' }, [searchRow, bannerParts.element, install.element, listWrap]);
  const fab = el('button', { class: 'fab', attrs: { type: 'button', 'aria-label': 'New board' } }, [icon('plus')]);
  fab.addEventListener('click', () => createBoard());

  screen.append(topbar, content, bottomNav('boards'), fab);

  let query = '';
  let searching = false;

  function toggleSearch(force?: boolean): void {
    searching = force ?? !searching;
    searchRow.style.display = searching ? 'block' : 'none';
    if (searching) {
      searchInput.focus();
    } else {
      searchInput.value = '';
      query = '';
      renderList();
    }
  }

  searchInput.addEventListener('input', () => {
    query = searchInput.value.trim().toLowerCase();
    renderList();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') toggleSearch(false);
  });

  function boardCard(board: Board): HTMLElement {
    const itemCount = [...store.items.values()].filter((item) => item.boardId === board.id).length;
    const card = el('div', {
      class: 'board-card',
      attrs: { role: 'button', tabindex: '0', 'aria-label': `${board.name}, edited ${relativeTime(board.updatedAt)}` },
    });
    const body = el('div', { class: 'board-card-body' }, [
      el('h3', { text: board.name }),
      el('div', { class: 'meta', text: `Edited ${relativeTime(board.updatedAt)}` }),
    ]);
    const menuButton = el('button', {
      class: 'card-menu-btn',
      attrs: { type: 'button', 'aria-label': `Options for ${board.name}` },
    }, [icon('more')]);
    menuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      openBoardMenu(board, menuButton);
    });
    card.append(boardThumb(board.id), body, menuButton);
    if (itemCount === 0) card.classList.add('is-empty');

    const open = () => navigate(`#/board/${board.id}`);
    card.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('.card-menu-btn')) return;
      open();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    return card;
  }

  function renderList(): void {
    listWrap.replaceChildren();
    let boards = [...store.boards.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    if (query) {
      boards = boards.filter(
        (board) =>
          board.name.toLowerCase().includes(query) ||
          [...store.items.values()].some(
            (item) =>
              item.boardId === board.id &&
              item.type === 'note' &&
              item.text.toLowerCase().includes(query),
          ),
      );
    }

    if (!boards.length) {
      if (query) {
        listWrap.append(
          el('div', { class: 'empty-state' }, [
            el('h2', { text: 'No boards found' }),
            el('p', { text: `Nothing matches “${query}”.` }),
          ]),
        );
        return;
      }
      const start = el('button', { class: 'btn block', attrs: { type: 'button' }, text: 'Create your first board' });
      start.addEventListener('click', () => createBoard());
      listWrap.append(
        el('div', { class: 'empty-state' }, [
          boardIllustration(),
          el('h2', { text: 'Your ideas, in one place' }),
          el('p', {
            text: 'Long-press the board to drop a note. Everything stays on this device, and the app keeps working offline.',
          }),
          el('div', { style: { width: '100%', maxWidth: '320px' } }, [start]),
        ]),
      );
      return;
    }

    const grid = el('div', { class: 'boards-grid' });
    for (const board of boards) grid.append(boardCard(board));
    listWrap.append(grid);
  }

  function createBoard(): void {
    const board = store.createBoard('New board');
    haptic(10);
    void store.saveNow();
    navigate(`#/board/${board.id}`);
  }

  function openBoardMenu(board: Board, anchor: HTMLElement): void {
    openMenu(anchor, [
      {
        label: 'Rename',
        icon: 'edit',
        onSelect: () =>
          promptSheet({
            title: 'Board name',
            value: board.name,
            confirmLabel: 'Save',
            onConfirm: (value) => {
              const name = value.trim().slice(0, 80);
              if (!name) return;
              store.updateBoard(board.id, { name });
              renderList();
            },
          }),
      },
      { label: 'Duplicate', icon: 'copy', onSelect: () => duplicateBoard(board) },
      'separator',
      {
        label: 'Delete',
        icon: 'trash',
        danger: true,
        onSelect: () => {
          void confirmSheet({
            title: 'Delete board?',
            message: `“${board.name}” and its notes will be deleted. Any links placed on it go back to the Inbox.`,
            confirmLabel: 'Delete',
            danger: true,
          }).then((confirmed) => {
            if (!confirmed) return;
            store.deleteBoard(board.id);
            void store.saveNow();
            renderList();
            toast('Board deleted');
          });
        },
      },
    ]);
  }

  function duplicateBoard(source: Board): void {
    const copy = store.createBoard(`${source.name} copy`);
    if (source.view) store.saveBoardView(copy.id, { ...source.view });
    const idMap = new Map<string, string>();
    const sourceItems: Item[] = [...store.items.values()].filter((item) => item.boardId === source.id);
    for (const item of sourceItems) {
      const clone = structuredClone(item);
      clone.id = uid();
      clone.boardId = copy.id;
      clone.createdAt = clone.updatedAt = Date.now();
      idMap.set(item.id, clone.id);
      store.addItem(clone);
    }
    for (const connector of [...store.connectors.values()].filter((c) => c.boardId === source.id)) {
      const from = idMap.get(connector.from);
      const to = idMap.get(connector.to);
      if (from && to) store.connect(from, to);
    }
    for (const stroke of [...store.strokes.values()].filter((s) => s.boardId === source.id)) {
      store.addStroke({ ...structuredClone(stroke), id: uid(), boardId: copy.id });
    }
    void store.saveNow();
    renderList();
    toast('Board duplicated');
  }

  const unsubscribe = store.subscribe(renderList);
  renderList();

  return {
    element: screen,
    cleanup: () => {
      unsubscribe();
      bannerParts.cleanup();
      install.cleanup();
    },
  };
}
