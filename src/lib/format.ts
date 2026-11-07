/**
 * Export-file shape and validation. No runtime imports, so it can be unit
 * tested in plain Node (tests/logic.test.ts) and reused by the PC app.
 */
import type { Board, Connector, Item, LinkRecord, Settings, Stroke } from './model';

export const FORMAT = 'ideaboard';
export const FORMAT_VERSION = 1;

export interface BlobExport {
  id: string;
  mime: string;
  dataBase64: string;
}

export interface BoardFile {
  format: 'ideaboard';
  version: number;
  exportedAt: string;
  app: string;
  boards: Board[];
  items: Item[];
  connectors: Connector[];
  strokes: Stroke[];
  links: LinkRecord[];
  blobs: BlobExport[];
  settings: Settings;
}

/** Throws a message meant for the user when a file cannot be imported. */
export function parseBoardFile(text: string): BoardFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('That file is not an Ideaboard backup.');
  const file = parsed as Partial<BoardFile>;
  if (file.format !== FORMAT) {
    throw new Error('That file is not an Ideaboard backup (missing "format": "ideaboard").');
  }
  if (typeof file.version !== 'number') throw new Error('That backup has no version number.');
  if (file.version > FORMAT_VERSION) {
    throw new Error(
      `That backup is version ${file.version}; this app understands up to ${FORMAT_VERSION}. Update the app first.`,
    );
  }
  const boards = Array.isArray(file.boards) ? file.boards : [];
  if (!boards.length) throw new Error('That backup contains no boards.');
  return file as BoardFile;
}
