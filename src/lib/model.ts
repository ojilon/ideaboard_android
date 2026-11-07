/**
 * The data model. Mirrors docs/DATA_FORMAT.md — keep them in step.
 */

export type ID = string;

export type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple';
export const NOTE_COLORS: NoteColor[] = ['yellow', 'pink', 'blue', 'green', 'purple'];

export type RegionColor = 'green' | 'blue' | 'purple';
export const REGION_COLORS: RegionColor[] = ['green', 'blue', 'purple'];

export interface View {
  x: number;
  y: number;
  scale: number;
}

export interface Board {
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  view?: View;
}

interface BaseItem {
  id: ID;
  boardId: ID;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  z?: number;
  createdAt: number;
  updatedAt: number;
}

export interface NoteItem extends BaseItem {
  type: 'note';
  text: string;
  color: NoteColor;
}

export interface RegionItem extends BaseItem {
  type: 'region';
  label: string;
  color: RegionColor;
}

export interface ImageItem extends BaseItem {
  type: 'image';
  blobId: ID;
  mime: string;
  naturalW: number;
  naturalH: number;
}

export interface LinkCardItem extends BaseItem {
  type: 'link';
  linkId: ID;
}

export type Item = NoteItem | RegionItem | ImageItem | LinkCardItem;
export type ItemType = Item['type'];

export interface Connector {
  id: ID;
  boardId: ID;
  from: ID;
  to: ID;
}

export interface Stroke {
  id: ID;
  boardId: ID;
  color: string;
  width: number;
  /** flattened [x0, y0, x1, y1, …] in world coordinates */
  points: number[];
}

export interface LinkRecord {
  id: ID;
  url: string;
  domain: string;
  title: string;
  note: string;
  tags: string[];
  savedAt: number;
  updatedAt: number;
  boardId: ID | null;
}

export interface StoredBlob {
  id: ID;
  mime: string;
  blob: Blob;
}

export interface Settings {
  theme: 'light' | 'dark';
  noteFont: 'hand' | 'sans';
  /** opacity of the board background image, 0..1 */
  bgDim: number;
  bgBlobId: ID | null;
  previewEnabled: boolean;
  lastBackupAt: number | null;
  onboarded: boolean;
}

export const defaultSettings = (): Settings => ({
  theme: 'light',
  noteFont: 'hand',
  bgDim: 0.82,
  bgBlobId: null,
  previewEnabled: false,
  lastBackupAt: null,
  onboarded: false,
});

export const NOTE_DEFAULT_SIZE = { w: 208, h: 208 };
export const REGION_DEFAULT_SIZE = { w: 340, h: 240 };

export function isItem(value: unknown): value is Item {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.boardId === 'string' &&
    typeof v.x === 'number' &&
    typeof v.y === 'number' &&
    typeof v.w === 'number' &&
    typeof v.h === 'number' &&
    (v.type === 'note' || v.type === 'region' || v.type === 'image' || v.type === 'link')
  );
}
