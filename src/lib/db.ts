import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Board, Connector, Item, LinkRecord, StoredBlob, Stroke } from './model';

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface AppDB extends DBSchema {
  boards: { key: string; value: Board };
  items: { key: string; value: Item };
  connectors: { key: string; value: Connector };
  strokes: { key: string; value: Stroke };
  links: { key: string; value: LinkRecord };
  blobs: { key: string; value: StoredBlob };
  meta: { key: string; value: MetaRecord };
}

export type EntityStore = 'boards' | 'items' | 'connectors' | 'strokes' | 'links' | 'blobs';
export const ENTITY_STORES: EntityStore[] = ['boards', 'items', 'connectors', 'strokes', 'links', 'blobs'];

export const DB_NAME = 'ideaboard';
export const DB_VERSION = 1;

export function openAppDB(): Promise<IDBPDatabase<AppDB>> {
  return openDB<AppDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('boards')) db.createObjectStore('boards', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('connectors')) db.createObjectStore('connectors', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('strokes')) db.createObjectStore('strokes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('links')) db.createObjectStore('links', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    },
  });
}

export function describeError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') return 'the device is out of storage space';
    return error.message || error.name;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
