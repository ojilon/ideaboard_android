import { prepareImage } from '../lib/image';
import {
  NOTE_COLORS,
  REGION_COLORS,
  type ID,
  type Item,
  type LinkRecord,
  type NoteColor,
  type NoteItem,
  type RegionColor,
  type RegionItem,
  type View,
} from '../lib/model';
import { clamp } from '../lib/parse';
import { store, uid } from '../lib/store';
import { navigate } from '../router';
import {
  closeSheet,
  confirmSheet,
  el,
  haptic,
  icon,
  iconButton,
  openMenu,
  openSheet,
  promptSheet,
  toast,
} from '../lib/ui';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_SCALE = 0.22;
const MAX_SCALE = 4;
const LONG_PRESS_MS = 500;
const TAP_SLOP = 8;

type Tool = 'select' | 'pen' | 'eraser' | 'connect';

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; viewX: number; viewY: number }
  | {
      kind: 'drag';
      id: ID;
      startItemX: number;
      startItemY: number;
      startX: number;
      startY: number;
      snapped: boolean;
    }
  | {
      kind: 'resize';
      id: ID;
      startW: number;
      startH: number;
      startX: number;
      startY: number;
      snapped: boolean;
    }
  | {
      kind: 'pinch';
      baseScale: number;
      baseDist: number;
      worldMidX: number;
      worldMidY: number;
    }
  | { kind: 'pen'; points: number[]; path: SVGPathElement; snapped: boolean }
  | { kind: 'erase'; erased: boolean };

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function pointsToPath(points: number[]): string {
  if (points.length < 2) return '';
  let d = `M${points[0].toFixed(1)} ${points[1].toFixed(1)}`;
  for (let i = 2; i < points.length; i += 2) {
    d += ` L${points[i].toFixed(1)} ${points[i + 1].toFixed(1)}`;
  }
  return d;
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function centerOf(item: Item): { x: number; y: number } {
  return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
}

function edgePoint(item: Item, towardX: number, towardY: number): { x: number; y: number } {
  const c = centerOf(item);
  const dx = towardX - c.x;
  const dy = towardY - c.y;
  if (!dx && !dy) return c;
  const hw = item.w / 2;
  const hh = item.h / 2;
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const ty = dy === 0 ? Infinity : hh / Math.abs(dy);
  const t = Math.min(tx, ty);
  const pad = 3;
  return {
    x: c.x + dx * t + (dx > 0 ? pad : dx < 0 ? -pad : 0),
    y: c.y + dy * t + (dy > 0 ? pad : dy < 0 ? -pad : 0),
  };
}

export function boardIllustration(): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 200 160', 'aria-hidden': 'true' });
  const style = getComputedStyle(document.documentElement);
  const yellow = style.getPropertyValue('--note-yellow').trim() || '#faefbd';
  const pink = style.getPropertyValue('--note-pink').trim() || '#fad9e0';
  const ink = style.getPropertyValue('--ink-soft').trim() || '#66707f';
  const accent = style.getPropertyValue('--accent').trim() || '#7ba487';

  const g1 = svgEl('g', { transform: 'rotate(-8 92 52)' });
  g1.append(svgEl('rect', { x: 57, y: 17, width: 70, height: 70, rx: 5, fill: yellow }));
  const g2 = svgEl('g', { transform: 'rotate(6 130 101)' });
  g2.append(svgEl('rect', { x: 95, y: 66, width: 70, height: 70, rx: 5, fill: pink }));
  const arrow = svgEl('path', {
    d: 'M120 30 q 42 2 42 44',
    fill: 'none',
    stroke: ink,
    'stroke-width': 2,
    'stroke-dasharray': '4 5',
    'stroke-linecap': 'round',
  });
  const head = svgEl('path', { d: 'm152 63 10 12 -13 3', fill: 'none', stroke: ink, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const sparks = svgEl('g', { stroke: accent, 'stroke-width': 2.4, 'stroke-linecap': 'round' });
  for (const d of ['M44 24 l-8 -10', 'M36 36 l-11 -4', 'M47 12 l-4 -8']) {
    sparks.append(svgEl('path', { d, fill: 'none' }));
  }
  svg.append(g1, g2, arrow, head, sparks);
  return svg;
}

export function renderBoardView(
  boardId: ID,
  options: { startNote?: boolean } = {},
): { element: HTMLElement; cleanup: () => void } {
  const board = store.boards.get(boardId);
  if (!board) {
    navigate('#/boards');
    return { element: el('div'), cleanup: () => undefined };
  }

  /* ---------------------------------------------------------------- layout */

  const screen = el('div', { class: 'screen board-screen' });
  const title = el('h1', { text: board.name });
  const topbar = el('header', { class: 'topbar' }, [
    iconButton('back', 'Back to boards', () => navigate('#/boards')),
    title,
    iconButton('more', 'Board menu', () => openBoardMenu()),
  ]);

  const stage = el('div', { class: 'stage' });
  const bgLayer = el('div', { class: 'stage-bg' });
  const dotsLayer = el('div', { class: 'stage-dots' });
  const world = el('div', { class: 'world' });
  const overlay = svgEl('svg', { class: 'overlay', 'aria-hidden': 'true' });
  const gConnectors = svgEl('g');
  const gInk = svgEl('g');
  overlay.append(gConnectors, gInk);

  const emptyHint = el('div', { class: 'board-empty' }, [
    boardIllustration(),
    el('p', { text: 'Long-press to add a note' }),
  ]);

  const contextbar = el('div', { class: 'contextbar', style: { display: 'none' } });
  const toolbar = el('div', { class: 'toolbar', attrs: { role: 'toolbar', 'aria-label': 'Board tools' } });
  stage.append(bgLayer, dotsLayer, world, overlay, emptyHint, contextbar, toolbar);
  screen.append(topbar, stage);

  /* ------------------------------------------------------------ view state */

  let view: View = board.view ? { ...board.view } : { x: 40, y: 60, scale: 1 };
  let tool: Tool = 'select';
  let selectedId: ID | null = null;
  let editingId: ID | null = null;
  let connectFrom: ID | null = null;
  let colorBar: HTMLElement | null = null;
  const itemEls = new Map<ID, HTMLElement>();
  const blobUrls = new Map<ID, string>();

  const itemsOfBoard = (): Item[] =>
    [...store.items.values()]
      .filter((item) => item.boardId === boardId)
      .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  function stageRect(): DOMRect {
    return stage.getBoundingClientRect();
  }

  function toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = stageRect();
    return {
      x: (clientX - rect.left - view.x) / view.scale,
      y: (clientY - rect.top - view.y) / view.scale,
    };
  }

  function viewportCenter(): { x: number; y: number } {
    const rect = stageRect();
    return {
      x: (rect.width / 2 - view.x) / view.scale,
      y: (rect.height / 2 - view.y) / view.scale,
    };
  }

  function applyView(): void {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    gConnectors.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.scale})`);
    gInk.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.scale})`);
    const size = 26 * view.scale;
    dotsLayer.style.backgroundSize = `${size}px ${size}px`;
    dotsLayer.style.backgroundPosition = `${view.x}px ${view.y}px`;
    dotsLayer.style.opacity = view.scale < 0.45 ? '0.55' : '1';
  }

  function zoomAt(clientX: number, clientY: number, nextScale: number): void {
    const rect = stageRect();
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const wx = (sx - view.x) / view.scale;
    const wy = (sy - view.y) / view.scale;
    view.scale = scale;
    view.x = sx - wx * scale;
    view.y = sy - wy * scale;
    applyView();
  }

  function updateBackground(): void {
    const blobId = store.settings.bgBlobId;
    if (!blobId) {
      bgLayer.style.backgroundImage = '';
      bgLayer.style.opacity = '0';
      return;
    }
    let url = blobUrls.get(blobId);
    if (!url) {
      const created = store.getBlobUrl(blobId);
      if (!created) return;
      url = created;
      blobUrls.set(blobId, url);
    }
    bgLayer.style.backgroundImage = `url("${url}")`;
    bgLayer.style.opacity = String(clamp(store.settings.bgDim, 0, 1));
  }

  /* -------------------------------------------------------------- rendering */

  function applyItemTransform(node: HTMLElement, item: Item): void {
    node.style.width = `${item.w}px`;
    node.style.height = `${item.h}px`;
    node.style.transform = `translate(${item.x}px, ${item.y}px) rotate(${item.rot ?? 0}deg)`;
    node.style.zIndex = String(item.z ?? 0);
  }

  function addHandle(node: HTMLElement): void {
    node.append(el('span', { class: 'handle', attrs: { 'aria-hidden': 'true' } }));
  }

  function linkFor(item: Item): LinkRecord | null {
    if (item.type !== 'link') return null;
    return store.links.get(item.linkId) ?? null;
  }

  function buildNote(item: NoteItem): HTMLElement {
    const node = el('div', {
      class: `item note note-${item.color}${store.settings.noteFont === 'sans' ? ' font-sans' : ''}`,
      attrs: { 'data-id': item.id, 'data-type': 'note' },
    });
    const text = el('div', { class: 'note-text', text: item.text });
    node.append(text);
    addHandle(node);
    return node;
  }

  function buildRegion(item: RegionItem): HTMLElement {
    const node = el('div', {
      class: `item region region-${item.color}`,
      attrs: { 'data-id': item.id, 'data-type': 'region' },
    });
    const label = el('div', {
      class: 'region-label',
      text: item.label,
      attrs: { contenteditable: 'true', spellcheck: 'false', 'data-region-label': item.id },
    });
    label.addEventListener('blur', () => {
      const value = (label.textContent ?? '').trim().slice(0, 40);
      store.updateItem(item.id, { label: value || 'Region' } as Partial<Item>);
      if (!value) label.textContent = 'Region';
    });
    label.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        label.blur();
      }
    });
    node.append(label);
    addHandle(node);
    return node;
  }

  function buildImage(item: Item & { type: 'image' }): HTMLElement {
    const node = el('div', {
      class: 'item image',
      attrs: { 'data-id': item.id, 'data-type': 'image' },
    });
    let url = blobUrls.get(item.blobId);
    if (!url) {
      const created = store.getBlobUrl(item.blobId);
      if (created) {
        url = created;
        blobUrls.set(item.blobId, url);
      }
    }
    if (url) {
      node.append(el('img', { attrs: { src: url, alt: '', draggable: 'false' } }));
    } else {
      node.append(el('div', { class: 'small', style: { padding: '10px' }, text: 'Image missing' }));
    }
    addHandle(node);
    return node;
  }

  function buildLinkCard(item: Item & { type: 'link' }): HTMLElement {
    const node = el('div', {
      class: 'item linkcard',
      attrs: { 'data-id': item.id, 'data-type': 'link' },
    });
    const link = linkFor(item);
    if (!link) {
      node.append(el('div', { class: 'lc-title', text: 'Link removed' }));
      addHandle(node);
      return node;
    }
    const parts: Node[] = [
      el('div', { class: 'lc-domain' }, [icon('link'), el('span', { text: link.domain })]),
      el('div', { class: 'lc-title', text: link.title || link.domain }),
    ];
    if (link.note) parts.push(el('div', { class: 'lc-note', text: link.note }));
    parts.push(
      el('a', { class: 'lc-open', attrs: { href: link.url, target: '_blank', rel: 'noopener noreferrer' } }, [
        'Open',
        icon('external'),
      ]),
    );
    node.append(...parts);
    addHandle(node);
    return node;
  }

  function buildItem(item: Item): HTMLElement {
    let node: HTMLElement;
    switch (item.type) {
      case 'note':
        node = buildNote(item);
        break;
      case 'region':
        node = buildRegion(item);
        break;
      case 'image':
        node = buildImage(item);
        break;
      case 'link':
        node = buildLinkCard(item);
        break;
    }
    applyItemTransform(node, item);
    if (item.id === selectedId) node.classList.add('selected');
    if (item.id === connectFrom) node.classList.add('connecting');
    return node;
  }

  function rebuildItems(): void {
    itemEls.clear();
    const next = document.createDocumentFragment();
    for (const item of itemsOfBoard()) {
      const node = buildItem(item);
      itemEls.set(item.id, node);
      next.append(node);
    }
    world.replaceChildren(next);
    emptyHint.style.display = itemsOfBoard().length ? 'none' : 'flex';
  }

  function rebuildItem(id: ID): void {
    const item = store.items.get(id);
    const existing = itemEls.get(id);
    if (!item) {
      existing?.remove();
      itemEls.delete(id);
      return;
    }
    const node = buildItem(item);
    if (existing) existing.replaceWith(node);
    else world.append(node);
    itemEls.set(id, node);
  }

  function renderConnectors(): void {
    gConnectors.replaceChildren();
    const style = getComputedStyle(document.documentElement);
    const color = style.getPropertyValue('--region-blue').trim() || '#7d9fd1';
    for (const connector of store.connectors.values()) {
      if (connector.boardId !== boardId) continue;
      const from = store.items.get(connector.from);
      const to = store.items.get(connector.to);
      if (!from || !to) continue;
      const a = edgePoint(from, centerOf(to).x, centerOf(to).y);
      const b = edgePoint(to, centerOf(from).x, centerOf(from).y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const bend = Math.min(80, length * 0.18);
      const controlX = midX + (-dy / length) * bend;
      const controlY = midY + (dx / length) * bend;
      const path = svgEl('path', {
        class: 'connector-path',
        d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${controlX.toFixed(1)} ${controlY.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
        style: `--connector-color:${color}`,
      });
      const angle = Math.atan2(b.y - controlY, b.x - controlX);
      const size = 9 / view.scale;
      const head = svgEl('path', {
        class: 'connector-head',
        style: `--connector-color:${color}`,
        d: [
          `M${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
          `L${(b.x - Math.cos(angle - 0.5) * size).toFixed(1)} ${(b.y - Math.sin(angle - 0.5) * size).toFixed(1)}`,
          `L${(b.x - Math.cos(angle + 0.5) * size).toFixed(1)} ${(b.y - Math.sin(angle + 0.5) * size).toFixed(1)}`,
          'Z',
        ].join(' '),
      });
      gConnectors.append(path, head);
    }
  }

  function renderInk(): void {
    gInk.replaceChildren();
    for (const stroke of store.strokes.values()) {
      if (stroke.boardId !== boardId) continue;
      gInk.append(
        svgEl('path', {
          class: 'ink-path',
          d: pointsToPath(stroke.points),
          style: `stroke:${stroke.color};stroke-width:${stroke.width}`,
        }),
      );
    }
  }

  /* --------------------------------------------------------------- toolbar  */

  function setTool(next: Tool): void {
    tool = next;
    connectFrom = null;
    stage.classList.toggle('pen', tool === 'pen');
    stage.classList.toggle('eraser', tool === 'eraser');
    for (const button of toolbar.querySelectorAll<HTMLElement>('[data-tool]')) {
      const name = button.dataset.tool;
      const active = name === 'pen' ? tool === 'pen' || tool === 'eraser' : name === 'connect' ? tool === 'connect' : false;
      button.setAttribute('aria-pressed', String(active));
    }
    rebuildItems();
    updateContextBar();
  }

  const tools: { id: string; icon: Parameters<typeof icon>[0]; label: string; onClick: () => void }[] = [
    { id: 'pen', icon: 'pen', label: 'Pen', onClick: () => setTool(tool === 'pen' || tool === 'eraser' ? 'select' : 'pen') },
    { id: 'note', icon: 'note', label: 'Add note', onClick: () => addNoteAtCenter() },
    { id: 'region', icon: 'region', label: 'Add region', onClick: () => addRegionAtCenter() },
    { id: 'image', icon: 'image', label: 'Add image', onClick: () => openImageSheet() },
    { id: 'connect', icon: 'connect', label: 'Connect items', onClick: () => setTool(tool === 'connect' ? 'select' : 'connect') },
  ];

  for (const definition of tools) {
    const button = el('button', {
      class: 'tool',
      attrs: { type: 'button', 'data-tool': definition.id, 'aria-label': definition.label, title: definition.label, 'aria-pressed': 'false' },
    }, [icon(definition.icon)]);
    button.addEventListener('click', definition.onClick);
    toolbar.append(button);
  }

  function updateContextBar(): void {
    contextbar.replaceChildren();
    if (editingId) {
      contextbar.style.display = 'none';
      return;
    }
    const entries: HTMLElement[] = [];

    if (tool === 'pen' || tool === 'eraser') {
      entries.push(
        iconButton('pen', 'Pen', () => setTool('pen'), 'icon-btn'),
        iconButton('eraser', 'Eraser', () => setTool('eraser'), 'icon-btn'),
        el('span', { class: 'sep' }),
        iconButton('undo', 'Undo', () => undoBoard(), 'icon-btn'),
        iconButton('redo', 'Redo', () => redoBoard(), 'icon-btn'),
        el('span', { class: 'sep' }),
        iconButton('trash', 'Erase all ink', () => clearInk(), 'icon-btn'),
      );
      for (const [index, node] of entries.entries()) {
        if (index === 0) node.setAttribute('aria-pressed', String(tool === 'pen'));
        if (index === 1) node.setAttribute('aria-pressed', String(tool === 'eraser'));
      }
    } else if (tool === 'connect') {
      entries.push(
        el('span', { class: 'small', style: { padding: '0 8px' }, text: connectFrom ? 'Now tap the second item' : 'Tap an item to start' }),
        iconButton('close', 'Stop connecting', () => setTool('select'), 'icon-btn'),
      );
    } else if (selectedId) {
      const item = store.items.get(selectedId);
      if (!item) {
        selectedId = null;
        contextbar.style.display = 'none';
        return;
      }
      if (item.type === 'note') {
        entries.push(iconButton('palette', 'Note colour', () => openColorSheet(item.id), 'icon-btn'));
      }
      if (item.type === 'region') {
        entries.push(iconButton('edit', 'Rename region', () => renameRegion(item.id), 'icon-btn'));
        entries.push(iconButton('palette', 'Region colour', () => openColorSheet(item.id), 'icon-btn'));
      }
      if (item.type === 'link') {
        const link = linkFor(item);
        entries.push(iconButton('external', 'Open link', () => link && window.open(link.url, '_blank', 'noopener'), 'icon-btn'));
        entries.push(iconButton('edit', 'Link details', () => openLinkDetails(item.id), 'icon-btn'));
      }
      entries.push(
        iconButton('connect', 'Connect to another item', () => {
          const id = selectedId;
          setTool('connect');
          connectFrom = id;
          rebuildItems();
          updateContextBar();
        }, 'icon-btn'),
        iconButton('copy', 'Duplicate', () => {
          if (!selectedId) return;
          store.snapshotBoard(boardId);
          const copy = store.duplicateItem(selectedId);
          rebuildItems();
          renderConnectors();
          if (copy) selectItem(copy.id);
        }, 'icon-btn'),
        iconButton('trash', 'Delete', () => deleteItem(selectedId as ID), 'icon-btn'),
      );
    }

    if (!entries.length) {
      contextbar.style.display = 'none';
      return;
    }
    contextbar.append(...entries);
    contextbar.style.display = 'flex';
  }

  /* --------------------------------------------------------------- selecting */

  function selectItem(id: ID | null): void {
    if (selectedId === id) {
      updateContextBar();
      return;
    }
    const previous = selectedId;
    selectedId = id;
    if (previous) itemEls.get(previous)?.classList.remove('selected');
    if (id) itemEls.get(id)?.classList.add('selected');
    updateContextBar();
  }

  function deselect(): void {
    commitEditing();
    selectItem(null);
  }

  /* ---------------------------------------------------------------- editing */

  function ensureItemVisible(id: ID): void {
    const item = store.items.get(id);
    if (!item) return;
    const rect = stageRect();
    if (rect.height <= 0) return;
    const center = centerOf(item);
    const screenX = center.x * view.scale + view.x;
    const screenY = center.y * view.scale + view.y;
    const visibleHeight = Math.min(rect.height, window.visualViewport?.height ?? rect.height);
    if (screenY < 90 || screenY > visibleHeight * 0.55) {
      view.y += visibleHeight * 0.3 - screenY;
      applyView();
    }
    if (screenX < 60 || screenX > rect.width - 60) {
      view.x += rect.width / 2 - screenX;
      applyView();
    }
  }

  function startEditing(id: ID): void {
    const item = store.items.get(id);
    if (!item || item.type !== 'note') return;
    if (editingId === id) return;
    commitEditing();
    editingId = id;
    const node = itemEls.get(id);
    if (!node) return;
    const textarea = el('textarea', { attrs: { spellcheck: 'false', 'aria-label': 'Note text' } });
    textarea.value = item.text;
    textarea.addEventListener('input', () => store.updateNoteText(id, textarea.value));
    textarea.addEventListener('blur', () => {
      if (editingId === id) commitEditing();
    });
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        textarea.blur();
      }
    });
    node.replaceChildren(textarea);
    updateContextBar();
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    toolbar.style.display = 'none';
    showColorBar(item.color);
    setTimeout(() => ensureItemVisible(id), 320);
  }

  function commitEditing(): void {
    if (!editingId) return;
    const id = editingId;
    editingId = null;
    const node = itemEls.get(id);
    const textarea = node?.querySelector('textarea');
    if (textarea) store.updateNoteText(id, textarea.value);
    hideColorBar();
    toolbar.style.display = '';
    rebuildItem(id);
    updateContextBar();
  }

  function showColorBar(current: NoteColor): void {
    hideColorBar();
    const swatches = NOTE_COLORS.map((color) => {
      const button = el('button', {
        class: 'swatch-btn',
        attrs: { type: 'button', 'aria-pressed': String(color === current), 'aria-label': `${color} note` },
      }, [el('i', { class: `note-${color}`, style: { background: `var(--note-${color})` } })]);
      button.addEventListener('pointerdown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        if (!editingId) return;
        store.updateItem(editingId, { color } as Partial<Item>);
        const node = itemEls.get(editingId);
        if (node) {
          for (const name of NOTE_COLORS) node.classList.toggle(`note-${name}`, name === color);
        }
        for (const other of colorBar?.querySelectorAll<HTMLElement>('.swatch-btn') ?? []) {
          other.setAttribute('aria-pressed', String(other.getAttribute('aria-label') === `${color} note`));
        }
      });
      return button;
    });
    const done = el('button', { class: 'btn quiet', attrs: { type: 'button' }, text: 'Done' });
    done.addEventListener('click', () => commitEditing());
    colorBar = el('div', { class: 'colorbar' }, [el('span', { class: 'label', text: 'Note color' }), el('div', { class: 'colors' }, swatches), done]);
    screen.append(colorBar);
  }

  function hideColorBar(): void {
    colorBar?.remove();
    colorBar = null;
  }

  /* ---------------------------------------------------------------- actions */

  function addNoteAt(x: number, y: number): void {
    commitEditing();
    store.snapshotBoard(boardId);
    const note = store.createNote(boardId, x, y);
    rebuildItems();
    selectItem(note.id);
    startEditing(note.id);
    haptic(8);
  }

  function addNoteAtCenter(): void {
    const center = viewportCenter();
    addNoteAt(Math.round(center.x - 104), Math.round(center.y - 104));
  }

  function addRegionAtCenter(): void {
    commitEditing();
    const center = viewportCenter();
    store.snapshotBoard(boardId);
    const region = store.createRegion(boardId, Math.round(center.x - 170), Math.round(center.y - 120));
    rebuildItems();
    selectItem(region.id);
    haptic(8);
    renameRegion(region.id);
  }

  function renameRegion(id: ID): void {
    const item = store.items.get(id);
    if (!item || item.type !== 'region') return;
    promptSheet({
      title: 'Region label',
      value: item.label,
      placeholder: 'Mon',
      confirmLabel: 'Save',
      onConfirm: (value) => {
        store.updateItem(id, { label: value.trim().slice(0, 40) || 'Region' } as Partial<Item>);
        rebuildItem(id);
      },
    });
  }

  function deleteItem(id: ID): void {
    const item = store.items.get(id);
    if (!item) return;
    store.snapshotBoard(boardId);
    if (selectedId === id) selectedId = null;
    store.deleteItem(id);
    rebuildItems();
    renderConnectors();
    updateContextBar();
    toast('Deleted', { actionLabel: 'Undo', onAction: () => undoBoard() });
  }

  function openColorSheet(id: ID): void {
    const item = store.items.get(id);
    if (!item) return;
    const colors = item.type === 'note' ? NOTE_COLORS : item.type === 'region' ? REGION_COLORS : [];
    if (!colors.length) return;
    const row = el('div', { class: 'chip-row' });
    for (const color of colors) {
      const button = el('button', {
        class: 'swatch-btn',
        attrs: { type: 'button', 'aria-label': String(color) },
        style: { minWidth: '56px', minHeight: '56px' },
      }, [el('i', {
        style: {
          width: '46px',
          height: '46px',
          borderRadius: '8px',
          background:
            item.type === 'note' ? `var(--note-${color})` : `var(--region-${color as RegionColor})`,
          opacity: '0.9',
        },
      })]);
      button.addEventListener('click', () => {
        store.snapshotBoard(boardId);
        store.updateItem(id, { color } as Partial<Item>);
        closeSheet();
        rebuildItems();
      });
      row.append(button);
    }
    openSheet({ title: 'Colour', content: row });
  }

  function openItemActions(id: ID): void {
    commitEditing();
    const item = store.items.get(id);
    if (!item) return;
    selectItem(id);
    const actions: HTMLElement[] = [];

    const action = (label: string, iconName: Parameters<typeof icon>[0], onClick: () => void, danger = false) => {
      const button = el('button', { class: `btn block ${danger ? 'danger' : 'quiet'}`, attrs: { type: 'button' } }, [
        icon(iconName),
        label,
      ]);
      button.addEventListener('click', () => {
        closeSheet();
        onClick();
      });
      return button;
    };

    if (item.type === 'note') actions.push(action('Edit text', 'edit', () => startEditing(id)));
    if (item.type === 'note' || item.type === 'region') actions.push(action('Colour', 'palette', () => openColorSheet(id)));
    if (item.type === 'region') actions.push(action('Rename label', 'edit', () => renameRegion(id)));
    if (item.type === 'link') {
      const link = linkFor(item);
      if (link) {
        actions.push(action('Open link', 'external', () => window.open(link.url, '_blank', 'noopener')));
        actions.push(action('Link details', 'edit', () => openLinkDetails(id)));
      }
    }
    actions.push(
      action('Connect to…', 'connect', () => {
        setTool('connect');
        connectFrom = id;
        rebuildItems();
        updateContextBar();
      }),
    );
    actions.push(
      action('Duplicate', 'copy', () => {
        store.snapshotBoard(boardId);
        const copy = store.duplicateItem(id);
        rebuildItems();
        if (copy) selectItem(copy.id);
      }),
    );
    actions.push(
      action(item.type === 'link' ? 'Remove from board' : 'Delete', 'trash', () => deleteItem(id), true),
    );

    openSheet({ title: 'Item', content: el('div'), actions });
  }

  function openLinkDetails(itemId: ID): void {
    const item = store.items.get(itemId);
    if (!item || item.type !== 'link') return;
    const link = store.links.get(item.linkId);
    if (!link) return;

    const titleInput = el('input', { class: 'input', attrs: { type: 'text', placeholder: 'Your title' } });
    titleInput.value = link.title;
    const noteInput = el('textarea', { class: 'textarea', attrs: { placeholder: 'Why did you save it?' } });
    noteInput.value = link.note;
    const tagsInput = el('input', { class: 'input', attrs: { type: 'text', placeholder: 'Outdoors, Ideas' } });
    tagsInput.value = link.tags.join(', ');

    const save = el('button', { class: 'btn block', attrs: { type: 'button' }, text: 'Save' });
    save.addEventListener('click', () => {
      store.updateLinkFields(link.id, {
        title: titleInput.value,
        note: noteInput.value,
        tags: tagsInput.value.split(','),
      });
      rebuildItem(itemId);
      closeSheet();
      toast('Link updated');
    });
    const open = el('button', { class: 'btn quiet block', attrs: { type: 'button' }, text: 'Open link' });
    open.addEventListener('click', () => window.open(link.url, '_blank', 'noopener'));

    openSheet({
      title: 'Link',
      subtitle: link.domain,
      content: el('div', {}, [
        el('div', { class: 'field' }, [el('label', { text: 'Title' }), titleInput]),
        el('div', { class: 'field' }, [el('label', { text: 'Your note' }), noteInput]),
        el('div', { class: 'field' }, [el('label', { text: 'Tags (comma separated)' }), tagsInput]),
      ]),
      actions: [save, open],
      autofocus: titleInput,
    });
  }

  function openImageSheet(): void {
    const pick = (source: 'gallery' | 'camera') => {
      closeSheet();
      const input = el('input', { class: 'visually-hidden', attrs: { type: 'file', accept: 'image/*' } });
      if (source === 'camera') input.setAttribute('capture', 'environment');
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.remove();
        if (file) void addImageFile(file);
      });
      document.body.append(input);
      input.click();
    };
    const gallery = el('button', { class: 'btn quiet block', attrs: { type: 'button' } }, [icon('gallery'), 'Choose from gallery']);
    gallery.addEventListener('click', () => pick('gallery'));
    const capture = el('button', { class: 'btn quiet block', attrs: { type: 'button' } }, [icon('camera'), 'Take a photo']);
    capture.addEventListener('click', () => pick('camera'));
    openSheet({ title: 'Add an image', content: el('div'), actions: [gallery, capture] });
  }

  async function addImageFile(file: File): Promise<void> {
    toast('Adding image…');
    try {
      const prepared = await prepareImage(file, 1400);
      const blobId = store.addBlob(prepared.blob, prepared.mime);
      const center = viewportCenter();
      const ratio = prepared.width / prepared.height;
      const width = ratio >= 1 ? 300 : Math.round(300 * ratio);
      const height = Math.round(width / ratio);
      store.snapshotBoard(boardId);
      store.addItem({
        id: uid(),
        boardId,
        type: 'image',
        blobId,
        mime: prepared.mime,
        naturalW: prepared.width,
        naturalH: prepared.height,
        x: Math.round(center.x - width / 2),
        y: Math.round(center.y - height / 2),
        w: width,
        h: height,
        rot: 0,
        z: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await store.saveNow();
      rebuildItems();
      toast('Image added');
    } catch (error) {
      toast('Could not add that image');
      console.error(error);
    }
  }

  function undoBoard(): void {
    if (store.undo(boardId)) {
      selectedId = null;
      editingId = null;
      hideColorBar();
      toolbar.style.display = '';
      rebuildItems();
      renderConnectors();
      renderInk();
      updateContextBar();
      haptic(6);
    } else {
      toast('Nothing to undo');
    }
  }

  function redoBoard(): void {
    if (store.redo(boardId)) {
      selectedId = null;
      editingId = null;
      hideColorBar();
      toolbar.style.display = '';
      rebuildItems();
      renderConnectors();
      renderInk();
      updateContextBar();
      haptic(6);
    } else {
      toast('Nothing to redo');
    }
  }

  function clearInk(): void {
    if (![...store.strokes.values()].some((s) => s.boardId === boardId)) {
      toast('No ink to erase');
      return;
    }
    void confirmSheet({
      title: 'Erase all ink?',
      message: 'Pen strokes on this board will be removed. Notes, regions and links stay.',
      confirmLabel: 'Erase ink',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      store.snapshotBoard(boardId);
      store.clearInk(boardId);
      renderInk();
      toast('Ink erased', { actionLabel: 'Undo', onAction: () => undoBoard() });
    });
  }

  function renameBoard(): void {
    promptSheet({
      title: 'Board name',
      value: board?.name ?? '',
      confirmLabel: 'Save',
      onConfirm: (value) => {
        const name = value.trim().slice(0, 80);
        if (!name || !board) return;
        store.updateBoard(board.id, { name });
        title.textContent = name;
      },
    });
  }

  function openBoardMenu(): void {
    openMenu(topbar.querySelector<HTMLElement>('[aria-label="Board menu"]') ?? topbar, [
      { label: 'Rename board', icon: 'edit', onSelect: renameBoard },
      { label: 'Undo', icon: 'undo', disabled: !store.canUndo(boardId), onSelect: undoBoard },
      { label: 'Redo', icon: 'redo', disabled: !store.canRedo(boardId), onSelect: redoBoard },
      'separator',
      { label: 'Erase all ink', icon: 'eraser', onSelect: clearInk },
      {
        label: 'Delete board',
        icon: 'trash',
        danger: true,
        onSelect: () => {
          void confirmSheet({
            title: 'Delete this board?',
            message: `“${board?.name ?? 'Board'}” and its notes will be deleted. Links go back to the Inbox. This cannot be undone from here.`,
            confirmLabel: 'Delete board',
            danger: true,
          }).then((confirmed) => {
            if (!confirmed) return;
            store.deleteBoard(boardId);
            void store.saveNow();
            navigate('#/boards');
          });
        },
      },
    ]);
  }

  /* --------------------------------------------------------------- gestures */

  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: Gesture = { kind: 'none' };
  let downClient = { x: 0, y: 0 };
  let moved = false;
  let longPressFired = false;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  function clearLongPress(): void {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function inkColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1a2433';
  }

  function eraseAt(worldX: number, worldY: number): boolean {
    const radius = 18 / view.scale;
    for (const stroke of [...store.strokes.values()]) {
      if (stroke.boardId !== boardId) continue;
      const points = stroke.points;
      let hit = points.length === 2
        ? Math.hypot(points[0] - worldX, points[1] - worldY) < radius
        : false;
      for (let i = 2; !hit && i < points.length; i += 2) {
        hit =
          distanceToSegment(worldX, worldY, points[i - 2], points[i - 1], points[i], points[i + 1]) < radius;
      }
      if (hit) {
        store.deleteStroke(stroke.id);
        return true;
      }
    }
    return false;
  }

  function handleTapItem(item: Item): void {
    if (tool === 'connect') {
      if (!connectFrom) {
        connectFrom = item.id;
        itemEls.get(item.id)?.classList.add('connecting');
        updateContextBar();
        toast('Now tap the second item');
        return;
      }
      if (connectFrom === item.id) {
        connectFrom = null;
        rebuildItems();
        updateContextBar();
        return;
      }
      store.snapshotBoard(boardId);
      const created = store.connect(connectFrom, item.id);
      connectFrom = null;
      setTool('select');
      renderConnectors();
      if (created) haptic(10);
      return;
    }

    if (item.type === 'note') {
      selectItem(item.id);
      startEditing(item.id);
      return;
    }
    selectItem(item.id);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('a[href]')) return; // native link behaviour
    if (target.closest('.contextbar, .toolbar')) return;

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      /* older browsers */
    }

    if (pointers.size === 1) {
      downClient = { x: event.clientX, y: event.clientY };
      moved = false;
      longPressFired = false;
    }

    if (pointers.size === 2) {
      clearLongPress();
      if (gesture.kind === 'pen') {
        gesture.path.remove();
        gesture = { kind: 'none' };
      }
      if (gesture.kind === 'drag' || gesture.kind === 'resize') {
        const active = gesture;
        const item = store.items.get(active.id);
        if (active.snapped && item) store.updateItem(active.id, { x: item.x, y: item.y } as Partial<Item>);
        itemEls.get(active.id)?.classList.remove('dragging');
      }
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const world = toWorld(mid.x, mid.y);
      gesture = {
        kind: 'pinch',
        baseScale: view.scale,
        baseDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        worldMidX: world.x,
        worldMidY: world.y,
      };
      moved = true;
      return;
    }
    if (pointers.size > 2) return;

    const worldPoint = toWorld(event.clientX, event.clientY);

    if (tool === 'pen') {
      const path = svgEl('path', { class: 'ink-path', d: '' });
      gInk.append(path);
      gesture = { kind: 'pen', points: [worldPoint.x, worldPoint.y], path, snapped: false };
      moved = true;
      return;
    }

    if (tool === 'eraser') {
      gesture = { kind: 'erase', erased: eraseAt(worldPoint.x, worldPoint.y) };
      if (gesture.erased) {
        store.snapshotBoard(boardId);
        renderInk();
      }
      moved = true;
      return;
    }

    const itemNode = target.closest<HTMLElement>('.item');
    const handle = target.closest<HTMLElement>('.handle');

    if (handle && itemNode?.dataset.id) {
      const id = itemNode.dataset.id;
      const item = store.items.get(id);
      if (!item) return;
      gesture = {
        kind: 'resize',
        id,
        startW: item.w,
        startH: item.h,
        startX: event.clientX,
        startY: event.clientY,
        snapped: false,
      };
      return;
    }

    if (itemNode?.dataset.id) {
      const id = itemNode.dataset.id;
      const item = store.items.get(id);
      if (!item) return;
      gesture = {
        kind: 'drag',
        id,
        startItemX: item.x,
        startItemY: item.y,
        startX: event.clientX,
        startY: event.clientY,
        snapped: false,
      };
      longPressTimer = setTimeout(() => {
        if (moved) return;
        longPressFired = true;
        haptic(14);
        openItemActions(id);
      }, LONG_PRESS_MS);
      return;
    }

    // empty space
    gesture = {
      kind: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      viewX: view.x,
      viewY: view.y,
    };
    longPressTimer = setTimeout(() => {
      if (moved) return;
      longPressFired = true;
      haptic(14);
      addNoteAt(Math.round(worldPoint.x - 104), Math.round(worldPoint.y - 104));
    }, LONG_PRESS_MS);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (gesture.kind === 'pen') {
      const point = toWorld(event.clientX, event.clientY);
      const points = gesture.points;
      const lastX = points[points.length - 2];
      const lastY = points[points.length - 1];
      if (Math.hypot(point.x - lastX, point.y - lastY) * view.scale < 1.6) return;
      if (!gesture.snapped) {
        store.snapshotBoard(boardId);
        gesture.snapped = true;
      }
      points.push(point.x, point.y);
      gesture.path.setAttribute('d', pointsToPath(points));
      return;
    }

    if (gesture.kind === 'erase') {
      const point = toWorld(event.clientX, event.clientY);
      if (!gesture.erased) {
        store.snapshotBoard(boardId);
        gesture.erased = true;
      }
      if (eraseAt(point.x, point.y)) renderInk();
      return;
    }

    if (gesture.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const rect = stageRect();
      const nextScale = clamp((gesture.baseScale * dist) / gesture.baseDist, MIN_SCALE, MAX_SCALE);
      view.scale = nextScale;
      view.x = mid.x - rect.left - gesture.worldMidX * nextScale;
      view.y = mid.y - rect.top - gesture.worldMidY * nextScale;
      applyView();
      return;
    }

    if (gesture.kind === 'none') return;

    const dx = event.clientX - downClient.x;
    const dy = event.clientY - downClient.y;
    if (!moved) {
      if (Math.hypot(dx, dy) < TAP_SLOP) return;
      moved = true;
      clearLongPress();
    }

    if (gesture.kind === 'pan') {
      stage.classList.add('dragging');
      view.x = gesture.viewX + dx;
      view.y = gesture.viewY + dy;
      applyView();
      return;
    }

    if (gesture.kind === 'drag') {
      if (!gesture.snapped) {
        store.snapshotBoard(boardId);
        gesture.snapped = true;
      }
      const item = store.items.get(gesture.id);
      if (!item) return;
      item.x = gesture.startItemX + dx / view.scale;
      item.y = gesture.startItemY + dy / view.scale;
      const node = itemEls.get(gesture.id);
      if (node) {
        node.classList.add('dragging');
        applyItemTransform(node, item);
      }
      renderConnectors();
      return;
    }

    if (gesture.kind === 'resize') {
      if (!gesture.snapped) {
        store.snapshotBoard(boardId);
        gesture.snapped = true;
      }
      const item = store.items.get(gesture.id);
      if (!item) return;
      item.w = Math.max(80, gesture.startW + dx / view.scale);
      item.h = Math.max(56, gesture.startH + dy / view.scale);
      const node = itemEls.get(gesture.id);
      if (node) applyItemTransform(node, item);
      renderConnectors();
    }
  }

  function finishPointer(event: PointerEvent): void {
    const wasLast = pointers.size === 1;
    pointers.delete(event.pointerId);

    if (gesture.kind === 'pen') {
      const { points, path } = gesture;
      path.remove();
      if (points.length >= 4 && wasLast) {
        store.addStroke({
          id: uid(),
          boardId,
          color: inkColor(),
          width: 2.4,
          points: points.map((value) => Math.round(value * 10) / 10),
        });
      }
      renderInk();
      updateContextBar();
      gesture = { kind: 'none' };
    } else if (gesture.kind === 'erase') {
      renderInk();
      updateContextBar();
      gesture = { kind: 'none' };
    } else if (gesture.kind === 'drag') {
      const active = gesture;
      const node = itemEls.get(active.id);
      node?.classList.remove('dragging');
      const item = store.items.get(active.id);
      if (moved && item) {
        store.updateItem(active.id, { x: Math.round(item.x), y: Math.round(item.y) } as Partial<Item>);
        if (node) applyItemTransform(node, item);
      } else if (!longPressFired && item) {
        handleTapItem(item);
      }
      gesture = { kind: 'none' };
    } else if (gesture.kind === 'resize') {
      const active = gesture;
      const item = store.items.get(active.id);
      if (moved && item) {
        store.updateItem(active.id, { w: Math.round(item.w), h: Math.round(item.h) } as Partial<Item>);
      }
      gesture = { kind: 'none' };
    } else if (gesture.kind === 'pinch') {
      if (pointers.size === 1) {
        const [point] = [...pointers.values()];
        downClient = { x: point.x, y: point.y };
        gesture = { kind: 'pan', startX: point.x, startY: point.y, viewX: view.x, viewY: view.y };
        moved = true;
      } else {
        gesture = { kind: 'none' };
      }
    } else if (gesture.kind === 'pan') {
      stage.classList.remove('dragging');
      if (!moved && !longPressFired) deselect();
      gesture = { kind: 'none' };
    }

    clearLongPress();
    if (pointers.size === 0) {
      moved = false;
      stage.classList.remove('dragging');
      store.saveBoardView(boardId, { ...view });
    }
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomAt(event.clientX, event.clientY, view.scale * factor);
  }

  const listeners: [string, EventListener][] = [];
  function on(type: string, handler: EventListener, options?: AddEventListenerOptions): void {
    stage.addEventListener(type, handler, options);
    listeners.push([type, handler]);
  }

  on('pointerdown', onPointerDown as unknown as EventListener);
  on('pointermove', onPointerMove as unknown as EventListener);
  on('pointerup', finishPointer as unknown as EventListener);
  on('pointercancel', finishPointer as unknown as EventListener);
  on('wheel', onWheel as unknown as EventListener, { passive: false });

  function onViewportChange(): void {
    if (editingId) ensureItemVisible(editingId);
  }
  window.visualViewport?.addEventListener('resize', onViewportChange);

  function onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      commitEditing();
      store.saveBoardView(boardId, { ...view });
      void store.saveNow();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  /* ------------------------------------------------------------------ start */

  applyView();
  updateBackground();
  rebuildItems();
  renderConnectors();
  renderInk();
  setTool('select');
  updateContextBar();

  if (options.startNote) {
    // "New note" shortcut: drop the user straight into a note
    setTimeout(() => addNoteAtCenter(), 60);
  }

  let lastBgId = store.settings.bgBlobId;
  let lastBgDim = store.settings.bgDim;
  const unsubscribe = store.subscribe(() => {
    if (store.settings.bgBlobId !== lastBgId || store.settings.bgDim !== lastBgDim) {
      lastBgId = store.settings.bgBlobId;
      lastBgDim = store.settings.bgDim;
      updateBackground();
    }
  });

  function cleanup(): void {
    commitEditing();
    hideColorBar();
    store.saveBoardView(boardId, { ...view });
    void store.saveNow();
    for (const [type, handler] of listeners) stage.removeEventListener(type, handler);
    window.visualViewport?.removeEventListener('resize', onViewportChange);
    document.removeEventListener('visibilitychange', onVisibility);
    unsubscribe();
    for (const url of blobUrls.values()) URL.revokeObjectURL(url);
    blobUrls.clear();
  }

  // The board may be deleted from elsewhere (menu already navigates away).
  if (!store.boards.has(boardId)) navigate('#/boards');

  return { element: screen, cleanup };
}
