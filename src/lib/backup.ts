import { describeError } from './db';
import { isItem, type LinkRecord, type Settings, type StoredBlob } from './model';
import { normalizeUrl, domainOf, parseTags } from './parse';
import { store } from './store';

import { FORMAT, FORMAT_VERSION, type BlobExport, type BoardFile } from './format';

export { FORMAT, FORMAT_VERSION, parseBoardFile } from './format';
export type { BlobExport, BoardFile } from './format';

export interface ImportSummary {
  boards: number;
  items: number;
  links: number;
  images: number;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image data'));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function buildExportFile(): Promise<BoardFile> {
  const blobs: BlobExport[] = [];
  for (const record of store.blobs.values()) {
    blobs.push({
      id: record.id,
      mime: record.mime,
      dataBase64: await blobToBase64(record.blob),
    });
  }
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'Ideaboard (Android)',
    boards: [...store.boards.values()],
    items: [...store.items.values()],
    connectors: [...store.connectors.values()],
    strokes: [...store.strokes.values()],
    links: [...store.links.values()],
    blobs,
    settings: store.settings,
  };
}

export function downloadJson(data: BoardFile): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ideaboard-${stamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Build + download, then mark the library as backed up. */
export async function backUpNow(): Promise<void> {
  await store.saveNow();
  downloadJson(await buildExportFile());
  store.markBackedUp();
}

export async function importBoardFile(file: BoardFile): Promise<ImportSummary> {
  const boardIds = new Set(file.boards.map((b) => b.id));
  const items = (Array.isArray(file.items) ? file.items : [])
    .filter(isItem)
    .filter((item) => boardIds.has(item.boardId))
    .map((item) => ({ ...item, rot: item.rot ?? 0, z: item.z ?? 0 }));

  const connectors = (Array.isArray(file.connectors) ? file.connectors : []).filter(
    (c) => boardIds.has(c.boardId),
  );
  const strokes = (Array.isArray(file.strokes) ? file.strokes : []).filter((s) => boardIds.has(s.boardId));

  const links = (Array.isArray(file.links) ? file.links : []).map((link, index) => {
    const url = normalizeUrl(link.url) ?? '';
    return {
      id: link.id ?? `imported-link-${index}`,
      url,
      domain: link.domain || domainOf(url),
      title: link.title ?? '',
      note: link.note ?? '',
      tags: parseTags((link.tags ?? []).join(',')),
      savedAt: link.savedAt ?? Date.now(),
      updatedAt: link.updatedAt ?? Date.now(),
      boardId: link.boardId && boardIds.has(link.boardId) ? link.boardId : null,
    } satisfies LinkRecord;
  });

  const blobs: StoredBlob[] = (Array.isArray(file.blobs) ? file.blobs : [])
    .filter((b) => b && typeof b.dataBase64 === 'string' && typeof b.mime === 'string')
    .map((b) => ({
      id: b.id,
      mime: b.mime,
      blob: base64ToBlob(b.dataBase64, b.mime),
    }));

  const settings: Partial<Settings> = file.settings
    ? {
        theme: file.settings.theme === 'dark' ? 'dark' : 'light',
        noteFont: file.settings.noteFont === 'sans' ? 'sans' : 'hand',
        bgDim: typeof file.settings.bgDim === 'number' ? file.settings.bgDim : 0.82,
        bgBlobId: file.settings.bgBlobId ?? null,
        previewEnabled: Boolean(file.settings.previewEnabled),
      }
    : {};

  await store.replaceAll({
    boards: file.boards.map((board) => ({
      ...board,
      name: board.name || 'Untitled board',
      createdAt: board.createdAt ?? Date.now(),
      updatedAt: board.updatedAt ?? Date.now(),
    })),
    items,
    connectors,
    strokes,
    links,
    blobs,
    settings,
  });

  return { boards: file.boards.length, items: items.length, links: links.length, images: blobs.length };
}

export async function readFile(file: File): Promise<string> {
  try {
    return await file.text();
  } catch (error) {
    throw new Error(describeError(error));
  }
}
