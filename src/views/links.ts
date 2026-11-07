import { banners, bottomNav } from '../components/chrome';
import { backUpNow } from '../lib/backup';
import type { ID, LinkRecord } from '../lib/model';
import { formatDate, parseBulkLinks, pluralize, relativeTime } from '../lib/parse';
import { fetchPreview } from '../lib/preview';
import { store } from '../lib/store';
import {
  closeSheet,
  confirmSheet,
  el,
  haptic,
  icon,
  iconButton,
  openMenu,
  openSheet,
  toast,
} from '../lib/ui';
import { navigate } from '../router';

type Filter = 'inbox' | 'all' | 'tagged';

export function renderLinksView(initial: { filter: Filter; tag: string | null }): {
  element: HTMLElement;
  cleanup: () => void;
} {
  const screen = el('div', { class: 'screen' });
  const title = el('h1', { text: 'Links' });
  const menuButton = iconButton('more', 'Links menu', () => openLinksMenu());
  const searchButton = iconButton('search', 'Search links', () => searchInput.focus());
  const topbar = el('header', { class: 'topbar' }, [title, searchButton, menuButton]);

  const searchRow = el('div', { class: 'links-search' }, [icon('search')]);
  const searchInput = el('input', {
    class: 'input',
    attrs: {
      type: 'search',
      placeholder: 'Search saved links',
      'aria-label': 'Search saved links',
      enterkeyhint: 'search',
    },
  });
  searchRow.append(searchInput);

  const segmented = el('div', { class: 'segmented', attrs: { role: 'group', 'aria-label': 'Filter links' } });
  const tabs: { id: Filter; label: string }[] = [
    { id: 'inbox', label: 'Inbox' },
    { id: 'all', label: 'All' },
    { id: 'tagged', label: 'Tagged' },
  ];
  const tabButtons = new Map<Filter, HTMLButtonElement>();
  for (const tab of tabs) {
    const button = el('button', { attrs: { type: 'button', 'aria-pressed': 'false' }, text: tab.label });
    button.addEventListener('click', () => {
      filter = tab.id;
      if (tab.id !== 'tagged') tagFilter = null;
      updateTabs();
      renderList();
    });
    tabButtons.set(tab.id, button);
    segmented.append(button);
  }

  const tagChipRow = el('div', { class: 'chip-row', style: { margin: '10px 0 0', display: 'none' } });
  const listWrap = el('div', { style: { marginTop: '12px' } });
  const bannerParts = banners();

  const content = el('div', { class: 'content has-fab' }, [
    searchRow,
    segmented,
    tagChipRow,
    bannerParts.element,
    listWrap,
  ]);

  const fab = el('button', { class: 'fab', attrs: { type: 'button', 'aria-label': 'Add link' } }, [icon('plus')]);
  fab.addEventListener('click', () => openAddLinkSheet());

  screen.append(topbar, content, bottomNav('links'), fab);

  let filter: Filter = initial.filter;
  let tagFilter: string | null = initial.tag;
  let query = '';

  function updateTabs(): void {
    for (const [id, button] of tabButtons) button.setAttribute('aria-pressed', String(id === filter));
    if (tagFilter) {
      const chip = el('span', { class: 'chip' }, [tagFilter]);
      const clear = el('button', { attrs: { type: 'button', 'aria-label': 'Clear tag filter' } }, [icon('close')]);
      clear.addEventListener('click', () => {
        tagFilter = null;
        renderList();
      });
      tagChipRow.replaceChildren(el('span', { class: 'small', text: 'Tag:' }), chip, clear);
      tagChipRow.style.display = 'flex';
    } else {
      tagChipRow.style.display = 'none';
      tagChipRow.replaceChildren();
    }
  }

  function visibleLinks(): LinkRecord[] {
    let links = [...store.links.values()];
    if (filter === 'inbox') links = links.filter((link) => link.boardId === null);
    if (filter === 'tagged') links = links.filter((link) => link.tags.length > 0);
    if (tagFilter) {
      const needle = tagFilter.toLowerCase();
      links = links.filter((link) => link.tags.some((tag) => tag.toLowerCase() === needle));
    }
    if (query) {
      links = links.filter((link) => {
        const haystack = `${link.title} ${link.note} ${link.domain} ${link.tags.join(' ')} ${link.url}`.toLowerCase();
        return haystack.includes(query);
      });
    }
    return links.sort((a, b) => b.savedAt - a.savedAt);
  }

  function linkCard(link: LinkRecord): HTMLElement {
    const card = el('div', {
      class: 'link-item',
      attrs: { role: 'button', tabindex: '0', 'aria-label': `${link.title || link.domain} on ${link.domain}` },
    });
    const chips = el('div', { class: 'chips' });
    for (const tag of link.tags) {
      const chip = el('button', { class: 'chip', attrs: { type: 'button' }, text: tag });
      chip.addEventListener('click', (event) => {
        event.stopPropagation();
        filter = 'tagged';
        tagFilter = tag;
        updateTabs();
        renderList();
      });
      chips.append(chip);
    }

    const top: Node[] = [
      el('span', { class: 'domain' }, [icon('link'), el('span', { text: link.domain })]),
    ];
    if (link.boardId) top.push(el('span', { class: 'chip neutral', text: 'On board' }));
    top.push(el('span', { class: 'date', text: formatDate(link.savedAt) }));

    const parts: Node[] = [
      el('div', { class: 'top' }, top),
      el('h3', { text: link.title || link.domain }),
    ];
    if (link.note) parts.push(el('p', { text: link.note }));
    if (chips.childElementCount) parts.push(chips);
    card.append(...parts);

    const open = () => openLinkSheet(link.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    return card;
  }

  function renderList(): void {
    updateTabs();
    const links = visibleLinks();
    listWrap.replaceChildren();
    if (!links.length) {
      listWrap.append(
        el('div', { class: 'empty-state' }, [
          el('div', { class: 'empty-icon' }, [icon('inbox')]),
          el('h2', { text: emptyTitle() }),
          el('p', { text: emptyBody() }),
        ]),
      );
      return;
    }
    for (const link of links) listWrap.append(linkCard(link));
  }

  function emptyTitle(): string {
    if (query) return 'No matching links';
    if (tagFilter) return `Nothing tagged “${tagFilter}”`;
    return filter === 'inbox' ? 'Inbox is empty' : 'No links yet';
  }

  function emptyBody(): string {
    if (query) return 'Try a different word, domain or tag.';
    if (filter === 'inbox') {
      return 'Share a link to Ideaboard from X or Chrome, or paste a list of URLs with “Bulk add”.';
    }
    return 'Links you save land in the Inbox first.';
  }

  function openLinksMenu(): void {
    openMenu(menuButton, [
      { label: 'Add a link', icon: 'plus', onSelect: () => openAddLinkSheet() },
      { label: 'Bulk add links', icon: 'link', onSelect: () => openBulkAddSheet() },
      'separator',
      { label: 'Back up now', icon: 'download', onSelect: () => void backUpNow() },
      { label: 'Settings', icon: 'settings', onSelect: () => navigate('#/settings') },
    ]);
  }

  /* ------------------------------------------------------------------ detail */

  function openLinkSheet(linkId: ID): void {
    const link = store.links.get(linkId);
    if (!link) return;

    const titleInput = el('input', { class: 'input', attrs: { type: 'text', placeholder: 'Your title' } });
    titleInput.value = link.title;
    const noteInput = el('textarea', { class: 'textarea', attrs: { placeholder: 'Why did you save it?' } });
    noteInput.value = link.note;
    const tagsInput = el('input', { class: 'input', attrs: { type: 'text', placeholder: 'Outdoors, Ideas' } });
    tagsInput.value = link.tags.join(', ');

    const boardSelect = el('select', { class: 'select' });
    boardSelect.append(el('option', { attrs: { value: '' }, text: 'Inbox (not on a board)' }));
    for (const board of [...store.boards.values()].sort((a, b) => b.updatedAt - a.updatedAt)) {
      boardSelect.append(el('option', { attrs: { value: board.id }, text: board.name }));
    }
    boardSelect.value = link.boardId ?? '';

    const previewBox = el('div', { style: { marginBottom: '14px' } });
    if (store.settings.previewEnabled) {
      previewBox.append(el('p', { class: 'small', text: 'Looking for a preview…' }));
      void fetchPreview(link.url).then((preview) => {
        previewBox.replaceChildren();
        if (!preview) {
          previewBox.append(
            el('p', { class: 'small', text: 'No preview available for this link (X posts usually have none).' }),
          );
          return;
        }
        const useTitle = el('button', { class: 'btn quiet block', attrs: { type: 'button' }, text: 'Use this title' });
        useTitle.addEventListener('click', () => {
          titleInput.value = preview.title;
        });
        previewBox.append(
          el('div', { class: 'install-card' }, [
            icon('image'),
            el('div', { class: 'txt' }, [
              el('strong', { text: preview.title.slice(0, 90) }),
              el('span', { text: [preview.provider, preview.author].filter(Boolean).join(' · ') || 'Preview' }),
            ]),
          ]),
          el('p', {
            class: 'small',
            text: 'Preview from a public oEmbed service. Turning this on sends the URL to that third party.',
          }),
          useTitle,
        );
      });
    }

    const save = el('button', { class: 'btn block', attrs: { type: 'button' }, text: 'Save' });
    save.addEventListener('click', () => {
      store.updateLinkFields(link.id, {
        title: titleInput.value,
        note: noteInput.value,
        tags: tagsInput.value.split(','),
      });
      closeSheet();
      renderList();
      toast('Link updated');
    });

    const open = el('button', { class: 'btn quiet block', attrs: { type: 'button' }, text: 'Open link' });
    open.addEventListener('click', () => window.open(link.url, '_blank', 'noopener'));

    const remove = el('button', { class: 'btn danger block', attrs: { type: 'button' }, text: 'Delete link' });
    remove.addEventListener('click', () => {
      void confirmSheet({
        title: 'Delete this link?',
        message: 'It will also disappear from any board it is on.',
        confirmLabel: 'Delete',
        danger: true,
      }).then((confirmed) => {
        if (!confirmed) return;
        store.deleteLink(link.id);
        closeSheet();
        renderList();
        toast('Link deleted');
      });
    });

    boardSelect.addEventListener('change', () => {
      const value = boardSelect.value || null;
      if (value === (link.boardId ?? null)) return;
      applyPlacement(link.id, value);
      renderList();
    });

    openSheet({
      title: 'Link',
      subtitle: link.domain,
      content: el('div', {}, [
        previewBox,
        el('div', { class: 'field' }, [el('label', { text: 'Title' }), titleInput]),
        el('div', { class: 'field' }, [el('label', { text: 'Your note' }), noteInput]),
        el('div', { class: 'field' }, [el('label', { text: 'Tags (comma separated)' }), tagsInput]),
        el('div', { class: 'field' }, [el('label', { text: 'Board' }), boardSelect]),
        el('p', { class: 'small', text: `Saved ${relativeTime(link.savedAt)} · ${link.url}` }),
      ]),
      actions: [save, open, remove],
    });
  }

  /** Move a link between the Inbox and a board (creating/removing its card). */
  function applyPlacement(linkId: ID, boardId: ID | null): void {
    const link = store.links.get(linkId);
    if (!link) return;
    for (const item of [...store.items.values()]) {
      if (item.type === 'link' && item.linkId === linkId) {
        store.deleteItem(item.id);
      }
    }
    if (!boardId) {
      store.updateLinkFields(linkId, { boardId: null });
      toast('Moved to Inbox');
      return;
    }
    const board = store.boards.get(boardId);
    const view = board?.view ?? { x: 0, y: 0, scale: 1 };
    const width = Math.min(window.innerWidth, 560);
    const cx = (width / 2 - view.x) / view.scale;
    const cy = (Math.min(window.innerHeight, 800) * 0.45 - view.y) / view.scale;
    const item = store.placeLinkOnBoard(linkId, boardId, Math.round(cx - 130), Math.round(cy - 74));
    if (item) {
      haptic(8);
      toast(`Placed on ${board?.name ?? 'board'}`, {
        actionLabel: 'Open',
        onAction: () => navigate(`#/board/${boardId}`),
      });
    }
  }

  /* --------------------------------------------------------------- add flows */

  function openAddLinkSheet(): void {
    const urlInput = el('input', {
      class: 'input',
      attrs: { type: 'url', inputmode: 'url', placeholder: 'https://…', autocapitalize: 'off', autocorrect: 'off' },
    });
    const titleInput = el('input', { class: 'input', attrs: { type: 'text', placeholder: 'Optional title' } });
    const noteInput = el('textarea', { class: 'textarea', attrs: { placeholder: 'Optional note' } });

    const add = el('button', { class: 'btn block', attrs: { type: 'button' }, text: 'Save to Inbox' });
    add.addEventListener('click', () => {
      const created = store.createLink({
        url: urlInput.value,
        title: titleInput.value,
        note: noteInput.value,
      });
      if (!created) {
        toast('That does not look like a link');
        urlInput.focus();
        return;
      }
      closeSheet();
      filter = 'inbox';
      tagFilter = null;
      renderList();
      toast('Saved to Inbox');
    });

    openSheet({
      title: 'Add a link',
      content: el('div', {}, [
        el('div', { class: 'field' }, [el('label', { text: 'URL' }), urlInput]),
        el('div', { class: 'field' }, [el('label', { text: 'Title' }), titleInput]),
        el('div', { class: 'field' }, [el('label', { text: 'Note' }), noteInput]),
      ]),
      actions: [add],
      autofocus: urlInput,
    });
  }

  function openBulkAddSheet(): void {
    const textarea = el('textarea', {
      class: 'textarea',
      attrs: { placeholder: 'https://…\nhttps://…\none URL per line', spellcheck: 'false' },
      style: { minHeight: '160px' },
    });
    const counter = el('p', { class: 'small', text: 'Paste as many URLs as you like, one per line.' });
    const add = el('button', { class: 'btn block', attrs: { type: 'button', text: 'Add links' } });

    const parsed = () => parseBulkLinks(textarea.value);
    textarea.addEventListener('input', () => {
      const count = parsed().length;
      counter.textContent = count
        ? `${count} ${pluralize(count, 'link')} ready · one per line`
        : 'Paste as many URLs as you like, one per line.';
    });

    add.addEventListener('click', () => {
      const found = parsed();
      if (!found.length) {
        toast('No links found in that text');
        return;
      }
      const existing = new Set([...store.links.values()].map((link) => link.url.replace(/\/$/, '').toLowerCase()));
      let added = 0;
      for (const entry of found) {
        if (existing.has(entry.url.replace(/\/$/, '').toLowerCase())) continue;
        if (store.createLink({ url: entry.url })) added++;
      }
      closeSheet();
      filter = 'inbox';
      tagFilter = null;
      renderList();
      toast(added ? `Added ${added} ${pluralize(added, 'link')}` : 'Those links are already saved');
    });

    openSheet({
      title: 'Bulk add links',
      subtitle: 'One URL per line. Everything lands in the Inbox.',
      content: el('div', {}, [
        el('div', { class: 'field' }, [textarea]),
        counter,
      ]),
      actions: [add],
      autofocus: textarea,
    });
  }

  searchInput.addEventListener('input', () => {
    query = searchInput.value.trim().toLowerCase();
    renderList();
  });

  const unsubscribe = store.subscribe(renderList);
  renderList();

  return {
    element: screen,
    cleanup: () => {
      unsubscribe();
      bannerParts.cleanup();
    },
  };
}
