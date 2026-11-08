/**
 * Pure helpers (no DOM, no IndexedDB) — covered by tests/logic.test.ts.
 */

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const BARE_DOMAIN = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i;

/** Normalise anything a share sheet or a paste can hand us into an http(s) URL. */
export function normalizeUrl(raw: string): string | null {
  let value = (raw ?? '').trim();
  if (!value) return null;
  value = value.replace(/^[<("'\s]+|[>)"'\s.,;]+$/g, '');
  if (!SCHEME.test(value)) {
    if (!BARE_DOMAIN.test(value)) return null;
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** First URL appearing anywhere in a shared blob of text. */
export function extractUrl(...candidates: (string | undefined | null)[]): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = candidate.match(/https?:\/\/[^\s<>"']+/i);
    if (match) {
      const normalized = normalizeUrl(match[0]);
      if (normalized) return normalized;
    }
    const bare = candidate.match(/(?:^|\s)((?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/i);
    if (bare) {
      const normalized = normalizeUrl(bare[1]);
      if (normalized) return normalized;
    }
  }
  return null;
}

/** Everything except the URL, trimmed — becomes the link's note. */
export function textWithoutUrl(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/https?:\/\/[^\s<>"']+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

/** "A guide to slow walks" from a URL slug — a starting point, not a promise. */
export function guessTitle(url: string): string {
  try {
    const { pathname } = new URL(url);
    const slug = pathname.split('/').filter(Boolean).pop() ?? '';
    const cleaned = decodeURIComponent(slug)
      .replace(/\.(html?|php|aspx?)$/i, '')
      .replace(/[-_+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || /^\d+$/.test(cleaned) || cleaned.length < 3) return '';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  } catch {
    return '';
  }
}

/** One URL per line; ignores blanks, de-duplicates, keeps order. */
export function parseBulkLinks(text: string): { url: string; domain: string }[] {
  const seen = new Set<string>();
  const out: { url: string; domain: string }[] = [];
  for (const line of (text ?? '').split(/\r?\n/)) {
    const url = normalizeUrl(line);
    if (!url) continue;
    const key = url.replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url, domain: domainOf(url) });
  }
  return out;
}

export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (input ?? '').split(',')) {
    const tag = raw.trim().replace(/^#/, '').slice(0, 32);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, 12);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** "Edited 2 days ago", "Edited just now". */
export function relativeTime(timestamp: number, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) {
    const m = Math.floor(diff / minute);
    return `${m} min ago`;
  }
  if (diff < day) {
    const h = Math.floor(diff / hour);
    return h === 1 ? '1 hour ago' : `${h} hours ago`;
  }
  if (diff < 7 * day) {
    const d = Math.floor(diff / day);
    return d === 1 ? '1 day ago' : `${d} days ago`;
  }
  if (diff < 28 * day) {
    const w = Math.floor(diff / (7 * day));
    return w === 1 ? '1 week ago' : `${w} weeks ago`;
  }
  return formatDate(timestamp);
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateLong(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Strip a few control characters that break note layout. */
export function cleanNoteText(text: string): string {
  return (text ?? '').replace(/\r\n/g, '\n').slice(0, 2000);
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}
