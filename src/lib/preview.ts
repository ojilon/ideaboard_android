/**
 * Optional link previews. OFF by default.
 *
 * A static PWA cannot scrape pages (CORS), so the only honest option is asking a
 * public oEmbed proxy. When this runs, the URL is sent to that third party — the
 * UI says so. Failures return null and the card just stays as it is.
 */

export type Preview = {
  title: string;
  author: string;
  thumbnail: string;
  provider: string;
};

export const PREVIEW_ENDPOINT = 'https://noembed.com/embed';

export async function fetchPreview(url: string, timeoutMs = 6000): Promise<Preview | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${PREVIEW_ENDPOINT}?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    if (!data || data.error) return null;
    const title = typeof data.title === 'string' ? data.title : '';
    if (!title) return null;
    return {
      title,
      author: typeof data.author_name === 'string' ? data.author_name : '',
      thumbnail: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : '',
      provider: typeof data.provider_name === 'string' ? data.provider_name : '',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
