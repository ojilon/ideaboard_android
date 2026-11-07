import type { IDBPDatabase } from 'idb';
import { ENTITY_STORES, describeError, openAppDB, type AppDB, type EntityStore } from './db';
import {
  REGION_DEFAULT_SIZE,
  NOTE_DEFAULT_SIZE,
  defaultSettings,
  type Board,
  type Connector,
  type ID,
  type Item,
  type LinkRecord,
  type LinkCardItem,
  type NoteColor,
  type NoteItem,
  type RegionItem,
  type Settings,
  type StoredBlob,
  type Stroke,
  type View,
} from './model';
import { cleanNoteText, domainOf, guessTitle, normalizeUrl, parseTags } from './parse';

export const uid = (): ID => {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const SAVE_DEBOUNCE = 400;
const UNDO_LIMIT = 40;
export const CHANGES_BEFORE_REMINDER = 20;

type Snapshot = { items: Item[]; connectors: Connector[]; strokes: Stroke[] };
type Dirty = { put: Set<ID>; del: Set<ID> };

export type LinkInput = {
  url: string;
  title?: string;
  note?: string;
  tags?: string[];
  boardId?: ID | null;
};

/**
 * All app state lives here: maps in memory are the source of truth, IndexedDB is
 * written behind them (debounced). A failed write never costs the user work.
 */
export class Store {
  db: IDBPDatabase<AppDB> | null = null;
  boards = new Map<ID, Board>();
  items = new Map<ID, Item>();
  connectors = new Map<ID, Connector>();
  strokes = new Map<ID, Stroke>();
  links = new Map<ID, LinkRecord>();
  blobs = new Map<ID, StoredBlob>();

  settings: Settings = defaultSettings();
  dbError: string | null = null;
  storagePersisted: boolean | null = null;
  changesSinceBackup = 0;
  ready = false;

  private dirty = new Map<EntityStore, Dirty>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private undoStacks = new Map<ID, { undo: Snapshot[]; redo: Snapshot[] }>();

  /* ------------------------------------------------------------- lifecycle */

  async init(): Promise<void> {
    try {
      this.db = await openAppDB();
      const [boards, items, connectors, strokes, links, blobs] = await Promise.all([
        this.db.getAll('boards'),
        this.db.getAll('items'),
        this.db.getAll('connectors'),
        this.db.getAll('strokes'),
        this.db.getAll('links'),
        this.db.getAll('blobs'),
      ]);
      for (const b of boards) this.boards.set(b.id, b);
      for (const i of items) this.items.set(i.id, i);
      for (const c of connectors) this.connectors.set(c.id, c);
      for (const s of strokes) this.strokes.set(s.id, s);
      for (const l of links) this.links.set(l.id, l);
      for (const b of blobs) this.blobs.set(b.id, b);

      const savedSettings = await this.db.get('meta', 'settings');
      if (savedSettings?.value) {
        this.settings = { ...defaultSettings(), ...(savedSettings.value as Partial<Settings>) };
      }
      const counter = await this.db.get('meta', 'changesSinceBackup');
      if (typeof counter?.value === 'number') this.changesSinceBackup = counter.value;
    } catch (error) {
      this.dbError = `Storage is unavailable (${describeError(error)}). You can still work, but nothing is being saved.`;
    }
    this.ready = true;
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /* ---------------------------------------------------------------- writing */

  private dirtyFor(name: EntityStore): Dirty {
    let d = this.dirty.get(name);
    if (!d) {
      d = { put: new Set(), del: new Set() };
      this.dirty.set(name, d);
    }
    return d;
  }

  private markPut(name: EntityStore, id: ID): void {
    const d = this.dirtyFor(name);
    d.put.add(id);
    d.del.delete(id);
  }

  private markDel(name: EntityStore, id: ID): void {
    const d = this.dirtyFor(name);
    d.del.add(id);
    d.put.delete(id);
  }

  private hasDirty(): boolean {
    for (const d of this.dirty.values()) if (d.put.size || d.del.size) return true;
    return false;
  }

  private entityFor(name: EntityStore, id: ID): unknown {
    switch (name) {
      case 'boards':
        return this.boards.get(id);
      case 'items':
        return this.items.get(id);
      case 'connectors':
        return this.connectors.get(id);
      case 'strokes':
        return this.strokes.get(id);
      case 'links':
        return this.links.get(id);
      case 'blobs':
        return this.blobs.get(id);
    }
  }

  private bump(count = 1): void {
    this.changesSinceBackup += count;
    this.emit();
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.saveNow();
    }, SAVE_DEBOUNCE);
  }

  /** Force a write of everything pending (used on hide / pagehide / export). */
  async saveNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushing) {
      await this.flushing;
      if (!this.hasDirty()) return;
    }
    this.flushing = this.flushNow().finally(() => {
      this.flushing = null;
    });
    await this.flushing;
  }

  private async flushNow(): Promise<void> {
    if (!this.hasDirty()) return;
    if (!this.db) {
      this.dbError = 'Storage is unavailable — your work is kept in memory only. Export to keep it.';
      this.emit();
      return;
    }
    const batch = new Map(this.dirty);
    this.dirty.clear();
    try {
      const stores = [...batch.keys()];
      const tx = this.db.transaction([...stores, 'meta'], 'readwrite');
      for (const [name, d] of batch) {
        const target = tx.objectStore(name);
        for (const id of d.del) await target.delete(id);
        for (const id of d.put) {
          const value = this.entityFor(name, id);
          if (value !== undefined) await target.put(value as never);
        }
      }
      await tx.objectStore('meta').put({ key: 'changesSinceBackup', value: this.changesSinceBackup });
      await tx.done;
      if (this.dbError) this.dbError = null;
    } catch (error) {
      for (const [name, d] of batch) {
        const current = this.dirtyFor(name);
        for (const id of d.put) current.put.add(id);
        for (const id of d.del) current.del.add(id);
      }
      this.dbError = `Could not save: ${describeError(error)}. Your work is still in memory — export it or free some space.`;
    }
    this.emit();
  }

  /* ----------------------------------------------------------------- boards */

  createBoard(name = 'Untitled board'): Board {
    const ts = Date.now();
    const board: Board = {
      id: uid(),
      name,
      createdAt: ts,
      updatedAt: ts,
      view: { x: 0, y: 0, scale: 1 },
    };
    this.boards.set(board.id, board);
    this.markPut('boards', board.id);
    this.bump();
    this.scheduleSave();
    return board;
  }

  updateBoard(id: ID, patch: Partial<Board>): void {
    const board = this.boards.get(id);
    if (!board) return;
    Object.assign(board, patch, { updatedAt: Date.now() });
    this.markPut('boards', id);
    this.bump();
    this.scheduleSave();
  }

  saveBoardView(id: ID, view: View): void {
    const board = this.boards.get(id);
    if (!board) return;
    board.view = view;
    this.markPut('boards', id);
    this.scheduleSave();
  }

  private touchBoard(id: ID): void {
    const board = this.boards.get(id);
    if (!board) return;
    board.updatedAt = Date.now();
    this.markPut('boards', id);
  }

  deleteBoard(id: ID): void {
    this.boards.delete(id);
    this.markDel('boards', id);
    for (const item of [...this.items.values()]) {
      if (item.boardId === id) {
        this.items.delete(item.id);
        this.markDel('items', item.id);
      }
    }
    for (const c of [...this.connectors.values()]) {
      if (c.boardId === id) {
        this.connectors.delete(c.id);
        this.markDel('connectors', c.id);
      }
    }
    for (const s of [...this.strokes.values()]) {
      if (s.boardId === id) {
        this.strokes.delete(s.id);
        this.markDel('strokes', s.id);
      }
    }
    // links survive: they go back to the Inbox
    for (const link of this.links.values()) {
      if (link.boardId === id) {
        link.boardId = null;
        this.markPut('links', link.id);
      }
    }
    this.undoStacks.delete(id);
    this.bump();
    this.scheduleSave();
  }

  /* ------------------------------------------------------------------ items */

  addItem<T extends Item>(item: T): T {
    this.items.set(item.id, item);
    this.markPut('items', item.id);
    this.touchBoard(item.boardId);
    this.bump();
    this.scheduleSave();
    return item;
  }

  updateItem(id: ID, patch: Partial<Item>): void {
    const item = this.items.get(id);
    if (!item) return;
    Object.assign(item, patch, { updatedAt: Date.now() });
    this.markPut('items', id);
    this.touchBoard(item.boardId);
    this.bump();
    this.scheduleSave();
  }

  deleteItem(id: ID): void {
    const item = this.items.get(id);
    if (!item) return;
    this.items.delete(id);
    this.markDel('items', id);
    for (const c of [...this.connectors.values()]) {
      if (c.from === id || c.to === id) {
        this.connectors.delete(c.id);
        this.markDel('connectors', c.id);
      }
    }
    this.touchBoard(item.boardId);
    this.bump();
    this.scheduleSave();
  }

  duplicateItem(id: ID): Item | null {
    const item = this.items.get(id);
    if (!item) return null;
    const copy = structuredClone(item);
    copy.id = uid();
    copy.x += 24;
    copy.y += 24;
    copy.createdAt = copy.updatedAt = Date.now();
    return this.addItem(copy);
  }

  createNote(boardId: ID, x: number, y: number, color: NoteColor = 'yellow'): NoteItem {
    const ts = Date.now();
    const note: NoteItem = {
      id: uid(),
      boardId,
      type: 'note',
      x,
      y,
      w: NOTE_DEFAULT_SIZE.w,
      h: NOTE_DEFAULT_SIZE.h,
      rot: Math.round((Math.random() * 4 - 2) * 10) / 10,
      z: ts,
      text: '',
      color,
      createdAt: ts,
      updatedAt: ts,
    };
    return this.addItem(note);
  }

  createRegion(boardId: ID, x: number, y: number): RegionItem {
    const ts = Date.now();
    const region: RegionItem = {
      id: uid(),
      boardId,
      type: 'region',
      x,
      y,
      w: REGION_DEFAULT_SIZE.w,
      h: REGION_DEFAULT_SIZE.h,
      rot: 0,
      z: 0,
      label: 'New region',
      color: 'green',
      createdAt: ts,
      updatedAt: ts,
    };
    return this.addItem(region);
  }

  updateNoteText(id: ID, text: string): void {
    this.updateItem(id, { text: cleanNoteText(text) } as Partial<Item>);
  }

  /* ------------------------------------------------------------- connectors */

  connect(from: ID, to: ID): Connector | null {
    const a = this.items.get(from);
    const b = this.items.get(to);
    if (!a || !b || a.id === b.id || a.boardId !== b.boardId) return null;
    for (const c of this.connectors.values()) {
      if ((c.from === from && c.to === to) || (c.from === to && c.to === from)) return null;
    }
    const connector: Connector = { id: uid(), boardId: a.boardId, from, to };
    this.connectors.set(connector.id, connector);
    this.markPut('connectors', connector.id);
    this.touchBoard(a.boardId);
    this.bump();
    this.scheduleSave();
    return connector;
  }

  deleteConnector(id: ID): void {
    const connector = this.connectors.get(id);
    if (!connector) return;
    this.connectors.delete(id);
    this.markDel('connectors', id);
    this.bump();
    this.scheduleSave();
  }

  /* ---------------------------------------------------------------- strokes */

  addStroke(stroke: Stroke): void {
    this.strokes.set(stroke.id, stroke);
    this.markPut('strokes', stroke.id);
    this.touchBoard(stroke.boardId);
    this.bump();
    this.scheduleSave();
  }

  deleteStroke(id: ID): void {
    const stroke = this.strokes.get(id);
    if (!stroke) return;
    this.strokes.delete(id);
    this.markDel('strokes', id);
    this.touchBoard(stroke.boardId);
    this.bump();
    this.scheduleSave();
  }

  clearInk(boardId: ID): number {
    let removed = 0;
    for (const s of [...this.strokes.values()]) {
      if (s.boardId === boardId) {
        this.strokes.delete(s.id);
        this.markDel('strokes', s.id);
        removed++;
      }
    }
    if (removed) {
      this.touchBoard(boardId);
      this.bump();
      this.scheduleSave();
    }
    return removed;
  }

  /* ------------------------------------------------------------------ links */

  createLink(input: LinkInput): LinkRecord | null {
    const url = normalizeUrl(input.url);
    if (!url) return null;
    const ts = Date.now();
    const link: LinkRecord = {
      id: uid(),
      url,
      domain: domainOf(url),
      title: (input.title ?? '').trim() || guessTitle(url),
      note: (input.note ?? '').trim().slice(0, 1000),
      tags: input.tags ? parseTags(input.tags.join(',')) : [],
      savedAt: ts,
      updatedAt: ts,
      boardId: input.boardId ?? null,
    };
    this.links.set(link.id, link);
    this.markPut('links', link.id);
    if (link.boardId) this.touchBoard(link.boardId);
    this.bump();
    this.scheduleSave();
    return link;
  }

  updateLinkUrl(id: ID, rawUrl: string): void {
    const link = this.links.get(id);
    const url = normalizeUrl(rawUrl);
    if (!link || !url) return;
    link.url = url;
    link.domain = domainOf(url);
    link.updatedAt = Date.now();
    this.markPut('links', id);
    this.bump();
    this.scheduleSave();
  }

  updateLinkFields(
    id: ID,
    fields: { title?: string; note?: string; tags?: string[]; boardId?: ID | null },
  ): void {
    const link = this.links.get(id);
    if (!link) return;
    if (fields.title !== undefined) link.title = fields.title.trim().slice(0, 300);
    if (fields.note !== undefined) link.note = fields.note.trim().slice(0, 1000);
    if (fields.tags !== undefined) link.tags = parseTags(fields.tags.join(','));
    if (fields.boardId !== undefined) link.boardId = fields.boardId;
    link.updatedAt = Date.now();
    this.markPut('links', id);
    if (link.boardId) this.touchBoard(link.boardId);
    this.bump();
    this.scheduleSave();
  }

  deleteLink(id: ID): void {
    const link = this.links.get(id);
    if (!link) return;
    this.links.delete(id);
    this.markDel('links', id);
    for (const item of [...this.items.values()]) {
      if (item.type === 'link' && item.linkId === id) this.deleteItem(item.id);
    }
    this.bump();
    this.scheduleSave();
  }

  /** Put a link card on a board at world coordinates (top-left). */
  placeLinkOnBoard(linkId: ID, boardId: ID, x: number, y: number): LinkCardItem | null {
    const link = this.links.get(linkId);
    if (!link) return null;
    const ts = Date.now();
    const item: LinkCardItem = {
      id: uid(),
      boardId,
      type: 'link',
      x,
      y,
      w: 260,
      h: 148,
      rot: 0,
      z: ts,
      linkId,
      createdAt: ts,
      updatedAt: ts,
    };
    this.addItem(item);
    this.updateLinkFields(linkId, { boardId });
    return item;
  }

  linksInInbox(): LinkRecord[] {
    return [...this.links.values()]
      .filter((l) => l.boardId === null)
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  allTags(): string[] {
    const tags = new Map<string, string>();
    for (const link of this.links.values()) for (const tag of link.tags) tags.set(tag.toLowerCase(), tag);
    return [...tags.values()].sort((a, b) => a.localeCompare(b));
  }

  /* ------------------------------------------------------------------ blobs */

  addBlob(blob: Blob, mime: string): ID {
    const id = uid();
    this.blobs.set(id, { id, mime, blob });
    this.markPut('blobs', id);
    this.bump();
    this.scheduleSave();
    return id;
  }

  deleteBlob(id: ID): void {
    if (!this.blobs.has(id)) return;
    this.blobs.delete(id);
    this.markDel('blobs', id);
    this.scheduleSave();
  }

  getBlobUrl(id: ID): string | null {
    const record = this.blobs.get(id);
    return record ? URL.createObjectURL(record.blob) : null;
  }

  /* ------------------------------------------------------------------- undo */

  private undoFor(boardId: ID): { undo: Snapshot[]; redo: Snapshot[] } {
    let entry = this.undoStacks.get(boardId);
    if (!entry) {
      entry = { undo: [], redo: [] };
      this.undoStacks.set(boardId, entry);
    }
    return entry;
  }

  private captureSnapshot(boardId: ID): Snapshot {
    return {
      items: [...this.items.values()].filter((i) => i.boardId === boardId).map((i) => structuredClone(i)),
      connectors: [...this.connectors.values()]
        .filter((c) => c.boardId === boardId)
        .map((c) => structuredClone(c)),
      strokes: [...this.strokes.values()].filter((s) => s.boardId === boardId).map((s) => structuredClone(s)),
    };
  }

  /** Call *before* mutating a board, then mutate. */
  snapshotBoard(boardId: ID): void {
    const entry = this.undoFor(boardId);
    entry.undo.push(this.captureSnapshot(boardId));
    if (entry.undo.length > UNDO_LIMIT) entry.undo.shift();
    entry.redo.length = 0;
    this.emit();
  }

  canUndo(boardId: ID): boolean {
    return (this.undoStacks.get(boardId)?.undo.length ?? 0) > 0;
  }

  canRedo(boardId: ID): boolean {
    return (this.undoStacks.get(boardId)?.redo.length ?? 0) > 0;
  }

  undo(boardId: ID): boolean {
    const entry = this.undoStacks.get(boardId);
    const snapshot = entry?.undo.pop();
    if (!entry || !snapshot) return false;
    entry.redo.push(this.captureSnapshot(boardId));
    this.applySnapshot(boardId, snapshot);
    return true;
  }

  redo(boardId: ID): boolean {
    const entry = this.undoStacks.get(boardId);
    const snapshot = entry?.redo.pop();
    if (!entry || !snapshot) return false;
    entry.undo.push(this.captureSnapshot(boardId));
    this.applySnapshot(boardId, snapshot);
    return true;
  }

  private applySnapshot(boardId: ID, snapshot: Snapshot): void {
    const keepItems = new Set(snapshot.items.map((i) => i.id));
    const keepConnectors = new Set(snapshot.connectors.map((c) => c.id));
    const keepStrokes = new Set(snapshot.strokes.map((s) => s.id));

    for (const item of [...this.items.values()]) {
      if (item.boardId === boardId && !keepItems.has(item.id)) {
        this.items.delete(item.id);
        this.markDel('items', item.id);
      }
    }
    for (const connector of [...this.connectors.values()]) {
      if (connector.boardId === boardId && !keepConnectors.has(connector.id)) {
        this.connectors.delete(connector.id);
        this.markDel('connectors', connector.id);
      }
    }
    for (const stroke of [...this.strokes.values()]) {
      if (stroke.boardId === boardId && !keepStrokes.has(stroke.id)) {
        this.strokes.delete(stroke.id);
        this.markDel('strokes', stroke.id);
      }
    }
    for (const item of snapshot.items) {
      this.items.set(item.id, item);
      this.markPut('items', item.id);
    }
    for (const connector of snapshot.connectors) {
      this.connectors.set(connector.id, connector);
      this.markPut('connectors', connector.id);
    }
    for (const stroke of snapshot.strokes) {
      this.strokes.set(stroke.id, stroke);
      this.markPut('strokes', stroke.id);
    }
    this.touchBoard(boardId);
    this.bump();
    this.scheduleSave();
    this.emit();
  }

  /* --------------------------------------------------------------- settings */

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    if (this.db) {
      void this.db.put('meta', { key: 'settings', value: this.settings }).catch((error: unknown) => {
        this.dbError = `Could not save settings: ${describeError(error)}`;
      });
    }
    this.emit();
  }

  markBackedUp(): void {
    this.changesSinceBackup = 0;
    this.updateSettings({ lastBackupAt: Date.now() });
    if (this.db) {
      void this.db
        .put('meta', { key: 'changesSinceBackup', value: 0 })
        .catch(() => undefined);
    }
    this.emit();
  }

  /* ------------------------------------------------------- storage & persist */

  async refreshPersistence(): Promise<void> {
    try {
      if (!navigator.storage?.persisted) {
        this.storagePersisted = false;
      } else {
        this.storagePersisted = await navigator.storage.persisted();
      }
    } catch {
      this.storagePersisted = null;
    }
    this.emit();
  }

  async requestPersistence(): Promise<boolean | null> {
    try {
      if (!navigator.storage?.persist) {
        this.storagePersisted = false;
      } else {
        const granted = await navigator.storage.persist();
        this.storagePersisted = granted || (await navigator.storage.persisted());
      }
    } catch {
      this.storagePersisted = false;
    }
    this.emit();
    return this.storagePersisted;
  }

  async estimate(): Promise<{ usage: number; quota: number } | null> {
    try {
      if (!navigator.storage?.estimate) return null;
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota };
    } catch {
      return null;
    }
  }

  /* ------------------------------------------------------- whole-file import */

  async replaceAll(data: {
    boards: Board[];
    items: Item[];
    connectors: Connector[];
    strokes: Stroke[];
    links: LinkRecord[];
    blobs: StoredBlob[];
    settings?: Partial<Settings>;
  }): Promise<void> {
    this.undoStacks.clear();
    this.boards = new Map(data.boards.map((b) => [b.id, b]));
    this.items = new Map(data.items.map((i) => [i.id, i]));
    this.connectors = new Map(data.connectors.map((c) => [c.id, c]));
    this.strokes = new Map(data.strokes.map((s) => [s.id, s]));
    this.links = new Map(data.links.map((l) => [l.id, l]));
    this.blobs = new Map(data.blobs.map((b) => [b.id, b]));

    if (data.settings) {
      this.settings = { ...defaultSettings(), ...data.settings, lastBackupAt: null };
    }
    this.changesSinceBackup = 0;

    this.dirty.clear();
    for (const name of ENTITY_STORES) this.dirtyFor(name).put = new Set();
    const all: Record<EntityStore, Map<ID, unknown>> = {
      boards: this.boards,
      items: this.items,
      connectors: this.connectors,
      strokes: this.strokes,
      links: this.links,
      blobs: this.blobs,
    };
    for (const name of ENTITY_STORES) {
      for (const id of all[name].keys()) this.markPut(name, id);
    }

    if (this.db) {
      try {
        const tx = this.db.transaction([...ENTITY_STORES, 'meta'], 'readwrite');
        for (const name of ENTITY_STORES) await tx.objectStore(name).clear();
        for (const name of ENTITY_STORES) {
          const target = tx.objectStore(name);
          for (const value of all[name].values()) await target.put(value as never);
        }
        await tx.objectStore('meta').put({ key: 'settings', value: this.settings });
        await tx.objectStore('meta').put({ key: 'changesSinceBackup', value: 0 });
        await tx.done;
        this.dirty.clear();
        this.dbError = null;
      } catch (error) {
        this.dbError = `Import failed to save: ${describeError(error)}. The data is in memory; export it to keep it.`;
      }
    }
    this.emit();
  }
}

export const store = new Store();
